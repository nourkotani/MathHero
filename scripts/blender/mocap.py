"""Clips from a text-to-motion model, retargeted onto a game rig (ADR 0010).

The source is an SMPL-H motion from HY-Motion 1.0 (scripts/blender/sources/
hy-motion/; clips.json holds each clip's brief and chosen candidate): 52
joints of local axis-angle rotations (`poses`, F x 156; only joints 0-21
move), a root translation in meters (`trans`), Y-up, facing +Z, 30 fps.
SMPL's rest pose is a T-pose, arms along +/-X.

Two kinds of rig play these clips:

- The scripted hero (hero.py) rests upright with identity rotations in
  three.js hero space (Y-up, facing +Z), arms hanging down. Both spaces are
  the same, so the retarget matches each hero bone to the SMPL segment on
  the same side and corrects only the arms' rest direction.
- A rig that keeps its own rest pose and bone names (the Tripo fighter of
  fighter.py; the Tripo hero of ADR 0012) is retargeted through its rest
  matrices. A scheme (TRIPO below) names the bone for each SMPL joint and
  gives the rig's forward and up axes.

Keys go through common.add_clip like every other clip, then the post steps
fit the motion to the game: a window of the source, time-scaled to the
clip's length, the root eased back home (or pinned in place), and blends
in from and out to the stance.
"""

import json
import math
import os

import numpy as np
from mathutils import Matrix, Vector

import common as c

SOURCES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources")
HY_CLIPS = os.path.join(SOURCES, "hy-motion", "clips.json")
SOURCE_FPS = 30

PARENTS = [-1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 13, 14, 16, 17, 18, 19]
PELVIS, L_HIP, R_HIP, L_KNEE, R_KNEE, SPINE3, HEAD = 0, 1, 2, 4, 5, 9, 15
L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW = 16, 17, 18, 19

HERO_HIP = 0.88  # hero.py: the legs pivot 0.88 above the feet
SOURCE_HIP = 1.09  # HY-Motion: mean root height

# The hero's arms rest hanging down (0, -1, 0); SMPL's rest along +/-X.
# SMPL's left side is +X, the hero's armR/legR side.
TO_PLUS_X = Matrix.Rotation(math.radians(90), 3, "Z")
TO_MINUS_X = Matrix.Rotation(math.radians(-90), 3, "Z")


def _axis_angle(v):
    angle = float(np.linalg.norm(v))
    if angle < 1e-9:
        return Matrix.Identity(3)
    return Matrix.Rotation(angle, 3, Vector((v / angle).tolist()))


def _heading(m):
    forward = m @ Vector((0.0, 0.0, 1.0))
    return math.atan2(forward.x, forward.z)


def _smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3.0 - 2.0 * x)


def _globals(poses, yaw, f):
    """The SMPL joints' global rotations at frame f, the pelvis yawed."""
    g = []
    for j in range(22):
        local = _axis_angle(poses[f, j])
        g.append(yaw @ local if PARENTS[j] < 0 else g[PARENTS[j]] @ local)
    return g


