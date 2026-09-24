"""Bake every model from its script (ADR 0007). Run through `npm run bake:models`.

    blender --background --factory-startup --python scripts/blender/bake.py -- <out_dir>

For each model: build it from nothing, save a .blend for viewing (ignored by
git), and export a raw .glb into out_dir. scripts/bake-models.mjs then
compresses the raw .glb with meshopt into src/renderer/models/.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import common  # noqa: E402

# Model name -> the module whose build() makes it.
MODELS = {
    "training-dummy": "training_dummy",
    "arena": "arena",
}


def bake(out_dir, only=None):
    os.makedirs(out_dir, exist_ok=True)
    for name, module_name in MODELS.items():
        if only and name not in only:
            continue
        importlib.reload(common)
        module = importlib.reload(importlib.import_module(module_name))
        common.reset_scene()
        obj = module.build()
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, f"{name}.blend"), check_existing=False)
        common.export_glb(obj, os.path.join(out_dir, f"{name}.raw.glb"))
        print(f"baked {name}")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("usage: bake.py -- <out_dir> [model ...]")
    bake(argv[0], argv[1:])
