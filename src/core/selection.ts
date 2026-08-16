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
import { skillFor } from './skills';
import type { Skill } from './skills';
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

/**
 * Candidates for a difficulty: one operand from the tier's tables, the other
 * 1–12. Enumerated as canonical Facts (a ≤ b) so every commutative pair is one
 * candidate — otherwise squares like 7×7 would be sampled at half weight.
 * Display order is randomized after selection.
 */
export function candidatesFor(difficulty: Difficulty): Question[] {
  const tier = tierFor(difficulty);
  const inRange = (n: number) => n >= tier.tableMin && n <= tier.tableMax;
  const candidates: Question[] = [];
  for (let a = 1; a <= 12; a++) {
    for (let b = a; b <= 12; b++) {
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
  /** Practice mode: only this table, no difficulty weighting. */
  practiceTable?: number | null;
  /** The Skill in play — only Practice orientation depends on it. */
  skill?: Skill;
}

/** Practice candidates: the chosen table against 1–12, as canonical Facts. */
export function practiceCandidates(table: number): Question[] {
  const candidates: Question[] = [];
  for (let other = 1; other <= 12; other++) {
    candidates.push({ a: Math.min(table, other), b: Math.max(table, other) });
  }
  return candidates;
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
  const practice = context.practiceTable ?? null;
  const tier = tierFor(difficulty);
  const baseWeigh = practice !== null ? () => 1 : (q: Question) => tier.weight(q);
  let candidates = practice !== null ? practiceCandidates(practice) : candidatesFor(difficulty);
  if (context.excludeKey !== undefined) {
    const remaining = candidates.filter((q) => factKey(q.a, q.b) !== context.excludeKey);
    if (remaining.length > 0) candidates = remaining;
  }
  const selected = weightedSelector({
    candidates,
    prng,
    weigh: (q) => baseWeigh(q) * adaptiveWeight(context.factStats?.[factKey(q.a, q.b)]),
  });
  // A Fact displays in either operand order at random. Always consume the
  // draw so the PRNG stream doesn't depend on whether a square was selected.
  const flip = nextRandom(selected.prng);
  const { a, b } = selected.question;
  const flipped = flip.value < 0.5 && a !== b ? { a: b, b: a } : selected.question;
  // Practice may pin the orientation — the ÷8 table must divide by 8.
  const question =
    practice !== null && context.skill !== undefined
      ? skillFor(context.skill).orientPractice(flipped, practice)
      : flipped;
  return { question, prng: flip.state };
}
