"""Render key frames of hero clips into one contact sheet (ADR 0010).

One row per clip, seven frames across it, an orthographic side view that
covers the dash toward the Training Dummy (-Y in Blender). Workbench
engine, flat colors per painted region, and the baked ink hulls removed:
the sheet is for judging poses, not the look. It changes only the open
session; nothing is saved.
"""

import os

import bmesh
import bpy
import numpy as np

SHOWN = ("BodyBoy", "GarmentGi", "Hair_spiky_short")
SAMPLES = (0.0, 0.2, 0.4, 0.55, 0.7, 0.85, 1.0)
TILE_W, TILE_H = 300, 360
REGION_COLORS = {
    "Outfit": (0.23, 0.44, 0.85, 1.0),
    "Skin": (0.95, 0.75, 0.6, 1.0),
    "Trim": (1.0, 0.62, 0.11, 1.0),
    "Hair": (0.15, 0.15, 0.18, 1.0),
}


def _drop_ink(obj):
    ink = {i for i, slot in enumerate(obj.material_slots) if slot.material and "Ink" in slot.material.name}
    if not ink:
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in ink], context="FACES")
    bm.to_mesh(obj.data)
    bm.free()


def _prepare(scene):
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        shown = obj.name.startswith(SHOWN)
        obj.hide_render = not shown
        if shown:
            _drop_ink(obj)
    for mat in bpy.data.materials:
        for key, color in REGION_COLORS.items():
            if key in mat.name:
                mat.diffuse_color = color
    cam = bpy.data.objects.new("SheetCam", bpy.data.cameras.new("SheetCam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 7.4
    cam.location = (10.0, -1.3, 1.5)
    cam.rotation_euler = (1.5708, 0.0, 1.5708)  # look along -X
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_cavity = True
    shading.show_object_outline = True
    shading.show_backface_culling = True
    scene.render.resolution_x = TILE_W
    scene.render.resolution_y = TILE_H
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def play(rig, action):
    """Make action the one the rig plays (Blender 5 actions have slots)."""
    rig.animation_data_create()
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]


def render(rig, actions, out):
    """One row per action, top to bottom, into the PNG at out."""
    scene = bpy.context.scene
    _prepare(scene)
    tiles = os.path.join(os.path.dirname(out), "_tiles")
    os.makedirs(tiles, exist_ok=True)
    rows = len(actions)
    sheet = np.ones((TILE_H * rows, TILE_W * len(SAMPLES), 4), dtype=np.float32)
    for row, action in enumerate(actions):
        play(rig, action)
        start, end = action.frame_range
        y0 = (rows - 1 - row) * TILE_H  # Blender images store the bottom row first
        for col, t in enumerate(SAMPLES):
            scene.frame_set(int(round(start + (end - start) * t)))
            path = os.path.join(tiles, f"{row}_{col}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE_H, TILE_W, 4)
            bpy.data.images.remove(img)
            sheet[y0 : y0 + TILE_H, col * TILE_W : (col + 1) * TILE_W] = px
            sheet[y0 : y0 + TILE_H, col * TILE_W, :3] = 0.6
        sheet[y0, :, :3] = 0.6
    img = bpy.data.images.new("sheet", TILE_W * len(SAMPLES), TILE_H * rows, alpha=True)
    img.pixels = sheet.ravel()
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
