"""The hero (ADR 0012): the Tripo bodies, fitted to the game.

The sources are in sources/tripo/hero-boy/ and hero-girl/, made by
`npm run tripo` (models.json is the record): Idle.glb carries each body
(the chosen candidate decimated to 30k faces, rigged by Tripo with its
native biped skeleton) and the preset idle; the boy's other files carry
one preset clip each on the same skeleton, no geometry. The girl's
texture has no face; her retexture (candidates/p1s1-texture.glb, the same
UV layout) has one.

This script makes the game's version, and nothing is edited by hand:

- each body keeps its own Tripo armature and weights, in three.js hero
  space (Y up, facing +Z, the feet at 0, FIGHTER_HEIGHT tall). A transfer
  of the boy's weights onto the girl tears her slim limbs (tried on
  2026-09-25), and her own weights on his bones open seams where the
  joints differ, so the two rigs stay. The girl's bones carry the prefix
  GIRL; her armature is a child of the boy's, so one model holds both.
  Every clip exists on both rigs, and the bake (scripts/bake-models.mjs)
  merges each clip's girl tracks into the boy's clip: the runtime plays
  one clip, and both rigs move; the shown body's rig is the one seen;
- the joints the renderer uses, renamed by side (the character's left is
  the hero's +X, so L_Upperarm is armR), and a `hair` bone under each
  head;
- the tint regions Skin, Outfit, and Trim, sorted by hue from each body's
  texture (regions.py) and made gray, in one atlas for both bodies, so
  the runtime tints them as it tinted the scripted hero;
- a face layer per body: the head's front faces, a little off the skin,
  wearing the painted face with only its features opaque, and an iris
  layer above it that the Form recolors;
- the preset clips, each a window of its source, blended from and to the
  stance (the preset idle's first frame), the strike dash added to the
  root so the fists and boots reach the Rival (PRESETS table);
- the HY-Motion clips (ADR 0010) through mocap's scheme for each rig;
- the scripted Hair Styles and manes, fitted rigidly to each body's hair
  bone until the Tripo hair pieces land (ticket D);
- a baked ink hull, as on the scripted models;
- each body's joints at rest and its strike offsets, written to
  src/renderer/models/hero-rig.json for the renderer.

Part names (the director shows one body, one garment, one hair): a body
is BodyBoy or BodyGirl; a piece fitted to a body is `<part>-<body>`, for
example Hair_spiky_short-BodyGirl. There is no garment piece yet: every
garment choice shows the body's own suit (ticket D adds the pieces under
the same naming).
"""

import json
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import common as c
import mocap
import regions

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "sources", "tripo")
RIG_JSON = os.path.normpath(os.path.join(HERE, "..", "..", "src", "renderer", "models", "hero-rig.json"))

FIGHTER_HEIGHT = 2.6  # game units: src/renderer/constants.ts FIGHTER_HEIGHT
INK_WIDTH = 0.012
# Textures: each body gets BODY_TEXTURE px of a 2 x 1 atlas; each face
# FACE_TEXTURE px of another; the hair pieces bake into their own.
BODY_TEXTURE = 1024
FACE_TEXTURE = 512
HAIR_TEXTURE = 1024
# How far off the skin the face layers float (inside the ink hull).
FACE_LIFT = 0.008
IRIS_LIFT = 0.011

# The bodies: the part name, and the prefix on that rig's bone names. The
# boy's rig is the bare one: the motion tools (motion_score.py) and the
# contact sheet read it by the plain joint names.
BODIES = {"BodyBoy": "", "BodyGirl": "girl_"}
GIRL = BODIES["BodyGirl"]

# Near-white paint for the hair: the bake keeps only light and shade.
HAIR = (0.84, 0.84, 0.84)
# Hair Styles (ADR 0008): the four styles, each short or long.
HAIR_STYLES = ("spiky", "flame", "ponytail", "buzz")
HAIR_LENGTHS = ("short", "long")
# The shared manes (spec #45): from Wild Mane on, every Hair Style ascends
# into its Form's mane.
MANES = ("wild", "crimson", "rose", "legend")
# The scripted skull the hair was drawn on: its diameter, and how far its
# centre sat above the hair pivot (hero.py before ADR 0012).
SCRIPTED_SKULL = 0.68
SCRIPTED_SKULL_LIFT = 0.16

