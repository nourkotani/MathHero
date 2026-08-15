// The single place "points for this correct answer" is computed.
// The Power Streak ticket multiplies the base here.

import { tierFor } from './difficulty';
import type { GameState } from './types';

export function pointsForCorrect(state: GameState): number {
  return tierFor(state.difficulty).basePoints;
}
