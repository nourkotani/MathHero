"""The hero (ADR 0013): two complete Tripo characters, dressed by Blender.

The sources are in sources/tripo/<brief>/ (models.json is the record):
the chosen candidate at full detail, and rigged.glb, that candidate
decimated to the brief's face count and rigged by Tripo with its native
biped skeleton. The bake decimates the candidate again itself, with its
UV seams split so the paint keeps no cracks, and takes the skeleton and
the weights from rigged.glb (_import_body).
The family can make a body in Tripo Studio instead (the *-studio briefs):
every body goes through the same steps. BRIEFS below names each body's
brief. The preset clips come from the hero-boy brief (ADR 0012): the same
skeleton, so they play on any Tripo rig.

This script makes the game's version, and nothing is edited by hand:

- each body keeps its own Tripo armature and weights, in three.js hero
  space (Y up, facing +Z, the feet at 0, FIGHTER_HEIGHT tall); the girl's
  bones carry the prefix GIRL and her armature is a child of the boy's,
  so one model holds both and one clip drives both (the bake keys every
  clip on both rigs; scripts/bake-models.mjs joins the girl's tracks into
  the boy's clip);
- the joints the renderer uses, renamed by side (the character's left is
  the hero's +X, so L_Upperarm is armR), and a `hair` bone under each
  head;
- the body's paint stays, at BODY_TEXTURE px, under one material per
  body (PaintedBodyBoy, PaintedBodyGirl). The Player's colors apply at
  runtime through masks in the texture's own space (masks.py): the tints
  (skin, outfit, trim) and the marks (the body's own hair, the iris),
  written to src/renderer/models/hero-mask-<body>.webp and
  hero-marks-<body>.webp, with each region's mean luminance in
  hero-rig.json ("tint"). The painted face is the hero's face;
- the hair: spikes built on each skull (hair.py), one piece per Hair
  Style and length and per Form's mane, rigid on the hair bone; the short
  buzz cut is the body's own painted hair, the long one a field of tufts
  over the scalp;
- the garments: the fighter gi is the body itself; the cape and the
  battle armor are built from the body's own surface (garments.py), so
  they wear its weights and never poke through it;
- the pieces painted near white into one atlas (HeroPieces), so the
  runtime tints the hair and the garments as it tinted the scripted hero;
- the HY-Motion idle (ADR 0010), a loop whose first frame, the guard, is
  the stance; the preset clips fitted to each rig (PRESETS: a window, a
  blend to the stance, the strike dash on the root); the other HY-Motion
  clips through mocap's scheme for each rig;
- a baked ink hull on everything;
- each body's joints at rest, strike offsets, cosmetic anchors, and tint
  means, written to src/renderer/models/hero-rig.json.

Part names (the director shows one body, one garment, one hair): a body
is BodyBoy or BodyGirl; a piece fitted to a body is `<part>-<body>`, for
example Hair_spiky_short-BodyGirl or GarmentCape-BodyBoy. A part with no
piece (GarmentGi, Hair_buzz_short) shows the body alone.
"""

import json
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import common as c
import garments
import hair
import masks
import mocap

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "sources", "tripo")
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "src", "renderer", "models"))
RIG_JSON = os.path.join(MODELS, "hero-rig.json")

FIGHTER_HEIGHT = 2.6  # game units: src/renderer/constants.ts FIGHTER_HEIGHT
INK_WIDTH = 0.012
# The body's own texture, scaled from Tripo's; the pieces' painted atlas.
BODY_TEXTURE = 2048
PIECES_TEXTURE = 2048
# The body's faces: the candidate decimated here (ADR 0012's budget).
BODY_FACES = 40000
# Vertices closer than this (the rigged model's units) are one vertex.
WELD = 1e-5
# A sliver face: longer than SLIVER_EDGE (hero units) and narrower than
# SLIVER_THIN of its length squared in area.
SLIVER_EDGE = 0.1
SLIVER_THIN = 0.08
# The weights from the rigged model: smoothed over the surface, and the
# shares below WEIGHT_CLEAN dropped.
WEIGHT_SMOOTH = 0.5
WEIGHT_SMOOTH_PASSES = 2
WEIGHT_CLEAN = 0.03
# Above the head's joint by this much (the rigged model's units, about a
# metre tall), and within this share of the head's own reach around its
# bone, a vertex is the head's (the shoulders' tops stay below).
HEAD_ABOVE = 0.02
HEAD_REACH = 1.1
# A suited body's skin: this far above the neck's base (hero units).
SKIN_ABOVE_NECK = 0.02
# The recolor's contrast (hero-rig.json "tint".gamma, _gamma): paint as
# bright as GAMMA_BRIGHT (linear luminance) keeps all of its contrast.
GAMMA_BRIGHT = 0.3
GAMMA_MIN = 0.35
GAMMA_MAX = 1.0
# The arm bones (after the side prefix) a head vertex never carries.
ARM_BONES = ("Upperarm", "Forearm", "Hand")

# The bodies: the part name, the prefix on that rig's bone names, the brief
# in models.json, and the short name of its mask files. The boy's rig is
# the bare one: the motion tools (motion_score.py) and the contact sheet
# read it by the plain joint names. To put a Studio body in the game,
# name its brief here (girl-studio, boy-studio) and bake.
BODIES = {"BodyBoy": "", "BodyGirl": "girl_"}
BRIEFS = {"BodyBoy": "boy-studio", "BodyGirl": "girl-studio"}
SHORT = {"BodyBoy": "boy", "BodyGirl": "girl"}
GIRL = BODIES["BodyGirl"]
# The brief whose preset clips every body plays (ADR 0012).
CLIP_SOURCE = "hero-boy"

# Near-white paint for the pieces, as on the scripted hero: the bake keeps
# only light and shade, and the runtime tint gives the color.
HAIR = (0.84, 0.84, 0.84)
OUTFIT = (0.82, 0.82, 0.82)
TRIM = (0.86, 0.86, 0.86)

# Face budgets (ADR 0012): a hair piece or mane at most 4,000, a garment
# piece at most 8,000.
HAIR_FACES = 4000
GARMENT_FACES = 8000

# Blender hero space: the hero faces -Y, up is +Z; TO_THREE turns a
# Blender vector into three.js hero axes (Y up, facing +Z).
FORWARD = Vector((0.0, -1.0, 0.0))
UP = Vector((0.0, 0.0, 1.0))
TO_THREE = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, 1.0), (0.0, -1.0, 0.0)))

# Tripo's bones that the renderer drives by name, renamed by side: the hero
# faces +Z, so the character's left (+X) is the hero's "R" side.
JOINTS = {
    "Root": "root",
    "Spine01": "torso",
    "Head": "head",
    "L_Upperarm": "armR",
    "L_Forearm": "elbowR",
    "L_Thigh": "legR",
    "L_Calf": "kneeR",
    "R_Upperarm": "armL",
    "R_Forearm": "elbowL",
    "R_Thigh": "legL",
    "R_Calf": "kneeL",
}
# The strike points, in the order src/renderer/index.ts reads them: the
# joint that carries each, and the bone whose middle is the fist or boot.
STRIKES = (("elbowL", "R_Hand"), ("elbowR", "L_Hand"), ("kneeL", "R_Foot"), ("kneeR", "L_Foot"))

