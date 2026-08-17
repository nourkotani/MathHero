// The hero: an original, DBZ-inspired (never copied) anime-style fighter,
// procedurally assembled from the chosen appearance, plus the streak-form
// looks that transform it.

import * as THREE from 'three';
import { presetHex, SKIN_PRESETS } from '../core';
import type { HairStyle, HeroAppearance, StreakForm } from '../core';
import {
  characterSurface,
  cosmeticPanel,
  cosmeticSprite,
  faceDecal,
  glowSurface,
  markBloom,
} from './materials';
import { STYLE } from './style';
import type { Surface } from './materials';
import { applyCelTreatment } from './cel';
import clothUrl from './textures/cloth.png';
import faceBoyUrl from './textures/face-boy.png';
import faceGirlUrl from './textures/face-girl.png';
import featherUrl from './textures/feather.png';
import irisBoyUrl from './textures/iris-boy.png';
import irisGirlUrl from './textures/iris-girl.png';
import hairStrandsUrl from './textures/hair-strands.png';
import haloRingUrl from './textures/halo-ring.png';
import streakUrl from './textures/streak.png';
import wispUrl from './textures/wisp.png';

/**
 * Render-time motion a cosmetic piece can carry. Pieces declare what they
 * do; the frame loop applies it, so no site animates a cosmetic by name.
 */
export interface Motion {
  /** Radians per second about the hero's up axis. */
  spin?: number;
  /** Vertical drift about the rest height. */
  bob?: { amp: number; speed: number };
  /** Wing beat: roll about the shoulder, mirrored per side by amp's sign. */
  flap?: { amp: number; speed: number };
  /** Breathing scale about the rest size. */
  pulse?: { amp: number; speed: number };
}

/** One animated cosmetic piece, with the rest pose captured at build time. */
export interface CosmeticMotor {
  object: THREE.Object3D;
  motion: Motion;
  restY: number;
  restRoll: number;
  restScale: number;
}

/**
 * A hero's look is `Form palette × Streak intensity`, and each factor has
 * exactly one home: FORM_PALETTES below says what an ascended hero IS,
 * FORM_LOOKS says how hard they are pushing. composeLook multiplies them.
 *
 * A hero who has not earned a Form yet uses FORM_LOOKS alone — which is
 * precisely the game as it shipped before Forms existed, gold Super hair
 * and all.
 */
export interface FormPalette {
  /** Hair color while in this Form; the chosen color waits underneath. */
  hair: number;
  /** Iris color — the quiet signal that a hero has changed. */
  eye: number;
  auraColor: number;
  sparkColor: number;
  hitColor: number;
  /** Aura lobe amplitude: high burns jagged and fierce, low flows smooth. */
  lobes: number;
  /** Energy arcs per second at rest, before the Streak's multiplier. */
  restArcs: number;
  /** Rising motes per second at rest. */
  restMotes: number;
  /** The aura never fully dies once a Form is earned. */
  restAura: number;
  /** Hair grows and stiffens with power. */
  hairScale: number;
  /** The long-maned Form forces the full mane whatever was chosen. */
  mane: boolean;
}

/** Keyed by the core's Form ids (see FORMS in level.ts). */
export const FORM_PALETTES: Record<string, FormPalette> = {
  'gold-spark': {
    hair: 0xffd94a, eye: 0x6fe3c4, auraColor: 0xffc44d, sparkColor: 0xffe9a3, hitColor: 0xffd24d,
    lobes: 0.13, restArcs: 0, restMotes: 2, restAura: 0.1, hairScale: 1.08, mane: false,
  },
  'storm-gold': {
    hair: 0xffe14d, eye: 0x7de3ff, auraColor: 0xffd24d, sparkColor: 0x9be7ff, hitColor: 0x7ad7ff,
    lobes: 0.2, restArcs: 2.5, restMotes: 2, restAura: 0.14, hairScale: 1.16, mane: false,
  },
  'wild-mane': {
    hair: 0xffe98a, eye: 0x8ef0d0, auraColor: 0xffcf5a, sparkColor: 0xfff3b0, hitColor: 0xffe14d,
    lobes: 0.24, restArcs: 3, restMotes: 3, restAura: 0.2, hairScale: 1.3, mane: true,
  },
  'crimson-sage': {
    hair: 0xd63a4a, eye: 0xff9db0, auraColor: 0xff4d5e, sparkColor: 0xffb3bd, hitColor: 0xff6b7a,
    lobes: 0.05, restArcs: 0.8, restMotes: 4, restAura: 0.24, hairScale: 1.12, mane: false,
  },
  'rose-dawn': {
    hair: 0xff8fc4, eye: 0xffd0e8, auraColor: 0xff6fb5, sparkColor: 0xffc2e6, hitColor: 0xff8fd0,
    lobes: 0.07, restArcs: 1.5, restMotes: 6, restAura: 0.28, hairScale: 1.16, mane: false,
  },
  legend: {
    hair: 0xeaf2ff, eye: 0xdfe9f5, auraColor: 0xcfe4ff, sparkColor: 0xffffff, hitColor: 0xeaf4ff,
    lobes: 0.03, restArcs: 0.6, restMotes: 8, restAura: 0.3, hairScale: 1.14, mane: false,
  },
};

