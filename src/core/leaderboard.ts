// The Family Leaderboard is derived from the players' stored bests —
// never a second stored structure, so it can never fall out of sync.

import type { PlayerRecord } from './players';
import { SKILLS } from './skills';
import type { Skill } from './skills';

export interface LeaderboardEntry {
  id: string;
  name: string;
  /** The player's highest best per Skill, across all difficulties. */
  bestPerSkill: Record<Skill, number>;
  /** The player's highest best across every Skill × Difficulty. */
  topScore: number;
}

export function familyLeaderboard(players: readonly PlayerRecord[]): LeaderboardEntry[] {
  return players
    .map((p) => {
      const bestPerSkill = Object.fromEntries(
        SKILLS.map((skill) => [skill, Math.max(0, ...Object.values(p.bests[skill]))]),
      ) as Record<Skill, number>;
      return {
        id: p.id,
        name: p.name,
        bestPerSkill,
        topScore: Math.max(0, ...Object.values(bestPerSkill)),
      };
    })
    .sort((a, b) => b.topScore - a.topScore || a.name.localeCompare(b.name));
}
