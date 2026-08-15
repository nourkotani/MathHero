// The Game Core's public vocabulary. Later tickets extend these unions —
// they never add a second entry point (ADR 0003, docs/ARCHITECTURE.md).

import type { Difficulty } from './difficulty';
import type { StreakForm } from './streak';

/** A multiplication question in the operand order it is displayed. */
export interface Question {
  a: number;
  b: number;
}

export type Phase = 'pre-round' | 'in-round' | 'results';

export interface GameConfig {
  /** Seed for the injected PRNG — the core never calls Math.random. */
  seed: number;
}

export interface GameState {
  /** Injected PRNG state; advanced immutably by every random draw. */
  prng: number;
  phase: Phase;
  difficulty: Difficulty;
  /** Round length setting in seconds; clamped to 30–600, default 120. */
  timerSeconds: number;
  /** Latest tick timestamp (ms) — the core's only notion of "now". */
  now: number;
  /** Tick timestamp when the current Round began. */
  roundStartedAt: number;
  score: number;
  question: Question;
  /** Digits typed so far, most recent last. Submit is an explicit event. */
  answerBuffer: string;
  /** Consecutive correct answers this Round; resets at Round start. Never persisted. */
  streak: number;
  /** Wrong-answer teaching moment: the correct equation, shown until `until`. */
  feedback: { question: Question; correctAnswer: number; until: number } | null;
}

export type GameEvent =
  | { type: 'TICK'; now: number }
  | { type: 'TIMER_CHANGED'; seconds: number }
  | { type: 'DIFFICULTY_CHANGED'; difficulty: Difficulty }
  | { type: 'ROUND_STARTED' }
  | { type: 'PLAY_AGAIN' }
  | { type: 'DIGIT_PRESSED'; digit: number }
  | { type: 'BACKSPACE_PRESSED' }
  | { type: 'ANSWER_SUBMITTED' };

export type GameEffect =
  | { type: 'ANSWER_CORRECT'; question: Question; points: number }
  | { type: 'ANSWER_WRONG'; question: Question; correctAnswer: number }
  | { type: 'QUESTION_ASKED'; question: Question }
  | { type: 'TRANSFORMED'; form: StreakForm; multiplier: number; streak: number }
  | { type: 'STREAK_BROKEN' }
  | { type: 'BLAST_FIRED' }
  | { type: 'ROUND_ENDED'; finalScore: number };

export interface UpdateResult {
  state: GameState;
  effects: GameEffect[];
}