/** The iris a hero wears before any Form: plain warm brown. */
export const BASE_EYE = 0x3e2c22;
/** The aura's default lobe amplitude — the shape the game always had. */
export const BASE_LOBES = 0.13;

// Visual treatment per streak form, keyed by the core's form names — the ONE
// place a form's INTENSITY lives; no site may special-case a form by name.
// hair: null keeps the Player's own hair color.
export const FORM_LOOKS: Record<
  StreakForm,
  {
    hair: number | null;
    auraColor: number;
    auraOpacity: number;
    emissive: number;
    /** What the gi radiates (base heroes carry only their level glow, in white). */
    bodyEmissive: number;
    /** Charge crackle and impact sparks. */
    hitColor: number;
    /** The rising aura motes. */
    sparkColor: number;
    /** Lightning arcs per second this form crackles with (0 = none). */
    arcRate: number;
    /** Do this form's hits freeze the frame for a beat? */
    hitstop: boolean;
  }
> = {
  // Opacities are per shell; the aura's two nested shells overlap, so the
  // perceived density is roughly double what's written here.
  base: { hair: null, auraColor: 0x000000, auraOpacity: 0, emissive: 0, bodyEmissive: 0xffffff, hitColor: 0xffffff, sparkColor: 0xffe9a3, arcRate: 0, hitstop: false },
  aura: { hair: null, auraColor: 0x3ac0ff, auraOpacity: 0.28, emissive: 0.15, bodyEmissive: 0x3ac0ff, hitColor: 0x3ac0ff, sparkColor: 0x3ac0ff, arcRate: 0, hitstop: false },
  surge: { hair: 0xffe14d, auraColor: 0x8f5aff, auraOpacity: 0.34, emissive: 0.35, bodyEmissive: 0x8f5aff, hitColor: 0x8f5aff, sparkColor: 0x8f5aff, arcRate: 3, hitstop: true },
  super: { hair: 0xffd700, auraColor: 0xffb300, auraOpacity: 0.4, emissive: 0.6, bodyEmissive: 0xffb300, hitColor: 0xffb300, sparkColor: 0xffb300, arcRate: 5, hitstop: true },
};

/** Joint pivots the frame loop poses every frame. Limb meshes hang inside. */
export interface HeroJoints {
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
}

export interface HeroRig {
  group: THREE.Group;
  joints: HeroJoints;
  hairMaterials: Surface[];
  bodyMaterial: Surface;
  trimMaterial: Surface;
  /** Two counter-rotating flame shells: the outer sheet and the hot core. */
  aura: THREE.Group;
  auraOuter: THREE.Mesh;
  auraInner: THREE.Mesh;
  auraMaterial: THREE.MeshBasicMaterial;
  /** The inner shell's own material — the same hue driven toward white. */
  auraCoreMaterial: THREE.MeshBasicMaterial;
  /** Milestone cosmetic meshes keyed by their table id; hidden until unlocked. */
  cosmetics: Map<string, THREE.Object3D>;
  /** Every cosmetic piece that animates, with its rest pose. */
  cosmeticMotors: CosmeticMotor[];
  /** Hero-Level presence: the orbiting mote ring (spun by the frame loop). */
  powerMotes: THREE.Group;
  moteMeshes: THREE.Sprite[];
  moteMaterial: THREE.SpriteMaterial;
}

/** The effective look: what the hero IS, turned up by how hard they push. */
export interface ComposedLook {
  hair: number | null;
  auraColor: number;
  auraOpacity: number;
  emissive: number;
  bodyEmissive: number;
  hitColor: number;
  sparkColor: number;
  arcRate: number;
  moteRate: number;
  hitstop: boolean;
}

/**
 * Compose a Form's palette with a Streak's intensity. With no Form the
 * Streak's own table answers alone, so an unascended hero is untouched by
 * this whole system.
 */
export function composeLook(streak: StreakForm, palette: FormPalette | null): ComposedLook {
  const push = FORM_LOOKS[streak];
  const moteRate = STREAK_MOTES[streak];
  if (palette === null) return { ...push, moteRate };
  return {
    ...push,
    // The Form owns every color; the Streak owns how loud it gets.
    hair: palette.hair,
    auraColor: palette.auraColor,
    bodyEmissive: palette.auraColor,
    hitColor: palette.hitColor,
    sparkColor: palette.sparkColor,
    auraOpacity: Math.max(palette.restAura, push.auraOpacity),
    arcRate: palette.restArcs + push.arcRate,
    moteRate: palette.restMotes + moteRate,
  };
}

/** Rising aura motes per second, by Streak alone (pre-Form behaviour). */
const STREAK_MOTES: Record<StreakForm, number> = { base: 0, aura: 14, surge: 22, super: 34 };

