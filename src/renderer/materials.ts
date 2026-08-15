// The material factory: every material in the scene is created here, named by
// role. Code elsewhere may depend only on the Surface interface (color,
// emissive, emissiveIntensity) — never on a concrete three.js material class —
// so restyling a role (say, characters going toon) is a change to one function
// here, not to every construction site.

import * as THREE from 'three';
import { STYLE } from './style';

/** The lit-material interface rig and reaction code may rely on. */
export type Surface = THREE.Material & {
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
};

/**
 * The cel-shading ramp: a procedurally generated 1-D gradient texture (no
 * asset files) that quantizes lighting into hand-drawn anime bands. One
 * texture is shared by every character material.
 */
function createToonRamp(bands: readonly number[]): THREE.DataTexture {
  const data = new Uint8Array(bands.length);
  bands.forEach((band, i) => {
    data[i] = Math.round(band * 255);
  });
  const ramp = new THREE.DataTexture(data, bands.length, 1, THREE.RedFormat);
  // Nearest filtering keeps the band edges crisp — that IS the cel look.
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}
let sharedRamp: THREE.DataTexture | null = null;

/**
 * Lit surfaces on the hero and the Training Dummy: banded toon shading, so
 * the characters read as anime cels against the softer painted environment.
 */
export function characterSurface(color: number): Surface {
  sharedRamp ??= createToonRamp(STYLE.ramp);
  const material = new THREE.MeshToonMaterial({ color, gradientMap: sharedRamp });
  material.userData.role = 'character';
  return material;
}

/** Lit surfaces on the arena, ground, and rocks. */
export function environmentSurface(color: number, roughness: number): Surface {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

/**
 * Deliberately unlit glow: auras, blasts, particles, cosmetic energy, clouds.
 * These must ignore scene lighting so they read as light sources themselves.
 * Pass an opacity to get a transparent glow; omit it for a solid one.
 */
export function glowSurface(color: number, opacity?: number): THREE.MeshBasicMaterial {
  return opacity === undefined
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
}

/**
 * Backdrop pieces that live beyond the fog — the sky dome and the sun disc.
 * Fog must not wash them: they ARE the far distance the fog fades into.
 */
export function backdropSurface(
  color: number,
  opts?: { vertexColors?: boolean; backSide?: boolean },
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    fog: false,
    vertexColors: opts?.vertexColors ?? false,
    side: opts?.backSide ? THREE.BackSide : THREE.FrontSide,
  });
}

/** The star field's point material — unlit, unfogged, softly transparent. */
export function starSurface(color: number, size: number, opacity: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({ color, size, transparent: true, opacity, fog: false });
}

/**
 * The layer the bloom pass reads. Marking is opt-in per mesh at its creation
 * site: auras, blasts, particles, cosmetic energy, the arena rim — the things
 * that ARE light. Never lit surfaces (they'd haze) or ink hulls.
 */
export const BLOOM_LAYER = 11;

export function markBloom(object: THREE.Object3D): void {
  object.layers.enable(BLOOM_LAYER);
}
