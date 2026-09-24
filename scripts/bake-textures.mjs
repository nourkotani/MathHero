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

// ------------------------------------------------------------ flipbook sheets

/**
 * Bake an RGBA flipbook: `frames` square frames side by side in one sheet,
 * played at render time by stepping the texture offset. shadeFrame(u, v, t)
 * paints one frame, with t = frame index / (frames - 1) running 0 → 1.
 */
function bakeFlipbook(frames, size, shadeFrame) {
  const pixels = paintWide(size * frames, size, 4, (u, v) => {
    const frame = Math.min(frames - 1, Math.floor(u * frames));
    const t = frames === 1 ? 0 : frame / (frames - 1);
    return shadeFrame(u * frames - frame, v, t);
  });
  return encodePng(size * frames, size, pixels, 4);
}

/**
 * Impact shockwave: an expanding energy ring, thick and hot at birth,
 * thinning and fading as it races outward. 8 frames.
 */
function bakeShockwave(frames = 8, size = 128) {
  const wobble = makeNoise(1212, 8);
  return bakeFlipbook(frames, size, (u, v, t) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    const theta = Math.atan2(dy, dx);
    // The ring wobbles slightly so it reads painted, not compass-drawn.
    const wob = (fbm(wobble, (theta / Math.PI + 1) * 4, t * 3, 2) - 0.5) * 0.06;
    const r = Math.hypot(dx, dy) + wob;
    const radius = 0.15 + t * 0.78;
    const thickness = 0.16 * (1 - t * 0.65);
    const band = Math.max(0, 1 - Math.abs(r - radius) / thickness);
    const alpha = band * band * (1 - t * t);
    const heat = Math.min(1, band * 1.6);
    return [255, 255 * (0.75 + heat * 0.25), 255 * (0.5 + heat * 0.5), 255 * alpha];
  });
}

/**
 * Anime impact star: the classic four-point flash frame — rays snap out
 * long, then the whole star collapses and fades. 6 frames.
 */
function bakeImpactStar(frames = 6, size = 128) {
  return bakeFlipbook(frames, size, (u, v, t) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    const r = Math.hypot(dx, dy);
    // Snap out fast, hold, then die: reach peaks early, alpha dives late.
    const reach = Math.min(1, t * 3 + 0.35) * (1 - Math.max(0, t - 0.5) * 1.4);
    let a = 0;
    // Four long cardinal rays and four short diagonals, as thin lozenges.
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const long = i % 2 === 0;
      const len = (long ? 0.95 : 0.4) * reach;
      const along = dx * Math.cos(angle) + dy * Math.sin(angle);
      const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
      if (along <= 0 || along > len) continue;
      const width = (long ? 0.075 : 0.055) * (1 - along / len);
      a = Math.max(a, Math.max(0, 1 - across / Math.max(width, 0.001)));
    }
    // A hot core that dies with the star.
    a = Math.max(a, Math.max(0, 1 - r / (0.16 * reach + 0.001)));
    const alpha = a * (t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2);
    return [255, 255, 255 * 0.9, 255 * Math.min(1, alpha)];
  });
}

// -------------------------------------------------------------- slash.png

/**
 * A hand-drawn slash arc (ticket #56): one brush crescent, drawn across the
 * first frames and then wiped away tail-first. The edge is rough with
 * seeded noise, like ink from a dry brush. White, tinted at scene level.
 * 6 frames.
 */
function bakeSlash(frames = 6, size = 128) {
  const grain = makeNoise(2121, 32);
  return bakeFlipbook(frames, size, (u, v, t) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    const r = Math.hypot(dx, dy);
    // The arc runs from -110° to +110° around the center.
    const angle = Math.atan2(dy, dx);
    const span = (110 * Math.PI) / 180;
    const along = (angle + span) / (2 * span); // 0 at the tail end, 1 at the head
    if (along < 0 || along > 1) return [255, 255, 255, 0];
    // Drawn head-first over the first half, wiped tail-first after.
    const head = Math.min(1, 0.35 + t * 2);
    const tail = Math.max(0, (t - 0.45) * 1.9);
    if (along > head || along < tail) return [255, 255, 255, 0];
    // A brush stroke: fat in the middle, pointed at both ends.
    const width = 0.13 * Math.sin(Math.PI * along) ** 0.7;
    const rough = (fbm(grain, u * 18, v * 18, 3) - 0.5) * 0.05;
    const edge = Math.abs(r - 0.68) - width - rough;
    const alpha = Math.max(0, Math.min(1, -edge / 0.012));
    return [255, 255, 255, 255 * alpha];
  });
}

