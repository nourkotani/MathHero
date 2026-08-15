import { describe, expect, it } from 'vitest';
import { FEEDBACK_MS, tierForStreak, update } from './index';
import { answerCorrectly, answerWrongly, dispatchAll, freshRound } from './test-helpers';

describe('the streak tier table', () => {
  it('maps streaks to multipliers at thresholds 0/3/6/10', () => {
    expect(tierForStreak(0).multiplier).toBe(1);
    expect(tierForStreak(2).multiplier).toBe(1);
    expect(tierForStreak(3).multiplier).toBe(2);
    expect(tierForStreak(5).multiplier).toBe(2);
    expect(tierForStreak(6).multiplier).toBe(3);
    expect(tierForStreak(9).multiplier).toBe(3);
    expect(tierForStreak(10).multiplier).toBe(4);
    expect(tierForStreak(25).multiplier).toBe(4);
  });

  it('names the forms base → aura → surge → super', () => {
    expect(tierForStreak(0).form).toBe('base');
    expect(tierForStreak(3).form).toBe('aura');
    expect(tierForStreak(6).form).toBe('surge');
    expect(tierForStreak(10).form).toBe('super');
  });
});

describe('streak scoring', () => {
  it('multiplies Easy base points ×1/×2/×3/×4 as the streak climbs', () => {
    // Answers 1–2 at ×1 (10), 3–5 at ×2 (20), 6–9 at ×3 (30), 10–12 at ×4 (40).
    const expected = [10, 10, 20, 20, 20, 30, 30, 30, 30, 40, 40, 40];
    let state = freshRound(11);
    let total = 0;
    expected.forEach((points, i) => {
      const result = answerCorrectly(state);
      total += points;
      expect(result.effects[0]).toMatchObject({ type: 'ANSWER_CORRECT', points });
      expect(result.state.score).toBe(total);
      expect(result.state.streak).toBe(i + 1);
      state = result.state;
    });
  });

  it('emits TRANSFORMED exactly when a threshold is crossed', () => {
    let state = freshRound(12);
    const transforms: Array<{ streak: number; form: string }> = [];
    for (let i = 1; i <= 11; i++) {
      const result = answerCorrectly(state);
      for (const effect of result.effects) {
        if (effect.type === 'TRANSFORMED') transforms.push({ streak: i, form: effect.form });
      }
      state = result.state;
    }
    expect(transforms).toEqual([
      { streak: 3, form: 'aura' },
      { streak: 6, form: 'surge' },
      { streak: 10, form: 'super' },
    ]);
  });

  it('fires an energy blast on every correct answer in super mode', () => {
    let state = freshRound(13);
    for (let i = 1; i <= 9; i++) {
      const result = answerCorrectly(state);
      expect(result.effects.some((e) => e.type === 'BLAST_FIRED')).toBe(false);
      state = result.state;
    }
    for (let i = 10; i <= 13; i++) {
      const result = answerCorrectly(state);
      expect(result.effects.some((e) => e.type === 'BLAST_FIRED')).toBe(true);
      state = result.state;
    }
  });
});

describe('best streak', () => {
  it("tracks the Round's longest streak through breaks and resets per Round", () => {
    let state = freshRound(18);
    for (let i = 0; i < 5; i++) state = answerCorrectly(state).state;
    expect(state.bestStreak).toBe(5);

    state = answerWrongly(state).state;
    state = update(state, { type: 'TICK', now: FEEDBACK_MS }).state;
    for (let i = 0; i < 2; i++) state = answerCorrectly(state).state;
    expect(state.streak).toBe(2);
    expect(state.bestStreak).toBe(5);

    state = dispatchAll(state, [
      { type: 'TICK', now: 999_999 },
      { type: 'PLAY_AGAIN' },
      { type: 'ROUND_STARTED' },
    ]);
    expect(state.bestStreak).toBe(0);
  });

  it('does not emit STREAK_BROKEN when there was no streak to break', () => {
    const result = answerWrongly(freshRound(19));
    expect(result.effects.some((e) => e.type === 'STREAK_BROKEN')).toBe(false);
  });
});

describe('wrong answers', () => {
  it('lose no points, break the streak, and show the correct equation', () => {
    let state = freshRound(14);
    for (let i = 0; i < 4; i++) state = answerCorrectly(state).state;
    const scoreBefore = state.score;
    const question = state.question;

    const result = answerWrongly(state);
    expect(result.state.score).toBe(scoreBefore);
    expect(result.state.streak).toBe(0);
    expect(result.effects).toEqual([
      { type: 'ANSWER_WRONG', question, correctAnswer: question.a * question.b },
      { type: 'STREAK_BROKEN' },
    ]);
    expect(result.state.feedback).toEqual({
      question,
      correctAnswer: question.a * question.b,
      until: FEEDBACK_MS,
    });
    // The question does not advance until the teaching moment ends.
    expect(result.state.question).toEqual(question);
  });

  it('ignores input during the feedback and advances when it expires', () => {
    const state = answerWrongly(freshRound(15)).state;

    const typed = update(state, { type: 'DIGIT_PRESSED', digit: 5 });
    expect(typed.state).toEqual(state);

    const early = update(state, { type: 'TICK', now: FEEDBACK_MS - 1 });
    expect(early.state.feedback).not.toBeNull();

    const expired = update(state, { type: 'TICK', now: FEEDBACK_MS });
    expect(expired.state.feedback).toBeNull();
    expect(expired.effects).toEqual([
      { type: 'QUESTION_ASKED', question: expired.state.question },
    ]);
  });

  it('the next correct answer after a break scores at ×1 again', () => {
    let state = freshRound(16);
    for (let i = 0; i < 6; i++) state = answerCorrectly(state).state; // ×3 territory
    state = answerWrongly(state).state;
    state = update(state, { type: 'TICK', now: FEEDBACK_MS }).state;

    const result = answerCorrectly(state);
    expect(result.effects[0]).toMatchObject({ type: 'ANSWER_CORRECT', points: 10 });
  });

  it('the streak resets at Round start', () => {
    let state = freshRound(17);
    for (let i = 0; i < 5; i++) state = answerCorrectly(state).state;
    state = dispatchAll(state, [
      { type: 'TICK', now: 999_999 },
      { type: 'PLAY_AGAIN' },
      { type: 'ROUND_STARTED' },
    ]);
    expect(state.streak).toBe(0);
    const result = answerCorrectly(state);
    expect(result.effects[0]).toMatchObject({ points: 10 });
  });
});
