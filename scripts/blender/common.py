"""Shared helpers for the MathHero model scripts (ADR 0007).

Every model script builds its model from nothing with these helpers, so a
re-bake from an unchanged script gives the same model. Rules:

- No randomness without a fixed seed; no reads of the clock.
- Blender is Z-up; the glTF export turns it Y-up. The hero stands on the
  left and faces +X; the Training Dummy faces the hero, toward -X.
- The painted look is baked into one albedo texture per model (Cycles,
  emission pass): base color, soft top light, crevice shade, and bright
  painted edges. The runtime adds the soft light ramp and the rim light.
- The ink outline is an inverted hull (Solidify, flipped normals) with the
  material named "Ink"; the runtime gives it the shared ink color.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

INK = "Ink"
PAINTED = "Painted"


# ---------------------------------------------------------------- scene


def reset_scene():
    """Start from an empty scene with fixed render settings."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    # Actions and armatures too: the bake builds several models in one
    # session, and a leftover "Idle" would rename the next one "Idle.001".
    for collection in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.curves,
        bpy.data.actions,
        bpy.data.armatures,
    ):
        for block in list(collection):
            collection.remove(block)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    scene.cycles.seed = 7
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 8
    scene.unit_settings.scale_length = 1.0


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _from_bmesh(name, bm, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        mesh.shade_smooth()
    return _link(bpy.data.objects.new(name, mesh))


# ---------------------------------------------------------------- shapes


def cylinder(name, radius, depth, z, segments=32, x=0.0, y=0.0, bevel=0.0, radius_top=None):
    """An upright cylinder (or cone frustum) standing on z."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=segments,
        radius1=radius,
        radius2=radius if radius_top is None else radius_top,
        depth=depth,
    )
    bmesh.ops.translate(bm, verts=bm.verts, vec=(x, y, z + depth / 2))
    obj = _from_bmesh(name, bm)
    if bevel > 0:
        add_bevel(obj, bevel)
    return obj


def _uv_sphere(bm, radius, segments, rings, stretch=0.0):
    """A UV sphere in a fixed vertex and face order.

    bmesh.ops.create_uvsphere merges its poles in an order that changes from
    run to run, which breaks a byte-stable bake. stretch pulls the two
    halves apart along Z by that distance (a capsule).
    """
    top = bm.verts.new((0.0, 0.0, radius + stretch / 2))
    bottom = bm.verts.new((0.0, 0.0, -radius - stretch / 2))
    grid = []
    for r in range(1, rings):
        phi = math.pi * r / rings
        z = radius * math.cos(phi)
        z += stretch / 2 if z >= 0 else -stretch / 2
        ring = []
        for s in range(segments):
            theta = 2 * math.pi * s / segments
            ring.append(bm.verts.new((radius * math.sin(phi) * math.cos(theta), radius * math.sin(phi) * math.sin(theta), z)))
        grid.append(ring)
    for s in range(segments):
        t = (s + 1) % segments
        bm.faces.new((top, grid[0][s], grid[0][t]))
        for r in range(len(grid) - 1):
            bm.faces.new((grid[r][s], grid[r + 1][s], grid[r + 1][t], grid[r][t]))
        bm.faces.new((grid[-1][s], bottom, grid[-1][t]))


def sphere(name, radius, location, scale=(1.0, 1.0, 1.0), segments=32, rings=16):
    bm = bmesh.new()
    _uv_sphere(bm, radius, segments, rings)
    bmesh.ops.scale(bm, verts=bm.verts, vec=scale)
    bmesh.ops.translate(bm, verts=bm.verts, vec=location)
    return _from_bmesh(name, bm)


def torus(name, major, minor, location, rotation=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0), segments=40, sides=12):
    """A ring built from circles swept around Z, then placed."""
    bm = bmesh.new()
    rings = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        ring = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            r = major + minor * math.cos(b)
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
        rings.append(ring)
    for i in range(segments):
        a, b = rings[i], rings[(i + 1) % segments]
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((a[j], b[j], b[k], a[k]))
    bmesh.ops.scale(bm, verts=bm.verts, vec=scale)
    obj = _from_bmesh(name, bm)
    obj.location = location
    obj.rotation_euler = rotation
    apply_transform(obj)
    return obj


def rounded_box(name, size, location, bevel, rotation=(0.0, 0.0, 0.0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=size)
    obj = _from_bmesh(name, bm, smooth=False)
    obj.location = location
    obj.rotation_euler = rotation
    apply_transform(obj)
    add_bevel(obj, bevel, segments=3)
    obj.data.shade_smooth()
    return obj


def capsule(name, radius, start, end, segments=24):
    """A capsule from start to end (world points)."""
    a, b = Vector(start), Vector(end)
    axis = b - a
    bm = bmesh.new()
    _uv_sphere(bm, radius, segments, segments // 2, stretch=axis.length)
    obj = _from_bmesh(name, bm)
    obj.location = (a + b) / 2
    obj.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()
    apply_transform(obj)
    return obj


def helix(name, radius, wire, turns, height, z, segments_per_turn=32, sides=10):
    """A coil spring: a tube swept along a helix standing on z."""
    bm = bmesh.new()
    steps = int(turns * segments_per_turn)
    rings = []
    for i in range(steps + 1):
        t = i / steps
        a = 2 * math.pi * turns * t
        cx, cy, cz = radius * math.cos(a), radius * math.sin(a), z + height * t
        # Tube cross-section in the plane of the radius and the helix axis.
        rx, ry = math.cos(a), math.sin(a)
        ring = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            ring.append(
                bm.verts.new(
                    (cx + wire * math.cos(b) * rx, cy + wire * math.cos(b) * ry, cz + wire * math.sin(b))
                )
            )
        rings.append(ring)
    for i in range(steps):
        a, b = rings[i], rings[i + 1]
        for j in range(sides):
            k = (j + 1) % sides
            bm.faces.new((a[j], b[j], b[k], a[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return _from_bmesh(name, bm)


def wedge(name, r0, r1, a0, a1, z, depth, bevel, steps=6):
    """A carved tile: the ring sector r0..r1 between angles a0..a1, standing
    on z with the given depth, its edges beveled like cut stone."""
    bm = bmesh.new()
    top, bottom = [], []
    arc = [a0 + (a1 - a0) * i / steps for i in range(steps + 1)]
    outline = [(r1 * math.cos(a), r1 * math.sin(a)) for a in arc]
    outline += [(r0 * math.cos(a), r0 * math.sin(a)) for a in reversed(arc)] if r0 > 0 else [(0.0, 0.0)]
    for x, y in outline:
        bottom.append(bm.verts.new((x, y, z)))
        top.append(bm.verts.new((x, y, z + depth)))
    n = len(outline)
    bm.faces.new(top)
    bm.faces.new(list(reversed(bottom)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    obj = _from_bmesh(name, bm, smooth=False)
    add_bevel(obj, bevel, segments=2)
    obj.data.shade_smooth()
    return obj


def _hash3(x, y, z, seed):
    h = math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453
    return h - math.floor(h)


def _value_noise(p, seed):
    """Smooth value noise in 3D from a fixed hash: the same input, the same
    output, on every machine and every run."""
    xi, yi, zi = math.floor(p[0]), math.floor(p[1]), math.floor(p[2])
    fx, fy, fz = p[0] - xi, p[1] - yi, p[2] - zi
    sx, sy, sz = (f * f * (3 - 2 * f) for f in (fx, fy, fz))
    total = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (sx if dx else 1 - sx) * (sy if dy else 1 - sy) * (sz if dz else 1 - sz)
                total += w * _hash3(xi + dx, yi + dy, zi + dz, seed)
    return total


def roughen(obj, amount, scale, seed):
    """Push every vertex along its normal by fixed-seed noise: rough rock."""
    mesh = obj.data
    for v in mesh.vertices:
        p = v.co * scale
        n = _value_noise(p, seed) * 0.65 + _value_noise(p * 2.3, seed + 1) * 0.35
        v.co += v.normal * (n - 0.5) * 2 * amount
    mesh.update()


def rock(name, radius, height, location, seed, sides=7, rings=5, rough=0.12, taper=0.25):
    """A rock spire or shard: a tapered, faceted cone, roughened."""
    bm = bmesh.new()
    grid = []
    for r in range(rings + 1):
        t = r / rings
        ring_radius = radius * (1 - t * (1 - taper))
        ring = []
        for s in range(sides):
            a = 2 * math.pi * (s + 0.37 * r) / sides
            ring.append(bm.verts.new((ring_radius * math.cos(a), ring_radius * math.sin(a), height * t)))
        grid.append(ring)
    tip = bm.verts.new((0.0, 0.0, height * (1 + taper * 0.4)))
    for r in range(rings):
        for s in range(sides):
            k = (s + 1) % sides
            bm.faces.new((grid[r][s], grid[r][k], grid[r + 1][k], grid[r + 1][s]))
    for s in range(sides):
        bm.faces.new((grid[-1][s], grid[-1][(s + 1) % sides], tip))
    bm.faces.new(list(reversed(grid[0])))
    obj = _from_bmesh(name, bm, smooth=False)
    roughen(obj, rough * radius, 2.2 / radius, seed)
    obj.location = location
    apply_transform(obj)
    return obj


def split_group(obj, group, name, center=True):
    """Move the faces of one vertex group into a new object of their own,
    with its origin at their center. Same UVs, same material, same image."""
    index = obj.vertex_groups[group].index
    keep = bmesh.new()
    keep.from_mesh(obj.data)
    deform = keep.verts.layers.deform.verify()
    in_group = [f for f in keep.faces if all(index in v[deform] for v in f.verts)]
    part = bmesh.new()
    part.from_mesh(obj.data)
    part_deform = part.verts.layers.deform.verify()
    bmesh.ops.delete(
        part, geom=[f for f in part.faces if not all(index in v[part_deform] for v in f.verts)], context="FACES"
    )
    bmesh.ops.delete(keep, geom=in_group, context="FACES")
    middle = Vector((0.0, 0.0, 0.0))
    if center:
        for v in part.verts:
            middle += v.co
        middle /= max(1, len(part.verts))
        bmesh.ops.translate(part, verts=part.verts, vec=-middle)
    keep.to_mesh(obj.data)
    keep.free()
    mesh = bpy.data.meshes.new(name)
    part.to_mesh(mesh)
    part.free()
    for mat in obj.data.materials:
        mesh.materials.append(mat)
    piece = _link(bpy.data.objects.new(name, mesh))
    piece.location = middle
    # Same group names in the same order: the mesh's deform weights still
    # point at the right bones.
    for vg in obj.vertex_groups:
        piece.vertex_groups.new(name=vg.name)
    return piece


# ---------------------------------------------------------------- modifiers


def scale_about(obj, scale, center):
    """Scale the mesh by (x, y, z) around a world point."""
    c = Matrix.Translation(Vector(center))
    s = Matrix.Diagonal((*scale, 1.0))
    obj.data.transform(c @ s @ c.inverted())
    return obj


def remove(obj):
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def apply_transform(obj):
    mesh = obj.data
    mesh.transform(obj.matrix_basis)
    obj.matrix_basis.identity()


def _apply_modifiers(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated)
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    bpy.data.meshes.remove(old)


def add_bevel(obj, width, segments=2):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40)
    _apply_modifiers(obj)


def subdivide(obj, levels=1):
    mod = obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    _apply_modifiers(obj)


# ---------------------------------------------------------------- paint


def paint_material(name, color, *, grain=0.12, edge=0.18, crevice=0.45, top=0.22, stroke_scale=6.0):
    """A bake-only material: the painted albedo as an emission shader.

    color:   the base color (linear RGB).
    grain:   strength of the soft brush-stroke value noise.
    edge:    how much the convex edges lighten (painted highlight).
    crevice: how much the ambient occlusion darkens the folds.
    top:     how much the up-facing surfaces lighten (painted sky light).
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    n = nt.nodes
    link = nt.links.new

    out = n.new("ShaderNodeOutputMaterial")
    emit = n.new("ShaderNodeEmission")
    link(emit.outputs["Emission"], out.inputs["Surface"])

    base = n.new("ShaderNodeRGB")
    base.outputs[0].default_value = (*color, 1.0)

    # Brush strokes: stretched noise, a soft value wobble around 1.0.
    coord = n.new("ShaderNodeTexCoord")
    mapping = n.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 3.0)
    link(coord.outputs["Object"], mapping.inputs["Vector"])
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = stroke_scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.45
    link(mapping.outputs["Vector"], noise.inputs["Vector"])
    stroke = n.new("ShaderNodeMapRange")
    stroke.inputs["To Min"].default_value = 1.0 - grain
    stroke.inputs["To Max"].default_value = 1.0 + grain
    link(noise.outputs["Fac"], stroke.inputs["Value"])

    # Soft top light: up-facing normals lighten.
    geometry = n.new("ShaderNodeNewGeometry")
    sep = n.new("ShaderNodeSeparateXYZ")
    link(geometry.outputs["Normal"], sep.inputs["Vector"])
    toplight = n.new("ShaderNodeMapRange")
    toplight.inputs["From Min"].default_value = -1.0
    toplight.inputs["From Max"].default_value = 1.0
    toplight.inputs["To Min"].default_value = 1.0 - top
    toplight.inputs["To Max"].default_value = 1.0 + top
    link(sep.outputs["Z"], toplight.inputs["Value"])

    # Crevice shade: ambient occlusion darkens the folds and joints.
    ao = n.new("ShaderNodeAmbientOcclusion")
    ao.samples = 16
    ao.inputs["Distance"].default_value = 0.35
    shade = n.new("ShaderNodeMapRange")
    shade.inputs["To Min"].default_value = 1.0 - crevice
    shade.inputs["To Max"].default_value = 1.0
    link(ao.outputs["AO"], shade.inputs["Value"])

    # Painted edge light: convex edges (pointiness) lighten.
    edges = n.new("ShaderNodeMapRange")
    edges.inputs["From Min"].default_value = 0.5
    edges.inputs["From Max"].default_value = 0.62
    edges.inputs["To Min"].default_value = 1.0
    edges.inputs["To Max"].default_value = 1.0 + edge
    link(geometry.outputs["Pointiness"], edges.inputs["Value"])

    value = base.outputs[0]
    for factor in (stroke.outputs["Result"], toplight.outputs["Result"], shade.outputs["Result"], edges.outputs["Result"]):
        mul = n.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        link(value, mul.inputs["A"])
        combine = n.new("ShaderNodeCombineXYZ")
        for axis in ("X", "Y", "Z"):
            link(factor, combine.inputs[axis])
        link(combine.outputs["Vector"], mul.inputs["B"])
        value = mul.outputs["Result"]
    link(value, emit.inputs["Color"])
    return mat


