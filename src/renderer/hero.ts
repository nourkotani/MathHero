// The hero: an original, DBZ-inspired (never copied) anime-style fighter,
// dressed from the chosen appearance, plus the streak-form looks that
// transform it. The body and its clips are the Blender hero, mounted by the
// React component src/scene/Hero.tsx (ADR 0009); this module dresses it
// with light — face, aura, motes, cosmetics — which stays in code (ADR 0007).

import * as THREE from 'three';
import { COSMETIC_MILESTONES, FORMS, presetHex, SKIN_PRESETS } from '../core';
import type { CosmeticSlot, Garment, HeroAppearance, StreakForm } from '../core';
import {
  cosmeticPanel,
  cosmeticSprite,
  faceLayer,
  glowSurface,
  markBloom,
  painterlySurface,
} from './materials';
import { hairMeshFor } from './hairLook';
import type { HeroDirector, HeroParts } from './heroDirector';
import { STYLE } from './style';
import type { Surface } from './materials';
import { applyCelTreatment } from './cel';
import { freeMesh } from './fx';
import heroRig from './models/hero-rig.json';
import featherUrl from './textures/feather.png';
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
  /** Wing beat about the pitch axis — both wings rise and fall together. */
  pitch?: { amp: number; speed: number };
  /** Breathing scale about the rest size. */
  pulse?: { amp: number; speed: number };
}

/** One animated cosmetic piece, with the rest pose captured at build time. */
export interface CosmeticMotor {
  object: THREE.Object3D;
  motion: Motion;
  restY: number;
  restRoll: number;
  restPitch: number;
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

/** The joints the poses drive: the Blender rig's bones, or placeholder
 *  pivots at the same places until the model decodes. */
export interface HeroJoints {
  torso: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  elbowL: THREE.Object3D;
  elbowR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  kneeL: THREE.Object3D;
  kneeR: THREE.Object3D;
}

const JOINT_NAMES: ReadonlyArray<keyof HeroJoints> = [
  'torso', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR',
];

function isJoint(name: string): name is keyof HeroJoints {
  return (JOINT_NAMES as ReadonlyArray<string>).includes(name);
}

/**
 * The rigs at rest (hero-rig.json, baked output of scripts/blender/
 * hero.py, ADR 0012). Each body keeps its own Tripo rig in the model,
 * its bone names under the body's prefix; one clip moves both. Per body:
 * each joint's rest position and rotation in hero space, its nearest
 * named parent, and where the fists and boots sit in their joint's
 * frame. A Tripo bone rests turned along its limb, so a piece hung on a
 * joint must take the rest rotation off, not only the position: see
 * mountOn.
 */
interface JointRest {
  parent: string | null;
  position: number[];
  quaternion: number[];
}
/** Where a body wears the cosmetics, in hero space: the bake measures its
 *  skull and back (scripts/blender/hero.py, _cosmetic_anchors). */
interface CosmeticAnchors {
  /** The crown's centre, around the head at the front hairline, and its radius. */
  crown: { position: number[]; radius: number };
  /** The halo's centre, above the skull. */
  halo: { position: number[] };
  /** The wings' root on the shoulder blades, the trail's on the middle of the back. */
  wings: { position: number[] };
  trail: { position: number[] };
}
interface BodyRig {
  prefix: string;
  joints: Record<string, JointRest>;
  strikes: Array<{ joint: string; offset: number[] }>;
  cosmetics: CosmeticAnchors;
}
const RIG: { bodies: Record<string, BodyRig> } = heroRig;

/** The rig of a body part (BodyBoy, BodyGirl). */
function bodyRig(body: string): BodyRig {
  const rig = RIG.bodies[body];
  if (!rig) throw new Error(`hero-rig.json has no body ${body}`);
  return rig;
}

/** A joint's rest transform in hero space. */
function jointRest(rig: BodyRig, joint: string): THREE.Matrix4 {
  const rest = rig.joints[joint];
  if (!rest) throw new Error(`hero-rig.json has no joint ${joint}`);
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(rest.position),
    new THREE.Quaternion().fromArray(rest.quaternion),
    new THREE.Vector3(1, 1, 1),
  );
}

