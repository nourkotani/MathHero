"""Tint masks from a complete Tripo character's painted texture (ADR 0013).

The hero keeps Tripo's paint, as the Rival does. So that the Player's skin
tone, outfit colors, and hair color still apply, the bake writes two mask
images in the texture's own space, each 0..1: the tints (R skin, G outfit,
B trim) and the marks (R hair, G iris). Both are opaque: a browser drops
the color of a pixel whose alpha is 0 when it uploads an image to WebGL,
so no mask rides in an alpha channel. The runtime recolors each masked
pixel and keeps its light and shade relative to the region's mean
(hero-rig.json "tint"); the rest of the paint (the face, the undersuit,
the dark seams) stays as painted.

The body prompt fixes a flat palette, so the sort is by hue: peach skin,
a pure white gi, bright cyan trim, a charcoal undersuit, black hair. The
rules give each pixel a raw label. Geometry settles the head: a pixel on
the scalp (the head's faces above the hairline) is hair when it is dark;
a pixel on the face is skin when it is peach, and a feature (an eye, a
brow, the mouth) otherwise. Dark paint off the scalp (the undersuit, a
wrap, a deep seam) stays as painted. A majority vote over each pixel's
neighbours takes the specks out, unknown pixels take the label around
them, and a short blur softens the edges: a wrong pixel at a border shifts
a little color, never a hard edge. The mask extends a few pixels past each
UV island, so the texture's own filtering never fades it at a seam.

Before the sort, the paint is repaired (repair). Tripo pads each UV
island with a dark fringe, and leaves dark patches where its views did
not reach: a triangle near a seam samples the fringe, a black crack in
the gi. Each island's border pixels and every dark pixel off the head
(the hair and the eyes are dark by design) take the color of the nearest
good paint, and the islands' colors extend PAD pixels into the gaps, so
no sample reads a gap or a fringe. The repaired paint is written back
into the body's image.

The eyes: the painted iris (a dark patch next to the white of an eye) is
the marks' green channel, so a Form can recolor it.

Every step is numpy over the image, after one Cycles bake of the per-face
flags (coverage, head, scalp) into the same UV space: Blender rasterizes
the faces, numpy never has to.
"""

import bmesh
import bpy
import numpy as np

CHANNELS = ("skin", "outfit", "trim", "hair")
SKIN, OUTFIT, TRIM, HAIR, FEATURE, OTHER = range(6)
LABELS = 6
UNKNOWN = -1

# The hero bodies' palette (boy-gi, girl-gi in sources/tripo/models.json).
HERO_PALETTE = {
    "skin_hue": (0.0, 50.0),
    "skin_sat": (0.12, 0.8),
    "skin_val": 0.2,
    "outfit_sat": 0.22,
    "outfit_val": 0.3,
    "trim_hue": (150.0, 250.0),
    "trim_sat": 0.3,
    "trim_val": 0.12,
    # Darker than this: hair on the scalp, a feature on the face, and the
    # undersuit (unmasked) elsewhere.
    "dark": 0.25,
}

# The repair: paint darker than CRACK off the head is a crack; an
# island's FRINGE outermost pixels are its dark padding; the islands'
# colors extend PAD pixels past their borders.
CRACK = 0.1
FRINGE = 3
PAD = 16
VOTE_RADIUS = 4
VOTE_PASSES = 3
VOTE_MAJORITY = 0.55
FEATURE_GROW = 1
SOFTEN = 1
EXTEND = 8
IRIS_REACH = 5
IRIS_VAL = 0.45
WHITE_VAL = 0.7
WHITE_SAT = 0.25


def pixels(image):
    width, height = image.size
    px = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    return px.reshape(height, width, 4)