// -------------------------------------------------------------- burst.png

/**
 * A bold comic burst (ticket #56): a jagged star of uneven spikes, solid
 * and flat like a panel in a comic, with no text. It punches out, then a
 * hole opens in its middle and it breaks apart. 6 frames.
 */
function bakeBurst(frames = 6, size = 128) {
  // Fixed, uneven spike lengths: the burst reads hand-cut, not stamped.
  const spikes = [1, 0.72, 0.93, 0.66, 0.98, 0.7, 0.9, 0.62, 1, 0.75, 0.88, 0.68];
  return bakeFlipbook(frames, size, (u, v, t) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    const r = Math.hypot(dx, dy);
    const a = ((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * spikes.length;
    const i = Math.floor(a) % spikes.length;
    const f = a - Math.floor(a);
    // Between two spike tips, the edge dips into a notch.
    const tipA = spikes[i];
    const tipB = spikes[(i + 1) % spikes.length];
    const notch = 0.42;
    const outline = f < 0.5 ? tipA + (notch - tipA) * (f / 0.5) : notch + (tipB - notch) * ((f - 0.5) / 0.5);
    const grow = Math.min(1, 0.55 + t * 1.6);
    const outer = outline * 0.95 * grow;
    const hole = Math.max(0, (t - 0.35) * 1.3) * outline;
    const inside = Math.min((outer - r) / 0.02, (r - hole) / 0.02);
    const alpha = Math.max(0, Math.min(1, inside)) * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    return [255, 250, 225, 255 * alpha];
  });
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

/**
 * Blast core: a roiling ball of energy, its rim licking differently every
 * frame — played on a loop while the projectile flies. 6 frames.
 */
function bakeBlastCore(frames = 6, size = 128) {
  const roil = makeNoise(1717, 16);
  return bakeFlipbook(frames, size, (u, v, t) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    const theta = Math.atan2(dy, dx);
    // The rim boils: each frame samples a different slice of the noise.
    const lick =
      (fbm(roil, (theta / Math.PI + 1) * 8, t * 6.7, 3) - 0.5) * 0.34;
    const r = Math.hypot(dx, dy);
    const rim = 0.62 + lick;
    const body = Math.max(0, Math.min(1, (rim - r) / 0.16));
    const core = Math.max(0, 1 - r / 0.34);
    const alpha = Math.min(1, body * 0.85 + core);
    const heat = Math.min(1, core * 1.4);
    return [255, 255 * (0.72 + heat * 0.28), 255 * (0.4 + heat * 0.6), 255 * alpha];
  });
}

/**
 * Charge-up ring: a bright band that tightens and flares as power gathers —
 * the sprite's shrinking scale does the rushing-inward, the frames do the
 * tightening and brightening. 6 frames.
 */
function bakeChargeRing(frames = 6, size = 128) {
  return bakeFlipbook(frames, size, (u, v, t) => {
    const r = Math.hypot(u * 2 - 1, v * 2 - 1);
    const thickness = 0.2 - t * 0.12;
    const band = Math.max(0, 1 - Math.abs(r - 0.72) / thickness);
    const alpha = band * band * (0.5 + t * 0.5);
    return [255, 255 * (0.85 + t * 0.15), 255 * 0.72, 255 * Math.min(1, alpha)];
  });
}

/**
 * Lightning arc: a jagged bolt re-striking on every frame — the same
 * endpoints, a different seeded path. 6 frames.
 */
function bakeLightning(frames = 6, size = 128) {
  return bakeFlipbook(frames, size, (u, v, t) => {
    // A polyline from top to bottom, kinked at fixed heights by per-frame
    // pseudo-random offsets; distance to the nearest segment lights it.
    const kinks = 6;
    const jag = (i, f) => {
      let h = Math.imul((i + 1) * 374761393, Math.imul(f + 1, 668265263) | 1);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return (((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.52;
    };
    const frame = Math.round(t * (frames - 1));
    let a = 0;
    for (let i = 0; i < kinks; i++) {
      const y0 = i / kinks;
      const y1 = (i + 1) / kinks;
      const x0 = 0.5 + (i === 0 ? 0 : jag(i, frame));
      const x1 = 0.5 + (i === kinks - 1 ? 0 : jag(i + 1, frame));
      const dy = y1 - y0;
      const s = Math.max(0, Math.min(1, (v - y0) / dy));
      if (v < y0 - 0.02 || v > y1 + 0.02) continue;
      const dist = Math.abs(u - (x0 + (x1 - x0) * s));
      a = Math.max(a, Math.max(0, 1 - dist / 0.03));
      // A soft glow sleeve around the hot core.
      a = Math.max(a, Math.max(0, 1 - dist / 0.1) * 0.35);
    }
    return [235, 245, 255, 255 * Math.min(1, a)];
  });
}

// ------------------------------------------------------ cosmetic sheets

/**
 * One wing feather panel: a swept quill with a soft barbed edge, cut out by
 * alpha so the silhouette reads as a feather rather than a cone. Brightest
 * along the shaft, fading to translucent at the vane's trailing edge.
 * u runs root → tip, v runs across the vane.
 */
function bakeFeather(width = 256, height = 128) {
  // Cel art wants a crisp blade, not fine barbs: at play distance soft
  // detail turns to mush, so the silhouette carries the whole read.
  const SPLITS = 3; // barb separations cut into the trailing half

  const pixels = paintWide(width, height, 4, (u, v) => {
    // Rounded at the root, swept to a point at the tip, cambered upward.
    const camber = 0.5 - Math.sin(u * Math.PI * 0.85) * 0.16;
    const taper = Math.sin(Math.min(1, 0.12 + u * 1.02) * Math.PI * 0.9) ** 0.75;
    const halfWidth = 0.42 * taper * (1 - u * 0.55);
    let across = Math.abs(v - camber) / Math.max(halfWidth, 0.0001);
    if (across > 1.2) return [0, 0, 0, 0];

    // Barb splits: clean notches angled back from the trailing edge.
    let notch = 0;
    for (let i = 1; i <= SPLITS; i++) {
      const at = 0.34 + (i / (SPLITS + 1)) * 0.5;
      const d = Math.abs(u - at + (v - camber) * 0.35);
      notch = Math.max(notch, Math.max(0, 1 - d / 0.022));
    }
    // Trailing side only, so the leading edge stays one clean line.
    if (v > camber) across += notch * 0.55;

    // Near-binary alpha with a thin soft rim keeps the shape crisp.
    const alpha = Math.max(0, Math.min(1, (1 - across) * 7));
    // Hot leading edge and shaft, cooling toward the trailing vane.
    const shaft = Math.max(0, 1 - Math.abs(v - camber) / (halfWidth * 0.22 + 0.0001));
    const lead = v < camber ? Math.max(0, 1 - across * 1.6) * 0.35 : 0;
    const value = Math.min(1, 0.6 + shaft * 0.4 + lead + (1 - u) * 0.08);
    return [255 * value, 255 * value, 255 * value, 255 * alpha];
  });
  return encodePng(width, height, pixels, 4);
}

/**
 * A halo / energy ring as a flat disc with real falloff: a bright band that
 * fades softly inward and outward, with a faint second bloom rim. Replaces
 * the hard-edged torus so rings read as light, not plastic hoops.
 */
function bakeHaloRing(size = 256) {
  const shimmer = makeNoise(1919, 32);

  const pixels = paintWide(size, size, 4, (u, v) => {
    const dx = u * 2 - 1;
    const dy = v * 2 - 1;
    const r = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    // A slow shimmer around the circumference keeps it from reading CG-flat.
    const wobble = (fbm(shimmer, (theta / Math.PI + 1) * 6, 0.5, 2) - 0.5) * 0.03;
    const band = Math.max(0, 1 - Math.abs(r - (0.78 + wobble)) / 0.11);
    const halo = Math.max(0, 1 - Math.abs(r - 0.78) / 0.3) * 0.28;
    const alpha = Math.min(1, band * band * 1.15 + halo * halo);
    const heat = Math.min(1, band * 1.3);
    return [255, 255 * (0.86 + heat * 0.14), 255 * (0.7 + heat * 0.3), 255 * alpha];
  });
  return encodePng(size, size, pixels, 4);
}

/**
 * A comet streak: hot round head at one end, tapering to nothing at the
 * other, with a couple of lighter filaments in the tail. u runs head → tail.
 */
function bakeStreak(width = 256, height = 64) {
  const wisp = makeNoise(2020, 32);

  const pixels = paintWide(width, height, 4, (u, v) => {
    const across = Math.abs(v - 0.5) * 2;
    // Thick at the head, pinched to a point at the tail.
    const thickness = (1 - u) ** 0.7;
    const body = Math.max(0, 1 - across / Math.max(thickness, 0.001));
    // Filaments split off the main streak toward the tail.
    const strand = fbm(wisp, u * 8, v * 6, 3);
    const filament = Math.max(0, 1 - Math.abs(across - strand * 0.9) / 0.25) * u * 0.4;
    const head = Math.max(0, 1 - Math.hypot((u - 0.04) * 6, (v - 0.5) * 2.4));
    const alpha = Math.min(1, body * body * (1 - u * 0.55) + filament + head);
    const heat = Math.min(1, head + body * (1 - u) * 0.9);
    return [255, 255 * (0.78 + heat * 0.22), 255 * (0.45 + heat * 0.55), 255 * alpha];
  });
  return encodePng(width, height, pixels, 4);
}

/**
 * A wisp / spirit mote: a soft four-point star glow — rounder and gentler
 * than the impact spark, so orbiting spirits read as living energy.
 */
function bakeWisp(size = 128) {
  const pixels = paintWide(size, size, 4, (u, v) => {
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    const r = Math.hypot(dx, dy);
    const halo = Math.max(0, 1 - r) ** 2.6;
    const core = Math.max(0, 1 - r * 3.4) ** 1.4;
    // Gentle four-point flare so it twinkles rather than blobs.
    const points =
      Math.max(0, 1 - Math.abs(dx) * 7) * Math.max(0, 1 - Math.abs(dy) * 1.5) +
      Math.max(0, 1 - Math.abs(dy) * 7) * Math.max(0, 1 - Math.abs(dx) * 1.5);
    const alpha = Math.min(1, halo * 0.7 + core + points * 0.5);
    const white = 255 * Math.min(1, 0.7 + core * 0.3);
    return [white, white, white, 255 * alpha];
  });
  return encodePng(size, size, pixels, 4);
}

// ----------------------------------------------------------- face decals

/**
 * The hero's painted anime face, split across three sheets so a Form can
 * recolor the eyes without the rest of the face following:
 *
 *   'face'  — brows, eye whites, lash arc, mouth. Never tinted.
 *   'iris'  — the iris and pupil, baked in greys for the Form to tint.
 *   'spark' — the catchlights, pure white and never tinted, drawn on top.
 *
 * That split matters: when the catchlight lived on the tinted sheet it
 * turned brown with the iris, and an eye with no spark in it reads dead.
 * Both eyes catch the light from the SAME side for the same reason —
 * mirrored highlights imply two light sources and look wrong.
 *
 * RGBA throughout: transparent everywhere except the features, so every
 * skin tone shows through unchanged.
 */
function bakeFace(girl, part = 'face') {
  const size = 256;
  // Soft-edged coverage of an ellipse, 1 inside, feathering at the rim.
  const ellipse = (u, v, cx, cy, rx, ry, soft = 0.16) => {
    const d = Math.hypot((u - cx) / rx, (v - cy) / ry);
    return Math.max(0, Math.min(1, (1.08 - d) / soft));
  };
  // Soft capsule between two points (brows, lash arc, mouth).
  const stroke = (u, v, x0, y0, x1, y1, w) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((u - x0) * dx + (v - y0) * dy) / len2));
    const dist = Math.hypot(u - (x0 + dx * t), v - (y0 + dy * t));
    return Math.max(0, Math.min(1, (w - dist) / (w * 0.45)));
  };

  const eyeRx = girl ? 0.098 : 0.084;
  const eyeRy = girl ? 0.13 : 0.112;
  const eyeCy = 0.46;
  // The iris sits centred, a touch low — never pushed to one side, which
  // is what made the two eyes look like they pointed different ways.
  const irisCy = eyeCy + 0.012;
  const irisRx = eyeRx * 0.66;
  const irisRy = eyeRy * 0.74;

  const pixels = paintWide(size, size, 4, (u, v) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    const put = (cov, cr, cg, cb) => {
      if (cov <= 0) return;
      const o = Math.min(1, cov);
      r = r * (1 - o) + cr * o;
      g = g * (1 - o) + cg * o;
      b = b * (1 - o) + cb * o;
      a = Math.max(a, o);
    };

    for (const side of [-1, 1]) {
      const cx = 0.5 + side * 0.175;
      const sclera = ellipse(u, v, cx, eyeCy, eyeRx, eyeRy);

      if (part === 'iris') {
        // Greys for the Form to tint: brighter low, darker up under the
        // lash, the way a lit iris actually falls.
        const iris = Math.min(sclera, ellipse(u, v, cx, irisCy, irisRx, irisRy, 0.1));
        const lowLift = 0.72 + Math.max(0, (v - irisCy) / irisRy) * 0.28;
        put(iris, 255 * lowLift, 255 * lowLift, 255 * lowLift);
        // A clean dark pupil, centred in the iris — dark whatever the tint.
        put(Math.min(iris, ellipse(u, v, cx, irisCy, irisRx * 0.46, irisRy * 0.46, 0.12)) * 0.82, 26, 20, 18);
        continue;
      }

      if (part === 'spark') {
        // One bright catchlight up and to the left on BOTH eyes, plus a
        // small echo opposite it. Pure white, never tinted.
        put(ellipse(u, v, cx - 0.03, eyeCy - 0.045, 0.03, 0.036, 0.5), 255, 255, 255);
        put(ellipse(u, v, cx + 0.026, eyeCy + 0.05, 0.015, 0.017, 0.6) * 0.75, 255, 255, 255);
        continue;
      }

      // Friendly brows: a gentle arc, lifted at the outer end.
      put(stroke(u, v, cx - side * 0.08, 0.3, cx + side * 0.072, 0.272, 0.016), 44, 32, 28);
      // The eye white.
      put(sclera, 246, 242, 233);
      // A soft lash arc riding the top rim — an arc, not a filled hood.
      const lash =
        stroke(u, v, cx - eyeRx * 0.96, eyeCy - eyeRy * 0.52, cx, eyeCy - eyeRy * 0.98, 0.016) +
        stroke(u, v, cx, eyeCy - eyeRy * 0.98, cx + eyeRx * 0.96, eyeCy - eyeRy * 0.52, 0.016);
      put(Math.min(1, lash) * Math.min(1, sclera * 3), 38, 28, 26);
      if (girl) {
        // The lash flick at the outer corner.
        put(
          stroke(
            u, v,
            cx + side * eyeRx * 0.92, eyeCy - eyeRy * 0.62,
            cx + side * (eyeRx * 0.92 + 0.032), eyeCy - eyeRy * 0.95,
            0.013,
          ),
          38, 28, 26,
        );
      }
    }

    if (part === 'face') {
      // A small friendly mouth with a gentle upward curve.
      put(stroke(u, v, 0.458, 0.742, 0.5, 0.756, 0.0105), 108, 62, 54);
      put(stroke(u, v, 0.5, 0.756, 0.542, 0.742, 0.0105), 108, 62, 54);
    }

    return [r, g, b, 255 * a];
  });
  return encodePng(size, size, pixels, 4);
}

