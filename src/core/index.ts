// The Game Core's entire public interface: initialState + update, the types
// they speak, and derived-value selectors. Everything else is implementation.

export { FEEDBACK_MS, initialState, update } from './update';
export { DIFFICULTY_TIERS, tierFor } from './difficulty';
export type { Difficulty, DifficultyTier } from './difficulty';
export { STREAK_TIERS, tierForStreak } from './streak';
export type { StreakForm, StreakTier } from './streak';
export {
  COSMETIC_MILESTONES,
  cosmeticUnlockedAt,
  glowIntensityForLevel,
  levelForXp,
  unlockedCosmetics,
  XP_PER_LEVEL,
  xpForLevel,
} from './level';
export type { CosmeticTier } from './level';
export { factKey } from './facts';
export type { FactKey } from './facts';
export {
  adaptiveWeight,
  ATTEMPT_WINDOW,
  FAST_MS,
  masteryOf,
  MASTERY_STREAK,
  recordAttempt,
} from './mastery';
export type { FactAttempt, FactStats, Mastery } from './mastery';
export { familyLeaderboard } from './leaderboard';
export type { LeaderboardEntry } from './leaderboard';
export { HAIR_PRESETS, MAX_NAME_LENGTH, OUTFIT_PRESETS, presetHex } from './players';
export type { ColorPreset, PlayerColors, PlayerRecord } from './players';
export {
  buildSaveFile,
  parseSaveFile,
  SAVE_FILE_VERSION,
  serializeSaveFile,
} from './savefile';
export type { SaveFile } from './savefile';
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
