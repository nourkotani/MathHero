// Bakes the painted texture set into src/renderer/textures/*.png.
// Run on demand: `npm run bake:textures`. Deterministic by construction —
// seeded value noise, no Date, no Math.random — so a re-bake with unchanged
// parameters is byte-for-byte identical. The build inlines the PNGs into
// the single HTML file; this script never runs at game time.
//
// Style: painted-anime environment art (soft washes, banded values, visible
// strokes of noise), never photoreal — the world must sit behind cel-shaded
// characters without clashing.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'textures');

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes) {
  let c = -1;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set([...type].map((ch) => ch.charCodeAt(0)), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode a pixel buffer (width × height × channels; 3 = RGB, 4 = RGBA). */
function encodePng(width, height, pixels, channels = 3) {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8); // 8-bit truecolor (+alpha)

  // Raw scanlines, filter byte 0 per row.
  const stride = width * channels;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// ------------------------------------------------------------- seeded noise

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise on a wrap-around lattice, sampled with smoothstep. */
function makeNoise(seed, lattice = 64) {
  const rand = mulberry32(seed);
  const grid = Float64Array.from({ length: lattice * lattice }, () => rand());
  const at = (x, y) => grid[((y % lattice) + lattice) % lattice * lattice + (((x % lattice) + lattice) % lattice)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Fractal sum of value noise, normalized to roughly 0–1. */
function fbm(noise, x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * 2 ** o, y * 2 ** o);
    total += amp;
    amp *= 0.5;
  }
  return sum / total;
}

/** Deterministic per-cell hash in 0–1 for tile-to-tile variation. */
function cellHash(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const mix = (a, b, t) => a + (b - a) * t;

/** Paint every pixel via shade(u, v) → [r, g, b] or [r, g, b, a]. */
function paintWide(width, height, channels, shade) {
  const pixels = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = shade((x + 0.5) / width, (y + 0.5) / height);
      const i = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) pixels[i + c] = clamp255(px[c]);
    }
  }
  return pixels;
}

const paint = (size, shade) => paintWide(size, size, 3, shade);

// ------------------------------------------------------------ arena-top.png

/**
 * The tournament arena's stone top: concentric tile rings split by radial
 * seams, per-tile value shifts, painted mottling, and a dusk-cool wash
 * toward the rim. The cylinder cap maps the inscribed circle; the corners
 * continue the stone so nothing reads as a hard edge from low angles.
 */
function bakeArenaTop(size = 1024) {
  const grain = makeNoise(101);
  const wash = makeNoise(202);
  const warp = makeNoise(303);

  const rgb = paint(size, (u, v) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    // Painted wobble so the tile seams read hand-drawn, not compass-drawn.
    const wobble = (fbm(warp, u * 6, v * 6, 3) - 0.5) * 0.05;
    const r = Math.hypot(dx, dy) + wobble;
    const theta = Math.atan2(dy, dx);

    // Concentric rings of tiles, more segments the further out. The center
    // ring is one whole disc — no radial joints there.
    const ring = Math.floor(r * 5.5);
    const segments = ring === 0 ? 1 : 6 + ring * 4;
    const segPos = (((theta / (Math.PI * 2) + 0.5) + ring * 0.37) % 1) * segments;
    const seg = Math.floor(segPos) % segments;

    // Distance to the nearest seam (ring boundary or radial joint).
    const ringFrac = (r * 5.5) % 1;
    const segFrac = segPos % 1;
    const ringSeamDist = Math.min(ringFrac, 1 - ringFrac) / 5.5;
    const segSeamDist =
      segments === 1
        ? 1
        : (Math.min(segFrac, 1 - segFrac) / segments) * Math.max(r, 0.05) * Math.PI * 2;
    const seam = Math.max(0, 1 - Math.min(ringSeamDist, segSeamDist) / 0.012);

    // Painted stone value: per-tile shift, brush mottling, fine grain.
    let value = 0.8;
    value += (cellHash(ring, seg) - 0.5) * 0.13;
    value += (fbm(wash, u * 5 + ring, v * 5, 3) - 0.5) * 0.12;
    value += (fbm(grain, u * 28, v * 28, 4) - 0.5) * 0.07;
    value -= seam * (0.16 + 0.08 * cellHash(seg, ring));
    // The arena's heart is sun-warmed; the rim cools into the dusk.
    const duskCool = Math.min(1, Math.max(0, (r - 0.45) * 1.4));
    value -= duskCool * 0.06;

    const warm = { r: 216, g: 206, b: 188 };
    const cool = { r: 188, g: 184, b: 202 };
    return [
      mix(warm.r, cool.r, duskCool) * value,
      mix(warm.g, cool.g, duskCool) * value,
      mix(warm.b, cool.b, duskCool) * value,
    ];
  });
  return encodePng(size, size, rgb);
}

