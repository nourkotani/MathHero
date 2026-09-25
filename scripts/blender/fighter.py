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
#   center: the whole window moves onto the rest spot. Tripo's idle stands
#           0.137 m to one side of it, and the hit clips start on it, so the
#           Rival snapped sideways at every hit.
WINDOWS = {
    "Idle": {"window": (0.0, 4.0), "loop": 0.5, "center": True},
    "Taunt": {"window": (0.0, 1.5), "settle": 0.3, "pin": True},
}

# The Rival's HY-Motion clips: the director's name and the brief's. The
# preset Idle window stays only as the stance they blend from and to: the
# HY-Motion idle replaces it (the preset stood almost still).
HY_CLIPS = {"Idle": "rival-idle", "Launch": "launch", "Recover": "recover"}
PELVIS = mocap.TRIPO["bones"]["pelvis"]


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


def _move_pelvis(pose, gone):
    """Move the pelvis back by `gone` (armature space), in the bone's own
    frame: its pose matrix without its own basis."""
    loc, quat, scale, matrix = pose[PELVIS]
    chain = matrix @ Matrix.LocRotScale(loc, quat, scale).inverted()
    pose[PELVIS] = (loc - chain.to_3x3().inverted() @ gone, quat, scale, matrix)


def _window(rig, action, spec, stance=None):
    """Replace a preset clip with the window of it the game plays."""
    start, end = spec["window"]
    count = int(round((end - start) * c.FPS)) + 1
    frames = c.sample_poses(rig, action, action.frame_range[0] + start * c.FPS, count)
    if spec.get("center"):
        # One offset for every frame: the sway stays, the spot moves.
        offset = frames[0][PELVIS][3].to_translation() - rig.data.bones[PELVIS].head_local
        offset.z = 0.0
        for pose in frames:
            _move_pelvis(pose, offset)
    if spec.get("pin"):
        # Hold the pelvis where Idle keeps it: take its horizontal travel out.
        home = (stance or frames[0])[PELVIS][3].to_translation()
        for pose in frames:
            gone = pose[PELVIS][3].to_translation() - home
            gone.z = 0.0
            _move_pelvis(pose, gone)
    tail = spec.get("loop") or spec.get("settle") or 0.0
    target = frames[0] if "loop" in spec else stance
    if tail:
        span = tail * c.FPS
        for i in range(count):
            over = i - (count - 1 - span)
            if over > 0:
                frames[i] = c.blend_poses(frames[i], target, mocap._smooth(over / span))
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
    return c.sample_poses(rig, idle, idle.frame_range[0], 1)[0]


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
            added = c.import_glb(path)
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
        c.play_action(rig, action)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        track.strips.new(clip, int(action.frame_range[0]), action)
        track.mute = True
    rig.animation_data.action = None
    rest = stance(rig)
    for clip, name in HY_CLIPS.items():
        _drop_clip(rig, clip)
        mocap.hy_clip(rig, clip, name, rest, mocap.TRIPO)


def _drop_clip(rig, name):
    """Remove a clip and its NLA track, so a HY-Motion clip can take its name."""
    for track in list(rig.animation_data.nla_tracks):
        if track.name == name:
            rig.animation_data.nla_tracks.remove(track)
    if name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[name])


def build():
    with open(os.path.join(SOURCES, "models.json"), encoding="utf-8") as f:
        brief = json.load(f)["models"]["fighter"]
    base = next(info for info in brief["clips"].values() if info.get("geometry"))
    added = c.import_glb(os.path.join(SOURCES, base["file"]))
    rig = next(o for o in added if o.type == "ARMATURE")
    # The importer also adds an "Icosphere", its display shape for bones:
    # only the meshes the rig carries are the fighter.
    meshes = [o for o in added if o.type == "MESH" and o.parent == rig]
    for obj in added - {rig, *meshes}:
        bpy.data.objects.remove(obj, do_unlink=True)
    width = HERO_INK * c.mesh_height(meshes) / FIGHTER_HEIGHT
    for mesh in meshes:
        mesh.name = mesh.data.name = "Fighter"  # Tripo names it by task id
        _painted_only(mesh)
        c.ink_hull_skinned(mesh, rig, width)
    _clips(rig, brief)
    rig.name = "FighterRig"
    return rig
