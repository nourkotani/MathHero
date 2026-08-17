// The three.js renderer facade. Interface: (state, effects) in via
// onStoreUpdate, plus frame(dt) from the shell's animation loop. The scene
// is assembled from focused modules — stage (environment), hero, dummy,
// fx (particles/blasts), reactions (effects → animation) — wired here.

import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  formForLevel,
  glowIntensityForLevel,
  HAIR_PRESETS,
  isFinalTenSeconds,
  levelForXp,
  OUTFIT_PRESETS,
  presetHex,
  wornCosmetics,
} from '../core';
import type { GameEffect, GameState, HeroAppearance } from '../core';
import { createCameraRig } from './cameraRig';
import { HERO_X } from './constants';
import { createDummy } from './dummy';
import { createFx, freeMesh } from './fx';
import { applyLevelToRig, buildHero, FORM_PALETTES } from './hero';
import type { FormPalette } from './hero';
import { createPipeline } from './pipeline';
import { initialTierState, nextTier } from './qualityTier';
import { createReactions } from './reactions';
import { createStage } from './stage';
import { STYLE } from './style';

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
  // PCF with a blur radius on the sun (stage.ts): three r185 deprecated
  // PCFSoftShadowMap, so softness comes from the light's shadow.radius.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const stage = createStage(scene);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  const rig = createCameraRig(camera);
  const pipeline = createPipeline(renderer, scene, camera, stage.sunDisc);

  // The quality tier degrades itself on weak devices — no settings UI. The
  // rule is the pure reducer in qualityTier.ts; this just feeds it samples.
  let tierState = initialTierState;
  let sampleFrames = 0;
  let sampleSeconds = 0;

  // Hitstop: a render-time freeze on big hits, applied at the dt pipeline.
  let hitstopTimer = 0;

  let hero = buildHero(DEFAULT_APPEARANCE, null);
  // The build key covers the Form too: hair length, hair scale, eye color
  // and aura shape are all baked in at construction.
  let appearanceKey = JSON.stringify([DEFAULT_APPEARANCE, null]);
  placeHero();
  scene.add(hero.group);

  function placeHero() {
    hero.group.position.set(HERO_X, 0.3, 0);
    hero.group.rotation.y = Math.PI / 2;
  }

  /** Swap the character model when the appearance or the Form changes. */
  function rebuildHero(appearance: HeroAppearance, palette: FormPalette | null) {
    scene.remove(hero.group);
    hero.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) freeMesh(obj);
    });
    hero = buildHero(appearance, palette);
    placeHero();
    scene.add(hero.group);
  }

  const dummy = createDummy();
  scene.add(dummy.group);

  const fx = createFx(scene, (big) => {
    if (big) {
      dummy.launch();
      rig.addShake(0.4);
    } else {
      // Small blasts only exist while transformed — always a strong hit.
      dummy.hit(true);
    }
  });

  const reactions = createReactions({
    getHero: () => hero,
    dummy,
    fx,
    juice: {
      addShake: (amount) => rig.addShake(amount),
      hitstop: () => {
        hitstopTimer = Math.max(hitstopTimer, STYLE.juice.hitstop.duration);
      },
      punchCamera: () => rig.punch(),
      speedLines: () => pipeline.flashSpeedLines(),
    },
  });

  let elapsed = 0;
  let urgent = false; // final ten seconds of the Round
  let previewing = false; // hero creation: face the camera, not the dummy
  let inRound = false; // fps sampling only counts real play

  function applyLook(state: GameState) {
    // During hero creation the draft is previewed live on the 3D character.
    const player = state.players.find((p) => p.id === state.activePlayerId);
    const draft = state.phase === 'hero-creation' ? state.draft : null;
    const colors = draft?.colors ?? player?.colors;
    const appearance = draft?.appearance ?? player?.appearance;
    if (!colors || !appearance) return;
    const level = draft ? 0 : levelForXp(player?.xp ?? 0);

    // The Form a hero has earned — never during hero creation, where the
    // Player is looking at their own chosen colors.
    const form = draft ? undefined : formForLevel(level);
    const palette = form ? (FORM_PALETTES[form.id] ?? null) : null;

    const key = JSON.stringify([appearance, form?.id ?? null]);
    if (key !== appearanceKey) {
      appearanceKey = key;
      rebuildHero(appearance, palette);
    }
    reactions.setPlayerLook(
      presetHex(HAIR_PRESETS, colors.hair),
      glowIntensityForLevel(level),
      palette,
    );
    applyLevelToRig(hero, level);
    hero.bodyMaterial.color.setHex(presetHex(OUTFIT_PRESETS, colors.outfitPrimary));
    hero.trimMaterial.color.setHex(presetHex(OUTFIT_PRESETS, colors.outfitSecondary));
    // Evolution, not accumulation: only the highest unlocked tier per slot
    // is worn, so a veteran hero reads grander, never more cluttered.
    const wornIds = new Set(wornCosmetics(level).map((c) => c.id));
    for (const [id, mesh] of hero.cosmetics) {
      mesh.visible = wornIds.has(id);
    }
    reactions.refreshForm();
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    pipeline.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    onStoreUpdate(state, effects) {
      applyLook(state);
      urgent = isFinalTenSeconds(state);
      previewing = state.phase === 'hero-creation';
      inRound = state.phase === 'in-round';
      reactions.handleEffects(effects);
    },
    frame(dtMs) {
      // The single point all render-time flows through: everything below
      // animates from this dt and nothing else. Hitstop scales it to a
      // near-freeze for a beat — render-only by construction, because the
      // Game Core's TICK clock never passes through here, so the Round
      // timer cannot be touched.
      const rawDt = Math.min(dtMs, 100) / 1000;
      let dt = rawDt;
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - rawDt);
        dt = rawDt * STYLE.juice.hitstop.timeScale;
      }
      elapsed += dt;

      // Once a second of real play, feed the averaged frame rate to the
      // tier rule. Menus and background tabs don't count: a throttled
      // hidden tab must never degrade the session's look.
      if (inRound && !document.hidden) {
        sampleFrames += 1;
        sampleSeconds += rawDt;
        if (sampleSeconds >= 1) {
          const next = nextTier(tierState, sampleFrames / sampleSeconds);
          if (next.tier !== tierState.tier) pipeline.setTier(next.tier);
          tierState = next;
          sampleFrames = 0;
          sampleSeconds = 0;
        }
      } else {
        sampleFrames = 0;
        sampleSeconds = 0;
      }

      reactions.update(dt, elapsed, previewing);
      dummy.update(dt, elapsed, reactions.isStaggering());
      fx.update(dt, elapsed);
      stage.update(dt, elapsed, urgent);
      rig.update(dt, elapsed);

      pipeline.render(dt);
    },
  };
}
