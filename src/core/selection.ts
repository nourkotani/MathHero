// Internal selection seam — private to the core, exercised only through
// update()/initialState(). This ticket ships the uniform adapter; Adaptive
// Selection later adds a weighted adapter behind the same interface.

import { nextInt } from './prng';
import type { Question } from './types';

export interface SelectionArgs {
  candidates: readonly Question[];
  prng: number;
}

export type Selector = (args: SelectionArgs) => { question: Question; prng: number };

export const uniformSelector: Selector = ({ candidates, prng }) => {
  if (candidates.length === 0) {
    throw new Error('selection requires at least one candidate');
  }
  const draw = nextInt(prng, 0, candidates.length - 1);
  const question = candidates[draw.value];
  if (question === undefined) {
    throw new Error('selection index out of range');
  }
  return { question, prng: draw.state };
};

/** Every displayed operand pair for times tables 1–12. */
export function allCandidates(): Question[] {
  const candidates: Question[] = [];
  for (let a = 1; a <= 12; a++) {
    for (let b = 1; b <= 12; b++) {
      candidates.push({ a, b });
    }
  }
  return candidates;
}