def _retarget(poses, trans, travel="ease"):
    """Per source frame: {bone: local rotation matrix} and the root location."""
    first = _axis_angle(poses[0, PELVIS])
    yaw = Matrix.Rotation(-_heading(first), 3, "Y")  # face +Z at the start
    start = Vector((float(trans[0, 0]), 0.0, float(trans[0, 2])))  # start in place
    scale = HERO_HIP / SOURCE_HIP
    frames = []
    for f in range(len(poses)):
        g = _globals(poses, yaw, f)
        arm_r, arm_l = g[L_SHOULDER] @ TO_PLUS_X, g[R_SHOULDER] @ TO_MINUS_X
        fore_r, fore_l = g[L_ELBOW] @ TO_PLUS_X, g[R_ELBOW] @ TO_MINUS_X
        root, torso = g[PELVIS], g[SPINE3]
        rotations = {
            "root": root,
            "torso": root.inverted() @ torso,
            "head": torso.inverted() @ g[HEAD],
            "armR": torso.inverted() @ arm_r,
            "armL": torso.inverted() @ arm_l,
            "elbowR": arm_r.inverted() @ fore_r,
            "elbowL": arm_l.inverted() @ fore_l,
            "legR": root.inverted() @ g[L_HIP],
            "legL": root.inverted() @ g[R_HIP],
            "kneeR": g[L_HIP].inverted() @ g[L_KNEE],
            "kneeL": g[R_HIP].inverted() @ g[R_KNEE],
        }
        # The hero's root pivots at the feet, the source's at the pelvis:
        # place the root so the hero's hip centre lands on the scaled pelvis.
        pelvis = yaw @ (Vector(trans[f].tolist()) - start)
        if travel == "pin":
            pelvis.x = pelvis.z = 0.0
        location = pelvis * scale - root @ Vector((0.0, HERO_HIP, 0.0))
        frames.append((rotations, location))
    return frames


# ---------------------------------------------------------------- native rigs
#
# A scheme for a rig that keeps its own rest pose: the bone that plays each
# SMPL joint, by role, and the rig's axes in Blender space. Sides are the
# character's own: SMPL's left (+X) is Tripo's "L_", so nothing swaps here.
# (The hero's swap above comes from its bone names: armR is its +X arm.)
# The Tripo hero of ADR 0012 reuses TRIPO with its renamed bones.

SMPL_ROLES = {
    0: "pelvis",
    1: "thigh.L",
    2: "thigh.R",
    3: "spine1",
    4: "calf.L",
    5: "calf.R",
    6: "spine2",
    7: "foot.L",
    8: "foot.R",
    9: "spine3",
    10: "toe.L",
    11: "toe.R",
    12: "neck",
    13: "collar.L",
    14: "collar.R",
    15: "head",
    16: "upperarm.L",
    17: "upperarm.R",
    18: "forearm.L",
    19: "forearm.R",
    20: "hand.L",
    21: "hand.R",
}

# Where SMPL's rest (a T-pose) points each arm segment, in SMPL space. A
# rig rests with its arms down (an A-pose), so each arm bone is turned from
# its own rest direction to this one before the motion is applied. The
# rest of the body stands the same way in both rests: no correction.
T_POSE = {
    "upperarm.L": (1.0, 0.0, 0.0),
    "forearm.L": (1.0, 0.0, 0.0),
    "hand.L": (1.0, 0.0, 0.0),
    "upperarm.R": (-1.0, 0.0, 0.0),
    "forearm.R": (-1.0, 0.0, 0.0),
    "hand.R": (-1.0, 0.0, 0.0),
}
# The next joint along a limb: a bone's rest direction runs to it.
CHAIN = {"upperarm.L": "forearm.L", "forearm.L": "hand.L", "upperarm.R": "forearm.R", "forearm.R": "hand.R"}

# Tripo's native biped skeleton (rig v1.0-20240301, spec tripo; ADR 0011),
# as fighter.py imports it: Z-up, facing +X, 41 bones. The twist bones,
# Root, and Pelvis follow their parents.
TRIPO = {
    "forward": (1.0, 0.0, 0.0),
    "up": (0.0, 0.0, 1.0),
    "bones": {
        "pelvis": "Hip",
        "spine1": "Waist",
        "spine2": "Spine01",
        "spine3": "Spine02",
        "neck": "NeckTwist01",
        "head": "Head",
        "collar.L": "L_Clavicle",
        "upperarm.L": "L_Upperarm",
        "forearm.L": "L_Forearm",
        "hand.L": "L_Hand",
        "thigh.L": "L_Thigh",
        "calf.L": "L_Calf",
        "foot.L": "L_Foot",
        "toe.L": "L_ToeBase",
        "collar.R": "R_Clavicle",
        "upperarm.R": "R_Upperarm",
        "forearm.R": "R_Forearm",
        "hand.R": "R_Hand",
        "thigh.R": "R_Thigh",
        "calf.R": "R_Calf",
        "foot.R": "R_Foot",
        "toe.R": "R_ToeBase",
    },
}