/** Dress the rig for a streak form, blended with the Player's permanent glow. */
export function applyFormToRig(
  rig: HeroRig,
  form: StreakForm,
  playerHair: number,
  playerGlow: number,
  palette: FormPalette | null = null,
): void {
  const look = composeLook(form, palette);
  const hairHex = look.hair ?? playerHair;
  for (const spike of rig.hairMaterials) {
    spike.color.setHex(hairHex);
    spike.emissive.setHex(hairHex);
    spike.emissiveIntensity = Math.max(look.emissive, playerGlow * 0.5);
  }
  rig.bodyMaterial.emissive.setHex(look.bodyEmissive);
  rig.bodyMaterial.emissiveIntensity = Math.max(look.emissive, playerGlow * 0.25);
  rig.auraMaterial.color.setHex(look.auraColor);
  rig.auraMaterial.opacity = Math.max(look.auraOpacity, playerGlow * 0.2);
  // The core burns the same hue, driven toward white and denser — the flame
  // reads hottest against the hero's silhouette.
  rig.auraCoreMaterial.color.setHex(look.auraColor).lerp(new THREE.Color(0xffffff), 0.45);
  rig.auraCoreMaterial.opacity = Math.min(1, Math.max(look.auraOpacity * 1.7, playerGlow * 0.25));
}

/**
 * Dress the rig for its Hero Level: charged trim (belt, wristbands, boots)
 * and the orbiting power motes — one per few levels, so a veteran hero
 * visibly carries their training even in base form.
 */
export function applyLevelToRig(rig: HeroRig, level: number): void {
  const bracket =
    STYLE.levelStyle.brackets.find((b) => level >= b.min) ?? STYLE.levelStyle.brackets.at(-1);
  if (!bracket) return;
  rig.trimMaterial.emissive.setHex(bracket.energy);
  rig.trimMaterial.emissiveIntensity = bracket.trimGlow;
  rig.moteMaterial.color.setHex(bracket.energy);
  const count = Math.min(
    STYLE.levelStyle.maxMotes,
    Math.floor(level / STYLE.levelStyle.levelsPerMote),
  );
  rig.moteMeshes.forEach((mote, i) => {
    mote.visible = i < count;
  });
}

/**
 * An original, DBZ-inspired (never copied) anime-style hero, assembled from
 * the chosen appearance: body style, hair style and length, garment, and
 * skin tone. The body is an articulated rig — shoulders, elbows, hips,
 * knees, torso, and head are pivot groups the animation loop poses.
 *
 * Rig layout (group-local y, feet at 0): hips 0.88, torso pivot 1.0,
 * shoulders 1.7, head pivot 1.88, head center ~2.04.
 */
