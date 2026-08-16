// Shared helpers for the headless core suites. Everything goes through the
// public interface — initialState + update — never past it.

import { activeSkill, DEFAULT_APPEARANCE, emptyPerSkill, initialState, skillFor, update } from './index';
import type { Difficulty, GameEvent, GameState, Skill, UpdateResult } from './index';

export const TEST_COLORS = { hair: 'midnight', outfitPrimary: 'blue', outfitSecondary: 'orange' };
export const TEST_APPEARANCE = DEFAULT_APPEARANCE;

/**
 * A full per-Skill map — every Skill present, empty slices unless overridden.
 * Fixtures and expectations built with this survive the Skill union growing.
 */
export function perSkill<T extends object>(
  overrides: Partial<Record<Skill, T>> = {},
): Record<Skill, T> {
  return { ...emptyPerSkill(() => ({}) as T), ...overrides };
}

export function dispatchAll(state: GameState, events: GameEvent[]): GameState {
  return events.reduce((s, event) => update(s, event).state, state);
}

/** A fresh state with one hero created and selected, sitting at pre-round. */
export function preRound(seed: number, name = 'Testo'): GameState {
  return dispatchAll(initialState({ seed }), [
    { type: 'HERO_CREATION_OPENED' },
    { type: 'PLAYER_CREATED', name, colors: TEST_COLORS, appearance: TEST_APPEARANCE },
  ]);
}

/** A fresh state already inside a running Round (round started at now = 0). */
export function freshRound(seed: number, difficulty?: Difficulty, skill?: Skill): GameState {
  const events: GameEvent[] = [{ type: 'TICK', now: 0 }];
  if (skill) events.push({ type: 'SKILL_CHANGED', skill });
  if (difficulty) events.push({ type: 'DIFFICULTY_CHANGED', difficulty });
  events.push({ type: 'ROUND_STARTED' });
  return dispatchAll(preRound(seed), events);
}

export function typeDigits(value: number): GameEvent[] {
  return String(value)
    .split('')
    .map((d) => ({ type: 'DIGIT_PRESSED', digit: Number(d) }) as GameEvent);
}

export function answerCorrectly(state: GameState): UpdateResult {
  const answer = skillFor(activeSkill(state)).answer(state.question);
  const typed = dispatchAll(state, typeDigits(answer));
  return update(typed, { type: 'ANSWER_SUBMITTED' });
}

export function answerWrongly(state: GameState): UpdateResult {
  const wrong = skillFor(activeSkill(state)).answer(state.question) + 1;
  const typed = dispatchAll(state, typeDigits(wrong));
  return update(typed, { type: 'ANSWER_SUBMITTED' });
}

/** Submit a typed value (digit presses + ✓) against the current question. */
export function submitAnswer(state: GameState, typed: number | string): UpdateResult {
  const digits = String(typed)
    .split('')
    .map((d) => ({ type: 'DIGIT_PRESSED', digit: Number(d) }) as GameEvent);
  return update(dispatchAll(state, digits), { type: 'ANSWER_SUBMITTED' });
}
