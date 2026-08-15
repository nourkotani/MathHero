// Difficulty is data, not branching: one tier table read by the core's
// question selection, scoring, and the pre-round UI. Adding a tier is a row.

import type { Question } from './types';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultyTier {
  id: Difficulty;
  label: string;
  /** "Tables N–M": one operand from this range, the other from 1–12. */
  tableMin: number;
  tableMax: number;
  basePoints: number;
  /** Static sampling weight per candidate question. */
  weight(question: Question): number;
}

export const DIFFICULTY_TIERS: readonly DifficultyTier[] = [
  { id: 'easy', label: 'Easy', tableMin: 1, tableMax: 5, basePoints: 10, weight: () => 1 },
  { id: 'medium', label: 'Medium', tableMin: 2, tableMax: 9, basePoints: 20, weight: () => 1 },
  {
    id: 'hard',
    label: 'Hard',
    tableMin: 2,
    tableMax: 12,
    basePoints: 30,
    // The notoriously difficult zone gets double coverage.
    weight: (q) => (q.a >= 6 && q.b >= 6 ? 2 : 1),
  },
];

export function tierFor(difficulty: Difficulty): DifficultyTier {
  const tier = DIFFICULTY_TIERS.find((t) => t.id === difficulty);
  if (!tier) throw new Error(`unknown difficulty: ${difficulty}`);
  return tier;
}