# Hero space in Blender: the hero faces three's +Z, which is Blender -Y.
FORWARD = Vector((0.0, -1.0, 0.0))
UP = Vector((0.0, 0.0, 1.0))
# Blender axes to three.js axes: (x, y, z) -> (x, z, -y).
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

HY_CLIPS = ("Idle", "Stagger", "Transform", "Charge", "Victory")

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


# ---------------------------------------------------------------- bodies


def _import_body(brief):
    """A body's rigged Idle.glb: its armature and its one mesh."""
    base = next(info for info in brief["clips"].values() if info.get("geometry"))
    added = c.import_glb(os.path.join(SOURCES, base["file"]))
    rig = next(o for o in added if o.type == "ARMATURE")
    mesh = next(o for o in added if o.type == "MESH" and o.parent == rig)
    # The importer also adds an "Icosphere", its display shape for bones.
    for obj in added - {rig, mesh}:
        bpy.data.objects.remove(obj, do_unlink=True)
    return rig, mesh


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


def _compare_rigs(rig, rig_girl):
    """How far the girl's joints sit from the boy's, as a share of the
    height, for the log: the two rigs differ, which is why each body keeps
    its own (see the module docstring)."""
    offsets = {
        bone: (rig.data.bones[bone].head_local - rig_girl.data.bones[bone].head_local).length / FIGHTER_HEIGHT
        for bone in JOINTS
    }
    worst = max(offsets, key=offsets.get)
    print(f"RIGS: largest joint offset between the bodies {offsets[worst]:.3f} of the height at {worst}")


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
    hair = bones.new(prefix + "hair")
    hair.head = head.head.copy()
    hair.tail = head.head + Vector((0.0, 0.0, 0.1))
    hair.roll = 0.0
    hair.parent = head
    bpy.ops.object.mode_set(mode="OBJECT")
    for group in mesh.vertex_groups:
        group.name = names.get(group.name, group.name)
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"


# ---------------------------------------------------------------- clips


def _load_clips(rig, brief, scale):
    """Every preset clip as an action on the boy's armature, its location
    channels in hero units, its bone paths renamed for the joints."""
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    actions = {}
    for clip, info in brief["clips"].items():
        if info.get("geometry"):
            action = rig.animation_data.action
        else:
            added = c.import_glb(os.path.join(SOURCES, info["file"]))
            other = next(o for o in added if o.type == "ARMATURE")
            action = other.animation_data.action
            for obj in added:
                bpy.data.objects.remove(obj, do_unlink=True)
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
    """The pose every clip blends in from and out to: the preset idle's
    first frame, sampled."""
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
    wants it: Idle's first frame, {bone: {"quat", "loc"}} in each bone's
    own rest frame. On a baked hero.blend (motion_score.py) Idle is the
    HY-Motion idle, which starts in this same stance."""
    rig.animation_data_create()
    idle = bpy.data.actions["Idle"]
    first = c.sample_poses(rig, idle, idle.frame_range[0], 1)[0]
    return {bone: {"quat": quat, "loc": loc} for bone, (loc, quat, _, _) in first.items()}


def _clips(rigs, brief, scale):
    """Idle and the reactions from HY-Motion, the strikes and the Blast
    from the presets, on every rig, each on its own muted NLA track
    (common.add_clip). The girl's clips carry her suffix; the bake merges
    them into the boy's."""
    boy = rigs["BodyBoy"]
    presets = _load_clips(boy, brief, scale)
    per_rig = {"BodyBoy": presets}
    for body, prefix in BODIES.items():
        if prefix:
            per_rig[body] = {name: _prefixed_copy(action, prefix, "-" + body) for name, action in presets.items()}
    for body, actions in per_rig.items():
        rig, prefix = rigs[body], BODIES[body]
        suffix = "" if not prefix else "-" + body
        rest = _stance(rig, actions.pop("Idle"))
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


# ---------------------------------------------------------------- regions and textures


def _on_bone(mesh, name):
    """Which vertices a bone carries most of."""
    index = mesh.vertex_groups[name].index
    on = np.zeros(len(mesh.data.vertices), dtype=bool)
    for v in mesh.data.vertices:
        on[v.index] = sum(g.weight for g in v.groups if g.group == index) > 0.5
    return on


