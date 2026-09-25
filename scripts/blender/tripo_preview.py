"""Render Tripo candidates from four sides into one sheet (ADR 0011).

blender --background --factory-startup --python scripts/blender/tripo_preview.py -- <out.png> [--regions] <id>=<model.glb> ...

One row per candidate: front, right, back, left. Tripo exports a model
facing +X (glTF), which is +X in Blender too, so the front camera stands
on +X. Workbench engine with the base-color texture, studio light, and
cavity: the sheet judges shape and paint, not the game's look. Prints one
CANDIDATE line per model with its face count and size.

--regions shows the tint regions of a hero body in false color (regions.py,
ADR 0012): skin red, outfit gray, trim blue. A wrong face shows at once.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import regions  # noqa: E402

TILE_W, TILE_H = 320, 440
VIEWS = (("front", 0.0), ("right", 90.0), ("back", 180.0), ("left", 270.0))


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    faces = 0
    for obj in meshes:
        faces += len(obj.data.polygons)
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return faces, lo, hi


def show_regions():
    """Paint every mesh by region; return one REGIONS line per mesh."""
    lines = []
    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        labels = regions.classify(obj)
        regions.show_false_color(obj, labels)
        lines.append(f"{obj.name} {regions.histogram(labels)}")
    return lines


def setup(scene, lo, hi, false_color=False):
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL" if false_color else "TEXTURE"
    shading.show_cavity = True
    scene.render.resolution_x = TILE_W
    scene.render.resolution_y = TILE_H
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    cam.data.type = "ORTHO"
    size = hi - lo
    cam.data.ortho_scale = max(size.z, size.x, size.y) * 1.1
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam, (lo + hi) / 2, max(size) * 3


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    false_color = "--regions" in argv
    argv = [a for a in argv if a != "--regions"]
    out, specs = argv[0], argv[1:]
    tiles = os.path.join(os.path.dirname(out), "_tiles")
    os.makedirs(tiles, exist_ok=True)
    rows = len(specs)
    sheet = np.ones((TILE_H * rows, TILE_W * len(VIEWS), 4), dtype=np.float32)
    for row, spec in enumerate(specs):
        cid, path = spec.split("=", 1)
        faces, lo, hi = load(path)
        scene = bpy.context.scene
        cam, centre, distance = setup(scene, lo, hi, false_color)
        size = hi - lo
        print(f"CANDIDATE {cid}: {faces} faces, {size.x:.2f} x {size.y:.2f} x {size.z:.2f} (x y z)")
        if false_color:
            for line in show_regions():
                print(f"REGIONS {cid}: {line}")
        y0 = (rows - 1 - row) * TILE_H  # Blender images store the bottom row first
        for col, (_, azimuth) in enumerate(VIEWS):
            a = math.radians(azimuth)
            cam.location = centre + Vector((math.cos(a), math.sin(a), 0.0)) * distance
            cam.rotation_euler = (math.pi / 2, 0.0, a + math.pi / 2)
            tile = os.path.join(tiles, f"{row}_{col}.png")
            scene.render.filepath = tile
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tile)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE_H, TILE_W, 4)
            bpy.data.images.remove(img)
            sheet[y0 : y0 + TILE_H, col * TILE_W : (col + 1) * TILE_W] = px
            sheet[y0 : y0 + TILE_H, col * TILE_W, :3] = 0.6
        sheet[y0, :, :3] = 0.6
    img = bpy.data.images.new("sheet", TILE_W * len(VIEWS), TILE_H * rows, alpha=True)
    img.pixels = sheet.ravel()
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()


main()
