import { createElement, render } from 'preact';
import '../ui/styles.css';
import { initialState } from '../core';
import type { GameEvent } from '../core';
import { loadSaveFile, localStorageAdapter, persistenceSubscriber } from '../persistence';
import { createRenderer } from '../renderer';
import { App } from '../ui/App';
import { manualClock, realClock } from './clock';
import type { ManualClock } from './clock';
import { createStore } from './store';

interface TestHook {
  advance(ms: number): void;
  dispatch(event: GameEvent): void;
  getState(): unknown;
}

declare global {
  interface Window {
    __mathhero?: TestHook;
  }
}

const params = new URLSearchParams(window.location.search);
const testMode = params.has('testClock');

const seedParam = params.get('seed');
const seed = seedParam !== null ? Number(seedParam) : Date.now() >>> 0;

const clock = testMode ? manualClock() : realClock();
const persistence = localStorageAdapter();
const store = createStore(initialState({ seed, save: loadSaveFile(persistence) }));
store.subscribe(persistenceSubscriber(persistence));

// Renderer subscribes for effects; its frame loop runs below.
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
store.subscribe((state, effects) => renderer.onStoreUpdate(state, effects));

// Preact owns the DOM overlay; it re-renders from core state on every dispatch.
// The personal-best celebration is effect-driven: the banner shows while the
// Results screen that earned it is up, never inferred by diffing state.
const uiRoot = document.getElementById('ui') as HTMLElement;
let newBest: { difficulty: string; score: number } | null = null;
store.subscribe((state, effects) => {
  for (const effect of effects) {
    if (effect.type === 'NEW_PERSONAL_BEST') {
      newBest = { difficulty: effect.difficulty, score: effect.score };
    }
  }
  if (state.phase !== 'results') newBest = null;
  render(createElement(App, { state, dispatch: store.dispatch, newBest }), uiRoot);
});

// Keyboard is a second way to drive the same events as the on-screen pad.
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // typing a name, not an answer
  if (e.key >= '0' && e.key <= '9') {
    store.dispatch({ type: 'DIGIT_PRESSED', digit: Number(e.key) });
  } else if (e.key === 'Backspace') {
    store.dispatch({ type: 'BACKSPACE_PRESSED' });
  } else if (e.key === 'Enter') {
    store.dispatch({ type: 'ANSWER_SUBMITTED' });
  }
});

// Animation loop. Game time enters the core only as TICK events stamped from
// the injected clock; rendering time stays wall-clock so animations play even
// under the manual test clock.
let lastFrame = performance.now();
function loop(now: number) {
  const dt = now - lastFrame;
  lastFrame = now;
  store.dispatch({ type: 'TICK', now: clock.now() });
  renderer.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Flow tests drive game time through this hook (?testClock) instead of waiting.
if (testMode) {
  const manual = clock as ManualClock;
  window.__mathhero = {
    advance(ms) {
      manual.advance(ms);
      store.dispatch({ type: 'TICK', now: manual.now() });
    },
    dispatch: store.dispatch,
    getState: store.getState,
  };
}