// -------------------------------------------------------------- ground.png

/**
 * The wasteland floor: painted dirt washes over the whole 150-unit disc
 * (CircleGeometry maps the full circle into one texture — no tiling seams).
 * Mottled earth, darker scorched patches, and a faint radial fade the fog
 * finishes off.
 */
function bakeGround(size = 1024) {
  const wash = makeNoise(404);
  const patch = makeNoise(505);
  const grain = makeNoise(606);

  const rgb = paint(size, (u, v) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    const r = Math.hypot(dx, dy);

    let value = 0.72;
    value += (fbm(wash, u * 7, v * 7, 3) - 0.5) * 0.22;
    // Broad scorched patches where old battles landed.
    const scorch = fbm(patch, u * 3.5, v * 3.5, 2);
    if (scorch < 0.42) value -= (0.42 - scorch) * 0.55;
    value += (fbm(grain, u * 40, v * 40, 3) - 0.5) * 0.1;
    value -= Math.max(0, r - 0.5) * 0.25;

    // Warm earth center cooling toward the dusk horizon.
    const cool = Math.min(1, r * 0.9);
    return [
      mix(128, 96, cool) * value,
      mix(108, 84, cool) * value,
      mix(74, 82, cool) * value,
    ];
  });
  return encodePng(size, size, rgb);
}

// ---------------------------------------------------------------- rock.png

/**
 * Striated spire stone for the rock cones and broken pillars: diagonal
 * sediment bands warped by noise, painted grain, darker feet. The bands run
 * on v so the cone's u-wrap seam stays invisible.
 */
function bakeRock(size = 512) {
  const warp = makeNoise(707);
  const grain = makeNoise(808);

  const rgb = paint(size, (u, v) => {
    const band = Math.sin((v * 9 + fbm(warp, u * 4, v * 4, 3) * 1.6) * Math.PI * 2);
    let value = 0.62 + band * 0.09;
    value += (fbm(grain, u * 18, v * 18, 4) - 0.5) * 0.14;
    value -= v * 0.18; // darker toward the base (v grows downward on cones)

    return [150 * value, 128 * value, 104 * value];
  });
  return encodePng(size, size, rgb);
}

// --------------------------------------------------------------- sigil.png

/**
 * The arena's original power sigil, painted white-on-black as an alpha mask
 * (the glow material supplies the gold): an eight-ray energy burst inside a
 * double ring, orbit dots between the rays. Strictly original — designed
 * here, referencing nothing.
 */
function bakeSigil(size = 512) {
  // Soft-edged brush: 1 inside, feathering out over `soft`.
  const fill = (d, soft = 0.008) => Math.max(0, Math.min(1, 1 - d / soft));

  const rgb = paint(size, (u, v) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    const r = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);

    let a = 0;
    // Double ring.
    a = Math.max(a, fill(Math.abs(r - 0.92) - 0.03));
    a = Math.max(a, fill(Math.abs(r - 0.62) - 0.018));
    // Eight rays: long cardinal, short diagonal, each a tapering diamond.
    for (let i = 0; i < 8; i++) {
      const rayAngle = (i / 8) * Math.PI * 2;
      const long = i % 2 === 0;
      const len = long ? 0.55 : 0.38;
      const width = (long ? 0.085 : 0.06) * Math.max(0, 1 - r / len);
      let delta = Math.abs(theta - rayAngle);
      delta = Math.min(delta, Math.PI * 2 - delta);
      const across = Math.abs(Math.sin(delta)) * r;
      if (r < len) a = Math.max(a, fill(across - width, 0.012));
    }
    // Center core and orbit dots between the rays.
    a = Math.max(a, fill(r - 0.1, 0.02));
    for (let i = 0; i < 8; i++) {
      const dotAngle = ((i + 0.5) / 8) * Math.PI * 2;
      const dot = Math.hypot(dx - Math.cos(dotAngle) * 0.77, dy - Math.sin(dotAngle) * 0.77);
      a = Math.max(a, fill(dot - 0.035, 0.012));
    }

    const value = a * 255;
    return [value, value, value];
  });
  return encodePng(size, size, rgb);
}

// ----------------------------------------------------------------- sky.png

/**
 * The painted dusk sky, mapped straight onto the dome sphere's UVs
 * (u wraps the horizon — the noise lattice makes it seamless — and only
 * v 0–0.5, zenith to horizon, is ever visible above ground). Deep navy
 * zenith through dusk violet, two warped nebula bands, and a warm sun-fed
 * horizon glow.
 */
