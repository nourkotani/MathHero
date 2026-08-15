// The Game Core's entire public interface: initialState + update, plus the
// types they speak. Everything else in this directory is implementation.

export { initialState, update } from './update';
export type {
  GameConfig,
  GameEffect,
  GameEvent,
  GameState,
  Question,
  UpdateResult,
} from './types';
