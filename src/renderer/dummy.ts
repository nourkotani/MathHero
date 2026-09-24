// The Training Dummy's director: a cosmetic opponent. It reacts — varied
// recoils on hits, a launch and a drop-back-in on full-power blasts, a
// cheeky taunt when the hero flinches — but never affects scoring. Its body
// and every clip are baked in Blender (scripts/blender/training_dummy.py,
// ADR 0007) and shown by the React component in src/scene/TrainingDummy.tsx
// (ADR 0009). This module only picks which clip plays. Each call comes from
// an effect (ADR 0003) or from a strike that touches the Dummy's hurtbox.

/** The hit clips, in variety order. Wilder ones wait for a transformed hero. */
const HIT_CLIPS: ReadonlyArray<{ clip: string; strongOnly?: boolean }> = [
  { clip: 'HitBack' },
  { clip: 'HitTwist' },
  { clip: 'HitSpin', strongOnly: true },
];

/** Airborne clips: the Dummy is off its spot, so hits and taunts wait. */
const AIRBORNE = new Set(['Launch', 'Recover']);

export interface Dummy {
  /** A hit lands: next clip from the variety rotation; transformed heroes
   *  (strong) unlock the wilder entries. */
  hit(strong: boolean): void;
  /** A full-power blast lands: fly out of the frame, then drop back in. */
  launch(): void;
  /** The hero flinched at a wrong answer: a cheeky wiggle. */
  taunt(): void;
}

/** One clip request. The count makes a repeat of the same clip a new request. */
export interface DummyCue {
  clip: string;
  count: number;
}

export interface DummyDirector extends Dummy {
  /** The clip the Dummy plays now. */
  cue(): DummyCue;
  /** The component calls this when a one-shot clip reaches its end. */
  finished(clip: string): void;
  /** The component listens here for each new cue. */
  onCue(listener: (cue: DummyCue) => void): void;
}

export function createDummyDirector(): DummyDirector {
  let current: DummyCue = { clip: 'Idle', count: 0 };
  let listener: ((cue: DummyCue) => void) | null = null;
  let variety = 0;

  function play(clip: string) {
    current = { clip, count: current.count + 1 };
    listener?.(current);
  }

  const airborne = () => AIRBORNE.has(current.clip);

  return {
    hit(strong) {
      if (airborne()) return;
      const pool = HIT_CLIPS.filter((h) => strong || !h.strongOnly);
      const pick = pool[variety++ % pool.length];
      if (pick) play(pick.clip);
    },
    launch() {
      play('Launch');
    },
    taunt() {
      if (!airborne()) play('Taunt');
    },
    cue: () => current,
    finished(clip) {
      // Only the clip that is playing may hand on: a clip that was already
      // fading out can still reach its end during the blend, and must not
      // cut off the clip that replaced it (a Launch cut off by a Recover).
      if (clip !== current.clip) return;
      play(clip === 'Launch' ? 'Recover' : 'Idle');
    },
    onCue(next) {
      listener = next;
    },
  };
}