// ------------------------------------------------------------ cloth / hair

/**
 * Multiply-maps for the toon materials: white where the player's chosen
 * color must stay full, gently darker where fabric weave or hair strands
 * shade it. They can only darken — that is the whole contract. (The
 * Training Dummy's padding is painted in Blender now, ADR 0007.)
 */
function bakeCloth(size = 256) {
  const weave = makeNoise(1313, 32);
  const wash = makeNoise(1414, 8);
  const pixels = paintWide(size, size, 3, (u, v) => {
    let value = 1;
    value -= Math.abs(fbm(weave, u * 32, v * 32, 3) - 0.5) * 0.1;
    value -= (fbm(wash, u * 8, v * 8, 2) - 0.5) * 0.06;
    value -= Math.max(0, Math.sin(v * Math.PI * 40)) * 0.015; // faint weft
    const c = 255 * Math.min(1, value);
    return [c, c, c];
  });
  return encodePng(size, size, pixels);
}

function bakeHairStrands(size = 256) {
  const strand = makeNoise(1515, 64);
  const pixels = paintWide(size, size, 3, (u, v) => {
    // Vertical strand streaks: high frequency across, stretched along.
    const s = fbm(strand, u * 64, v * 6, 3);
    let value = 1 - Math.max(0, 0.55 - Math.abs(s - 0.5)) * 0.28;
    value -= (fbm(strand, u * 10 + 30, v * 3, 2) - 0.5) * 0.08;
    const c = 255 * Math.min(1, value);
    return [c, c, c];
  });
  return encodePng(size, size, pixels);
}

