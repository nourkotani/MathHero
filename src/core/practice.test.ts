import { describe, expect, it } from 'vitest';
import { factKey, update } from './index';
import type { GameEvent, GameState } from './index';
import { answerCorrectly, dispatchAll, preRound } from './test-helpers';

function practiceRound(seed: number, table: number): GameState {
  return dispatchAll(preRound(seed), [
    { type: 'PRACTICE_TABLE_CHANGED', table },
    { type: 'TICK', now: 0 },
    { type: 'ROUND_STARTED' },
  ] as GameEvent[]);
}

describe('selecting practice mode', () => {
  it('sets the table, and picking a difficulty clears it', () => {
    let state = preRound(91);
    state = update(state, { type: 'PRACTICE_TABLE_CHANGED', table: 3 }).state;
    expect(state.practiceTable).toBe(3);

    state = update(state, { type: 'DIFFICULTY_CHANGED', difficulty: 'medium' }).state;
    expect(state.practiceTable).toBeNull();
    expect(state.difficulty).toBe('medium');
  });

  it('rejects tables outside 1–12 and ignores changes mid-Round', () => {
    const state = preRound(92);
    expect(update(state, { type: 'PRACTICE_TABLE_CHANGED', table: 0 }).state.practiceTable).toBeNull();
    expect(update(state, { type: 'PRACTICE_TABLE_CHANGED', table: 13 }).state.practiceTable).toBeNull();

    const inRound = practiceRound(92, 3);
    expect(
      update(inRound, { type: 'PRACTICE_TABLE_CHANGED', table: 7 }).state.practiceTable,
    ).toBe(3);
  });

  it('can be cleared back to tier mode explicitly', () => {
    let state = update(preRound(93), { type: 'PRACTICE_TABLE_CHANGED', table: 5 }).state;
    state = update(state, { type: 'PRACTICE_TABLE_CHANGED', table: null }).state;
    expect(state.practiceTable).toBeNull();
  });
});

describe('practice Rounds', () => {
  it('asks only the chosen times table, in either order, never repeating a Fact', () => {
    let state = practiceRound(94, 3);
    let previous = '';
    let sawOtherOrder = false;
    for (let i = 0; i < 60; i++) {
      const { a, b } = state.question;
      expect(a === 3 || b === 3).toBe(true);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(12);
      if (b === 3 && a !== 3) sawOtherOrder = true;
      const key = factKey(a, b);
      expect(key).not.toBe(previous);
      previous = key;
      state = answerCorrectly(state).state;
    }
    expect(sawOtherOrder).toBe(true);
  });

  it('covers the whole table, not just a corner of it', () => {
    let state = practiceRound(95, 7);
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      seen.add(factKey(state.question.a, state.question.b));
      state = answerCorrectly(state).state;
    }
    expect(seen.size).toBeGreaterThanOrEqual(10); // of the 12 possible 7× Facts
  });

  it('scores flat practice points with streak multipliers on top', () => {
    let state = practiceRound(96, 4);
    const expected = [10, 10, 20, 20, 20, 30];
    let total = 0;
    for (const points of expected) {
      const result = answerCorrectly(state);
      total += points;
      expect(result.effects[0]).toMatchObject({ type: 'ANSWER_CORRECT', points });
      state = result.state;
    }
    expect(state.score).toBe(total);
  });

  it('awards XP and records Fact stats, but never a Personal Best', () => {
    let state = practiceRound(97, 6);
    const key = factKey(state.question.a, state.question.b);
    state = answerCorrectly(state).state;
    const result = update(state, { type: 'TICK', now: 999_999 });

    const player = result.state.players[0];
    expect(player?.xp).toBe(10);
    expect(player?.factStats.multiply[key]).toHaveLength(1);
    expect(player?.bests).toEqual({ multiply: {}, divide: {} });
    expect(result.effects.some((e) => e.type === 'NEW_PERSONAL_BEST')).toBe(false);
  });

  it('the practice setting survives play-again for another focused Round', () => {
    let state = practiceRound(98, 9);
    state = dispatchAll(state, [
      { type: 'TICK', now: 999_999 },
      { type: 'PLAY_AGAIN' },
      { type: 'ROUND_STARTED' },
    ]);
    expect(state.practiceTable).toBe(9);
    expect(state.question.a === 9 || state.question.b === 9).toBe(true);
  });
});