def _space(scheme):
    """SMPL space (X left, Y up, Z forward) into the rig's Blender space."""
    forward, up = Vector(scheme["forward"]), Vector(scheme["up"])
    left = up.cross(forward)
    return Matrix((left, up, forward)).transposed()


def _hierarchy(rig):
    """Every bone, parents before children."""
    order = []

    def walk(bone):
        order.append(bone)
        for child in bone.children:
            walk(child)

    for bone in rig.data.bones:
        if bone.parent is None:
            walk(bone)
    return order


def _corrections(rig, scheme, space):
    """Per role: the rotation from the bone's rest direction to SMPL's."""
    bones = scheme["bones"]
    out = {}
    for role, direction in T_POSE.items():
        bone = rig.data.bones[bones[role]]
        child = CHAIN.get(role)
        end = rig.data.bones[bones[child]].head_local if child in bones else bone.tail_local
        rest = end - bone.head_local
        out[role] = rest.rotation_difference(space @ Vector(direction)).to_matrix()
    return out


def _retarget_native(poses, trans, rig, scheme, travel="ease"):
    """Per source frame: {bone: local rotation matrix} and the pelvis bone's
    location, for a rig that keeps its own rest pose.

    A mapped bone takes its joint's global rotation on top of its rest
    (corrected to SMPL's T-pose where the rests differ); every other bone
    follows its parent. The pelvis bone also moves with the source's root,
    scaled by the rigs' hip heights.
    """
    space = _space(scheme)
    up = Vector(scheme["up"])
    bones = scheme["bones"]
    by_bone = {name: role for role, name in bones.items()}
    corrections = _corrections(rig, scheme, space)
    order = _hierarchy(rig)
    rest = {bone.name: bone.matrix_local for bone in order}
    hip = rest[bones["pelvis"]].to_translation()
    scale = hip.dot(up) / SOURCE_HIP
    first = _axis_angle(poses[0, PELVIS])
    yaw = Matrix.Rotation(-_heading(first), 3, "Y")  # face +Z at the start
    start = Vector((float(trans[0, 0]), 0.0, float(trans[0, 2])))  # start in place
    identity = Matrix.Identity(3)
    frames = []
    for f in range(len(poses)):
        g = _globals(poses, yaw, f)
        turned = {role: space @ g[j] @ space.transposed() for j, role in SMPL_ROLES.items()}
        pelvis = space @ (yaw @ (Vector(trans[f].tolist()) - start)) * scale
        raw = pelvis - up * hip.dot(up)  # the source's travel, from the rest
        if travel == "pin":
            pelvis = up * pelvis.dot(up)
        posed = {}
        rotations = {}
        location = None
        for bone in order:
            own = rest[bone.name]
            parent = bone.parent
            chain = posed[parent.name] @ rest[parent.name].inverted() @ own if parent else own.copy()
            role = by_bone.get(bone.name)
            if role is None:
                posed[bone.name] = chain
                continue
            rotation = turned[role] @ corrections.get(role, identity) @ own.to_3x3()
            position = chain.to_translation()
            if role == "pelvis":
                position = hip - up * hip.dot(up) + pelvis
            world = Matrix.Translation(position) @ rotation.to_4x4()
            basis = chain.inverted() @ world
            rotations[bone.name] = basis.to_3x3()
            if role == "pelvis":
                location = basis.to_translation()
            posed[bone.name] = world
        frames.append((rotations, location, raw))
    return frames


# ---------------------------------------------------------------- clips


def hy_clips():
    """The HY-Motion briefs and chosen candidates, by clip."""
    with open(HY_CLIPS, encoding="utf-8") as f:
        return json.load(f)["clips"]


