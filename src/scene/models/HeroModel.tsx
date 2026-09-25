/** @jsxImportSource react */
/*
Baked output: made by scripts/gltfjsx-hero.mjs (npm run gen:hero) from
src/renderer/models/hero.glb, which gltfjsx turns into a component. Do not
edit this file by hand (ADR 0007, ADR 0009); change the script and run it
again after every re-bake of the hero.
The script's edits: the inlined model import (no network), meshopt
without Draco (no web worker), the hero's tint materials and face layers
(renderer/hero.ts) and the ink of materials.ts in place of Blender's, one
`visible` per part from the director's parts, bloom on the painted hair,
no frustum culling (the attack clips carry the root 4 m), and the group
ref from the parent (it drives useAnimations).
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
    BodyGirl_1: THREE.SkinnedMesh;
    BodyGirl_2: THREE.SkinnedMesh;
    BodyGirl_3: THREE.SkinnedMesh;
    BodyGirl_4: THREE.SkinnedMesh;
    BodyGirl_5: THREE.SkinnedMesh;
    BodyGirl_6: THREE.SkinnedMesh;
    ['GarmentArmor-BodyGirl_1']: THREE.SkinnedMesh;
    ['GarmentArmor-BodyGirl_2']: THREE.SkinnedMesh;
    ['GarmentArmor-BodyGirl_3']: THREE.SkinnedMesh;
    ['GarmentCape-BodyGirl_1']: THREE.SkinnedMesh;
    ['GarmentCape-BodyGirl_2']: THREE.SkinnedMesh;
    ['GarmentCape-BodyGirl_3']: THREE.SkinnedMesh;
    ['GarmentGi-BodyGirl_1']: THREE.SkinnedMesh;
    ['GarmentGi-BodyGirl_2']: THREE.SkinnedMesh;
    ['GarmentGi-BodyGirl_3']: THREE.SkinnedMesh;
    ['Hair_buzz_long-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_buzz_long-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_buzz_short-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_buzz_short-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_flame_long-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_flame_long-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_flame_short-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_flame_short-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_mane_crimson-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_mane_crimson-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_mane_legend-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_mane_legend-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_mane_rose-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_mane_rose-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_mane_wild-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_mane_wild-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_ponytail_long-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_ponytail_long-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_ponytail_short-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_ponytail_short-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_spiky_long-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_spiky_long-BodyGirl_2']: THREE.SkinnedMesh;
    ['Hair_spiky_short-BodyGirl_1']: THREE.SkinnedMesh;
    ['Hair_spiky_short-BodyGirl_2']: THREE.SkinnedMesh;
    BodyBoy_1: THREE.SkinnedMesh;
    BodyBoy_2: THREE.SkinnedMesh;
    BodyBoy_3: THREE.SkinnedMesh;
    BodyBoy_4: THREE.SkinnedMesh;
    BodyBoy_5: THREE.SkinnedMesh;
    BodyBoy_6: THREE.SkinnedMesh;
    ['GarmentArmor-BodyBoy_1']: THREE.SkinnedMesh;
    ['GarmentArmor-BodyBoy_2']: THREE.SkinnedMesh;
    ['GarmentArmor-BodyBoy_3']: THREE.SkinnedMesh;
    ['GarmentCape-BodyBoy_1']: THREE.SkinnedMesh;
    ['GarmentCape-BodyBoy_2']: THREE.SkinnedMesh;
    ['GarmentCape-BodyBoy_3']: THREE.SkinnedMesh;
    ['GarmentGi-BodyBoy_1']: THREE.SkinnedMesh;
    ['GarmentGi-BodyBoy_2']: THREE.SkinnedMesh;
    ['GarmentGi-BodyBoy_3']: THREE.SkinnedMesh;
    ['Hair_buzz_long-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_buzz_long-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_buzz_short-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_buzz_short-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_flame_long-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_flame_long-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_flame_short-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_flame_short-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_mane_crimson-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_mane_crimson-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_mane_legend-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_mane_legend-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_mane_rose-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_mane_rose-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_mane_wild-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_mane_wild-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_ponytail_long-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_ponytail_long-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_ponytail_short-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_ponytail_short-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_spiky_long-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_spiky_long-BodyBoy_2']: THREE.SkinnedMesh;
    ['Hair_spiky_short-BodyBoy_1']: THREE.SkinnedMesh;
    ['Hair_spiky_short-BodyBoy_2']: THREE.SkinnedMesh;
    root: THREE.Bone;
    girl_root: THREE.Bone;
  };
  materials: {
    PaintedOutfit: THREE.MeshStandardMaterial;
    PaintedSkin: THREE.MeshStandardMaterial;
    PaintedTrim: THREE.MeshStandardMaterial;
    PaintedHair: THREE.MeshStandardMaterial;
    Face: THREE.MeshStandardMaterial;
    Iris: THREE.MeshStandardMaterial;
    Ink: THREE.MeshStandardMaterial;
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
  // A piece fitted to one body (`<part>-<body>`) shows with that body.
  const show = (part: string, of?: string) =>
    (of === undefined || of === parts.body) &&
    (part === parts.body || part === parts.garment || part === parts.hair);
  return (
    <group ref={groupRef} dispose={null}>
      <group name="Scene">
        <group name="HeroRig">
          <primitive object={nodes.root} />
          <group name="GirlRig">
            <primitive object={nodes.girl_root} />
            <group name="BodyGirl" visible={show('BodyGirl')}>
              <skinnedMesh
                name="BodyGirl_1"
                geometry={nodes.BodyGirl_1.geometry}
                skeleton={nodes.BodyGirl_1.skeleton}
                material={materials.skin}
                castShadow
                frustumCulled={false}
              />
              <skinnedMesh
                name="BodyGirl_2"
                geometry={nodes.BodyGirl_2.geometry}
                skeleton={nodes.BodyGirl_2.skeleton}
                material={materials.body}
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
              <skinnedMesh
                name="BodyGirl_5"
                geometry={nodes.BodyGirl_5.geometry}
                skeleton={nodes.BodyGirl_5.skeleton}
                material={materials.face}
                renderOrder={1}
                frustumCulled={false}
              />
              <skinnedMesh
                name="BodyGirl_6"
                geometry={nodes.BodyGirl_6.geometry}
                skeleton={nodes.BodyGirl_6.skeleton}
                material={materials.iris}
                renderOrder={2}
                frustumCulled={false}
              />
            </group>
            <group name="GarmentArmor-BodyGirl" visible={show('GarmentArmor', 'BodyGirl')}>
              <skinnedMesh
                name="GarmentArmor-BodyGirl_1"
                geometry={nodes['GarmentArmor-BodyGirl_1'].geometry}
                skeleton={nodes['GarmentArmor-BodyGirl_1'].skeleton}
                material={materials.body}
                castShadow
                frustumCulled={false}
              />
              <skinnedMesh
                name="GarmentArmor-BodyGirl_2"
                geometry={nodes['GarmentArmor-BodyGirl_2'].geometry}
                skeleton={nodes['GarmentArmor-BodyGirl_2'].skeleton}
                material={materials.trim}
                castShadow
                frustumCulled={false}
              />
              <skinnedMesh
                name="GarmentArmor-BodyGirl_3"
                geometry={nodes['GarmentArmor-BodyGirl_3'].geometry}
                skeleton={nodes['GarmentArmor-BodyGirl_3'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="GarmentCape-BodyGirl" visible={show('GarmentCape', 'BodyGirl')}>
              <skinnedMesh
                name="GarmentCape-BodyGirl_1"
                geometry={nodes['GarmentCape-BodyGirl_1'].geometry}
                skeleton={nodes['GarmentCape-BodyGirl_1'].skeleton}
                material={materials.body}
                castShadow
                frustumCulled={false}
              />
              <skinnedMesh
                name="GarmentCape-BodyGirl_2"
                geometry={nodes['GarmentCape-BodyGirl_2'].geometry}
                skeleton={nodes['GarmentCape-BodyGirl_2'].skeleton}
                material={materials.trim}
                castShadow
                frustumCulled={false}
              />
              <skinnedMesh
                name="GarmentCape-BodyGirl_3"
                geometry={nodes['GarmentCape-BodyGirl_3'].geometry}
                skeleton={nodes['GarmentCape-BodyGirl_3'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="GarmentGi-BodyGirl" visible={show('GarmentGi', 'BodyGirl')}>
              <skinnedMesh
                name="GarmentGi-BodyGirl_1"
                geometry={nodes['GarmentGi-BodyGirl_1'].geometry}
                skeleton={nodes['GarmentGi-BodyGirl_1'].skeleton}
                material={materials.body}
                castShadow
                frustumCulled={false}
              />
              <skinnedMesh
                name="GarmentGi-BodyGirl_2"
                geometry={nodes['GarmentGi-BodyGirl_2'].geometry}
                skeleton={nodes['GarmentGi-BodyGirl_2'].skeleton}
                material={materials.trim}
                castShadow
                frustumCulled={false}
              />
              <skinnedMesh
                name="GarmentGi-BodyGirl_3"
                geometry={nodes['GarmentGi-BodyGirl_3'].geometry}
                skeleton={nodes['GarmentGi-BodyGirl_3'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_buzz_long-BodyGirl" visible={show('Hair_buzz_long', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_buzz_long-BodyGirl_1"
                geometry={nodes['Hair_buzz_long-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_buzz_long-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_buzz_long-BodyGirl_2"
                geometry={nodes['Hair_buzz_long-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_buzz_long-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_buzz_short-BodyGirl" visible={show('Hair_buzz_short', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_buzz_short-BodyGirl_1"
                geometry={nodes['Hair_buzz_short-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_buzz_short-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_buzz_short-BodyGirl_2"
                geometry={nodes['Hair_buzz_short-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_buzz_short-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_flame_long-BodyGirl" visible={show('Hair_flame_long', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_flame_long-BodyGirl_1"
                geometry={nodes['Hair_flame_long-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_flame_long-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_flame_long-BodyGirl_2"
                geometry={nodes['Hair_flame_long-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_flame_long-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_flame_short-BodyGirl" visible={show('Hair_flame_short', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_flame_short-BodyGirl_1"
                geometry={nodes['Hair_flame_short-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_flame_short-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_flame_short-BodyGirl_2"
                geometry={nodes['Hair_flame_short-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_flame_short-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group
              name="Hair_mane_crimson-BodyGirl"
              visible={show('Hair_mane_crimson', 'BodyGirl')}
            >
              <skinnedMesh
                name="Hair_mane_crimson-BodyGirl_1"
                geometry={nodes['Hair_mane_crimson-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_mane_crimson-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_mane_crimson-BodyGirl_2"
                geometry={nodes['Hair_mane_crimson-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_mane_crimson-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_mane_legend-BodyGirl" visible={show('Hair_mane_legend', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_mane_legend-BodyGirl_1"
                geometry={nodes['Hair_mane_legend-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_mane_legend-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_mane_legend-BodyGirl_2"
                geometry={nodes['Hair_mane_legend-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_mane_legend-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_mane_rose-BodyGirl" visible={show('Hair_mane_rose', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_mane_rose-BodyGirl_1"
                geometry={nodes['Hair_mane_rose-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_mane_rose-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_mane_rose-BodyGirl_2"
                geometry={nodes['Hair_mane_rose-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_mane_rose-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_mane_wild-BodyGirl" visible={show('Hair_mane_wild', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_mane_wild-BodyGirl_1"
                geometry={nodes['Hair_mane_wild-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_mane_wild-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_mane_wild-BodyGirl_2"
                geometry={nodes['Hair_mane_wild-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_mane_wild-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group
              name="Hair_ponytail_long-BodyGirl"
              visible={show('Hair_ponytail_long', 'BodyGirl')}
            >
              <skinnedMesh
                name="Hair_ponytail_long-BodyGirl_1"
                geometry={nodes['Hair_ponytail_long-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_ponytail_long-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_ponytail_long-BodyGirl_2"
                geometry={nodes['Hair_ponytail_long-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_ponytail_long-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group
              name="Hair_ponytail_short-BodyGirl"
              visible={show('Hair_ponytail_short', 'BodyGirl')}
            >
              <skinnedMesh
                name="Hair_ponytail_short-BodyGirl_1"
                geometry={nodes['Hair_ponytail_short-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_ponytail_short-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_ponytail_short-BodyGirl_2"
                geometry={nodes['Hair_ponytail_short-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_ponytail_short-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_spiky_long-BodyGirl" visible={show('Hair_spiky_long', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_spiky_long-BodyGirl_1"
                geometry={nodes['Hair_spiky_long-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_spiky_long-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_spiky_long-BodyGirl_2"
                geometry={nodes['Hair_spiky_long-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_spiky_long-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
            <group name="Hair_spiky_short-BodyGirl" visible={show('Hair_spiky_short', 'BodyGirl')}>
              <skinnedMesh
                name="Hair_spiky_short-BodyGirl_1"
                geometry={nodes['Hair_spiky_short-BodyGirl_1'].geometry}
                skeleton={nodes['Hair_spiky_short-BodyGirl_1'].skeleton}
                material={materials.hair}
                castShadow
                layers={BLOOM}
                frustumCulled={false}
              />
              <skinnedMesh
                name="Hair_spiky_short-BodyGirl_2"
                geometry={nodes['Hair_spiky_short-BodyGirl_2'].geometry}
                skeleton={nodes['Hair_spiky_short-BodyGirl_2'].skeleton}
                material={ink}
                userData={INK}
                frustumCulled={false}
              />
            </group>
          </group>
          <group name="BodyBoy" visible={show('BodyBoy')}>
            <skinnedMesh
              name="BodyBoy_1"
              geometry={nodes.BodyBoy_1.geometry}
              skeleton={nodes.BodyBoy_1.skeleton}
              material={materials.skin}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="BodyBoy_2"
              geometry={nodes.BodyBoy_2.geometry}
              skeleton={nodes.BodyBoy_2.skeleton}
              material={materials.body}
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
            <skinnedMesh
              name="BodyBoy_5"
              geometry={nodes.BodyBoy_5.geometry}
              skeleton={nodes.BodyBoy_5.skeleton}
              material={materials.face}
              renderOrder={1}
              frustumCulled={false}
            />
            <skinnedMesh
              name="BodyBoy_6"
              geometry={nodes.BodyBoy_6.geometry}
              skeleton={nodes.BodyBoy_6.skeleton}
              material={materials.iris}
              renderOrder={2}
              frustumCulled={false}
            />
          </group>
          <group name="GarmentArmor-BodyBoy" visible={show('GarmentArmor', 'BodyBoy')}>
            <skinnedMesh
              name="GarmentArmor-BodyBoy_1"
              geometry={nodes['GarmentArmor-BodyBoy_1'].geometry}
              skeleton={nodes['GarmentArmor-BodyBoy_1'].skeleton}
              material={materials.body}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentArmor-BodyBoy_2"
              geometry={nodes['GarmentArmor-BodyBoy_2'].geometry}
              skeleton={nodes['GarmentArmor-BodyBoy_2'].skeleton}
              material={materials.trim}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentArmor-BodyBoy_3"
              geometry={nodes['GarmentArmor-BodyBoy_3'].geometry}
              skeleton={nodes['GarmentArmor-BodyBoy_3'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="GarmentCape-BodyBoy" visible={show('GarmentCape', 'BodyBoy')}>
            <skinnedMesh
              name="GarmentCape-BodyBoy_1"
              geometry={nodes['GarmentCape-BodyBoy_1'].geometry}
              skeleton={nodes['GarmentCape-BodyBoy_1'].skeleton}
              material={materials.body}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentCape-BodyBoy_2"
              geometry={nodes['GarmentCape-BodyBoy_2'].geometry}
              skeleton={nodes['GarmentCape-BodyBoy_2'].skeleton}
              material={materials.trim}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentCape-BodyBoy_3"
              geometry={nodes['GarmentCape-BodyBoy_3'].geometry}
              skeleton={nodes['GarmentCape-BodyBoy_3'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="GarmentGi-BodyBoy" visible={show('GarmentGi', 'BodyBoy')}>
            <skinnedMesh
              name="GarmentGi-BodyBoy_1"
              geometry={nodes['GarmentGi-BodyBoy_1'].geometry}
              skeleton={nodes['GarmentGi-BodyBoy_1'].skeleton}
              material={materials.body}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentGi-BodyBoy_2"
              geometry={nodes['GarmentGi-BodyBoy_2'].geometry}
              skeleton={nodes['GarmentGi-BodyBoy_2'].skeleton}
              material={materials.trim}
              castShadow
              frustumCulled={false}
            />
            <skinnedMesh
              name="GarmentGi-BodyBoy_3"
              geometry={nodes['GarmentGi-BodyBoy_3'].geometry}
              skeleton={nodes['GarmentGi-BodyBoy_3'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_buzz_long-BodyBoy" visible={show('Hair_buzz_long', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_buzz_long-BodyBoy_1"
              geometry={nodes['Hair_buzz_long-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_buzz_long-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_buzz_long-BodyBoy_2"
              geometry={nodes['Hair_buzz_long-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_buzz_long-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_buzz_short-BodyBoy" visible={show('Hair_buzz_short', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_buzz_short-BodyBoy_1"
              geometry={nodes['Hair_buzz_short-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_buzz_short-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_buzz_short-BodyBoy_2"
              geometry={nodes['Hair_buzz_short-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_buzz_short-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_flame_long-BodyBoy" visible={show('Hair_flame_long', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_flame_long-BodyBoy_1"
              geometry={nodes['Hair_flame_long-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_flame_long-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_flame_long-BodyBoy_2"
              geometry={nodes['Hair_flame_long-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_flame_long-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_flame_short-BodyBoy" visible={show('Hair_flame_short', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_flame_short-BodyBoy_1"
              geometry={nodes['Hair_flame_short-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_flame_short-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_flame_short-BodyBoy_2"
              geometry={nodes['Hair_flame_short-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_flame_short-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_mane_crimson-BodyBoy" visible={show('Hair_mane_crimson', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_mane_crimson-BodyBoy_1"
              geometry={nodes['Hair_mane_crimson-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_mane_crimson-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_mane_crimson-BodyBoy_2"
              geometry={nodes['Hair_mane_crimson-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_mane_crimson-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_mane_legend-BodyBoy" visible={show('Hair_mane_legend', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_mane_legend-BodyBoy_1"
              geometry={nodes['Hair_mane_legend-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_mane_legend-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_mane_legend-BodyBoy_2"
              geometry={nodes['Hair_mane_legend-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_mane_legend-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_mane_rose-BodyBoy" visible={show('Hair_mane_rose', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_mane_rose-BodyBoy_1"
              geometry={nodes['Hair_mane_rose-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_mane_rose-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_mane_rose-BodyBoy_2"
              geometry={nodes['Hair_mane_rose-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_mane_rose-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_mane_wild-BodyBoy" visible={show('Hair_mane_wild', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_mane_wild-BodyBoy_1"
              geometry={nodes['Hair_mane_wild-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_mane_wild-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_mane_wild-BodyBoy_2"
              geometry={nodes['Hair_mane_wild-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_mane_wild-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_ponytail_long-BodyBoy" visible={show('Hair_ponytail_long', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_ponytail_long-BodyBoy_1"
              geometry={nodes['Hair_ponytail_long-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_ponytail_long-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_ponytail_long-BodyBoy_2"
              geometry={nodes['Hair_ponytail_long-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_ponytail_long-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group
            name="Hair_ponytail_short-BodyBoy"
            visible={show('Hair_ponytail_short', 'BodyBoy')}
          >
            <skinnedMesh
              name="Hair_ponytail_short-BodyBoy_1"
              geometry={nodes['Hair_ponytail_short-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_ponytail_short-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_ponytail_short-BodyBoy_2"
              geometry={nodes['Hair_ponytail_short-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_ponytail_short-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_spiky_long-BodyBoy" visible={show('Hair_spiky_long', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_spiky_long-BodyBoy_1"
              geometry={nodes['Hair_spiky_long-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_spiky_long-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_spiky_long-BodyBoy_2"
              geometry={nodes['Hair_spiky_long-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_spiky_long-BodyBoy_2'].skeleton}
              material={ink}
              userData={INK}
              frustumCulled={false}
            />
          </group>
          <group name="Hair_spiky_short-BodyBoy" visible={show('Hair_spiky_short', 'BodyBoy')}>
            <skinnedMesh
              name="Hair_spiky_short-BodyBoy_1"
              geometry={nodes['Hair_spiky_short-BodyBoy_1'].geometry}
              skeleton={nodes['Hair_spiky_short-BodyBoy_1'].skeleton}
              material={materials.hair}
              castShadow
              layers={BLOOM}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Hair_spiky_short-BodyBoy_2"
              geometry={nodes['Hair_spiky_short-BodyBoy_2'].geometry}
              skeleton={nodes['Hair_spiky_short-BodyBoy_2'].skeleton}
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
