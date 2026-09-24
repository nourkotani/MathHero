import { describe, expect, it } from 'vitest';
import { createDummyDirector } from './dummy';

describe('the Training Dummy director', () => {
  it('starts in Idle and cycles the hit clips a base hero unlocks', () => {
    const dummy = createDummyDirector();
    expect(dummy.cue().clip).toBe('Idle');
    const clips: string[] = [];
    for (let i = 0; i < 3; i++) {
      dummy.hit(false);
      clips.push(dummy.cue().clip);
    }
    expect(clips).toEqual(['HitBack', 'HitTwist', 'HitBack']);
  });

  it('gives a repeat of the same clip a new cue', () => {
    const dummy = createDummyDirector();
    dummy.taunt();
    const first = dummy.cue();
    dummy.finished('Taunt');
    dummy.taunt();
    expect(dummy.cue().clip).toBe('Taunt');
    expect(dummy.cue().count).toBeGreaterThan(first.count);
  });

  it('ignores hits and taunts while airborne, then recovers after a launch', () => {
    const dummy = createDummyDirector();
    dummy.launch();
    dummy.hit(true);
    dummy.taunt();
    expect(dummy.cue().clip).toBe('Launch');
    dummy.finished('Launch');
    expect(dummy.cue().clip).toBe('Recover');
    dummy.finished('Recover');
    expect(dummy.cue().clip).toBe('Idle');
  });

  it('lets only the playing clip hand on', () => {
    const dummy = createDummyDirector();
    dummy.launch();
    dummy.finished('HitBack'); // a clip that faded out ends late
    expect(dummy.cue().clip).toBe('Launch');
  });
});