# The HY-Motion clips besides Idle (ADR 0010); Idle is HY-Motion too, and
# made first (_clips).
HY_CLIPS = ("Stagger", "Transform", "Charge", "Victory")

# A strike clip: the share of it before the strike phase, and the share of
# the strike phase from which a fist or boot on the Rival's hurtbox lands
# the hit. src/renderer/style.ts (STYLE.juice.attack) reads the same
# fractions to open the contact window.
ATTACK_ANTICIPATION = 0.18
CONTACT_FROM = 0.3
DASH_FROM = ATTACK_ANTICIPATION + (1.0 - ATTACK_ANTICIPATION) * CONTACT_FROM
# The spin strike turns a full circle from here to the dash's peak.
SPIN_FROM = 0.15

# The preset clips the game plays, in seconds of the source (models.json
# "animations" names the preset). blend: the shares of the clip that blend
# in from and out to the stance. The strikes add to the root: dash, how
# far forward it travels at the strike's peak (the hero stands 4.8 m from
# the Rival; a fist or boot must enter its hurtbox, src/scene/Rival.tsx,
# for the strike to land on contact); lift, the jump; spin, a full turn;
# face, the root turns against the hips' heading, so the body keeps
# facing the Rival whatever the source does; aim, degrees the root turns
# at the dash's peak, so a strike that goes to the side of the body goes
# at the Rival. front_kick_01 is a side kick at hip height with the body
# turned 160 degrees and a sidestep: faced, aimed 90 degrees, and pinned,
# it lands as a turning side kick. The hips' sideways travel comes off the
# root in every clip, so the hero stays in the side plane.
PRESETS = {
    "Attack0": {"window": (0.17, 1.0), "blend": (0.12, 0.3), "dash": 3.0},
    "Attack1": {"window": (0.2, 1.1), "blend": (0.12, 0.3), "dash": 2.8, "lift": 0.3, "face": True, "aim": 90.0},
    "Attack2": {"window": (1.83, 2.4), "blend": (0.15, 0.3), "dash": 3.5, "spin": True},
    "Attack3": {"window": (0.29, 0.92), "blend": (0.12, 0.3), "dash": 3.3, "lift": 0.4},
    "Blast": {"window": (2.3, 3.1), "blend": (0.1, 0.2)},
}


def piece_name(part, body):
    """The name of a piece fitted to one body: Hair_spiky_short-BodyGirl."""
    return f"{part}-{body}"


def scheme(prefix=""):
    """HY-Motion onto a hero rig (mocap.py): Tripo's scheme with the
    renamed bones, facing hero forward."""
    return {
        "forward": tuple(FORWARD),
        "up": tuple(UP),
        "bones": {role: prefix + JOINTS.get(bone, bone) for role, bone in mocap.TRIPO["bones"].items()},
    }


SCHEME = scheme()


# ---------------------------------------------------------------- the bodies


def _import_body(brief, name):
    """A body: the chosen candidate at full detail, split along its UV
    seams and decimated to BODY_FACES, wearing the weights and the
    armature of the rigged model (rigged.glb).

    Tripo rigged the candidate decimated whole (tripo_prepare.py), and that
    collapse joins vertices across the borders of the texture's islands:
    a triangle then samples the dark gap between two islands, a black
    crack in the paint. Here the seams are split first, so every island
    keeps its border, and the rigged model gives only its skeleton and
    its weights (transferred by nearest face, then smoothed and cleaned:
    the auto-weights put a share of a thigh on the waist, which stretched
    the Idle pose into slivers)."""
    added = c.import_glb(os.path.join(SOURCES, brief["rigged"]["file"]))
    rig = next(o for o in added if o.type == "ARMATURE")
    rigged = next(o for o in added if o.type == "MESH" and o.parent == rig)
    # The importer also adds an "Icosphere", its display shape for bones.
    for obj in added - {rig, rigged}:
        bpy.data.objects.remove(obj, do_unlink=True)
    chosen = brief["chosen"]["candidate"]
    mesh = c.bare_mesh(c.import_glb(os.path.join(SOURCES, brief["candidates"][chosen]["file"])))
    _weld(mesh)
    # Into the rigged model's space: Tripo sizes and centres the model it rigs.
    lo_c, hi_c = _bounds(mesh)
    lo_r, hi_r = _bounds(rigged)
    scale = (hi_r.z - lo_r.z) / (hi_c.z - lo_c.z)
    mesh.data.transform(Matrix.Translation((lo_r + hi_r) / 2) @ Matrix.Scale(scale, 4) @ Matrix.Translation(-(lo_c + hi_c) / 2))
    _split_seams(mesh)
    before = len(mesh.data.polygons)
    bpy.context.view_layer.objects.active = mesh
    decimate = mesh.modifiers.new("Decimate", "DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = min(1.0, BODY_FACES / before)
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    _drop_slivers(mesh, c.mesh_height([mesh]) / FIGHTER_HEIGHT)
    c.drop_loose(mesh)
    print(f"BODY {name}: {before} -> {len(mesh.data.polygons)} faces, scale {scale:.4f}")
    _transfer_weights(mesh, rigged, rig)
    skin = mesh.modifiers.new("Armature", "ARMATURE")
    skin.object = rig
    mesh.parent = rig
    mesh.matrix_parent_inverse.identity()
    data = rigged.data
    bpy.data.objects.remove(rigged, do_unlink=True)
    bpy.data.meshes.remove(data)
    mesh.name = mesh.data.name = name
    return rig, mesh


def _drop_slivers(obj, unit):
    """Remove the long, thin faces: a wisp of hair Tripo left sticking out
    of a head (a face SLIVER_EDGE long and SLIVER_THIN times as wide), which
    poses as a pale stick beside the ear. The feet's wide soles are long
    but not thin, and stay. unit: the mesh's units per hero unit (the
    mesh is still Tripo's size here)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    slivers = []
    limit = SLIVER_EDGE * unit
    for face in bm.faces:
        longest = max(e.calc_length() for e in face.edges)
        if longest > limit and face.calc_area() < SLIVER_THIN * longest * longest:
            slivers.append(face)
    bmesh.ops.delete(bm, geom=slivers, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    print(f"SLIVERS {obj.name}: {len(slivers)} faces dropped")


def _weld(obj):
    """Join the vertices that lie together: a glTF stores a seam's vertex
    once per side, and a Studio export has one vertex per face corner at
    every island, so faces do not connect, normals break at every seam,
    and a plate cut from the body comes out in chips. The UVs stay with
    the face corners."""
    before = len(obj.data.vertices)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD)
    bm.to_mesh(obj.data)
    bm.free()
    # The export's own normals, one per face corner, shade every island
    # flat and show every seam as a bright line: the mesh's smooth normals
    # take their place.
    custom = obj.data.has_custom_normals
    if custom:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    obj.data.shade_smooth()
    print(f"WELD {obj.name}: {before} -> {len(obj.data.vertices)} vertices, custom normals {'cleared' if custom else 'none'}")


def _bounds(obj):
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    return Vector(co.min(axis=0)), Vector(co.max(axis=0))


def _split_seams(obj):
    """Split the mesh along the borders of its UV islands: an edge whose
    two faces give a vertex different UVs."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.active
    seams = []
    for edge in bm.edges:
        faces = edge.link_faces
        if len(faces) != 2:
            continue
        a, b = faces
        for vert in edge.verts:
            la = next(l for l in a.loops if l.vert == vert)
            lb = next(l for l in b.loops if l.vert == vert)
            if (la[uv].uv - lb[uv].uv).length > 1e-5:
                seams.append(edge)
                break
    bmesh.ops.split_edges(bm, edges=seams)
    bm.to_mesh(obj.data)
    bm.free()
    print(f"SEAMS {obj.name}: {len(seams)} edges split")


def _transfer_weights(mesh, source, rig):
    """The source's vertex groups onto the mesh, by the nearest face,
    then smoothed over the surface, the head kept to its own bones
    (_head_weights), and cleaned of the small shares."""
    for group in source.vertex_groups:
        mesh.vertex_groups.new(name=group.name)
    bpy.context.view_layer.objects.active = mesh
    transfer = mesh.modifiers.new("Weights", "DATA_TRANSFER")
    transfer.object = source
    transfer.use_vert_data = True
    transfer.data_types_verts = {"VGROUP_WEIGHTS"}
    transfer.vert_mapping = "POLYINTERP_NEAREST"
    transfer.layers_vgroup_select_src = "ALL"
    transfer.layers_vgroup_select_dst = "NAME"
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=WEIGHT_SMOOTH, repeat=WEIGHT_SMOOTH_PASSES, expand=0.0)
    bpy.ops.object.mode_set(mode="OBJECT")
    _head_weights(mesh, rig)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=WEIGHT_CLEAN, keep_single=True)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def _head_weights(mesh, rig):
    """A vertex above the head's joint, within the head's reach, carries
    no arm bone. Tripo's auto-weights put an upper arm's twist bone on the
    girl's ear (0.9 of it), and the guard's raised arm pulled the ear into
    a pale stick; the smoothing could not take a whole patch out. An arm's
    or a hand's share up there goes to the head. The clavicles and the
    spine keep their shares: the tops of the shoulders stand as high."""
    bones = rig.data.bones
    neck_top = bones["Head"].head_local.z
    names = {group.index: group.name for group in mesh.vertex_groups}
    head = mesh.vertex_groups["Head"]
    # The head's reach around its bone: the hands of the A-pose stand as
    # high as the neck's top, and they are not the head's.
    axis = bones["Head"].head_local
    reach = 0.0
    for v in mesh.data.vertices:
        if any(names.get(g.group) == "Head" and g.weight > 0.5 for g in v.groups):
            reach = max(reach, (v.co.xy - axis.xy).length)
    reach *= HEAD_REACH
    moved = 0
    for v in mesh.data.vertices:
        if v.co.z < neck_top + HEAD_ABOVE or (v.co.xy - axis.xy).length > reach or not v.groups:
            continue
        stray = [(names[g.group], g.weight) for g in v.groups if names.get(g.group, "").split("_", 1)[-1].startswith(ARM_BONES)]
        if not stray:
            continue
        for name, _ in stray:
            mesh.vertex_groups[name].remove([v.index])
        own = next((g.weight for g in v.groups if names.get(g.group) == "Head"), 0.0)
        head.add([v.index], own + sum(w for _, w in stray), "REPLACE")
        moved += 1
    print(f"HEAD {mesh.name}: {moved} vertices above the neck kept to the head and the neck")


