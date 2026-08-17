// The Game Core's entire public interface: initialState + update, the types
// they speak, and derived-value selectors. Everything else is implementation.

export { FEEDBACK_MS, initialState, update } from './update';
export {
  DIFFICULTY_TIERS,
  MAX_PRACTICE_TABLE,
  MIN_PRACTICE_TABLE,
  PRACTICE_BASE_POINTS,
  tierFor,
} from './difficulty';
export type { Difficulty, DifficultyTier } from './difficulty';
export { STREAK_TIERS, tierForStreak } from './streak';
export type { StreakForm, StreakTier } from './streak';
export {
  COSMETIC_MILESTONES,
  cosmeticUnlockedAt,
  formForLevel,
  FORMS,
  formUnlockedAt,
  glowIntensityForLevel,
  levelForXp,
  MAX_LEVEL,
  unlockedCosmetics,
  wornCosmetics,
  XP_PER_LEVEL,
  xpForLevel,
} from './level';
export type { CosmeticSlot, CosmeticTier, HeroForm } from './level';
export {
  BODY_OPTIONS,
  DEFAULT_APPEARANCE,
  GARMENT_OPTIONS,
  HAIR_LENGTH_OPTIONS,
  HAIR_STYLE_OPTIONS,
  SKIN_PRESETS,
  validAppearance,
} from './appearance';
export type {
  AppearanceOption,
  BodyStyle,
  Garment,
  HairLength,
  HairStyle,
  HeroAppearance,
  SkinPreset,
  SkinTone,
} from './appearance';
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
export { emptyPerSkill, MACHINE_JUMP_MAX, MACHINE_JUMP_MIN, SKILL_DEFS, skillFor, SKILLS } from './skills';
export type { DressContext, Skill, SkillDef } from './skills';
export {
  buildSaveFile,
  parseSaveFile,
  SAVE_FILE_VERSION,
  serializeSaveFile,
} from './savefile';
export type { SaveFile } from './savefile';
export {
  activeSkill,
  BACKUP_REMINDER_MS,
  backupReminderDue,
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
