// The three.js renderer facade. Interface: (state, effects) in via
// onStoreUpdate, plus frame(dt) from the shell's animation loop. The scene
// is assembled from focused modules — stage (environment), hero, dummy,
// fx (particles/blasts), reactions (effects → animation) — wired here.

import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  glowIntensityForLevel,
  HAIR_PRESETS,
  isFinalTenSeconds,
  levelForXp,
  OUTFIT_PRESETS,
  presetHex,
  unlockedCosmetics,
} from '../core';
import type { GameEffect, GameState, HeroAppearance } from '../core';
import { HERO_X } from './constants';
import { createDummy } from './dummy';
import { createFx, freeMesh } from './fx';
import { buildHero } from './hero';
import { createReactions } from './reactions';
import { createStage } from './stage';

export interface Renderer {
  onStoreUpdate(state: GameState, effects: GameEffect[]): void;
  frame(dtMs: number): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // One directional shadow grounds the characters (see stage.ts).
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const stage = createStage(scene);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  const cameraHome = new THREE.Vector3(0, 4.2, 10);
  camera.position.copy(cameraHome);
  camera.lookAt(0, 1.4, 0);

  // Camera shake energy; reactions feed it, the frame loop decays it.
  let shake = 0;
  const addShake = (amount: number) => {
    shake = Math.max(shake, amount);
  };

  let hero = buildHero(DEFAULT_APPEARANCE);
  let appearanceKey = JSON.stringify(DEFAULT_APPEARANCE);
  placeHero();
  scene.add(hero.group);

  function placeHero() {
    hero.group.position.set(HERO_X, 0.3, 0);
    hero.group.rotation.y = Math.PI / 2;
  }

  /** Swap the character model when the appearance changes (or is previewed). */
  function rebuildHero(appearance: HeroAppearance) {
    scene.remove(hero.group);
    hero.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) freeMesh(obj);
    });
    hero = buildHero(appearance);
    placeHero();
    scene.add(hero.group);
  }

  const dummy = createDummy();
  scene.add(dummy.group);

  const fx = createFx(scene, (big) => {
    if (big) {
      dummy.launch();
      addShake(0.4);
    } else {
      dummy.kick(0.4);
    }
  });

  const reactions = createReactions({ getHero: () => hero, dummy, fx, addShake });

  let elapsed = 0;
  let urgent = false; // final ten seconds of the Round
  let previewing = false; // hero creation: face the camera, not the dummy

  function applyLook(state: GameState) {
    // During hero creation the draft is previewed live on the 3D character.
    const player = state.players.find((p) => p.id === state.activePlayerId);
    const draft = state.phase === 'hero-creation' ? state.draft : null;
    const colors = draft?.colors ?? player?.colors;
    const appearance = draft?.appearance ?? player?.appearance;
    if (!colors || !appearance) return;
    const level = draft ? 0 : levelForXp(player?.xp ?? 0);

    const key = JSON.stringify(appearance);
    if (key !== appearanceKey) {
      appearanceKey = key;
      rebuildHero(appearance);
    }
    reactions.setPlayerLook(presetHex(HAIR_PRESETS, colors.hair), glowIntensityForLevel(level));
    hero.bodyMaterial.color.setHex(presetHex(OUTFIT_PRESETS, colors.outfitPrimary));
    hero.trimMaterial.color.setHex(presetHex(OUTFIT_PRESETS, colors.outfitSecondary));
    const unlockedIds = new Set(unlockedCosmetics(level).map((c) => c.id));
    for (const [id, mesh] of hero.cosmetics) {
      mesh.visible = unlockedIds.has(id);
    }
    reactions.refreshForm();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    onStoreUpdate(state, effects) {
      applyLook(state);
      urgent = isFinalTenSeconds(state);
      previewing = state.phase === 'hero-creation';
      reactions.handleEffects(effects);
    },
    frame(dtMs) {
      // The single point all render-time flows through: everything below
      // animates from this dt and nothing else. (The Game Core's TICK clock
      // never passes through here, so scaling render-time can never touch
      // the Round timer.)
      const dt = Math.min(dtMs, 100) / 1000;
      elapsed += dt;

      reactions.update(dt, elapsed, previewing);
      dummy.update(dt, elapsed, reactions.isStaggering());
      fx.update(dt, elapsed);
      stage.update(dt, elapsed, urgent);

      // Screen shake decays exponentially.
      if (shake > 0.001) {
        shake *= Math.exp(-6 * dt);
        camera.position.set(
          cameraHome.x + Math.sin(elapsed * 71) * shake * 0.25,
          cameraHome.y + Math.sin(elapsed * 89) * shake * 0.2,
          cameraHome.z,
        );
      } else {
        camera.position.copy(cameraHome);
      }

      renderer.render(scene, camera);
    },
  };
}
