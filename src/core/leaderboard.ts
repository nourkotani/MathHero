// The Family Leaderboard is derived from the players' stored bests —
// never a second stored structure, so it can never fall out of sync.

import type { Difficulty } from './difficulty';
import type { PlayerRecord } from './players';

export interface LeaderboardEntry {
  id: string;
  name: string;
  bests: Partial<Record<Difficulty, number>>;
  /** The player's highest best across all difficulties. */
  topScore: number;
}

export function familyLeaderboard(players: readonly PlayerRecord[]): LeaderboardEntry[] {
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      bests: p.bests,
      topScore: Math.max(0, ...Object.values(p.bests)),
    }))
    .sort((a, b) => b.topScore - a.topScore || a.name.localeCompare(b.name));
}
