import { describe, expect, it } from 'vitest';
import { tierFor, update } from './index';
import { answerCorrectly, freshRound } from './test-helpers';

describe('difficulty tiers', () => {
  it.each([
    ['easy', 1, 5],
    ['medium', 2, 9],
    ['hard', 2, 12],
  ] as const)('%s keeps one operand in tables %i–%i', (difficulty, min, max) => {
    for (let seed = 0; seed < 20; seed++) {
      let state = freshRound(seed, difficulty);
      for (let i = 0; i < 10; i++) {
        const { a, b } = state.question;
        expect(a).toBeGreaterThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(12);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(12);
        const aInRange = a >= min && a <= max;
        const bInRange = b >= min && b <= max;
        expect(aInRange || bInRange).toBe(true);
        state = answerCorrectly(state).state;
      }
    }
  });

  it.each([
    ['easy', 10],
    ['medium', 20],
    ['hard', 30],
  ] as const)('%s awards %i base points per correct answer', (difficulty, basePoints) => {
    const state = freshRound(1, difficulty);
    const result = answerCorrectly(state);
    expect(result.state.score).toBe(basePoints);
    expect(result.effects[0]).toMatchObject({ type: 'ANSWER_CORRECT', points: basePoints });
    expect(tierFor(difficulty).basePoints).toBe(basePoints);
  });

  it('cannot change mid-Round', () => {
    const inRound = freshRound(1, 'medium');
    const result = update(inRound, { type: 'DIFFICULTY_CHANGED', difficulty: 'easy' });
    expect(result.state.difficulty).toBe('medium');
  });

  it('on Hard, both-operands-≥6 Facts appear at double sampling weight', () => {
    // Hard candidates: every (a, b) with a or b in 2–12 → 143 pairs, of which
    // 49 have both operands ≥ 6 and carry weight 2. Expected frequency of the
    // high zone: 98 / 192 ≈ 0.51 (vs ≈ 0.34 unweighted).
    let state = freshRound(2024, 'hard');
    const samples = 4000;
    let bothHigh = 0;
    for (let i = 0; i < samples; i++) {
      if (state.question.a >= 6 && state.question.b >= 6) bothHigh++;
      state = answerCorrectly(state).state;
    }
    const observed = bothHigh / samples;
    expect(observed).toBeGreaterThan(0.46);
    expect(observed).toBeLessThan(0.56);
  });
});
