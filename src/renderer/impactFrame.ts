// The impact frame (ticket #56): on a big hit or a big blast, one brief
// high-contrast ink frame, like a panel in an anime fight. Flashes near
// children's eyes must be rare, so this module is the whole rule, as a
// pure function the renderer asks before every flash; the shader lives in
// impactFrameEffect.ts. Render time only — the Game Core never sees it.

import type { VisualTier } from './qualityTier';

/** The least time between two impact frames, in seconds of render time.
 *  At one flash a second at most, this stays far below the three flashes
 *  a second that accessibility guidance warns about. */
export const IMPACT_FRAME_GAP = 1.5;

export interface ImpactGate {
  /** Render time of the last flash that fired. */
  lastAt: number;
}

export const initialImpactGate: ImpactGate = { lastAt: Number.NEGATIVE_INFINITY };

/**
 * Ask to flash at render time `now`. A flash fires only when the gap has
 * passed since the last one, and never on the sprite tier (it has no post
 * pass, ADR 0004). A refused request does not restart the gap.
 */
export function tryImpactFrame(
  gate: ImpactGate,
  now: number,
  tier: VisualTier,
): { fire: boolean; gate: ImpactGate } {
  if (tier === 'sprites' || now - gate.lastAt < IMPACT_FRAME_GAP) return { fire: false, gate };
  return { fire: true, gate: { lastAt: now } };
}
