// The single place "points for this correct answer" is computed:
// base points (difficulty tier, or the flat practice rate) × the Skill's
// base-point scale × Power Streak multiplier.

import { PRACTICE_BASE_POINTS, tierFor } from './difficulty';
import { skillFor } from './skills';
import { tierForStreak } from './streak';
import type { GameState } from './types';

export function pointsForCorrect(
  state: Pick<GameState, 'difficulty' | 'practiceTable' | 'skill'>,
  streak: number,
): number {
  const base =
    state.practiceTable !== null ? PRACTICE_BASE_POINTS : tierFor(state.difficulty).basePoints;
  return base * skillFor(state.skill).basePointScale * tierForStreak(streak).multiplier;
}
