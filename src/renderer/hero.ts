// The hero: an original, DBZ-inspired (never copied) anime-style fighter,
// procedurally assembled from the chosen appearance, plus the streak-form
// looks that transform it.

import * as THREE from 'three';
import { presetHex, SKIN_PRESETS } from '../core';
import type { HairStyle, HeroAppearance, StreakForm } from '../core';
import { characterSurface, glowSurface } from './materials';
import type { Surface } from './materials';
import { applyCelTreatment } from './cel';

// Visual treatment per streak form, keyed by the core's form names.
// hair: null keeps the Player's own hair color.
export const FORM_LOOKS: Record<
  StreakForm,
  { hair: number | null; auraColor: number; auraOpacity: number; emissive: number }
> = {
  // Opacities are per shell; the aura's two nested shells overlap, so the
  // perceived density is roughly double what's written here.
  base: { hair: null, auraColor: 0x000000, auraOpacity: 0, emissive: 0 },
  aura: { hair: null, auraColor: 0x3ac0ff, auraOpacity: 0.28, emissive: 0.15 },
  surge: { hair: 0xffe14d, auraColor: 0x8f5aff, auraOpacity: 0.34, emissive: 0.35 },
  super: { hair: 0xffd700, auraColor: 0xffb300, auraOpacity: 0.4, emissive: 0.6 },
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
  /** Two counter-rotating flame shells; both share auraMaterial. */
  aura: THREE.Group;
  auraOuter: THREE.Mesh;
  auraInner: THREE.Mesh;
  auraMaterial: THREE.MeshBasicMaterial;
  /** Milestone cosmetic meshes keyed by their table id; hidden until unlocked. */
  cosmetics: Map<string, THREE.Object3D>;
}

/** Dress the rig for a streak form, blended with the Player's permanent glow. */
export function applyFormToRig(
  rig: HeroRig,
  form: StreakForm,
  playerHair: number,
  playerGlow: number,
): void {
  const look = FORM_LOOKS[form];
  const hairHex = look.hair ?? playerHair;
  for (const spike of rig.hairMaterials) {
    spike.color.setHex(hairHex);
    spike.emissive.setHex(hairHex);
    spike.emissiveIntensity = Math.max(look.emissive, playerGlow * 0.5);
  }
  rig.bodyMaterial.emissive.setHex(look.auraColor === 0 ? 0xffffff : look.auraColor);
  rig.bodyMaterial.emissiveIntensity = Math.max(look.emissive, playerGlow * 0.25);
  rig.auraMaterial.color.setHex(look.auraColor);
  rig.auraMaterial.opacity = Math.max(look.auraOpacity, playerGlow * 0.2);
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
export function buildHero(appearance: HeroAppearance): HeroRig {
  const group = new THREE.Group();
  const girl = appearance.body === 'girl';

  const bodyMaterial = characterSurface(0x3a6fd8);
  const trimMaterial = characterSurface(0xff9f1c);
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

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(girl ? 0.055 : 0.045, 8, 6),
      glowSurface(0x222222),
    );
    eye.position.set(side * 0.13, 0.22, 0.29);
    head.add(eye);
  }

  // Anime hair from the chosen style; every strand shares the swappable
  // hair materials so streak forms and player colors recolor them all.
  const hairMaterials: Surface[] = [];
  const hairMat = () => {
    const material = characterSurface(0x2b2b2b);
    hairMaterials.push(material);
    return material;
  };
  buildHair(head, appearance.hairStyle, appearance.hairLength === 'long', hairMat);

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
  // The aura is a teardrop of flame wrapped around the fighter: two shells
  // of the same lobed profile — the smaller inner one doubles up the color
  // into a bright core, and counter-rotation makes the fire churn.
  const auraGeometry = buildAuraGeometry();
  const auraOuter = new THREE.Mesh(auraGeometry, auraMaterial);
  const auraInner = new THREE.Mesh(auraGeometry, auraMaterial);
  auraInner.scale.set(0.62, 0.82, 0.62);
  const aura = new THREE.Group();
  aura.add(auraOuter);
  aura.add(auraInner);
  aura.position.y = 0.02;
  group.add(aura);

  const cosmetics = buildCosmetics();
  for (const mesh of cosmetics.values()) {
    mesh.visible = false;
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
    cosmetics,
  };
}

