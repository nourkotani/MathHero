// The Game Core's public vocabulary. Later tickets extend these unions —
// they never add a second entry point (ADR 0003, docs/ARCHITECTURE.md).

import type { HeroAppearance } from './appearance';
import type { Difficulty } from './difficulty';
import type { CosmeticTier } from './level';
import type { PlayerColors, PlayerRecord } from './players';
import type { SaveFile } from './savefile';
import type { Skill } from './skills';
import type { StreakForm } from './streak';

/**
 * A Fact in the operand order it is displayed. The active Skill's definition
 * turns it into a prompt: Multiply shows "a × b"; Divide shows the same pair
 * inside-out as "(a·b) ÷ a" with the missing factor b as the answer.
 */
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
  /** Hero-creation work in progress; the renderer previews it live. */
  draft: { colors: PlayerColors; appearance: HeroAppearance } | null;
  activePlayerId: string | null;
  /** Monotonic counter minting stable player ids. */
  nextPlayerId: number;
  /** Epoch ms of the last Save File export; baseline set at first play. */
  lastExportAt: number | null;
  /** Family-wide mute toggle; persists in the Save File. */
  muted: boolean;
  /** The Skill this session trains. Session-only, like difficulty. */
  skill: Skill;
  difficulty: Difficulty;
  /**
   * Practice mode: when set (1–12), Rounds ask only that times table and
   * difficulty tiers don't apply. Cleared by picking a difficulty.
   */
  practiceTable: number | null;
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
  /** The Round's longest streak, for the Results screen. Never persisted. */
  bestStreak: number;
  /** Wrong-answer teaching moment: the correct equation, shown until `until`. */
  feedback: { question: Question; correctAnswer: number; until: number } | null;
}

export type GameEvent =
  | { type: 'TICK'; now: number }
  | { type: 'HERO_CREATION_OPENED' }
  | { type: 'CREATION_CANCELLED' }
  | { type: 'DRAFT_CHANGED'; colors: PlayerColors; appearance: HeroAppearance }
  | { type: 'PLAYER_CREATED'; name: string; colors: PlayerColors; appearance: HeroAppearance }
  | { type: 'PLAYER_SELECTED'; id: string }
  | { type: 'PLAYER_RENAMED'; id: string; name: string }
  | { type: 'PLAYER_DELETED'; id: string }
  | { type: 'TITLE_OPENED' }
  | { type: 'SAVE_EXPORTED' }
  | { type: 'MUTE_TOGGLED' }
  | { type: 'SAVE_IMPORTED'; text: string }
  /** The persisted Save File changed outside this tab (another open copy of the game saved). */
  | { type: 'SAVE_RELOADED'; text: string }
  | { type: 'TIMER_CHANGED'; seconds: number }
  | { type: 'SKILL_CHANGED'; skill: Skill }
  | { type: 'DIFFICULTY_CHANGED'; difficulty: Difficulty }
  | { type: 'PRACTICE_TABLE_CHANGED'; table: number | null }
  | { type: 'ROUND_STARTED' }
  | { type: 'ROUND_QUIT' }
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
  /** The player gave up mid-Round: nothing is recorded, no ceremony plays. */
  | { type: 'ROUND_ABANDONED' }
  /** One per Hero Level gained, in order; carries any cosmetic tier unlocked. */
  | { type: 'LEVEL_UP'; level: number; cosmetic?: CosmeticTier }
  | { type: 'NEW_PERSONAL_BEST'; skill: Skill; difficulty: Difficulty; score: number }
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
