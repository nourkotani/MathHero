"""The Rival's body (ADR 0011, ADR 0012): the Tripo fighter, fitted to the game.

The sources are in sources/tripo/fighter/, made by `npm run tripo`: Idle.glb
carries the model (the chosen candidate decimated to 100k faces, rigged by
Tripo with its native biped skeleton) and the idle clip; each other file
carries one preset clip on the same skeleton, no geometry. The clip names
are the Rival director's (models.json "animations"), so the opponent
reacts to the same cues. Launch and Recover come from HY-Motion
(sources/hy-motion/clips.json; ADR 0010), retargeted onto the same
skeleton by mocap.py.

This script makes the game's version, and nothing is edited by hand:

- every clip moves onto the one armature, named for the director;
- the long presets play a window (WINDOWS): Idle loops 4 s of its 15 s,
  Taunt keeps 1.5 s of the swagger and settles into Idle's first pose;
- only the base-color texture stays, at game size, in a material named
  "Painted" (the game uses base color only; ADR 0011);
- a baked ink hull, like the scripted models, as wide on screen as the
  hero's once the React component scales the model to FIGHTER_HEIGHT.

The model keeps Tripo's size (about 1 m) and facing (+X); the component
scales and turns it.
"""

import json
import os

import bpy
from mathutils import Matrix

import common as c
import mocap

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, "sources", "tripo")
TEXTURE_SIZE = 2048
FIGHTER_HEIGHT = 2.6  # game units: src/renderer/constants.ts FIGHTER_HEIGHT
HERO_INK = 0.012  # hero.py INK_WIDTH, in game units

# The window of a preset clip the game plays, in seconds of the source.
#   loop:   the last seconds blend back to the first frame, so it loops.
#   settle: the last seconds blend to the stance (Idle's first frame), so
#           the cross-fade to Idle never pops.
#   pin:    the hips stay on Idle's spot; the swagger walks 2.5 m although
#           the retarget asked for it in place (tripo.mjs --animate-in-place).
WINDOWS = {
    "Idle": {"window": (0.0, 4.0), "loop": 0.5},
    "Taunt": {"window": (0.0, 1.5), "settle": 0.3, "pin": True},
}

# The Rival's HY-Motion clips: the director's name and the brief's.
HY_CLIPS = {"Launch": "launch", "Recover": "recover"}
PELVIS = mocap.TRIPO["bones"]["pelvis"]


def _objects():
    return set(bpy.context.scene.objects)


def _import(path):
    before = _objects()
    bpy.ops.import_scene.gltf(filepath=path)
    return _objects() - before


def _height(meshes):
    zs = [(m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices]
    return max(zs) - min(zs)


def _painted_only(mesh):
    """Keep the base-color texture, at game size, in a "Painted" material."""
    mat = next(m for m in mesh.data.materials if m is not None)
    mat.name = "Painted"
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    color = bsdf.inputs["Base Color"].links[0].from_node
    for name in ("Normal", "Metallic", "Roughness"):
        for link in list(bsdf.inputs[name].links):
            mat.node_tree.links.remove(link)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 1.0
    for node in list(nodes):
        if node.type in ("TEX_IMAGE", "NORMAL_MAP", "SEPARATE_COLOR", "SEPARATE_RGB") and node != color:
            nodes.remove(node)
    image = color.image
    if image.size[0] > TEXTURE_SIZE:
        image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    for other in list(bpy.data.images):
        if other != image and other.users == 0:
            bpy.data.images.remove(other)


def _ink_hull(mesh, rig, width):
    """The inverted hull, applied with the operator so vertex weights stay.

    common.add_ink_hull rebuilds the mesh, which drops the vertex groups; the
    scripted models get their hull before they are rigged, this one after.
    """
    armatures = [m for m in mesh.modifiers if m.type == "ARMATURE"]
    for mod in armatures:
        mesh.modifiers.remove(mod)
    mesh.data.materials.append(c.ink_material())
    bpy.context.view_layer.objects.active = mesh
    hull = mesh.modifiers.new("Ink", "SOLIDIFY")
    hull.thickness = width
    hull.offset = 1.0
    hull.use_flip_normals = True
    hull.use_rim = False
    hull.use_even_offset = False
    hull.material_offset = len(mesh.data.materials) - 1
    bpy.ops.object.modifier_apply(modifier=hull.name)
    skin = mesh.modifiers.new("Armature", "ARMATURE")
    skin.object = rig


def _play(rig, action):
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]


def _sample(rig, action, first, count):
    """The pose of every bone at count frames from the source frame first:
    [{bone: (location, quaternion, scale, pose matrix)}] as the action
    plays them, plus the pelvis bone's world position per frame."""
    scene = bpy.context.scene
    _play(rig, action)
    frames = []
    for i in range(count):
        f = first + i
        scene.frame_set(int(f), subframe=f - int(f))
        pose = {}
        for pb in rig.pose.bones:
            pose[pb.name] = (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy(), pb.matrix.copy())
        frames.append(pose)
    rig.animation_data.action = None
    return frames


