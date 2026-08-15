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
  hemi: { sky: 0x8fa3ff, ground: 0x5a3b22, intensity: 0.85 },
  sun: { color: 0xffb26b, intensity: 2.0 },
  rim: { color: 0x3ac0ff, intensity: 0.7 },

  /** Subtle colored fills lifting the muddy corners of the arena. */
  fillLights: [
    { color: 0xff7a4d, intensity: 2.5, position: [-6, 1.2, 3] as const },
    { color: 0x6f5aff, intensity: 2.5, position: [6, 1.0, -4] as const },
  ],

  /** One directional shadow grounds the characters. */
  shadow: {
    mapSize: 1024,
    /** Half-extent of the sun's shadow frustum around the arena. */
    range: 12,
  },
} as const;
