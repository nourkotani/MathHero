// The pipeline facade: owns HOW a frame reaches the screen. Two
// implementations live behind one interface — the pmndrs postprocessing
// composer with selective bloom on the marked glow meshes, and the plain
// renderer (the sprite-glow fallback tier). Nothing outside this module
// knows which is active (ADR 0004); a future pass slots in here.

import * as THREE from 'three';
import { EffectComposer, EffectPass, RenderPass, SelectiveBloomEffect } from 'postprocessing';
import { BLOOM_LAYER } from './materials';
import type { VisualTier } from './qualityTier';
import { STYLE } from './style';

export interface Pipeline {
  render(dtSeconds: number): void;
  setTier(tier: VisualTier): void;
  setSize(width: number, height: number): void;
}

export function createPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): Pipeline {
  let tier: VisualTier = 'bloom';

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Selective bloom: only meshes marked on the bloom layer feed the glow.
  // A luminance threshold would also catch bright lit cel bands (white gi
  // trim, pale arena stone) and read as haze — selection can't.
  const bloom = new SelectiveBloomEffect(scene, camera, {
    intensity: STYLE.bloom.intensity,
    luminanceThreshold: STYLE.bloom.luminanceThreshold,
    mipmapBlur: true,
  });
  bloom.selection.layer = BLOOM_LAYER;
  bloom.ignoreBackground = true;
  composer.addPass(new EffectPass(camera, bloom));

  return {
    render(dtSeconds) {
      if (tier === 'bloom') composer.render(dtSeconds);
      else renderer.render(scene, camera);
    },
    setTier(next) {
      tier = next;
    },
    setSize(width, height) {
      renderer.setSize(width, height);
      composer.setSize(width, height);
    },
  };
}
