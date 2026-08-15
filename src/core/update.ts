import { seedPrng } from './prng';
import { pointsForCorrect } from './scoring';
import { selectQuestion } from './selection';
import { tierForStreak } from './streak';
import {
  DEFAULT_TIMER_SECONDS,
  MAX_TIMER_SECONDS,
  MIN_TIMER_SECONDS,
  remainingMs,
} from './selectors';
import type { GameConfig, GameEffect, GameEvent, GameState, UpdateResult } from './types';

const MAX_ANSWER_DIGITS = 3; // 12 × 12 = 144

/** How long the correct equation stays on screen after a wrong answer. */
export const FEEDBACK_MS = 2500;

export function initialState(config: GameConfig): GameState {
  const selected = selectQuestion('easy', seedPrng(config.seed));
  return {
    prng: selected.prng,
    phase: 'pre-round',
    difficulty: 'easy',
    timerSeconds: DEFAULT_TIMER_SECONDS,
    now: 0,
    roundStartedAt: 0,
    score: 0,
    question: selected.question,
    answerBuffer: '',
    streak: 0,
    feedback: null,
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
          state: { ...ticked, phase: 'results', answerBuffer: '', feedback: null },
          effects: [{ type: 'ROUND_ENDED', finalScore: ticked.score }],
        };
      }
      if (
        state.phase === 'in-round' &&
        ticked.feedback !== null &&
        ticked.now >= ticked.feedback.until
      ) {
        // The teaching moment is over: move on to the next question.
        const selected = selectQuestion(state.difficulty, state.prng);
        return {
          state: { ...ticked, prng: selected.prng, question: selected.question, feedback: null },
          effects: [{ type: 'QUESTION_ASKED', question: selected.question }],
        };
      }
      return { state: ticked, effects: [] };
    }

    case 'TIMER_CHANGED': {
      if (state.phase !== 'pre-round') return noop(state);
      const seconds = Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, event.seconds));
      return { state: { ...state, timerSeconds: seconds }, effects: [] };
    }

    case 'DIFFICULTY_CHANGED': {
      if (state.phase !== 'pre-round') return noop(state);
      return { state: { ...state, difficulty: event.difficulty }, effects: [] };
    }

    case 'ROUND_STARTED': {
      if (state.phase !== 'pre-round') return noop(state);
      const selected = selectQuestion(state.difficulty, state.prng);
      return {
        state: {
          ...state,
          prng: selected.prng,
          phase: 'in-round',
          roundStartedAt: state.now,
          score: 0,
          question: selected.question,
          answerBuffer: '',
          streak: 0,
          feedback: null,
        },
        effects: [{ type: 'QUESTION_ASKED', question: selected.question }],
      };
    }

    case 'PLAY_AGAIN': {
      if (state.phase !== 'results') return noop(state);
      return { state: { ...state, phase: 'pre-round' }, effects: [] };
    }

    case 'DIGIT_PRESSED': {
      if (state.phase !== 'in-round' || state.feedback !== null) return noop(state);
      if (state.answerBuffer.length >= MAX_ANSWER_DIGITS) return noop(state);
      return {
        state: { ...state, answerBuffer: state.answerBuffer + String(event.digit) },
        effects: [],
      };
    }

    case 'BACKSPACE_PRESSED': {
      if (state.phase !== 'in-round' || state.feedback !== null || state.answerBuffer === '')
        return noop(state);
      return { state: { ...state, answerBuffer: state.answerBuffer.slice(0, -1) }, effects: [] };
    }

    case 'ANSWER_SUBMITTED': {
      if (state.phase !== 'in-round' || state.feedback !== null || state.answerBuffer === '')
        return noop(state);
      const { question } = state;
      const correctAnswer = question.a * question.b;
      const correct = Number(state.answerBuffer) === correctAnswer;

      if (!correct) {
        // No points lost, no time refunded — but the hero drops to base form
        // and the correct equation teaches until the next question appears.
        return {
          state: {
            ...state,
            streak: 0,
            answerBuffer: '',
            feedback: { question, correctAnswer, until: state.now + FEEDBACK_MS },
          },
          effects: [{ type: 'ANSWER_WRONG', question, correctAnswer }, { type: 'STREAK_BROKEN' }],
        };
      }

      const streak = state.streak + 1;
      const tier = tierForStreak(streak);
      const points = pointsForCorrect(state.difficulty, streak);
      const transformed = tier.threshold === streak && tier.multiplier > 1;

      const selected = selectQuestion(state.difficulty, state.prng);
      const effects: GameEffect[] = [{ type: 'ANSWER_CORRECT', question, points }];
      if (transformed) {
        effects.push({ type: 'TRANSFORMED', form: tier.form, multiplier: tier.multiplier, streak });
      }
      if (tier.form === 'super') {
        effects.push({ type: 'BLAST_FIRED' });
      }
      effects.push({ type: 'QUESTION_ASKED', question: selected.question });

      return {
        state: {
          ...state,
          prng: selected.prng,
          score: state.score + points,
          streak,
          question: selected.question,
          answerBuffer: '',
        },
        effects,
      };
    }
  }
}
