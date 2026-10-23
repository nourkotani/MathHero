"""The hero's garments, built from the body itself (ADR 0013).

The fighter gi is the body as Tripo painted it. The two other garments
are made on top of it from the body's own surface, so they fit by
construction and wear the body's own weights: nothing is fitted by eye,
and nothing pokes through.

- The battle armor: plates cut from the body's faces (the chest, the
  back, each shoulder, each forearm, each shin), each decimated to a few
  hundred faces, pushed out of the skin, and made solid with a rim; a
  belt with a buckle around the hips. The plates keep the weights of the
  faces they came from, so they move exactly as the skin under them.
- The cape: a sheet hung from the shoulders, hugging the back down to
  the hips and hanging straight below them, flaring a little, with a
  collar band along its top. Its rows are weighted by height to the
  chest, the spine, the waist, and the hips, so it leans with the torso
  and hangs rigid below.

Each piece wears the bake-only paint of its region (Outfit or Trim), near
white; hero.py bakes the paint into the pieces' atlas, and the runtime
tints it with the Player's outfit colors. Every number here is fixed.
"""

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import common as c

# A plate: the faces it is cut from (a rule over the body), the face
# count it is decimated to, how far out of the skin it sits, and how
# thick it is.
PLATE_LIFT = 0.018
PLATE_THICKNESS = 0.022
PLATES = {
    "Chest": (700, "Outfit"),
    "Back": (600, "Outfit"),
    "ShoulderR": (280, "Trim"),
    "ShoulderL": (280, "Trim"),
    "BracerR": (260, "Trim"),
    "BracerL": (260, "Trim"),
    "ShinR": (300, "Outfit"),
    "ShinL": (300, "Outfit"),
}
SHOULDER_REACH = 0.24
# The arms' clearance from the chest and back plates; the bracers' and the
# shins' reach around their bones (hero units).
ARM_CLEAR = 0.11
BRACER_RADIUS = 0.13
SHIN_RADIUS = 0.15
# A plate keeps every patch of at least this many faces.
MIN_PATCH = 8
# The cape's grid, its clearance from the back, its flare at the hem, and
# its thickness.
CAPE_COLUMNS = 13
CAPE_ROWS = 22
CAPE_CLEARANCE = 0.06
CAPE_FLARE = 1.35
CAPE_THICKNESS = 0.012
CAPE_BELOW_KNEE = 0.15
CAPE_CURVE = 0.1
COLLAR_ROWS = 2


def _weights(body, name):
    group = body.vertex_groups.get(name)
    out = np.zeros(len(body.data.vertices), dtype=np.float32)
    if group is None:
        return out
    index = group.index
    for v in body.data.vertices:
        for g in v.groups:
            if g.group == index:
                out[v.index] = g.weight
                break
    return out


