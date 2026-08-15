import { DEFAULT_APPEARANCE, validAppearance } from './appearance';
import { MAX_PRACTICE_TABLE, MIN_PRACTICE_TABLE } from './difficulty';
import { factKey } from './facts';
import { cosmeticUnlockedAt, levelForXp } from './level';
import { recordAttempt } from './mastery';
import type { FactStats } from './mastery';
import { HAIR_PRESETS, MAX_NAME_LENGTH, OUTFIT_PRESETS, validColors } from './players';
import { seedPrng } from './prng';
import { buildSaveFile, parseSaveFile, serializeSaveFile } from './savefile';
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
    questionAskedAt: 0,
    phase: 'title',
    practiceTable: null,
    players: config.save?.players ?? [],
    draft: null,
    activePlayerId: null,
    nextPlayerId: config.save?.nextPlayerId ?? 1,
    lastExportAt: config.save?.lastExportAt ?? null,
    muted: config.save?.muted ?? false,
    difficulty: 'easy',
    timerSeconds: DEFAULT_TIMER_SECONDS,
    now: 0,
    roundStartedAt: 0,
    score: 0,
    question: selected.question,
    answerBuffer: '',
    streak: 0,
    bestStreak: 0,
    feedback: null,
  };
}

function noop(state: GameState): UpdateResult {
  return { state, effects: [] };
}

function activeFactStats(state: GameState): FactStats | undefined {
  return state.players.find((p) => p.id === state.activePlayerId)?.factStats;
}