// ------------------------------------------------------------- site icons

/**
 * The Home Screen icon for the hosted copy (ADR 0006): an original glowing
 * power orb — the HUD's score gem — marked with a bold times sign, on the
 * night-blue panel color. 4× supersampled, so the edges stay clean at 180 px.
 */
function bakeIcon(size) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const sample = (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy);
    // Night-blue panel, lighter at the top like the page background.
    let c = mixRgb([29, 35, 80], [11, 14, 34], Math.min(1, Math.hypot(dx, v - 0.1) * 1.3));
    // Gold glow around the orb.
    const glow = Math.exp(-Math.max(0, r - 0.3) * 14) * 0.85;
    c = mixRgb(c, [255, 190, 60], glow * (r > 0.3 ? 1 : 0));
    // The orb: a glossy sphere, lit from the upper left.
    const orb = 1 - smooth(0.33, 0.34, r);
    if (orb > 0) {
      const h = Math.hypot(u - 0.4, v - 0.37) / 0.4;
      let body = h < 0.45 ? mixRgb([255, 243, 196], [255, 179, 0], h / 0.45) : mixRgb([255, 179, 0], [217, 101, 0], (h - 0.45) / 0.55);
      // A soft rim shade keeps it round.
      body = mixRgb(body, [150, 60, 0], smooth(0.24, 0.34, r) * 0.5);
      c = mixRgb(c, body, orb);
    }
    // The times sign: two bars at 45°, white with a warm shadow.
    const bar = (ox, oy) => {
      const a = (dx - ox + dy - oy) / Math.SQRT2;
      const b = (dx - ox - (dy - oy)) / Math.SQRT2;
      const across = Math.min(Math.abs(a), Math.abs(b));
      const along = Math.max(Math.abs(a), Math.abs(b));
      return (1 - smooth(0.042, 0.05, across)) * (1 - smooth(0.15, 0.158, along));
    };
    c = mixRgb(c, [140, 55, 0], bar(0.012, 0.016) * 0.8);
    c = mixRgb(c, [255, 255, 255], bar(0, 0));
    return c;
  };
  const n = 4;
  return encodePng(
    size,
    size,
    paintWide(size, size, 3, (u, v) => {
      const acc = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const px = sample(u + (i + 0.5 - n / 2) / (n * size), v + (j + 0.5 - n / 2) / (n * size));
          acc[0] += px[0];
          acc[1] += px[1];
          acc[2] += px[2];
        }
      }
      return acc.map((x) => x / (n * n));
    }),
  );
}

