"""The arena (ADR 0007): a floating carved-stone platform above the dusk
wasteland, ringed by broken pillars and rock spires, with shards of rock
held in the air.

The platform top stands at z = 0.3, where the fighters stand; its rocky
underside hangs below it, over a ground that the renderer lowers. Light
stays in code: the sigil, the rim glow, and the crystal hearts of the
debris. The sky, the ridges, the clouds, and the ground stay as baked
textures in code too.

Export: an empty "Arena" with the static "Stage" mesh and six "DebrisN"
meshes, each with its origin at its center, so the renderer can bob them.
"""

import math

import bpy

import common as c

# Linear RGB palette: warm dusk stone, dark rock beneath.
STONE = (0.36, 0.3, 0.25)
STONE_DARK = (0.2, 0.16, 0.14)
STONE_PALE = (0.5, 0.44, 0.36)
RIM = (0.24, 0.19, 0.16)
UNDERSIDE = (0.1, 0.075, 0.08)
SPIRE = (0.2, 0.12, 0.08)

TOP = 0.3
# Tile rings: (inner radius, outer radius, tiles in the ring).
RINGS = [(0.0, 1.25, 1), (1.3, 2.75, 10), (2.8, 4.35, 16), (4.4, 5.75, 22), (5.8, 7.0, 28)]
TILE_DEPTH = 0.12
GROUND = -2.4  # where the renderer puts the wasteland floor

# Placement tables (angle in radians, distance), matched to the old arena.
PILLARS = [(0.9, 10.6, 2.6, 0.2), (2.3, 11.4, 1.7, -0.28), (4.1, 10.2, 3.1, 0.16), (5.5, 11.8, 2.2, -0.2)]
DEBRIS = [
    (2.7, 9.2, 0.42, 1.6),
    (3.4, 10.8, 0.3, 2.4),
    (4.6, 9.6, 0.5, 1.2),
    (5.9, 10.4, 0.34, 2.0),
    (0.35, 11.6, 0.26, 2.7),
    (3.9, 12.4, 0.44, 1.8),
]

INK_WIDTH = 0.03


def build():
    m = {
        "stone": c.paint_material("Stone", STONE, grain=0.16, edge=0.35, crevice=0.6, top=0.18, stroke_scale=3.0),
        "stone_dark": c.paint_material("StoneDark", STONE_DARK, grain=0.14, edge=0.3, crevice=0.5),
        "stone_pale": c.paint_material("StonePale", STONE_PALE, grain=0.14, edge=0.35, crevice=0.55, stroke_scale=4.0),
        "rim": c.paint_material("Rim", RIM, grain=0.12, edge=0.45, crevice=0.5),
        "underside": c.paint_material("Underside", UNDERSIDE, grain=0.2, edge=0.6, crevice=0.4, top=0.1, stroke_scale=2.0),
        "spire": c.paint_material("Spire", SPIRE, grain=0.2, edge=0.5, crevice=0.45, stroke_scale=2.5),
    }
    parts = []
    group = ["stage"]

    def part(obj, material):
        obj["bone"] = group[0]
        parts.append(c.assign(obj, m[material]))
        return obj

    # --- the carved top: rings of cut tiles with grooves between them
    base_z = TOP - TILE_DEPTH
    for ring, (r0, r1, count) in enumerate(RINGS):
        gap = 0.035 / max(r1, 0.1)
        for i in range(count):
            a0 = 2 * math.pi * i / count + (ring * 0.21) + (gap if count > 1 else 0)
            a1 = 2 * math.pi * (i + 1) / count + (ring * 0.21) - (gap if count > 1 else 0)
            steps = max(2, int(24 / count)) if count > 1 else 32
            tone = "stone" if (i + ring) % 3 else "stone_pale"
            part(c.wedge("Tile", r0 + (0.02 if r0 else 0), r1 - 0.02, a0, a1, base_z, TILE_DEPTH, 0.025, steps), tone)
    # The bed the tiles sit in, darker in the grooves.
    part(c.cylinder("Bed", 7.05, 0.1, base_z - 0.02, segments=64), "stone_dark")

    # --- the stepped rim band around the edge
    part(c.cylinder("RimBand", 7.25, 0.34, TOP - 0.42, segments=64, bevel=0.04, radius_top=7.18), "rim")
    part(c.cylinder("RimStep", 7.5, 0.22, TOP - 0.62, segments=64, bevel=0.04, radius_top=7.42), "rim")
    for i in range(24):
        a = 2 * math.pi * (i + 0.5) / 24
        block = c.rounded_box(
            "RimBlock", (0.18, 0.5, 0.2), (7.34 * math.cos(a), 7.34 * math.sin(a), TOP - 0.22), 0.03, rotation=(0, 0, a)
        )
        part(block, "stone_dark")

    # --- the rocky underside: a jagged inverted cone of dark rock
    underside = c.rock("Underside", 7.3, 3.2, (0, 0, 0), seed=11, sides=18, rings=6, rough=0.05, taper=0.12)
    underside.scale = (1.0, 1.0, -1.0)
    underside.location = (0, 0, TOP - 0.62)
    c.apply_transform(underside)
    # Flip the faces back outward after the mirror.
    underside.data.flip_normals()
    part(underside, "underside")

    # --- broken pillars on the wasteland floor, tall enough to rise past
    # the platform's edge
    for angle, distance, height, tilt in PILLARS:
        x, y = distance * math.cos(angle), distance * math.sin(angle)
        rise = height + (TOP - GROUND)
        part(c.rounded_box("Plinth", (1.3, 1.3, 0.4), (x, y, GROUND + 0.2), 0.06), "stone_dark")
        part(c.cylinder("Drum", 0.46, rise, GROUND + 0.4, segments=12, x=x, y=y, bevel=0.03, radius_top=0.4), "stone_pale")
        cap = c.cylinder("Cap", 0.5, 0.35, 0.0, segments=12, bevel=0.03, radius_top=0.44)
        cap.rotation_euler = (0, tilt, 0)
        cap.location = (x + 0.1, y, GROUND + 0.45 + rise)
        c.apply_transform(cap)
        part(cap, "stone_pale")

    # --- rock spires ringing the battlefield
    for i in range(9):
        angle = i / 9 * 2 * math.pi + 0.4
        distance = 13 + (i % 3) * 4
        height = 2.5 + ((i * 7) % 5) + (TOP - GROUND)
        radius = 1.1 + (i % 2) * 0.7
        spire = c.rock("Spire", radius, height, (distance * math.cos(angle), distance * math.sin(angle), GROUND), seed=40 + i)
        part(spire, "spire")

    # --- floating debris: each shard in its own group, split out after the bake
    for i, (angle, distance, size, height) in enumerate(DEBRIS):
        group[0] = f"debris{i}"
        shard = c.rock("Shard", size, size * 1.6, (0, 0, -size * 0.8), seed=70 + i, sides=6, rings=3, rough=0.18, taper=0.1)
        shard.location = (distance * math.cos(angle), distance * math.sin(angle), height)
        c.apply_transform(shard)
        part(shard, "spire")

    stage = c.join("Stage", parts)
    c.bake_painted(stage, size=2048)
    c.add_ink_hull(stage, INK_WIDTH)

    root = bpy.data.objects.new("Arena", None)
    bpy.context.scene.collection.objects.link(root)
    for i in range(len(DEBRIS)):
        piece = c.split_group(stage, f"debris{i}", f"Debris{i}")
        piece.parent = root
    stage.parent = root
    # The groups did their job; the renderer needs no skin weights here.
    for obj in [stage, *root.children]:
        obj.vertex_groups.clear()
    return root
