// The Game Core's public vocabulary. Later tickets extend these unions —
// they never add a second entry point (ADR 0003, docs/ARCHITECTURE.md).

import type { Difficulty } from './difficulty';
import type { CosmeticTier } from './level';
import type { PlayerColors, PlayerRecord } from './players';
import type { SaveFile } from './savefile';
import type { StreakForm } from './streak';

/** A multiplication question in the operand order it is displayed. */
export interface Question {
  a: number;
  b: number;
}

export type Phase = 'title' | 'hero-creation' | 'pre-round' | 'in-round' | 'results';

export interface GameConfig {
  /** Seed for the injected PRNG — the core never calls Math.random. */
  seed: number;
  /** A previously persisted Save File, already parsed and migrated. */
  save?: SaveFile | null;
}

export interface GameState {
  /** Injected PRNG state; advanced immutably by every random draw. */
  prng: number;
  phase: Phase;
  /** The family's heroes — the persisted heart of the Save File. */
  players: PlayerRecord[];
  activePlayerId: string | null;
  /** Monotonic counter minting stable player ids. */
  nextPlayerId: number;
  /** Epoch ms of the last Save File export; baseline set at first play. */
  lastExportAt: number | null;
  difficulty: Difficulty;
  /** Round length setting in seconds; clamped to 30–600, default 120. */
  timerSeconds: number;
  /** Latest tick timestamp (ms) — the core's only notion of "now". */
  now: number;
  /** Tick timestamp when the current Round began. */
  roundStartedAt: number;
  score: number;
  question: Question;
  /** Tick timestamp when the current question appeared — answer speed derives from it. */
  questionAskedAt: number;
  /** Digits typed so far, most recent last. Submit is an explicit event. */
  answerBuffer: string;
  /** Consecutive correct answers this Round; resets at Round start. Never persisted. */
  streak: number;
  /** Wrong-answer teaching moment: the correct equation, shown until `until`. */
  feedback: { question: Question; correctAnswer: number; until: number } | null;
}

export type GameEvent =
  | { type: 'TICK'; now: number }
  | { type: 'HERO_CREATION_OPENED' }
  | { type: 'CREATION_CANCELLED' }
  | { type: 'PLAYER_CREATED'; name: string; colors: PlayerColors }
  | { type: 'PLAYER_SELECTED'; id: string }
  | { type: 'PLAYER_RENAMED'; id: string; name: string }
  | { type: 'PLAYER_DELETED'; id: string }
  | { type: 'TITLE_OPENED' }
  | { type: 'SAVE_EXPORTED' }
  | { type: 'SAVE_IMPORTED'; text: string }
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
  | { type: 'ROUND_ENDED'; finalScore: number }
  /** One per Hero Level gained, in order; carries any cosmetic tier unlocked. */
  | { type: 'LEVEL_UP'; level: number; cosmetic?: CosmeticTier }
  | { type: 'NEW_PERSONAL_BEST'; difficulty: Difficulty; score: number }
  /** The persisted slice changed — the persistence subscriber must save. */
  | { type: 'SAVE_FILE_CHANGED' }
  /** The download adapter should hand this serialized Save File to the parent. */
  | { type: 'EXPORT_READY'; text: string }
  | { type: 'IMPORT_SUCCEEDED' }
  | { type: 'IMPORT_REJECTED' };

export interface UpdateResult {
  state: GameState;
  effects: GameEffect[];
}