def hy_clip(rig, name, clip, stance, scheme=None):
    """Add the chosen HY-Motion candidate of a clip in clips.json."""
    brief = hy_clips()[clip]
    path = os.path.join(SOURCES, "hy-motion", brief["chosen"]["file"])
    return smplh_clip(rig, name, path, brief, stance, scheme)


def smplh_clip(rig, name, path, brief, stance, scheme=None):
    """Add one clip from an SMPL-H .npz file; return its raw root drift.

    brief: the clip's brief (clips.json):
      window: (start, end) seconds of the source to keep.
      length: seconds the clip plays; the window is time-scaled to fit.
      blend: fractions of the clip spent blending in and out (0.1, 0.3).
      travel: "ease" (the root eases back to where it started, so Idle
        takes over in place) or "pin" (the root never leaves its spot;
        only its height moves).
    stance: the pose the clip blends in from and out to. For the hero,
      {bone: three.js Euler}; for a scheme rig, {bone: {"quat", "loc"}}
      in each bone's own rest frame (fighter.stance).
    scheme: None for the hero; TRIPO for a rig with its own rest pose.
    The drift is how far (meters) the root had to be eased or pinned home.
    """
    window, length = brief["window"], brief["length"]
    blend_in, blend_out = brief.get("blend", (0.1, 0.3))
    travel = brief.get("travel", "ease")
    data = np.load(path)
    poses = data["poses"].reshape(len(data["poses"]), -1, 3)[:, :22].astype(np.float64)
    trans = data["trans"].astype(np.float64)
    first = int(round(window[0] * SOURCE_FPS))
    last = min(len(poses) - 1, int(round(window[1] * SOURCE_FPS)))
    poses, trans = poses[first : last + 1], trans[first : last + 1]
    if scheme is None:
        frames = _retarget(poses, trans, travel)
        stance_q = {bone: c.three_rotation(*rot) for bone, rot in stance.items()}
        home = None  # the hero's root rests at the origin
        moving = "root"
        travelled = frames[-1][1].length
    else:
        native = _retarget_native(poses, trans, rig, scheme, travel)
        frames = [(rotations, location) for rotations, location, _ in native]
        travelled = native[-1][2].length
        stance_q = {bone: pose["quat"] for bone, pose in stance.items()}
        moving = scheme["bones"]["pelvis"]
        home = stance[moving]["loc"]
        # The bones the scheme leaves alone (twists) follow their parents
        # mid-clip and blend to the stance at both ends like the others.
        for rotations, _ in frames:
            for bone in stance_q:
                rotations.setdefault(bone, Matrix.Identity(3))

    drift = frames[-1][1].copy()
    count = len(frames)
    keys = {bone: [] for bone in frames[0][0]}
    end_frame = length * c.FPS
    for i, (rotations, location) in enumerate(frames):
        u = i / (count - 1)
        weight = min(_ramp(u, blend_in), _ramp(1.0 - u, blend_out))
        if travel == "ease":
            location = location - drift * _smooth(u)
        location = location * weight if home is None else home + (location - home) * weight
        for bone, m in rotations.items():
            q = m.to_quaternion()
            rest = stance_q.get(bone)
            if rest is not None:
                if rest.dot(q) < 0:
                    q.negate()
                q = rest.slerp(q, weight)
            if scheme is None:
                e = q.to_matrix().to_euler("ZYX")  # three applies Rx·Ry·Rz
                pose = {"rot": (e.x, e.y, e.z)}
            else:
                pose = {"quat": (q.w, q.x, q.y, q.z)}
            if bone == moving:
                pose["loc"] = (location.x, location.y, location.z)
            keys[bone].append((u * end_frame, pose))
    c.add_clip(rig, name, end_frame, keys)
    return travelled


def _ramp(x, span):
    """0..1 over the first span of the clip; 1 when there is no blend."""
    return 1.0 if span <= 0 else _smooth(x / span)
