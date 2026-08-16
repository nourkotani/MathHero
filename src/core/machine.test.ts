import { describe, expect, it } from 'vitest';
import {
  factKey,
  MACHINE_JUMP_MAX,
  MACHINE_JUMP_MIN,
  PRACTICE_BASE_POINTS,
  skillFor,
  update,
} from './index';
import type { GameEffect, GameState } from './index';
import {
  answerCorrectly,
  dispatchAll,
  freshRound,
  perSkill,
  preRound,
  submitAnswer as submit,
  typeDigits,
} from './test-helpers';

// The Machine Skill ⚙️: the Fact worn as the Secret Rule (Input × a) + b.
// Grading is brute-forced like the other Skills — every Fact in both roles,
// at every jump input — plus the Machine-only rules: the jump-input range,
// practice pinning the multiplier, triple pay, and per-Skill records.

/** A running Machine Round, showing exactly the rule ×a +b asked at `input`. */
function askingMachine(a: number, b: number, input: number): GameState {
  const state = freshRound(900 + a * 13 + b, undefined, 'machine');
  // Pin the displayed question; grading must judge against this same object.
  return { ...state, question: { a, b, input } };
}

const has = (effects: GameEffect[], type: GameEffect['type']) =>
  effects.some((e) => e.type === type);

describe('Machine grading, exhaustively', () => {
  it('accepts the true output for every rule in both roles, at every jump input', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        for (let input = MACHINE_JUMP_MIN; input <= MACHINE_JUMP_MAX; input++) {
          const result = submit(askingMachine(a, b, input), a * input + b);
          expect(has(result.effects, 'ANSWER_CORRECT'), `×${a}+${b} @ ${input}`).toBe(true);
          expect(result.state.score, `×${a}+${b} @ ${input} must score`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('rejects near-misses for every rule: off-by-one, the un-scaled m+c, the swapped roles', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const input = MACHINE_JUMP_MIN + ((a + b) % (MACHINE_JUMP_MAX - MACHINE_JUMP_MIN + 1));
        const answer = a * input + b;
        const wrongs = new Set([answer + 1, answer - 1, a + b, b * input + a]);
        wrongs.delete(answer); // never test the true output as a wrong answer
        for (const wrong of wrongs) {
          if (wrong < 0) continue;
          const result = submit(askingMachine(a, b, input), wrong);
          expect(has(result.effects, 'ANSWER_WRONG'), `×${a}+${b} @ ${input}, typed ${wrong}`).toBe(
            true,
          );
          expect(result.state.score, `×${a}+${b} @ ${input}, typed ${wrong} must not score`).toBe(0);
        }
      }
    }
  });

  it('the biggest output fits the pad: mashing 1566 leaves 156, which is correct', () => {
    // ×12 + 12 at input 12 → 156, the largest Machine answer.
    const state = dispatchAll(askingMachine(12, 12, 12), typeDigits(1566));
    expect(state.answerBuffer).toBe('156');
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(has(result.effects, 'ANSWER_CORRECT')).toBe(true);
  });

  it('the teaching moment reveals the rule and swallows keystrokes', () => {
    const wrong = submit(askingMachine(3, 2, 10), 31); // truth: 32
    expect(has(wrong.effects, 'ANSWER_WRONG')).toBe(true);
    expect(wrong.state.feedback?.correctAnswer).toBe(32);
    expect(skillFor('machine').reveal(wrong.state.feedback?.question ?? { a: 0, b: 0 })).toBe(
      'The rule was × 3 then + 2! So 10 → 32',
    );
    const during = dispatchAll(wrong.state, typeDigits(42));
    expect(during.answerBuffer).toBe('');
  });
});

describe('Machine Rounds', () => {
  it('always asks a jump input from 5–12, and reaches the whole range', () => {
    const seen = new Set<number>();
    let state = freshRound(901, undefined, 'machine');
    for (let i = 0; i < 200; i++) {
      const input = state.question.input;
      expect(input).toBeGreaterThanOrEqual(MACHINE_JUMP_MIN);
      expect(input).toBeLessThanOrEqual(MACHINE_JUMP_MAX);
      if (input !== undefined) seen.add(input);
      state = answerCorrectly(state).state;
    }
    expect(seen.size).toBe(MACHINE_JUMP_MAX - MACHINE_JUMP_MIN + 1);
  });

  it('pays triple base points through the same streak system', () => {
    let state = freshRound(902, undefined, 'machine'); // Easy: 10 base → 30
    state = answerCorrectly(state).state;
    expect(state.score).toBe(30);
    state = answerCorrectly(state).state;
    expect(state.score).toBe(60);
    // The third correct ignites the ×2 Power Streak: 30 × 2 = 60 more.
    state = answerCorrectly(state).state;
    expect(state.score).toBe(120);
  });

  it('records attempts into the Machine slice only', () => {
    const state = update(freshRound(903, undefined, 'machine'), { type: 'TICK', now: 1200 }).state;
    const key = factKey(state.question.a, state.question.b);
    const player = answerCorrectly(state).state.players[0];
    expect(player?.factStats.machine[key]).toEqual([{ correct: true, ms: 1200 }]);
    expect(player?.factStats.multiply).toEqual({});
    expect(player?.factStats.divide).toEqual({});
  });

  it('a Machine best lands under Machine × Difficulty with the ⚙️ celebration and shared XP', () => {
    let state = freshRound(904, undefined, 'machine');
    state = answerCorrectly(state).state; // 30 points on Easy
    const result = update(state, { type: 'TICK', now: 999_999 });
    const player = result.state.players[0];
    expect(player?.bests).toEqual(perSkill({ machine: { easy: 30 } }));
    expect(result.effects).toContainEqual({
      type: 'NEW_PERSONAL_BEST',
      skill: 'machine',
      difficulty: 'easy',
      score: 30,
    });
    expect(player?.xp).toBe(30); // one shared pool, whatever the Skill
  });

  it('×8 Practice pins the multiplier and pays Easy base ×3', () => {
    let state = dispatchAll(preRound(905), [
      { type: 'SKILL_CHANGED', skill: 'machine' },
      { type: 'PRACTICE_TABLE_CHANGED', table: 8 },
      { type: 'TICK', now: 0 },
      { type: 'ROUND_STARTED' },
    ]);
    for (let i = 0; i < 30; i++) {
      // Every rule is ×8 + something: the multiplier is pinned to the table.
      expect(state.question.a, `${state.question.a},${state.question.b}`).toBe(8);
      state = answerCorrectly(state).state;
    }
    expect(state.score).toBeGreaterThanOrEqual(30 * PRACTICE_BASE_POINTS * 3);
  });
});

describe('the Machine definition row', () => {
  it('is the single source of the Machine\'s display, grading, pay, and pace', () => {
    const machine = skillFor('machine');
    expect(machine.symbol).toBe('⚙️');
    expect(machine.display({ a: 7, b: 8 })).toBe('× 7 then + 8');
    expect(machine.answer({ a: 7, b: 8, input: 10 })).toBe(78);
    expect(machine.practiceLabel(8)).toBe('×8 machine');
    expect(machine.basePointScale).toBe(3);
    expect(machine.masteryWindowMs).toBe(25_000);
    expect(machine.exampleRows?.({ a: 3, b: 2 })).toEqual([
      { input: 1, output: 5 },
      { input: 2, output: 8 },
      { input: 3, output: 11 },
    ]);
  });
});
