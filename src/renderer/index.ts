// The three.js renderer facade. Interface: (state, effects) in via
// onStoreUpdate, plus frame(dt) from the shell's animation loop. The scene
// is assembled from focused modules — stage (environment), hero, rival,
// fx (particles/blasts), reactions (effects → animation) — wired here.

import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_COLORS,
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
import type { Focus } from './framing';
import { CAMERA_FAR, RIVAL_X, HERO_X } from './constants';
import type { Rival } from './rival';
import { createFx } from './fx';
import { applyLevelToRig, buildHero, createHeroMaterials, FORM_PALETTES, heroParts } from './hero';
import type { FormPalette, HeroMaterials } from './hero';
import { createHeroDirector } from './heroDirector';
import type { HeroDirector } from './heroDirector';
import { createPipeline } from './pipeline';
import { initialImpactGate, tryImpactFrame } from './impactFrame';
import { initialTierState, nextTier } from './qualityTier';
import { createReactions } from './reactions';
import { createStage } from './stage';
import { STYLE } from './style';

export interface Renderer {
  onStoreUpdate(state: GameState, effects: GameEffect[]): void;
  frame(dtMs: number): void;
  /** World positions of the hero's fists and boots (the hitboxes follow). */
  strikePoints(): THREE.Vector3[];
  /** A hero fist or boot touched the Rival's hurtbox. */
  strikeContact(): void;
  /** The render time scale: below 1 while a hitstop freezes the frame. */
  timeScale(): number;
  /** What the React hero (src/scene/Hero.tsx) mounts and follows. */
  hero: HeroMount;
}

/**
 * The hero's seam between React and the renderer (ADR 0009). React mounts
 * the Blender model inside the group and plays the director's clips; the
 * renderer poses the group, recolors the materials, and dresses the model
 * with light (face, aura, motes, cosmetics) once its bones exist.
 */
export interface HeroMount {
  group: THREE.Group;
  director: HeroDirector;
  materials: HeroMaterials;
  /** The model mounted (its bones exist) or unmounted (null). */
  modelReady(model: THREE.Object3D | null): void;
}

/** The parts of the frame that the R3F root owns (src/scene/mount.tsx). */
export interface RenderTarget {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The Rival's director; the Rival itself is a React component. */
  rival: Rival;
}

/** A WebGL renderer set up for the arena, handed to the R3F root. */
export function createGl(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // The CSS owns the canvas box (the arena region of the Layout); the
  // drawing buffer follows it. R3F sizes with updateStyle=true, and an
  // inline px size would pin the box, so every resize keeps the style.
  const setSize = renderer.setSize.bind(renderer);
  renderer.setSize = (width, height) => setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  return renderer;
}

/** The arena camera, handed to the R3F root. */
export function createCamera(canvas: HTMLCanvasElement): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(
    50,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    CAMERA_FAR,
  );
}