def _painted_only(mesh, name):
    """Keep the base-color texture, at BODY_TEXTURE, in one material of
    the body's name; Tripo's metallic, roughness, and normal maps go."""
    mat = next(m for m in mesh.data.materials if m is not None)
    mat.name = name
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    color = bsdf.inputs["Base Color"].links[0].from_node
    for socket in ("Normal", "Metallic", "Roughness"):
        for link in list(bsdf.inputs[socket].links):
            mat.node_tree.links.remove(link)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 1.0
    for node in list(nodes):
        if node.type in ("TEX_IMAGE", "NORMAL_MAP", "SEPARATE_COLOR", "SEPARATE_RGB") and node != color:
            nodes.remove(node)
    image = color.image
    image.name = name
    if image.size[0] != BODY_TEXTURE:
        image.scale(BODY_TEXTURE, BODY_TEXTURE)
    image.pack()
    for other in list(bpy.data.images):
        if other != image and other.users == 0:
            bpy.data.images.remove(other)
    mesh.data.materials.clear()
    mesh.data.materials.append(mat)
    for poly in mesh.data.polygons:
        poly.material_index = 0
    mesh.data.shade_smooth()
    return image


def _hero_space(rig, mesh):
    """The matrix that puts a body in hero space: turned to face -Y, scaled
    to FIGHTER_HEIGHT, the hips over the origin and the feet on z = 0."""
    turn = Matrix.Rotation(math.radians(-90.0), 4, "Z")
    scale = FIGHTER_HEIGHT / c.mesh_height([mesh])
    placed = Matrix.Scale(scale, 4) @ turn
    hip = placed @ rig.data.bones["Hip"].head_local
    floor = min((placed @ v.co).z for v in mesh.data.vertices)
    return Matrix.Translation((-hip.x, -hip.y, -floor)) @ placed, scale