def assign(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def join(name, objects):
    """Join the parts into one mesh object, in the given order.

    Built with bmesh, not the join operator: the operator's face order can
    change from run to run, and a changed face order changes the UVs, the
    bake, and the .glb bytes.
    """
    bm = bmesh.new()
    materials = []
    groups = {}  # bone name -> vertex indices, in script order
    for obj in objects:
        start = len(bm.faces)
        first_vert = len(bm.verts)
        bm.from_mesh(obj.data)
        # "bone" skins the part; "part" marks which object it splits into.
        for key in ("bone", "part"):
            if key in obj:
                groups.setdefault(obj[key], []).extend(range(first_vert, len(bm.verts)))
        bm.faces.ensure_lookup_table()
        slot_map = []
        for mat in obj.data.materials:
            if mat not in materials:
                materials.append(mat)
            slot_map.append(materials.index(mat))
        for face in bm.faces[start:]:
            face.material_index = slot_map[face.material_index] if slot_map else 0
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    for obj in objects:
        old = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if old.users == 0:
            bpy.data.meshes.remove(old)
    joined = _link(bpy.data.objects.new(name, mesh))
    # Rigid skinning: each part follows exactly one bone.
    for bone, indices in groups.items():
        joined.vertex_groups.new(name=bone).add(indices, 1.0, "REPLACE")
    return joined


def bake_painted(obj, size=1024, regions=None):
    """Bake the parts' paint materials into one albedo, then wear it.

    After the bake, every face wears the single "Painted" material with the
    baked image as its base color — the only material the runtime reads.

    regions: {paint material name: region}. Faces of those materials wear
    "Painted<Region>" instead (same image), so the runtime can tint each
    region with a chosen color. Paint tintable regions near white: the bake
    then holds only their light and shade.
    """
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    # One UV island layout for the whole model, deterministic for a mesh.
    obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01, rotate_method="AXIS_ALIGNED_Y")
    bpy.ops.uv.pack_islands(margin=0.004, rotate=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    image = bpy.data.images.new(f"{obj.name}Painted", size, size, alpha=False)
    image.colorspace_settings.name = "sRGB"
    for mat in obj.data.materials:
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        mat.node_tree.nodes.active = node

    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)

    def wearing(name):
        painted = bpy.data.materials.new(name)
        painted.use_nodes = True
        bsdf = painted.node_tree.nodes["Principled BSDF"]
        tex = painted.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        painted.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 1.0
        return painted

    regions = regions or {}
    old = list(obj.data.materials)
    targets = [PAINTED] + sorted(set(regions.values()))
    slot = {name: i for i, name in enumerate(targets)}
    old_to_new = [slot[regions.get(mat.name, PAINTED)] for mat in old]
    # Read every face's new index before clearing: clearing the slots resets
    # the faces' indices to 0.
    new_index = [old_to_new[poly.material_index] for poly in obj.data.polygons]
    obj.data.materials.clear()
    for name in targets:
        obj.data.materials.append(wearing(name if name == PAINTED else PAINTED + name))
    for poly, index in zip(obj.data.polygons, new_index):
        poly.material_index = index
    for mat in old:
        bpy.data.materials.remove(mat)
    return image


