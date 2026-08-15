// The injected clock: the only place the app reads real time. In test mode
// (?testClock query flag) time only moves when the flow test advances it.

export interface Clock {
  now(): number;
}

export function realClock(): Clock {
  return { now: () => performance.now() };
}

export interface ManualClock extends Clock {
  advance(ms: number): void;
}

export function manualClock(): ManualClock {
  let time = 0;
  return {
    now: () => time,
    advance(ms) {
      time += ms;
    },
  };
}
