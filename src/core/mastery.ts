// Raw per-Fact attempt data is stored; mastery is a *derived* classification
// computed by everyone (selector weights and the parent-facing grid) from the
// same window — the two can never disagree, and "a miss un-masters" falls out
// for free.

import type { FactKey } from './facts';

export interface FactAttempt {
  correct: boolean;
  /** How long the answer took, in milliseconds (from tick timestamps). */
  ms: number;
}

export type FactStats = Record<FactKey, FactAttempt[]>;

/** How many recent attempts are kept per Fact. */
export const ATTEMPT_WINDOW = 5;
/** Mastered = this many consecutive latest attempts, all correct and fast. */
export const MASTERY_STREAK = 3;
/** "Fast" means answered within about six seconds. */
export const FAST_MS = 6000;

export type Mastery = 'unseen' | 'learning' | 'struggling' | 'mastered';

export function recordAttempt(stats: FactStats, key: FactKey, attempt: FactAttempt): FactStats {
  const window = [...(stats[key] ?? []), attempt].slice(-ATTEMPT_WINDOW);
  return { ...stats, [key]: window };
}

export function masteryOf(attempts: readonly FactAttempt[] | undefined): Mastery {
  if (!attempts || attempts.length === 0) return 'unseen';
  const last = attempts[attempts.length - 1];
  if (last && !last.correct) return 'struggling';
  if (attempts.length >= MASTERY_STREAK) {
    const recent = attempts.slice(-MASTERY_STREAK);
    if (recent.every((a) => a.correct && a.ms < FAST_MS)) return 'mastered';
  }
  return 'learning';
}

/**
 * Adaptive sampling weight for a Fact: wrong and slow answers in the recent
 * window pull the Fact back into rotation. Multiplies the difficulty tier's
 * static weight at the selection seam.
 */
export function adaptiveWeight(attempts: readonly FactAttempt[] | undefined): number {
  if (!attempts || attempts.length === 0) return 1;
  const wrong = attempts.filter((a) => !a.correct).length;
  const slow = attempts.filter((a) => a.correct && a.ms >= FAST_MS).length;
  return 1 + 2 * wrong + slow;
}
