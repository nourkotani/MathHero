/** @jsxImportSource react */
/*
Made by gltfjsx from the baked model (ADR 0011), then edited:
  npx gltfjsx src/renderer/models/fighter.glb --types --keepnames
Edits: the inlined model import (no network), meshopt without Draco (no
web worker), the painterly and ink materials of materials.ts in place of
Blender's, no frustum culling (the launch flies the model away), and the
group ref from the parent (it drives useAnimations). After a re-bake that
changes the node tree, run gltfjsx again and redo these edits.
*/

import { useGLTF } from '@react-three/drei';
import { useGraph } from '@react-three/fiber';
import type { ThreeElements } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Ref } from 'react';
import type * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';
import { bakedInkSurface, painterlySurface } from '../../renderer/materials';
import fighterModelUrl from '../../renderer/models/fighter.glb';

type GLTFResult = GLTF & {
  nodes: {
    Fighter_1: THREE.SkinnedMesh;
    Fighter_2: THREE.SkinnedMesh;
    Root: THREE.Bone;
  };
  materials: {
    Painted: THREE.MeshStandardMaterial;
    Ink: THREE.MeshStandardMaterial;
  };
};

/** The rest-pose height of the baked model (scripts/blender/fighter.py). */
export const FIGHTER_SOURCE_HEIGHT = 1.009;

/** Draco off, meshopt on: meshopt decodes on the main thread. */
function useFighterGltf(): GLTFResult {
  return useGLTF(fighterModelUrl, false, true) as unknown as GLTFResult;
}

export function useFighterClips(): THREE.AnimationClip[] {
  return useFighterGltf().animations;
}

export function FighterModel({
  groupRef,
  ...props
}: ThreeElements['group'] & { groupRef: Ref<THREE.Group> }) {
  const { scene, materials } = useFighterGltf();
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone) as unknown as GLTFResult;
  const painted = useMemo(() => painterlySurface(materials.Painted.map), [materials]);
  const ink = useMemo(() => bakedInkSurface(), []);
  return (
    <group ref={groupRef} {...props} dispose={null}>
      <group name="Scene">
        <group name="FighterRig">
          <primitive object={nodes.Root} />
          <group name="Fighter">
            <skinnedMesh
              name="Fighter_1"
              castShadow
              frustumCulled={false}
              geometry={nodes.Fighter_1.geometry}
              material={painted}
              skeleton={nodes.Fighter_1.skeleton}
            />
            <skinnedMesh
              name="Fighter_2"
              frustumCulled={false}
              userData={{ outlineHull: true }}
              geometry={nodes.Fighter_2.geometry}
              material={ink}
              skeleton={nodes.Fighter_2.skeleton}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

// Decode at boot, before the fighter first shows.
useGLTF.preload(fighterModelUrl, false, true);
