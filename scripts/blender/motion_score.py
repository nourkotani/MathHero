"""Score HY-Motion candidates on a game rig and render the best (ADR 0010).

blender --background build/models/<target>.blend --python scripts/blender/motion_score.py -- <target> <clip> <out_dir> <id>=<file.npz> ...

target: "hero" (hero.py) or "fighter" (fighter.py, the Rival's body).
Each candidate is retargeted with its clip's brief (sources/hy-motion/
clips.json), exactly as the bake will do it, then measured on the rig's
own bones. The brief's "score" weighs the measures (see term). Writes
<out_dir>/scores.json (best first) and <out_dir>/sheet.png (the best
candidates, one row each, best on top). Run by scripts/motion.mjs.

The measures, in the rig's space (the hero faces the Rival along Blender
-Y; the fighter faces +X):
  reach    furthest a fist or boot gets forward (m)
  back     furthest the pelvis goes backward from its rest (m)
  profile  mean turn of the chest away from the side view, either way (rad)
  hunch    most the chest bends from upright, any way (rad)
  lean_back  most the chest leans back (rad)
  lean_fwd   most the chest bends forward (rad)
  fist_high  most a fist rises above the head pivot (m)
  air      highest the pelvis rises above its rest (m)
  crouch   lowest the pelvis sinks below its rest (m)
  drift    how far the root had to be eased or pinned home (m)
  motion   mean speed of the fists and boots (m/s)
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common as c  # noqa: E402
import contact_sheet  # noqa: E402
import fighter  # noqa: E402
import hero  # noqa: E402
import mocap  # noqa: E402

UP = Vector((0.0, 0.0, 1.0))
SHEET_ROWS = 4

# Per target: the way it faces, the bones the measures read (strike: the
# fist and boot centres in their bone's space; the fists first), the
# retarget scheme, the stance the clips blend from, and the sheet's view.
TARGETS = {
    "hero": {
        "forward": (0.0, -1.0, 0.0),
        "pelvis": "Hip",
        "chest": "torso",
        "head": "head",
        # As the bake writes them for src/renderer (hero-rig.json).
        "strike": hero.strike_offsets,
        "scheme": hero.SCHEME,
        "stance": hero.stance,
        "sheet": contact_sheet.HERO,
    },
    "fighter": {
        "forward": (1.0, 0.0, 0.0),
        "pelvis": "Hip",
        "chest": "Spine02",
        "head": "Head",
        "strike": {
            "L_Hand": (0.0, 0.06, 0.0),
            "R_Hand": (0.0, 0.06, 0.0),
            "L_ToeBase": (0.0, 0.0, 0.0),
            "R_ToeBase": (0.0, 0.0, 0.0),
        },
        "scheme": mocap.TRIPO,
        "stance": fighter.stance,
        "sheet": contact_sheet.FIGHTER,
    },
}


def measure(rig, action, drift, target):
    contact_sheet.play(rig, action)
    scene = bpy.context.scene
    world = rig.matrix_world
    forward = Vector(target["forward"])
    side = UP.cross(forward)
    data = rig.data.bones
    pelvis_rest = world @ data[target["pelvis"]].head_local
    # The chest's up and forward in its own rest frame: for an upright hero
    # bone, local +Y and +Z (common.add_rig).
    chest_rest = world.to_3x3() @ data[target["chest"]].matrix_local.to_3x3()
    up_local = chest_rest.inverted() @ UP
    forward_local = chest_rest.inverted() @ forward
    start, end = (int(v) for v in action.frame_range)
    reach = back = air = crouch = hunch = turn = travel = lean_back = lean_fwd = 0.0
    fist_high = -math.inf
    last = None
    for f in range(start, end + 1):
        scene.frame_set(f)
        bones = rig.pose.bones
        pelvis = world @ bones[target["pelvis"]].head - pelvis_rest
        back = max(back, -pelvis.dot(forward))
        air = max(air, pelvis.z)
        crouch = max(crouch, -pelvis.z)
        chest = world.to_3x3() @ bones[target["chest"]].matrix.to_3x3()
        ahead = chest @ forward_local
        turn += abs(math.atan2(ahead.dot(side), ahead.dot(forward)))
        up = chest @ up_local
        hunch = max(hunch, up.angle(UP))
        lean = math.atan2(up.dot(forward), up.z)  # + forward
        lean_fwd = max(lean_fwd, lean)
        lean_back = max(lean_back, -lean)
        points = [world @ (bones[b].matrix @ Vector(off)) for b, off in target["strike"].items()]
        head = world @ bones[target["head"]].head
        fist_high = max(fist_high, max(p.z for p in points[:2]) - head.z)  # the fists
        reach = max(reach, max(p.dot(forward) for p in points))
        if last is not None:
            travel += sum((p - q).length for p, q in zip(points, last)) / len(points)
        last = points
    frames = end - start + 1
    return {
        "reach": reach,
        "back": back,
        "profile": turn / frames,
        "hunch": hunch,
        "lean_back": lean_back,
        "lean_fwd": lean_fwd,
        "fist_high": fist_high,
        "air": air,
        "crouch": crouch,
        "drift": drift,
        "motion": travel * c.FPS / max(1, frames - 1),
    }


def term(value, rule):
    """One part of a score. A number weighs the measure (more is better
    when positive); {"target": t, "weight": w} rewards being close to t."""
    if isinstance(rule, dict):
        return -rule["weight"] * abs(value - rule["target"])
    return rule * value


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    target, clip, out_dir, specs = TARGETS[argv[0]], argv[1], argv[2], argv[3:]
    brief = mocap.hy_clips()[clip]
    # The hero's model holds two rigs (hero.py); the boy's is the root one.
    rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE" and o.parent is None)
    if callable(target["strike"]):
        target["strike"] = target["strike"](rig)
    stance = target["stance"](rig)
    results = []
    for spec in specs:
        cid, path = spec.split("=", 1)
        name = f"candidate_{cid}"
        drift = mocap.smplh_clip(rig, name, path, brief, stance, target["scheme"])
        metrics = measure(rig, bpy.data.actions[name], drift, target)
        score = sum(term(metrics[k], rule) for k, rule in brief["score"].items())
        results.append({"id": cid, "file": os.path.basename(path), "score": score, "metrics": metrics})
    results.sort(key=lambda r: r["score"], reverse=True)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "scores.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    best = [bpy.data.actions[f"candidate_{r['id']}"] for r in results[:SHEET_ROWS]]
    contact_sheet.render(rig, best, os.path.join(out_dir, "sheet.png"), target["sheet"])
    print(f"scored {len(results)} candidates for {clip} on the {argv[0]}")


main()