/** A strike point: a joint, and the offset from it to the fist or boot
 *  centre in the joint's space. */
export interface StrikePoint {
  joint: keyof HeroJoints;
  offset: THREE.Vector3;
}

/** The strike points of a body, in the order the hitboxes expect. */
function strikePoints(rig: BodyRig): StrikePoint[] {
  return rig.strikes.map(({ joint, offset }) => {
    if (!isJoint(joint)) throw new Error(`hero-rig.json strikes an unknown joint ${joint}`);
    return { joint, offset: new THREE.Vector3().fromArray(offset) };
  });
}

/** Placeholder pivots at the rig's rest, used only until the Blender hero
 *  decodes: every joint of the rig, so the chain composes as the bones do. */
function heroJoints(root: THREE.Object3D, rig: BodyRig): HeroJoints {
  const made = new Map<string, THREE.Object3D>();
  const joints = {} as HeroJoints;
  for (const [name, rest] of Object.entries(rig.joints)) {
    const pivot = new THREE.Group();
    const parent = rest.parent === null ? null : made.get(rest.parent);
    const local = jointRest(rig, name);
    if (parent && rest.parent !== null) local.premultiply(jointRest(rig, rest.parent).invert());
    local.decompose(pivot.position, pivot.quaternion, pivot.scale);
    (parent ?? root).add(pivot);
    made.set(name, pivot);
    if (isJoint(name)) joints[name] = pivot;
  }
  for (const name of JOINT_NAMES) {
    if (!joints[name]) throw new Error(`hero-rig.json has no joint ${name}`);
  }
  return joints;
}

/**
 * Hang a piece built in hero space on a joint, at the joint's rest: a
 * mount group carries the inverse of the rest transform, so the piece
 * keeps its own position and rotation (its motors animate those) and
 * turns with the bone from its rest, not from the bone's turned frame.
 * The model may be mid-clip when a build happens, so the current pose
 * must not count: the rest comes from the baked rig, never the scene.
 */
function mountOn(
  rig: BodyRig,
  joint: THREE.Object3D,
  name: keyof HeroJoints,
  piece: THREE.Object3D,
): THREE.Group {
  const mount = new THREE.Group();
  jointRest(rig, name).invert().decompose(mount.position, mount.quaternion, mount.scale);
  mount.add(piece);
  joint.add(mount);
  return mount;
}

/** The garment mesh in the hero model for each garment choice. */
const GARMENT_MESHES: Record<Garment, string> = {
  gi: 'GarmentGi',
  cape: 'GarmentCape',
  armor: 'GarmentArmor',
};

/** Cosmetic slots worn on a bone: crowns and halos on the head, wings and
 *  trails on the back. Rings, wisps, and Legend circle the whole hero. */
const SLOT_BONE: Partial<Record<CosmeticSlot, keyof HeroJoints>> = {
  crown: 'head',
  halo: 'head',
  wings: 'torso',
  trail: 'torso',
};

/**
 * The hero's tint materials, one per painted region of hero.glb, and its
 * face layers (ADR 0012). They live for the whole session: the React
 * model wears them, and the look code (applyLook, applyFormToRig, the
 * reactions) recolors them.
 */
export interface HeroMaterials {
  /** PaintedOutfit */
  body: Surface;
  /** PaintedTrim */
  trim: Surface;
  /** PaintedSkin */
  skin: Surface;
  /** PaintedHair */
  hair: Surface;
  /** Face: the painted features, never tinted. */
  face: THREE.MeshBasicMaterial;
  /** Iris: the painted iris, worn in the Form's eye color once a Form is
   *  earned; hidden before, when the painted eyes show as they are. */
  iris: THREE.MeshBasicMaterial;
}

