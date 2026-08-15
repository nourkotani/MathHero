// The unified Power Streak system: one tier table is the single source for
// core scoring, the renderer's transformation visuals, and the audio module.
// A new tier is a new row.

export type StreakForm = 'base' | 'aura' | 'surge' | 'super';

export interface StreakTier {
  /** Minimum streak (consecutive correct answers) for this tier. */
  threshold: number;
  multiplier: number;
  /** Named form the renderer maps to a visual treatment. */
  form: StreakForm;
  /** Kid-facing callout when the transformation hits. */
  label: string;
}

export const STREAK_TIERS: readonly StreakTier[] = [
  { threshold: 0, multiplier: 1, form: 'base', label: '' },
  { threshold: 3, multiplier: 2, form: 'aura', label: 'Aura ignited!' },
  { threshold: 6, multiplier: 3, form: 'surge', label: 'Power surge!' },
  { threshold: 10, multiplier: 4, form: 'super', label: 'SUPER MODE!' },
];

export function tierForStreak(streak: number): StreakTier {
  let current = STREAK_TIERS[0];
  if (!current) throw new Error('streak tier table is empty');
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.threshold) current = tier;
  }
  return current;
}