/**
 * The aura's flame: a teardrop profile that follows the hero's silhouette —
 * rounded at the boots, widest at the torso, tapering to a point above the
 * hair — with radial lobes sculpted in so the rim licks like fire when the
 * shells rotate.
 */
function buildAuraGeometry(): THREE.BufferGeometry {
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
    const lobe = 1 + 0.13 * Math.sin(theta * 3 + y * 2.2);
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
function buildHair(head: THREE.Group, style: HairStyle, long: boolean, hairMat: HairMat): void {
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
    cone.position.set(x, y, z);
    cone.rotation.x = tiltX;
    cone.rotation.z = tiltZ;
    head.add(cone);
  };
  const cap = (radiusScale: number, flatten: number, y: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.37 * radiusScale, 16, 12), hairMat());
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
      if (long) {
        // A wild mane cascading down the back.
        spike(0.14, 0.12, -0.34, 2.7, -0.1, 0.13, 0.85);
        spike(-0.14, 0.12, -0.34, 2.7, 0.1, 0.13, 0.85);
        spike(0, 0.02, -0.38, 2.8, 0, 0.15, 1.0);
      }
      break;
    }
    case 'flame': {
      // One big swept-back flame of hair.
      spike(0, 0.67, -0.05, -0.55, 0, 0.24, long ? 1.1 : 0.75);
      spike(0.14, 0.57, -0.12, -0.7, -0.2, 0.18, long ? 0.9 : 0.6);
      spike(-0.14, 0.57, -0.12, -0.7, 0.2, 0.18, long ? 0.9 : 0.6);
      break;
    }
    case 'ponytail': {
      cap(1.02, 0.75, 0.27);
      spike(0, 0.47, -0.3, 2.45, 0, 0.12, long ? 0.9 : 0.5);
      if (long) spike(0, -0.13, -0.42, 2.9, 0, 0.1, 0.7);
      break;
    }
    case 'buzz': {
      cap(long ? 1.06 : 1.0, long ? 0.75 : 0.6, long ? 0.3 : 0.34);
      break;
    }
  }
}

/** One simple mesh per milestone cosmetic id from the core's table. */
function buildCosmetics(): Map<string, THREE.Object3D> {
  const cosmetics = new Map<string, THREE.Object3D>();
  const glowMaterial = (color: number) => glowSurface(color, 0.85);

  const crimsonAura = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.06, 10, 32),
    glowMaterial(0xff3b3b),
  );
  crimsonAura.rotation.x = Math.PI / 2;
  crimsonAura.position.y = 0.15;
  cosmetics.set('crimson-aura', crimsonAura);

  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), glowMaterial(0xffd700));
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 2.85;
  cosmetics.set('energy-crown', crown);

  const wisps = new THREE.Group();
  for (const [x, y] of [
    [-0.7, 1.4],
    [0.7, 1.7],
    [-0.5, 2.2],
  ] as const) {
    const wisp = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), glowMaterial(0x9be7ff));
    wisp.position.set(x, y, 0.2);
    wisps.add(wisp);
  }
  cosmetics.set('lightning-wisps', wisps);

  const wings = new THREE.Group();
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), glowMaterial(0x7dffa0));
    wing.position.set(side * 0.6, 1.5, -0.4);
    wing.rotation.z = side * 2.4;
    wings.add(wing);
  }
  cosmetics.set('energy-wings', wings);

  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.2, 8), glowMaterial(0xffa94d));
  trail.position.set(0, 1.0, -0.7);
  trail.rotation.x = Math.PI / 2;
  cosmetics.set('comet-trail', trail);

  const halo = new THREE.Group();
  for (const dy of [0, 0.25] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 24), glowMaterial(0xfff3b0));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.0 + dy;
    halo.add(ring);
  }
  cosmetics.set('twin-halo', halo);

  return cosmetics;
}
