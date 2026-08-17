// Style tokens: every by-eye tuning value for the game's look in one place.
// Tuning the art direction means editing this file, not hunting call sites.

export const STYLE = {
  /** Toon shading bands, dark → lit. More entries = softer cel steps. */
  ramp: [0.28, 0.62, 1.0],

  /** Ink outlines on the characters (inverted hull). */
  outline: {
    color: 0x14101f,
    /** Absolute line width in world units — small meshes hull out further,
     * so the ink reads one consistent weight at every camera distance. */
    width: 0.016,
    /** Cap on how far a tiny mesh may hull out (fraction of its size). */
    maxScale: 1.3,
  },

  /** The dusk palette and light rig. The sky dome itself is painted — its
   * palette (zenith navy, nebula drifts, warm horizon) lives in the baker,
   * scripts/bake-textures.mjs, alongside every other baked texture. */
  sky: 0x1b1f3a,
  fog: { color: 0x453156, near: 26, far: 68 },
  sunDisc: { color: 0xffc07a, position: [30, 9, -64] as const, radius: 4.5 },
  /** Light shafts raking from the low sun (the full tier's extra pass). */
  sunShafts: { density: 0.85, decay: 0.91, weight: 0.16, samples: 32 },
  /** Anime speed-lines on big hits (the full tier's other extra pass). */
  speedLines: {
    /** Radial streak slots around the ring. */
    slots: 44,
    /** Peak whiteness of a streak at full flash. */
    strength: 0.75,
    /** Full flash → gone in 1/decay seconds. */
    decay: 3.2,
  },
  stars: { count: 140, color: 0xcfd8ff, size: 1.1, opacity: 0.75 },
  ridges: { color: 0x3b2f52 },
  /** Two parallax layers of drifting cloud sprites. */
  clouds: {
    back: { tint: 0x9b85c9, opacity: 0.45, speed: 0.25 },
    front: { tint: 0xc9a8dd, opacity: 0.6, speed: 0.6 },
  },
  hemi: { sky: 0x8fa3ff, ground: 0x5a3b22, intensity: 0.85 },
  sun: { color: 0xffb26b, intensity: 2.0 },
  rim: { color: 0x3ac0ff, intensity: 0.7 },

  /** Subtle colored fills lifting the muddy corners of the arena. */
  fillLights: [
    { color: 0xff7a4d, intensity: 2.5, position: [-6, 1.2, 3] as const },
    { color: 0x6f5aff, intensity: 2.5, position: [6, 1.0, -4] as const },
  ],

  /** Where the milestone cosmetics sit on the hero, and how they move. */
  cosmetics: {
    /** Wings anchor at the shoulder blades, not floating off the back. */
    wings: { anchorX: 0.3, anchorY: 1.72, anchorZ: -0.22, beatSpeed: 1.5 },
    /** A crown rests on the head; the halo floats above it. */
    crown: { radius: 0.33, y: 2.42, spin: 0.35 },
    halo: { y: 2.95, tilt: 0.16, bob: 0.04 },
    wisps: { bob: 0.07, bobSpeed: 2.1 },
    trail: { offsetZ: 0.45, flicker: 0.07, flickerSpeed: 6 },
  },

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

  /** Impact flipbooks: shockwave ring and anime impact star. */
  impact: {
    shockwave: { duration: 0.32, from: 0.7, to: 2.6, bigDuration: 0.5, bigFrom: 1.1, bigTo: 4.6 },
    star: { duration: 0.26, from: 1.0, to: 2.2, color: 0xffffff },
    /** Height the flat ground ring floats above the arena stone. */
    groundRingY: 0.36,
    /** Power rushing inward on transformations; big = the Landmark scene. */
    chargeRing: { duration: 0.45, from: 3.4, to: 0.7, bigDuration: 0.7, bigFrom: 5.2, bigTo: 1 },
    /** One lightning crackle's lifetime. */
    lightningDuration: 0.28,
    /** The roiling fireball riding each blast: sprite scale and loop speed. */
    blastCore: { scale: 0.9, bigScale: 1.5, fps: 20 },
  },

  /** Where lightning strikes. Per-form crackle rates live in FORM_LOOKS —
   * a form's look has exactly one home. */
  lightning: {
    /** Extra arcs per second while a storm cosmetic is worn. */
    cosmeticRate: 2,
    /** With both sources live, this share of arcs comes from the cosmetic. */
    cosmeticShare: 0.4,
    /** Form crackle hugs the body; storm arcs ride the wisp ring. */
    formRadius: { min: 0.45, spread: 0.2 },
    formHeight: { min: 0.7, spread: 1.3 },
    stormRadius: { min: 0.75, spread: 0.2 },
    stormHeight: { min: 1.3, spread: 0.8 },
    size: { min: 0.5, spread: 0.4 },
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
    mapSize: 2048,
    /** Half-extent of the sun's shadow frustum around the arena. */
    range: 12,
    /** PCF blur radius: how soft the shadow edge reads. */
    radius: 4,
  },
} as const;