def add_ink_hull(obj, thickness):
    """The inverted-hull outline: a flipped shell just outside the body."""
    ink = bpy.data.materials.get(INK)
    if ink is None:
        ink = bpy.data.materials.new(INK)
        # Single-sided: only the far wall of the flipped shell shows, as a line.
        ink.use_backface_culling = True
        ink.use_nodes = True
        bsdf = ink.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (0.006, 0.005, 0.012, 1.0)
        bsdf.inputs["Roughness"].default_value = 1.0
    obj.data.materials.append(ink)
    mod = obj.modifiers.new("Ink", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = 1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    # Plain offset: each vertex moves at most the thickness along its
    # normal. Even offset keeps corners thicker but explodes at very sharp
    # points (the arena's rock tips threw one vertex 2 km away).
    mod.use_even_offset = False
    mod.material_offset = len(obj.data.materials) - 1
    _apply_modifiers(obj)


# ---------------------------------------------------------------- rig and clips

FPS = 24


def add_rig(obj, bones, name=None, rotation="XYZ"):
    """Parent obj (one mesh or a list) to a new armature, skinned by the
    meshes' vertex groups.

    bones: (name, head, tail, parent) tuples, in world coordinates. A bone
    standing upright with zero roll has local axes X = world X, Y = up
    (along the bone), Z = world -Y: a negative Z rotation leans it toward
    +X. After the Y-up glTF export those are exactly three.js's X, Y, Z,
    and a rig of upright bones has identity rests: in three.js each bone
    behaves like a plain joint (the hero's rig uses this).

    rotation: the pose rotation mode, "XYZ" or "QUATERNION".
    """
    meshes = obj if isinstance(obj, list) else [obj]
    name = name or f"{meshes[0].name}Rig"
    data = bpy.data.armatures.new(name)
    rig = _link(bpy.data.objects.new(name, data))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in bones:
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.roll = 0.0
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for mesh in meshes:
        mesh.parent = rig
        mod = mesh.modifiers.new("Rig", "ARMATURE")
        mod.object = rig
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = rotation
    bpy.context.scene.render.fps = FPS
    return rig


def add_clip(rig, name, length, keys):
    """Author one clip as its own action.

    length: the last frame (the clip runs 0..length at FPS).
    keys: {bone: [(frame, {"loc": ..., "rot": ..., "scale": ...}), ...]}.
    Every bone gets keys at frame 0 and at length (rest unless given), so a
    clip never leaves a bone posed by an earlier clip.
    """
    rest = {"loc": (0.0, 0.0, 0.0), "rot": (0.0, 0.0, 0.0), "scale": (1.0, 1.0, 1.0)}
    quat = rig.pose.bones[0].rotation_mode == "QUATERNION"
    rot_path = "rotation_quaternion" if quat else "rotation_euler"
    rig.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for pose_bone in rig.pose.bones:
        frames = dict(keys.get(pose_bone.name, []))
        frames.setdefault(0, {})
        frames.setdefault(length, {})
        for frame in sorted(frames):
            pose = {**rest, **frames[frame]}
            pose_bone.location = pose["loc"]
            if quat:
                pose_bone.rotation_quaternion = three_rotation(*pose["rot"])
            else:
                pose_bone.rotation_euler = pose["rot"]
            pose_bone.scale = pose["scale"]
            for path in ("location", rot_path, "scale"):
                pose_bone.keyframe_insert(path, frame=frame)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    track.mute = True
    rig.animation_data.action = None
    for pose_bone in rig.pose.bones:
        pose_bone.location = rest["loc"]
        pose_bone.rotation_euler = rest["rot"]
        pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose_bone.scale = rest["scale"]


def three_rotation(x, y, z):
    """A three.js Euler (order XYZ) as the pose quaternion of an upright
    bone. Its local axes are three's X, Y, Z (see add_rig), and three
    applies the matrix Rx·Ry·Rz."""
    rx = Matrix.Rotation(x, 4, "X")
    ry = Matrix.Rotation(y, 4, "Y")
    rz = Matrix.Rotation(z, 4, "Z")
    return (rx @ ry @ rz).to_quaternion()


def three_world_rotation(x, y, z):
    """A three.js Euler (order XYZ, in three's Y-up world) as a Blender
    world-space rotation matrix, for placing a mesh: three's X, Y, Z are
    Blender's X, Z, -Y."""
    rx = Matrix.Rotation(x, 4, "X")
    ry = Matrix.Rotation(y, 4, "Z")
    rz = Matrix.Rotation(-z, 4, "Y")
    return rx @ ry @ rz


def hair_cone(name, head_pivot, x, y, z, tilt_x, tilt_z, radius=0.14, height=0.55, segments=6):
    """A hair spike like three's ConeGeometry (centered, tip up), turned by
    three's Euler (tilt_x, 0, tilt_z), at (x, y, z) from the head pivot."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=0.0, depth=height)
    obj = _from_bmesh(name, bm, smooth=False)
    px, py, pz = head_pivot
    place = Matrix.Translation(Vector(three_point(px + x, py + y, pz + z))) @ three_world_rotation(tilt_x, 0.0, tilt_z)
    obj.data.transform(place)
    return obj


def three_point(x, y, z):
    """A point in three.js hero space (Y up, facing +Z) in Blender space."""
    return (x, -z, y)


# ---------------------------------------------------------------- export


def export_glb(obj, path):
    """Export obj and its children (a rig exports with its skinned mesh)."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    for child in obj.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = obj
    animated = obj.animation_data is not None
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=90,
        export_animations=animated,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=1,
        export_def_bones=True,
        export_optimize_animation_size=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
