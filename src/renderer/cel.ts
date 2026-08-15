// Cel treatment for characters: ink outlines (inverted hull) and shadow
// casting. One call per character root — hero, Training Dummy, and anything
// outlined later all go through here, so line work is a capability, not
// per-mesh bespoke code.

import * as THREE from 'three';
import { inkSurface } from './materials';
import { STYLE } from './style';

// All hulls share one material: one shader program, minimal state changes.
const inkMaterial = inkSurface(STYLE.outline.color);

/** A hull shares its parent's geometry — never dispose it independently. */
export function isOutlineHull(mesh: THREE.Mesh): boolean {
  return mesh.userData.outlineHull === true;
}

/**
 * Give every lit character mesh under `root` an ink outline and a cast
 * shadow. Glow meshes (aura, eyes, cosmetics, blasts) are skipped: outlining
 * a light source reads as a smudge, and light casts no shadow. Hulls are
 * children of their mesh, so they track animation and visibility for free.
 */
export function applyCelTreatment(root: THREE.Object3D): void {
  const targets: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !isOutlineHull(obj)) {
      const material = obj.material as THREE.Material;
      if (material.userData.role === 'character') targets.push(obj);
    }
  });
  for (const mesh of targets) {
    mesh.castShadow = true;
    const hull = new THREE.Mesh(mesh.geometry, inkMaterial);
    hull.scale.setScalar(STYLE.outline.scale);
    hull.userData.outlineHull = true;
    mesh.add(hull);
  }
}
