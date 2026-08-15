// The single place "points for this correct answer" is computed:
// difficulty base points × Power Streak multiplier.

import { tierFor } from './difficulty';
import type { Difficulty } from './difficulty';
import { tierForStreak } from './streak';

export function pointsForCorrect(difficulty: Difficulty, streak: number): number {
  return tierFor(difficulty).basePoints * tierForStreak(streak).multiplier;
}
