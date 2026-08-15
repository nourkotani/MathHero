// One store wires the whole app: dispatch feeds the core's update();
// subscribers (Preact render, three.js renderer, later audio and persistence)
// receive (state, effects) and never diff state to infer moments (ADR 0003).

import { update } from '../core';
import type { GameEffect, GameEvent, GameState } from '../core';

export type Subscriber = (state: GameState, effects: GameEffect[]) => void;

export interface Store {
  getState(): GameState;
  dispatch(event: GameEvent): void;
  subscribe(subscriber: Subscriber): void;
}

export function createStore(initial: GameState): Store {
  let state = initial;
  const subscribers: Subscriber[] = [];
  return {
    getState: () => state,
    dispatch(event) {
      const result = update(state, event);
      state = result.state;
      for (const subscriber of subscribers) {
        subscriber(state, result.effects);
      }
    },
    subscribe(subscriber) {
      subscribers.push(subscriber);
      subscriber(state, []);
    },
  };
}
