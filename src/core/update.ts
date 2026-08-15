import { cosmeticUnlockedAt, levelForXp } from './level';
import { MAX_NAME_LENGTH, validColors } from './players';
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
    phase: 'title',
    players: config.save?.players ?? [],
    activePlayerId: null,
    nextPlayerId: config.save?.nextPlayerId ?? 1,
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
        // scores nothing — the typed buffer is simply discarded. The outcome
        // is attributed to the active Player: the final score becomes XP.
        const effects: GameEffect[] = [{ type: 'ROUND_ENDED', finalScore: ticked.score }];
        const players = ticked.players.map((p) => {
          if (p.id !== ticked.activePlayerId) return p;
          const levelBefore = levelForXp(p.xp);
          const xp = p.xp + ticked.score;
          for (let level = levelBefore + 1; level <= levelForXp(xp); level++) {
            const cosmetic = cosmeticUnlockedAt(level);
            effects.push(cosmetic ? { type: 'LEVEL_UP', level, cosmetic } : { type: 'LEVEL_UP', level });
          }
          return { ...p, roundsPlayed: p.roundsPlayed + 1, xp };
        });
        effects.push({ type: 'SAVE_FILE_CHANGED' });
        return {
          state: { ...ticked, phase: 'results', answerBuffer: '', feedback: null, players },
          effects,
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

    case 'HERO_CREATION_OPENED': {
      if (state.phase !== 'title') return noop(state);
      return { state: { ...state, phase: 'hero-creation' }, effects: [] };
    }

    case 'CREATION_CANCELLED': {
      if (state.phase !== 'hero-creation') return noop(state);
      return { state: { ...state, phase: 'title' }, effects: [] };
    }

    case 'PLAYER_CREATED': {
      if (state.phase !== 'hero-creation') return noop(state);
      const name = event.name.trim().slice(0, MAX_NAME_LENGTH);
      if (name === '' || !validColors(event.colors)) return noop(state);
      const id = `p${state.nextPlayerId}`;
      const player = { id, name, colors: event.colors, roundsPlayed: 0, xp: 0 };
      return {
        state: {
          ...state,
          players: [...state.players, player],
          nextPlayerId: state.nextPlayerId + 1,
          activePlayerId: id,
          phase: 'pre-round',
        },
        effects: [{ type: 'SAVE_FILE_CHANGED' }],
      };
    }

    case 'PLAYER_SELECTED': {
      if (state.phase !== 'title') return noop(state);
      if (!state.players.some((p) => p.id === event.id)) return noop(state);
      return { state: { ...state, activePlayerId: event.id, phase: 'pre-round' }, effects: [] };
    }

    case 'PLAYER_RENAMED': {
      const name = event.name.trim().slice(0, MAX_NAME_LENGTH);
      if (name === '' || !state.players.some((p) => p.id === event.id)) return noop(state);
      return {
        state: {
          ...state,
          players: state.players.map((p) => (p.id === event.id ? { ...p, name } : p)),
        },
        effects: [{ type: 'SAVE_FILE_CHANGED' }],
      };
    }

    case 'PLAYER_DELETED': {
      if (!state.players.some((p) => p.id === event.id)) return noop(state);
      const players = state.players.filter((p) => p.id !== event.id);
      const wasActive = state.activePlayerId === event.id;
      return {
        state: {
          ...state,
          players,
          activePlayerId: wasActive ? null : state.activePlayerId,
          phase: wasActive ? 'title' : state.phase,
        },
        effects: [{ type: 'SAVE_FILE_CHANGED' }],
      };
    }

    case 'TITLE_OPENED': {
      if (state.phase !== 'pre-round' && state.phase !== 'results') return noop(state);
      return { state: { ...state, phase: 'title' }, effects: [] };
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
      if (state.phase !== 'pre-round' || state.activePlayerId === null) return noop(state);
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