def _blend(pose, target, weight):
    """Between two sampled poses: the rotation slerped, the rest lerped."""
    out = {}
    for bone, (loc, quat, scale, matrix) in pose.items():
        t_loc, t_quat, t_scale, _ = target[bone]
        if quat.dot(t_quat) < 0:
            t_quat = -t_quat
        out[bone] = (loc.lerp(t_loc, weight), quat.slerp(t_quat, weight), scale.lerp(t_scale, weight), matrix)
    return out


def _window(rig, action, spec, stance=None):
    """Replace a preset clip with the window of it the game plays."""
    start, end = spec["window"]
    count = int(round((end - start) * c.FPS)) + 1
    frames = _sample(rig, action, action.frame_range[0] + start * c.FPS, count)
    if spec.get("pin"):
        # Hold the pelvis where Idle keeps it: take its horizontal travel
        # out of its location, in the bone's own frame (its pose matrix
        # without its own basis).
        home = (stance or frames[0])[PELVIS][3].to_translation()
        for pose in frames:
            loc, quat, scale, matrix = pose[PELVIS]
            gone = matrix.to_translation() - home
            gone.z = 0.0
            chain = matrix @ Matrix.LocRotScale(loc, quat, scale).inverted()
            pose[PELVIS] = (loc - chain.to_3x3().inverted() @ gone, quat, scale, matrix)
    tail = spec.get("loop") or spec.get("settle") or 0.0
    target = frames[0] if "loop" in spec else stance
    if tail:
        span = tail * c.FPS
        for i in range(count):
            over = i - (count - 1 - span)
            if over > 0:
                frames[i] = _blend(frames[i], target, mocap._smooth(over / span))
    name = action.name
    keys = {bone: [] for bone in frames[0]}
    for i, pose in enumerate(frames):
        for bone, (loc, quat, scale, _) in pose.items():
            keys[bone].append((i, {"loc": tuple(loc), "quat": tuple(quat), "scale": tuple(scale)}))
    bpy.data.actions.remove(action)
    c.add_clip(rig, name, count - 1, keys)


def _idle_start(rig):
    """Idle's first frame, sampled: the pose the Rival rests in."""
    rig.animation_data_create()
    idle = bpy.data.actions["Idle"]
    return _sample(rig, idle, idle.frame_range[0], 1)[0]


def stance(rig):
    """The pose every HY-Motion clip blends in from and out to: Idle's first
    frame, as {bone: {"quat", "loc"}} in each bone's own rest frame."""
    return {bone: {"quat": quat, "loc": loc} for bone, (loc, quat, _, _) in _idle_start(rig).items()}


def _clips(rig, brief):
    """Every clip onto the one armature, named for the director, each on its
    own muted NLA track (how the scripted clips export; common.add_clip)."""
    rig.animation_data_create()
    # The importer already put the base clip on an NLA track; a second
    # track would export every Idle channel twice.
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    settle = None  # Idle's first frame, once Idle is in
    for clip, info in brief["clips"].items():
        path = os.path.join(SOURCES, info["file"])
        if info.get("geometry"):
            action = rig.animation_data.action
        else:
            added = _import(path)
            other = next(o for o in added if o.type == "ARMATURE")
            action = other.animation_data.action
            for obj in added:
                bpy.data.objects.remove(obj, do_unlink=True)
        action.name = clip
        action.use_fake_user = True
        if clip in WINDOWS:
            _window(rig, action, WINDOWS[clip], settle)
            if clip == "Idle":
                settle = _idle_start(rig)
            continue
        _play(rig, action)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        track.strips.new(clip, int(action.frame_range[0]), action)
        track.mute = True
    rig.animation_data.action = None
    rest = stance(rig)
    for clip, name in HY_CLIPS.items():
        mocap.hy_clip(rig, clip, name, rest, mocap.TRIPO)


def build():
    with open(os.path.join(SOURCES, "models.json"), encoding="utf-8") as f:
        brief = json.load(f)["models"]["fighter"]
    base = next(info for info in brief["clips"].values() if info.get("geometry"))
    added = _import(os.path.join(SOURCES, base["file"]))
    rig = next(o for o in added if o.type == "ARMATURE")
    # The importer also adds an "Icosphere", its display shape for bones:
    # only the meshes the rig carries are the fighter.
    meshes = [o for o in added if o.type == "MESH" and o.parent == rig]
    for obj in added - {rig, *meshes}:
        bpy.data.objects.remove(obj, do_unlink=True)
    width = HERO_INK * _height(meshes) / FIGHTER_HEIGHT
    for mesh in meshes:
        mesh.name = mesh.data.name = "Fighter"  # Tripo names it by task id
        _painted_only(mesh)
        _ink_hull(mesh, rig, width)
    _clips(rig, brief)
    rig.name = "FighterRig"
    return rig
