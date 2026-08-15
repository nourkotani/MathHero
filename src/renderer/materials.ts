// The material factory: every material in the scene is created here, named by
// role. Code elsewhere may depend only on the Surface interface (color,
// emissive, emissiveIntensity) — never on a concrete three.js material class —
// so restyling a role (say, characters going toon) is a change to one function
// here, not to every construction site.

import * as THREE from 'three';

/** The lit-material interface rig and reaction code may rely on. */
export type Surface = THREE.Material & {
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
};

/** Lit surfaces on the hero and the Training Dummy. */
export function characterSurface(color: number, roughness: number): Surface {
  return new THREE.MeshStandardMaterial({ color, roughness });
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
