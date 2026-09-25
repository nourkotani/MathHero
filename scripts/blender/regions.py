"""Tint regions from a Tripo body's texture (ADR 0012).

Tripo has no export for tint masks. The body prompt fixes a flat palette
instead: light peach skin, a pure white suit, and bright cyan panels and
trim. This module sorts each face into one of the game's tint regions by
the hue of its texture, so the runtime can tint the skin tone and the two
outfit colors as it tints the scripted hero:

  Skin    peach: hue up to 55 degrees (or from 330), saturated
  Outfit  white or gray: hardly saturated
  Trim    cyan: hue 150 to 250 degrees, well saturated

A face that fits no rule (a dark seam, a stray purple) takes the region
that most of its neighbours have. Every step is numpy over the whole mesh:
a candidate has about 780k faces.
"""

import bpy
import numpy as np

REGIONS = ("Skin", "Outfit", "Trim")
SKIN, OUTFIT, TRIM = range(3)
UNKNOWN = -1

# Samples per face: the centroid and a point halfway to each corner.
INNER = 0.5
# Outfit: saturation below this. Trim: saturation above TRIM_SAT.
GRAY_SAT = 0.2
TRIM_SAT = 0.35
# Too dark to read a hue (seams, deep shade).
DARK = 0.12
SMOOTHING_PASSES = 2


def _base_color_image(mesh):
    for mat in mesh.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf and bsdf.inputs["Base Color"].links:
            node = bsdf.inputs["Base Color"].links[0].from_node
            if node.type == "TEX_IMAGE" and node.image:
                return node.image
    raise ValueError(f"{mesh.name}: no base-color texture")


def _pixels(image):
    width, height = image.size
    px = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    return px.reshape(height, width, 4)[:, :, :3]


def _triangle_uvs(mesh):
    data = mesh.data
    count = len(data.polygons)
    totals = np.empty(count, dtype=np.int32)
    data.polygons.foreach_get("loop_total", totals)
    if not (totals == 3).all():
        raise ValueError(f"{mesh.name}: triangulate first")
    uv = np.empty(len(data.loops) * 2, dtype=np.float32)
    data.uv_layers.active.data.foreach_get("uv", uv)
    return uv.reshape(count, 3, 2)


def _hsv(rgb):
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


def _raw_labels(mesh, image):
    tri = _triangle_uvs(mesh)
    centre = tri.mean(axis=1, keepdims=True)
    points = np.concatenate([centre, centre + (tri - centre) * INNER], axis=1)  # (F, 4, 2)
    px = _pixels(image)
    height, width = px.shape[:2]
    x = np.clip((points[..., 0] % 1.0) * (width - 1), 0, width - 1).astype(np.int32)
    y = np.clip((points[..., 1] % 1.0) * (height - 1), 0, height - 1).astype(np.int32)
    rgb = px[y, x].mean(axis=1)  # (F, 3): the face's mean color
    hue, sat, val = _hsv(rgb)
    labels = np.full(len(rgb), UNKNOWN, dtype=np.int8)
    labels[sat < GRAY_SAT] = OUTFIT
    labels[(sat >= TRIM_SAT) & (hue >= 150) & (hue <= 250)] = TRIM
    labels[(sat >= GRAY_SAT) & ((hue <= 55) | (hue >= 330))] = SKIN
    labels[val < DARK] = UNKNOWN
    return labels


def _smooth(mesh, labels):
    """Each pass: every vertex votes with its faces' regions, then each face
    takes the region most of its three corners voted for."""
    data = mesh.data
    verts = np.empty(len(data.loops), dtype=np.int32)
    data.loops.foreach_get("vertex_index", verts)
    corners = verts.reshape(-1, 3)
    for _ in range(SMOOTHING_PASSES):
        votes = np.zeros((len(data.vertices), len(REGIONS)), dtype=np.int32)
        known = labels >= 0
        for i in range(3):
            np.add.at(votes, (corners[known, i], labels[known]), 1)
        face_votes = votes[corners].sum(axis=1)  # (F, 3 regions)
        has_votes = face_votes.sum(axis=1) > 0
        majority = face_votes.argmax(axis=1).astype(np.int8)
        # A face keeps its own region unless most of its neighbourhood differs.
        own = np.where(known, face_votes[np.arange(len(labels)), np.maximum(labels, 0)], 0)
        flip = has_votes & ((~known) | (own * 2 < face_votes.sum(axis=1)))
        labels = np.where(flip, majority, labels)
    return np.where(labels >= 0, labels, OUTFIT).astype(np.int8)


def classify(mesh):
    """The region index (SKIN, OUTFIT, TRIM) of every face of a triangle mesh."""
    return _smooth(mesh, _raw_labels(mesh, _base_color_image(mesh)))


def histogram(labels):
    """The share of the faces in each region, for the log."""
    counts = np.bincount(labels, minlength=len(REGIONS))
    return {name: round(float(n) / max(1, len(labels)), 3) for name, n in zip(REGIONS, counts)}


# The mean linear brightness of each region after normalize: the scripted
# hero's near-white paint (hero.py SKIN, OUTFIT, TRIM), so a tint looks the
# same on a Tripo body as on the scripted one.
PAINT = {SKIN: 0.86, OUTFIT: 0.82, TRIM: 0.86}
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def _to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def _texel_labels(rgb):
    """The region of each texel by the same hue rules as the faces;
    UNKNOWN for dark texels (seams and the empty space between islands)."""
    hue, sat, val = _hsv(rgb)
    labels = np.full(rgb.shape[:-1], OUTFIT, dtype=np.int8)
    labels[(sat >= TRIM_SAT) & (hue >= 150) & (hue <= 250)] = TRIM
    labels[(sat >= GRAY_SAT) & ((hue <= 55) | (hue >= 330))] = SKIN
    labels[val < DARK] = UNKNOWN
    return labels


def normalize(image):
    """Make the texture gray: keep its light and shade, drop its color.

    Each region's mean linear brightness becomes its PAINT value; the
    runtime tint then gives the color. The image stays sRGB-encoded (an
    8-bit texture from Tripo); dark texels keep the Outfit scale. Returns
    the region means before the change, for the log.
    """
    width, height = image.size
    px = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(height, width, 4)
    labels = _texel_labels(px[:, :, :3])
    luma = _to_linear(px[:, :, :3]) @ LUMA
    gray = np.empty_like(luma)
    means = {}
    for region, value in PAINT.items():
        inside = labels == region
        mean = float(luma[inside].mean()) if inside.any() else value
        means[REGIONS[region]] = round(mean, 3)
        scale = value / max(mean, 1e-4)
        target = inside | ((labels == UNKNOWN) & (region == OUTFIT))
        gray[target] = luma[target] * scale
    encoded = _to_srgb(np.clip(gray, 0.0, 1.0)).astype(np.float32)
    px[:, :, 0] = px[:, :, 1] = px[:, :, 2] = encoded
    image.pixels.foreach_set(px.ravel())
    image.update()
    return means


def show_false_color(mesh, labels):
    """One flat material per region, for the preview sheet's check by eye."""
    colors = {SKIN: (0.95, 0.35, 0.25, 1.0), OUTFIT: (0.8, 0.8, 0.8, 1.0), TRIM: (0.15, 0.35, 0.95, 1.0)}
    mesh.data.materials.clear()
    for index, name in enumerate(REGIONS):
        mat = bpy.data.materials.new(f"Region{name}")
        mat.diffuse_color = colors[index]
        mesh.data.materials.append(mat)
    mesh.data.polygons.foreach_set("material_index", labels.astype(np.int32))
    mesh.data.update()