export function buildHero(
  appearance: HeroAppearance,
  palette: FormPalette | null = null,
): HeroRig {
  const group = new THREE.Group();
  const girl = appearance.body === 'girl';

  const bodyMaterial = characterSurface(0x3a6fd8, clothUrl);
  const trimMaterial = characterSurface(0xff9f1c, clothUrl);
  const skinMaterial = characterSurface(presetHex(SKIN_PRESETS, appearance.skinTone));

  // Pelvis: the gi's trousers. Girls get wider hips, boys a blockier seat.
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), bodyMaterial);
  pelvis.position.y = 0.92;
  pelvis.scale.set(girl ? 1.2 : 1.05, 0.55, girl ? 0.85 : 0.8);
  group.add(pelvis);

  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(girl ? 0.37 : 0.42, girl ? 0.37 : 0.42, 0.14, 16),
    trimMaterial,
  );
  belt.position.y = 1.03;
  belt.scale.z = 0.78;
  group.add(belt);

  // The martial-arts sash: a tied knot at the front with two hanging tails.
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), trimMaterial);
  knot.position.set(0, 1.0, girl ? 0.26 : 0.3);
  knot.scale.set(1.2, 0.8, 0.7);
  group.add(knot);
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.025), trimMaterial);
    tail.position.set(side * 0.07, 0.88, girl ? 0.25 : 0.29);
    tail.rotation.z = side * 0.18;
    group.add(tail);
  }

  // The gi's lower flap over the trousers (armor wears a solid suit instead).
  if (appearance.garment !== 'armor') {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.05), bodyMaterial);
    flap.position.set(0, 0.84, girl ? 0.2 : 0.24);
    flap.rotation.x = 0.14;
    group.add(flap);
  }

  // Torso pivot: leaning and twisting happen here; arms and head ride along.
  const torso = new THREE.Group();
  torso.position.y = 1.0;
  group.add(torso);

  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.3, 6, 12), bodyMaterial);
  chest.position.y = 0.35;
  chest.scale.set(girl ? 0.85 : 1.05, 1, girl ? 0.72 : 0.8);
  torso.add(chest);

  if (girl) {
    // A modest chest contour under the gi — silhouette, nothing more.
    const contour = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), bodyMaterial);
    contour.position.set(0, 0.5, 0.16);
    contour.scale.set(1.15, 0.7, 0.75);
    torso.add(contour);
  }

  // The gi's crossed collar: two trim bands meeting in a V at the chest
  // (battle armor's plate covers the same spot, so it goes without).
  if (appearance.garment !== 'armor') {
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.03), trimMaterial);
      lapel.position.set(side * 0.1, 0.56, girl ? 0.24 : 0.29);
      lapel.rotation.z = side * 0.55;
      torso.add(lapel);
    }
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.16, 10), skinMaterial);
  neck.position.y = 0.78;
  torso.add(neck);

  // Head pivot: nods, shakes, and the hair all swing together.
  const head = new THREE.Group();
  head.position.y = 0.88;
  torso.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), skinMaterial);
  skull.position.y = 0.16;
  head.add(skull);

  // The painted anime face: a transparent decal on a sphere segment just
  // off the skull, so every skin tone shows through around the features.
  // The girl's variant carries the larger eyes and the lash flicks.
  const faceShape = () =>
    new THREE.SphereGeometry(0.35, 24, 16, Math.PI / 2 - 0.95, 1.9, 0.85, 1.45);
  const face = new THREE.Mesh(faceShape(), faceDecal(girl ? faceGirlUrl : faceBoyUrl));
  face.position.y = 0.16;
  face.renderOrder = 1;
  head.add(face);

  // The irises ride their own sheet so a Form can change the hero's eyes
  // without rebaking a whole face per Form.
  const irisMaterial = faceDecal(girl ? irisGirlUrl : irisBoyUrl);
  irisMaterial.color.setHex(palette?.eye ?? BASE_EYE);
  const irises = new THREE.Mesh(faceShape(), irisMaterial);
  irises.position.y = 0.16;
  irises.renderOrder = 2;
  head.add(irises);

  // Anime hair from the chosen style; every strand shares the swappable
  // hair materials so streak forms and player colors recolor them all.
  const hairMaterials: Surface[] = [];
  const hairMat = () => {
    const material = characterSurface(0x2b2b2b, hairStrandsUrl);
    hairMaterials.push(material);
    return material;
  };
  // Hair grows and stiffens with the Form; the maned Form takes the full
  // mane whatever length was chosen. Scaling the whole do from the head
  // pivot is what makes a powered-up hero's hair visibly rise.
  const hairGroup = new THREE.Group();
  hairGroup.scale.setScalar(palette?.hairScale ?? 1);
  head.add(hairGroup);
  buildHair(
    hairGroup,
    appearance.hairStyle,
    appearance.hairLength === 'long' || palette?.mane === true,
    hairMat,
  );

  // Arms: shoulder pivot → upper arm → elbow pivot → forearm, band, fist.
  const shoulderX = girl ? 0.47 : 0.55;
  const armW = girl ? 0.11 : 0.12;
  const buildArm = (side: number): [THREE.Group, THREE.Group] => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * shoulderX, 0.7, 0);
    torso.add(shoulder);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(armW, 0.26, 4, 8), bodyMaterial);
    upper.position.y = -0.17;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(armW - 0.015, 0.24, 4, 8), skinMaterial);
    forearm.position.y = -0.15;
    elbow.add(forearm);

    // Martial-artist wristbands in the outfit's trim color.
    const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.12, 10), trimMaterial);
    wristband.position.y = -0.28;
    elbow.add(wristband);

    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skinMaterial);
    fist.position.y = -0.4;
    elbow.add(fist);

    return [shoulder, elbow];
  };
  const [armL, elbowL] = buildArm(-1);
  const [armR, elbowR] = buildArm(1);

  // Legs: hip pivot → thigh → knee pivot → shin and boot.
  const hipX = girl ? 0.21 : 0.2;
  const legW = girl ? 0.15 : 0.16;
  const buildLeg = (side: number): [THREE.Group, THREE.Group] => {
    const hip = new THREE.Group();
    hip.position.set(side * hipX, 0.88, 0);
    group.add(hip);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(legW, 0.3, 4, 8), bodyMaterial);
    thigh.position.y = -0.21;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(legW - 0.025, 0.26, 4, 8), bodyMaterial);
    shin.position.y = -0.17;
    knee.add(shin);

    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.22, 10), trimMaterial);
    boot.position.set(0, -0.36, 0.03);
    knee.add(boot);

    return [hip, knee];
  };
  const [legL, kneeL] = buildLeg(-1);
  const [legR, kneeR] = buildLeg(1);

  // Garments beyond the basic gi.
  if (appearance.garment === 'cape') {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.4, 0.05), trimMaterial);
    cape.position.set(0, 0.05, -0.38);
    cape.rotation.x = 0.12;
    torso.add(cape);
  } else if (appearance.garment === 'armor') {
    const plate = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.34, 6, 12), trimMaterial);
    plate.position.y = 0.38;
    plate.scale.set(girl ? 0.92 : 1.1, 0.85, girl ? 0.8 : 0.9);
    torso.add(plate);
    for (const shoulder of [armL, armR]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), trimMaterial);
      pad.position.y = 0.02;
      pad.scale.set(1.2, 0.8, 1.1);
      shoulder.add(pad);
    }
  }

  // Front faces only: with two nested shells, double-sided rendering would
  // stack four color layers and wall the hero off inside the flame.
  const auraMaterial = glowSurface(0x3ac0ff, 0);
  const auraCoreMaterial = glowSurface(0x9adfff, 0);
  // The aura is a teardrop of flame wrapped around the fighter: two shells
  // of the same lobed profile — the smaller inner one is the hot core,
  // whiter and denser, and counter-rotation makes the fire churn.
  const auraGeometry = buildAuraGeometry(palette?.lobes ?? BASE_LOBES);
  const auraOuter = new THREE.Mesh(auraGeometry, auraMaterial);
  const auraInner = new THREE.Mesh(auraGeometry, auraCoreMaterial);
  markBloom(auraOuter);
  markBloom(auraInner);
  auraInner.scale.set(0.62, 0.82, 0.62);
  const aura = new THREE.Group();
  aura.add(auraOuter);
  aura.add(auraInner);
  aura.position.y = 0.02;
  group.add(aura);

  // The power-mote ring: small energy shards orbiting the fighter, revealed
  // one by one as Hero Levels climb. The frame loop spins the group.
  const powerMotes = new THREE.Group();
  powerMotes.position.y = 1.05;
  // Soft twinkling glow, like every other mote of energy in the game — a
  // bare polyhedron read as a floating grey gem.
  const moteMaterial = cosmeticSprite(wispUrl, 0xffffff, 0.9);
  const moteMeshes: THREE.Sprite[] = [];
  for (let i = 0; i < STYLE.levelStyle.maxMotes; i++) {
    const mote = new THREE.Sprite(moteMaterial);
    mote.scale.setScalar(0.34);
    const angle = (i / STYLE.levelStyle.maxMotes) * Math.PI * 2;
    mote.position.set(Math.cos(angle) * 0.8, Math.sin(angle * 3) * 0.06, Math.sin(angle) * 0.8);
    markBloom(mote);
    mote.visible = false;
    powerMotes.add(mote);
    moteMeshes.push(mote);
  }
  group.add(powerMotes);

  const cosmeticMotors: CosmeticMotor[] = [];
  const cosmetics = buildCosmetics(cosmeticMotors);
  for (const mesh of cosmetics.values()) {
    mesh.visible = false;
    // Cosmetic energy glows for real; children too (wisps, wings, halos).
    mesh.traverse(markBloom);
    group.add(mesh);
  }

  applyCelTreatment(group);

  return {
    group,
    joints: { torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR },
    hairMaterials,
    bodyMaterial,
    trimMaterial,
    aura,
    auraOuter,
    auraInner,
    auraMaterial,
    auraCoreMaterial,
    cosmetics,
    cosmeticMotors,
    powerMotes,
    moteMeshes,
    moteMaterial,
  };
}

