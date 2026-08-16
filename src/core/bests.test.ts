import { describe, expect, it } from 'vitest';
import { emptyPerSkill, familyLeaderboard, parseSaveFile, SAVE_FILE_VERSION, update } from './index';
import type { GameState, PlayerRecord } from './index';
import { answerCorrectly, freshRound, perSkill } from './test-helpers';

/** Leaderboard expectation: zero for every Skill unless overridden. */
const zeroPerSkill = (overrides: Record<string, number>) => ({ ...emptyPerSkill(() => 0), ...overrides });

/** Play a round scoring `corrects` correct answers, then end it. */
function playRound(state: GameState, corrects: number, endNow: number): ReturnType<typeof update> {
  for (let i = 0; i < corrects; i++) state = answerCorrectly(state).state;
  return update(state, { type: 'TICK', now: endNow });
}

function nextRound(state: GameState): GameState {
  state = update(state, { type: 'PLAY_AGAIN' }).state;
  return update(state, { type: 'ROUND_STARTED' }).state;
}

describe('Personal Bests', () => {
  it('records the first scoring Round as the best for that difficulty', () => {
    const result = playRound(freshRound(31), 2, 999_999); // 20 points on Easy
    expect(result.state.players[0]?.bests).toEqual(perSkill({ multiply: { easy: 20 } }));
    expect(result.effects.map((e) => e.type)).toEqual([
      'ROUND_ENDED',
      'NEW_PERSONAL_BEST',
      'SAVE_FILE_CHANGED',
    ]);
  });

  it('a zero-point Round records no best and no celebration', () => {
    const result = playRound(freshRound(32), 0, 999_999);
    expect(result.state.players[0]?.bests).toEqual(perSkill());
    expect(result.effects.some((e) => e.type === 'NEW_PERSONAL_BEST')).toBe(false);
  });

  it('only a higher score beats the best; per difficulty independently', () => {
    // Round 1 on Easy: 5 corrects = 80 points → best.
    let state = playRound(freshRound(33), 5, 999_999).state;
    // Round 2 on Easy: 2 corrects = 20 points → no new best.
    const worse = playRound(nextRound(state), 2, 9_999_999);
    expect(worse.state.players[0]?.bests).toEqual(perSkill({ multiply: { easy: 80 } }));
    expect(worse.effects.some((e) => e.type === 'NEW_PERSONAL_BEST')).toBe(false);

    // Round 3 on Medium: 2 corrects = 40 points → separate best.
    state = update(worse.state, { type: 'PLAY_AGAIN' }).state;
    state = update(state, { type: 'DIFFICULTY_CHANGED', difficulty: 'medium' }).state;
    state = update(state, { type: 'ROUND_STARTED' }).state;
    const medium = playRound(state, 2, 99_999_999);
    expect(medium.state.players[0]?.bests).toEqual(perSkill({ multiply: { easy: 80, medium: 40 } }));
  });

  it('NEW_PERSONAL_BEST is ordered after LEVEL_UP effects', () => {
    // 70 corrects on Easy = 2640 points → levels 1–5 AND a first best.
    let state = freshRound(34);
    for (let i = 0; i < 70; i++) state = answerCorrectly(state).state;
    const result = update(state, { type: 'TICK', now: 999_999 });
    const types = result.effects.map((e) => e.type);
    expect(types[0]).toBe('ROUND_ENDED');
    expect(types.indexOf('NEW_PERSONAL_BEST')).toBeGreaterThan(types.lastIndexOf('LEVEL_UP'));
    expect(types.at(-1)).toBe('SAVE_FILE_CHANGED');
  });
});

describe('Family Leaderboard', () => {
  it('is derived from player bests, per Skill, and ranked across every Skill', () => {
    const players: PlayerRecord[] = [
      { id: 'p1', name: 'Zara', colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' }, appearance: { body: 'boy', hairStyle: 'spiky', hairLength: 'short', garment: 'gi', skinTone: 'tan' }, roundsPlayed: 1, xp: 100, bests: perSkill({ multiply: { easy: 100 }, divide: { medium: 400 } }), factStats: perSkill() },
      { id: 'p2', name: 'Milo', colors: { hair: 'sky', outfitPrimary: 'red', outfitSecondary: 'white' }, appearance: { body: 'boy', hairStyle: 'spiky', hairLength: 'short', garment: 'gi', skinTone: 'tan' }, roundsPlayed: 2, xp: 400, bests: perSkill({ multiply: { easy: 80, hard: 300 } }), factStats: perSkill() },
      { id: 'p3', name: 'Ana', colors: { hair: 'rose', outfitPrimary: 'green', outfitSecondary: 'blue' }, appearance: { body: 'boy', hairStyle: 'spiky', hairLength: 'short', garment: 'gi', skinTone: 'tan' }, roundsPlayed: 0, xp: 0, bests: perSkill(), factStats: perSkill() },
    ];
    const board = familyLeaderboard(players);
    // Zara's Divide 400 outranks Milo's Multiply 300: one honest sort.
    expect(board.map((e) => e.id)).toEqual(['p1', 'p2', 'p3']);
    expect(board[0]?.bestPerSkill).toEqual(zeroPerSkill({ multiply: 100, divide: 400 }));
    expect(board[0]?.topScore).toBe(400);
    expect(board[1]?.bestPerSkill).toEqual(zeroPerSkill({ multiply: 300 }));
    expect(board[2]?.topScore).toBe(0);
  });

  it('v2 Save Files migrate to v3 with empty bests', () => {
    const v2 = JSON.stringify({
      version: 2,
      players: [
        {
          id: 'p1',
          name: 'Zara',
          colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
          roundsPlayed: 3,
          xp: 250,
        },
      ],
      nextPlayerId: 2,
    });
    const migrated = parseSaveFile(v2);
    expect(migrated?.version).toBe(SAVE_FILE_VERSION);
    expect(migrated?.players[0]).toMatchObject({ xp: 250, bests: perSkill() });
  });
});
