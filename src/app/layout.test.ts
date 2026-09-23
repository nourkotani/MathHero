import { describe, expect, it } from 'vitest';
import { layoutFor } from './layout';

describe('the Layout rule', () => {
  it('stacks the arena above the pad on a tall screen', () => {
    expect(layoutFor(402, 874)).toBe('stacked'); // iPhone 17 Pro, portrait
    expect(layoutFor(820, 1180)).toBe('stacked'); // iPad, portrait
  });

  it('keeps the side-by-side layout on a wide or square screen', () => {
    expect(layoutFor(1280, 720)).toBe('side-by-side'); // desktop
    expect(layoutFor(1180, 820)).toBe('side-by-side'); // iPad, landscape
    expect(layoutFor(874, 402)).toBe('side-by-side'); // phone turned sideways
    expect(layoutFor(800, 800)).toBe('side-by-side');
  });
});