export function createHeroMaterials(): HeroMaterials {
  return {
    body: painterlySurface(null),
    trim: painterlySurface(null),
    skin: painterlySurface(null),
    hair: painterlySurface(null),
    face: faceLayer(),
    iris: faceLayer(),
  };
}

/** The Blender parts this appearance and Form show. */
export function heroParts(appearance: HeroAppearance, form: string | null): HeroParts {
  return {
    body: appearance.body === 'girl' ? 'BodyGirl' : 'BodyBoy',
    garment: GARMENT_MESHES[appearance.garment],
    hair: hairMeshFor(form, appearance.hairStyle, appearance.hairLength),
  };
}

export interface HeroRig {
  group: THREE.Group;
  /** The shown body's joints: its own bones once the model decodes. */
  joints: HeroJoints;
  /** The shown body's fists and boots, on its joints. */
  strikes: StrikePoint[];
  /** Keep the Form's hair scale: every clip keys the hair bone at scale 1,
   *  and drei's mixer has already run this frame, so the scale is set again. */
  animate(dt: number): void;
  /** The hair this hero wore before its current Form, and wears now: the
   *  Landmark scene shows the first, then swaps at the moment of ascension. */
  hairBefore: string;
  hairNow: string;
  showHair(name: string): void;
  /**
   * Play an authored clip once, then return to Idle. queued: wait for the
   * clip already playing to end first (a charge never cuts off a strike).
   */
  play(name: string, queued?: boolean): void;
  /** Seconds an authored clip lasts, from the model; 0 before it decodes. */
  clipLength(name: string): number;
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
  /** Take this rig's light off the hero and free it (a rebuild follows). */
  dispose(): void;
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

/** What a hero build dresses: the persistent parts it hangs its light on. */
export interface HeroBuild {
  appearance: HeroAppearance;
  palette: FormPalette | null;
  form: string | null;
  /** The hero's root group; the React model is mounted inside it. */
  group: THREE.Group;
  /** The mounted Blender model, or null until it decodes (a moment at boot). */
  model: THREE.Object3D | null;
  materials: HeroMaterials;
  director: HeroDirector;
}

/**
 * Dress an original, DBZ-inspired (never copied) anime-style hero from the
 * chosen appearance: body style, hair style and length, garment, and skin
 * tone. The Blender model (scripts/blender/hero.py, ADR 0012) carries both
 * Tripo bodies with their painted faces and every hair on one rig; the
 * director picks which parts show. This build adds the aura, the motes
 * and the cosmetics, and gives the iris the Form's eye color.
 *
 * Rig layout (group-local y, feet at 0; hero-rig.json): hips 1.34, torso
 * pivot 1.48, shoulders 2.03, head pivot 2.14, skull top 2.6.
 */
export function buildHero({
  appearance,
  palette,
  form,
  group,
  model,
  materials,
  director,
}: HeroBuild): HeroRig {
  // Everything this build adds, so dispose() can take it off again: the
  // model and its tint materials outlive every build.
  const dressing: THREE.Object3D[] = [];

  materials.skin.color.setHex(presetHex(SKIN_PRESETS, appearance.skinTone));
  // The irises ride their own layer so a Form can change the hero's eyes;
  // before any Form, the painted eyes show as Tripo drew them.
  materials.iris.color.setHex(palette?.eye ?? BASE_EYE);
  materials.iris.visible = palette !== null;
  const parts = heroParts(appearance, form);
  director.showParts(parts);
  const formIndex = FORMS.findIndex((f) => f.id === form);
  const formBefore = formIndex > 0 ? (FORMS[formIndex - 1]?.id ?? null) : null;
  const hairBefore = hairMeshFor(formBefore, appearance.hairStyle, appearance.hairLength);

  // The shown body's bones are the joints. Until the model decodes,
  // placeholder pivots at the same places hold the cosmetics.
  const rig = bodyRig(parts.body);
  const placeholder = new THREE.Group();
  const joints = heroJoints(placeholder, rig);
  if (model) {
    for (const name of Object.keys(joints) as Array<keyof HeroJoints>) {
      const bone = model.getObjectByName(rig.prefix + name);
      if (bone) joints[name] = bone;
    }
  } else {
    group.add(placeholder);
    dressing.push(placeholder);
  }
  // Hair grows and stiffens with the Form: the hair bone scales it from
  // the head pivot, so a powered-up hero's hair visibly rises.
  const hairBone = model?.getObjectByName(`${rig.prefix}hair`) ?? null;
  const hairScale = palette?.hairScale ?? 1;

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
  dressing.push(aura);

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
  dressing.push(powerMotes);

  const cosmeticMotors: CosmeticMotor[] = [];
  const cosmetics = buildCosmetics(cosmeticMotors, rig.cosmetics);
  for (const mesh of cosmetics.values()) {
    mesh.visible = false;
    // Cosmetic energy glows for real; children too (wisps, wings, halos).
    mesh.traverse(markBloom);
    group.add(mesh);
    dressing.push(mesh);
  }

  // Ink and shadows for the code-built pieces; the model has baked ink.
  for (const piece of dressing) applyCelTreatment(piece);

  // Worn cosmetics ride their bone: the crown turns with the head, the
  // wings lean with the torso. Each piece was built in hero space and
  // hangs on a mount that takes the bone's rest off it (mountOn); the
  // mounts go with the dressing, after the pieces they carry.
  for (const tier of COSMETIC_MILESTONES) {
    const bone = SLOT_BONE[tier.slot];
    const piece = cosmetics.get(tier.id);
    if (!bone || !piece) continue;
    dressing.push(mountOn(rig, joints[bone], bone, piece));
  }
  for (const motor of cosmeticMotors) {
    motor.restY = motor.object.position.y;
    motor.restRoll = motor.object.rotation.z;
    motor.restPitch = motor.object.rotation.x;
    motor.restScale = motor.object.scale.x;
  }

  return {
    group,
    joints,
    strikes: strikePoints(rig),
    hairBefore,
    hairNow: parts.hair,
    animate() {
      hairBone?.scale.setScalar(hairScale);
    },
    play(name, queued = false) {
      director.play(name, queued);
    },
    clipLength: (name) => director.length(name),
    showHair(name) {
      director.showHair(name);
    },
    hairMaterials: [materials.hair],
    bodyMaterial: materials.body,
    trimMaterial: materials.trim,
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
    dispose() {
      for (const piece of dressing) {
        piece.removeFromParent();
        piece.traverse((obj) => {
          if (obj instanceof THREE.Mesh) freeMesh(obj);
        });
      }
    },
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


/**
 * Anime hair styles, each in a short and a long variant, built in head-pivot
 * space so the whole do swings with every nod and shake.
 */

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
function buildCosmetics(
  motors: CosmeticMotor[],
  anchors: CosmeticAnchors,
): Map<string, THREE.Object3D> {
  const cosmetics = new Map<string, THREE.Object3D>();
  const S = STYLE.cosmetics;
  const at = (anchor: { position: number[] }) => new THREE.Vector3().fromArray(anchor.position);
  const crownAt = at(anchors.crown);
  const crownRadius = anchors.crown.radius;
  const haloAt = at(anchors.halo);
  const wingsAt = at(anchors.wings);
  const trailAt = at(anchors.trail);

  /** Register render-time motion for a piece, capturing its rest pose. */
  const moves = <T extends THREE.Object3D>(object: T, motion: Motion): T => {
    motors.push({
      object,
      motion,
      restY: object.position.y,
      restRoll: object.rotation.z,
      restPitch: object.rotation.x,
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
   * Ki wings: the aura flaring into wing sheets behind the shoulders.
   *
   * They fan in the hero's back/up plane — NOT out to the sides. The arena
   * camera watches the hero side-on, so a pair fanned left and right can
   * only ever be seen edge-on, which read as fins beside the head. Fanned
   * backward and upward instead, the full wing faces the camera, and the
   * two sides sit a little apart in depth so they still read as a pair.
   */
  const wings = (
    plan: ReadonlyArray<{ length: number; lift: number; color: number }>,
    beat: number,
  ) => {
    const group = new THREE.Group();
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(wingsAt.x + side * S.wings.anchorX, wingsAt.y, wingsAt.z);
      // The far wing splays a touch so the pair never perfectly overlaps.
      pivot.rotation.y = side * S.wings.splay;
      for (const { length, lift, color } of plan) {
        // swing pitches the feather up from straight-back; turn lays the
        // sheet flat to the camera with its root at the shoulder.
        const swing = new THREE.Group();
        swing.rotation.x = lift;
        const turn = new THREE.Group();
        turn.rotation.y = Math.PI / 2;
        const feather = panel(featherUrl, color, length, length * S.wings.breadth);
        feather.position.x = length / 2;
        turn.add(feather);
        swing.add(turn);
        pivot.add(swing);
      }
      // Both wings beat together, the way a wing actually moves.
      moves(pivot, { pitch: { amp: beat, speed: S.wings.beatSpeed } });
      group.add(pivot);
    }
    // The hot root where the wings meet the back: they grow out of the
    // hero's own energy instead of hovering behind them.
    const root = mote(plan[0]?.color ?? 0xffffff, S.wings.rootFlare);
    root.position.copy(wingsAt);
    group.add(root);
    return group;
  };

  /**
   * A ribbon of energy streaming off the hero's back, up and away.
   *
   * Deliberately NOT a thick streak pointing straight back at hip height —
   * that reads as a tail. These are thin, they leave from the back at a
   * rising angle, and their hot end is rooted on the body so the energy
   * looks like it is coming off the hero rather than trailing after them.
   */
  const ribbon = (color: number, length: number, lift: number, x: number, opacity = 1) => {
    const swing = new THREE.Group();
    swing.rotation.x = lift;
    const turn = new THREE.Group();
    turn.rotation.y = Math.PI / 2;
    const sheet = panel(streakUrl, color, length, length * S.trail.thinness, opacity);
    sheet.position.x = length / 2;
    turn.add(sheet);
    swing.add(turn);
    swing.position.set(trailAt.x + x, trailAt.y, trailAt.z);
    return moves(swing, { pulse: { amp: S.trail.flicker, speed: S.trail.flickerSpeed } });
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
      new THREE.TorusGeometry(crownRadius, 0.035, 12, 40),
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
      spike.position.set(Math.cos(angle) * crownRadius, prongHeight / 2, Math.sin(angle) * crownRadius);
      group.add(spike);
      // A jewel of light at the foot of every prong.
      const gem = mote(jewel, 0.16);
      gem.position.set(Math.cos(angle) * crownRadius, 0.02, Math.sin(angle) * crownRadius);
      group.add(gem);
    }
    group.position.copy(crownAt);
    group.position.y += S.crown.lift;
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
  // Lift fans the sheets from near-vertical down to swept-back, so the
  // pair opens like a fan across the view rather than poking out sideways.
  // Feathers overlap at close angles so the fan reads as one sheet of
  // light rather than a few separate blades.
  cosmetics.set(
    'energy-wings',
    wings(
      [
        { length: 1.45, lift: 1.12, color: 0x7dffa0 },
        { length: 1.7, lift: 0.92, color: 0x9dffc4 },
        { length: 1.8, lift: 0.72, color: 0x7dffa0 },
        { length: 1.65, lift: 0.52, color: 0xc9ffe0 },
        { length: 1.35, lift: 0.32, color: 0x9dffc4 },
      ],
      0.09,
    ),
  );
  cosmetics.set(
    'phoenix-wings',
    wings(
      [
        { length: 1.7, lift: 1.18, color: 0xffb347 },
        { length: 2.0, lift: 0.98, color: 0xffe14d },
        { length: 2.2, lift: 0.78, color: 0xffb347 },
        { length: 2.05, lift: 0.58, color: 0xff8f5a },
        { length: 1.75, lift: 0.38, color: 0xffd9a3 },
        { length: 1.35, lift: 0.2, color: 0xffe14d },
      ],
      0.12,
    ),
  );
  cosmetics.set(
    'galaxy-wings',
    wings(
      [
        { length: 1.95, lift: 1.22, color: 0x8f5aff },
        { length: 2.3, lift: 1.02, color: 0x3ac0ff },
        { length: 2.5, lift: 0.82, color: 0x8f5aff },
        { length: 2.35, lift: 0.62, color: 0xd9b3ff },
        { length: 2.0, lift: 0.42, color: 0x3ac0ff },
        { length: 1.55, lift: 0.22, color: 0xeaf4ff },
      ],
      0.15,
    ),
  );

  // ---- trail slot ---------------------------------------------------------

  const comet = new THREE.Group();
  comet.add(ribbon(0xffa94d, 1.45, 0.5, 0));
  comet.add(ribbon(0xffc46b, 1.1, 0.78, -0.14, 0.75));
  cosmetics.set('comet-trail', comet);

  const twinComet = new THREE.Group();
  twinComet.add(ribbon(0xffa94d, 1.6, 0.46, -0.16));
  twinComet.add(ribbon(0xffe14d, 1.35, 0.72, 0.16));
  twinComet.add(ribbon(0xffd9a3, 1.05, 0.94, 0, 0.7));
  cosmetics.set('twin-comet-trail', twinComet);

  const starfall = new THREE.Group();
  starfall.add(ribbon(0xffd24d, 1.75, 0.44, -0.14));
  starfall.add(ribbon(0xfff3b0, 1.45, 0.7, 0.14));
  starfall.add(ribbon(0xffe9a3, 1.15, 0.96, 0, 0.75));
  // Stars shaken loose, drifting off along the ribbons' path.
  for (let i = 0; i < 5; i++) {
    const fleck = mote(0xfff3b0, 0.26 - i * 0.02);
    const along = 0.5 + i * 0.32;
    fleck.position.set(
      trailAt.x + (i % 2 ? 0.2 : -0.2),
      trailAt.y + along * 0.62,
      trailAt.z - along * 0.78,
    );
    starfall.add(fleck);
  }
  cosmetics.set('starfall-trail', moves(starfall, { bob: { amp: 0.06, speed: 2.2 } }));

  // ---- halo slot: rings of light above the head ---------------------------

  const twinHalo = new THREE.Group();
  twinHalo.add(ring(0xfff3b0, 0.44, 0));
  twinHalo.add(ring(0xffffff, 0.32, 0.16, 0.8));
  twinHalo.position.copy(haloAt);
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
  radiant.position.copy(haloAt);
  radiant.rotation.z = S.halo.tilt;
  cosmetics.set('radiant-halo', moves(radiant, { spin: 0.8, bob: { amp: S.halo.bob, speed: 1.2 } }));

  const aurora = new THREE.Group();
  aurora.add(ring(0x7dffd0, 0.58, 0));
  aurora.add(ring(0xb18fff, 0.46, 0.14, 0.9));
  aurora.add(ring(0xffe9a3, 0.34, 0.28, 0.8));
  aurora.position.copy(haloAt);
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
  legendHalo.position.copy(haloAt);
  legendHalo.position.y += 0.18;
  legendHalo.rotation.z = -S.halo.tilt;
  legend.add(moves(legendHalo, { spin: -0.7, bob: { amp: 0.05, speed: 1.5 } }));
  const legendStar = mote(0xffffff, 0.5);
  legendStar.position.copy(haloAt);
  legendStar.position.y += 0.62;
  legend.add(moves(legendStar, { pulse: { amp: 0.16, speed: 2.4 } }));
  cosmetics.set('legend', legend);

  return cosmetics;
}
