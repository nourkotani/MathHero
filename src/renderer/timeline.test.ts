import { describe, expect, it } from 'vitest';
import { createChannel } from './timeline';

describe('the clip channel', () => {
  it('runs a clip to its end, then calls onDone once', () => {
    const seen: number[] = [];
    let done = 0;
    const channel = createChannel();
    channel.play({ duration: 1, apply: (t) => seen.push(t), onDone: () => (done += 1) });
    channel.update(0.5, 0);
    channel.update(0.5, 0);
    channel.update(0.5, 0);
    expect(seen).toEqual([0.5, 1]);
    expect(done).toBe(1);
    expect(channel.playing()).toBe(false);
  });

  it('ends a clip of no length at once (its model is not decoded yet)', () => {
    const seen: number[] = [];
    const channel = createChannel();
    channel.play({ duration: 0, apply: (t) => seen.push(t) });
    channel.update(0, 0);
    expect(seen).toEqual([1]);
    expect(channel.playing()).toBe(false);
  });
});
