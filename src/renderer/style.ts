// Style tokens: every by-eye tuning value for the game's look in one place.
// Tuning the art direction means editing this file, not hunting call sites.

export const STYLE = {
  /** Toon shading bands, dark → lit. More entries = softer cel steps. */
  ramp: [0.28, 0.62, 1.0],

  /** The painterly look of the Blender models (ADR 0007). The painted
   * texture carries the color, the folds, and the edge light; the runtime
   * adds soft light steps and a colored rim on the silhouette edge. */
  painterly: {
    /** Light steps, dark → lit. Linear-filtered, so the steps blend like
     * soft paint instead of hard cel bands. */
    ramp: [0.52, 0.66, 0.84, 0.97, 1.0],
    /** The rim: the edge that turns away from the camera catches this
     * light. from/to set where the rim starts and where it is full
     * (1 - facing), so it is a crisp painted band, not a haze. */
    rim: { color: 0x7fd4ff, strength: 0.75, from: 0.62, to: 0.82 },
  },

  /** The 2.5D side view (framing.ts): field of view in degrees, the
   * margin around the fighters, and how far above their middle the camera
   * stands (a slight look down, still a side view). */
  camera: { fov: 36, margin: 1.12, lift: 0.9, ease: 4 },

  /** The Blender arena floats; the wasteland floor lies this far below
   * (matches GROUND in scripts/blender/arena.py). */
  arena: {
    groundY: -2.4,
    /** No rim on the stone: the floor is all grazing angles (materials.ts). */
    rimScale: 0,
  },

  /** How far the Rival turns from the hero toward the camera
   * (radians): a three-quarter view shows its face and chest target. */
  rivalTurn: 0.6,
  /** Cross-fade between the Rival's clips (seconds): short, so a hit
   * lands on the frame it arrives. */
  rivalBlend: 0.05,
  /** The same for the hero's authored clips. */
  heroBlend: 0.06,

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
    /** Wings anchor at the shoulder blades, not floating off the back.
     * anchorX is small on purpose: the pair is separated in depth, while
     * the sheets themselves fan back and up across the camera's view. */
    wings: {
      anchorX: 0.15,
      anchorY: 1.58,
      anchorZ: -0.26,
      beatSpeed: 1.5,
      /** Feather height as a fraction of its length — wide enough that
       * neighbouring feathers overlap into a sheet. */
      breadth: 0.52,
      /** How far apart the two wings splay, in radians. */
      splay: 0.3,
      /** The flare where the wings meet the back. */
      rootFlare: 0.55,
    },
    /** A crown rests on the head; the halo floats above it. */
    crown: { radius: 0.33, y: 2.42, spin: 0.35 },
    halo: { y: 2.95, tilt: 0.16, bob: 0.04 },
    wisps: { bob: 0.07, bobSpeed: 2.1 },
    /** Ribbons leave the middle of the back and rise; thin so they never
     * read as a tail. */
    trail: { anchorY: 1.2, anchorZ: -0.26, thinness: 0.15, flicker: 0.07, flickerSpeed: 6 },
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
  /** The impact frame on big hits and blasts (ticket #56): two-tone ink
   * and warm paper, held very briefly. The gap between two frames is a
   * safety rule, not a look, so it lives in impactFrame.ts. */
  impactFrame: { duration: 0.08, strength: 0.85, threshold: 0.33, ink: 0x14101f, paper: 0xfff1d6 },

  impact: {
    /** A hand-drawn slash arc on every strike; the angle cycles by attack. */
    slash: { duration: 0.24, from: 1.7, to: 2.1, angles: [-0.5, 0.65, -1.15, 0.25] as const },
    /** The bold comic burst on big hits and big blasts. */
    comicBurst: { duration: 0.3, from: 1.3, to: 3.4, color: 0xfff0b8 },
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
    /** A strike. The Attack clip owns its length (ADR 0012); these are
     *  fractions. anticipation: the share of the clip before the strike
     *  phase (hero.py ATTACK_ANTICIPATION). contactFrom: the strike phase
     *  where a fist or boot on the Rival's hurtbox lands the hit (hero.py
     *  CONTACT_FROM: the dash starts there); landBy: the latest it lands
     *  without contact (the dash peaks at 0.65 of the strike phase). */
    attack: { anticipation: 0.18, contactFrom: 0.3, landBy: 0.75 },
    /** Render freeze on high-streak hits: duration and how frozen it is. */
    hitstop: { duration: 0.07, timeScale: 0.02 },
    /** Camera punch-in on Super-mode blasts. */
    punch: { dolly: 1.5, drop: 0.12, duration: 0.5, shake: 0.3 },
    /** A strike's small punch-in, as a share of the full punch. */
    nudge: 0.3,
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