def _head_polygons(mesh, labels, prefix):
    """The head's front faces: the face layer. Every corner on the head
    bone, the face turned forward, skin (not a collar), and not the crown."""
    on_head = _on_bone(mesh, prefix + "head")
    zs = [v.co.z for v in mesh.data.vertices if on_head[v.index]]
    top, bottom = max(zs), min(zs)
    crown = top - 0.15 * (top - bottom)
    polys = []
    for poly in mesh.data.polygons:
        if labels[poly.index] != regions.SKIN or not all(on_head[i] for i in poly.vertices):
            continue
        if poly.normal.dot(FORWARD) < 0.15 or poly.center.z > crown:
            continue
        polys.append(poly.index)
    return polys


def _uv_raster(mesh, polys, size):
    """Which texels of a size x size image the polygons' UVs cover."""
    uv = mesh.data.uv_layers.active.data
    inside = np.zeros((size, size), dtype=bool)
    for index in polys:
        poly = mesh.data.polygons[index]
        pts = np.array([uv[li].uv[:] for li in poly.loop_indices]) % 1.0 * (size - 1)
        x0, y0 = np.floor(pts.min(axis=0)).astype(int)
        x1, y1 = np.ceil(pts.max(axis=0)).astype(int)
        if x1 <= x0 or y1 <= y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax, ay), (bx, by), (cx, cy) = pts
        det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if abs(det) < 1e-9:
            continue
        w0 = ((bx - xs) * (cy - ys) - (cx - xs) * (by - ys)) / det
        w1 = ((cx - xs) * (ay - ys) - (ax - xs) * (cy - ys)) / det
        w2 = 1.0 - w0 - w1
        hit = (w0 >= -0.002) & (w1 >= -0.002) & (w2 >= -0.002)
        inside[ys[hit], xs[hit]] = True
    return inside


def _pixels(image):
    width, height = image.size
    px = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    return px.reshape(height, width, 4)


def _smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def _features(rgb, skin):
    """How much each texel differs from the skin: 0 on skin, 1 on a
    painted feature. Three kinds count: the white of an eye (no hue, and
    bright), a dark brow, lash, or pupil (much darker than the skin), and
    a colour of another hue than the skin (an iris, a lip). The skin's own
    shading, darker or more saturated but of the same hue, does not."""
    hue, sat, val = regions._hsv(rgb)
    skin_hue, skin_sat, skin_val = (float(x) for x in regions._hsv(skin))
    white = _smoothstep((0.2 - sat) / 0.1) * _smoothstep((val / max(skin_val, 1e-3) - 0.55) / 0.2)
    dark = _smoothstep((0.4 - val / max(skin_val, 1e-3)) / 0.15)
    away = np.abs((hue - skin_hue + 180.0) % 360.0 - 180.0)
    other = _smoothstep((away - 22.0) / 15.0) * _smoothstep((sat - 0.2) / 0.15)
    return np.maximum(np.maximum(white, dark), other).astype(np.float32)


def _grow(mask, radius):
    out = mask.copy()
    for _ in range(radius):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def _shrink(mask, radius):
    return ~_grow(~mask, radius)


