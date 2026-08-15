import { seedPrng } from './prng';
import { allCandidates, uniformSelector } from './selection';
import {
  DEFAULT_TIMER_SECONDS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_SECONDS,
  remainingMs,
} from './selectors';
import type { GameConfig, GameEffect, GameEvent, GameState, UpdateResult } from './types';

const MAX_ANSWER_DIGITS = 3; // 12 × 12 = 144

export function initialState(config: GameConfig): GameState {
  const selected = uniformSelector({ candidates: allCandidates(), prng: seedPrng(config.seed) });
  return {
    prng: selected.prng,
    phase: 'pre-round',
    timerSeconds: DEFAULT_TIMER_SECONDS,
    now: 0,
    roundStartedAt: 0,
    score: 0,
    question: selected.question,
    answerBuffer: '',
  };
}

function noop(state: GameState): UpdateResult {
  return { state, effects: [] };
}

export function update(state: GameState, event: GameEvent): UpdateResult {
  switch (event.type) {
    case 'TICK': {
      const ticked = { ...state, now: event.now };
      if (state.phase === 'in-round' && remainingMs(ticked) <= 0) {
        // The Round ends instantly: the in-progress question is voided and
        // scores nothing — the typed buffer is simply discarded.
        return {
          state: { ...ticked, phase: 'results', answerBuffer: '' },
          effects: [{ type: 'ROUND_ENDED', finalScore: ticked.score }],
        };
      }
      return { state: ticked, effects: [] };
    }

    case 'TIMER_CHANGED': {
      if (state.phase !== 'pre-round') return noop(state);
      const seconds = Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, event.seconds));
      return { state: { ...state, timerSeconds: seconds }, effects: [] };
    }

    case 'ROUND_STARTED': {
      if (state.phase !== 'pre-round') return noop(state);
      const selected = uniformSelector({ candidates: allCandidates(), prng: state.prng });
      return {
        state: {
          ...state,
          prng: selected.prng,
          phase: 'in-round',
          roundStartedAt: state.now,
          score: 0,
          question: selected.question,
          answerBuffer: '',
        },
        effects: [{ type: 'QUESTION_ASKED', question: selected.question }],
      };
    }

    case 'PLAY_AGAIN': {
      if (state.phase !== 'results') return noop(state);
      return { state: { ...state, phase: 'pre-round' }, effects: [] };
    }

    case 'DIGIT_PRESSED': {
      if (state.phase !== 'in-round') return noop(state);
      if (state.answerBuffer.length >= MAX_ANSWER_DIGITS) return noop(state);
      return {
        state: { ...state, answerBuffer: state.answerBuffer + String(event.digit) },
        effects: [],
      };
    }

    case 'BACKSPACE_PRESSED': {
      if (state.phase !== 'in-round' || state.answerBuffer === '') return noop(state);
      return { state: { ...state, answerBuffer: state.answerBuffer.slice(0, -1) }, effects: [] };
    }

    case 'ANSWER_SUBMITTED': {
      if (state.phase !== 'in-round' || state.answerBuffer === '') return noop(state);
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
