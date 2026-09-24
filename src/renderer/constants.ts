// Arena layout, used across the renderer modules. (By-eye tuning values —
// looks and motion feel alike — live in style.ts, not here.)

/** Where the fighters stand, in world x. */
export const HERO_X = -2.4;
export const DUMMY_X = 2.4;

/** The painted sky dome's radius around the arena. */
export const SKY_RADIUS = 80;

/** The camera's far plane: past the whole dome from any framing, even the
 *  far camera of a phone held upright at full screen (framing.test.ts). */
export const CAMERA_FAR = 160;
