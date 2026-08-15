import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMER_SECONDS,
  isFinalTenSeconds,
  remainingMs,
  remainingSeconds,
  update,
} from './index';
import { answerCorrectly, dispatchAll, freshRound, preRound } from './test-helpers';

describe('timer settings', () => {
  it('defaults to two minutes', () => {
    expect(preRound(1).timerSeconds).toBe(DEFAULT_TIMER_SECONDS);
    expect(DEFAULT_TIMER_SECONDS).toBe(120);
  });

  it('clamps to the 30s–10min bounds', () => {
    const state = preRound(1);
    expect(update(state, { type: 'TIMER_CHANGED', seconds: 5 }).state.timerSeconds).toBe(30);
    expect(update(state, { type: 'TIMER_CHANGED', seconds: 9999 }).state.timerSeconds).toBe(600);
    expect(update(state, { type: 'TIMER_CHANGED', seconds: 300 }).state.timerSeconds).toBe(300);
  });

  it('cannot be changed mid-Round', () => {
    const inRound = freshRound(1);
    const result = update(inRound, { type: 'TIMER_CHANGED', seconds: 30 });
    expect(result.state.timerSeconds).toBe(DEFAULT_TIMER_SECONDS);
  });
});

describe('Round lifecycle', () => {
  it('starting a Round resets the score and asks a question', () => {
    const result = update(dispatchAll(preRound(1), [{ type: 'TICK', now: 0 }]), {
      type: 'ROUND_STARTED',
    });
    expect(result.state.phase).toBe('in-round');
    expect(result.state.score).toBe(0);
    expect(result.effects[0]).toMatchObject({ type: 'QUESTION_ASKED' });
  });

  it('remaining time is derived from the round start and the latest tick', () => {
    let state = dispatchAll(preRound(1), [
      { type: 'TICK', now: 1000 },
      { type: 'ROUND_STARTED' },
    ]);
    expect(remainingMs(state)).toBe(120_000);

    state = update(state, { type: 'TICK', now: 31_000 }).state;
    expect(remainingMs(state)).toBe(90_000);
    expect(remainingSeconds(state)).toBe(90);
  });

  it('the final ten seconds are flagged for urgency', () => {
    let state = freshRound(1);
    expect(isFinalTenSeconds(state)).toBe(false);
    state = update(state, { type: 'TICK', now: 110_000 }).state;
    expect(isFinalTenSeconds(state)).toBe(true);
  });

  it('a tick past the deadline ends the Round instantly and voids the typed answer', () => {
    const inRound = dispatchAll(freshRound(1), [
      { type: 'DIGIT_PRESSED', digit: 4 },
      { type: 'DIGIT_PRESSED', digit: 2 },
    ]);
    const result = update(inRound, { type: 'TICK', now: 120_001 });

    expect(result.state.phase).toBe('results');
    expect(result.state.answerBuffer).toBe('');
    expect(result.state.score).toBe(0);
    expect(result.effects[0]).toEqual({ type: 'ROUND_ENDED', finalScore: 0 });
  });

  it('the ended Round keeps its final score for the Results screen', () => {
    const state = answerCorrectly(freshRound(5)).state;
    const result = update(state, { type: 'TICK', now: 999_999 });
    expect(result.effects[0]).toEqual({ type: 'ROUND_ENDED', finalScore: 10 });
    expect(result.state.score).toBe(10);
  });

  it('quitting a Round records nothing and returns to pre-round', () => {
    const state = answerCorrectly(freshRound(9)).state;
    const result = update(state, { type: 'ROUND_QUIT' });

    expect(result.state.phase).toBe('pre-round');
    expect(result.effects).toEqual([{ type: 'ROUND_ABANDONED' }]);
    const player = result.state.players[0];
    expect(player?.xp).toBe(0);
    expect(player?.roundsPlayed).toBe(0);
    expect(player?.bests).toEqual({});

    // Quit is only meaningful mid-Round.
    expect(update(result.state, { type: 'ROUND_QUIT' }).state).toEqual(result.state);
  });

  it('play again returns to pre-round and keeps the timer setting', () => {
    let state = dispatchAll(preRound(1), [
      { type: 'TIMER_CHANGED', seconds: 300 },
      { type: 'TICK', now: 0 },
      { type: 'ROUND_STARTED' },
      { type: 'TICK', now: 900_000 },
    ]);
    expect(state.phase).toBe('results');

    state = update(state, { type: 'PLAY_AGAIN' }).state;
    expect(state.phase).toBe('pre-round');
    expect(state.timerSeconds).toBe(300);
  });
});
