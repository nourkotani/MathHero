// The material factory: every material in the scene is created here, named by
// role. Code elsewhere may depend only on the Surface interface (color,
// emissive, emissiveIntensity) — never on a concrete three.js material class —
// so restyling a role (say, characters going toon) is a change to one function
// here, not to every construction site.

import * as THREE from 'three';
import { STYLE } from './style';
import sparkUrl from './textures/spark.png';

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
 * An optional baked multiply-map adds fabric weave, hair strands, or worn
 * padding — white where the player's chosen color must stay full; it can
 * only darken, by design.
 */
export function characterSurface(color: number, mapUrl?: string): Surface {
  sharedRamp ??= createToonRamp(STYLE.ramp);
  const material =
    mapUrl === undefined
      ? new THREE.MeshToonMaterial({ color, gradientMap: sharedRamp })
      : new THREE.MeshToonMaterial({ color, gradientMap: sharedRamp, map: paintedMap(mapUrl) });
  material.userData.role = 'character';
  return material;
}

/**
 * The hero's painted anime face, worn as a transparent decal on a sphere
 * segment floating just off the skull. Deliberately NOT a character-role
 * surface: it must never grow an ink hull or cast a shadow, and depth
 * writes stay off so it cannot z-fight the skull beneath it.
 */
export function faceDecal(url: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: paintedMap(url),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const paintedMaps = new Map<string, THREE.Texture>();

/**
 * A painted texture baked by scripts/bake-textures.mjs, inlined into the
 * single file by the build. Color maps only — hence the sRGB color space.
 * Cached per url: hero rebuilds re-request the same maps forever, and the
 * cache means they share one texture instead of leaking one per rebuild.
 */
export function paintedMap(url: string): THREE.Texture {
  let texture = paintedMaps.get(url);
  if (texture === undefined) {
    texture = new THREE.TextureLoader().load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    paintedMaps.set(url, texture);
  }
  return texture;
}

/**
 * Unlit glow shaped by a baked white-on-black mask (the sigil): the mask is
 * alpha, the material supplies the color. Depth writes stay off so the
 * decal never z-fights the surface it rests on.
 */
export function maskedGlowSurface(color: number, maskUrl: string): THREE.MeshBasicMaterial {
  const mask = new THREE.TextureLoader().load(maskUrl);
  return new THREE.MeshBasicMaterial({
    color,
    alphaMap: mask,
    transparent: true,
    depthWrite: false,
  });
}

/** Lit surfaces on the arena, ground, and rocks. With a painted map, the
 * texture carries the palette — pass white so it isn't double-tinted. */
export function environmentSurface(color: number, roughness: number, map?: THREE.Texture): Surface {
  return map === undefined
    ? new THREE.MeshStandardMaterial({ color, roughness })
    : new THREE.MeshStandardMaterial({ color, roughness, map });
}

/**
 * Deliberately unlit glow: auras, blasts, particles, cosmetic energy, clouds.
 * These must ignore scene lighting so they read as light sources themselves.
 * Pass an opacity to get a transparent glow; omit it for a solid one.
 */
export function glowSurface(color: number, opacity?: number): THREE.MeshBasicMaterial {
  // Transparent glows must never write depth: an invisible aura shell that
  // stamps the z-buffer silently occludes every transparent thing drawn
  // after it — which is exactly how the hero's face decal once vanished.
  return opacity === undefined
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

/**
 * Backdrop pieces that live beyond the fog — the sky dome and the sun disc.
 * Fog must not wash them: they ARE the far distance the fog fades into.
 */
export function backdropSurface(
  color: number,
  opts?: { vertexColors?: boolean; backSide?: boolean; mapUrl?: string },
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    fog: false,
    vertexColors: opts?.vertexColors ?? false,
    side: opts?.backSide ? THREE.BackSide : THREE.FrontSide,
    ...(opts?.mapUrl === undefined ? {} : { map: paintedMap(opts.mapUrl) }),
  });
}

/**
 * A drifting cloud sprite: the baked puff with its real alpha channel,
 * tinted per layer. Depth writes stay off so overlapping puffs blend.
 */
export function cloudSprite(url: string, tint: number, opacity: number): THREE.SpriteMaterial {
  const map = new THREE.TextureLoader().load(url);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map, color: tint, transparent: true, opacity, depthWrite: false });
}

/**
 * A cosmetic light-panel: a baked alpha shape (feather, halo ring, streak)
 * worn on a flat plane and tinted per piece. Additive and depth-write-free
 * so overlapping pieces flare together instead of punching holes in each
 * other, double-sided because wings and halos are seen from both faces.
 */
export function cosmeticPanel(url: string, color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: paintedMap(url),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** The same light, worn as a camera-facing sprite (wisps, star flecks). */
export function cosmeticSprite(url: string, color: number, opacity = 1): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: paintedMap(url),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

let sharedSparkMap: THREE.Texture | null = null;

/**
 * A soft energy mote for bursts, crackle, and aura sparks: the baked
 * hot-core glow puff, tinted per particle, additive so overlapping motes
 * flare instead of muddying. The one spark texture lives here and is
 * shared by every particle; the material is per-particle (its opacity is
 * the fade).
 */
const flipbookBases = new Map<string, THREE.Texture>();

function flipbookBase(url: string): THREE.Texture {
  let base = flipbookBases.get(url);
  if (base === undefined) {
    base = new THREE.TextureLoader().load(url);
    base.colorSpace = THREE.SRGBColorSpace;
    flipbookBases.set(url, base);
  }
  return base;
}

/** Start decoding a flipbook sheet now, long before its first playback. */
export function warmFlipbook(url: string): void {
  flipbookBase(url);
}

/**
 * One playing instance of a baked flipbook sheet (N frames in a row).
 * Texture offset/repeat live on the texture, not the material — so every
 * instance owns its own clone and animates by stepping offset.x = frame / N.
 * Each clone explicitly shares the base's image Source: a plain clone made
 * before the data URI finishes decoding would copy undefined image data
 * into its own Source and stay an untextured quad forever.
 */
export function flipbookMaterial(
  url: string,
  frames: number,
  color: number,
  kind: 'sprite' | 'flat',
): { material: THREE.SpriteMaterial | THREE.MeshBasicMaterial; map: THREE.Texture } {
  const base = flipbookBase(url);
  const map = base.clone();
  map.source = base.source;
  map.repeat.set(1 / frames, 1);
  map.needsUpdate = true;
  const options = {
    map,
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  };
  return {
    material:
      kind === 'sprite'
        ? new THREE.SpriteMaterial(options)
        : new THREE.MeshBasicMaterial({ ...options, side: THREE.DoubleSide }),
    map,
  };
}

export function sparkSprite(color: number): THREE.SpriteMaterial {
  if (sharedSparkMap === null) {
    sharedSparkMap = new THREE.TextureLoader().load(sparkUrl);
    sharedSparkMap.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.SpriteMaterial({
    map: sharedSparkMap,
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/** The star field's point material — unlit, unfogged, softly transparent. */
export function starSurface(color: number, size: number, opacity: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({ color, size, transparent: true, opacity, fog: false });
}

/** The shared ink for outline hulls: unlit, back faces only. */
export function inkSurface(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
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
