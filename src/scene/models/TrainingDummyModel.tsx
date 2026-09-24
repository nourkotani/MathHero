/** @jsxImportSource react */
/*
Made by gltfjsx from the baked model (ADR 0009), then edited:
  npx gltfjsx src/renderer/models/training-dummy.glb --types --shadows --keepnames
Edits: the inlined model import (no network), meshopt without Draco (no
web worker), the painterly and ink materials of materials.ts in place of
Blender's, and the group ref from the parent (it drives useAnimations).
After a re-bake that changes the node tree, run gltfjsx again and redo
these edits.
*/

import { useGLTF } from '@react-three/drei';
import { useGraph } from '@react-three/fiber';
import type { ThreeElements } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Ref } from 'react';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';
import { bakedInkSurface, painterlySurface } from '../../renderer/materials';
import dummyModelUrl from '../../renderer/models/training-dummy.glb';

export type DummyClip =
  'HitBack' | 'HitSpin' | 'HitTwist' | 'Idle' | 'Launch' | 'Recover' | 'Taunt';

type GLTFResult = GLTF & {
  nodes: {
    TrainingDummy001: THREE.SkinnedMesh;
    TrainingDummy001_1: THREE.SkinnedMesh;
    root: THREE.Bone;
  };
  materials: {
    Painted: THREE.MeshStandardMaterial;
    Ink: THREE.MeshStandardMaterial;
  };
};

/** Draco off, meshopt on: meshopt decodes on the main thread. */
function useDummyGltf(): GLTFResult {
  return useGLTF(dummyModelUrl, false, true) as unknown as GLTFResult;
}

export function useDummyClips(): THREE.AnimationClip[] {
  return useDummyGltf().animations;
}

export function TrainingDummyModel({
  groupRef,
  ...props
}: ThreeElements['group'] & { groupRef: Ref<THREE.Group> }) {
  const { scene, materials } = useDummyGltf();
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone) as unknown as GLTFResult;
  const painted = useMemo(() => painterlySurface(materials.Painted.map), [materials]);
  const ink = useMemo(() => bakedInkSurface(), []);
  return (
    <group ref={groupRef} {...props} dispose={null}>
      <group name="Scene">
        <group name="TrainingDummyRig">
          <primitive object={nodes.root} />
          <group name="TrainingDummy">
            {/* A skinned mesh keeps its rest-pose bounds; the launch clip
                flies it away, so it must never be culled mid-air. */}
            <skinnedMesh
              name="TrainingDummy001"
              castShadow
              frustumCulled={false}
              geometry={nodes.TrainingDummy001.geometry}
              material={painted}
              skeleton={nodes.TrainingDummy001.skeleton}
            />
            <skinnedMesh
              name="TrainingDummy001_1"
              frustumCulled={false}
              userData={{ outlineHull: true }}
              geometry={nodes.TrainingDummy001_1.geometry}
              material={ink}
              skeleton={nodes.TrainingDummy001_1.skeleton}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

// Decode at boot, before the Dummy first shows.
useGLTF.preload(dummyModelUrl, false, true);