def _coords(body):
    co = np.empty(len(body.data.vertices) * 3)
    body.data.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def _shell(body, keep, name, faces, lift, thickness, paint, rim_paint):
    """The body's faces whose every vertex is kept, as a plate: decimated,
    pushed out, and made solid. The vertex groups come along."""
    plate = body.copy()
    plate.data = body.data.copy()
    plate.name = plate.data.name = name
    bpy.context.scene.collection.objects.link(plate)
    for mod in list(plate.modifiers):
        plate.modifiers.remove(mod)
    bm = bmesh.new()
    bm.from_mesh(plate.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(keep[v.index] for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # Only the largest patch: a stray face elsewhere would be a floating chip.
    bm.verts.ensure_lookup_table()
    seen = set()
    patches = []
    for start in bm.faces:
        if start in seen:
            continue
        patch = [start]
        seen.add(start)
        stack = [start]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g)
                        patch.append(g)
                        stack.append(g)
        patches.append(patch)
    if not patches:
        raise ValueError(f"{name}: the rule keeps no face")
    patches.sort(key=len, reverse=True)
    small = [patch for patch in patches if len(patch) < MIN_PATCH]
    print(f"PLATE {name}: {sum(len(p) for p in patches) - sum(len(p) for p in small)} faces kept in {len(patches) - len(small)} patches ({len(small)} chips dropped)")
    bmesh.ops.delete(bm, geom=[f for patch in small for f in patch], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(plate.data)
    bm.free()
    plate.data.materials.clear()
    plate.data.materials.append(paint)
    plate.data.materials.append(rim_paint)
    bpy.context.view_layer.objects.active = plate
    if len(plate.data.polygons) > faces:
        decimate = plate.modifiers.new("Decimate", "DECIMATE")
        decimate.ratio = faces / len(plate.data.polygons)
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    c.drop_loose(plate)
    bm = bmesh.new()
    bm.from_mesh(plate.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * lift
    bm.to_mesh(plate.data)
    bm.free()
    solid = plate.modifiers.new("Solid", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 1.0
    solid.use_rim = True
    # Plain offset: even offset explodes at the sharp points a decimation
    # leaves (common.add_ink_hull).
    solid.use_even_offset = False
    solid.material_offset_rim = 1
    bpy.ops.object.modifier_apply(modifier=solid.name)
    plate.data.shade_smooth()
    return plate


def _near_bone(co, rig, name, radius):
    """The vertices within radius of a bone's segment."""
    bone = rig.data.bones[name]
    head, tail = np.array(bone.head_local), np.array(bone.tail_local)
    axis = tail - head
    length = float(axis @ axis)
    t = np.clip(((co - head) @ axis) / max(length, 1e-9), 0.0, 1.0)
    nearest = head + t[:, None] * axis
    return np.linalg.norm(co - nearest, axis=1) < radius


def _plate_rules(body, prefix, rig, marks):
    """Which vertices each plate is cut from: by place and by distance to
    a bone, never by weight (a sparse mesh's weights cut a plate into
    chips)."""
    co = _coords(body)
    joint = lambda name: np.array(rig.data.bones[prefix + name].head_local)  # noqa: E731
    hip_z, neck_z = marks["hip"], marks["neck"]
    mid_y = np.interp(co[:, 2], marks["heights"], 0.5 * (marks["profile"][:, 1] + marks["profile"][:, 2]))
    half = marks["shoulder_x"]
    arms = np.zeros(len(co), dtype=bool)
    for arm in ("armR", "armL", "elbowR", "elbowL"):
        arms |= _near_bone(co, rig, prefix + arm, ARM_CLEAR)
    torso = (co[:, 2] > hip_z + 0.06) & (co[:, 2] < neck_z - 0.03) & (np.abs(co[:, 0]) < half * 0.78) & ~arms
    rules = {
        "Chest": torso & (co[:, 1] < mid_y - 0.01),
        "Back": torso & (co[:, 1] > mid_y + 0.01),
    }
    for side, arm, fore, hand, calf, foot in (("R", "armR", "elbowR", "L_Hand", "kneeR", "L_Foot"), ("L", "armL", "elbowL", "R_Hand", "kneeL", "R_Foot")):
        shoulder = joint(arm)
        near = np.linalg.norm(co - shoulder, axis=1) < SHOULDER_REACH
        rules["Shoulder" + side] = near & (co[:, 2] > shoulder[2] - 0.1) & (np.abs(co[:, 0]) > 0.12)
        wrist = joint(hand)
        rules["Bracer" + side] = _near_bone(co, rig, prefix + fore, BRACER_RADIUS) & (np.linalg.norm(co - wrist, axis=1) > 0.07)
        ankle = joint(foot)
        rules["Shin" + side] = _near_bone(co, rig, prefix + calf, SHIN_RADIUS) & (co[:, 2] < marks["knee"] - 0.03) & (np.linalg.norm(co - ankle, axis=1) > 0.1)
    return rules


def _belt(body, prefix, rig, marks, paint, name):
    """A belt around the hips with a buckle at the front, on the hip bone."""
    z = marks["hip"] + 0.03
    half = float(np.interp(z, marks["heights"], marks["profile"][:, 0]))
    front = float(np.interp(z, marks["heights"], marks["profile"][:, 1]))
    back = float(np.interp(z, marks["heights"], marks["profile"][:, 2]))
    cx = 0.5 * (front + back)
    across, deep = half + 0.02, 0.5 * (back - front) + 0.02
    mean = 0.5 * (across + deep)
    belt = c.torus(name, mean, 0.035, (0.0, cx, z), scale=(across / mean, deep / mean, 0.75), segments=32, sides=8)
    buckle = c.rounded_box(f"{name}Buckle", (0.12, 0.05, 0.1), (0.0, front - 0.025, z), 0.015)
    joined = c.join(name, [belt, buckle])
    joined.data.materials.clear()
    joined.data.materials.append(paint)
    for group in list(joined.vertex_groups):
        joined.vertex_groups.remove(group)
    joined.vertex_groups.new(name=prefix + "Hip").add(range(len(joined.data.vertices)), 1.0, "REPLACE")
    joined.data.shade_smooth()
    return joined


def build_armor(body, prefix, rig, marks, name, paints):
    """The battle armor: the plates and the belt, one mesh."""
    rules = _plate_rules(body, prefix, rig, marks)
    parts = []
    for plate_name, (faces, region) in PLATES.items():
        rim = "Trim" if region == "Outfit" else "Outfit"
        parts.append(_shell(body, rules[plate_name], f"{name}{plate_name}", faces, PLATE_LIFT, PLATE_THICKNESS, paints[region], paints[rim]))
    parts.append(_belt(body, prefix, rig, marks, paints["Trim"], f"{name}Belt"))
    # The join keeps no weights: they go back by position (common).
    positions = []
    chunks = {}
    at = 0
    for part in parts:
        co, groups = c.weights_by_order(part)
        positions.append(co)
        for group, weights in groups:
            chunks.setdefault(group, []).append((at, weights))
        at += len(co)
    positions = np.concatenate(positions)
    armor = c.join(name, parts)
    joined = []
    for group, pieces in chunks.items():
        weights = np.zeros(len(positions), dtype=np.float32)
        for start, chunk in pieces:
            weights[start:start + len(chunk)] = chunk
        joined.append((group, weights))
    c.set_weights(armor, (positions, joined))
    armor.data.shade_smooth()
    return armor


def build_cape(body, prefix, rig, marks, name, paints):
    """The cape: a sheet from the shoulders down the back, weighted by
    height to the torso's bones."""
    top_z = marks["shoulder_z"] + 0.04
    hem_z = marks["knee"] - CAPE_BELOW_KNEE
    half_top = marks["shoulder_x"] * 0.95
    hip_back = float(np.interp(marks["hip"], marks["heights"], marks["profile"][:, 2]))
    bm = bmesh.new()
    rows = []
    for r in range(CAPE_ROWS + 1):
        t = r / CAPE_ROWS
        z = top_z + (hem_z - top_z) * t
        back = float(np.interp(z, marks["heights"], marks["profile"][:, 2])) if z > marks["hip"] else hip_back
        back = max(back, hip_back) if z <= marks["hip"] + 0.1 else back
        y = back + CAPE_CLEARANCE + 0.03 * t
        half = half_top * (1.0 + (CAPE_FLARE - 1.0) * t)
        row = []
        for k in range(CAPE_COLUMNS + 1):
            s = k / CAPE_COLUMNS * 2.0 - 1.0
            # The edges curve forward around the back, less toward the hem.
            row.append(bm.verts.new(Vector((s * half, y - CAPE_CURVE * s * s * (1.0 - 0.5 * t), z))))
        rows.append(row)
    faces = []
    for r in range(CAPE_ROWS):
        for k in range(CAPE_COLUMNS):
            f = bm.faces.new((rows[r][k], rows[r][k + 1], rows[r + 1][k + 1], rows[r + 1][k]))
            f.material_index = 1 if r < COLLAR_ROWS else 0
            faces.append(f)
    bm.normal_update()
    # The sheet faces the back (+Y): flip if it faces the body.
    if sum(f.normal.y for f in faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    cape = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(cape)
    mesh.materials.append(paints["Trim"])
    mesh.materials.append(paints["Outfit"])
    # Weights by height: the collar on the clavicles and the neck, then
    # the chest, the spine, the waist, the hips; rigid below the hips.
    bones = [(prefix + "NeckTwist01", top_z), (prefix + "Spine02", marks["chest"]), (prefix + "torso", 0.5 * (marks["chest"] + marks["hip"] + 0.1)), (prefix + "Waist", marks["hip"] + 0.12), (prefix + "Hip", marks["hip"])]
    groups = {bone: cape.vertex_groups.new(name=bone) for bone, _ in bones}
    for v in mesh.vertices:
        z = v.co.z
        if z >= bones[0][1]:
            groups[bones[0][0]].add([v.index], 1.0, "REPLACE")
            continue
        if z <= bones[-1][1]:
            groups[bones[-1][0]].add([v.index], 1.0, "REPLACE")
            continue
        for (upper, uz), (lower, lz) in zip(bones, bones[1:]):
            if lz <= z <= uz:
                share = (z - lz) / max(uz - lz, 1e-6)
                groups[upper].add([v.index], share, "REPLACE")
                groups[lower].add([v.index], 1.0 - share, "REPLACE")
                break
    bpy.context.view_layer.objects.active = cape
    solid = cape.modifiers.new("Solid", "SOLIDIFY")
    solid.thickness = CAPE_THICKNESS
    solid.offset = 0.0
    solid.use_rim = True
    solid.use_even_offset = False
    bpy.ops.object.modifier_apply(modifier=solid.name)
    mesh.shade_smooth()
    return cape


def build_all(body, prefix, rig, marks, sk, body_name, paints):
    """Both built garments of one body: {part: object}."""
    return {
        "GarmentArmor": build_armor(body, prefix, rig, marks, f"GarmentArmor-{body_name}", paints),
        "GarmentCape": build_cape(body, prefix, rig, marks, f"GarmentCape-{body_name}", paints),
    }
