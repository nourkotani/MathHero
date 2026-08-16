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

/** Encode an RGB pixel buffer (width × height × 3) as a PNG file. */
function encodePng(width, height, rgb) {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolor RGB

  // Raw scanlines, filter byte 0 per row.
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
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

/** Paint every pixel of a size² RGB buffer via shade(u, v) → [r, g, b]. */
function paint(size, shade) {
  const rgb = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = shade((x + 0.5) / size, (y + 0.5) / size);
      const i = (y * size + x) * 3;
      rgb[i] = clamp255(r);
      rgb[i + 1] = clamp255(g);
      rgb[i + 2] = clamp255(b);
    }
  }
  return rgb;
}

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

// --------------------------------------------------------------------- main

mkdirSync(OUT_DIR, { recursive: true });
const bakes = [['arena-top.png', bakeArenaTop]];
for (const [name, bake] of bakes) {
  const png = bake();
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`baked ${name} (${(png.length / 1024).toFixed(0)} KB)`);
}
