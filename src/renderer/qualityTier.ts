// The visual quality tier: sun shafts + speed-lines + bloom on strong
// devices, bloom alone on middling ones, the additive-sprite glow everywhere
// else — decided automatically, with no settings UI (ADR 0004). This module
// is the whole rule, as a pure reducer the frame loop feeds fps samples
// into; nothing here touches a clock or the renderer.

/** Ordered strongest to weakest; degradation walks one step at a time. */
export type VisualTier = 'full' | 'bloom' | 'sprites';

const TIER_ORDER: readonly VisualTier[] = ['full', 'bloom', 'sprites'];

export interface TierState {
  tier: VisualTier;
  /** Consecutive samples below the floor so far. */
  lowSamples: number;
}

/** Below this average fps a sample counts as "struggling". */
export const FPS_FLOOR = 45;

/** This many consecutive struggling samples (≈ seconds) trigger degradation. */
export const DEGRADE_AFTER_SAMPLES = 3;

export const initialTierState: TierState = { tier: 'full', lowSamples: 0 };

/**
 * Feed one averaged fps sample. Sustained low fps sheds one tier — the
 * extra post passes go before bloom does — and never climbs back (sticky:
 * flapping between tiers mid-Round would be worse than either tier); brief
 * dips are shrugged off.
 */
export function nextTier(state: TierState, fps: number): TierState {
  if (state.tier === 'sprites') return state;
  if (fps >= FPS_FLOOR) {
    return state.lowSamples === 0 ? state : { tier: state.tier, lowSamples: 0 };
  }
  const lowSamples = state.lowSamples + 1;
  if (lowSamples >= DEGRADE_AFTER_SAMPLES) {
    const next = TIER_ORDER[TIER_ORDER.indexOf(state.tier) + 1] ?? 'sprites';
    return { tier: next, lowSamples: 0 };
  }
  return { tier: state.tier, lowSamples };
}