def _transform(rig, mesh, matrix):
    mesh.data.transform(matrix)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in rig.data.edit_bones:
        bone.transform(matrix, scale=True, roll=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def _rename_bones(rig, mesh, prefix):
    """The renderer's joint names on the bones and the vertex groups, the
    body's prefix on every bone, and the hair bone: upright at the head
    pivot, so its rest is identity in three.js axes and the Form's hair
    scale grows the hair from there."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    bones = rig.data.edit_bones
    names = {bone.name: prefix + JOINTS.get(bone.name, bone.name) for bone in bones}
    for bone in bones:
        bone.name = names[bone.name]
    head = bones[prefix + "head"]
    hair_bone = bones.new(prefix + "hair")
    hair_bone.head = head.head.copy()
    hair_bone.tail = head.head + Vector((0.0, 0.0, 0.1))
    hair_bone.roll = 0.0
    hair_bone.parent = head
    bpy.ops.object.mode_set(mode="OBJECT")
    for group in mesh.vertex_groups:
        group.name = names.get(group.name, group.name)
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"


def _on_bone(mesh, name):
    """Which vertices a bone carries most of."""
    index = mesh.vertex_groups[name].index
    on = np.zeros(len(mesh.data.vertices), dtype=bool)
    for v in mesh.data.vertices:
        on[v.index] = sum(g.weight for g in v.groups if g.group == index) > 0.5
    return on


# Arcade proportions (ADR 0008: a big head, big fists, and big boots), as
# the bake reshapes a body around its own joints by the rig's weights: a
# uniform scale about a joint ("about"), or a thicker limb, a scale away
# from the bone's axis ("around"). The bones are Tripo's; a side prefix
# (L_, R_) is added for each side. The clips play as before: no joint
# moves, only the skin around it.
PROPORTIONS = (
    {"about": "Head", "bones": ("Head",), "scale": 1.26},
    {"about": "Hand", "bones": ("Hand",), "scale": 1.42, "sides": True},
    {"about": "Foot", "bones": ("Foot", "ToeBase"), "scale": 1.3, "sides": True},
    {"around": "Upperarm", "bones": ("Upperarm", "UpperarmTwist01"), "scale": 1.26, "sides": True},
    {"around": "Forearm", "bones": ("Forearm", "ForearmTwist01", "ForearmTwist02"), "scale": 1.26, "sides": True},
    {"around": "Thigh", "bones": ("Thigh", "ThighTwist01", "ThighTwist02"), "scale": 1.12, "sides": True},
    {"around": "Calf", "bones": ("Calf", "CalfTwist01", "CalfTwist02"), "scale": 1.15, "sides": True},
    {"around": "Spine02", "bones": ("Spine02", "L_Clavicle", "R_Clavicle"), "scale": 1.12},
    {"around": "Spine01", "bones": ("Spine01",), "scale": 1.06},
)


def _proportions(mesh, rig):
    """Reshape the body by PROPORTIONS: every vertex moves by the sum over
    the rules of its weight on the rule's bones times the rule's move."""
    co = np.empty(len(mesh.data.vertices) * 3)
    mesh.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    move = np.zeros_like(co)
    names = {group.name: group.index for group in mesh.vertex_groups}
    weights = {}

    def weight(name):
        if name not in weights:
            w = np.zeros(len(co))
            index = names.get(name)
            if index is not None:
                for v in mesh.data.vertices:
                    for g in v.groups:
                        if g.group == index:
                            w[v.index] = g.weight
            weights[name] = w
        return weights[name]

    for rule in PROPORTIONS:
        for side in (("L_", "R_") if rule.get("sides") else ("",)):
            share = np.zeros(len(co))
            for bone in rule["bones"]:
                share += weight(side + bone)
            k = rule["scale"] - 1.0
            if "about" in rule:
                pivot = np.array(rig.data.bones[side + rule["about"]].head_local)
                move += (co - pivot) * (k * share)[:, None]
            else:
                bone = rig.data.bones[side + rule["around"]]
                head, tail = np.array(bone.head_local), np.array(bone.tail_local)
                axis = tail - head
                t = ((co - head) @ axis) / max(float(axis @ axis), 1e-9)
                nearest = head + t[:, None] * axis
                move += (co - nearest) * (k * share)[:, None]
    co += move
    mesh.data.vertices.foreach_set("co", co.ravel())
    mesh.data.update()
    print(f"PROPORTIONS {mesh.name}: {int((np.linalg.norm(move, axis=1) > 1e-4).sum())} vertices moved")


def load_body(body_name):
    """A body in hero space with its joints renamed and its paint kept:
    (rig, mesh, scale, image). The tools (a hair preview) start here."""
    with open(os.path.join(SOURCES, "models.json"), encoding="utf-8") as f:
        brief = json.load(f)["models"][BRIEFS[body_name]]
    rig, mesh = _import_body(brief, body_name)
    _proportions(mesh, rig)
    image = _painted_only(mesh, c.PAINTED + body_name)
    matrix, scale = _hero_space(rig, mesh)
    _transform(rig, mesh, matrix)
    _rename_bones(rig, mesh, BODIES[body_name])
    return rig, mesh, scale, image


# ---------------------------------------------------------------- masks


def _masks(body, prefix, sk, image, short, brief, marks):
    """The body's tint and mark masks, written next to the model; returns
    each region's mean luminance for hero-rig.json. The brief's palette
    (models.json) names the body's colors; else the hero palette. A
    palette with "skin_above": "neck" keeps skin to the faces above the
    neck's base (a suited body: the throat and the head; the suit's
    collar and its pale leather stay the outfit and the trim)."""
    palette = dict(masks.HERO_PALETTE, **brief.get("palette", {}))
    skin_faces = None
    if palette.get("skin_above") == "neck":
        centres = np.empty(len(body.data.polygons) * 3, dtype=np.float32)
        body.data.polygons.foreach_get("center", centres)
        skin_faces = centres.reshape(-1, 3)[:, 2] > marks["neck"] + SKIN_ABOVE_NECK
    tints, marks_px, means = masks.build(
        body, image, prefix + "head", hair.mask_line(sk), palette=palette, size=BODY_TEXTURE,
        shell_of=lambda head: hair.shell_faces(body, sk, head), skin_faces=skin_faces,
    )
    masks.save_webp(masks.new_image(f"Mask{body.name}", tints), os.path.join(MODELS, f"hero-mask-{short}.webp"))
    masks.save_webp(masks.new_image(f"Marks{body.name}", marks_px), os.path.join(MODELS, f"hero-marks-{short}.webp"))
    return {
        "mean": {name: round(value, 4) for name, value in means.items()},
        "gamma": {name: round(_gamma(value), 4) for name, value in means.items()},
    }


def _gamma(mean):
    """How much of a region's contrast the recolor keeps: the ratio of a
    pixel's light to the region's mean, raised to this. Bright paint (a
    white gi) keeps all of it; dark paint (a navy suit) keeps less, or
    its faint stitches, three times its mean, would come out three times
    a bright tint, white."""
    return min(GAMMA_MAX, max(GAMMA_MIN, math.sqrt(mean / GAMMA_BRIGHT)))


# ---------------------------------------------------------------- clips


def _load_clips(rig, brief, scale):
    """Every preset clip of the clip source as an action on this armature,
    its location channels in hero units, its bone paths renamed for the
    joints."""
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    actions = {}
    for clip, info in brief["clips"].items():
        added = c.import_glb(os.path.join(SOURCES, info["file"]))
        other = next(o for o in added if o.type == "ARMATURE")
        action = other.animation_data.action
        for obj in added:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and data.users == 0:
                (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.armatures).remove(data)
        action.name = f"Preset{clip}"
        action.use_fake_user = True
        for fcurve in c.action_fcurves(action):
            for old, new in JOINTS.items():
                fcurve.data_path = fcurve.data_path.replace(f'["{old}"]', f'["{new}"]')
            if fcurve.data_path.endswith(".location"):
                for point in fcurve.keyframe_points:
                    point.co.y *= scale
                    point.handle_left.y *= scale
                    point.handle_right.y *= scale
        actions[clip] = action
    for image in list(bpy.data.images):
        if image.users == 0:
            bpy.data.images.remove(image)
    for material in list(bpy.data.materials):
        if material.users == 0 and not material.name.startswith(c.PAINTED) and material.name != c.INK:
            bpy.data.materials.remove(material)
    rig.animation_data.action = None
    return actions


def _prefixed_copy(action, prefix, suffix):
    """The same clip for the other rig: its bone paths with that rig's
    prefix. The location keys are offsets from each bone's own rest, so
    they serve as they are."""
    copy = action.copy()
    copy.name = action.name + suffix
    for fcurve in c.action_fcurves(copy):
        fcurve.data_path = fcurve.data_path.replace('pose.bones["', f'pose.bones["{prefix}')
    return copy


def _stance(rig, idle):
    """The pose every clip blends in from and out to: Idle's first frame
    (the guard), sampled."""
    return c.sample_poses(rig, idle, idle.frame_range[0], 1)[0]


def _bump(u):
    """The strike dash: 0 until the contact window opens, a sine to the
    strike's peak, and back to 0 at the clip's end."""
    if u <= DASH_FROM:
        return 0.0
    return math.sin(math.pi * (u - DASH_FROM) / (1.0 - DASH_FROM))


def _spin(u):
    """The spin strike's yaw: one full turn, eased, from SPIN_FROM to the
    dash's peak, so the hero faces the Rival again as the fist lands."""
    peak = DASH_FROM + (1.0 - DASH_FROM) / 2.0
    return 2.0 * math.pi * mocap._smooth((u - SPIN_FROM) / (peak - SPIN_FROM))


