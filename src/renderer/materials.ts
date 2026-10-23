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
 * Lit surfaces on the hero and the Rival: banded toon shading, so
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

let softRamp: THREE.DataTexture | null = null;

/** The soft light steps every painterly material shares. */
function softRampTexture(): THREE.DataTexture {
  if (softRamp === null) {
    softRamp = createToonRamp(STYLE.painterly.ramp);
    // Linear filtering blends neighbouring steps: painted, not cut.
    softRamp.minFilter = THREE.LinearFilter;
    softRamp.magFilter = THREE.LinearFilter;
  }
  return softRamp;
}

/** The rim values every painterly material shares: one tune, every model. */
const rimUniforms = {
  rimColor: { value: new THREE.Color(STYLE.painterly.rim.color) },
  rimStrength: { value: STYLE.painterly.rim.strength },
  rimFrom: { value: STYLE.painterly.rim.from },
  rimTo: { value: STYLE.painterly.rim.to },
};

/** The part of a shader that onBeforeCompile changes. */
interface ShaderEdit {
  uniforms: Record<string, THREE.IUniform>;
  fragmentShader: string;
}

/** Add the colored rim light on the silhouette edge to a toon shader. */
function addRim(shader: ShaderEdit, rimScale: number): void {
  Object.assign(shader.uniforms, rimUniforms, { rimScale: { value: rimScale } });
  shader.fragmentShader = shader.fragmentShader
    .replace(
      'void main() {',
      `uniform vec3 rimColor;
uniform float rimStrength;
uniform float rimFrom;
uniform float rimTo;
uniform float rimScale;
void main() {`,
    )
    .replace(
      '#include <opaque_fragment>',
      `float rimFacing = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
outgoingLight += rimColor * rimStrength * rimScale * smoothstep(rimFrom, rimTo, rimFacing);
#include <opaque_fragment>`,
    );
}

/**
 * The shared look of every Blender-baked model (ADR 0007): the baked
 * painted albedo, soft light steps that blend (the cel ramp, but linear-
 * filtered), and a colored rim light on the silhouette edge.
 *
 * rimScale: 1 for a figure. A wide floor is all grazing angles to the
 * camera, so the rim would ice the whole arena: the arena passes 0.
 */
export function painterlySurface(map: THREE.Texture | null, rimScale = 1): Surface {
  const material = new THREE.MeshToonMaterial({ color: 0xffffff, map, gradientMap: softRampTexture() });
  material.onBeforeCompile = (shader) => addRim(shader, rimScale);
  material.customProgramCacheKey = () => 'painterly';
  material.userData.role = 'painted';
  return material;
}

/**
 * The four painted regions that a hero body wears through its masks. The
 * look code recolors these Surfaces; the body reads their colors as its
 * tints and their glow as its own, region by region.
 */
export interface BodyRegions {
  skin: Surface;
  outfit: Surface;
  trim: Surface;
  hair: Surface;
}

/**
 * The uniforms of a masked body. The tints are the colors of its
 * BodyRegions (the same THREE.Color objects). Hero.tsx gives the masks
 * and the means; the hero build gives the eye.
 */
export interface MaskUniforms {
  /** R skin, G outfit, B trim: 0..1 each, in the body texture's UV space. */
  maskMap: { value: THREE.Texture | null };
  /** R the body's own painted hair, G the iris: 0..1 each, same space. */
  marksMap: { value: THREE.Texture | null };
  tintSkin: { value: THREE.Color };
  tintOutfit: { value: THREE.Color };
  tintTrim: { value: THREE.Color };
  tintHair: { value: THREE.Color };
  /** The mean linear luminance of the painted texture inside each mask. */
  meanSkin: { value: number };
  meanOutfit: { value: number };
  meanTrim: { value: number };
  meanHair: { value: number };
  /** The Form's eye color, on the iris only while eyeOn is 1. */
  eyeColor: { value: THREE.Color };
  eyeOn: { value: number };
  /** Each region's glow (emissive × intensity), read before each draw. */
  glowOutfit: { value: THREE.Color };
  glowTrim: { value: THREE.Color };
  glowHair: { value: THREE.Color };
}

/** A hero body: one painted texture, recolored through its masks. */
export type MaskedSurface = THREE.MeshToonMaterial & { masks: MaskUniforms };

/**
 * A hero body (ADR 0013): Tripo's full painted texture under one
 * material, with the painterly look of painterlySurface. The masks put
 * the Player's colors on the skin, outfit, trim, and hair. Each tint
 * keeps the painted light and shade: the texel's luminance over the
 * region's mean luminance scales the tint. The iris takes the Form's eye
 * color. The texture outside every mask stays as Tripo painted it.
 *
 * The glow follows the regions too: the outfit glows with `outfit`, the
 * trim with `trim`, and the painted hair with `hair`. The skin and the
 * face never glow. The material's own emissive stays black.
 */
