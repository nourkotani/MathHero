"""Score HY-Motion candidates on the hero rig and render the best (ADR 0010).

blender --background build/models/hero.blend --python scripts/blender/motion_score.py -- <clip> <out_dir> <id>=<file.npz> ...

Each candidate is retargeted with its clip's brief (sources/hy-motion/
clips.json), exactly as the bake will do it, then measured on the hero's
own bones. The brief's "score" weighs the measures (see term). Writes
<out_dir>/scores.json (best first) and <out_dir>/sheet.png (the best
candidates, one row each, best on top). Run by scripts/motion.mjs.

The measures, in the hero's space (it faces the Dummy along Blender -Y):
  reach    furthest a fist or boot gets toward the Dummy (m)
  back     furthest the root goes backward (m)
  profile  mean turn of the torso away from the side view (rad)
  hunch    most the torso bends from upright, any way (rad)
  lean_back  most the torso leans back, away from the Dummy (rad)
  lean_fwd   most the torso bends forward, toward the Dummy (rad)
  air      highest the root rises (m)
  drift    how far the root had to be eased back home (m)
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
import hero  # noqa: E402
import mocap  # noqa: E402

FORWARD = Vector((0.0, -1.0, 0.0))
UP = Vector((0.0, 0.0, 1.0))
# Fist and boot centres in their bone's space (as src/renderer/index.ts).
STRIKE = {
    "elbowL": (0.0, -0.46, 0.02),
    "elbowR": (0.0, -0.46, 0.02),
    "kneeL": (0.0, -0.32, 0.07),
    "kneeR": (0.0, -0.32, 0.07),
}
SHEET_ROWS = 4


def measure(rig, action, drift):
    contact_sheet.play(rig, action)
    scene = bpy.context.scene
    world = rig.matrix_world
    start, end = (int(v) for v in action.frame_range)
    reach = back = air = hunch = turn = travel = lean_back = lean_fwd = 0.0
    last = None
    for f in range(start, end + 1):
        scene.frame_set(f)
        bones = rig.pose.bones
        root = world @ bones["root"].head
        back = max(back, -root.dot(FORWARD))
        air = max(air, root.z)
        # An upright bone's local +Y is up and its local +Z is the hero's
        # forward (common.add_rig).
        torso = world.to_3x3() @ bones["torso"].matrix.to_3x3()
        ahead = torso @ Vector((0.0, 0.0, 1.0))
        turn += abs(math.atan2(ahead.x, -ahead.y))
        up = torso @ Vector((0.0, 1.0, 0.0))
        hunch = max(hunch, up.angle(UP))
        lean = math.atan2(up.dot(FORWARD), up.z)  # + toward the Dummy
        lean_fwd = max(lean_fwd, lean)
        lean_back = max(lean_back, -lean)
        points = [world @ (bones[b].matrix @ Vector(off)) for b, off in STRIKE.items()]
        reach = max(reach, max(p.dot(FORWARD) for p in points))
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
        "air": air,
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
    clip, out_dir, specs = argv[0], argv[1], argv[2:]
    brief = mocap.hy_clips()[clip]
    rig = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    stance = hero.stance()
    results = []
    for spec in specs:
        cid, path = spec.split("=", 1)
        name = f"candidate_{cid}"
        drift = mocap.smplh_clip(rig, name, path, brief["window"], brief["length"], stance)
        metrics = measure(rig, bpy.data.actions[name], drift)
        score = sum(term(metrics[k], rule) for k, rule in brief["score"].items())
        results.append({"id": cid, "file": os.path.basename(path), "score": score, "metrics": metrics})
    results.sort(key=lambda r: r["score"], reverse=True)
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "scores.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    best = [bpy.data.actions[f"candidate_{r['id']}"] for r in results[:SHEET_ROWS]]
    contact_sheet.render(rig, best, os.path.join(out_dir, "sheet.png"))
    print(f"scored {len(results)} candidates for {clip}")


main()
