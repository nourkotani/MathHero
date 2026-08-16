import { describe, expect, it } from 'vitest';
import { DEGRADE_AFTER_SAMPLES, FPS_FLOOR, initialTierState, nextTier } from './qualityTier';

const feed = (fpsSamples: number[]) =>
  fpsSamples.reduce((state, fps) => nextTier(state, fps), initialTierState);

const low = FPS_FLOOR - 5;
const lowRun = Array(DEGRADE_AFTER_SAMPLES).fill(low);

describe('the visual quality tier', () => {
  it('starts on the full look — shafts, speed-lines, and bloom', () => {
    expect(initialTierState.tier).toBe('full');
  });

  it('sheds one tier per sustained-low episode: the extra passes go before bloom', () => {
    expect(feed(lowRun).tier).toBe('bloom');
    expect(feed([...lowRun, ...lowRun]).tier).toBe('sprites');
  });

  it('stays at sprites — there is nothing further to shed', () => {
    expect(feed([...lowRun, ...lowRun, ...lowRun, low, low]).tier).toBe('sprites');
  });

  it('shrugs off brief dips — only consecutive low samples count', () => {
    const fine = FPS_FLOOR + 15;
    // Dips shorter than the window, interrupted by healthy samples.
    const state = feed([low, low, fine, low, low, fine, low, low]);
    expect(state.tier).toBe('full');
  });

  it('a healthy run after one degradation must restart the count from zero', () => {
    const fine = FPS_FLOOR + 15;
    const state = feed([...lowRun, fine, low, low]);
    expect(state.tier).toBe('bloom');
  });

  it('holds the full look forever on a healthy device', () => {
    expect(feed(Array(120).fill(60)).tier).toBe('full');
  });

  it('degradation is sticky for the session, even if fps recovers', () => {
    const state = feed([...lowRun, 60, 60, 60]);
    expect(state.tier).toBe('bloom');
    const floor = feed([...lowRun, ...lowRun, 60, 60, 60]);
    expect(floor.tier).toBe('sprites');
  });

  it('a sample exactly at the floor counts as healthy', () => {
    expect(feed(Array(DEGRADE_AFTER_SAMPLES * 2).fill(FPS_FLOOR)).tier).toBe('full');
  });
});
