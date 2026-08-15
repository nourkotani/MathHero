// The visual quality tier: bloom on capable devices, the additive-sprite
// glow everywhere else — decided automatically, with no settings UI (ADR
// 0004). This module is the whole rule, as a pure reducer the frame loop
// feeds fps samples into; nothing here touches a clock or the renderer.

export type VisualTier = 'bloom' | 'sprites';

export interface TierState {
  tier: VisualTier;
  /** Consecutive samples below the floor so far. */
  lowSamples: number;
}

/** Below this average fps a sample counts as "struggling". */
export const FPS_FLOOR = 45;

/** This many consecutive struggling samples (≈ seconds) trigger degradation. */
export const DEGRADE_AFTER_SAMPLES = 3;

export const initialTierState: TierState = { tier: 'bloom', lowSamples: 0 };

/**
 * Feed one averaged fps sample. Sustained low fps degrades to sprites for
 * the rest of the session (sticky — flapping between tiers mid-Round would
 * be worse than either tier); brief dips are shrugged off.
 */
export function nextTier(state: TierState, fps: number): TierState {
  if (state.tier === 'sprites') return state;
  if (fps >= FPS_FLOOR) {
    return state.lowSamples === 0 ? state : { tier: 'bloom', lowSamples: 0 };
  }
  const lowSamples = state.lowSamples + 1;
  if (lowSamples >= DEGRADE_AFTER_SAMPLES) return { tier: 'sprites', lowSamples };
  return { tier: 'bloom', lowSamples };
}
