"""Clips from a text-to-motion model, retargeted onto the hero rig (ADR 0010).

The source is an SMPL-H motion from HY-Motion 1.0 (scripts/blender/sources/
hy-motion/, with the prompt and seed of each file in manifest.json): 52
joints of local axis-angle rotations (`poses`, F x 156; only joints 0-21
move), a root translation in meters (`trans`), Y-up, facing +Z, 30 fps.
SMPL's rest pose is a T-pose, arms along +/-X.

The hero's rig (hero.py) rests upright with identity rotations in three.js
hero space (Y-up, facing +Z), arms hanging down. Both spaces are the same,
so the retarget matches each hero bone to the SMPL segment on the same
side and corrects only the arms' rest direction. Keys go through
common.add_clip like every other clip, then the post steps fit the motion
to the game: a window of the source, time-scaled to the clip's length,
the root eased back home, and blends in from and out to the stance.
"""

import math
import os

import numpy as np
from mathutils import Matrix, Vector

import common as c

SOURCES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources")
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


def _retarget(poses, trans):
    """Per source frame: {bone: local rotation matrix} and the root location."""
    first = _axis_angle(poses[0, PELVIS])
    yaw = Matrix.Rotation(-_heading(first), 3, "Y")  # face +Z at the start
    start = Vector((float(trans[0, 0]), 0.0, float(trans[0, 2])))  # start in place
    scale = HERO_HIP / SOURCE_HIP
    frames = []
    for f in range(len(poses)):
        g = []
        for j in range(22):
            local = _axis_angle(poses[f, j])
            g.append(yaw @ local if PARENTS[j] < 0 else g[PARENTS[j]] @ local)
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
        location = pelvis * scale - root @ Vector((0.0, HERO_HIP, 0.0))
        frames.append((rotations, location))
    return frames


def smplh_clip(rig, name, source, window, length, stance, blend_in=0.1, blend_out=0.3):
    """Add one clip from an SMPL-H source file.

    source: a file in sources/, e.g. "hy-motion/stagger.npz".
    window: (start, end) seconds of the source to keep.
    length: seconds the clip plays; the window is time-scaled to fit.
    stance: {bone: three.js Euler} the pose the clip blends in from and out to.
    blend_in, blend_out: fractions of the clip spent blending.
    """
    data = np.load(os.path.join(SOURCES, source))
    poses = data["poses"].reshape(len(data["poses"]), -1, 3)[:, :22].astype(np.float64)
    trans = data["trans"].astype(np.float64)
    first = int(round(window[0] * SOURCE_FPS))
    last = min(len(poses) - 1, int(round(window[1] * SOURCE_FPS)))
    frames = _retarget(poses[first : last + 1], trans[first : last + 1])

    # The root eases back to where it started, so Idle takes over in place.
    drift = frames[-1][1].copy()
    count = len(frames)
    stance_q = {bone: c.three_rotation(*rot) for bone, rot in stance.items()}
    keys = {bone: [] for bone in frames[0][0]}
    end_frame = length * c.FPS
    for i, (rotations, location) in enumerate(frames):
        u = i / (count - 1)
        weight = min(_smooth(u / blend_in), _smooth((1.0 - u) / blend_out))
        location = (location - drift * _smooth(u)) * weight
        for bone, m in rotations.items():
            q = m.to_quaternion()
            rest = stance_q.get(bone)
            if rest is not None:
                if rest.dot(q) < 0:
                    q.negate()
                q = rest.slerp(q, weight)
            e = q.to_matrix().to_euler("ZYX")  # three applies Rx·Ry·Rz
            pose = {"rot": (e.x, e.y, e.z)}
            if bone == "root":
                pose["loc"] = (location.x, location.y, location.z)
            keys[bone].append((u * end_frame, pose))
    c.add_clip(rig, name, end_frame, keys)
