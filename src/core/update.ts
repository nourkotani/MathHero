import { seedPrng } from './prng';
import { allCandidates, uniformSelector } from './selection';
import type { GameConfig, GameEffect, GameEvent, GameState, UpdateResult } from './types';

const MAX_ANSWER_DIGITS = 3; // 12 × 12 = 144

export function initialState(config: GameConfig): GameState {
  const selected = uniformSelector({ candidates: allCandidates(), prng: seedPrng(config.seed) });
  return {
    prng: selected.prng,
    score: 0,
    question: selected.question,
    answerBuffer: '',
  };
}

export function update(state: GameState, event: GameEvent): UpdateResult {
  switch (event.type) {
    case 'DIGIT_PRESSED': {
      if (state.answerBuffer.length >= MAX_ANSWER_DIGITS) {
        return { state, effects: [] };
      }
      return {
        state: { ...state, answerBuffer: state.answerBuffer + String(event.digit) },
        effects: [],
      };
    }

    case 'BACKSPACE_PRESSED': {
      if (state.answerBuffer === '') {
        return { state, effects: [] };
      }
      return { state: { ...state, answerBuffer: state.answerBuffer.slice(0, -1) }, effects: [] };
    }

    case 'ANSWER_SUBMITTED': {
      if (state.answerBuffer === '') {
        return { state, effects: [] };
      }
      const { question } = state;
      const correctAnswer = question.a * question.b;
      const correct = Number(state.answerBuffer) === correctAnswer;

      const selected = uniformSelector({ candidates: allCandidates(), prng: state.prng });
      const effects: GameEffect[] = [
        correct
          ? { type: 'ANSWER_CORRECT', question, points: 1 }
          : { type: 'ANSWER_WRONG', question, correctAnswer },
        { type: 'QUESTION_ASKED', question: selected.question },
      ];
      return {
        state: {
          ...state,
          prng: selected.prng,
          score: correct ? state.score + 1 : state.score,
          question: selected.question,
          answerBuffer: '',
        },
        effects,
      };
    }
  }
}
