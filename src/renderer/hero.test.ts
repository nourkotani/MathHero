import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_APPEARANCE, FORMS } from '../core';
import { createHeroMaterials, FORM_PALETTES, formEye, heroParts } from './hero';
import { partShows } from './heroDirector';
import type { MaskedSurface } from './materials';

/** Run the hook that three runs before it draws a body. */
function beforeDraw(surface: MaskedSurface): void {
  surface.onBeforeRender(...(new Array(6) as Parameters<MaskedSurface['onBeforeRender']>));
}

describe('the hero materials', () => {
  it('gives each body the tint colors that the look code recolors', () => {
    const materials = createHeroMaterials();
    for (const surface of Object.values(materials.bodies)) {
      expect(surface.masks.tintSkin.value).toBe(materials.skin.color);
      expect(surface.masks.tintOutfit.value).toBe(materials.body.color);
      expect(surface.masks.tintTrim.value).toBe(materials.trim.color);
      expect(surface.masks.tintHair.value).toBe(materials.hair.color);
    }
  });

  it('lets one recolor reach both bodies', () => {
    const materials = createHeroMaterials();
    materials.body.color.setHex(0x3ac0ff);
    materials.skin.color.setHex(0xc68642);
    const outfit = new THREE.Color(0x3ac0ff);
    const skin = new THREE.Color(0xc68642);
    for (const surface of Object.values(materials.bodies)) {
      expect(surface.masks.tintOutfit.value.equals(outfit)).toBe(true);
      expect(surface.masks.tintSkin.value.equals(skin)).toBe(true);
    }
  });

  it('makes each body glow region by region with the outfit, the trim, and the hair', () => {
    const materials = createHeroMaterials();
    materials.body.emissive.setHex(0xff3b3b);
    materials.body.emissiveIntensity = 0.5;
    materials.trim.emissive.setHex(0xffd24d);
    materials.trim.emissiveIntensity = 0.2;
    materials.hair.emissive.setHex(0xffffff);
    materials.hair.emissiveIntensity = 0.6;
    for (const surface of Object.values(materials.bodies)) {
      beforeDraw(surface);
      const { glowOutfit, glowTrim, glowHair } = surface.masks;
      expect(glowOutfit.value.equals(new THREE.Color(0xff3b3b).multiplyScalar(0.5))).toBe(true);
      expect(glowTrim.value.equals(new THREE.Color(0xffd24d).multiplyScalar(0.2))).toBe(true);
      expect(glowHair.value.equals(new THREE.Color(0xffffff).multiplyScalar(0.6))).toBe(true);
      // The body's own emissive stays black: the skin and the face never glow.
      expect(surface.emissive.getHex()).toBe(0x000000);
    }
  });
});

describe('the eye rule', () => {
  it('shows the painted eyes as Tripo drew them before any Form', () => {
    expect(formEye(null)).toBeNull();
  });

  it("puts each Form's eye color on the iris once that Form is earned", () => {
    for (const form of FORMS) {
      const palette = FORM_PALETTES[form.id];
      expect(palette).toBeDefined();
      if (palette) expect(formEye(palette)).toBe(palette.eye);
    }
  });
});

describe('the parts a hero shows', () => {
  /** The garment meshes of hero.glb, fitted to each body (ADR 0013). */
  const GARMENT_MESHES = ['GarmentCape', 'GarmentArmor'];

  it('shows the painted body as the gi, with no garment piece', () => {
    for (const body of ['girl', 'boy'] as const) {
      const parts = heroParts({ ...DEFAULT_APPEARANCE, body, garment: 'gi' }, null);
      expect(partShows(parts, parts.body)).toBe(true);
      for (const garment of GARMENT_MESHES) {
        expect(partShows(parts, garment, parts.body)).toBe(false);
      }
    }
  });

  it('shows the chosen garment piece on the chosen body only', () => {
    const parts = heroParts({ ...DEFAULT_APPEARANCE, body: 'boy', garment: 'cape' }, null);
    expect(partShows(parts, 'GarmentCape', 'BodyBoy')).toBe(true);
    expect(partShows(parts, 'GarmentCape', 'BodyGirl')).toBe(false);
    expect(partShows(parts, 'GarmentArmor', 'BodyBoy')).toBe(false);
  });
});
