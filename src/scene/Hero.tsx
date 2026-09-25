/** @jsxImportSource react */
// The hero in the R3F scene (ADR 0009). The Blender model (the gltfjsx
// HeroModel) mounts once, inside the renderer's hero group. The director
// (renderer/heroDirector.ts) says which parts show and which clip plays;
// this component plays the clip with drei's useAnimations. The renderer
// then dresses the mounted bones with light: face, aura, motes, cosmetics.

import { useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { HeroMount } from '../renderer';
import { STYLE } from '../renderer/style';
import { HeroModel, useHeroGltf } from './models/HeroModel';

export function Hero({ mount, timeScale }: { mount: HeroMount; timeScale: () => number }) {
  const { director, materials, group } = mount;
  const { animations: clips, materials: baked } = useHeroGltf();
  const model = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(clips, model);
  const [cue, setCue] = useState(director.cue());
  const [parts, setParts] = useState(director.parts());

  // The model exists: it wears the baked atlas under each tint, the
  // director learns its clips, and the renderer dresses its bones.
  useLayoutEffect(() => {
    const atlas: Array<[THREE.Material, THREE.MeshStandardMaterial]> = [
      [materials.body, baked.PaintedOutfit],
      [materials.trim, baked.PaintedTrim],
      [materials.skin, baked.PaintedSkin],
      [materials.hair, baked.PaintedHair],
    ];
    for (const [tint, painted] of atlas) {
      (tint as THREE.MeshToonMaterial).map = painted.map;
      tint.needsUpdate = true;
    }
    director.ready(clips.map((clip) => ({ name: clip.name, duration: clip.duration })));
    mount.modelReady(model.current);
    return () => mount.modelReady(null);
  }, [baked, clips, director, materials, mount]);

  // Follow the director. It can change before this effect first runs (the
  // renderer dresses the model in the layout effect above), so read it once.
  useEffect(() => {
    const follow = () => {
      setCue(director.cue());
      setParts(director.parts());
    };
    director.onChange(follow);
    follow();
    return () => director.onChange(() => undefined);
  }, [director]);

  // Every clip but Idle plays once and holds its last pose; the director
  // hands on to the next clip when one ends.
  useEffect(() => {
    for (const clip of clips) {
      const action = actions[clip.name];
      if (!action || clip.name === 'Idle') continue;
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    const onFinished = (event: { action: THREE.AnimationAction }) =>
      director.finished(event.action.getClip().name);
    mixer.addEventListener('finished', onFinished);
    return () => mixer.removeEventListener('finished', onFinished);
  }, [actions, clips, director, mixer]);

  // Reset and fade into the new clip, so the change never snaps.
  useEffect(() => {
    const action = actions[cue.clip];
    action?.reset().fadeIn(STYLE.heroBlend).play();
    return () => {
      action?.fadeOut(STYLE.heroBlend);
    };
  }, [actions, cue]);

  // The hitstop freeze reaches the hero's clips too: the strike's contact
  // window (reactions.ts) runs on the same scaled time.
  useFrame(() => {
    mixer.timeScale = timeScale();
  });

  return (
    <primitive object={group}>
      <HeroModel groupRef={model} parts={parts} materials={materials} />
    </primitive>
  );
}
