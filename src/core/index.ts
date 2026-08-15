// The Game Core's entire public interface: initialState + update, the types
// they speak, and derived-value selectors. Everything else is implementation.

export { FEEDBACK_MS, initialState, update } from './update';
export { DIFFICULTY_TIERS, tierFor } from './difficulty';
export type { Difficulty, DifficultyTier } from './difficulty';
export { STREAK_TIERS, tierForStreak } from './streak';
export type { StreakForm, StreakTier } from './streak';
export {
  DEFAULT_TIMER_SECONDS,
  isFinalTenSeconds,
  MAX_TIMER_SECONDS,
  MIN_TIMER_SECONDS,
  remainingMs,
  remainingSeconds,
} from './selectors';
export type {
  GameConfig,
  GameEffect,
  GameEvent,
  GameState,
  Phase,
  Question,
  UpdateResult,
} from './types';
