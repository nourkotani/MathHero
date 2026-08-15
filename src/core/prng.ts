// Pure mulberry32: PRNG state lives in GameState and every draw returns the
// next state instead of mutating anything.

export interface Draw {
  /** Uniform in [0, 1). */
  value: number;
  state: number;
}

export function seedPrng(seed: number): number {
  return seed >>> 0;
}

export function nextRandom(state: number): Draw {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/** Uniform integer in [min, max], inclusive on both ends. */
export function nextInt(state: number, min: number, max: number): { value: number; state: number } {
  const draw = nextRandom(state);
  return { value: min + Math.floor(draw.value * (max - min + 1)), state: draw.state };
}
