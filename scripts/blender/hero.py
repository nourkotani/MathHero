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
- the hair pieces and manes from Tripo (sources/tripo/hero-hair, ticket
  D), each decimated, placed on each skull by HAIR_FIT, its fringe lifted
  off the eyes, and rigid on the body's hair bone; under each one, the
  scalp cap: the head's own faces above the hairline, a little off the
  skin, on the head bone, so no bald patch shows between the locks. The
  cap alone is the short buzz cut; a thicker one with tufts is the long;
- the garments from Tripo (sources/tripo/hero-garments), fitted to each
  body band by band (GARMENT_FIT), moved out of the skin, and skinned to
  that body's own bones by weight transfer from its mesh; the cape is
  fitted on the body in the stance (the arms down) and brought back to
  rest, so it hangs around the arms;
- one painted atlas for everything: the bodies in the top row, the baked
  paint of the hair, garments, and caps in the bottom row;
- a baked ink hull, as on the scripted models;
- each body's joints at rest and its strike offsets, written to
  src/renderer/models/hero-rig.json for the renderer.

Part names (the director shows one body, one garment, one hair): a body
is BodyBoy or BodyGirl; a piece fitted to a body is `<part>-<body>`, for
example Hair_spiky_short-BodyGirl or GarmentCape-BodyBoy.
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
# Textures: one 2 x 2 atlas of BODY_TEXTURE px squares: the bodies in the
# top row; in the bottom row the hair paint, then the garments' and the
# caps'. Each face gets FACE_TEXTURE px of another atlas.
BODY_TEXTURE = 1024
FACE_TEXTURE = 512
# How far off the skin the face layers float (inside the ink hull).
FACE_LIFT = 0.008
IRIS_LIFT = 0.011

# The bodies: the part name, and the prefix on that rig's bone names. The
# boy's rig is the bare one: the motion tools (motion_score.py) and the
# contact sheet read it by the plain joint names.
BODIES = {"BodyBoy": "", "BodyGirl": "girl_"}
GIRL = BODIES["BodyGirl"]

# Near-white paint for the pieces, as on the scripted hero: the bake keeps
# only light and shade, and the runtime tint gives the color.
HAIR = (0.84, 0.84, 0.84)
OUTFIT = (0.82, 0.82, 0.82)
TRIM = (0.86, 0.86, 0.86)
# The buzz cut's lengths (ADR 0008); the other Hair Styles and the manes
# are the Tripo parts (models.json, brief hero-hair).
HAIR_LENGTHS = ("short", "long")

# Face budgets (ADR 0012): a hair piece or mane at most 4,000, its scalp
# cap included; a garment piece at most 8,000. The garments take 7,000 so
# that the largest look (a body, a garment, and a hair, each inked) draws
# under the 84,000 triangles a frame allows.
HAIR_FACES = 3300
CAP_FACES = 700
GARMENT_FACES = 7000

# The scalp cap: how far off the skin it lies (the short buzz cut, and the
# cap under every hair piece), and the long buzz: a thicker shell, with
# short tufts on its upper part.
CAP_LIFT = 0.008
BUZZ_LIFT = 0.02
BUZZ_THICKNESS = 0.016
TUFTS = 48

# Where each Tripo hair piece sits on a skull, in units of the skull's
# width (_skull): its size; how much wider than that it is; how far back
# and how high its top centre is from the skull's top centre; and its tilt
# in degrees (negative lifts the front). Found by eye on both bodies.
HAIR_FIT = {
    "Hair_spiky_short": (2.1, 1.25, 0.3, 0.45, -20.0),
    "Hair_spiky_long": (2.6, 1.15, 0.12, 0.8, 0.0),
    "Hair_flame_short": (2.3, 1.2, 0.25, 0.35, -10.0),
    "Hair_flame_long": (2.4, 1.15, 0.35, 0.8, -15.0),
    "Hair_ponytail_short": (2.5, 1.2, 0.3, 0.5, -12.0),
    "Hair_ponytail_long": (2.6, 1.2, 0.25, 0.4, -12.0),
    "Hair_mane_wild": (3.6, 1.1, 0.06, 1.06, -2.0),
    "Hair_mane_crimson": (3.9, 1.2, 0.35, 0.05, -20.0),
    "Hair_mane_rose": (3.0, 1.15, 0.05, 0.68, 0.0),
    "Hair_mane_legend": (3.0, 1.2, 0.05, 0.4, 0.0),
}
# Pieces that Tripo made with no opening for the face: the hair in front
# of the face is cut away.
FACE_WINDOW = ("Hair_mane_legend",)

