// Derived values — computed from state, never stored, so the countdown can't
// drift from the one time source (the tick stream).

import type { GameState } from './types';

export const MIN_TIMER_SECONDS = 30;
export const MAX_TIMER_SECONDS = 600;
export const DEFAULT_TIMER_SECONDS = 120;

/** Milliseconds left in the current Round, clamped at zero. */
export function remainingMs(state: GameState): number {
  const deadline = state.roundStartedAt + state.timerSeconds * 1000;
  return Math.max(0, deadline - state.now);
}

/** Whole seconds left, rounded up so "0" only shows when the Round is over. */
export function remainingSeconds(state: GameState): number {
  return Math.ceil(remainingMs(state) / 1000);
}

/** The urgent final stretch: ten seconds or less on the clock. */
export function isFinalTenSeconds(state: GameState): boolean {
  return state.phase === 'in-round' && remainingMs(state) <= 10_000;
}

export const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

/** Gently nag when more than 7 days have passed since the last export. */
export function backupReminderDue(state: GameState): boolean {
  return (
    state.players.length > 0 &&
    state.lastExportAt !== null &&
    state.now - state.lastExportAt > BACKUP_REMINDER_MS
  );
}
