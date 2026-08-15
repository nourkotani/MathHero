import { describe, expect, it } from 'vitest';
import { initialState, update } from './index';
import type { GameEvent, GameState, UpdateResult } from './index';

function dispatchAll(state: GameState, events: GameEvent[]): UpdateResult {
  let result: UpdateResult = { state, effects: [] };
  for (const event of events) {
    result = update(result.state, event);
  }
  return result;
}

function typeDigits(value: number): GameEvent[] {
  return String(value)
    .split('')
    .map((d) => ({ type: 'DIGIT_PRESSED', digit: Number(d) }) as GameEvent);
}

function answerCorrectly(state: GameState): UpdateResult {
  const answer = state.question.a * state.question.b;
  return dispatchAll(state, [...typeDigits(answer), { type: 'ANSWER_SUBMITTED' }]);
}

describe('initialState', () => {
  it('starts at score zero with an empty answer buffer', () => {
    const state = initialState({ seed: 1 });
    expect(state.score).toBe(0);
    expect(state.answerBuffer).toBe('');
  });

  it('asks a question with operands from 1–12', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { question } = initialState({ seed });
      expect(question.a).toBeGreaterThanOrEqual(1);
      expect(question.a).toBeLessThanOrEqual(12);
      expect(question.b).toBeGreaterThanOrEqual(1);
      expect(question.b).toBeLessThanOrEqual(12);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(initialState({ seed: 42 })).toEqual(initialState({ seed: 42 }));
  });
});

describe('answer entry', () => {
  it('appends digits and supports backspace', () => {
    const state = initialState({ seed: 1 });
    const typed = dispatchAll(state, [
      { type: 'DIGIT_PRESSED', digit: 4 },
      { type: 'DIGIT_PRESSED', digit: 2 },
    ]).state;
    expect(typed.answerBuffer).toBe('42');

    const erased = update(typed, { type: 'BACKSPACE_PRESSED' }).state;
    expect(erased.answerBuffer).toBe('4');
  });

  it('ignores digits beyond three characters', () => {
    const state = initialState({ seed: 1 });
    const typed = dispatchAll(state, [1, 4, 4, 9].map((digit) => ({ type: 'DIGIT_PRESSED', digit }) as GameEvent)).state;
    expect(typed.answerBuffer).toBe('144');
  });

  it('backspace on an empty buffer is a no-op', () => {
    const state = initialState({ seed: 1 });
    const result = update(state, { type: 'BACKSPACE_PRESSED' });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('submitting an empty buffer does nothing', () => {
    const state = initialState({ seed: 1 });
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });
});

describe('answer judging and scoring', () => {
  it('a correct answer scores a point, clears the buffer, and asks a new question', () => {
    const state = initialState({ seed: 7 });
    const question = state.question;
    const result = answerCorrectly(state);

    expect(result.state.score).toBe(1);
    expect(result.state.answerBuffer).toBe('');
    expect(result.effects[0]).toEqual({ type: 'ANSWER_CORRECT', question, points: 1 });
    expect(result.effects[1]).toMatchObject({ type: 'QUESTION_ASKED' });
  });

  it('a wrong answer scores nothing and reports the correct equation', () => {
    const state = initialState({ seed: 7 });
    const question = state.question;
    const wrongAnswer = question.a * question.b + 1;
    const result = dispatchAll(state, [...typeDigits(wrongAnswer), { type: 'ANSWER_SUBMITTED' }]);

    expect(result.state.score).toBe(0);
    expect(result.effects[0]).toEqual({
      type: 'ANSWER_WRONG',
      question,
      correctAnswer: question.a * question.b,
    });
    expect(result.effects[1]).toMatchObject({ type: 'QUESTION_ASKED' });
  });

  it('consecutive correct answers keep scoring', () => {
    let state = initialState({ seed: 3 });
    for (let i = 1; i <= 5; i++) {
      state = answerCorrectly(state).state;
      expect(state.score).toBe(i);
    }
  });

  it('the same seed and events always replay identically', () => {
    const play = () => {
      let result: UpdateResult = { state: initialState({ seed: 99 }), effects: [] };
      for (let i = 0; i < 10; i++) {
        result = answerCorrectly(result.state);
      }
      return result.state;
    };
    expect(play()).toEqual(play());
  });
});