# How each garment fits a body (_fit_garment). top: the body landmark (and
# an offset) its top goes to; anchor: a share of its height, down from the
# top, and the landmark that share goes to; margin: room between the body
# and the cloth; hug: the share, from the top, that follows the body's
# shape (below it the cloth hangs as it came); start: the share above which
# the shape is not measured (a collar says nothing of the chest); smooth:
# the share of the height the scale is averaged over; front: the garment
# has no back, so its front lies on the body's front; offset: how far out
# of the skin the shrinkwrap puts the cloth; flare: below a landmark, the
# cloth behind the body swings back by this much per unit of drop (_flare).
GARMENT_FIT = {
    "GarmentGi": {"top": ("neck", 0.1), "anchor": (0.6, "hip", 0.08), "margin": 0.03, "start": 0.15, "hug": 0.85, "smooth": 0.25},
    "GarmentCape": {"top": ("neck", 0.14), "anchor": (1.0, "knee", 0.1), "margin": 0.04, "hug": 0.3, "smooth": 0.15, "offset": 0.03, "flare": ("hip", 0.15, 0.35)},
    "GarmentArmor": {"top": ("shoulder_z", 0.14), "anchor": (1.0, "chest", -0.15), "margin": 0.03, "smooth": 0.3, "front": True},
}
# The paint of each garment, from the colors Tripo gave it: the accent
# (belt, lapels, bands, clasps; the plates' recesses) where the color is
# grayer than the first saturation given, or darker than the value given
# and grayer than the second saturation (a shaded fold of the main color
# stays saturated); the main elsewhere. Main and accent go to the tint
# regions named. The cape and the armor wear the trim color, so they stand
# out from the suit.
GARMENT_PAINT = {
    "GarmentGi": ("Outfit", "Trim", 0.3, 0.4, 0.55),
    "GarmentCape": ("Trim", "Outfit", 0.3, 0.4, 0.55),
    "GarmentArmor": ("Trim", "Outfit", 0.0, 0.2, 1.1),
}
# How far out of the skin a garment lies at least: past the body's own
# ink hull (INK_WIDTH), so the hull never shows through the cloth.
CLOTH_OFFSET = 0.02
# A cape hangs from the trunk and the shoulders only: no leg, forearm, or
# head bone moves it, so a kick or a raised fist does not drag it along.
# The upper arms move only the cloth over the shoulders (SHOULDER_BONES
# above the armpit, _transfer_weights): a flap that hangs beside an arm
# does not rise with the arm and crumple.
HANGING = {"GarmentCape": ("Hip", "Pelvis", "Waist", "torso", "Spine02", "NeckTwist01", "NeckTwist02", "L_Clavicle", "R_Clavicle", "L_UpperarmTwist01", "R_UpperarmTwist01")}
SHOULDER_BONES = ("L_UpperarmTwist01", "R_UpperarmTwist01")
ARMPIT_DROP = 0.08

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
    # its square of the atlas's top row; the faces sorted into the tint
    # materials.
    image.scale(BODY_TEXTURE, BODY_TEXTURE)
    body_px = _pixels(image)
    features = _features(body_px[:, :, :3], _median_color(body_px, inside)) * inside
    means = regions.normalize(image, fill=features)
    print(f"TEXTURE {body.name}: region means before {means}")
    x0 = half * BODY_TEXTURE
    atlas[BODY_TEXTURE:, x0 : x0 + BODY_TEXTURE] = _pixels(image)
    for other in list(body.data.materials):
        if other is not None:
            bpy.data.materials.remove(other)
    body.data.materials.clear()
    body.data.polygons.foreach_set("material_index", labels.astype(np.int32))
    uv = body.data.uv_layers.active.data
    for i in range(len(uv)):
        u, v = uv[i].uv
        uv[i].uv = (0.5 * half + 0.5 * (u % 1.0), 0.5 + 0.5 * min(max(v, 0.0), 1.0))
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


# ---------------------------------------------------------------- pieces: Tripo hair and garments


def hair_name(style, length):
    """The mesh name the renderer's look table asks for: Hair_spiky_short…"""
    return f"Hair_{style}_{length}"


def _tripo_parts(brief):
    """The parts of a Tripo brief and the file of each: candidate p<i>s0 is
    parts[i]; a candidate marked rejected is not used."""
    out = {}
    for i, part in enumerate(brief["parts"]):
        info = brief["candidates"].get(f"p{i}s0")
        if info is None or info.get("rejected"):
            continue
        out[part] = os.path.join(SOURCES, info["file"])
    return out


def _clean_mesh(obj):
    """Drop what the importer brought that the bake remakes: the materials
    and their images, the custom normals. The first UV layer stays: the
    bake packs the source's own islands (bake_painted unwrap=False)."""
    mesh = obj.data
    images = {n.image for m in mesh.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image}
    worn = [m for m in mesh.materials if m]
    mesh.materials.clear()
    for mat in worn:
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    for image in images:
        if image.users == 0:
            bpy.data.images.remove(image)
    while len(mesh.uv_layers) > 1:
        mesh.uv_layers.remove(mesh.uv_layers[-1])
    if mesh.uv_layers:
        mesh.uv_layers[0].name = "UVMap"
        mesh.uv_layers.active = mesh.uv_layers[0]
    if mesh.has_custom_normals:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    mesh.shade_smooth()


def _tripo_piece(path, name, faces):
    """A Tripo piece at its budget: the importer's UV seams welded (the
    collapse would keep every seam), decimated, turned to face the hero's
    forward (Tripo faces +X), its origin at its bounding box's top centre."""
    added = c.import_glb(path)
    obj = next(o for o in added if o.type == "MESH")
    for other in added - {obj}:
        bpy.data.objects.remove(other, do_unlink=True)
    mesh = obj.data
    mesh.transform(obj.matrix_world)
    obj.matrix_world.identity()
    mesh.transform(Matrix.Rotation(math.radians(-90.0), 4, "Z"))
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(mesh)
    bm.free()
    before = len(mesh.polygons)
    decimate = obj.modifiers.new("Decimate", "DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = min(1.0, faces / before)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    # The collapse moves each face's UV corners on its own, which cuts the
    # source's UV islands into single faces: weld the corners of a vertex
    # that lie together again.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.uv.remove_doubles(threshold=0.004, use_shared_vertex=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(axis=0), co.max(axis=0)
    mesh.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -hi[2])))
    obj.name = mesh.name = name
    print(f"PIECE {name}: {before} -> {len(mesh.polygons)} faces")
    return obj


