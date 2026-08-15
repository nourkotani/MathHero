// The audio module: same shape as the renderer — effects in, nothing out.
// Every sound is synthesized at runtime with WebAudio; there are no audio
// asset files (ADR 0001). Mute lives in core state; this module reads it per
// batch and holds no settings of its own.

import type { GameEffect, GameState, StreakForm } from '../core';

export interface Audio {
  onStoreUpdate(state: GameState, effects: GameEffect[]): void;
}

/** One tone in a patch: a frequency sweep with a decaying envelope. */
interface Tone {
  /** Start offset within the patch, seconds. */
  at: number;
  freq0: number;
  freq1: number;
  duration: number;
  wave: OscillatorType;
  gain: number;
}

// Synth patches keyed by effect type (and streak form for transformations) —
// adding a sound is a new row.
const PATCHES: Record<string, Tone[]> = {
  ANSWER_CORRECT: [{ at: 0, freq0: 600, freq1: 1100, duration: 0.12, wave: 'square', gain: 0.12 }],
  ANSWER_WRONG: [{ at: 0, freq0: 200, freq1: 120, duration: 0.3, wave: 'sine', gain: 0.2 }],
  'TRANSFORMED:aura': [
    { at: 0, freq0: 180, freq1: 420, duration: 0.5, wave: 'sawtooth', gain: 0.14 },
  ],
  'TRANSFORMED:surge': [
    { at: 0, freq0: 180, freq1: 640, duration: 0.6, wave: 'sawtooth', gain: 0.16 },
    { at: 0.1, freq0: 360, freq1: 1280, duration: 0.5, wave: 'triangle', gain: 0.08 },
  ],
  'TRANSFORMED:super': [
    { at: 0, freq0: 160, freq1: 900, duration: 0.9, wave: 'sawtooth', gain: 0.18 },
    { at: 0.15, freq0: 320, freq1: 1800, duration: 0.75, wave: 'triangle', gain: 0.1 },
  ],
  BLAST_FIRED: [{ at: 0, freq0: 900, freq1: 200, duration: 0.25, wave: 'sawtooth', gain: 0.1 }],
  LEVEL_UP: [
    { at: 0, freq0: 523, freq1: 523, duration: 0.15, wave: 'triangle', gain: 0.18 },
    { at: 0.15, freq0: 659, freq1: 659, duration: 0.15, wave: 'triangle', gain: 0.18 },
    { at: 0.3, freq0: 784, freq1: 784, duration: 0.15, wave: 'triangle', gain: 0.18 },
    { at: 0.45, freq0: 1047, freq1: 1047, duration: 0.4, wave: 'triangle', gain: 0.2 },
  ],
  NEW_PERSONAL_BEST: [
    { at: 0, freq0: 784, freq1: 784, duration: 0.12, wave: 'square', gain: 0.12 },
    { at: 0.12, freq0: 988, freq1: 988, duration: 0.12, wave: 'square', gain: 0.12 },
    { at: 0.24, freq0: 1175, freq1: 1175, duration: 0.3, wave: 'square', gain: 0.14 },
  ],
};

function patchFor(effect: GameEffect): Tone[] | undefined {
  if (effect.type === 'TRANSFORMED') {
    return PATCHES[`TRANSFORMED:${effect.form as StreakForm}`];
  }
  return PATCHES[effect.type];
}

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;

  // Browsers keep audio suspended until a user gesture; the first tap or
  // keypress on the Title screen unlocks it. Handled entirely in here.
  const unlock = () => {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  function play(tones: Tone[]) {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.wave;
      osc.frequency.setValueAtTime(tone.freq0, now + tone.at);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, tone.freq1),
        now + tone.at + tone.duration,
      );
      gain.gain.setValueAtTime(tone.gain, now + tone.at);
      gain.gain.exponentialRampToValueAtTime(0.001, now + tone.at + tone.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + tone.at);
      osc.stop(now + tone.at + tone.duration + 0.05);
    }
  }

  return {
    onStoreUpdate(state, effects) {
      if (state.muted) return;
      for (const effect of effects) {
        const patch = patchFor(effect);
        if (patch) play(patch);
      }
    },
  };
}
