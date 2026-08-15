// The single place "points for this correct answer" is computed:
// base points (difficulty tier, or the flat practice rate) × Power Streak
// multiplier.

import { PRACTICE_BASE_POINTS, tierFor } from './difficulty';
import { tierForStreak } from './streak';
import type { GameState } from './types';

export function pointsForCorrect(
  state: Pick<GameState, 'difficulty' | 'practiceTable'>,
  streak: number,
): number {
  const base =
    state.practiceTable !== null ? PRACTICE_BASE_POINTS : tierFor(state.difficulty).basePoints;
  return base * tierForStreak(streak).multiplier;
}