def _paint_garment(obj, paint, materials):
    """Each face of a garment wears the paint of its tint region, read from
    the colors Tripo gave it (GARMENT_PAINT), with the stray faces voted
    into their neighbours' region."""
    main, accent, gray_below, dark_below, dark_gray_below = paint
    image = regions.base_color_image(obj)
    px = regions._pixels(image)
    height, width = px.shape[:2]
    tri = regions._triangle_uvs(obj)
    centre = tri.mean(axis=1, keepdims=True)
    points = np.concatenate([centre, centre, centre + (tri - centre) * regions.INNER], axis=1)
    x = np.clip((points[..., 0] % 1.0) * (width - 1), 0, width - 1).astype(np.int32)
    y = np.clip((points[..., 1] % 1.0) * (height - 1), 0, height - 1).astype(np.int32)
    _, sat, val = regions._hsv(px[y, x].mean(axis=1))
    labels = ((sat < gray_below) | ((val < dark_below) & (sat < dark_gray_below))).astype(np.int8)
    labels = regions._smooth(obj, labels)
    _clean_mesh(obj)
    obj.data.materials.append(materials[main])
    obj.data.materials.append(materials[accent])
    obj.data.polygons.foreach_set("material_index", labels.astype(np.int32))
    print(f"PAINT {obj.name}: {main} {1.0 - labels.mean():.2f}, {accent} {labels.mean():.2f}")


