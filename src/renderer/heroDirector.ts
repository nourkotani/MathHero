// The hero's director (ADR 0009): which parts of the Blender hero show, and
// which authored clip plays. The React component src/scene/Hero.tsx shows
// the parts and plays the clips; this module only decides. The rig in
// hero.ts and the reactions call it; each call comes from an effect
// (ADR 0003).

/** The named parts of hero.glb that show: one body, one garment, one hair. */
export interface HeroParts {
  body: string;
  garment: string;
  hair: string;
}

/** One clip request. The count makes a repeat of the same clip a new request. */
export interface HeroCue {
  clip: string;
  count: number;
}

export interface HeroDirector {
  /**
   * Play an authored clip once, then return to Idle. queued: wait for the
   * clip already playing to end first (a charge never cuts off a strike).
   * Before the model decodes, no clip is known and every call is ignored.
   */
  play(clip: string, queued?: boolean): void;
  /** The component calls this when a one-shot clip reaches its end. */
  finished(clip: string): void;
  /** The parts that the appearance and the Form choose. */
  showParts(parts: HeroParts): void;
  /** Swap the hair alone (the Landmark scene's moment of ascension). */
  showHair(hair: string): void;
  cue(): HeroCue;
  parts(): HeroParts;
  /** The component tells the director which clips the model carries. */
  ready(clips: readonly string[]): void;
  /** The component listens here for each change of cue or parts. */
  onChange(listener: () => void): void;
}

export function createHeroDirector(parts: HeroParts): HeroDirector {
  let current: HeroCue = { clip: 'Idle', count: 0 };
  let shown = parts;
  let next: string | null = null;
  let known = new Set<string>();
  let listener: (() => void) | null = null;

  function start(clip: string) {
    current = { clip, count: current.count + 1 };
    listener?.();
  }

  return {
    play(clip, queued = false) {
      if (!known.has(clip)) return;
      if (queued && current.clip !== 'Idle') {
        next = clip;
        return;
      }
      next = null;
      start(clip);
    },
    finished(clip) {
      // Only the clip that is playing may hand on: a clip that was already
      // fading out can still reach its end during the blend, and must not
      // cut off the clip that replaced it.
      if (clip !== current.clip) return;
      const then = next !== null && known.has(next) ? next : 'Idle';
      next = null;
      start(then);
    },
    showParts(parts) {
      const same = (Object.keys(parts) as Array<keyof HeroParts>).every(
        (k) => parts[k] === shown[k],
      );
      if (same) return;
      shown = { ...parts };
      listener?.();
    },
    showHair(hair) {
      if (hair === shown.hair) return;
      shown = { ...shown, hair };
      listener?.();
    },
    cue: () => current,
    parts: () => shown,
    ready(clips) {
      known = new Set(clips);
    },
    onChange(change) {
      listener = change;
    },
  };
}
