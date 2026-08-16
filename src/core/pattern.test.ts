import { describe, expect, it } from 'vitest';
import { factKey, skillFor, update } from './index';
import type { GameEffect, GameState, Question } from './index';
import {
  answerCorrectly,
  dispatchAll,
  freshRound,
  perSkill,
  preRound,
  submitAnswer as submit,
  typeDigits,
} from './test-helpers';

// The Pattern Skill 🔁: the Fact worn as a chain — skip-counting "+b from a"
// by default, with the geometric ×2/×3 twist on Facts that contain a 2 or 3.
// Grading is brute-forced for every wear; the twist's eligibility, rate, and
// Practice exclusion are proven statistically through the public interface.

/** A running Pattern Round, showing exactly the given dressed chain. */
function askingPattern(question: Question): GameState {
  const state = freshRound(1100 + question.a * 13 + question.b, undefined, 'pattern');
  return { ...state, question };
}

const has = (effects: GameEffect[], type: GameEffect['type']) =>
  effects.some((e) => e.type === type);

describe('Pattern grading, exhaustively', () => {
  it('accepts the 5th term of every skip-count chain in both roles', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const result = submit(askingPattern({ a, b, wear: 'add' }), a + 4 * b);
        expect(has(result.effects, 'ANSWER_CORRECT'), `${a} +${b}`).toBe(true);
        expect(result.state.score, `${a} +${b} must score`).toBeGreaterThan(0);
      }
    }
  });

  it('rejects near-misses on skip-count chains: off-by-one and the shown 4th term', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const answer = a + 4 * b;
        const wrongs = new Set([answer + 1, answer - 1, a + 3 * b]);
        wrongs.delete(answer);
        for (const wrong of wrongs) {
          const result = submit(askingPattern({ a, b, wear: 'add' }), wrong);
          expect(has(result.effects, 'ANSWER_WRONG'), `${a} +${b}, typed ${wrong}`).toBe(true);
          expect(result.state.score, `${a} +${b}, typed ${wrong} must not score`).toBe(0);
        }
      }
    }
  });

  it('accepts the 5th term of every doubling and tripling chain — all 3 digits or fewer', () => {
    for (const [wear, m] of [
      ['x2', 2],
      ['x3', 3],
    ] as const) {
      for (let start = 1; start <= 12; start++) {
        const answer = start * m ** 4;
        expect(answer, `${start} ×${m} stays on the pad`).toBeLessThanOrEqual(999);
        const result = submit(askingPattern({ a: start, b: m, wear }), answer);
        expect(has(result.effects, 'ANSWER_CORRECT'), `${start} ×${m}`).toBe(true);
      }
    }
  });

  it('rejects the shown 4th term and off-by-ones on geometric chains', () => {
    for (const [wear, m] of [
      ['x2', 2],
      ['x3', 3],
    ] as const) {
      for (let start = 1; start <= 12; start++) {
        const answer = start * m ** 4;
        const wrongs = new Set([answer + 1, answer - 1, start * m ** 3]);
        wrongs.delete(answer);
        for (const wrong of wrongs) {
          const result = submit(askingPattern({ a: start, b: m, wear }), wrong);
          expect(has(result.effects, 'ANSWER_WRONG'), `${start} ×${m}, typed ${wrong}`).toBe(true);
        }
      }
    }
  });

  it('the teaching moment reveals the chain rule and swallows keystrokes', () => {
    const wrong = submit(askingPattern({ a: 7, b: 8, wear: 'add' }), 38); // truth: 39
    expect(has(wrong.effects, 'ANSWER_WRONG')).toBe(true);
    expect(wrong.state.feedback?.correctAnswer).toBe(39);
    expect(skillFor('pattern').reveal({ a: 7, b: 8, wear: 'add' })).toBe(
      'It was + 8 each time — 7, 15, 23, 31, 39!',
    );
    expect(skillFor('pattern').reveal({ a: 5, b: 2, wear: 'x2' })).toBe(
      'It was × 2 each time — 5, 10, 20, 40, 80!',
    );
    const during = dispatchAll(wrong.state, typeDigits(42));
    expect(during.answerBuffer).toBe('');
  });
});