/** Record one attempt at the current question against the active Player. */
function withAttemptRecorded(state: GameState, correct: boolean): GameState {
  const key = factKey(state.question.a, state.question.b);
  const ms = Math.max(0, state.now - state.questionAskedAt);
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === state.activePlayerId
        ? { ...p, factStats: recordAttempt(p.factStats, key, { correct, ms }) }
        : p,
    ),
  };
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
        const bestEffects: GameEffect[] = [];
        const players = ticked.players.map((p) => {
          if (p.id !== ticked.activePlayerId) return p;
          const levelBefore = levelForXp(p.xp);
          const xp = p.xp + ticked.score;
          for (let level = levelBefore + 1; level <= levelForXp(xp); level++) {
            const cosmetic = cosmeticUnlockedAt(level);
            effects.push(cosmetic ? { type: 'LEVEL_UP', level, cosmetic } : { type: 'LEVEL_UP', level });
          }
          let bests = p.bests;
          // Practice Rounds award XP but never set Personal Bests — a focused
          // 2× table score isn't comparable to a real difficulty Round.
          if (ticked.practiceTable === null && ticked.score > (bests[ticked.difficulty] ?? 0)) {
            bests = { ...bests, [ticked.difficulty]: ticked.score };
            bestEffects.push({
              type: 'NEW_PERSONAL_BEST',
              difficulty: ticked.difficulty,
              score: ticked.score,
            });
          }
          return { ...p, roundsPlayed: p.roundsPlayed + 1, xp, bests };
        });
        // Ceremony order: ROUND_ENDED, LEVEL_UPs, NEW_PERSONAL_BEST, then save.
        effects.push(...bestEffects, { type: 'SAVE_FILE_CHANGED' });
        return {
          state: {
            ...ticked,
            phase: 'results',
            answerBuffer: '',
            feedback: null,
            players,
            // Saves migrated from before export tracking start their
            // backup-reminder clock at the first completed Round.
            lastExportAt: ticked.lastExportAt ?? ticked.now,
          },
          effects,
        };
      }
      if (
        state.phase === 'in-round' &&
        ticked.feedback !== null &&
        ticked.now >= ticked.feedback.until
      ) {
        // The teaching moment is over: move on to the next question.
        const selected = selectQuestion(state.difficulty, state.prng, {
          factStats: activeFactStats(ticked),
          excludeKey: factKey(ticked.question.a, ticked.question.b),
          practiceTable: ticked.practiceTable,
        });
        return {
          state: {
            ...ticked,
            prng: selected.prng,
            question: selected.question,
            questionAskedAt: ticked.now,
            feedback: null,
          },
          effects: [{ type: 'QUESTION_ASKED', question: selected.question }],
        };
      }
      return { state: ticked, effects: [] };
    }

    case 'HERO_CREATION_OPENED': {
      if (state.phase !== 'title') return noop(state);
      const defaultColors = {
        hair: HAIR_PRESETS[0]?.id ?? '',
        outfitPrimary: OUTFIT_PRESETS[0]?.id ?? '',
        outfitSecondary: OUTFIT_PRESETS[1]?.id ?? '',
      };
      return {
        state: {
          ...state,
          phase: 'hero-creation',
          draft: { colors: defaultColors, appearance: DEFAULT_APPEARANCE },
        },
        effects: [],
      };
    }

    case 'CREATION_CANCELLED': {
      if (state.phase !== 'hero-creation') return noop(state);
      return { state: { ...state, phase: 'title', draft: null }, effects: [] };
    }

    case 'DRAFT_CHANGED': {
      if (state.phase !== 'hero-creation') return noop(state);
      if (!validColors(event.colors) || !validAppearance(event.appearance)) return noop(state);
      return {
        state: { ...state, draft: { colors: event.colors, appearance: event.appearance } },
        effects: [],
      };
    }

    case 'PLAYER_CREATED': {
      if (state.phase !== 'hero-creation') return noop(state);
      const name = event.name.trim().slice(0, MAX_NAME_LENGTH);
      if (name === '' || !validColors(event.colors) || !validAppearance(event.appearance))
        return noop(state);
      const id = `p${state.nextPlayerId}`;
      // First play starts the backup-reminder clock.
      const lastExportAt = state.lastExportAt ?? state.now;
      const player = {
        id,
        name,
        colors: event.colors,
        appearance: event.appearance,
        roundsPlayed: 0,
        xp: 0,
        bests: {},
        factStats: {},
      };
      return {
        state: {
          ...state,
          players: [...state.players, player],
          nextPlayerId: state.nextPlayerId + 1,
          activePlayerId: id,
          lastExportAt,
          draft: null,
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

    case 'MUTE_TOGGLED': {
      return {
        state: { ...state, muted: !state.muted },
        effects: [{ type: 'SAVE_FILE_CHANGED' }],
      };
    }

    case 'SAVE_EXPORTED': {
      const next = { ...state, lastExportAt: state.now };
      return {
        state: next,
        effects: [
          { type: 'EXPORT_READY', text: serializeSaveFile(buildSaveFile(next)) },
          { type: 'SAVE_FILE_CHANGED' },
        ],
      };
    }

    case 'SAVE_IMPORTED': {
      if (state.phase !== 'title') return noop(state);
      // All-or-nothing: bytes go through the same validate + migrate pipeline
      // as localStorage loads; anything invalid changes nothing.
      const save = parseSaveFile(event.text);
      if (save === null) {
        return { state, effects: [{ type: 'IMPORT_REJECTED' }] };
      }
      return {
        state: {
          ...state,
          players: save.players,
          nextPlayerId: save.nextPlayerId,
          lastExportAt: save.lastExportAt,
          muted: save.muted,
          activePlayerId: null,
        },
        effects: [{ type: 'IMPORT_SUCCEEDED' }, { type: 'SAVE_FILE_CHANGED' }],
      };
    }

    case 'TIMER_CHANGED': {
      if (state.phase !== 'pre-round') return noop(state);
      const seconds = Math.min(MAX_TIMER_SECONDS, Math.max(MIN_TIMER_SECONDS, event.seconds));
      return { state: { ...state, timerSeconds: seconds }, effects: [] };
    }

    case 'DIFFICULTY_CHANGED': {
      if (state.phase !== 'pre-round') return noop(state);
      // Picking a difficulty always returns to tier mode.
      return {
        state: { ...state, difficulty: event.difficulty, practiceTable: null },
        effects: [],
      };
    }

    case 'PRACTICE_TABLE_CHANGED': {
      if (state.phase !== 'pre-round') return noop(state);
      if (event.table === null) {
        return { state: { ...state, practiceTable: null }, effects: [] };
      }
      const table = Math.round(event.table);
      if (table < MIN_PRACTICE_TABLE || table > MAX_PRACTICE_TABLE) return noop(state);
      return { state: { ...state, practiceTable: table }, effects: [] };
    }

    case 'ROUND_STARTED': {
      if (state.phase !== 'pre-round' || state.activePlayerId === null) return noop(state);
      const selected = selectQuestion(state.difficulty, state.prng, {
        factStats: activeFactStats(state),
        practiceTable: state.practiceTable,
      });
      return {
        state: {
          ...state,
          prng: selected.prng,
          phase: 'in-round',
          roundStartedAt: state.now,
          score: 0,
          question: selected.question,
          questionAskedAt: state.now,
          answerBuffer: '',
          streak: 0,
          bestStreak: 0,
          feedback: null,
        },
        effects: [{ type: 'QUESTION_ASKED', question: selected.question }],
      };
    }

    case 'ROUND_QUIT': {
      if (state.phase !== 'in-round') return noop(state);
      // Abandoning a Round records nothing — no XP, no attribution, no best.
      return {
        state: { ...state, phase: 'pre-round', answerBuffer: '', feedback: null, streak: 0 },
        effects: [{ type: 'ROUND_ABANDONED' }],
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

      const recorded = withAttemptRecorded(state, correct);

      if (!correct) {
        // No points lost, no time refunded — but the hero drops to base form
        // and the correct equation teaches until the next question appears.
        return {
          state: {
            ...recorded,
            streak: 0,
            answerBuffer: '',
            feedback: { question, correctAnswer, until: state.now + FEEDBACK_MS },
          },
          effects:
            state.streak > 0
              ? [{ type: 'ANSWER_WRONG', question, correctAnswer }, { type: 'STREAK_BROKEN' }]
              : [{ type: 'ANSWER_WRONG', question, correctAnswer }],
        };
      }

      const streak = state.streak + 1;
      const tier = tierForStreak(streak);
      const points = pointsForCorrect(state, streak);
      const transformed = tier.threshold === streak && tier.multiplier > 1;

      const selected = selectQuestion(state.difficulty, state.prng, {
        factStats: activeFactStats(recorded),
        excludeKey: factKey(question.a, question.b),
        practiceTable: state.practiceTable,
      });
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
          ...recorded,
          prng: selected.prng,
          score: state.score + points,
          streak,
          bestStreak: Math.max(state.bestStreak, streak),
          question: selected.question,
          questionAskedAt: state.now,
          answerBuffer: '',
        },
        effects,
      };
    }
  }
}
