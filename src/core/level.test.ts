import { describe, expect, it } from 'vitest';
import {
  COSMETIC_MILESTONES,
  cosmeticUnlockedAt,
  glowIntensityForLevel,
  levelForXp,
  MAX_LEVEL,
  parseSaveFile,
  SAVE_FILE_VERSION,
  update,
  wornCosmetics,
  xpForLevel,
} from './index';
import type { GameEffect } from './index';
import { answerCorrectly, freshRound } from './test-helpers';

describe('the level curve', () => {
  it('follows the N × 500 cumulative rule through level 30', () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(499)).toBe(0);
    expect(levelForXp(500)).toBe(1);
    expect(levelForXp(999)).toBe(1);
    expect(levelForXp(2500)).toBe(5);
    expect(xpForLevel(7)).toBe(3500);
    expect(xpForLevel(30)).toBe(15_000);
  });

  it('steepens above 30: each level costs 25 XP more than the one before', () => {
    // cost(31) = 525, cost(32) = 550, …
    expect(xpForLevel(31)).toBe(15_525);
    expect(xpForLevel(32)).toBe(16_075);
    // The fixture the migration test also uses: level 35 = 17,875 XP.
    expect(xpForLevel(35)).toBe(17_875);
    expect(xpForLevel(100)).toBe(112_125);
    expect(levelForXp(15_524)).toBe(30);
    expect(levelForXp(15_525)).toBe(31);
    expect(levelForXp(17_875)).toBe(35);
    expect(levelForXp(112_124)).toBe(99);
  });

  it('caps the Hero Level at 100 while XP keeps accumulating', () => {
    expect(MAX_LEVEL).toBe(100);
    expect(levelForXp(112_125)).toBe(100);
    expect(levelForXp(10_000_000)).toBe(100);
    expect(xpForLevel(101)).toBe(xpForLevel(100));
  });

  it('derives ever-stronger glow from level, and never weakens a level-20 hero', () => {
    expect(glowIntensityForLevel(0)).toBe(0);
    expect(glowIntensityForLevel(5)).toBeGreaterThan(glowIntensityForLevel(1));
    // The pre-100 curve gave level 20 a 0.6 glow; the rescale must not dim it.
    expect(glowIntensityForLevel(20)).toBeGreaterThanOrEqual(0.6);
    // Growth stays visible all the way to the cap.
    expect(glowIntensityForLevel(100)).toBeGreaterThan(glowIntensityForLevel(60));
    expect(glowIntensityForLevel(60)).toBeGreaterThan(glowIntensityForLevel(30));
    expect(glowIntensityForLevel(1000)).toBeLessThanOrEqual(1);
  });

  it('unlocks a cosmetic tier at every 5th level, and only there', () => {
    expect(cosmeticUnlockedAt(5)?.id).toBe('crimson-aura');
    expect(cosmeticUnlockedAt(10)?.id).toBe('energy-crown');
    expect(cosmeticUnlockedAt(7)).toBeUndefined();
    for (let level = 5; level <= 100; level += 5) {
      expect(cosmeticUnlockedAt(level), `level ${level}`).toBeDefined();
    }
    expect(COSMETIC_MILESTONES).toHaveLength(20);
  });

  it('tiers from 35 up evolve a slot an earlier tier introduced', () => {
    const introduced = new Set(
      COSMETIC_MILESTONES.filter((t) => t.level <= 30).map((t) => t.slot),
    );
    for (const tier of COSMETIC_MILESTONES) {
      if (tier.level < 35 || tier.level === 100) continue;
      expect(introduced.has(tier.slot), `${tier.id} must evolve an existing slot`).toBe(true);
    }
    // Level 100 is the Legend state — the one tier of the form slot.
    const legend = cosmeticUnlockedAt(100);
    expect(legend?.slot).toBe('form');
    expect(legend?.label).toBe('Legend');
  });

  it('flags exactly 25, 50, 75, and 100 as Landmark Levels', () => {
    const landmarks = COSMETIC_MILESTONES.filter((t) => t.landmark).map((t) => t.level);
    expect(landmarks).toEqual([25, 50, 75, 100]);
  });

  it('wears only the highest unlocked tier per slot', () => {
    // Level 30: all six original pieces, exactly as before evolution existed.
    expect(wornCosmetics(30).map((t) => t.id)).toEqual([
      'crimson-aura',
      'energy-crown',
      'lightning-wisps',
      'energy-wings',
      'comet-trail',
      'twin-halo',
    ]);
    // Level 35 evolves the wisps: storm wisps replace lightning wisps.
    const at35 = wornCosmetics(35).map((t) => t.id);
    expect(at35).toContain('storm-wisps');
    expect(at35).not.toContain('lightning-wisps');
    expect(at35).toHaveLength(6);
    // The cap wears one tier per slot, form included.
    expect(wornCosmetics(100)).toHaveLength(7);
    expect(wornCosmetics(4)).toEqual([]);
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
