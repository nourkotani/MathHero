import { describe, expect, it } from 'vitest';
import { update } from './index';
import type { GameEffect, GameState } from './index';
import { dispatchAll, freshRound, submitAnswer as submit, typeDigits } from './test-helpers';

// The one unforgivable bug: a child answers correctly and the game says
// wrong. This suite brute-forces the grading seam — every ordered operand
// pair the game can ever display, in BOTH Skills, plus every input-path edge
// around the answer buffer — through the public update() interface.

/** The running Multiply Round, showing exactly the question a × b. */
function asking(a: number, b: number): GameState {
  const state = freshRound(500 + a * 13 + b);
  // Pin the displayed question; grading must judge against this same object.
  return { ...state, question: { a, b } };
}

/** The running Divide Round, showing exactly the prompt (a·b) ÷ a. */
function askingDivide(a: number, b: number): GameState {
  const state = freshRound(700 + a * 13 + b, undefined, 'divide');
  return { ...state, question: { a, b } };
}

const has = (effects: GameEffect[], type: GameEffect['type']) =>
  effects.some((e) => e.type === type);

describe('answer grading, exhaustively', () => {
  it('accepts the true product for every ordered pair 1×1 through 12×12', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const result = submit(asking(a, b), a * b);
        expect(has(result.effects, 'ANSWER_CORRECT'), `${a}×${b}=${a * b}`).toBe(true);
        expect(result.state.score, `${a}×${b} must score`).toBeGreaterThan(0);
      }
    }
  });

  it('rejects near-misses for every pair: off-by-one and reversed digits', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const product = a * b;
        const wrongs = new Set([product + 1, product - 1]);
        const reversed = Number(String(product).split('').reverse().join(''));
        if (reversed !== product) wrongs.add(reversed);
        for (const wrong of wrongs) {
          if (wrong < 0) continue;
          const result = submit(asking(a, b), wrong);
          expect(has(result.effects, 'ANSWER_WRONG'), `${a}×${b}, typed ${wrong}`).toBe(true);
          expect(result.state.score, `${a}×${b}, typed ${wrong} must not score`).toBe(0);
        }
      }
    }
  });

  it('a leading zero never spoils a correct answer (kid types 063 for 63)', () => {
    const result = submit(asking(7, 9), '063');
    expect(has(result.effects, 'ANSWER_CORRECT')).toBe(true);
  });

  it('backspacing a slip and retyping grades the corrected answer', () => {
    // Types 58, erases the 8, finishes with 6 → 56 for 7×8.
    let state = dispatchAll(asking(7, 8), typeDigits(58));
    state = dispatchAll(state, [{ type: 'BACKSPACE_PRESSED' }, ...typeDigits(6)]);
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(has(result.effects, 'ANSWER_CORRECT')).toBe(true);
  });

  it('digits beyond the 3-digit buffer are dropped, not mixed into the answer', () => {
    // Mashing 1445 leaves 144 on screen — and 144 is what gets graded.
    const state = dispatchAll(asking(12, 12), typeDigits(1445));
    expect(state.answerBuffer).toBe('144');
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(has(result.effects, 'ANSWER_CORRECT')).toBe(true);
  });

  it('submitting an empty buffer does nothing — no accidental wrong', () => {
    const state = asking(6, 7);
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('keystrokes during the teaching moment are dropped whole, never smeared into the next answer', () => {
    // Wrong answer opens the teaching moment...
    const wrong = submit(asking(6, 7), 41);
    expect(has(wrong.effects, 'ANSWER_WRONG')).toBe(true);
    // ...and typing while it is up leaves the buffer untouched.
    const during = dispatchAll(wrong.state, typeDigits(42));
    expect(during.answerBuffer).toBe('');
  });

  it('the graded product is always the displayed question, both operand orders', () => {
    // 3×12 and 12×3 are one Fact but distinct displays; each grades its own.
    for (const [a, b] of [
      [3, 12],
      [12, 3],
    ] as const) {
      const result = submit(asking(a, b), 36);
      expect(has(result.effects, 'ANSWER_CORRECT'), `${a}×${b}`).toBe(true);
    }
  });
});

describe('division grading, exhaustively', () => {
  it('accepts the true quotient for every Fact in both divisor orientations', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        // The prompt is (a·b) ÷ a; the missing factor b is the answer.
        const result = submit(askingDivide(a, b), b);
        expect(has(result.effects, 'ANSWER_CORRECT'), `${a * b}÷${a}=${b}`).toBe(true);
        expect(result.state.score, `${a * b}÷${a} must score`).toBeGreaterThan(0);
      }
    }
  });

  it('rejects near-misses for every prompt: off-by-one, the dividend, the divisor', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const wrongs = new Set([b + 1, b - 1, a * b, a]);
        wrongs.delete(b); // never test the true quotient as a wrong answer
        for (const wrong of wrongs) {
          if (wrong < 0) continue;
          const result = submit(askingDivide(a, b), wrong);
          expect(has(result.effects, 'ANSWER_WRONG'), `${a * b}÷${a}, typed ${wrong}`).toBe(true);
          expect(result.state.score, `${a * b}÷${a}, typed ${wrong} must not score`).toBe(0);
        }
      }
    }
  });

  it('a leading zero never spoils a correct quotient (kid types 07 for 7)', () => {
    const result = submit(askingDivide(8, 7), '07'); // 56 ÷ 8
    expect(has(result.effects, 'ANSWER_CORRECT')).toBe(true);
  });

  it('backspacing a slip and retyping grades the corrected quotient', () => {
    // Types 8, erases it, finishes with 7 → 56 ÷ 8 = 7.
    let state = dispatchAll(askingDivide(8, 7), typeDigits(8));
    state = dispatchAll(state, [{ type: 'BACKSPACE_PRESSED' }, ...typeDigits(7)]);
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(has(result.effects, 'ANSWER_CORRECT')).toBe(true);
  });

  it('digits beyond the 3-digit buffer are dropped under Divide too', () => {
    // Mashing 1212 at "144 ÷ 12" leaves 121 on screen — and 121 is graded.
    const state = dispatchAll(askingDivide(12, 12), typeDigits(1212));
    expect(state.answerBuffer).toBe('121');
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(has(result.effects, 'ANSWER_WRONG')).toBe(true);
  });

  it('submitting an empty buffer does nothing — no accidental wrong', () => {
    const state = askingDivide(6, 7);
    const result = update(state, { type: 'ANSWER_SUBMITTED' });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('the teaching moment carries the full division equation and swallows keystrokes', () => {
    const wrong = submit(askingDivide(6, 7), 41); // 42 ÷ 6
    expect(has(wrong.effects, 'ANSWER_WRONG')).toBe(true);
    expect(wrong.state.feedback?.correctAnswer).toBe(7);
    const during = dispatchAll(wrong.state, typeDigits(42));
    expect(during.answerBuffer).toBe('');
  });

  it('both divisions of one Fact grade independently (56÷8 and 56÷7)', () => {
    for (const [a, b] of [
      [8, 7],
      [7, 8],
    ] as const) {
      const result = submit(askingDivide(a, b), b);
      expect(has(result.effects, 'ANSWER_CORRECT'), `${a * b}÷${a}`).toBe(true);
    }
  });
});
