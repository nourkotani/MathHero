/** @jsxImportSource react */
/*
Made by gltfjsx from the baked model (ADR 0009), then edited:
  npx gltfjsx src/renderer/models/hero.glb --types --shadows --keepnames
Edits: the inlined model import (no network), meshopt without Draco (no
web worker), the hero's tint materials (renderer/hero.ts) and the ink of
materials.ts in place of Blender's, one `visible` per part from the
director's parts, bloom on the painted hair, no frustum culling (the
attack clips carry the root 4 m), and the group ref from the parent (it
drives useAnimations). After a re-bake that changes the node tree, run
gltfjsx again and redo these edits.
*/

import { useGLTF } from '@react-three/drei';
import { useGraph } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Ref } from 'react';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { GLTF } from 'three-stdlib';
import type { HeroMaterials } from '../../renderer/hero';
import type { HeroParts } from '../../renderer/heroDirector';
import { bakedInkSurface, BLOOM_LAYER } from '../../renderer/materials';
import heroModelUrl from '../../renderer/models/hero.glb';

type GLTFResult = GLTF & {
  nodes: {
    BodyBoy_1: THREE.SkinnedMesh;
    BodyBoy_2: THREE.SkinnedMesh;
    BodyBoy_3: THREE.SkinnedMesh;
    BodyBoy_4: THREE.SkinnedMesh;
    BodyGirl_1: THREE.SkinnedMesh;
    BodyGirl_2: THREE.SkinnedMesh;
    BodyGirl_3: THREE.SkinnedMesh;
    BodyGirl_4: THREE.SkinnedMesh;
    GarmentArmor_1: THREE.SkinnedMesh;
    GarmentArmor_2: THREE.SkinnedMesh;
    GarmentCape_1: THREE.SkinnedMesh;
    GarmentCape_2: THREE.SkinnedMesh;
    GarmentGi_1: THREE.SkinnedMesh;
    GarmentGi_2: THREE.SkinnedMesh;
    GarmentGi_3: THREE.SkinnedMesh;
    Hair_buzz_long_1: THREE.SkinnedMesh;
    Hair_buzz_long_2: THREE.SkinnedMesh;
    Hair_buzz_short_1: THREE.SkinnedMesh;
    Hair_buzz_short_2: THREE.SkinnedMesh;
    Hair_flame_long_1: THREE.SkinnedMesh;
    Hair_flame_long_2: THREE.SkinnedMesh;
    Hair_flame_short_1: THREE.SkinnedMesh;
    Hair_flame_short_2: THREE.SkinnedMesh;
    Hair_mane_crimson_1: THREE.SkinnedMesh;
    Hair_mane_crimson_2: THREE.SkinnedMesh;
    Hair_mane_legend_1: THREE.SkinnedMesh;
    Hair_mane_legend_2: THREE.SkinnedMesh;
    Hair_mane_rose_1: THREE.SkinnedMesh;
    Hair_mane_rose_2: THREE.SkinnedMesh;
    Hair_mane_wild_1: THREE.SkinnedMesh;
    Hair_mane_wild_2: THREE.SkinnedMesh;
    Hair_ponytail_long_1: THREE.SkinnedMesh;
    Hair_ponytail_long_2: THREE.SkinnedMesh;
    Hair_ponytail_short_1: THREE.SkinnedMesh;
    Hair_ponytail_short_2: THREE.SkinnedMesh;
    Hair_spiky_long_1: THREE.SkinnedMesh;
    Hair_spiky_long_2: THREE.SkinnedMesh;
    Hair_spiky_short_1: THREE.SkinnedMesh;
    Hair_spiky_short_2: THREE.SkinnedMesh;
    root: THREE.Bone;
  };
  materials: {
    PaintedOutfit: THREE.MeshStandardMaterial;
    PaintedSkin: THREE.MeshStandardMaterial;
    PaintedTrim: THREE.MeshStandardMaterial;
    Ink: THREE.MeshStandardMaterial;
    PaintedHair: THREE.MeshStandardMaterial;
  };
};

/** The painted hair glows for real in surge and Super mode. */
const BLOOM = new THREE.Layers();
BLOOM.enable(BLOOM_LAYER);

/** A baked inverted hull: skipped by the cel treatment and by freeMesh. */
const INK = { outlineHull: true };

