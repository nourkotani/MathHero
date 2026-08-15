// The Game Core's entire public interface: initialState + update, the types
// they speak, and derived-value selectors. Everything else is implementation.

export { initialState, update } from './update';
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
