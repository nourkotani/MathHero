import { describe, expect, it } from 'vitest';
import { createHeroDirector, partShows } from './heroDirector';

const PARTS = { body: 'BodyBoy', garment: 'GarmentGi', hair: 'Hair_spiky_short' };
const CLIPS = ['Idle', 'Attack0', 'Attack1', 'Charge', 'Stagger', 'Blast', 'Transform', 'Victory'].map(
  (name, i) => ({ name, duration: 0.5 + i }),
);

function ready() {
  const hero = createHeroDirector(PARTS);
  hero.ready(CLIPS);
  return hero;
}

describe('the hero director', () => {
  it('ignores every clip until the model tells it which clips exist', () => {
    const hero = createHeroDirector(PARTS);
    hero.play('Attack0');
    expect(hero.cue().clip).toBe('Idle');
    hero.ready(CLIPS);
    hero.play('Attack0');
    expect(hero.cue().clip).toBe('Attack0');
  });

  it("reads each clip's length from the model, and knows none before it", () => {
    const hero = createHeroDirector(PARTS);
    expect(hero.length('Stagger')).toBe(0);
    hero.ready(CLIPS);
    expect(hero.length('Stagger')).toBe(4.5);
    expect(hero.length('Moonwalk')).toBe(0);
  });

  it('ignores a clip the model does not carry', () => {
    const hero = ready();
    hero.play('Moonwalk');
    expect(hero.cue().clip).toBe('Idle');
  });

  it('returns a one-shot clip to Idle when it ends', () => {
    const hero = ready();
    hero.play('Stagger');
    hero.finished('Stagger');
    expect(hero.cue().clip).toBe('Idle');
  });

  it('never lets a queued charge cut off a strike', () => {
    const hero = ready();
    hero.play('Attack1');
    hero.play('Charge', true);
    expect(hero.cue().clip).toBe('Attack1');
    hero.finished('Attack1');
    expect(hero.cue().clip).toBe('Charge');
    hero.finished('Charge');
    expect(hero.cue().clip).toBe('Idle');
  });

  it('plays a queued clip at once when the hero is idle', () => {
    const hero = ready();
    hero.play('Charge', true);
    expect(hero.cue().clip).toBe('Charge');
  });

  it('drops the queued clip when a clip plays at once', () => {
    const hero = ready();
    hero.play('Attack0');
    hero.play('Charge', true);
    hero.play('Blast');
    hero.finished('Blast');
    expect(hero.cue().clip).toBe('Idle');
  });

  it('lets only the playing clip hand on', () => {
    const hero = ready();
    hero.play('Attack0');
    hero.play('Stagger');
    hero.finished('Attack0'); // the strike that faded out ends late
    expect(hero.cue().clip).toBe('Stagger');
  });

  it('gives a repeat of the same clip a new cue', () => {
    const hero = ready();
    hero.play('Attack0');
    const first = hero.cue();
    hero.play('Attack0');
    expect(hero.cue()).not.toBe(first);
    expect(hero.cue().count).toBeGreaterThan(first.count);
  });

  it('swaps the hair alone and reports each change once', () => {
    const hero = ready();
    let changes = 0;
    hero.onChange(() => changes++);
    hero.showHair('Hair_mane_wild');
    hero.showHair('Hair_mane_wild');
    expect(hero.parts()).toEqual({ ...PARTS, hair: 'Hair_mane_wild' });
    hero.showParts({ ...PARTS, hair: 'Hair_mane_wild' });
    expect(changes).toBe(1);
  });
});

describe('the parts that show', () => {
  const HAIRS = ['Hair_spiky_short', 'Hair_buzz_long', 'Hair_mane_wild'];

  it('shows the chosen body, and the chosen hair on that body only', () => {
    expect(partShows(PARTS, 'BodyBoy')).toBe(true);
    expect(partShows(PARTS, 'BodyGirl')).toBe(false);
    expect(partShows(PARTS, 'Hair_spiky_short', 'BodyBoy')).toBe(true);
    expect(partShows(PARTS, 'Hair_spiky_short', 'BodyGirl')).toBe(false);
  });

  it('shows no hair piece for a chosen hair that has no mesh', () => {
    const parts = { ...PARTS, hair: 'Hair_buzz_short' };
    expect(partShows(parts, 'BodyBoy')).toBe(true);
    for (const hair of HAIRS) {
      expect(partShows(parts, hair, 'BodyBoy')).toBe(false);
    }
  });

  it('takes a hair swap to a name with no mesh with no error', () => {
    const hero = createHeroDirector(PARTS);
    expect(() => hero.showHair('Hair_buzz_short')).not.toThrow();
    expect(HAIRS.some((hair) => partShows(hero.parts(), hair, 'BodyBoy'))).toBe(false);
  });
});