def _fit_clip(rig, action, name, spec, stance, prefix):
    """The window of a preset that the game plays, blended to the stance,
    with the strike's root motion added; the source action goes."""
    root, hip = prefix + "root", prefix + "Hip"
    start, end = spec["window"]
    blend_in, blend_out = spec["blend"]
    count = int(round((end - start) * c.FPS)) + 1
    frames = c.sample_poses(rig, action, action.frame_range[0] + start * c.FPS, count)
    rest = rig.data.bones[root].matrix_local.to_3x3()
    rest_inv = rest.inverted()
    hip_forward = rig.data.bones[hip].matrix_local.to_3x3().inverted() @ FORWARD
    hip_home = stance[hip][3].to_translation()
    keys = {bone: [] for bone in frames[0]}
    for i, sampled in enumerate(frames):
        u = i / (count - 1)
        weight = min(mocap._ramp(u, blend_in), mocap._ramp(1.0 - u, blend_out))
        pose = c.blend_poses(stance, sampled, weight)
        loc, quat, scale, _ = pose[root]
        bump = _bump(u)
        turn = 0.0
        if spec.get("face"):
            # The hips' heading as sampled (the source turns the body) is
            # taken off the root.
            ahead = sampled[hip][3].to_3x3() @ hip_forward
            turn -= math.atan2(ahead.x, -ahead.y) * weight
        if spec.get("aim"):
            turn += math.radians(spec["aim"]) * bump
        if spec.get("spin"):
            turn += _spin(u)
        yaw = Matrix.Rotation(turn, 3, "Z")
        # The root's travel: the dash and the lift, less the hips' sideways
        # travel once turned (a sidestep in the source, or the turn's swing).
        travel = FORWARD * spec.get("dash", 0.0) * bump + UP * spec.get("lift", 0.0) * bump
        hip_here = yaw @ sampled[hip][3].to_translation()
        travel.x -= (hip_here.x - hip_home.x) * weight
        loc = loc + rest_inv @ travel
        if turn:
            quat = (rest_inv @ yaw @ rest).to_quaternion() @ quat
        pose[root] = (loc, quat, scale, None)
        for bone, (loc, quat, scale, _) in pose.items():
            keys[bone].append((i, {"loc": tuple(loc), "quat": tuple(quat), "scale": tuple(scale)}))
    bpy.data.actions.remove(action)
    c.add_clip(rig, name, count - 1, keys)


def stance(rig):
    """The pose the HY-Motion clips blend in from and out to, as mocap
    wants it: Idle's first frame (the guard), {bone: {"quat", "loc"}} in
    each bone's own rest frame. motion_score.py reads it on a baked
    hero.blend."""
    rig.animation_data_create()
    idle = bpy.data.actions["Idle"]
    first = c.sample_poses(rig, idle, idle.frame_range[0], 1)[0]
    return {bone: {"quat": quat, "loc": loc} for bone, (loc, quat, _, _) in first.items()}


def _clips(rigs, brief, scale):
    """Idle and the reactions from HY-Motion, the strikes and the Blast
    from the presets, on every rig, each on its own muted NLA track
    (common.add_clip). Idle comes first: it loops (clips.json "loop"), and
    its first frame, the guard, is the stance every other clip blends in
    from and out to, so no clip passes through the preset idle's pose
    (the arms down, the palms open). The girl's clips carry her suffix;
    the bake merges them into the boy's."""
    boy = rigs["BodyBoy"]
    presets = _load_clips(boy, brief, scale)
    per_rig = {"BodyBoy": presets}
    for body, prefix in BODIES.items():
        if prefix:
            per_rig[body] = {name: _prefixed_copy(action, prefix, "-" + body) for name, action in presets.items()}
    for body, actions in per_rig.items():
        rig, prefix = rigs[body], BODIES[body]
        suffix = "" if not prefix else "-" + body
        rig.animation_data_create()
        bpy.data.actions.remove(actions.pop("Idle"))
        mocap.hy_clip(rig, "Idle" + suffix, "idle", None, scheme(prefix))
        rest = _stance(rig, bpy.data.actions["Idle" + suffix])
        for name, spec in PRESETS.items():
            _fit_clip(rig, actions.pop(name), name + suffix, spec, rest, prefix)
        for action in actions.values():
            bpy.data.actions.remove(action)
        mocap_rest = {bone: {"quat": quat, "loc": loc} for bone, (loc, quat, _, _) in rest.items()}
        for name in HY_CLIPS:
            mocap.hy_clip(rig, name + suffix, name.lower(), mocap_rest, scheme(prefix))
    for action in list(bpy.data.actions):
        if action.name.startswith("Preset"):
            bpy.data.actions.remove(action)


# ---------------------------------------------------------------- the pieces


