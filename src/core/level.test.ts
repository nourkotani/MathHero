import { describe, expect, it } from 'vitest';
import {
  cosmeticUnlockedAt,
  glowIntensityForLevel,
  levelForXp,
  parseSaveFile,
  SAVE_FILE_VERSION,
  update,
  xpForLevel,
} from './index';
import type { GameEffect } from './index';
import { answerCorrectly, freshRound } from './test-helpers';

describe('the level curve', () => {
  it('follows the N × 500 cumulative rule', () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(499)).toBe(0);
    expect(levelForXp(500)).toBe(1);
    expect(levelForXp(999)).toBe(1);
    expect(levelForXp(2500)).toBe(5);
    expect(xpForLevel(7)).toBe(3500);
  });

  it('derives ever-stronger glow from level', () => {
    expect(glowIntensityForLevel(0)).toBe(0);
    expect(glowIntensityForLevel(5)).toBeGreaterThan(glowIntensityForLevel(1));
    expect(glowIntensityForLevel(1000)).toBeLessThanOrEqual(1);
  });

  it('unlocks a major cosmetic tier at every 5th level', () => {
    expect(cosmeticUnlockedAt(5)?.id).toBe('crimson-aura');
    expect(cosmeticUnlockedAt(10)?.id).toBe('energy-crown');
    expect(cosmeticUnlockedAt(7)).toBeUndefined();
  });
});

describe('XP accumulation', () => {
  function playRoundToEnd(state = freshRound(21), endNow = 999_999) {
    // Score 5 correct answers (10 + 10 + 20 + 20 + 20 = 80 XP on Easy).
    for (let i = 0; i < 5; i++) state = answerCorrectly(state).state;
    return update(state, { type: 'TICK', now: endNow });
  }

  it("adds the Round's final score to the active Player's lifetime XP", () => {
    const result = playRoundToEnd();
    expect(result.state.players[0]?.xp).toBe(80);
  });

  it('XP keeps accumulating across Rounds and never resets', () => {
    let state = playRoundToEnd().state;
    state = update(state, { type: 'PLAY_AGAIN' }).state;
    state = update(state, { type: 'ROUND_STARTED' }).state;
    const result = playRoundToEnd(state, 9_999_999);
    expect(result.state.players[0]?.xp).toBe(160);
  });

  it('emits one LEVEL_UP per level gained, in order, with milestone cosmetics', () => {
    // Streak scoring on Easy earns 40/answer at ×4; 70 correct answers pass
    // 2500 XP in one Round, crossing levels 1–5 at once.
    let state = freshRound(22);
    for (let i = 0; i < 70; i++) state = answerCorrectly(state).state;
    const result = update(state, { type: 'TICK', now: 999_999 });

    const levelUps = result.effects.filter(
      (e): e is Extract<GameEffect, { type: 'LEVEL_UP' }> => e.type === 'LEVEL_UP',
    );
    expect(levelUps.map((e) => e.level)).toEqual([1, 2, 3, 4, 5]);
    expect(levelUps[4]?.cosmetic?.id).toBe('crimson-aura');
    expect(levelUps.slice(0, 4).every((e) => e.cosmetic === undefined)).toBe(true);

    // Ceremony order: ROUND_ENDED first, then the LEVEL_UPs, then the save.
    expect(result.effects[0]?.type).toBe('ROUND_ENDED');
    expect(result.effects.at(-1)?.type).toBe('SAVE_FILE_CHANGED');
  });

  it('persists XP through the Save File, migrating v1 documents', () => {
    const v1 = JSON.stringify({
      version: 1,
      players: [
        {
          id: 'p1',
          name: 'Zara',
          colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
          roundsPlayed: 3,
        },
      ],
      nextPlayerId: 2,
    });
    const migrated = parseSaveFile(v1);
    expect(migrated?.version).toBe(SAVE_FILE_VERSION);
    expect(migrated?.players[0]).toMatchObject({ id: 'p1', xp: 0, roundsPlayed: 3 });
  });
});
