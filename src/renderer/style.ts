// Style tokens: every by-eye tuning value for the game's look in one place.
// Tuning the art direction means editing this file, not hunting call sites.

export const STYLE = {
  /** Toon shading bands, dark → lit. More entries = softer cel steps. */
  ramp: [0.28, 0.62, 1.0],

  /** Ink outlines on the characters (inverted hull). */
  outline: {
    color: 0x14101f,
    /** Hull scale: how thick the ink line reads. */
    scale: 1.05,
  },

  /** The dusk palette and light rig. */
  sky: 0x1b1f3a,
  fog: { color: 0x453156, near: 26, far: 68 },
  /** The backdrop beyond the fog: sky dome gradient, sun, stars, ridges. */
  skyDome: {
    horizon: 0x9a5636,
    mid: 0x3a2f52,
    zenith: 0x121529,
    /** Dome height where the warm horizon glow gives way to dusk violet. */
    horizonBand: 0.12,
    /** Dome height where the violet has fully deepened to the zenith navy. */
    duskBand: 0.5,
  },
  sunDisc: { color: 0xffc07a, position: [30, 9, -64] as const, radius: 4.5 },
  stars: { count: 140, color: 0xcfd8ff, size: 1.1, opacity: 0.75 },
  ridges: { color: 0x3b2f52 },
  hemi: { sky: 0x8fa3ff, ground: 0x5a3b22, intensity: 0.85 },
  sun: { color: 0xffb26b, intensity: 2.0 },
  rim: { color: 0x3ac0ff, intensity: 0.7 },

  /** Subtle colored fills lifting the muddy corners of the arena. */
  fillLights: [
    { color: 0xff7a4d, intensity: 2.5, position: [-6, 1.2, 3] as const },
    { color: 0x6f5aff, intensity: 2.5, position: [6, 1.0, -4] as const },
  ],

  /** Hero-Level presence: orbiting power motes + charged trim, by bracket. */
  levelStyle: {
    /** One orbiting mote per this many Hero Levels. */
    levelsPerMote: 3,
    maxMotes: 6,
    /** Highest matching bracket wins (min = minimum Hero Level). */
    // trimGlow stays gentle: the charge must tint the chosen outfit
    // colors, never bleach them.
    brackets: [
      { min: 20, energy: 0xd9b3ff, trimGlow: 0.3 }, // prismatic violet
      { min: 15, energy: 0x7ad7ff, trimGlow: 0.26 }, // plasma cyan
      { min: 10, energy: 0xffd24d, trimGlow: 0.22 }, // gold
      { min: 5, energy: 0xc9d8ff, trimGlow: 0.15 }, // silver starlight
      { min: 2, energy: 0xffa94d, trimGlow: 0.1 }, // first embers
      { min: 0, energy: 0xffffff, trimGlow: 0 }, // fresh hero: no charge yet
    ],
  },

  /** Real bloom on the marked glow meshes (ADR 0004). */
  bloom: {
    intensity: 1.35,
    /** Within the selection; keeps near-black glows (eyes) contributing nothing. */
    luminanceThreshold: 0.1,
  },

  /** Motion feel: action timings, hitstop, camera punch, blast smear. */
  juice: {
    /** A strike: coiled anticipation, then the wind-up/release curve. */
    attack: { duration: 0.55, anticipation: 0.12 },
    /** The wrong-answer stumble. */
    stagger: { duration: 0.6 },
    /** Render freeze on high-streak hits: duration and how frozen it is. */
    hitstop: { duration: 0.07, timeScale: 0.02 },
    /** Camera punch-in on Super-mode blasts. */
    punch: { dolly: 1.5, drop: 0.12, duration: 0.5, shake: 0.3 },
    /** Blasts stretch along their flight and squash across it. */
    smear: { along: 1.7, across: 0.72 },
  },

  /** One directional shadow grounds the characters. */
  shadow: {
    mapSize: 1024,
    /** Half-extent of the sun's shadow frustum around the arena. */
    range: 12,
  },
} as const;
