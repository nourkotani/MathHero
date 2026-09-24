"""The hero (ADR 0007, ADR 0008): two bodies (girl and boy) and three
garments on one shared rig, with heroic-teen arcade proportions — a big
head, big fists, and big boots.

Authored in three.js hero space (Y up, facing +Z), through
common.three_point, so every number here matches the renderer's joints.
The rig's bones stand upright, so after the Y-up export they have identity
rests in three.js hero axes and sit on the old joint pivots: the renderer's
poses drive them exactly as they drove the code-built joints.

The painted bake holds light and shade only for the tint regions: Skin,
Outfit, and Trim are painted near white, and the renderer tints each with
the Player's chosen color. The face decals and the hair stay in code for
now, on the head bone (ticket #50 replaces the hair).

Export: "HeroRig" with the skinned meshes BodyGirl, BodyBoy, GarmentGi,
GarmentCape, and GarmentArmor; the renderer shows one body and one garment.
"""

import common as c

P = c.three_point

# Near-white paint: the bake keeps only light and shade; the runtime tints.
SKIN = (0.86, 0.86, 0.86)
OUTFIT = (0.82, 0.82, 0.82)
TRIM = (0.86, 0.86, 0.86)


INK_WIDTH = 0.012

# Joint pivots, in three.js hero space (the old code joints).
SHOULDER_X = 0.52
HIP_X = 0.2
PIVOTS = {
    "root": (0.0, 0.0, 0.0, None),
    "torso": (0.0, 1.0, 0.0, "root"),
    "head": (0.0, 1.88, 0.0, "torso"),
    "armL": (-SHOULDER_X, 1.7, 0.0, "torso"),
    "elbowL": (-SHOULDER_X, 1.34, 0.0, "armL"),
    "armR": (SHOULDER_X, 1.7, 0.0, "torso"),
    "elbowR": (SHOULDER_X, 1.34, 0.0, "armR"),
    "legL": (-HIP_X, 0.88, 0.0, "root"),
    "kneeL": (-HIP_X, 0.44, 0.0, "legL"),
    "legR": (HIP_X, 0.88, 0.0, "root"),
    "kneeR": (HIP_X, 0.44, 0.0, "legR"),
}


def build():
    m = {
        "skin": c.paint_material("Skin", SKIN, grain=0.05, edge=0.12, crevice=0.35, top=0.12, stroke_scale=4.0),
        "outfit": c.paint_material("Outfit", OUTFIT, grain=0.14, edge=0.15, crevice=0.5, top=0.16, stroke_scale=7.0),
        "trim": c.paint_material("Trim", TRIM, grain=0.1, edge=0.2, crevice=0.45, top=0.16),
    }
    parts = []
    tag = {"part": None, "bone": None}

    def part(obj, material, bone):
        obj["bone"] = bone
        obj["part"] = tag["part"]
        parts.append(c.assign(obj, m[material]))
        return obj

    def at(x, y, z=0.0):
        return P(x, y, z)

    for girl in (True, False):
        tag["part"] = "BodyGirl" if girl else "BodyBoy"
        build_body(girl, part, at)
    for garment in ("Gi", "Cape", "Armor"):
        tag["part"] = f"Garment{garment}"
        build_garment(garment, part, at)


    hero = c.join("Hero", parts)
    c.bake_painted(hero, size=2048, regions={"Skin": "Skin", "Outfit": "Outfit", "Trim": "Trim"})
    c.add_ink_hull(hero, INK_WIDTH)

    names = ["BodyGirl", "BodyBoy", "GarmentGi", "GarmentCape", "GarmentArmor"]
    pieces = [c.split_group(hero, name, name, center=False) for name in names]
    c.remove(hero)
    for piece in pieces:
        for name in names:
            group = piece.vertex_groups.get(name)
            if group is not None:
                piece.vertex_groups.remove(group)

    bones = []
    for name, (x, y, z, parent) in PIVOTS.items():
        head = P(x, y, z)
        # Upright with zero roll: after the Y-up export every bone's axes are
        # three.js hero axes and every rest is identity (see add_rig).
        bones.append((name, head, (head[0], head[1], head[2] + 0.1), parent))
    rig = c.add_rig(pieces, bones, name="HeroRig", rotation="QUATERNION")
    add_clips(rig)
    return rig


