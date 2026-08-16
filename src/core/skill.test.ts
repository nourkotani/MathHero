import { describe, expect, it } from 'vitest';
import { factKey, initialState, SAVE_FILE_VERSION, skillFor, update } from './index';
import type { FactAttempt, GameState, SaveFile } from './index';
import { answerCorrectly, dispatchAll, freshRound, preRound } from './test-helpers';

// The Skill seam: picking Divide on the Pre-round screen, per-Skill
// recording and adaptive weighting, per-Skill × Difficulty bests, and the
// one shared XP pool — all through the public update() interface.

describe('the Skill picker', () => {
  it('defaults to Multiply on a fresh load', () => {
    expect(initialState({ seed: 1 }).skill).toBe('multiply');
  });

  it('changes on the Pre-round screen and keeps Practice — the two compose', () => {
    let state = preRound(201);
    state = update(state, { type: 'PRACTICE_TABLE_CHANGED', table: 8 }).state;
    state = update(state, { type: 'SKILL_CHANGED', skill: 'divide' }).state;
    expect(state.skill).toBe('divide');
    expect(state.practiceTable).toBe(8);
  });

  it('is ignored mid-Round', () => {
    const inRound = freshRound(202, undefined, 'divide');
    expect(update(inRound, { type: 'SKILL_CHANGED', skill: 'multiply' }).state.skill).toBe(
      'divide',
    );
  });

  it('survives play-again for another Divide Round', () => {
    let state = freshRound(203, undefined, 'divide');
    state = update(state, { type: 'TICK', now: 999_999 }).state; // Round ends
    state = update(state, { type: 'PLAY_AGAIN' }).state;
    expect(state.skill).toBe('divide');
  });
});

describe('Divide Rounds', () => {
  it('draws from the same candidates and Difficulty ranges as Multiply', () => {
    let state = freshRound(204, undefined, 'divide'); // Easy: one operand from 1–5
    for (let i = 0; i < 40; i++) {
      const { a, b } = state.question;
      expect((a >= 1 && a <= 5) || (b >= 1 && b <= 5), `${a},${b}`).toBe(true);
      state = answerCorrectly(state).state;
    }
  });

  it('records attempts into the Divide slice only — Multiply mastery is untouched', () => {
    const state = update(freshRound(205, undefined, 'divide'), { type: 'TICK', now: 1200 }).state;
    const key = factKey(state.question.a, state.question.b);
    const player = answerCorrectly(state).state.players[0];
    expect(player?.factStats.divide[key]).toEqual([{ correct: true, ms: 1200 }]);
    expect(player?.factStats.multiply).toEqual({});
  });

  it('weights Divide selection by Divide history — Multiply struggles do not leak', () => {
    const wrongs: FactAttempt[] = Array.from({ length: 5 }, () => ({ correct: false, ms: 4000 }));
    const mkSave = (
      divide: Record<string, FactAttempt[]>,
      multiply: Record<string, FactAttempt[]>,
    ): SaveFile => ({
      version: SAVE_FILE_VERSION,
      lastExportAt: null,
      muted: false,
      players: [
        {
          id: 'p1',
          name: 'Zara',
          colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
          appearance: {
            body: 'girl',
            hairStyle: 'spiky',
            hairLength: 'short',
            garment: 'gi',
            skinTone: 'tan',
          },
          roundsPlayed: 0,
          xp: 0,
          bests: { multiply: {}, divide: {} },
          factStats: { multiply, divide },
        },
      ],
      nextPlayerId: 2,
    });

    const firstQuestionCount = (save: SaveFile, samples: number): number => {
      let hits = 0;
      for (let seed = 0; seed < samples; seed++) {
        const state: GameState = dispatchAll(initialState({ seed, save }), [
          { type: 'PLAYER_SELECTED', id: 'p1' },
          { type: 'SKILL_CHANGED', skill: 'divide' },
          { type: 'ROUND_STARTED' },
        ]);
        if (factKey(state.question.a, state.question.b) === '2x2') hits++;
      }
      return hits;
    };

    const struggling = firstQuestionCount(mkSave({ '2x2': wrongs }, {}), 400);
    const crossTalk = firstQuestionCount(mkSave({}, { '2x2': wrongs }), 400);
    expect(struggling).toBeGreaterThan(20); // Divide history pulls the Fact back
    expect(crossTalk).toBeLessThan(15); // Multiply history must not
  });

  it('a Divide best lands under Divide × Difficulty, carries the Skill, and feeds shared XP', () => {
    let state = freshRound(206, undefined, 'divide');
    state = answerCorrectly(state).state; // 10 points on Easy
    const result = update(state, { type: 'TICK', now: 999_999 });
    const player = result.state.players[0];
    expect(player?.bests).toEqual({ multiply: {}, divide: { easy: 10 } });
    expect(result.effects).toContainEqual({
      type: 'NEW_PERSONAL_BEST',
      skill: 'divide',
      difficulty: 'easy',
      score: 10,
    });
    expect(player?.xp).toBe(10); // one shared pool, whatever the Skill
  });

  it('÷-table Practice always divides by the chosen table', () => {
    let state = dispatchAll(preRound(207), [
      { type: 'SKILL_CHANGED', skill: 'divide' },
      { type: 'PRACTICE_TABLE_CHANGED', table: 8 },
      { type: 'TICK', now: 0 },
      { type: 'ROUND_STARTED' },
    ]);
    for (let i = 0; i < 30; i++) {
      // The prompt is (8·b) ÷ 8 — the divisor is pinned to the table.
      expect(state.question.a, `${state.question.a},${state.question.b}`).toBe(8);
      state = answerCorrectly(state).state;
    }
  });
});

describe('the Skill definition table', () => {
  it('is the single source of display and grading for both Skills', () => {
    const divide = skillFor('divide');
    expect(divide.display({ a: 8, b: 7 })).toBe('56 ÷ 8');
    expect(divide.answer({ a: 8, b: 7 })).toBe(7);
    expect(divide.practiceLabel(8)).toBe('÷8');
    const multiply = skillFor('multiply');
    expect(multiply.display({ a: 7, b: 8 })).toBe('7 × 8');
    expect(multiply.answer({ a: 7, b: 8 })).toBe(56);
    expect(multiply.practiceLabel(8)).toBe('8×');
  });
});