def new_image(name, rgb, srgb=False):
    """An opaque image from an (H, W, 3) float array, kept in the file."""
    height, width = rgb.shape[:2]
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = rgb
    image = bpy.data.images.new(name, width, height, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
    image.pixels.foreach_set(np.ascontiguousarray(rgba).ravel())
    image.pack()
    return image


def save_webp(image, path):
    """Write an image as a lossless WebP (quality 100 is lossless in
    Blender), through the image's own save, not the render pipeline (which
    premultiplies and color-manages)."""
    settings = bpy.context.scene.render.image_settings
    quality = settings.quality
    settings.quality = 100
    image.file_format = "WEBP"
    image.save(filepath=path, quality=100)
    settings.quality = quality


def hsv(rgb):
    """Hue in degrees, saturation, value; rgb (..., 3) in 0..1."""
    hi = rgb.max(axis=-1)
    lo = rgb.min(axis=-1)
    span = hi - lo
    sat = np.where(hi > 0, span / np.maximum(hi, 1e-6), 0.0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    safe = np.maximum(span, 1e-6)
    hue = np.where(
        hi == r,
        ((g - b) / safe) % 6,
        np.where(hi == g, (b - r) / safe + 2, (r - g) / safe + 4),
    )
    return hue * 60.0, sat, hi


def in_hue(hue, span):
    lo, hi = span
    return (hue >= lo) & (hue <= hi) if lo <= hi else (hue >= lo) | (hue <= hi)


def box(a, radius):
    """Box blur of an (H, W) float array, edges clamped."""
    if radius <= 0:
        return a
    size = 2 * radius + 1
    padded = np.pad(a, radius, mode="edge")
    sums = np.cumsum(np.cumsum(padded, axis=0), axis=1)
    sums = np.pad(sums, ((1, 0), (1, 0)))
    total = sums[size:, size:] - sums[:-size, size:] - sums[size:, :-size] + sums[:-size, :-size]
    return total / (size * size)


def dilate(mask, radius):
    return box(mask.astype(np.float32), radius) > 0.0


def erode(mask, radius):
    return ~dilate(~mask, radius)


def fill_unknown(labels, count, known):
    """Unknown pixels take the label around them, outward from the known."""
    labels = labels.copy()
    todo = ~known
    radius = 1
    while todo.any() and radius <= 64:
        votes = np.stack([box(((labels == k) & ~todo).astype(np.float32), radius) for k in range(count)])
        has = votes.sum(axis=0) > 0
        take = todo & has
        labels[take] = votes.argmax(axis=0)[take]
        todo &= ~take
        radius *= 2
    return labels


def head_faces(mesh, head_bone):
    """Faces whose every vertex is weighted mostly to the head bone."""
    group = mesh.vertex_groups.get(head_bone)
    on_head = np.zeros(len(mesh.data.vertices), dtype=bool)
    if group is not None:
        index = group.index
        for v in mesh.data.vertices:
            for g in v.groups:
                if g.group == index and g.weight >= 0.5:
                    on_head[v.index] = True
                    break
    verts = np.empty(len(mesh.data.loops), dtype=np.int32)
    mesh.data.loops.foreach_get("vertex_index", verts)
    starts = np.empty(len(mesh.data.polygons), dtype=np.int32)
    totals = np.empty(len(mesh.data.polygons), dtype=np.int32)
    mesh.data.polygons.foreach_get("loop_start", starts)
    mesh.data.polygons.foreach_get("loop_total", totals)
    faces = np.ones(len(starts), dtype=bool)
    for i in range(totals.max()):
        has = i < totals
        faces[has] &= on_head[verts[starts[has] + i]]
    return faces


def face_flags(mesh, flags, size, keep=None):
    """Bake per-face flags (name: bool array over the faces) into the mesh's
    UV space. Returns {name: (H, W) bool array} and the coverage (where a
    face is). keep: the faces to bake (the others, an ink hull over the
    same UVs for one, are left out)."""
    scene = bpy.context.scene
    copy = mesh.copy()
    copy.data = mesh.data.copy()
    copy.name = f"{mesh.name}.flags"
    scene.collection.objects.link(copy)
    if keep is not None:
        bm = bmesh.new()
        bm.from_mesh(copy.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep[f.index]], context="FACES")
        bm.to_mesh(copy.data)
        bm.free()
        flags = {name: value[keep] for name, value in flags.items()}
    names = list(flags)
    assert len(names) <= 2, "two flags per bake; the blue channel is the coverage"
    colors = np.ones((len(copy.data.polygons), 4), dtype=np.float32)
    colors[:, :2] = 0.0
    for channel, name in enumerate(names):
        colors[flags[name], channel] = 1.0
    attribute = copy.data.attributes.new("flags", "FLOAT_COLOR", "FACE")
    attribute.data.foreach_set("color", colors.ravel())
    image = bpy.data.images.new(f"{mesh.name}.flags", size, size, alpha=True, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("Flags")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "flags"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    mat.node_tree.links.new(attr.outputs["Color"], emit.inputs["Color"])
    mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    nodes.active = tex
    copy.data.materials.clear()
    copy.data.materials.append(mat)
    for poly in copy.data.polygons:
        poly.material_index = 0
    engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    bpy.ops.object.select_all(action="DESELECT")
    copy.select_set(True)
    bpy.context.view_layer.objects.active = copy
    bpy.ops.object.bake(type="EMIT", margin=0, use_clear=True)
    scene.render.engine = engine
    px = pixels(image)
    bpy.data.objects.remove(copy, do_unlink=True)
    bpy.data.materials.remove(mat)
    bpy.data.images.remove(image)
    coverage = px[:, :, 2] > 0.5
    return {name: px[:, :, i] > 0.5 for i, name in enumerate(names)}, coverage


def scalp_faces(mesh, head, hairline):
    """The head's faces above the hairline. hairline(x, y, z arrays of the
    face centres) -> the hairline's height at each."""
    count = len(mesh.data.polygons)
    centres = np.empty(count * 3, dtype=np.float32)
    mesh.data.polygons.foreach_get("center", centres)
    centres = centres.reshape(-1, 3)
    line = hairline(centres[:, 0], centres[:, 1], centres[:, 2])
    return head & (centres[:, 2] > line)


def labels_of(rgb, palette, head, scalp):
    """The raw label of every pixel: the rules, then the head's geometry."""
    hue, sat, val = hsv(rgb)
    p = palette
    labels = np.full(rgb.shape[:2], UNKNOWN, dtype=np.int8)
    labels[(sat < p["outfit_sat"]) & (val > p["outfit_val"])] = OUTFIT
    labels[in_hue(hue, p["trim_hue"]) & (sat >= p["trim_sat"]) & (val > p["trim_val"])] = TRIM
    skin = in_hue(hue, p["skin_hue"]) & (sat >= p["skin_sat"][0]) & (sat <= p["skin_sat"][1]) & (val > p["skin_val"])
    labels[skin] = SKIN
    dark = val < p["dark"]
    labels[dark] = OTHER
    labels[scalp & dark] = HAIR
    face = head & ~scalp
    labels[face & ~skin] = FEATURE
    return labels


def iris_of(rgb, face):
    """The painted iris: dark pixels of the face next to an eye's white."""
    hue, sat, val = hsv(rgb)
    white = face & (val > WHITE_VAL) & (sat < WHITE_SAT)
    near_white = dilate(white, IRIS_REACH)
    iris = face & (val < IRIS_VAL) & near_white & ~white
    return dilate(iris, 1) & face & ~white


def repair(rgb, coverage, head):
    """The paint with no dark fringes, cracks, or gaps (see the module).
    Returns the repaired rgb and the coverage of good paint, extended."""
    _, _, val = hsv(rgb)
    good = erode(coverage, FRINGE) & ~(~head & (val < CRACK))
    fixed = np.empty_like(rgb)
    for channel in range(3):
        fixed[:, :, channel] = fill_outside(rgb[:, :, channel], good, FRINGE + PAD)
    print(f"REPAIR: {int((coverage & ~good).sum())} px of fringe and cracks repainted, {int((~coverage).sum())} px of gaps padded")
    return fixed, dilate(good, FRINGE + PAD)


def build(mesh, image, head_bone, hairline, palette=HERO_PALETTE, size=None, keep=None):
    """The tints (R skin, G outfit, B trim), the marks (R hair, G iris), and
    each channel's mean linear luminance, for a mesh with its painted
    base-color image, which is repaired in place (repair). The two mask
    arrays are (size, size, 3). keep: the faces that are the painted body
    (face_flags)."""
    size = size or image.size[0]
    if image.size[0] != size:
        image.scale(size, size)
    px = pixels(image)
    head = head_faces(mesh, head_bone)
    scalp = scalp_faces(mesh, head, hairline)
    flags, coverage = face_flags(mesh, {"head": head, "scalp": scalp}, size, keep=keep)
    rgb, coverage = repair(px[:, :, :3], coverage, flags["head"])
    px[:, :, :3] = rgb
    px[:, :, 3] = 1.0
    image.pixels.foreach_set(np.ascontiguousarray(px).ravel())
    image.pack()
    labels = labels_of(rgb, palette, flags["head"], flags["scalp"])
    known = (labels >= 0) & coverage
    labels = np.where(known, labels, 0).astype(np.int8)
    # Each pixel takes the label most of its neighbours have, counting
    # only the known ones; then the unknown take the label around them.
    # The vote runs a few times: a speck shrinks at every pass, a straight
    # border between two regions stays where it is.
    for _ in range(VOTE_PASSES):
        votes = np.stack([box(((labels == k) & known).astype(np.float32), VOTE_RADIUS) for k in range(LABELS)])
        total = votes.sum(axis=0)
        voted = votes.argmax(axis=0).astype(np.int8)
        flip = (total > 0) & (votes.max(axis=0) > VOTE_MAJORITY * total)
        labels = np.where(flip, voted, labels)
        known = known | flip
    labels = fill_unknown(labels, LABELS, known)
    # A feature keeps a margin of unrecolored paint around it.
    feature = dilate(labels == FEATURE, FEATURE_GROW)
    tints = np.zeros((size, size, 3), dtype=np.float32)
    marks = np.zeros((size, size, 3), dtype=np.float32)
    soft = {}
    for label, name in ((SKIN, "skin"), (OUTFIT, "outfit"), (TRIM, "trim"), (HAIR, "hair")):
        hard = ((labels == label) & ~feature).astype(np.float32)
        hard = fill_outside(hard, coverage, EXTEND)
        soft[name] = box(box(hard, SOFTEN), SOFTEN)
    tints[:, :, 0], tints[:, :, 1], tints[:, :, 2] = soft["skin"], soft["outfit"], soft["trim"]
    marks[:, :, 0] = soft["hair"]
    iris = iris_of(rgb, flags["head"] & ~flags["scalp"]).astype(np.float32)
    marks[:, :, 1] = fill_outside(iris, coverage, 2)
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    lum = linear @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    means = {}
    counts = {}
    for name in CHANNELS:
        inside = (soft[name] > 0.5) & coverage
        means[name] = float(lum[inside].mean()) if inside.any() else 1.0
        counts[name] = int(inside.sum())
    print(f"MASKS {mesh.name}: {counts}, iris {int(iris.sum())} px, means {{{', '.join(f'{k}: {v:.3f}' for k, v in means.items())}}}")
    return tints, marks, means


def fill_outside(values, coverage, radius):
    """Extend the values past the covered pixels, so a seam's filtering
    reads the island's own value, not the gap's zero."""
    out = values.copy()
    known = coverage.copy()
    for _ in range(radius):
        spread = box(np.where(known, out, 0.0), 1)
        weight = box(known.astype(np.float32), 1)
        grown = weight > 0
        take = ~known & grown
        out[take] = spread[take] / weight[take]
        known |= grown
    return out