def _copy(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = copy.data.name = name
    bpy.context.scene.collection.objects.link(copy)
    return copy


def _skull(body, prefix):
    """The bald head, for the hair: the top centre and the width of its upper
    part (where HAIR_FIT places a piece), the crown's centre and half width
    (the fringe and the cap), the ears' top, the brow, and the hairline."""
    on_head = _on_bone(body, prefix + "head")
    co = np.empty(len(body.data.vertices) * 3)
    body.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    head = co[on_head]
    top = float(head[:, 2].max())
    height = top - float(head[:, 2].min())
    upper = head[head[:, 2] > top - 0.45 * height]
    crown = head[head[:, 2] > top - 0.2]
    crown_x = 0.5 * float(crown[:, 0].min() + crown[:, 0].max())
    lateral = np.abs(head[:, 0] - crown_x)
    # The ears stand out farthest from the skull's side.
    ear_top = float(head[lateral > 0.92 * lateral.max(), 2].max())
    drop = top - ear_top
    skull = {
        "centre": Vector((0.5 * float(upper[:, 0].min() + upper[:, 0].max()), 0.5 * float(upper[:, 1].min() + upper[:, 1].max()), top)),
        "width": float(upper[:, 0].max() - upper[:, 0].min()),
        "crown_x": crown_x,
        "crown_y": 0.5 * float(crown[:, 1].min() + crown[:, 1].max()),
        "half_width": 0.5 * float(crown[:, 0].max() - crown[:, 0].min()),
        "ear_top": ear_top,
        "brow": ear_top + 0.03,
        # The hairline's height at the front, the side (over the ears), and
        # the back (the nape).
        "hairline": (top - 0.35 * drop, ear_top + 0.02, ear_top - 0.12),
    }
    print(f"SKULL {body.name}: width {skull['width']:.3f}, ear top {ear_top:.3f}, hairline {tuple(round(z, 3) for z in skull['hairline'])}")
    return skull


def _cap(body, prefix, skull, name):
    """The scalp: the head's faces above the hairline, CAP_LIFT off the
    skin. The hairline runs around the head, high on the forehead, over
    the ears, and low at the nape: a + b cos(angle) + c cos(2 angle), the
    angle from the front."""
    front, side, back = skull["hairline"]
    a = 0.5 * (side + 0.5 * (front + back))
    b = 0.5 * (front - back)
    cc = 0.5 * (front + back) - a
    co = np.empty(len(body.data.vertices) * 3)
    body.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    r = np.hypot(co[:, 0] - skull["crown_x"], co[:, 1] - skull["crown_y"]) + 1e-9
    ahead = -(co[:, 1] - skull["crown_y"]) / r
    line = a + b * ahead + cc * (2.0 * ahead * ahead - 1.0)
    scalp = _on_bone(body, prefix + "head") & (co[:, 2] > line)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(scalp[v.index] for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * CAP_LIFT
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    cap = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(cap)
    _clean_mesh(cap)
    if len(mesh.polygons) > CAP_FACES:
        decimate = cap.modifiers.new("Decimate", "DECIMATE")
        decimate.ratio = CAP_FACES / len(mesh.polygons)
        bpy.context.view_layer.objects.active = cap
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    print(f"CAP {name}: {len(mesh.polygons)} faces")
    return cap


def _buzz_long(cap, skull, name):
    """The long buzz cut: the cap made a shell BUZZ_THICKNESS thick, lifted
    to BUZZ_LIFT, with short tufts on its upper part, tipped back."""
    buzz = _copy(cap, name)
    _lift(buzz, BUZZ_LIFT - CAP_LIFT)
    solid = buzz.modifiers.new("Shell", "SOLIDIFY")
    solid.thickness = BUZZ_THICKNESS
    solid.offset = -1.0
    solid.use_rim = True
    solid.use_even_offset = False
    bpy.context.view_layer.objects.active = buzz
    bpy.ops.object.modifier_apply(modifier=solid.name)
    bm = bmesh.new()
    bm.from_mesh(buzz.data)
    bm.normal_update()
    tuft_line = skull["ear_top"] + 0.45 * (skull["centre"].z - skull["ear_top"])
    spots = [v for v in bm.verts if v.co.z > tuft_line and v.normal.z > 0.2]
    step = max(1, len(spots) // TUFTS)
    back = Vector((0.0, 0.8, 0.0))
    for v in spots[::step][:TUFTS]:
        axis = (v.normal + back).normalized()
        made = bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=0.03, radius2=0.0, depth=0.06, calc_uvs=True)
        turn = axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.transform(bm, verts=made["verts"], matrix=Matrix.Translation(v.co + axis * 0.02) @ turn)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(buzz.data)
    bm.free()
    buzz.data.shade_smooth()
    print(f"CAP {name}: {len(buzz.data.polygons)} faces")
    return buzz


def _bake_pieces(units, size, paints):
    """Paint the pieces into one size x size image: each unit on a cell of a
    grid far from the bodies (the bake's shading sees no other piece),
    joined, baked, and split again. Returns {name: piece} and the pixels;
    each piece keeps its UVs and wears the bake's Painted<Region>
    materials, which _wear_atlas swaps for the atlas's."""
    offsets = {}
    for i, obj in enumerate(units):
        offsets[obj.name] = Vector((30.0 + 3.0 * (i % 5), 3.0 * (i // 5), 0.0))
        obj.data.transform(Matrix.Translation(offsets[obj.name]))
        obj["part"] = obj.name
    joined = c.join("PieceBake", units)
    image = c.bake_painted(joined, size=size, regions=paints, unwrap=False)
    px = _pixels(image)
    pieces = {}
    for name, offset in offsets.items():
        piece = c.split_group(joined, name, name, center=False)
        piece.data.transform(Matrix.Translation(-offset))
        for group in list(piece.vertex_groups):
            piece.vertex_groups.remove(group)
        pieces[name] = piece
    c.remove(joined)
    return pieces, px


def _wear_atlas(piece, half, materials):
    """A baked piece into its square of the atlas's bottom row, and onto
    the atlas's tint materials (slot by slot, so the ink stays last)."""
    mesh = piece.data
    uv = mesh.uv_layers.active.data
    for i in range(len(uv)):
        u, v = uv[i].uv
        uv[i].uv = (0.5 * half + 0.5 * u, 0.5 * v)
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
    # Clearing the slots resets the faces' indices: set them after.
    mesh.materials.clear()
    for mat in worn:
        mesh.materials.append(mat)
    mesh.polygons.foreach_set("material_index", [remap[i] for i in index.tolist()])


def _lift_fringe(piece, skull, keep=0.15, reach=0.16):
    """The fringe stops at the brow: hair in front of the face, below the
    brow and above the chin, is pulled up toward the brow, fading out to
    the sides of the face."""
    brow, cx, cy, half = skull["brow"], skull["crown_x"], skull["crown_y"], skull["half_width"]
    for v in piece.data.vertices:
        p = v.co
        if p.z >= brow or p.y > cy or p.z < brow - reach:
            continue
        w = 1.0 - min(1.0, max(0.0, (abs(p.x - cx) / half - 0.55) / 0.35))
        w = w * w * (3.0 - 2.0 * w)
        if w > 0.0:
            v.co.z += (brow - (brow - p.z) * keep - p.z) * w


def _cut_face_window(piece, skull):
    """Cut away the hair that hangs in front of the face: forward of the
    forehead, below the brow, within the face's width."""
    brow, cx, cy, half = skull["brow"], skull["crown_x"], skull["crown_y"], skull["half_width"]
    front = cy - 0.6 * half
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    inside = {v.index for v in bm.verts if v.co.y < front and v.co.z < brow and abs(v.co.x - cx) < 0.85 * half}
    cut = [f for f in bm.faces if all(v.index in inside for v in f.verts)]
    bmesh.ops.delete(bm, geom=cut, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(piece.data)
    bm.free()
    print(f"FACE WINDOW {piece.name}: {len(cut)} faces cut")


def _hair_pieces(body, body_name, prefix, rig, skull, canon, caps):
    """Every hair of one body: each Tripo piece placed on the skull, its
    fringe off the eyes, on the hair bone, over the scalp cap on the head
    bone; the buzz cuts are the caps alone, on the head bone (they hug the
    skull, so the Form's growth does not lift them off it)."""
    frame, width = skull["centre"], skull["width"]
    pieces = []
    for part, (size, wide, back, lift, pitch) in HAIR_FIT.items():
        piece = _copy(canon[part], piece_name(part, body_name) + "Tripo")
        place = (
            Matrix.Translation(frame + Vector((0.0, back * width, lift * width)))
            @ Matrix.Rotation(math.radians(pitch), 4, "X")
            @ Matrix.Diagonal((size * width * wide, size * width, size * width, 1.0))
        )
        piece.data.transform(place)
        _lift_fringe(piece, skull)
        if part in FACE_WINDOW:
            _cut_face_window(piece, skull)
        piece["bone"] = prefix + "hair"
        under = _copy(caps["short"], piece_name(part, body_name) + "Cap")
        under["bone"] = prefix + "head"
        pieces.append(c.join(piece_name(part, body_name), [piece, under]))
    for length in HAIR_LENGTHS:
        buzz = _copy(caps[length], piece_name(hair_name("buzz", length), body_name))
        buzz.vertex_groups.new(name=prefix + "head").add(range(len(buzz.data.vertices)), 1.0, "REPLACE")
        pieces.append(buzz)
    return pieces


# ---------------------------------------------------------------- garments


def _landmarks(body, prefix, rig, posed=False):
    """Where a garment goes on a body: heights of its joints, the shoulders'
    half span, and the torso's cross-section by height (the arms left out):
    half width, front, and back. posed: the joints as the rig is posed now
    (body is then the posed copy), not at rest."""
    if posed:
        bone = lambda name: rig.matrix_world @ rig.pose.bones[prefix + name].head  # noqa: E731
    else:
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
    }
    step = 0.02
    heights = np.arange(0.3, FIGHTER_HEIGHT - 0.3, step)
    profile = []
    for z in heights:
        band = co[(np.abs(co[:, 2] - z) < step) & (np.abs(co[:, 0]) < shoulder_x + 0.12)]
        if len(band) < 8:
            profile.append((np.nan, np.nan, np.nan))
        else:
            profile.append((np.percentile(np.abs(band[:, 0]), 99), np.percentile(band[:, 1], 1), np.percentile(band[:, 1], 99)))
    marks["heights"], marks["profile"] = heights, np.array(profile)
    return marks


def _smooth_along(values, width):
    kernel = np.ones(width) / width
    padded = np.pad(values, (width // 2, width - 1 - width // 2), mode="edge")
    return np.convolve(padded, kernel, mode="valid")


def _fit_garment(piece, marks, spec, bands=40):
    """Fit a garment to a body band by band: its top and one anchor go to
    the body's landmarks (the height), and each horizontal band is scaled to
    the torso's cross-section at the height it lands on, plus the margin,
    centred on it (or its front on the body's front). The scale is measured
    only where the band holds the whole garment, clamped, and averaged over
    the height, so a belt knot or a hanging tail does not bend the cloth."""
    co = np.empty(len(piece.data.vertices) * 3)
    piece.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    height = -co[:, 2].min()
    top = marks[spec["top"][0]] + spec["top"][1]
    share, mark, offset = spec["anchor"]
    stretch = (top - marks[mark] - offset) / (share * height)
    margin = spec["margin"]
    edges = np.linspace(-height, 0.0, bands + 1)
    centres = 0.5 * (edges[:-1] + edges[1:])
    stats = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        band = co[(co[:, 2] >= lo - height / bands) & (co[:, 2] < hi + height / bands)]
        stats.append([np.percentile(band[:, 0], 3), np.percentile(band[:, 0], 97), np.percentile(band[:, 1], 3), np.percentile(band[:, 1], 97)])
    x_lo, x_hi, y_lo, y_hi = np.array(stats).T
    body = np.array([[np.interp(top + z * stretch, marks["heights"], marks["profile"][:, k]) for k in range(3)] for z in centres])
    b_half, b_front, b_back = body.T
    down = -centres / height
    core = (down >= spec.get("start", 0.12)) & (down <= spec.get("hug", 1.0))
    depth = y_hi - y_lo
    valid = core & (depth > 0.6 * np.median(depth[core])) & ~np.isnan(b_half)
    sx = (2.0 * b_half + 2.0 * margin) / (x_hi - x_lo)
    sy = (b_back - b_front + 2.0 * margin) / depth
    for scale in (sx, sy):
        middle = np.median(scale[valid])
        np.clip(scale, 0.8 * middle, 1.3 * middle, out=scale)
        scale[:] = np.interp(centres, centres[valid], scale[valid])
    if spec.get("front"):
        shift_y = b_front - margin - y_lo * sy
        known = ~np.isnan(shift_y)
        shift_y = np.interp(centres, centres[known], shift_y[known])
    else:
        shift_y = np.interp(centres, centres[valid], (0.5 * (b_front + b_back) - 0.5 * (y_lo + y_hi) * sy)[valid])
    shift_x = np.interp(centres, centres[valid], (-0.5 * (x_lo + x_hi) * sx)[valid])
    width = max(3, int(spec.get("smooth", 0.2) * bands) | 1)
    sx, sy, shift_x, shift_y = (_smooth_along(a, width) for a in (sx, sy, shift_x, shift_y))
    for v in piece.data.vertices:
        z = v.co.z
        v.co = Vector((
            v.co.x * np.interp(z, centres, sx) + np.interp(z, centres, shift_x),
            v.co.y * np.interp(z, centres, sy) + np.interp(z, centres, shift_y),
            top + z * stretch,
        ))
    print(f"GARMENT {piece.name}: height x{stretch:.2f}, width x{sx.min():.2f}..{sx.max():.2f}, depth x{sy.min():.2f}..{sy.max():.2f}")


def _flare(piece, marks, flare):
    """Swing a hanging piece's hem out from the legs, like a bell: below the
    landmark, the cloth moves out from the body's axis by rate per unit of
    drop, so a thigh that swings or a hip that turns stays inside it."""
    mark, offset, rate = flare
    level = marks[mark] + offset
    profile = marks["profile"]
    for v in piece.data.vertices:
        z = v.co.z
        if z >= level:
            continue
        middle = 0.5 * (np.interp(z, marks["heights"], profile[:, 1]) + np.interp(z, marks["heights"], profile[:, 2]))
        out = Vector((v.co.x, v.co.y - middle, 0.0))
        if out.length > 1e-6:
            v.co += out.normalized() * rate * (level - z)


def _shrink_out(piece, bare, offset):
    """Every vertex inside the body, or nearer than offset, goes out to it;
    then a smooth pass over the moved cloth and the cloth around it heals
    the folds the push made."""
    before = np.empty(len(piece.data.vertices) * 3)
    piece.data.vertices.foreach_get("co", before)
    wrap = piece.modifiers.new("Out", "SHRINKWRAP")
    wrap.target = bare
    wrap.wrap_method = "NEAREST_SURFACEPOINT"
    wrap.wrap_mode = "OUTSIDE"
    wrap.offset = offset
    bpy.context.view_layer.objects.active = piece
    bpy.ops.object.modifier_apply(modifier=wrap.name)
    after = np.empty_like(before)
    piece.data.vertices.foreach_get("co", after)
    moved = np.linalg.norm((after - before).reshape(-1, 3), axis=1) > 1e-5
    around = moved.copy()
    edges = np.empty(len(piece.data.edges) * 2, dtype=np.int64)
    piece.data.edges.foreach_get("vertices", edges)
    edges = edges.reshape(-1, 2)
    for _ in range(2):
        grow = around.copy()
        grow[edges[around[edges[:, 0]], 1]] = True
        grow[edges[around[edges[:, 1]], 0]] = True
        around = grow
    heal = piece.vertex_groups.new(name="Heal")
    heal.add(np.nonzero(around)[0].tolist(), 1.0, "REPLACE")
    smooth = piece.modifiers.new("Heal", "SMOOTH")
    smooth.factor = 0.5
    smooth.iterations = 6
    smooth.vertex_group = heal.name
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    piece.vertex_groups.remove(piece.vertex_groups["Heal"])
    # The smooth pulls a curve in a little: out once more, with no smooth.
    again = piece.modifiers.new("Out", "SHRINKWRAP")
    again.target = bare
    again.wrap_method = "NEAREST_SURFACEPOINT"
    again.wrap_mode = "OUTSIDE"
    again.offset = offset
    bpy.ops.object.modifier_apply(modifier=again.name)
    print(f"SHRINK {piece.name}: {int(moved.sum())} of {len(moved)} vertices moved out")


def _transfer_weights(piece, bare, prefix, only=None, armpit=None):
    """Skin a garment to its body's own bones: each vertex takes the weights
    of the body's surface under it. only: the bones a hanging piece may
    follow; the other bones' weights go, and so do the upper arms' below
    the armpit height; a vertex left with none follows the hips."""
    transfer = piece.modifiers.new("Weights", "DATA_TRANSFER")
    transfer.object = bare
    transfer.use_vert_data = True
    transfer.data_types_verts = {"VGROUP_WEIGHTS"}
    transfer.vert_mapping = "POLYINTERP_NEAREST"
    transfer.layers_vgroup_select_src = "ALL"
    transfer.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = piece
    bpy.ops.object.datalayout_transfer(modifier=transfer.name)
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    if only:
        keep = {prefix + name for name in only}
        for group in list(piece.vertex_groups):
            if group.name not in keep:
                piece.vertex_groups.remove(group)
        if armpit is not None:
            low = [v.index for v in piece.data.vertices if v.co.z < armpit]
            for name in SHOULDER_BONES:
                group = piece.vertex_groups.get(prefix + name)
                if group is not None:
                    group.remove(low)
        hip = piece.vertex_groups.get(prefix + "Hip") or piece.vertex_groups.new(name=prefix + "Hip")
        bare_verts = [v.index for v in piece.data.vertices if sum(g.weight for g in v.groups) < 1e-3]
        if bare_verts:
            hip.add(bare_verts, 1.0, "REPLACE")
        bpy.ops.object.vertex_group_normalize_all(lock_active=False)


def _pose_stance(rigs, body_name):
    """Pose one body's rig in the stance: the first frame of the boy's
    preset idle, which every clip starts from (the girl's rig plays a
    copy with her prefix). Returns a function that puts the rig back."""
    boy = rigs["BodyBoy"]
    idle = boy.animation_data.action
    # Its paths name the renderer's joints, as _load_clips makes them.
    for fcurve in c.action_fcurves(idle):
        for old, new in JOINTS.items():
            fcurve.data_path = fcurve.data_path.replace(f'["{old}"]', f'["{new}"]')
    rig = rigs[body_name]
    prefix = BODIES[body_name]
    scene = bpy.context.scene
    frame = scene.frame_current
    copy = _prefixed_copy(idle, prefix, "-Stance") if prefix else None
    rig.animation_data_create()
    before = rig.animation_data.action
    c.play_action(rig, copy or idle)
    scene.frame_set(int(idle.frame_range[0]))
    bpy.context.view_layer.update()

    def back():
        rig.animation_data.action = before
        if copy is not None:
            bpy.data.actions.remove(copy)
            for pose_bone in rig.pose.bones:
                pose_bone.location = (0.0, 0.0, 0.0)
                pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
                pose_bone.scale = (1.0, 1.0, 1.0)
        scene.frame_set(frame)
        bpy.context.view_layer.update()

    return back


def _posed_copy(body, name):
    """A copy of the bare body as its rig is posed now: the armature
    applied, the vertex groups kept."""
    posed = _copy(body, name)
    posed.parent = None
    posed.matrix_world = body.matrix_world.copy()
    bpy.context.view_layer.objects.active = posed
    for mod in list(posed.modifiers):
        if mod.type == "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=mod.name)
        else:
            posed.modifiers.remove(mod)
    return posed


def _skinning(rig):
    """Each bone's skinning matrix as the rig is posed now: rest to pose,
    in the armature's space (the Armature modifier's own)."""
    world = rig.matrix_world
    return {pb.name: world @ pb.matrix @ pb.bone.matrix_local.inverted() @ world.inverted() for pb in rig.pose.bones}


def _unpose(piece, skinning):
    """Bring a piece fitted on the posed body back to rest: each vertex
    through the inverse of its weighted skinning matrix, so the Armature
    modifier puts it back where it was fitted in that pose."""
    names = {group.index: group.name for group in piece.vertex_groups}
    for v in piece.data.vertices:
        blend = Matrix(((0.0,) * 4,) * 4)
        total = 0.0
        for g in v.groups:
            bone = names[g.group]
            if g.weight > 0.0 and bone in skinning:
                blend += skinning[bone] * g.weight
                total += g.weight
        if total > 1e-6:
            v.co = (blend * (1.0 / total)).inverted() @ v.co


def _garment_pieces(body, body_name, prefix, marks, canon, rigs):
    """The garments of one body: each fitted, moved out of the skin, and
    skinned to the body's bones. Weights come only from this body (ADR
    0012): a bare copy of it, with no modifier, so the rig's pose plays no
    part. A hanging piece (the cape) is fitted and skinned on the body in
    the stance, where the arms hang at the sides, and then brought back to
    rest: so it hangs around the arms, not through them."""
    bare = _copy(body, f"Bare{body_name}")
    bare.modifiers.clear()
    bare.parent = None
    bare.matrix_world = body.matrix_world.copy()
    pieces = []
    for part, spec in GARMENT_FIT.items():
        piece = _copy(canon[part], piece_name(part, body_name))
        if part in HANGING:
            back = _pose_stance(rigs, body_name)
            posed = _posed_copy(body, f"Posed{body_name}")
            skinning = _skinning(rigs[body_name])
            posed_marks = _landmarks(posed, prefix, rigs[body_name], posed=True)
            back()
            _fit_garment(piece, posed_marks, spec)
            _shrink_out(piece, posed, spec.get("offset", CLOTH_OFFSET))
            if "flare" in spec:
                _flare(piece, posed_marks, spec["flare"])
            _transfer_weights(piece, posed, prefix, HANGING[part], posed_marks["shoulder_z"] - ARMPIT_DROP)
            _unpose(piece, skinning)
            c.remove(posed)
        else:
            _fit_garment(piece, marks, spec)
            _shrink_out(piece, bare, spec.get("offset", CLOTH_OFFSET))
            if "flare" in spec:
                _flare(piece, marks, spec["flare"])
            _transfer_weights(piece, bare, prefix, HANGING.get(part))
        pieces.append(piece)
    c.remove(bare)
    return pieces


def _cosmetic_anchors(body, prefix, skull, marks):
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
    top = skull["centre"].z
    crown_z = skull["hairline"][0]
    band = head[np.abs(head[:, 2] - crown_z) < 0.02]
    reach = float(np.hypot(band[:, 0] - skull["crown_x"], band[:, 1] - skull["crown_y"]).max())

    def on_back(z):
        back = float(np.interp(z, marks["heights"], marks["profile"][:, 2]))
        return TO_THREE @ Vector((0.0, back + 0.04, z))

    return {
        "crown": {"position": _rounded(TO_THREE @ Vector((skull["crown_x"], skull["crown_y"], crown_z))), "radius": round(reach + 0.05, 4)},
        "halo": {"position": _rounded(TO_THREE @ Vector((skull["crown_x"], skull["crown_y"], top + 0.35)))},
        "wings": {"position": _rounded(on_back(marks["chest"] + 0.12))},
        "trail": {"position": _rounded(on_back(marks["hip"] + 0.3))},
    }


def _paints(*names):
    """The bake-only paint of the pieces, as on the scripted hero. Each bake
    takes its own set: the bake removes the paint it used."""
    made = {
        "Hair": lambda: c.paint_material("Hair", HAIR, grain=0.2, edge=0.35, crevice=0.4, top=0.3, stroke_scale=14.0),
        "Outfit": lambda: c.paint_material("Outfit", OUTFIT, grain=0.14, edge=0.15, crevice=0.5, top=0.16, stroke_scale=7.0),
        "Trim": lambda: c.paint_material("Trim", TRIM, grain=0.1, edge=0.2, crevice=0.45, top=0.16),
    }
    return {name: made[name]() for name in names}


def _pieces(rigs, bodies, briefs, atlas, materials):
    """Every hair and garment piece of both bodies, painted into the atlas's
    bottom row and skinned, made from the bare bodies (before their
    regions, ink, and face layers). Returns [(piece, body)], and each
    body's cosmetic anchors (_cosmetic_anchors)."""
    hair_parts = _tripo_parts(briefs["hero-hair"])
    if set(hair_parts) != set(HAIR_FIT):
        raise ValueError(f"HAIR_FIT {sorted(HAIR_FIT)} does not match the Tripo hair parts {sorted(hair_parts)}")
    hair_paint, garment_paint = _paints("Hair"), _paints("Hair", "Outfit", "Trim")
    hair_units, garment_units = [], []
    for part, path in hair_parts.items():
        piece = _tripo_piece(path, part, HAIR_FACES)
        _clean_mesh(piece)
        piece.data.materials.append(hair_paint["Hair"])
        hair_units.append(piece)
    for part, path in _tripo_parts(briefs["hero-garments"]).items():
        piece = _tripo_piece(path, part, GARMENT_FACES)
        _paint_garment(piece, GARMENT_PAINT[part], garment_paint)
        garment_units.append(piece)
    skulls = {}
    for body_name, prefix in BODIES.items():
        skulls[body_name] = _skull(bodies[body_name], prefix)
        short = _cap(bodies[body_name], prefix, skulls[body_name], f"CapShort{body_name}")
        short.data.materials.append(garment_paint["Hair"])
        garment_units += [short, _buzz_long(short, skulls[body_name], f"CapLong{body_name}")]
    names = {obj.name for obj in hair_units + garment_units}
    canon, hair_px = _bake_pieces(hair_units, BODY_TEXTURE, {m.name: r for r, m in hair_paint.items()})
    more, garment_px = _bake_pieces(garment_units, BODY_TEXTURE, {m.name: r for r, m in garment_paint.items()})
    canon.update(more)
    if set(canon) != names:
        raise ValueError(f"the bake lost pieces: {sorted(names - set(canon))}")
    atlas[:BODY_TEXTURE, :BODY_TEXTURE] = hair_px
    atlas[:BODY_TEXTURE, BODY_TEXTURE:] = garment_px
    for name, piece in canon.items():
        _wear_atlas(piece, 0 if name.startswith("Hair_") else 1, materials)
    pieces = []
    anchors = {}
    for body_name, prefix in BODIES.items():
        body, rig = bodies[body_name], rigs[body_name]
        marks = _landmarks(body, prefix, rig)
        anchors[body_name] = _cosmetic_anchors(body, prefix, skulls[body_name], marks)
        mine = {"short": canon[f"CapShort{body_name}"], "long": canon[f"CapLong{body_name}"]}
        pieces += [(p, body_name) for p in _hair_pieces(body, body_name, prefix, rig, skulls[body_name], canon, mine)]
        pieces += [(p, body_name) for p in _garment_pieces(body, body_name, prefix, marks, canon, rigs)]
    for piece in canon.values():
        c.remove(piece)
    # The bake's own materials: every piece now wears the atlas's.
    keep = set(materials.values())
    for mat in list(bpy.data.materials):
        if mat.users == 0 and mat.name.startswith(c.PAINTED) and mat not in keep:
            bpy.data.materials.remove(mat)
    return pieces, anchors


def _finish_pieces(pieces, rigs):
    """Ink every piece (the hull keeps the weights) and hang it on its
    body's rig."""
    for piece, body_name in pieces:
        for i, mat in enumerate(piece.data.materials):
            if mat is None or not mat.name.startswith(c.PAINTED):
                raise ValueError(f"{piece.name}: slot {i} wears {mat and mat.name}, not an atlas paint")
        c.ink_hull_skinned(piece, rigs[body_name], INK_WIDTH)
        piece.parent = rigs[body_name]
        faces = sum(1 for p in piece.data.polygons if piece.data.materials[p.material_index].name != c.INK)
        print(f"FACES {piece.name}: {faces}")


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


def _write_rig_json(rigs, anchors):
    """The renderer's copy of each body's rig (baked output): the prefix
    on its bone names, each joint's rest position and rotation in hero
    space with its nearest named parent, the strike offsets in each
    joint's own frame, and where the cosmetics sit (_cosmetic_anchors).

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
        data["bodies"][body_name] = {"prefix": prefix, "joints": joints, "strikes": strikes, "cosmetics": anchors[body_name]}
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

    # One painted atlas: the bodies' squares in the top row, the pieces'
    # paint in the bottom row. Its materials come first, so they keep their
    # names: the pieces' bake makes materials of the same names.
    atlas = np.zeros((2 * BODY_TEXTURE, 2 * BODY_TEXTURE, 4), dtype=np.float32)
    atlas_image = bpy.data.images.new("HeroPainted", 2 * BODY_TEXTURE, 2 * BODY_TEXTURE, alpha=False)
    atlas_image.colorspace_settings.name = "sRGB"
    materials = {name: c.painted_material(c.PAINTED + name, atlas_image) for name in (*regions.REGIONS, "Hair")}
    pieces, anchors = _pieces(rigs, bodies, briefs, atlas, materials)

    face_atlas = np.zeros((FACE_TEXTURE, 2 * FACE_TEXTURE, 4), dtype=np.float32)
    iris_atlas = np.zeros((FACE_TEXTURE, 2 * FACE_TEXTURE, 4), dtype=np.float32)
    layers = {}
    sources = {"BodyBoy": regions.base_color_image(boy), "BodyGirl": girl_face}
    for half, (body_name, prefix) in enumerate(BODIES.items()):
        body = bodies[body_name]
        layers[body_name] = _dress_body(body, prefix, half, sources[body_name], atlas, face_atlas, iris_atlas)
    atlas_image.pixels.foreach_set(atlas.ravel())
    atlas_image.update()
    # Packed, so the saved .blend shows it (a generated image is not saved).
    atlas_image.pack()
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
    _finish_pieces(pieces, rigs)

    _clips(rigs, boy_brief, scale)
    _write_rig_json(rigs, anchors)
    return rig
