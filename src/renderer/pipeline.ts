// The pipeline facade: owns HOW a frame reaches the screen. Three looks live
// behind one interface — the pmndrs postprocessing composer with sun shafts
// and selective bloom (full), the composer with bloom alone, and the plain
// renderer (the sprite-glow fallback tier). Nothing outside this module
// knows which is active (ADR 0004); a future pass slots in here.

import * as THREE from 'three';
import { EffectComposer, EffectPass, GodRaysEffect, RenderPass, SelectiveBloomEffect } from 'postprocessing';
import { BLOOM_LAYER } from './materials';
import type { VisualTier } from './qualityTier';
import { SpeedLinesEffect } from './speedLines';
import { STYLE } from './style';

export interface Pipeline {
  render(dtSeconds: number): void;
  setTier(tier: VisualTier): void;
  setSize(width: number, height: number): void;
  /** One anime speed-lines flash (full tier only; a no-op when shed). */
  flashSpeedLines(): void;
}

export function createPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sunDisc: THREE.Mesh,
): Pipeline {
  let tier: VisualTier = 'full';

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Sun shafts rake from the low dusk sun across the battlefield. A separate
  // pass from bloom — both are convolution effects, which cannot share one —
  // and the first thing the quality tier sheds.
  const rays = new GodRaysEffect(camera, sunDisc, {
    density: STYLE.sunShafts.density,
    decay: STYLE.sunShafts.decay,
    weight: STYLE.sunShafts.weight,
    samples: STYLE.sunShafts.samples,
  });
  const raysPass = new EffectPass(camera, rays);
  composer.addPass(raysPass);

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

  // Speed-lines flash last, over the bloomed frame — hits read arcade-crisp.
  const speedLines = new SpeedLinesEffect();
  const speedLinesPass = new EffectPass(camera, speedLines);
  composer.addPass(speedLinesPass);

  return {
    render(dtSeconds) {
      if (tier === 'sprites') renderer.render(scene, camera);
      else composer.render(dtSeconds);
    },
    setTier(next) {
      tier = next;
      raysPass.enabled = next === 'full';
      speedLinesPass.enabled = next === 'full';
    },
    setSize(width, height) {
      renderer.setSize(width, height);
      composer.setSize(width, height);
    },
    flashSpeedLines() {
      if (tier === 'full') speedLines.flash();
    },
  };
}