def _iris(rgb, alpha):
    """The iris: the painted eye's coloured or dark middle, ringed by the
    white of the eye. The whites are the bright, unsaturated features;
    closing them fills the hole the iris leaves; the pupil stays dark."""
    luma = rgb @ regions.LUMA
    sat = 1.0 - rgb.min(axis=-1) / np.maximum(rgb.max(axis=-1), 1e-3)
    white = (alpha > 0.5) & (luma > 0.55) & (sat < 0.25)
    radius = max(2, rgb.shape[0] // 40)
    eye = _shrink(_grow(white, radius), radius)
    inside = eye & ~white & (alpha > 0.3)
    keep = _smoothstep((luma - 0.08) / 0.2)
    return np.where(inside, alpha * keep, 0.0).astype(np.float32)


def _face_layer(body, polys, source, into, half):
    """The face layer of a body: the head's front faces as their own
    object, the painted face baked onto their own UVs. Returns the object
    (its UVs in the given half of the face atlas) and the baked pixels."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    keep = set(polys)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    mesh = bpy.data.meshes.new("Face")
    bm.to_mesh(mesh)
    bm.free()
    face = bpy.data.objects.new("Face", mesh)
    bpy.context.scene.collection.objects.link(face)
    for group in body.vertex_groups:
        face.vertex_groups.new(name=group.name)
    # Bake the source through the original UVs into the layer's own UVs.
    bpy.ops.object.select_all(action="DESELECT")
    face.select_set(True)
    bpy.context.view_layer.objects.active = face
    face.data.uv_layers.new(name="FaceUV")
    face.data.uv_layers["FaceUV"].active = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.02, rotate_method="AXIS_ALIGNED_Y")
    bpy.ops.uv.pack_islands(margin=0.01, rotate=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    face.data.uv_layers["FaceUV"].active_render = True
    mat = bpy.data.materials.new("FaceBake")
    mat.use_nodes = True
    nt = mat.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = source
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    target = nt.nodes.new("ShaderNodeTexImage")
    target.image = into
    nt.nodes.active = target
    face.data.materials.append(mat)
    bpy.ops.object.bake(type="EMIT", margin=4, use_clear=False)
    baked = _pixels(into)
    bpy.data.materials.remove(mat)
    face.data.materials.clear()
    # The layer's UVs go into their half of the atlas; the original UVs go.
    face.data.uv_layers["UVMap"].active = True
    data = face.data.uv_layers["FaceUV"].data
    packed = face.data.uv_layers["UVMap"].data
    for i in range(len(data)):
        u, v = data[i].uv
        packed[i].uv = (0.5 * half + 0.5 * u, v)
    face.data.uv_layers.remove(face.data.uv_layers["FaceUV"])
    return face, baked


def _lift(obj, distance):
    """Push a layer off the skin along its normals."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * distance
    bm.to_mesh(obj.data)
    bm.free()


def _merge(body, layer, material):
    """Add a layer's faces to the body, wearing the material."""
    body.data.materials.append(material)
    slot = len(body.data.materials) - 1
    bm = bmesh.new()
    bm.from_mesh(body.data)
    before = len(bm.faces)
    bm.from_mesh(layer.data)
    bm.faces.ensure_lookup_table()
    for face in bm.faces[before:]:
        face.material_index = slot
    bm.to_mesh(body.data)
    bm.free()
    c.remove(layer)


def _median_color(px, inside):
    return np.median(px[inside][:, :3], axis=0).astype(np.float32)


def _dress_body(body, prefix, half, face_source, atlas, face_atlas, iris_atlas):
    """One body: its tint regions and gray texture into the atlas, its
    face layers baked, its UVs into its half of the atlas. The faces keep
    their region as the material index; the caller adds the materials."""
    labels = regions.classify(body)
    print(f"REGIONS {body.name}: {regions.histogram(labels)}")
    image = regions.base_color_image(body)
    polys = _head_polygons(body, labels, prefix)

    # The skin's colour, read where the face is, from the face's source.
    small = face_source.copy()
    small.scale(BODY_TEXTURE, BODY_TEXTURE)
    inside = _uv_raster(body, polys, BODY_TEXTURE)
    skin = _median_color(_pixels(small), inside)
    bpy.data.images.remove(small)

    # The face layers: baked from the source, the features cut out by
    # colour, the iris found inside the whites.
    baked_image = bpy.data.images.new(f"{body.name}FaceBake", FACE_TEXTURE, FACE_TEXTURE, alpha=True)
    baked_image.colorspace_settings.name = "sRGB"
    fill = np.tile(np.append(skin, 1.0), (FACE_TEXTURE * FACE_TEXTURE, 1)).astype(np.float32)
    baked_image.pixels.foreach_set(fill.ravel())
    face, baked = _face_layer(body, polys, face_source, baked_image, half)
    bpy.data.images.remove(baked_image)
    rgb = baked[:, :, :3]
    alpha = _features(rgb, skin)
    iris = _iris(rgb, alpha)
    print(f"FACE {body.name}: features {float((alpha > 0.5).mean()):.3f} of the layer, iris {float((iris > 0.5).mean()):.4f}")
    x0 = half * FACE_TEXTURE
    face_atlas[:, x0 : x0 + FACE_TEXTURE, :3] = rgb
    face_atlas[:, x0 : x0 + FACE_TEXTURE, 3] = alpha
    iris_atlas[:, x0 : x0 + FACE_TEXTURE, :3] = 1.0
    iris_atlas[:, x0 : x0 + FACE_TEXTURE, 3] = iris
    iris_layer = face.copy()
    iris_layer.data = face.data.copy()
    bpy.context.scene.collection.objects.link(iris_layer)
    _lift(face, FACE_LIFT)
    _lift(iris_layer, IRIS_LIFT)

    # The body's texture: gray, the painted face filled with skin, into
    # its half of the atlas; the faces sorted into the tint materials.
    image.scale(BODY_TEXTURE, BODY_TEXTURE)
    body_px = _pixels(image)
    features = _features(body_px[:, :, :3], _median_color(body_px, inside)) * inside
    means = regions.normalize(image, fill=features)
    print(f"TEXTURE {body.name}: region means before {means}")
    x0 = half * BODY_TEXTURE
    atlas[:, x0 : x0 + BODY_TEXTURE] = _pixels(image)
    for other in list(body.data.materials):
        if other is not None:
            bpy.data.materials.remove(other)
    body.data.materials.clear()
    body.data.polygons.foreach_set("material_index", labels.astype(np.int32))
    uv = body.data.uv_layers.active.data
    for i in range(len(uv)):
        u, v = uv[i].uv
        uv[i].uv = (0.5 * half + 0.5 * (u % 1.0), v)
    body.data.update()
    return face, iris_layer


def _atlas_image(name, width, height, pixels, alpha=True):
    image = bpy.data.images.new(name, width, height, alpha=alpha)
    image.colorspace_settings.name = "sRGB"
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    # Packed, so the saved .blend shows it (a generated image is not saved).
    image.pack()
    return image


# ---------------------------------------------------------------- hair


def hair_name(style, length):
    """The mesh name the renderer's look table asks for: Hair_spiky_short…"""
    return f"Hair_{style}_{length}"


def mane_name(mane):
    """The mesh name for a shared mane: Hair_mane_wild…"""
    return f"Hair_mane_{mane}"


def _hair_fit(body, prefix):
    """Where the scripted hair goes on this skull, and how big: the pivot
    in three.js hero space, and the scale from the scripted skull."""
    on_head = _on_bone(body, prefix + "head")
    heads = [v.co for v in body.data.vertices if on_head[v.index]]
    lo = Vector((min(p.x for p in heads), min(p.y for p in heads), min(p.z for p in heads)))
    hi = Vector((max(p.x for p in heads), max(p.y for p in heads), max(p.z for p in heads)))
    centre = (lo + hi) / 2
    scale = min(1.0, max(0.6, (hi.x - lo.x) / SCRIPTED_SKULL))
    pivot = TO_THREE @ centre - Vector((0.0, SCRIPTED_SKULL_LIFT * scale, 0.0))
    print(f"HAIR FIT {body.name}: skull {hi.x - lo.x:.3f} wide, {hi.z - lo.z:.3f} tall; scale {scale:.2f}, pivot {tuple(round(v, 3) for v in pivot)}")
    return tuple(pivot), scale


def build_hair(style, long, part, pivot, k):
    """One Hair Style, carried over from the code-built hair: spikes and caps
    placed from the hair pivot in three.js hero space, scaled by k."""

    def spike(x, y, z, tilt_x, tilt_z, radius=0.14, height=0.55):
        part(c.hair_cone("Spike", pivot, x * k, y * k, z * k, tilt_x, tilt_z, radius * k, height * k))

    def cap(radius_scale, flatten, y):
        px, py, pz = pivot
        part(c.sphere("Cap", 0.37 * k * radius_scale, c.three_point(px, py + y * k, pz), scale=(1.0, 1.0, flatten), segments=24, rings=14))

    if style == "spiky":
        spike(0, 0.74, 0, 0, 0)
        spike(0.18, 0.67, 0.05, 0, -0.5)
        spike(-0.18, 0.67, 0.05, 0, 0.5)
        spike(0.1, 0.62, -0.18, 0.5, -0.25)
        spike(-0.1, 0.62, -0.18, 0.5, 0.25)
        spike(0.05, 0.64, 0.2, -0.45, -0.15)
        spike(-0.05, 0.64, 0.2, -0.45, 0.15)
        # Temple spikes flaring past the ears widen the silhouette.
        spike(0.28, 0.42, 0.03, 0.1, -1.05, 0.1, 0.42)
        spike(-0.28, 0.42, 0.03, 0.1, 1.05, 0.1, 0.42)
        spike(0.16, 0.52, 0.22, -0.55, -0.55, 0.09, 0.34)
        spike(-0.16, 0.52, 0.22, -0.55, 0.55, 0.09, 0.34)
        if long:
            # A wild mane cascading down the back.
            spike(0.14, 0.12, -0.34, 2.7, -0.1, 0.13, 0.85)
            spike(-0.14, 0.12, -0.34, 2.7, 0.1, 0.13, 0.85)
            spike(0, 0.02, -0.38, 2.8, 0, 0.15, 1.0)
    elif style == "flame":
        # One big swept-back flame of hair, with a defiant front lick.
        spike(0, 0.67, -0.05, -0.55, 0, 0.24, 1.1 if long else 0.75)
        spike(0.14, 0.57, -0.12, -0.7, -0.2, 0.18, 0.9 if long else 0.6)
        spike(-0.14, 0.57, -0.12, -0.7, 0.2, 0.18, 0.9 if long else 0.6)
        spike(0.06, 0.56, 0.18, -1.0, -0.3, 0.1, 0.4)
        spike(-0.1, 0.53, 0.16, -0.9, 0.35, 0.08, 0.32)
    elif style == "ponytail":
        # High and flat enough that the hairline sits above the brows.
        cap(1.0, 0.6, 0.34)
        # Side bangs hug the temples: they frame the face, never cover it.
        spike(0.3, 0.34, 0.1, -0.1, -1.15, 0.07, 0.3)
        spike(-0.3, 0.34, 0.1, -0.1, 1.15, 0.07, 0.3)
        spike(0, 0.47, -0.3, 2.45, 0, 0.12, 0.9 if long else 0.5)
        if long:
            spike(0, -0.13, -0.42, 2.9, 0, 0.1, 0.7)
    else:  # buzz
        cap(1.06 if long else 1.0, 0.75 if long else 0.6, 0.3 if long else 0.34)
        # A short widow's-peak fringe so the cut reads on purpose, not bald.
        spike(0, 0.4, 0.3, -1.25, 0, 0.09, 0.22)
        spike(0.12, 0.38, 0.27, -1.2, -0.3, 0.07, 0.18)
        spike(-0.12, 0.38, 0.27, -1.2, 0.3, 0.07, 0.18)


def build_mane(mane, part, pivot, k):
    """A Form's shared mane: original shapes, bigger than any Hair Style, so
    the ascension reads at a glance."""

    def spike(x, y, z, tilt_x, tilt_z, radius=0.14, height=0.55):
        part(c.hair_cone("Mane", pivot, x * k, y * k, z * k, tilt_x, tilt_z, radius * k, height * k))

    def cap(radius_scale, flatten, y, z=0.0):
        px, py, pz = pivot
        part(c.sphere("ManeCap", 0.37 * k * radius_scale, c.three_point(px, py + y * k, pz + z * k), scale=(1.0, 1.0, flatten), segments=24, rings=14))

    if mane == "wild":
        # A huge spiked mane: a crown of spikes, then long ones sweeping back
        # and down past the shoulders.
        for i in range(7):
            a = (i - 3) / 3
            spike(a * 0.22, 0.7 - abs(a) * 0.08, 0.02, 0.1, -a * 0.6, 0.15, 0.7)
        # Hanging spikes: centered low, so the wide end sits at the back of
        # the head and the cone hangs down (a cone centered at head height
        # stuck half its length up above the crown).
        for i in range(5):
            a = (i - 2) / 2
            spike(a * 0.26, -0.18, -0.4, 2.55 + abs(a) * 0.1, -a * 0.35, 0.16, 1.15)
        for side in (-1, 1):
            spike(side * 0.34, 0.36, -0.02, 0.2, -side * 1.2, 0.13, 0.7)
            spike(side * 0.3, -0.25, -0.3, 2.7, -side * 0.4, 0.13, 0.9)
    elif mane == "crimson":
        # Sleek blades swept straight back, and one long tail to the waist.
        cap(1.02, 0.62, 0.33)
        for i in range(5):
            a = (i - 2) / 2
            spike(a * 0.2, 0.5, -0.1, -2.0, -a * 0.25, 0.1, 0.7)
        spike(0, -0.4, -0.4, 2.95, 0, 0.13, 1.5)
        for side in (-1, 1):
            spike(side * 0.31, 0.3, 0.08, -0.15, -side * 1.3, 0.07, 0.45)
    elif mane == "rose":
        # A soft curly bloom: round puffs in two rings around the head.
        cap(1.08, 0.7, 0.32)
        for ring, (height, reach, count) in enumerate(((0.45, 0.3, 8), (0.22, 0.36, 10))):
            for i in range(count):
                a = 2 * 3.14159 * (i + ring * 0.5) / count
                x, z = reach * math.sin(a), reach * math.cos(a)
                if z > 0.18:
                    continue  # the face stays clear
                px, py, pz = pivot
                part(c.sphere("Petal", 0.15 * k, c.three_point(px + x * k, py + height * k, pz + z * k), segments=16, rings=10))
    else:  # legend
        # A tall crown of upright flame spikes, and long spikes behind.
        for i in range(9):
            a = (i - 4) / 4
            spike(a * 0.26, 0.8 - abs(a) * 0.2, -0.02, -0.05, -a * 0.35, 0.13, 0.95 - abs(a) * 0.3)
        for i in range(3):
            a = i - 1
            spike(a * 0.2, -0.28, -0.4, 2.7, -a * 0.2, 0.16, 1.3)
        for side in (-1, 1):
            spike(side * 0.33, 0.42, 0.02, 0.05, -side * 1.0, 0.1, 0.55)


def _hair_pieces(rigs, bodies):
    """The scripted Hair Styles and manes on each body's hair bone: one
    set per body, painted into one atlas, inked, split into one piece per
    name and body, each rigid on its bone."""
    hair_material = c.paint_material("Hair", HAIR, grain=0.2, edge=0.35, crevice=0.4, top=0.3, stroke_scale=14.0)
    parts = []
    tag = {"part": None, "bone": None}

    def part(obj):
        obj["bone"] = tag["bone"]
        obj["part"] = tag["part"]
        parts.append(c.assign(obj, hair_material))
        return obj

    names = []
    for body_name, prefix in BODIES.items():
        pivot, k = _hair_fit(bodies[body_name], prefix)
        tag["bone"] = prefix + "hair"
        for style in HAIR_STYLES:
            for length in HAIR_LENGTHS:
                tag["part"] = piece_name(hair_name(style, length), body_name)
                names.append((tag["part"], body_name))
                build_hair(style, length == "long", part, pivot, k)
        for mane in MANES:
            tag["part"] = piece_name(mane_name(mane), body_name)
            names.append((tag["part"], body_name))
            build_mane(mane, part, pivot, k)
    hair = c.join("HeroHair", parts)
    c.bake_painted(hair, size=HAIR_TEXTURE, regions={"Hair": "Hair"}).pack()
    c.add_ink_hull(hair, INK_WIDTH)
    pieces = [(c.split_group(hair, name, name, center=False), body_name) for name, body_name in names]
    c.remove(hair)
    for piece, body_name in pieces:
        for name, _ in names:
            group = piece.vertex_groups.get(name)
            if group is not None:
                piece.vertex_groups.remove(group)
        piece.parent = rigs[body_name]
        piece.modifiers.new("Rig", "ARMATURE").object = rigs[body_name]


# ---------------------------------------------------------------- the rig for the renderer


def _rounded(v):
    return [round(float(x), 4) + 0.0 for x in v]


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


def _write_rig_json(rigs):
    """The renderer's copy of each body's rig (baked output): the prefix
    on its bone names, each joint's rest position and rotation in hero
    space with its nearest named parent, and the strike offsets in each
    joint's own frame.

    The glTF exporter writes a bone's rest as its Blender rest with the
    axis change applied after it (matrix_local @ axis_basis_change), and
    the scene's change of basis before it; together they turn the bone's
    axes into three.js axes: R_three = TO_THREE @ R_blender. An upright
    bone of zero roll (the hair bone) rests at identity, as the scripted
    hero's bones did.
    """
    named = set(JOINTS.values()) | {"hair"}
    data = {
        "about": "Baked output of scripts/blender/hero.py (ADR 0012): each body's rig at rest in three.js hero space. Do not edit by hand.",
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
        data["bodies"][body_name] = {"prefix": prefix, "joints": joints, "strikes": strikes}
    with open(RIG_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"wrote {RIG_JSON}")


# ---------------------------------------------------------------- build


def build():
    with open(os.path.join(SOURCES, "models.json"), encoding="utf-8") as f:
        briefs = json.load(f)["models"]
    boy_brief, girl_brief = briefs["hero-boy"], briefs["hero-girl"]

    rig, boy = _import_body(boy_brief)
    rig_girl, girl = _import_body(girl_brief)
    boy.name = boy.data.name = "BodyBoy"
    girl.name = girl.data.name = "BodyGirl"
    rigs = {"BodyBoy": rig, "BodyGirl": rig_girl}
    bodies = {"BodyBoy": boy, "BodyGirl": girl}
    matrix, scale = _hero_space(rig, boy)
    _transform(rig, boy, matrix)
    _transform(rig_girl, girl, _hero_space(rig_girl, girl)[0])
    _compare_rigs(rig, rig_girl)
    for body_name, prefix in BODIES.items():
        _rename_bones(rigs[body_name], bodies[body_name], prefix)
    # The girl's own preset idle is not used: the boy's clips serve both.
    for track in list(rig_girl.animation_data.nla_tracks):
        rig_girl.animation_data.nla_tracks.remove(track)
    bpy.data.actions.remove(rig_girl.animation_data.action)
    rig.name = "HeroRig"
    rig_girl.name = "GirlRig"
    rig_girl.parent = rig
    rig_girl.matrix_parent_inverse.identity()

    # The girl's face: her retexture, the same UV layout. Only its
    # base-color image stays.
    added = c.import_glb(os.path.join(SOURCES, girl_brief["retexture"]["file"]))
    retextured = next(o for o in added if o.type == "MESH")
    girl_face = regions.base_color_image(retextured)
    girl_face.use_fake_user = True
    spare_materials = [m for m in retextured.data.materials if m is not None]
    for obj in added:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0:
            (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.armatures).remove(data)
    for material in spare_materials:
        bpy.data.materials.remove(material)

    atlas = np.zeros((BODY_TEXTURE, 2 * BODY_TEXTURE, 4), dtype=np.float32)
    face_atlas = np.zeros((FACE_TEXTURE, 2 * FACE_TEXTURE, 4), dtype=np.float32)
    iris_atlas = np.zeros((FACE_TEXTURE, 2 * FACE_TEXTURE, 4), dtype=np.float32)
    layers = {}
    sources = {"BodyBoy": regions.base_color_image(boy), "BodyGirl": girl_face}
    for half, (body_name, prefix) in enumerate(BODIES.items()):
        body = bodies[body_name]
        layers[body_name] = _dress_body(body, prefix, half, sources[body_name], atlas, face_atlas, iris_atlas)
    atlas_image = _atlas_image("HeroPainted", 2 * BODY_TEXTURE, BODY_TEXTURE, atlas, alpha=False)
    materials = {name: c.painted_material(c.PAINTED + name, atlas_image) for name in regions.REGIONS}
    for body in bodies.values():
        for name in regions.REGIONS:
            body.data.materials.append(materials[name])
    face_material = c.painted_material("Face", _atlas_image("HeroFace", 2 * FACE_TEXTURE, FACE_TEXTURE, face_atlas), alpha=True)
    iris_material = c.painted_material("Iris", _atlas_image("HeroIris", 2 * FACE_TEXTURE, FACE_TEXTURE, iris_atlas), alpha=True)
    for other in list(bpy.data.images):
        if other.users == 0 or other == girl_face:
            bpy.data.images.remove(other)

    # The ink hull first (the face layers are not inked), then the layers.
    for body_name, body in bodies.items():
        c.ink_hull_skinned(body, rigs[body_name], INK_WIDTH)
        face, iris = layers[body_name]
        _merge(body, face, face_material)
        _merge(body, iris, iris_material)

    _hair_pieces(rigs, bodies)
    _clips(rigs, boy_brief, scale)
    _write_rig_json(rigs)
    return rig