/**
 * The aura's flame: a teardrop profile that follows the hero's silhouette —
 * rounded at the boots, widest at the torso, tapering to a point above the
 * hair — with radial lobes sculpted in so the rim licks like fire when the
 * shells rotate.
 */
function buildAuraGeometry(lobeAmplitude = BASE_LOBES): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.62, 0.12),
    new THREE.Vector2(0.82, 0.55),
    new THREE.Vector2(0.88, 1.0),
    new THREE.Vector2(0.78, 1.55),
    new THREE.Vector2(0.6, 2.1),
    new THREE.Vector2(0.4, 2.6),
    new THREE.Vector2(0.2, 3.0),
    new THREE.Vector2(0.0, 3.35),
  ];
  const geometry = new THREE.LatheGeometry(profile, 22);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const theta = Math.atan2(z, x);
    const lobe = 1 + lobeAmplitude * Math.sin(theta * 3 + y * 2.2);
    position.setX(i, x * lobe);
    position.setZ(i, z * lobe);
  }
  return geometry;
}

type HairMat = () => Surface;

/**
 * Anime hair styles, each in a short and a long variant, built in head-pivot
 * space so the whole do swings with every nod and shake.
 */
function buildHair(head: THREE.Object3D, style: HairStyle, long: boolean, hairMat: HairMat): void {
  const spike = (
    x: number,
    y: number,
    z: number,
    tiltX: number,
    tiltZ: number,
    radius = 0.14,
    height = 0.55,
  ) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6), hairMat());
    // Glowing hair is a Power Streak reward: dark at rest (under the bloom
    // pass's luminance floor), radiant gold in surge and Super mode.
    markBloom(cone);
    cone.position.set(x, y, z);
    cone.rotation.x = tiltX;
    cone.rotation.z = tiltZ;
    head.add(cone);
  };
  const cap = (radiusScale: number, flatten: number, y: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.37 * radiusScale, 16, 12), hairMat());
    markBloom(mesh);
    mesh.scale.set(1, flatten, 1);
    mesh.position.y = y;
    head.add(mesh);
  };

  switch (style) {
    case 'spiky': {
      spike(0, 0.74, 0, 0, 0);
      spike(0.18, 0.67, 0.05, 0, -0.5);
      spike(-0.18, 0.67, 0.05, 0, 0.5);
      spike(0.1, 0.62, -0.18, 0.5, -0.25);
      spike(-0.1, 0.62, -0.18, 0.5, 0.25);
      spike(0.05, 0.64, 0.2, -0.45, -0.15);
      spike(-0.05, 0.64, 0.2, -0.45, 0.15);
      // Temple spikes flaring past the ears widen the classic silhouette.
      spike(0.28, 0.42, 0.03, 0.1, -1.05, 0.1, 0.42);
      spike(-0.28, 0.42, 0.03, 0.1, 1.05, 0.1, 0.42);
      spike(0.16, 0.52, 0.22, -0.55, -0.55, 0.09, 0.34);
      spike(-0.16, 0.52, 0.22, -0.55, 0.55, 0.09, 0.34);
      if (long) {
        // A wild mane cascading down the back.
        spike(0.14, 0.12, -0.34, 2.7, -0.1, 0.13, 0.85);
        spike(-0.14, 0.12, -0.34, 2.7, 0.1, 0.13, 0.85);
        spike(0, 0.02, -0.38, 2.8, 0, 0.15, 1.0);
      }
      break;
    }
    case 'flame': {
      // One big swept-back flame of hair, with a defiant front lick.
      spike(0, 0.67, -0.05, -0.55, 0, 0.24, long ? 1.1 : 0.75);
      spike(0.14, 0.57, -0.12, -0.7, -0.2, 0.18, long ? 0.9 : 0.6);
      spike(-0.14, 0.57, -0.12, -0.7, 0.2, 0.18, long ? 0.9 : 0.6);
      spike(0.06, 0.56, 0.18, -1.0, -0.3, 0.1, 0.4);
      spike(-0.1, 0.53, 0.16, -0.9, 0.35, 0.08, 0.32);
      break;
    }
    case 'ponytail': {
      // High and flat enough that the hairline sits above the brows.
      cap(1.0, 0.6, 0.34);
      // Side bangs hug the temples — they frame the face, never cover it.
      spike(0.3, 0.34, 0.1, -0.1, -1.15, 0.07, 0.3);
      spike(-0.3, 0.34, 0.1, -0.1, 1.15, 0.07, 0.3);
      spike(0, 0.47, -0.3, 2.45, 0, 0.12, long ? 0.9 : 0.5);
      if (long) spike(0, -0.13, -0.42, 2.9, 0, 0.1, 0.7);
      break;
    }
    case 'buzz': {
      cap(long ? 1.06 : 1.0, long ? 0.75 : 0.6, long ? 0.3 : 0.34);
      // A short widow's-peak fringe so the cut reads on purpose, not bald.
      spike(0, 0.4, 0.3, -1.25, 0, 0.09, 0.22);
      spike(0.12, 0.38, 0.27, -1.2, -0.3, 0.07, 0.18);
      spike(-0.12, 0.38, 0.27, -1.2, 0.3, 0.07, 0.18);
      break;
    }
  }
}

