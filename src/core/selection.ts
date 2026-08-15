// Internal selection seam — private to the core, exercised only through
// update()/initialState(). Weights compose: the difficulty tier supplies a
// static base weight now; Adaptive Selection later multiplies its own
// weights on top behind this same interface.

import { tierFor } from './difficulty';
import type { Difficulty } from './difficulty';
import { factKey } from './facts';
import { adaptiveWeight } from './mastery';
import type { FactStats } from './mastery';
import { nextRandom } from './prng';
import type { Question } from './types';

export interface SelectionArgs {
  candidates: readonly Question[];
  prng: number;
  /** Relative sampling weight per candidate; defaults to uniform. */
  weigh?: (question: Question) => number;
}

export type Selector = (args: SelectionArgs) => { question: Question; prng: number };

export const weightedSelector: Selector = ({ candidates, prng, weigh }) => {
  if (candidates.length === 0) {
    throw new Error('selection requires at least one candidate');
  }
  const weights = candidates.map((q) => (weigh ? weigh(q) : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const draw = nextRandom(prng);
  let remaining = draw.value * total;
  for (let i = 0; i < candidates.length; i++) {
    remaining -= weights[i] ?? 0;
    if (remaining < 0) {
      const question = candidates[i];
      if (question !== undefined) return { question, prng: draw.state };
    }
  }
  const last = candidates[candidates.length - 1];
  if (last === undefined) throw new Error('selection index out of range');
  return { question: last, prng: draw.state };
};

/** Candidates for a difficulty: one operand from the tier's tables, the other 1–12. */
export function candidatesFor(difficulty: Difficulty): Question[] {
  const tier = tierFor(difficulty);
  const inRange = (n: number) => n >= tier.tableMin && n <= tier.tableMax;
  const candidates: Question[] = [];
  for (let a = 1; a <= 12; a++) {
    for (let b = 1; b <= 12; b++) {
      if (inRange(a) || inRange(b)) {
        candidates.push({ a, b });
      }
    }
  }
  return candidates;
}

export interface SelectionContext {
  /** The active Player's per-Fact attempt history, for adaptive weighting. */
  factStats?: FactStats;
  /** Fact to exclude — the same question never appears twice in a row. */
  excludeKey?: string;
}

/**
 * Select the next question: tier base weights × adaptive weights × the
 * no-repeat exclusion, composed at the one selection seam.
 */
export function selectQuestion(
  difficulty: Difficulty,
  prng: number,
  context: SelectionContext = {},
): { question: Question; prng: number } {
  const tier = tierFor(difficulty);
  let candidates = candidatesFor(difficulty);
  if (context.excludeKey !== undefined) {
    const remaining = candidates.filter((q) => factKey(q.a, q.b) !== context.excludeKey);
    if (remaining.length > 0) candidates = remaining;
  }
  return weightedSelector({
    candidates,
    prng,
    weigh: (q) => tier.weight(q) * adaptiveWeight(context.factStats?.[factKey(q.a, q.b)]),
  });
}