describe('Pattern Rounds', () => {
  it('the geometric twist hits only Facts containing a 2 or 3, at roughly a third', () => {
    let eligible = 0;
    let twisted = 0;
    let state = freshRound(1101, undefined, 'pattern');
    for (let i = 0; i < 600; i++) {
      const { a, b, wear } = state.question;
      const canTwist = a === 2 || a === 3 || b === 2 || b === 3;
      if (wear !== 'add') {
        // Geometric wear always multiplies by the Fact's own 2 or 3.
        expect(b === 2 || b === 3, `${a},${b},${wear}`).toBe(true);
        expect(wear).toBe(b === 2 ? 'x2' : 'x3');
        twisted++;
        eligible++;
      } else if (canTwist) {
        eligible++;
      }
      state = answerCorrectly(state).state;
    }
    const rate = twisted / eligible;
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.5);
  });

  it('pays double base points through the same streak system', () => {
    let state = freshRound(1102, undefined, 'pattern'); // Easy: 10 base → 20
    state = answerCorrectly(state).state;
    expect(state.score).toBe(20);
    state = answerCorrectly(state).state;
    expect(state.score).toBe(40);
    // The third correct ignites the ×2 Power Streak: 20 × 2 = 40 more.
    state = answerCorrectly(state).state;
    expect(state.score).toBe(80);
  });

  it('records attempts into the Pattern slice only, keyed by the underlying Fact', () => {
    const state = update(freshRound(1103, undefined, 'pattern'), { type: 'TICK', now: 1200 }).state;
    const key = factKey(state.question.a, state.question.b);
    const player = answerCorrectly(state).state.players[0];
    expect(player?.factStats.pattern[key]).toEqual([{ correct: true, ms: 1200 }]);
    expect(player?.factStats.multiply).toEqual({});
    expect(player?.factStats.machine).toEqual({});
  });

  it('a Pattern best lands under Pattern × Difficulty with the 🔁 celebration and shared XP', () => {
    let state = freshRound(1104, undefined, 'pattern');
    state = answerCorrectly(state).state; // 20 points on Easy
    const result = update(state, { type: 'TICK', now: 999_999 });
    const player = result.state.players[0];
    expect(player?.bests).toEqual(perSkill({ pattern: { easy: 20 } }));
    expect(result.effects).toContainEqual({
      type: 'NEW_PERSONAL_BEST',
      skill: 'pattern',
      difficulty: 'easy',
      score: 20,
    });
    expect(player?.xp).toBe(20);
  });

  it('"count by 8s" Practice always steps by the table, never twists, and pays Easy ×2', () => {
    let state = dispatchAll(preRound(1105), [
      { type: 'SKILL_CHANGED', skill: 'pattern' },
      { type: 'PRACTICE_TABLE_CHANGED', table: 2 }, // 2 is twist-eligible — still never twists
      { type: 'TICK', now: 0 },
      { type: 'ROUND_STARTED' },
    ]);
    for (let i = 0; i < 30; i++) {
      expect(state.question.wear, `${state.question.a},${state.question.b}`).toBe('add');
      expect(state.question.b).toBe(2);
      state = answerCorrectly(state).state;
    }
    expect(state.score).toBeGreaterThanOrEqual(30 * 10 * 2);
  });
});

describe('the Pattern definition row', () => {
  it('is the single source of the Pattern\'s display, grading, pay, and pace', () => {
    const pattern = skillFor('pattern');
    expect(pattern.symbol).toBe('🔁');
    expect(pattern.display({ a: 7, b: 8, wear: 'add' })).toBe('7, 15, 23, 31');
    expect(pattern.display({ a: 3, b: 2, wear: 'x2' })).toBe('3, 6, 12, 24');
    // Undressed Questions (grid tooltips) read as the skip-count chain.
    expect(pattern.display({ a: 7, b: 8 })).toBe('7, 15, 23, 31');
    expect(pattern.answer({ a: 7, b: 8, wear: 'add' })).toBe(39);
    expect(pattern.answer({ a: 3, b: 2, wear: 'x2' })).toBe(48);
    expect(pattern.answer({ a: 12, b: 3, wear: 'x3' })).toBe(972);
    expect(pattern.practiceLabel(8)).toBe('by 8s');
    expect(pattern.basePointScale).toBe(2);
    expect(pattern.masteryWindowMs).toBe(15_000);
  });
});