def build_body(girl, part, at):
    """One body: the same joints, a girl's or a boy's shape."""
    # Pelvis and hips: the gi's trousers.
    part(c.sphere("Pelvis", 0.3, at(0, 0.92), scale=(1.22 if girl else 1.08, 0.85 if girl else 0.8, 0.58)), "outfit", "root")
    # The belt hugs the waist: an oval, flatter front to back.
    belt = c.cylinder("Belt", 0.4 if girl else 0.43, 0.15, 0.88)
    c.scale_about(belt, (1.0, 0.76, 1.0), at(0, 0.955))
    part(belt, "trim", "root")
    # The belt knot and its two tails, in front.
    front = 0.27 if girl else 0.31
    part(c.sphere("Knot", 0.085, at(0, 1.0, front), scale=(1.25, 0.72, 0.85)), "trim", "root")
    for side in (-1, 1):
        tail = c.rounded_box("Tail", (0.08, 0.03, 0.22), at(side * 0.075, 0.87, front - 0.02), 0.012, rotation=(0, -side * 0.18, 0))
        part(tail, "trim", "root")

    # Chest: a broad V for the boy, a narrower waist for the girl.
    chest = c.capsule("Chest", 0.36, at(0, 1.2), at(0, 1.55))
    c.scale_about(chest, (0.88, 0.74, 1.0) if girl else (1.12, 0.82, 1.0), at(0, 1.37))
    part(chest, "outfit", "torso")
    if girl:
        part(c.sphere("Contour", 0.24, at(0, 1.5, 0.15), scale=(1.15, 0.75, 0.7)), "outfit", "torso")
    part(c.cylinder("Neck", 0.105, 0.2, 1.58), "skin", "torso")

    # The head: the face decals and the hair ride this skull from code.
    part(c.sphere("Skull", 0.34, at(0, 2.04), segments=32, rings=20), "skin", "head")
    for side in (-1, 1):
        part(c.sphere("Ear", 0.07, at(side * 0.33, 2.03, -0.02), scale=(0.55, 1.0, 0.8)), "skin", "head")

    # Arms: shoulder, upper arm, forearm, wristband, and a big fist.
    for side, arm, elbow in ((-1, "armL", "elbowL"), (1, "armR", "elbowR")):
        x = side * SHOULDER_X
        part(c.sphere("Shoulder", 0.16, at(x, 1.69)), "outfit", arm)
        part(c.capsule("UpperArm", 0.13, at(x, 1.66), at(x, 1.4)), "outfit", arm)
        part(c.capsule("Forearm", 0.115, at(x, 1.33), at(x, 1.06)), "skin", elbow)
        part(c.cylinder("Wristband", 0.14, 0.13, 0.91, x=x), "trim", elbow)
        part(c.sphere("Fist", 0.175, at(x, 0.88, 0.02), scale=(1.0, 1.1, 0.95)), "skin", elbow)
        part(c.sphere("Thumb", 0.07, at(x - side * 0.1, 0.93, 0.1), scale=(0.9, 1.3, 1.0)), "skin", elbow)

    # Legs: thigh, shin, and big boots.
    for side, leg, knee in ((-1, "legL", "kneeL"), (1, "legR", "kneeR")):
        x = side * HIP_X
        part(c.capsule("Thigh", 0.17, at(x, 0.84), at(x, 0.5)), "outfit", leg)
        part(c.capsule("Shin", 0.145, at(x, 0.42), at(x, 0.2)), "outfit", knee)
        part(c.rounded_box("Boot", (0.34, 0.5, 0.26), at(x, 0.12, 0.07), 0.07), "trim", knee)
        part(c.cylinder("BootCuff", 0.18, 0.1, 0.19, x=x), "trim", knee)


def build_garment(garment, part, at):
    if garment == "Gi":
        # The crossed collar: two trim bands meeting in a V at the chest.
        for side in (-1, 1):
            lapel = c.rounded_box("Lapel", (0.27, 0.035, 0.06), at(side * 0.1, 1.56, 0.285), 0.012, rotation=(0, -side * 0.55, 0))
            part(lapel, "trim", "torso")
        part(c.rounded_box("Flap", (0.42, 0.05, 0.25), at(0, 0.83, 0.25), 0.02, rotation=(0.14, 0, 0)), "outfit", "root")
    elif garment == "Cape":
        part(c.rounded_box("Cape", (0.95, 0.05, 1.4), at(0, 1.05, -0.4), 0.02, rotation=(0.12, 0, 0)), "trim", "torso")
        part(c.rounded_box("Clasp", (0.7, 0.08, 0.1), at(0, 1.72, -0.28), 0.03), "trim", "torso")
    else:
        plate = c.capsule("Plate", 0.44, at(0, 1.2), at(0, 1.55))
        c.scale_about(plate, (1.1, 0.9, 0.85), at(0, 1.38))
        part(plate, "trim", "torso")
        for side, arm in ((-1, "armL"), (1, "armR")):
            part(c.sphere("Pauldron", 0.2, at(side * SHOULDER_X, 1.73), scale=(1.25, 1.1, 0.85)), "trim", arm)


# ---------------------------------------------------------------- clips
#
# Poses in three.js joint terms (the rotations reactions.ts writes), turned
# into quaternions by common.three_rotation. 24 frames a second.


def add_clips(rig):
    # The guard stance with breathing: left foot forward, knees soft, fists
    # raised. Matches the stance the renderer poses between actions.
    def arms(breath):
        return {
            "armL": (-0.55 + breath * 0.04, 0, 0.3),
            "armR": (-0.55 + breath * 0.04, 0, -0.3),
        }

    stance = {
        "elbowL": {"rot": (-1.55, 0, 0)},
        "elbowR": {"rot": (-1.55, 0, 0)},
        "legL": {"rot": (-0.22, 0, 0)},
        "legR": {"rot": (0.26, 0, 0)},
        "kneeL": {"rot": (0.38, 0, 0)},
        "kneeR": {"rot": (0.34, 0, 0)},
    }
    keys = {bone: [(f, pose) for f in (0, 12, 24, 36, 48)] for bone, pose in stance.items()}
    breath = {0: 0.0, 12: 1.0, 24: 0.0, 36: -1.0, 48: 0.0}
    look = {0: 0.0, 12: 0.05, 24: 0.0, 36: -0.05, 48: 0.0}
    keys["torso"] = [(f, {"rot": (0.06 + b * 0.02, 0, 0)}) for f, b in breath.items()]
    keys["head"] = [(f, {"rot": (-0.04, look[f], 0)}) for f in breath]
    keys["armL"] = [(f, {"rot": arms(b)["armL"]}) for f, b in breath.items()]
    keys["armR"] = [(f, {"rot": arms(b)["armR"]}) for f, b in breath.items()]
    c.add_clip(rig, "Idle", 48, keys)
