import { describe, expect, it } from 'vitest';
import { initialState, update } from './index';
import type { GameEvent, UpdateResult } from './index';
import { answerCorrectly, answerWrongly, dispatchAll, freshRound, typeDigits } from './test-helpers';

describe('initialState', () => {
  it('starts on the Title screen at score zero', () => {
    const state = initialState({ seed: 1 });
    expect(state.phase).toBe('title');
    expect(state.score).toBe(0);
    expect(state.answerBuffer).toBe('');
    expect(state.players).toEqual([]);
  });

  it('asks questions with operands from 1–12', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { question } = freshRound(seed);
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
    const state = freshRound(1);
    const typed = dispatchAll(state, [
      { type: 'DIGIT_PRESSED', digit: 4 },
      { type: 'DIGIT_PRESSED', digit: 2 },
    ]);
    expect(typed.answerBuffer).toBe('42');

    const erased = update(typed, { type: 'BACKSPACE_PRESSED' }).state;
    expect(erased.answerBuffer).toBe('4');
  });

  it('ignores digits beyond three characters', () => {
    const typed = dispatchAll(
      freshRound(1),
      [1, 4, 4, 9].map((digit) => ({ type: 'DIGIT_PRESSED', digit }) as GameEvent),
    );
    expect(typed.answerBuffer).toBe('144');
  });

  it('backspace on an empty buffer is a no-op', () => {
    const state = freshRound(1);
    const result = update(state, { type: 'BACKSPACE_PRESSED' });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('submitting an empty buffer does nothing', () => {
    const state = freshRound(1);
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('answer events are ignored outside a Round', () => {
    const title = initialState({ seed: 1 });
    for (const event of [
      { type: 'DIGIT_PRESSED', digit: 5 },
      { type: 'BACKSPACE_PRESSED' },
      { type: 'ANSWER_SUBMITTED' },
    ] as GameEvent[]) {
      const result = update(title, event);
      expect(result.state).toEqual(title);
      expect(result.effects).toEqual([]);
    }
  });
});

describe('answer judging and scoring', () => {
  it('a correct answer scores points, clears the buffer, and asks a new question', () => {
    const state = freshRound(7);
    const question = state.question;
    const result = answerCorrectly(state);

    expect(result.state.score).toBe(10); // Easy base points
    expect(result.state.answerBuffer).toBe('');
    expect(result.effects[0]).toEqual({ type: 'ANSWER_CORRECT', question, points: 10 });
    expect(result.effects.at(-1)).toMatchObject({ type: 'QUESTION_ASKED' });
  });

  it('a wrong answer scores nothing and reports the correct equation', () => {
    const state = freshRound(7);
    const question = state.question;
    const result = answerWrongly(state);

    expect(result.state.score).toBe(0);
    expect(result.effects[0]).toEqual({
      type: 'ANSWER_WRONG',
      question,
      correctAnswer: question.a * question.b,
    });
    expect(result.effects[1]).toEqual({ type: 'STREAK_BROKEN' });
  });

  it('consecutive correct answers keep scoring (with streak multipliers)', () => {
    let state = freshRound(3);
    // Easy base 10; the ×2 aura ignites at streak 3.
    for (const total of [10, 20, 40, 60, 80]) {
      state = answerCorrectly(state).state;
      expect(state.score).toBe(total);
    }
  });

  it('the same seed and events always replay identically', () => {
    const play = () => {
      let result: UpdateResult = { state: freshRound(99), effects: [] };
      for (let i = 0; i < 10; i++) {
        result = answerCorrectly(result.state);
      }
      return result.state;
    };
    expect(play()).toEqual(play());
  });

  it('typing digits still works after clearing with backspace mid-answer', () => {
    const state = freshRound(2);
    const answer = state.question.a * state.question.b;
    const result = dispatchAll(state, [
      { type: 'DIGIT_PRESSED', digit: 9 },
      { type: 'BACKSPACE_PRESSED' },
      ...typeDigits(answer),
    ]);
    expect(result.answerBuffer).toBe(String(answer));
  });
});