export function maskedPainterlySurface(regions: BodyRegions): MaskedSurface {
  const masks: MaskUniforms = {
    maskMap: { value: null },
    marksMap: { value: null },
    tintSkin: { value: regions.skin.color },
    tintOutfit: { value: regions.outfit.color },
    tintTrim: { value: regions.trim.color },
    tintHair: { value: regions.hair.color },
    meanSkin: { value: 1 },
    meanOutfit: { value: 1 },
    meanTrim: { value: 1 },
    meanHair: { value: 1 },
    eyeColor: { value: new THREE.Color() },
    eyeOn: { value: 0 },
    glowOutfit: { value: new THREE.Color(0x000000) },
    glowTrim: { value: new THREE.Color(0x000000) },
    glowHair: { value: new THREE.Color(0x000000) },
  };
  const material = Object.assign(
    new THREE.MeshToonMaterial({ color: 0xffffff, map: null, gradientMap: softRampTexture() }),
    { masks },
  );
  // The same uniform objects go into every compile, so a recompile (a new
  // map) keeps every value that the code set.
  material.onBeforeCompile = (shader) => {
    addRim(shader, 1);
    Object.assign(shader.uniforms, masks);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform sampler2D maskMap;
uniform sampler2D marksMap;
uniform vec3 tintSkin;
uniform vec3 tintOutfit;
uniform vec3 tintTrim;
uniform vec3 tintHair;
uniform float meanSkin;
uniform float meanOutfit;
uniform float meanTrim;
uniform float meanHair;
uniform vec3 eyeColor;
uniform float eyeOn;
uniform vec3 glowOutfit;
uniform vec3 glowTrim;
uniform vec3 glowHair;
void main() {`,
      )
      // vMapUv exists only with a map: without one, the masks read zero.
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
vec3 bodyMask = vec3(0.0);
vec2 bodyMarks = vec2(0.0);
#ifdef USE_MAP
bodyMask = texture2D(maskMap, vMapUv).rgb;
bodyMarks = texture2D(marksMap, vMapUv).rg;
float paintedLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(diffuseColor.rgb, tintSkin * (paintedLum / meanSkin), bodyMask.r);
diffuseColor.rgb = mix(diffuseColor.rgb, tintOutfit * (paintedLum / meanOutfit), bodyMask.g);
diffuseColor.rgb = mix(diffuseColor.rgb, tintTrim * (paintedLum / meanTrim), bodyMask.b);
diffuseColor.rgb = mix(diffuseColor.rgb, tintHair * (paintedLum / meanHair), bodyMarks.r);
diffuseColor.rgb = mix(diffuseColor.rgb, eyeColor, bodyMarks.g * eyeOn);
#endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += glowOutfit * bodyMask.g + glowTrim * bodyMask.b + glowHair * bodyMarks.r;`,
      );
  };
  // Read each region's glow before each draw, so every site that sets an
  // emissive on the regions reaches the body with no new call.
  material.onBeforeRender = () => {
    masks.glowOutfit.value.copy(regions.outfit.emissive).multiplyScalar(regions.outfit.emissiveIntensity);
    masks.glowTrim.value.copy(regions.trim.emissive).multiplyScalar(regions.trim.emissiveIntensity);
    masks.glowHair.value.copy(regions.hair.emissive).multiplyScalar(regions.hair.emissiveIntensity);
  };
  material.customProgramCacheKey = () => 'painterly-masked';
  material.userData.role = 'painted';
  return material;
}

/**
 * The ink of a baked inverted hull: the Blender script already built the
 * shell with flipped normals, so it draws front faces only (unlike the
 * code-built hulls in cel.ts, which draw back faces of a scaled copy).
 */
export function bakedInkSurface(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: STYLE.outline.color });
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

const dataMaps = new Map<string, THREE.Texture>();

/**
 * A baked data texture (a mask), inlined into the single file by the
 * build. Its values are data, not color: no color space, so the GPU
 * never decodes them. flipY stays off, as for the glTF's own textures,
 * so the mask lies in the same UV space as the painted map. Cached per
 * url, as paintedMap.
 */
export function dataMap(url: string): THREE.Texture {
  let texture = dataMaps.get(url);
  if (texture === undefined) {
    texture = new THREE.TextureLoader().load(url);
    texture.colorSpace = THREE.NoColorSpace;
    texture.flipY = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    dataMaps.set(url, texture);
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
