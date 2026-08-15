import { describe, expect, it } from 'vitest';
import { factKey, initialState, masteryOf, update } from './index';
import type { FactAttempt, GameState, SaveFile } from './index';
import { answerCorrectly, answerWrongly, dispatchAll, freshRound } from './test-helpers';

const fast = (n: number): FactAttempt[] => Array.from({ length: n }, () => ({ correct: true, ms: 2000 }));
const wrongs = (n: number): FactAttempt[] => Array.from({ length: n }, () => ({ correct: false, ms: 4000 }));

describe('Fact canonicalization', () => {
  it('treats commutative pairs as one Fact, keyed small × large', () => {
    expect(factKey(7, 3)).toBe('3x7');
    expect(factKey(3, 7)).toBe('3x7');
    expect(factKey(12, 12)).toBe('12x12');
  });

  it('shows Facts in either operand order at random', () => {
    let state = freshRound(51);
    let sawAscending = false;
    let sawDescending = false;
    for (let i = 0; i < 200; i++) {
      if (state.question.a < state.question.b) sawAscending = true;
      if (state.question.a > state.question.b) sawDescending = true;
      state = answerCorrectly(state).state;
    }
    expect(sawAscending).toBe(true);
    expect(sawDescending).toBe(true);
  });
});

describe('attempt recording', () => {
  it('records correctness and speed from tick timestamps', () => {
    let state = freshRound(52);
    const key = factKey(state.question.a, state.question.b);
    state = update(state, { type: 'TICK', now: 1500 }).state;
    const result = answerCorrectly(state);
    expect(result.state.players[0]?.factStats[key]).toEqual([{ correct: true, ms: 1500 }]);
  });

  it('records wrong answers too', () => {
    let state = freshRound(53);
    const key = factKey(state.question.a, state.question.b);
    state = update(state, { type: 'TICK', now: 3000 }).state;
    const result = answerWrongly(state);
    expect(result.state.players[0]?.factStats[key]).toEqual([{ correct: false, ms: 3000 }]);
  });
});

describe('mastery classification', () => {
  it('follows the 3-consecutive-fast-correct rule', () => {
    expect(masteryOf(undefined)).toBe('unseen');
    expect(masteryOf([])).toBe('unseen');
    expect(masteryOf(fast(2))).toBe('learning');
    expect(masteryOf(fast(3))).toBe('mastered');
    expect(masteryOf([...wrongs(2), ...fast(3)])).toBe('mastered');
  });

  it('a slow correct answer prevents mastery', () => {
    expect(masteryOf([...fast(2), { correct: true, ms: 9000 }])).toBe('learning');
  });

  it('a miss un-masters', () => {
    expect(masteryOf([...fast(3), { correct: false, ms: 2000 }])).toBe('struggling');
  });
});

describe('Adaptive Selection', () => {
  it('never asks the same Fact twice in a row', () => {
    let state = freshRound(54);
    let previous = factKey(state.question.a, state.question.b);
    for (let i = 0; i < 150; i++) {
      state = answerCorrectly(state).state;
      const current = factKey(state.question.a, state.question.b);
      expect(current).not.toBe(previous);
      previous = current;
    }
  });

  it('weights selection toward Facts the Player gets wrong', () => {
    const mkSave = (factStats: Record<string, FactAttempt[]>): SaveFile => ({
      version: 5,
      lastExportAt: null,
      players: [
        {
          id: 'p1',
          name: 'Zara',
          colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
          roundsPlayed: 0,
          xp: 0,
          bests: {},
          factStats,
        },
      ],
      nextPlayerId: 2,
    });

    const firstQuestionCount = (save: SaveFile, samples: number): number => {
      let hits = 0;
      for (let seed = 0; seed < samples; seed++) {
        const state: GameState = dispatchAll(initialState({ seed, save }), [
          { type: 'PLAYER_SELECTED', id: 'p1' },
          { type: 'ROUND_STARTED' },
        ]);
        if (factKey(state.question.a, state.question.b) === '2x2') hits++;
      }
      return hits;
    };

    // A player who keeps missing 2×2 sees it far more often than baseline.
    const struggling = firstQuestionCount(mkSave({ '2x2': wrongs(5) }), 400);
    const baseline = firstQuestionCount(mkSave({}), 400);
    expect(baseline).toBeLessThan(15); // ≈ 1/95 uniform
    expect(struggling).toBeGreaterThan(20); // ≈ 11/105 weighted
    expect(struggling).toBeGreaterThan(baseline * 2);
  });

  it('stats persist through the Save File (v3 documents migrate)', () => {
    let state = update(freshRound(55), { type: 'TICK', now: 2000 }).state;
    const key = factKey(state.question.a, state.question.b);
    state = answerCorrectly(state).state;
    state = update(state, { type: 'TICK', now: 999_999 }).state; // round ends, save fires

    expect(state.players[0]?.factStats[key]).toHaveLength(1);
  });
});