/**
 * The milestone cosmetics: one entry per tier id in the core's table.
 *
 * These are light, not plastic. Anything that glows is a baked alpha shape
 * on a plane or sprite — feathers with a real silhouette, halo rings with
 * falloff, streaks that taper — additively blended so overlapping pieces
 * flare together. Only the crowns keep solid geometry, because a crown is
 * an object a hero wears. Every piece that should live registers a motor
 * (see CosmeticMotor); the frame loop animates those and nothing here
 * needs to know when it runs.
 */
function buildCosmetics(motors: CosmeticMotor[]): Map<string, THREE.Object3D> {
  const cosmetics = new Map<string, THREE.Object3D>();
  const S = STYLE.cosmetics;

  /** Register render-time motion for a piece, capturing its rest pose. */
  const moves = <T extends THREE.Object3D>(object: T, motion: Motion): T => {
    motors.push({
      object,
      motion,
      restY: object.position.y,
      restRoll: object.rotation.z,
      restScale: object.scale.x,
    });
    return object;
  };

  /** A flat light panel (feather, halo ring, streak) of the given size. */
  const panel = (url: string, color: number, w: number, h: number, opacity = 1) =>
    new THREE.Mesh(new THREE.PlaneGeometry(w, h), cosmeticPanel(url, color, opacity));

  /** A camera-facing mote of light. */
  const mote = (color: number, size: number, opacity = 1) => {
    const sprite = new THREE.Sprite(cosmeticSprite(wispUrl, color, opacity));
    sprite.scale.setScalar(size);
    return sprite;
  };

  /** A horizontal ring of light — halos above, energy rings underfoot. */
  const ring = (color: number, radius: number, y: number, opacity = 1) => {
    const disc = panel(haloRingUrl, color, radius * 2, radius * 2, opacity);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = y;
    return disc;
  };

  /**
   * A pair of wings: `plan` feathers per side, each a light panel swept
   * back and fanned upward from the shoulder blade. Side pivots carry the
   * beat, so the two wings always flap in mirror.
   */
  const wings = (
    plan: ReadonlyArray<{ length: number; lift: number; sweep: number; color: number }>,
    beat: number,
  ) => {
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * S.wings.anchorX, S.wings.anchorY, S.wings.anchorZ);
      for (const { length, lift, sweep, color } of plan) {
        // Each feather hangs off a bone rotating at the shoulder, so lift
        // swings the whole feather up like a wing instead of spinning it
        // about its own middle.
        const bone = new THREE.Group();
        bone.rotation.y = side * sweep;
        bone.rotation.z = side * lift;
        const feather = panel(featherUrl, color, length, length * 0.5);
        // The texture runs root → tip along +x: push it out half its length
        // so the root sits at the shoulder joint.
        feather.position.x = (side * length) / 2;
        if (side < 0) feather.scale.x = -1; // mirror the sweep, not the art
        bone.add(feather);
        pivot.add(bone);
      }
      moves(pivot, { flap: { amp: side * beat, speed: S.wings.beatSpeed } });
      group.add(pivot);
    }
    return group;
  };

  /** A comet streak trailing behind the hero, head forward. */
  const streak = (color: number, length: number, x: number, y: number, opacity = 1) => {
    const trail = panel(streakUrl, color, length, length * 0.28, opacity);
    // The sheet runs head → tail along +x; turn it to stream backwards.
    trail.rotation.y = Math.PI / 2;
    trail.position.set(x, y, -S.trail.offsetZ - length / 2);
    return moves(trail, { pulse: { amp: S.trail.flicker, speed: S.trail.flickerSpeed } });
  };

  /** A ring of orbiting spirit motes. */
  const spirits = (count: number, radius: number, y: number, size: number, colors: readonly number[], spin: number) => {
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const spirit = mote(colors[i % colors.length] ?? 0xffffff, size);
      spirit.position.set(Math.cos(angle) * radius, Math.sin(angle * 2) * 0.12, Math.sin(angle) * radius);
      group.add(spirit);
    }
    group.position.y = y;
    return moves(group, { spin, bob: { amp: S.wisps.bob, speed: S.wisps.bobSpeed } });
  };

  /** A crown: a solid band the hero wears, ringed with prongs and jewels. */
  const crown = (
    band: number,
    prong: number,
    jewel: number,
    prongs: number,
    prongHeight: number,
  ) => {
    const group = new THREE.Group();
    const circlet = new THREE.Mesh(
      new THREE.TorusGeometry(S.crown.radius, 0.035, 12, 40),
      glowSurface(band, 0.95),
    );
    circlet.rotation.x = Math.PI / 2;
    group.add(circlet);
    for (let i = 0; i < prongs; i++) {
      const angle = (i / prongs) * Math.PI * 2;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, prongHeight, 10),
        glowSurface(prong, 0.95),
      );
      spike.position.set(
        Math.cos(angle) * S.crown.radius,
        prongHeight / 2,
        Math.sin(angle) * S.crown.radius,
      );
      group.add(spike);
      // A jewel of light at the foot of every prong.
      const gem = mote(jewel, 0.16);
      gem.position.set(Math.cos(angle) * S.crown.radius, 0.02, Math.sin(angle) * S.crown.radius);
      group.add(gem);
    }
    group.position.y = S.crown.y;
    return moves(group, { spin: S.crown.spin });
  };

  // ---- ring slot: energy circling the hero's feet -------------------------

  const crimson = new THREE.Group();
  crimson.add(ring(0xff3b3b, 0.85, 0.14));
  cosmetics.set('crimson-aura', moves(crimson, { spin: 0.5, pulse: { amp: 0.05, speed: 1.7 } }));

  const inferno = new THREE.Group();
  inferno.add(ring(0xff5a2e, 0.95, 0.12));
  inferno.add(ring(0xffb02e, 0.72, 0.3, 0.85));
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const ember = mote(0xff8f3a, 0.3);
    ember.position.set(Math.cos(angle) * 0.92, 0.3, Math.sin(angle) * 0.92);
    inferno.add(ember);
  }
  cosmetics.set('inferno-ring', moves(inferno, { spin: -0.7, pulse: { amp: 0.07, speed: 2.3 } }));

  const nova = new THREE.Group();
  for (const [radius, tilt, color] of [
    [0.98, 0.3, 0xffd24d],
    [0.82, -0.26, 0xff7a4d],
    [0.66, 0.13, 0xfff3b0],
  ] as const) {
    const band = ring(color, radius, 0.26);
    band.rotation.x = -Math.PI / 2 + tilt;
    nova.add(band);
  }
  cosmetics.set('nova-ring', moves(nova, { spin: 0.9, pulse: { amp: 0.06, speed: 2.6 } }));

  // ---- crown slot ---------------------------------------------------------

  cosmetics.set('energy-crown', crown(0xffd700, 0xffe14d, 0xfff3b0, 5, 0.2));
  cosmetics.set('blazing-crown', crown(0xffb02e, 0xff7a2e, 0xffd24d, 7, 0.28));
  const celestial = crown(0xfff3ff, 0xd9e8ff, 0xffffff, 8, 0.24);
  const crest = mote(0xffffff, 0.34);
  crest.position.y = 0.36;
  celestial.add(crest);
  cosmetics.set('celestial-crown', celestial);

  // ---- wisps slot: spirits orbiting the fighter ---------------------------

  cosmetics.set('lightning-wisps', spirits(3, 0.72, 1.7, 0.3, [0x9be7ff], 0.9));
  cosmetics.set('storm-wisps', spirits(5, 0.78, 1.7, 0.34, [0xbfefff, 0x7ad7ff], 1.1));
  cosmetics.set('thunder-spirits', spirits(5, 0.82, 1.65, 0.4, [0x9be7ff, 0xeaffff], 1.3));
  const spiritStorm = new THREE.Group();
  spiritStorm.add(spirits(5, 0.95, 1.15, 0.36, [0x7ad7ff, 0xd9b3ff], 1.2));
  spiritStorm.add(spirits(4, 0.72, 2.0, 0.32, [0xd9b3ff, 0x7ad7ff], -1.5));
  cosmetics.set('spirit-storm', spiritStorm);

  // ---- wings slot ---------------------------------------------------------

  // Lift dominates sweep: the fan rises into a V behind the shoulders, so
  // the wings still read from the arena's side-on camera.
  cosmetics.set(
    'energy-wings',
    wings(
      [
        { length: 1.6, lift: 1.24, sweep: 0.34, color: 0x7dffa0 },
        { length: 1.35, lift: 0.92, sweep: 0.44, color: 0x9dffc4 },
        { length: 1.05, lift: 0.6, sweep: 0.56, color: 0xc9ffe0 },
      ],
      0.1,
    ),
  );
  cosmetics.set(
    'phoenix-wings',
    wings(
      [
        { length: 2.0, lift: 1.3, sweep: 0.3, color: 0xffb347 },
        { length: 1.7, lift: 1.0, sweep: 0.4, color: 0xffe14d },
        { length: 1.35, lift: 0.7, sweep: 0.52, color: 0xff8f5a },
        { length: 1.0, lift: 0.4, sweep: 0.64, color: 0xffd9a3 },
      ],
      0.13,
    ),
  );
  cosmetics.set(
    'galaxy-wings',
    wings(
      [
        { length: 2.3, lift: 1.34, sweep: 0.28, color: 0x8f5aff },
        { length: 1.95, lift: 1.04, sweep: 0.38, color: 0x3ac0ff },
        { length: 1.6, lift: 0.74, sweep: 0.5, color: 0xd9b3ff },
        { length: 1.2, lift: 0.44, sweep: 0.62, color: 0xeaf4ff },
      ],
      0.16,
    ),
  );

  // ---- trail slot ---------------------------------------------------------

  const comet = new THREE.Group();
  comet.add(streak(0xffa94d, 1.5, 0, 1.25));
  cosmetics.set('comet-trail', comet);

  const twinComet = new THREE.Group();
  twinComet.add(streak(0xffa94d, 1.5, -0.22, 1.35));
  twinComet.add(streak(0xffe14d, 1.3, 0.22, 1.1));
  cosmetics.set('twin-comet-trail', twinComet);

  const starfall = new THREE.Group();
  starfall.add(streak(0xffd24d, 1.7, 0, 1.3));
  for (let i = 0; i < 5; i++) {
    const fleck = mote(0xfff3b0, 0.26 - i * 0.02);
    fleck.position.set((i % 2 ? 0.28 : -0.28), 1.5 - i * 0.16, -1.0 - i * 0.32);
    starfall.add(fleck);
  }
  cosmetics.set('starfall-trail', moves(starfall, { bob: { amp: 0.06, speed: 2.2 } }));

  // ---- halo slot: rings of light above the head ---------------------------

  const twinHalo = new THREE.Group();
  twinHalo.add(ring(0xfff3b0, 0.44, 0));
  twinHalo.add(ring(0xffffff, 0.32, 0.16, 0.8));
  twinHalo.position.y = S.halo.y;
  twinHalo.rotation.z = S.halo.tilt;
  cosmetics.set('twin-halo', moves(twinHalo, { spin: 0.6, bob: { amp: S.halo.bob, speed: 1.4 } }));

  const radiant = new THREE.Group();
  radiant.add(ring(0xfff3b0, 0.56, 0));
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const spoke = mote(0xfff8d9, 0.2);
    spoke.position.set(Math.cos(angle) * 0.56, 0, Math.sin(angle) * 0.56);
    radiant.add(spoke);
  }
  radiant.position.y = S.halo.y;
  radiant.rotation.z = S.halo.tilt;
  cosmetics.set('radiant-halo', moves(radiant, { spin: 0.8, bob: { amp: S.halo.bob, speed: 1.2 } }));

  const aurora = new THREE.Group();
  aurora.add(ring(0x7dffd0, 0.58, 0));
  aurora.add(ring(0xb18fff, 0.46, 0.14, 0.9));
  aurora.add(ring(0xffe9a3, 0.34, 0.28, 0.8));
  aurora.position.y = S.halo.y;
  aurora.rotation.z = S.halo.tilt;
  cosmetics.set('aurora-halo', moves(aurora, { spin: 0.5, bob: { amp: S.halo.bob, speed: 1.1 } }));

  // ---- form slot: the Legend state ---------------------------------------

  const legend = new THREE.Group();
  const mantle = new THREE.Mesh(buildAuraGeometry(), glowSurface(0xfff0c9, 0.16));
  // Uniform on purpose: the breathing pulse scales it as one.
  mantle.scale.setScalar(1.06);
  legend.add(moves(mantle, { pulse: { amp: 0.03, speed: 1.3 }, spin: 0.25 }));
  const legendHalo = new THREE.Group();
  legendHalo.add(ring(0xffffff, 0.62, 0));
  legendHalo.add(ring(0xffe9a3, 0.44, 0.18, 0.9));
  legendHalo.position.y = S.halo.y + 0.18;
  legendHalo.rotation.z = -S.halo.tilt;
  legend.add(moves(legendHalo, { spin: -0.7, bob: { amp: 0.05, speed: 1.5 } }));
  const legendStar = mote(0xffffff, 0.5);
  legendStar.position.y = S.halo.y + 0.62;
  legend.add(moves(legendStar, { pulse: { amp: 0.16, speed: 2.4 } }));
  cosmetics.set('legend', legend);

  return cosmetics;
}