function bakeSky(width = 1024, height = 512) {
  // Coarse lattices: the noise period must divide the sampled u-span for a
  // seamless wrap, and a small period keeps the drift slow and cloud-like
  // instead of jittery.
  const wisp = makeNoise(909, 16);
  const band = makeNoise(1010, 8);

  const zenith = { r: 18, g: 21, b: 41 };
  const mid = { r: 58, g: 47, b: 82 };
  const horizon = { r: 154, g: 86, b: 54 };
  const nebulae = [
    { center: 0.2, width: 0.1, r: 46, g: 111, b: 111 }, // teal drift
    { center: 0.36, width: 0.12, r: 122, g: 58, b: 111 }, // magenta drift
  ];

  const pixels = paintWide(width, height, 3, (u, v) => {
    // Visible sky lives in v 0–0.5; stretch the gradient across it and let
    // the below-horizon half hold the horizon color (fog owns it anyway).
    const h = Math.min(1, v / 0.5);
    let r, g, b;
    if (h < 0.6) {
      r = mix(zenith.r, mid.r, h / 0.6);
      g = mix(zenith.g, mid.g, h / 0.6);
      b = mix(zenith.b, mid.b, h / 0.6);
    } else {
      const t = (h - 0.6) / 0.4;
      r = mix(mid.r, horizon.r, t);
      g = mix(mid.g, horizon.g, t);
      b = mix(mid.b, horizon.b, t);
    }

    // Nebula bands: broad drifts whose edges wander slowly around the dome.
    for (const neb of nebulae) {
      const wander = (fbm(band, u * 8, v * 4 + neb.center * 40, 2) - 0.5) * 0.12;
      const dist = Math.abs(h - (neb.center + wander));
      const closeness = Math.max(0, 1 - (dist / neb.width) ** 2);
      const strength = closeness * closeness * 0.38;
      r = mix(r, neb.r, strength);
      g = mix(g, neb.g, strength);
      b = mix(b, neb.b, strength);
    }

    // Painted mottling so no band reads airbrushed.
    const grain = (fbm(wisp, u * 16, v * 8, 3) - 0.5) * 0.1;
    // The last light pooling on the horizon line.
    const glow = Math.max(0, (h - 0.82) / 0.18) * 0.35;
    return [r * (1 + grain) + 80 * glow, g * (1 + grain) + 40 * glow, b * (1 + grain) + 10 * glow];
  });
  return encodePng(width, height, pixels);
}

// --------------------------------------------------------------- cloud.png

/**
 * One soft painted cloud puff with a real alpha channel, tinted per sprite
 * at scene level. Lit faintly from above, lavender in its belly.
 */
function bakeCloud(size = 256) {
  const puff = makeNoise(1111);

  const pixels = paintWide(size, size, 4, (u, v) => {
    const dx = (u - 0.5) * 2.4; // wider than tall
    const dy = (v - 0.5) * 1.6;
    const oval = Math.hypot(dx, dy * 1.8);
    const body = fbm(puff, u * 6, v * 6, 4);
    const alpha = Math.max(0, Math.min(1, (0.9 - oval) * 1.4 + (body - 0.5) * 0.9));
    const topLight = 1 - v * 0.35;
    return [
      235 * topLight,
      228 * topLight,
      245 * topLight,
      255 * Math.min(1, alpha * alpha * 1.6),
    ];
  });
  return encodePng(size, size, pixels, 4);
}

// --------------------------------------------------------------- spark.png

/**
 * One soft energy mote with a real alpha channel: a hot white core inside a
 * feathered glow halo, tinted per particle at scene level. Every burst,
 * crackle, and aura mote wears this instead of a hard-edged polyhedron.
 */
function bakeSpark(size = 64) {
  const pixels = paintWide(size, size, 4, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const halo = Math.max(0, 1 - r) ** 2.2;
    const core = Math.max(0, 1 - r * 3.2) ** 1.5;
    const alpha = Math.min(1, halo * 0.85 + core);
    const white = 255 * Math.min(1, 0.55 + core);
    return [white, white, white, 255 * alpha];
  });
  return encodePng(size, size, pixels, 4);
}

// --------------------------------------------------------------------- main

mkdirSync(OUT_DIR, { recursive: true });
const bakes = [
  ['arena-top.png', bakeArenaTop],
  ['ground.png', bakeGround],
  ['rock.png', bakeRock],
  ['sigil.png', bakeSigil],
  ['sky.png', bakeSky],
  ['cloud.png', bakeCloud],
  ['spark.png', bakeSpark],
];
for (const [name, bake] of bakes) {
  const png = bake();
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`baked ${name} (${(png.length / 1024).toFixed(0)} KB)`);
}
