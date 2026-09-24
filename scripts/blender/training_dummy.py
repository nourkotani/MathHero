"""The Training Dummy (ADR 0007): a chunky arcade sparring bot.

An original design: a weighted base, a coil spring that says "I bounce", a
padded barrel torso with a target on the chest, stubby padded arms, and a
stitched sack head with button eyes and a cheeky grin. It faces the hero,
toward -X. Height is about 2.9 units, with its origin on the floor.
"""

import math

from mathutils import Vector

import common as c

# Linear RGB palette.
STEEL = (0.055, 0.07, 0.11)
STEEL_LIGHT = (0.13, 0.15, 0.2)
BRASS = (0.62, 0.38, 0.1)
PADDING = (0.62, 0.1, 0.05)
PADDING_DARK = (0.34, 0.045, 0.03)
CANVAS = (0.72, 0.58, 0.4)
STITCH = (0.9, 0.82, 0.62)
TARGET_WHITE = (0.85, 0.83, 0.78)
TARGET_RED = (0.7, 0.06, 0.04)
BUTTON = (0.02, 0.02, 0.03)
TAPE = (0.58, 0.5, 0.36)

INK_WIDTH = 0.02
SCALE = 0.88


def build():
    m = {
        "steel": c.paint_material("Steel", STEEL, edge=0.9, crevice=0.35, top=0.3),
        "steel_light": c.paint_material("SteelLight", STEEL_LIGHT, edge=0.7, crevice=0.3),
        "brass": c.paint_material("Brass", BRASS, edge=0.5, crevice=0.5, top=0.3),
        "padding": c.paint_material("Padding", PADDING, grain=0.1, crevice=0.55, top=0.28),
        "padding_dark": c.paint_material("PaddingDark", PADDING_DARK, crevice=0.4),
        "canvas": c.paint_material("Canvas", CANVAS, grain=0.14, crevice=0.5, top=0.25, stroke_scale=9.0),
        "stitch": c.paint_material("Stitch", STITCH, grain=0.05, crevice=0.2),
        "target_white": c.paint_material("TargetWhite", TARGET_WHITE, grain=0.06, crevice=0.25),
        "target_red": c.paint_material("TargetRed", TARGET_RED, grain=0.06, crevice=0.25),
        "button": c.paint_material("Button", BUTTON, edge=1.5, crevice=0.1),
        "tape": c.paint_material("Tape", TAPE, grain=0.1, crevice=0.4),
    }
    parts = []

    def part(obj, material):
        parts.append(c.assign(obj, m[material]))
        return obj

    # --- weighted base: a heavy two-tier disc with bolts
    part(c.cylinder("Base", 0.78, 0.26, 0.0, segments=40, bevel=0.06, radius_top=0.72), "steel")
    part(c.cylinder("BaseTier", 0.46, 0.14, 0.26, segments=32, bevel=0.035, radius_top=0.4), "steel_light")
    for i in range(8):
        a = 2 * math.pi * (i + 0.5) / 8
        part(
            c.cylinder("Bolt", 0.06, 0.05, 0.25, segments=12, x=0.6 * math.cos(a), y=0.6 * math.sin(a), bevel=0.015),
            "brass",
        )

    # --- the spring: a fat coil around a short steel stem
    part(c.cylinder("Stem", 0.12, 1.0, 0.36, segments=20), "steel")
    part(c.helix("Spring", 0.24, 0.055, 4.5, 0.78, 0.44), "brass")
    part(c.cylinder("SpringCap", 0.32, 0.1, 1.2, segments=32, bevel=0.03), "steel_light")

    # --- padded barrel torso
    torso = c.sphere("Torso", 0.6, (0.0, 0.0, 1.9), scale=(0.92, 1.0, 1.08), segments=40, rings=20)
    part(torso, "padding")
    # Quilted bands: darker padding rolls with stitch lines on top.
    for z, scale in ((1.5, 0.86), (1.9, 1.0), (2.28, 0.84)):
        r = 0.6 * scale
        part(c.torus("Band", r * 0.98, 0.05, (0.0, 0.0, z), scale=(0.93, 1.0, 1.0)), "padding_dark")
        part(c.torus("Stitches", r * 1.03, 0.012, (0.0, 0.0, z), scale=(0.93, 1.0, 1.0), sides=6), "stitch")

    # Target on the chest, facing the hero (-X).
    chest = (-0.55, 0.0, 1.72)
    rot = (0.0, math.pi / 2, 0.0)
    part(c.torus("TargetRing", 0.24, 0.045, chest, rotation=rot), "target_red")
    part(c.torus("TargetRingInner", 0.13, 0.04, (chest[0] - 0.02, 0.0, chest[2]), rotation=rot), "target_white")
    part(c.sphere("Bullseye", 0.075, (chest[0] - 0.03, 0.0, chest[2]), scale=(0.6, 1.0, 1.0)), "target_red")

    # --- stubby padded arms, angled down like a guard that never blocks
    for side in (-1, 1):
        shoulder = (0.0, side * 0.52, 2.12)
        fist = (-0.12, side * 0.95, 1.72)
        part(c.capsule("Arm", 0.17, shoulder, fist), "padding")
        part(c.sphere("Mitt", 0.21, fist, scale=(1.0, 0.9, 0.95)), "padding_dark")
        wrap_at = tuple(s + (f - s) * 0.55 for s, f in zip(shoulder, fist))
        along_arm = (Vector(fist) - Vector(shoulder)).to_track_quat("Z", "Y").to_euler()
        part(c.torus("ArmWrap", 0.175, 0.035, wrap_at, rotation=tuple(along_arm)), "tape")

    # --- neck and the stitched sack head
    part(c.cylinder("Neck", 0.17, 0.2, 2.44, segments=20), "steel_light")
    head_z = 2.8
    part(c.sphere("Head", 0.4, (0.0, 0.0, head_z), scale=(0.95, 1.0, 0.92), segments=36, rings=18), "canvas")
    # A seam over the crown, from ear to ear (clear of the face).
    part(c.torus("HeadSeam", 0.39, 0.014, (0.02, 0.0, head_z), rotation=(0.0, math.pi / 2, 0.0), sides=6), "stitch")

    # Button eyes on the hero side, each with two thread holes.
    for side in (-1, 1):
        eye = c.cylinder("Eye", 0.075, 0.04, 0.0, segments=20, bevel=0.012)
        eye.rotation_euler = (0.0, -math.pi / 2, 0.0)
        eye.location = (-0.345, side * 0.14, head_z + 0.07)
        c.apply_transform(eye)
        part(eye, "button")
        for hole in (-1, 1):
            part(c.sphere("Thread", 0.013, (-0.39, side * 0.14 + hole * 0.022, head_z + 0.07)), "stitch")

    # A stitched smile: a dark thread line with crossing stitches.
    def smile(t):
        return (-0.37 + 0.035 * t * t, t * 0.16, head_z - 0.12 + 0.06 * t * t)

    steps = 8
    for i in range(steps):
        a, b = smile(-1 + 2 * i / steps), smile(-1 + 2 * (i + 1) / steps)
        part(c.capsule("Smile", 0.016, a, b, segments=10), "button")
    for i in range(5):
        x, y, z = smile(-0.8 + 0.4 * i)
        part(c.capsule("SmileStitch", 0.011, (x, y, z - 0.035), (x, y, z + 0.035), segments=8), "stitch")

    dummy = c.join("TrainingDummy", parts)
    # Built at a comfortable working size; scaled to stand as tall as the hero.
    dummy.scale = (SCALE, SCALE, SCALE)
    c.apply_transform(dummy)
    c.bake_painted(dummy)
    c.add_ink_hull(dummy, INK_WIDTH)
    return dummy
