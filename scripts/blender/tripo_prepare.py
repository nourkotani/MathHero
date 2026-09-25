"""Decimate a Tripo candidate to the game's face budget before rigging (ADR 0011).

blender --background --factory-startup --python scripts/blender/tripo_prepare.py -- <in.glb> <out.glb> <faces>

Tripo's retarget fails on the full ~780k-face model, and the game needs far
fewer faces anyway. So the chosen candidate is decimated here (collapse, the
textures kept), and the result is what Tripo rigs and animates. This script
is the record of that step; the rig and animation task ids are in
sources/tripo/models.json.
"""

import sys

import bpy


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    source, out, faces = argv[0], argv[1], int(argv[2])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    total = sum(len(m.data.polygons) for m in meshes)
    ratio = min(1.0, faces / total)
    for mesh in meshes:
        bpy.context.view_layer.objects.active = mesh
        mod = mesh.modifiers.new("Decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    after = sum(len(m.data.polygons) for m in meshes)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    print(f"PREPARED {total} -> {after} faces: {out}")


main()
