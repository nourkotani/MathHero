// The shared animation helper every juice behavior runs on: a Clip is a
// fixed-duration pose function of normalized time, and a Channel is a
// single-slot player where a new clip replaces the current one. Attacks,
// staggers, Training Dummy reactions, and camera punches are all clips —
// adding a new move is a new clip, not new machinery.

export interface Clip {
  /** Seconds of render-time the clip runs for. */
  duration: number;
  /** Pose the world for progress t (0→1); elapsed is scene time for wobbles. */
  apply(t: number, elapsed: number): void;
  /** Runs once when the clip completes (not when it's replaced). */
  onDone?(): void;
}

export interface Channel {
  /** Start a clip, replacing whatever was playing. Optional label for queries. */
  play(clip: Clip, label?: string): void;
  playing(): boolean;
  /** The label of the active clip, or null. */
  label(): string | null;
  update(dt: number, elapsed: number): void;
}

export function createChannel(): Channel {
  let clip: Clip | null = null;
  let clipLabel: string | null = null;
  let time = 0;

  return {
    play(next, label) {
      clip = next;
      clipLabel = label ?? null;
      time = 0;
    },
    playing: () => clip !== null,
    label: () => clipLabel,
    update(dt, elapsed) {
      if (clip === null) return;
      time += dt;
      const t = Math.min(1, time / clip.duration);
      clip.apply(t, elapsed);
      if (t >= 1) {
        const done = clip.onDone;
        clip = null;
        clipLabel = null;
        done?.();
      }
    },
  };
}