/** Draco off, meshopt on: meshopt decodes on the main thread. */
export function useHeroGltf(): GLTFResult {
  return useGLTF(heroModelUrl, false, true) as unknown as GLTFResult;
}

export function HeroModel({
  groupRef,
  parts,
  materials,
}: {
  groupRef: Ref<THREE.Group>;
  parts: HeroParts;
  materials: HeroMaterials;
}) {
  const { scene } = useHeroGltf();
  // dispose={null} below: the clone shares the cached template's geometry.
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone) as unknown as GLTFResult;
  const ink = useMemo(() => bakedInkSurface(), []);
  const show = (part: string) =>
    part === parts.body || part === parts.garment || part === parts.hair;
  return (
    <group ref={groupRef} dispose={null}>
      <group name="Scene">
        <group name="HeroRig">
          <primitive object={nodes.root} />
          <group name="BodyBoy" visible={show('BodyBoy')}>
            <skinnedMesh
              name="BodyBoy_1"
              geometry={nodes.BodyBoy_1.geometry}
              skeleton={nodes.BodyBoy_1.skeleton}
              material={materials.body}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="BodyBoy_2"
              geometry={nodes.BodyBoy_2.geometry}
              skeleton={nodes.BodyBoy_2.skeleton}
              material={materials.skin}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="BodyBoy_3"
              geometry={nodes.BodyBoy_3.geometry}
              skeleton={nodes.BodyBoy_3.skeleton}
              material={materials.trim}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="BodyBoy_4"
              geometry={nodes.BodyBoy_4.geometry}
              skeleton={nodes.BodyBoy_4.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="BodyGirl" visible={show('BodyGirl')}>
            <skinnedMesh
              name="BodyGirl_1"
              geometry={nodes.BodyGirl_1.geometry}
              skeleton={nodes.BodyGirl_1.skeleton}
              material={materials.body}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="BodyGirl_2"
              geometry={nodes.BodyGirl_2.geometry}
              skeleton={nodes.BodyGirl_2.skeleton}
              material={materials.skin}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="BodyGirl_3"
              geometry={nodes.BodyGirl_3.geometry}
              skeleton={nodes.BodyGirl_3.skeleton}
              material={materials.trim}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="BodyGirl_4"
              geometry={nodes.BodyGirl_4.geometry}
              skeleton={nodes.BodyGirl_4.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="GarmentArmor" visible={show('GarmentArmor')}>
            <skinnedMesh
              name="GarmentArmor_1"
              geometry={nodes.GarmentArmor_1.geometry}
              skeleton={nodes.GarmentArmor_1.skeleton}
              material={materials.trim}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentArmor_2"
              geometry={nodes.GarmentArmor_2.geometry}
              skeleton={nodes.GarmentArmor_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="GarmentCape" visible={show('GarmentCape')}>
            <skinnedMesh
              name="GarmentCape_1"
              geometry={nodes.GarmentCape_1.geometry}
              skeleton={nodes.GarmentCape_1.skeleton}
              material={materials.trim}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentCape_2"
              geometry={nodes.GarmentCape_2.geometry}
              skeleton={nodes.GarmentCape_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="GarmentGi" visible={show('GarmentGi')}>
            <skinnedMesh
              name="GarmentGi_1"
              geometry={nodes.GarmentGi_1.geometry}
              skeleton={nodes.GarmentGi_1.skeleton}
              material={materials.body}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentGi_2"
              geometry={nodes.GarmentGi_2.geometry}
              skeleton={nodes.GarmentGi_2.skeleton}
              material={materials.trim}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentGi_3"
              geometry={nodes.GarmentGi_3.geometry}
              skeleton={nodes.GarmentGi_3.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_buzz_long" visible={show('Hair_buzz_long')}>
            <skinnedMesh
              name="Hair_buzz_long_1"
              geometry={nodes.Hair_buzz_long_1.geometry}
              skeleton={nodes.Hair_buzz_long_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_buzz_long_2"
              geometry={nodes.Hair_buzz_long_2.geometry}
              skeleton={nodes.Hair_buzz_long_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_buzz_short" visible={show('Hair_buzz_short')}>
            <skinnedMesh
              name="Hair_buzz_short_1"
              geometry={nodes.Hair_buzz_short_1.geometry}
              skeleton={nodes.Hair_buzz_short_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_buzz_short_2"
              geometry={nodes.Hair_buzz_short_2.geometry}
              skeleton={nodes.Hair_buzz_short_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_flame_long" visible={show('Hair_flame_long')}>
            <skinnedMesh
              name="Hair_flame_long_1"
              geometry={nodes.Hair_flame_long_1.geometry}
              skeleton={nodes.Hair_flame_long_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_flame_long_2"
              geometry={nodes.Hair_flame_long_2.geometry}
              skeleton={nodes.Hair_flame_long_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_flame_short" visible={show('Hair_flame_short')}>
            <skinnedMesh
              name="Hair_flame_short_1"
              geometry={nodes.Hair_flame_short_1.geometry}
              skeleton={nodes.Hair_flame_short_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_flame_short_2"
              geometry={nodes.Hair_flame_short_2.geometry}
              skeleton={nodes.Hair_flame_short_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_mane_crimson" visible={show('Hair_mane_crimson')}>
            <skinnedMesh
              name="Hair_mane_crimson_1"
              geometry={nodes.Hair_mane_crimson_1.geometry}
              skeleton={nodes.Hair_mane_crimson_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_mane_crimson_2"
              geometry={nodes.Hair_mane_crimson_2.geometry}
              skeleton={nodes.Hair_mane_crimson_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_mane_legend" visible={show('Hair_mane_legend')}>
            <skinnedMesh
              name="Hair_mane_legend_1"
              geometry={nodes.Hair_mane_legend_1.geometry}
              skeleton={nodes.Hair_mane_legend_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_mane_legend_2"
              geometry={nodes.Hair_mane_legend_2.geometry}
              skeleton={nodes.Hair_mane_legend_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_mane_rose" visible={show('Hair_mane_rose')}>
            <skinnedMesh
              name="Hair_mane_rose_1"
              geometry={nodes.Hair_mane_rose_1.geometry}
              skeleton={nodes.Hair_mane_rose_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_mane_rose_2"
              geometry={nodes.Hair_mane_rose_2.geometry}
              skeleton={nodes.Hair_mane_rose_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_mane_wild" visible={show('Hair_mane_wild')}>
            <skinnedMesh
              name="Hair_mane_wild_1"
              geometry={nodes.Hair_mane_wild_1.geometry}
              skeleton={nodes.Hair_mane_wild_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_mane_wild_2"
              geometry={nodes.Hair_mane_wild_2.geometry}
              skeleton={nodes.Hair_mane_wild_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_ponytail_long" visible={show('Hair_ponytail_long')}>
            <skinnedMesh
              name="Hair_ponytail_long_1"
              geometry={nodes.Hair_ponytail_long_1.geometry}
              skeleton={nodes.Hair_ponytail_long_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_ponytail_long_2"
              geometry={nodes.Hair_ponytail_long_2.geometry}
              skeleton={nodes.Hair_ponytail_long_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_ponytail_short" visible={show('Hair_ponytail_short')}>
            <skinnedMesh
              name="Hair_ponytail_short_1"
              geometry={nodes.Hair_ponytail_short_1.geometry}
              skeleton={nodes.Hair_ponytail_short_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_ponytail_short_2"
              geometry={nodes.Hair_ponytail_short_2.geometry}
              skeleton={nodes.Hair_ponytail_short_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_spiky_long" visible={show('Hair_spiky_long')}>
            <skinnedMesh
              name="Hair_spiky_long_1"
              geometry={nodes.Hair_spiky_long_1.geometry}
              skeleton={nodes.Hair_spiky_long_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_spiky_long_2"
              geometry={nodes.Hair_spiky_long_2.geometry}
              skeleton={nodes.Hair_spiky_long_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_spiky_short" visible={show('Hair_spiky_short')}>
            <skinnedMesh
              name="Hair_spiky_short_1"
              geometry={nodes.Hair_spiky_short_1.geometry}
              skeleton={nodes.Hair_spiky_short_1.skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_spiky_short_2"
              geometry={nodes.Hair_spiky_short_2.geometry}
              skeleton={nodes.Hair_spiky_short_2.skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

// Decode at boot, before the hero first shows.
useGLTF.preload(heroModelUrl, false, true);
