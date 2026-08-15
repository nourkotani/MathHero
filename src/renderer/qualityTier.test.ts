import { describe, expect, it } from 'vitest';
import { DEGRADE_AFTER_SAMPLES, FPS_FLOOR, initialTierState, nextTier } from './qualityTier';

const feed = (fpsSamples: number[]) =>
  fpsSamples.reduce((state, fps) => nextTier(state, fps), initialTierState);

describe('the visual quality tier', () => {
  it('starts on bloom', () => {
    expect(initialTierState.tier).toBe('bloom');
  });

  it('degrades to sprites after sustained low fps', () => {
    const low = FPS_FLOOR - 5;
    expect(feed(Array(DEGRADE_AFTER_SAMPLES).fill(low)).tier).toBe('sprites');
  });

  it('shrugs off brief dips — only consecutive low samples count', () => {
    const low = FPS_FLOOR - 5;
    const fine = FPS_FLOOR + 15;
    // Dips shorter than the window, interrupted by healthy samples.
    const state = feed([low, low, fine, low, low, fine, low, low]);
    expect(state.tier).toBe('bloom');
  });

  it('holds bloom forever on a healthy device', () => {
    expect(feed(Array(120).fill(60)).tier).toBe('bloom');
  });

  it('degradation is sticky for the session, even if fps recovers', () => {
    const low = FPS_FLOOR - 5;
    const state = feed([...Array(DEGRADE_AFTER_SAMPLES).fill(low), 60, 60, 60]);
    expect(state.tier).toBe('sprites');
  });

  it('a sample exactly at the floor counts as healthy', () => {
    expect(feed(Array(DEGRADE_AFTER_SAMPLES * 2).fill(FPS_FLOOR)).tier).toBe('bloom');
  });
});
