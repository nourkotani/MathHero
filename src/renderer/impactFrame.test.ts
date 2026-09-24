import { describe, expect, it } from 'vitest';
import { IMPACT_FRAME_GAP, initialImpactGate, tryImpactFrame } from './impactFrame';

describe('the impact-frame gate (safe for children\'s eyes)', () => {
  it('lets the first big hit flash', () => {
    expect(tryImpactFrame(initialImpactGate, 10, 'full').fire).toBe(true);
  });

  it('never flashes again inside the gap, however many big hits land', () => {
    let gate = tryImpactFrame(initialImpactGate, 10, 'full').gate;
    for (const now of [10.1, 10.5, 11, 10 + IMPACT_FRAME_GAP - 0.01]) {
      const result = tryImpactFrame(gate, now, 'full');
      expect(result.fire, `at ${now}`).toBe(false);
      gate = result.gate;
    }
  });

  it('flashes again once the gap has passed since the last flash', () => {
    const gate = tryImpactFrame(initialImpactGate, 10, 'full').gate;
    expect(tryImpactFrame(gate, 10 + IMPACT_FRAME_GAP, 'full').fire).toBe(true);
  });

  it('stays at most one flash a second, far below three a second', () => {
    expect(IMPACT_FRAME_GAP).toBeGreaterThanOrEqual(1);
  });

  it('follows the quality ladder: the bloom tier flashes, the sprite tier never does', () => {
    expect(tryImpactFrame(initialImpactGate, 10, 'bloom').fire).toBe(true);
    expect(tryImpactFrame(initialImpactGate, 10, 'sprites').fire).toBe(false);
  });

  it('a blocked hit does not restart the gap', () => {
    const gate = tryImpactFrame(initialImpactGate, 10, 'full').gate;
    const blocked = tryImpactFrame(gate, 10.9, 'full').gate;
    expect(tryImpactFrame(blocked, 10 + IMPACT_FRAME_GAP, 'full').fire).toBe(true);
  });
});