export function createRenderer({ gl: renderer, scene, camera, rival }: RenderTarget): Renderer {
  const canvas = renderer.domElement;
  // One directional shadow grounds the characters (see stage.ts).
  renderer.shadowMap.enabled = true;
  // PCF with a blur radius on the sun (stage.ts): three r185 deprecated
  // PCFSoftShadowMap, so softness comes from the light's shadow.radius.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const stage = createStage(scene);

  const rig = createCameraRig(camera);
  let focus: Focus = 'fight';
  rig.setView(camera.aspect, focus);
  const pipeline = createPipeline(renderer, scene, camera, stage.sunDisc);

  // The quality tier degrades itself on weak devices — no settings UI. The
  // rule is the pure reducer in qualityTier.ts; this just feeds it samples.
  let tierState = initialTierState;
  let sampleFrames = 0;
  let sampleSeconds = 0;

  // Hitstop: a render-time freeze on big hits, applied at the dt pipeline.
  let hitstopTimer = 0;

  // Impact frames flash only as often as the safety gate allows.
  let impactGate = initialImpactGate;
  function impactFrame() {
    const result = tryImpactFrame(impactGate, elapsed, tierState.tier);
    impactGate = result.gate;
    if (result.fire) pipeline.flashImpactFrame();
  }

  // The hero lives for the whole session: one group, one director, one set
  // of tint materials, and (once it decodes) one Blender model mounted by
  // React. A new appearance or Form only swaps the parts and the dressing.
  const heroGroup = new THREE.Group();
  heroGroup.position.set(HERO_X, 0.3, 0);
  heroGroup.rotation.y = Math.PI / 2;
  const heroMaterials = createHeroMaterials();
  const heroDirector = createHeroDirector(heroParts(DEFAULT_APPEARANCE, null));
  let heroModel: THREE.Object3D | null = null;
  let build: { appearance: HeroAppearance; palette: FormPalette | null; form: string | null } = {
    appearance: DEFAULT_APPEARANCE,
    palette: null,
    form: null,
  };
  const dressHero = () =>
    buildHero({ ...build, group: heroGroup, model: heroModel, materials: heroMaterials, director: heroDirector });
  let hero = dressHero();
  // The build key covers the Form too: hair length, hair scale, eye color
  // and aura shape are all baked in at construction.
  let appearanceKey = JSON.stringify([DEFAULT_APPEARANCE, null]);

  /** Dress the hero again when the appearance, the Form, or the model changes. */
  function rebuildHero() {
    hero.dispose();
    hero = dressHero();
  }

  // The Blender hero decodes a moment after boot: dress it at once.
  let lastState: GameState | null = null;
  function heroModelReady(model: THREE.Object3D | null) {
    heroModel = model;
    rebuildHero();
    if (lastState) applyLook(lastState);
    reactions.refreshForm();
  }

  const fx = createFx(scene, (big) => {
    if (big) {
      rival.launch();
      rig.addShake(0.4);
      fx.comicBurst(new THREE.Vector3(RIVAL_X - 0.3, 1.7, 0));
      impactFrame();
    } else {
      // Small blasts only exist while transformed — always a strong hit.
      rival.hit(true);
    }
  });

  const reactions = createReactions({
    getHero: () => hero,
    rival,
    fx,
    juice: {
      addShake: (amount) => rig.addShake(amount),
      hitstop: () => {
        hitstopTimer = Math.max(hitstopTimer, STYLE.juice.hitstop.duration);
      },
      punchCamera: () => rig.punch(),
      nudgeCamera: () => rig.nudge(),
      speedLines: () => pipeline.flashSpeedLines(),
      impactFrame,
    },
  });

  let elapsed = 0;
  let urgent = false; // final ten seconds of the Round
  let previewing = false; // hero creation: face the camera, not the rival
  let inRound = false; // fps sampling only counts real play

  function applyLook(state: GameState) {
    // During hero creation the draft is previewed live on the 3D character.
    // With no Player chosen yet (the Title screen), a new hero's look stands in.
    const player = state.players.find((p) => p.id === state.activePlayerId);
    const draft = state.phase === 'hero-creation' ? state.draft : null;
    const colors = draft?.colors ?? player?.colors ?? DEFAULT_COLORS;
    const appearance = draft?.appearance ?? player?.appearance ?? DEFAULT_APPEARANCE;
    const level = draft ? 0 : levelForXp(player?.xp ?? 0);

    // The Form a hero has earned — never during hero creation, where the
    // Player is looking at their own chosen colors.
    const form = draft ? undefined : formForLevel(level);
    const palette = form ? (FORM_PALETTES[form.id] ?? null) : null;

    const key = JSON.stringify([appearance, form?.id ?? null]);
    if (key !== appearanceKey) {
      appearanceKey = key;
      build = { appearance, palette, form: form?.id ?? null };
      rebuildHero();
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

  // The arena region changes with the window, a turned device, and the
  // stacked Round; the canvas box is the one source of its size.
  new ResizeObserver(() => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    rig.setView(camera.aspect, focus);
    pipeline.setSize(width, height);
  }).observe(canvas);

  const strikePointCache: THREE.Vector3[] = [];

  return {
    hero: {
      group: heroGroup,
      director: heroDirector,
      materials: heroMaterials,
      modelReady: heroModelReady,
    },
    onStoreUpdate(state, effects) {
      lastState = state;
      applyLook(state);
      urgent = isFinalTenSeconds(state);
      previewing = state.phase === 'hero-creation';
      // The fight in the side view; the hero alone where the hero is the
      // show: creation, and Results with its level-up ceremonies.
      const nextFocus = previewing || state.phase === 'results' ? 'hero' : 'fight';
      if (nextFocus !== focus) {
        focus = nextFocus;
        rig.setView(camera.aspect, focus);
      }
      inRound = state.phase === 'in-round';
      reactions.handleEffects(effects);
    },
    strikePoints() {
      // The shown body's fists and boots (hero-rig.json), on its bones.
      return hero.strikes.map(({ joint, offset }, i) => {
        const point = (strikePointCache[i] ??= new THREE.Vector3());
        return hero.joints[joint].localToWorld(point.copy(offset));
      });
    },
    strikeContact() {
      reactions.strikeContact();
    },
    timeScale() {
      return hitstopTimer > 0 ? STYLE.juice.hitstop.timeScale : 1;
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
      fx.update(dt, elapsed);
      stage.update(dt, elapsed, urgent);
      rig.update(dt, elapsed);

      pipeline.render(dt);
    },
  };
}
