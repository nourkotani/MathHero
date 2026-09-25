import { describe, expect, it } from 'vitest';
import { createRivalDirector } from './rival';

describe('the Rival director', () => {
  it('starts in Idle and cycles the hit clips a base hero unlocks', () => {
    const rival = createRivalDirector();
    expect(rival.cue().clip).toBe('Idle');
    const clips: string[] = [];
    for (let i = 0; i < 3; i++) {
      rival.hit(false);
      clips.push(rival.cue().clip);
    }
    expect(clips).toEqual(['HitBack', 'HitTwist', 'HitBack']);
  });

  it('gives a repeat of the same clip a new cue', () => {
    const rival = createRivalDirector();
    rival.taunt();
    const first = rival.cue();
    rival.finished('Taunt');
    rival.taunt();
    expect(rival.cue().clip).toBe('Taunt');
    expect(rival.cue().count).toBeGreaterThan(first.count);
  });

  it('ignores hits and taunts while airborne, then recovers after a launch', () => {
    const rival = createRivalDirector();
    rival.launch();
    rival.hit(true);
    rival.taunt();
    expect(rival.cue().clip).toBe('Launch');
    rival.finished('Launch');
    expect(rival.cue().clip).toBe('Recover');
    rival.finished('Recover');
    expect(rival.cue().clip).toBe('Idle');
  });

  it('lets only the playing clip hand on', () => {
    const rival = createRivalDirector();
    rival.launch();
    rival.finished('HitBack'); // a clip that faded out ends late
    expect(rival.cue().clip).toBe('Launch');
  });
});