// --------------------------------------------------------------------- main

mkdirSync(OUT_DIR, { recursive: true });
const bakes = [
  ['ground.png', bakeGround],
  ['sigil.png', bakeSigil],
  ['sky.png', bakeSky],
  ['cloud.png', bakeCloud],
  ['spark.png', bakeSpark],
  ['shockwave.png', bakeShockwave],
  ['impact-star.png', bakeImpactStar],
  ['slash.png', bakeSlash],
  ['burst.png', bakeBurst],
  ['blast-core.png', bakeBlastCore],
  ['charge-ring.png', bakeChargeRing],
  ['lightning.png', bakeLightning],
  ['feather.png', bakeFeather],
  ['halo-ring.png', bakeHaloRing],
  ['streak.png', bakeStreak],
  ['wisp.png', bakeWisp],
  ['face-boy.png', () => bakeFace(false)],
  ['face-girl.png', () => bakeFace(true)],
  ['iris-boy.png', () => bakeFace(false, 'iris')],
  ['iris-girl.png', () => bakeFace(true, 'iris')],
  ['spark-boy.png', () => bakeFace(false, 'spark')],
  ['spark-girl.png', () => bakeFace(true, 'spark')],
  ['cloth.png', bakeCloth],
  ['hair-strands.png', bakeHairStrands],
];
for (const [name, bake] of bakes) {
  const png = bake();
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`baked ${name} (${(png.length / 1024).toFixed(0)} KB)`);
}

// The hosted copy's icons live beside its manifest, never in the game.
const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
mkdirSync(SITE_DIR, { recursive: true });
for (const size of [180, 192, 512]) {
  const png = bakeIcon(size);
  writeFileSync(join(SITE_DIR, `icon-${size}.png`), png);
  console.log(`baked site/icon-${size}.png (${(png.length / 1024).toFixed(0)} KB)`);
}