def _copy(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = copy.data.name = name
    bpy.context.scene.collection.objects.link(copy)
    return copy


def _landmarks(body, prefix, rig):
    """Where a garment goes on a body: heights of its joints, the shoulders'
    half span, and the torso's cross-section by height (the arms left out):
    half width, front, back, and the middle across."""
    bone = lambda name: rig.matrix_world @ rig.data.bones[prefix + name].head_local  # noqa: E731
    co = np.empty(len(body.data.vertices) * 3)
    body.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    shoulder_x = 0.5 * abs(bone("armR").x - bone("armL").x)
    marks = {
        "neck": bone("NeckTwist01").z,
        "hip": bone("Hip").z,
        "chest": bone("Spine02").z,
        "knee": 0.5 * (bone("kneeR").z + bone("kneeL").z),
        "shoulder_z": 0.5 * (bone("armR").z + bone("armL").z),
        "shoulder_x": shoulder_x,
    }
    step = 0.02
    heights = np.arange(0.3, FIGHTER_HEIGHT - 0.3, step)
    profile = []
    centre_x = []
    for z in heights:
        band = co[(np.abs(co[:, 2] - z) < step) & (np.abs(co[:, 0]) < shoulder_x + 0.12)]
        if len(band) < 8:
            profile.append((np.nan, np.nan, np.nan))
            centre_x.append(np.nan)
        else:
            profile.append((np.percentile(np.abs(band[:, 0]), 99), np.percentile(band[:, 1], 1), np.percentile(band[:, 1], 99)))
            centre_x.append(0.5 * (band[:, 0].min() + band[:, 0].max()))
    profile = np.array(profile)
    centre_x = np.array(centre_x)
    # A sparse mesh (a Studio export of 10k faces) leaves bands with too
    # few vertices: those take the values interpolated from their
    # neighbours, so no size downstream (the belt's) is NaN.
    valid = ~np.isnan(profile[:, 0])
    if not valid.any():
        raise ValueError(f"{body.name}: no torso profile")
    for column in range(profile.shape[1]):
        profile[:, column] = np.interp(heights, heights[valid], profile[valid, column])
    centre_x = np.interp(heights, heights[valid], centre_x[valid])
    marks["heights"], marks["profile"] = heights, profile
    marks["centre_x"] = centre_x
    return marks


def _rgba_image(name, rgba):
    """A packed sRGB image with alpha from an (H, W, 4) float array."""
    height, width = rgba.shape[:2]
    image = bpy.data.images.new(name, width, height, alpha=True)
    image.colorspace_settings.name = "sRGB"
    image.alpha_mode = "STRAIGHT"
    image.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    image.pack()
    return image


def _rounded(v):
    return [round(float(x), 4) + 0.0 for x in v]


def _cosmetic_anchors(body, prefix, sk, marks):
    """Where the milestone cosmetics sit on this body, in three.js hero
    space (the renderer's STYLE.cosmetics keeps their shape and motion): the
    crown's centre and radius, around the head at the front hairline with
    room for the hair; the halo's centre above the skull; the wings' root
    on the shoulder blades and the trail's root on the middle of the back,
    each a little off the back's surface."""
    on_head = _on_bone(body, prefix + "head")
    co = np.empty(len(body.data.vertices) * 3)
    body.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    head = co[on_head]
    top = sk["centre"].z
    crown_z = sk["hairline"][0]
    band = head[np.abs(head[:, 2] - crown_z) < 0.02]
    reach = float(np.hypot(band[:, 0] - sk["crown_x"], band[:, 1] - sk["crown_y"]).max())

    def on_back(z):
        back = float(np.interp(z, marks["heights"], marks["profile"][:, 2]))
        return TO_THREE @ Vector((0.0, back + 0.04, z))

    return {
        "crown": {"position": _rounded(TO_THREE @ Vector((sk["crown_x"], sk["crown_y"], crown_z))), "radius": round(reach + 0.05, 4)},
        "halo": {"position": _rounded(TO_THREE @ Vector((sk["crown_x"], sk["crown_y"], top + 0.35)))},
        "wings": {"position": _rounded(on_back(marks["chest"] + 0.12))},
        "trail": {"position": _rounded(on_back(marks["hip"] + 0.3))},
    }


def _paints(*names):
    """The bake-only paint of the pieces, as on the scripted hero."""
    made = {
        "Hair": lambda: c.paint_material("Hair", HAIR, grain=0.12, edge=0.6, crevice=0.35, top=0.45, stroke_scale=14.0),
        "Outfit": lambda: c.paint_material("Outfit", OUTFIT, grain=0.14, edge=0.15, crevice=0.5, top=0.16, stroke_scale=7.0),
        "Trim": lambda: c.paint_material("Trim", TRIM, grain=0.1, edge=0.2, crevice=0.45, top=0.16),
    }
    return {name: made[name]() for name in names}


def _pixels(image):
    width, height = image.size
    px = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    return px.reshape(height, width, 4)


def _bake_pieces(units, size, paints):
    """Paint the pieces into one size x size image: each unit on a cell of a
    grid far from the bodies (the bake's shading sees no other piece),
    joined, baked, and split again. Returns {name: piece}; each piece
    keeps its UVs and its vertex groups, and wears the bake's
    Painted<Region> materials, which _wear swaps for the atlas's."""
    offsets = {}
    for i, obj in enumerate(units):
        c.drop_loose(obj)
        offsets[obj.name] = Vector((30.0 + 4.0 * (i % 6), 4.0 * (i // 6), 0.0))
        obj.data.transform(Matrix.Translation(offsets[obj.name]))
        obj["part"] = obj.name
    joined = c.join("PieceBake", units)
    image = c.bake_painted(joined, size=size, regions=paints, unwrap=True)
    image.name = "HeroPieces"
    # Packed, so the saved .blend shows it (a generated image is not saved).
    image.pack()
    pieces = {}
    for name, offset in offsets.items():
        piece = c.split_group(joined, name, name, center=False)
        piece.data.transform(Matrix.Translation(-offset))
        pieces[name] = piece
    c.remove(joined)
    return pieces, image


def _wear(piece, materials):
    """A baked piece onto the atlas's tint materials (slot by slot, so the
    ink stays last)."""
    mesh = piece.data
    index = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("material_index", index)
    worn = []
    remap = {}
    for slot in sorted(set(index.tolist())):
        region = mesh.materials[slot].name.split(".")[0][len(c.PAINTED) :]
        mat = materials[region]
        if mat not in worn:
            worn.append(mat)
        remap[slot] = worn.index(mat)
    mesh.materials.clear()
    for mat in worn:
        mesh.materials.append(mat)
    mesh.polygons.foreach_set("material_index", [remap[i] for i in index.tolist()])


def _rigid(piece, group):
    """Every vertex on one bone."""
    for old in list(piece.vertex_groups):
        piece.vertex_groups.remove(old)
    piece.vertex_groups.new(name=group).add(range(len(piece.data.vertices)), 1.0, "REPLACE")




def _finish_pieces(pieces, rigs):
    """Ink every piece (the hull keeps the weights) and hang it on its
    body's rig."""
    for piece, body_name in pieces:
        for i, mat in enumerate(piece.data.materials):
            if mat is None or not mat.name.startswith(c.PAINTED):
                raise ValueError(f"{piece.name}: slot {i} wears {mat and mat.name}, not a painted material")
        c.ink_hull_skinned(piece, rigs[body_name], INK_WIDTH)
        piece.parent = rigs[body_name]
        faces = sum(1 for p in piece.data.polygons if piece.data.materials[p.material_index].name != c.INK)
        budget = HAIR_FACES if piece.name.startswith("Hair_") else GARMENT_FACES
        if faces > budget:
            raise ValueError(f"{piece.name}: {faces} faces, over the budget of {budget}")
        print(f"FACES {piece.name}: {faces}")


def _pieces(rigs, bodies, skulls, marks):
    """Every hair and garment piece of both bodies, built on the bare
    bodies, painted into one atlas, and skinned. Returns [(piece, body)]."""
    paints = _paints("Hair", "Outfit", "Trim")
    units = []
    owners = {}
    for body_name, prefix in BODIES.items():
        body, rig, sk = bodies[body_name], rigs[body_name], skulls[body_name]
        # The body's own hair comes off the skull first, so the styles root
        # on the scalp; it is the buzz cut's look, short and long.
        # The body's own hair is the base of every style: on these models
        # it is the skin's own surface (only loose strands are a shell over
        # it), so the spikes root on it and grow out of it.
        made = hair.build_all(body, prefix, sk, body_name)
        for part, piece in made.items():
            piece.data.materials.append(paints["Hair"])
            _rigid(piece, prefix + "hair")
            owners[piece.name] = body_name
            units.append(piece)
        for part, piece in garments.build_all(body, prefix, rig, marks[body_name], sk, body_name, paints).items():
            owners[piece.name] = body_name
            units.append(piece)
    for unit in units:
        c.drop_loose(unit)
    weights = {unit.name: c.weights_by_order(unit) for unit in units}
    baked, image = _bake_pieces(units, PIECES_TEXTURE, {m.name: r for r, m in paints.items()})
    # The bake made the atlas materials, Painted<Region>, over its image:
    # every piece wears those (the runtime maps them by name).
    materials = {name: bpy.data.materials[c.PAINTED + name] for name in ("Hair", "Outfit", "Trim")}
    pieces = []
    for name, piece in baked.items():
        _wear(piece, materials)
        c.set_weights(piece, weights[name])
        pieces.append((piece, owners[name]))
    for mat in list(bpy.data.materials):
        if mat.users == 0 and mat.name.startswith(c.PAINTED) and mat not in materials.values():
            bpy.data.materials.remove(mat)
    for name, mat in materials.items():
        if mat.name != c.PAINTED + name:
            raise ValueError(f"the atlas material is {mat.name}, not {c.PAINTED + name}")
    return pieces


# ---------------------------------------------------------------- the drawn face
#
# A Studio body's face is a photograph at ten thousand faces: smoothed,
# it is a blur with a dark mouth. The game draws its own anime face on
# it, as it did on the scripted hero: two layers of the head's front
# faces, a little off the skin and inside the ink hull, with a planar UV
# from the front, wearing images the bake draws. The Iris layer (below)
# carries the irises, which the runtime tints with the Form's eye color;
# the Face layer (above) carries the whites, the lids, the brows, the
# mouth, and the eyes' highlights, opaque only where a feature is, with a
# hole over each iris. Every size is a share of the skull's width, and the
# eye line is the ears' top, so the same face fits each head. A brief
# asks for it with "face": "drawn" in its palette.

FACE_TEXTURE = 512
FACE_LIFT = 0.011
IRIS_LIFT = 0.008
# The decal's window on the face: this many skull widths wide and high,
# centred on the eye line.
FACE_WINDOW = 1.25
# The eye line, in skull heights below the skull's top.
EYE_LINE = 0.5
# The features, in skull widths from the skull's axis and the eye line.
FACE = {
    "eye_dx": 0.19,
    "eye_dz": 0.0,
    "eye_rx": 0.105,
    "eye_ry": 0.072,
    "iris_r": 0.066,
    "iris_dz": -0.006,
    "pupil_r": 0.034,
    "shine_r": 0.02,
    "shine_dx": 0.024,
    "shine_dz": 0.03,
    "lid": 0.02,
    "lash": 0.03,
    "brow_dz": 0.115,
    "brow_half": 0.12,
    "brow_t": 0.02,
    "brow_tilt": 0.04,
    "mouth_dz": -0.23,
    "mouth_half": 0.06,
    "mouth_t": 0.011,
}
FACE_INK = (0.08, 0.06, 0.07)
FACE_WHITE = (0.98, 0.98, 1.0)


def _draw_face(sk):
    """The Face and Iris images (RGBA, FACE_TEXTURE square), drawn at twice
    the size and averaged down. Coordinates are skull widths from the
    window's centre (the eye line, the skull's axis)."""
    n = FACE_TEXTURE * 2
    v, u = np.mgrid[0:n, 0:n].astype(np.float32)
    x = (u / (n - 1) - 0.5) * FACE_WINDOW
    z = (v / (n - 1) - 0.5) * FACE_WINDOW
    f = FACE
    face = np.zeros((n, n, 4), dtype=np.float32)
    iris = np.zeros((n, n, 4), dtype=np.float32)

    def paint(target, mask, rgb, alpha=1.0):
        target[mask, :3] = rgb
        target[mask, 3] = alpha

    for side in (-1.0, 1.0):
        ex, ez = side * f["eye_dx"], f["eye_dz"]
        dx, dz = x - ex, z - ez
        inside = (dx / f["eye_rx"]) ** 2 + (dz / f["eye_ry"]) ** 2
        paint(face, inside <= 1.0, FACE_WHITE)
        # The lid: a line around the eye, thick above, thin below, with a
        # lash flick at the outer corner.
        outer = ((dx / (f["eye_rx"] + f["lid"])) ** 2 + (dz / (f["eye_ry"] + f["lid"])) ** 2 <= 1.0) & (inside > 1.0)
        thin = ((dx / (f["eye_rx"] + f["lid"] * 0.4)) ** 2 + (dz / (f["eye_ry"] + f["lid"] * 0.4)) ** 2 <= 1.0) & (inside > 1.0)
        paint(face, (outer & (dz > 0.0)) | (thin & (dz <= 0.0)), FACE_INK)
        lash = (np.abs((dz - 0.3 * f["eye_ry"]) - 0.9 * (side * dx - f["eye_rx"])) < f["lid"] * 0.6) & (side * dx > f["eye_rx"] * 0.8) & (side * dx < f["eye_rx"] + f["lash"]) & (dz > 0.0)
        paint(face, lash, FACE_INK)
        # The iris, on its own layer, and a hole for it in the white.
        ix, iz = ex, ez + f["iris_dz"]
        disk = (x - ix) ** 2 + (z - iz) ** 2 <= f["iris_r"] ** 2
        paint(iris, disk, (1.0, 1.0, 1.0))
        pupil = (x - ix) ** 2 + (z - iz) ** 2 <= f["pupil_r"] ** 2
        paint(iris, pupil, FACE_INK)
        face[disk & (inside <= 1.0), 3] = 0.0
        shine = (x - (ix + side * f["shine_dx"])) ** 2 + (z - (iz + f["shine_dz"])) ** 2 <= f["shine_r"] ** 2
        paint(face, shine, FACE_WHITE)
        # The brow: a thick arc above the eye, higher at the outer end.
        bz = ez + f["brow_dz"] + f["brow_tilt"] * (side * dx / f["brow_half"]) - 0.25 * (dx / f["brow_half"]) ** 2 * f["brow_dz"] * 0.3
        brow = (np.abs(z - bz) < f["brow_t"] * (0.6 + 0.4 * np.clip(side * dx / f["brow_half"] + 0.5, 0.0, 1.0))) & (np.abs(dx) < f["brow_half"])
        paint(face, brow, FACE_INK)
    # The mouth: a short, faintly smiling line.
    mz = f["mouth_dz"] + 0.3 * (x / f["mouth_half"]) ** 2 * f["mouth_t"] * 2.0
    mouth = (np.abs(z - mz) < f["mouth_t"]) & (np.abs(x) < f["mouth_half"])
    paint(face, mouth, FACE_INK)
    # Down to size: the average of each 2 x 2 block (premultiplied, so a
    # feature's edge never fades to black).
    def down(img):
        pre = img.copy()
        pre[:, :, :3] *= pre[:, :, 3:4]
        small = pre.reshape(FACE_TEXTURE, 2, FACE_TEXTURE, 2, 4).mean(axis=(1, 3))
        alpha = small[:, :, 3:4]
        small[:, :, :3] = np.where(alpha > 1e-4, small[:, :, :3] / np.maximum(alpha, 1e-4), 0.0)
        return small

    return down(face), down(iris)


def _face_layers(body, prefix, sk, face_material, iris_material):
    """Two copies of the head's front faces, lifted off the skin, with a
    planar UV from the front over the face window, merged into the body
    under the Face and Iris materials. Built after the ink hull, so the
    layers are not inked."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    uv_layer = bm.loops.layers.uv.active
    index = body.vertex_groups[prefix + "head"].index
    deform = bm.verts.layers.deform.verify()
    ink = {i for i, slot in enumerate(body.material_slots) if slot.material and slot.material.name == c.INK}
    # The eye line: a share of the skull's height below its top (the ears
    # are hidden under hair on some heads, so they do not place it).
    eye_z = sk["centre"].z - EYE_LINE * sk["height"]
    half = 0.5 * FACE_WINDOW * sk["width"]
    chin = eye_z - 0.3 * sk["height"]
    top = sk["hairline"][0] + 0.02
    front = []
    for f in bm.faces:
        if f.material_index in ink:
            continue
        if not all(v[deform].get(index, 0.0) > 0.5 for v in f.verts):
            continue
        centre = f.calc_center_median()
        if centre.z < chin or centre.z > top or abs(centre.x - sk["crown_x"]) > half:
            continue
        if f.normal.y > -0.15:
            continue
        front.append(f)
    if not front:
        raise ValueError(f"{body.name}: no front faces for the drawn face")
    slots = {mat.name: i for i, mat in enumerate(body.data.materials)}
    for material, lift in ((iris_material, IRIS_LIFT), (face_material, FACE_LIFT)):
        if material.name not in slots:
            body.data.materials.append(material)
            slots[material.name] = len(body.data.materials) - 1
        made = bmesh.ops.duplicate(bm, geom=front)
        verts = [g for g in made["geom"] if isinstance(g, bmesh.types.BMVert)]
        faces = [g for g in made["geom"] if isinstance(g, bmesh.types.BMFace)]
        normals = {v: Vector((0.0, 0.0, 0.0)) for v in verts}
        for f in faces:
            for v in f.verts:
                normals[v] += f.normal
        for v in verts:
            n = normals[v]
            if n.length > 1e-9:
                v.co += n.normalized() * lift
        for f in faces:
            f.material_index = slots[material.name]
            for loop in f.loops:
                p = loop.vert.co
                loop[uv_layer].uv = ((p.x - sk["crown_x"]) / (2.0 * half) + 0.5, (p.z - eye_z) / (2.0 * half) + 0.5)
    bm.to_mesh(body.data)
    bm.free()
    print(f"FACE {body.name}: {len(front)} front faces, the eye line at {eye_z:.3f}, the window {2 * half:.3f} wide")


# ---------------------------------------------------------------- the rig for the renderer


def strike_offsets(rig, prefix=""):
    """The fist and boot centres in their joint's rest frame: the middle
    of the hand or foot bone. A bone's frame keeps its coordinates in
    three.js (the exporter turns the frame's axes, see _write_rig_json),
    so these serve the renderer as they are."""
    out = {}
    for joint, tip in STRIKES:
        bone = rig.data.bones[prefix + tip]
        middle = (bone.head_local + bone.tail_local) / 2
        out[prefix + joint] = rig.data.bones[prefix + joint].matrix_local.inverted() @ middle
    return out


def _write_rig_json(rigs, anchors, tints):
    """The renderer's copy of each body's rig (baked output): the prefix
    on its bone names, each joint's rest position and rotation in hero
    space with its nearest named parent, the strike offsets in each
    joint's own frame, where the cosmetics sit (_cosmetic_anchors), the
    mean luminance of each tint region (masks.py), and the contrast the
    recolor keeps there (_gamma).

    The glTF exporter writes a bone's rest as its Blender rest with the
    axis change applied after it (matrix_local @ axis_basis_change), and
    the scene's change of basis before it; together they turn the bone's
    axes into three.js axes: R_three = TO_THREE @ R_blender. An upright
    bone of zero roll (the hair bone) rests at identity, as the scripted
    hero's bones did.
    """
    named = set(JOINTS.values()) | {"hair"}
    data = {
        "about": "Baked output of scripts/blender/hero.py (ADR 0013): each body's rig at rest in three.js hero space, and its tint means. Do not edit by hand.",
        "height": FIGHTER_HEIGHT,
        "bodies": {},
    }
    for body_name, prefix in BODIES.items():
        rig = rigs[body_name]
        joints = {}
        for name in [*JOINTS.values(), "hair"]:
            bone = rig.data.bones[prefix + name]
            parent = bone.parent
            while parent is not None and parent.name[len(prefix) :] not in named:
                parent = parent.parent
            q = (TO_THREE @ bone.matrix_local.to_3x3()).to_quaternion()
            joints[name] = {
                "parent": parent.name[len(prefix) :] if parent else None,
                "position": _rounded(TO_THREE @ bone.head_local),
                "quaternion": _rounded((q.x, q.y, q.z, q.w)),
            }
        strikes = [
            {"joint": joint[len(prefix) :], "offset": _rounded(offset)}
            for joint, offset in strike_offsets(rig, prefix).items()
        ]
        data["bodies"][body_name] = {
            "prefix": prefix,
            "joints": joints,
            "strikes": strikes,
            "cosmetics": anchors[body_name],
            "tint": tints[body_name]["mean"],
            "tintGamma": tints[body_name]["gamma"],
        }
    with open(RIG_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"wrote {RIG_JSON}")


# ---------------------------------------------------------------- build


def build():
    with open(os.path.join(SOURCES, "models.json"), encoding="utf-8") as f:
        briefs = json.load(f)["models"]

    rigs, bodies, images, skulls, marks, tints, anchors = {}, {}, {}, {}, {}, {}, {}
    scale = None
    for body_name, prefix in BODIES.items():
        rig, body, body_scale, image = load_body(body_name)
        rigs[body_name], bodies[body_name], images[body_name] = rig, body, image
        scale = scale or body_scale
        skulls[body_name] = hair.skull(body, prefix, _on_bone, floor=rig.data.bones[prefix + "head"].head_local.z)
        marks[body_name] = _landmarks(body, prefix, rig)
        tints[body_name] = _masks(body, prefix, skulls[body_name], image, SHORT[body_name], briefs[BRIEFS[body_name]], marks[body_name])
        anchors[body_name] = _cosmetic_anchors(body, prefix, skulls[body_name], marks[body_name])
    rigs["BodyBoy"].name = "HeroRig"
    rigs["BodyGirl"].name = "GirlRig"
    rigs["BodyGirl"].parent = rigs["BodyBoy"]
    rigs["BodyGirl"].matrix_parent_inverse.identity()

    pieces = _pieces(rigs, bodies, skulls, marks)
    face_image = iris_image = None
    for body_name, body in bodies.items():
        c.ink_hull_skinned(body, rigs[body_name], INK_WIDTH)
        palette = briefs[BRIEFS[body_name]].get("palette", {})
        if palette.get("face") == "drawn":
            if face_image is None:
                face_px, iris_px = _draw_face(skulls[body_name])
                face_image = _rgba_image("HeroFace", face_px)
                iris_image = _rgba_image("HeroIris", iris_px)
                face_material = c.painted_material("Face", face_image, alpha=True)
                iris_material = c.painted_material("Iris", iris_image, alpha=True)
            _face_layers(body, BODIES[body_name], skulls[body_name], face_material, iris_material)
    _finish_pieces(pieces, rigs)

    _clips(rigs, briefs[CLIP_SOURCE], scale)
    _write_rig_json(rigs, anchors, tints)
    return rigs["BodyBoy"]
