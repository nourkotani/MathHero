import { createElement, render } from 'preact';
import '../ui/styles.css';
import { initialState } from '../core';
import type { GameEvent } from '../core';
import { createAudio } from '../audio';
import { loadSaveFile, localStorageAdapter, persistenceSubscriber, STORAGE_KEY } from '../persistence';
import { createRenderer } from '../renderer';
import { App } from '../ui/App';
import type { BestCelebration } from '../ui/App';
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
// The Results ceremonies are effect-driven: banners show while the Results
// screen that earned them is up, never inferred by diffing state (ADR 0003).
const uiRoot = document.getElementById('ui') as HTMLElement;
let newBest: BestCelebration | null = null;
let levelUps: Array<{ level: number; cosmeticLabel?: string }> = [];
store.subscribe((state, effects) => {
  for (const effect of effects) {
    if (effect.type === 'NEW_PERSONAL_BEST') {
      newBest = { skill: effect.skill, difficulty: effect.difficulty, score: effect.score };
    } else if (effect.type === 'LEVEL_UP') {
      levelUps.push(
        effect.cosmetic
          ? { level: effect.level, cosmeticLabel: effect.cosmetic.label }
          : { level: effect.level },
      );
    }
  }
  if (state.phase !== 'results') {
    newBest = null;
    levelUps = [];
  }
  render(createElement(App, { state, dispatch: store.dispatch, newBest, levelUps }), uiRoot);
});

// Synthesized sound reacts to the same effects as everything else.
const audio = createAudio();
store.subscribe((state, effects) => audio.onStoreUpdate(state, effects));

// The download adapter: hands the exported Save File to the parent as a file.
store.subscribe((_state, effects) => {
  for (const effect of effects) {
    if (effect.type === 'EXPORT_READY') {
      const blob = new Blob([effect.text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'MathHero-save.json';
      link.click();
      // Revoking immediately can cut the download short on slow devices.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }
});

// The family may have the game open twice (a second tab or window). Each
// copy loads the Save File once at startup, so a stale copy could export —
// or overwrite — old heroes. Refresh whenever another copy saves (storage)
// or this one returns to the foreground (focus AND visibilitychange: two
// windows swap focus without any visibility change).
const reloadSave = () => {
  const text = persistence.load();
  if (text !== null) store.dispatch({ type: 'SAVE_RELOADED', text });
};
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && typeof e.newValue === 'string') {
    store.dispatch({ type: 'SAVE_RELOADED', text: e.newValue });
  }
});
window.addEventListener('focus', reloadSave);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) reloadSave();
});

// Keyboard is a second way to drive the same events as the on-screen pad.
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // typing a name, not an answer
  if (e.key >= '0' && e.key <= '9') {
    store.dispatch({ type: 'DIGIT_PRESSED', digit: Number(e.key) });
    // On a Name-the-Rule Question the key IS the card tap: submit at once.
    if (store.getState().question.cards) {
      store.dispatch({ type: 'ANSWER_SUBMITTED' });
    }
  } else if (e.key === 'Backspace') {
    store.dispatch({ type: 'BACKSPACE_PRESSED' });
  } else if (e.key === 'Enter') {
    // A focused button must act as that button (its click fires on Enter);
    // dispatching submit as well would double-act on one keypress.
    if (e.target instanceof HTMLButtonElement) return;
    store.dispatch({ type: 'ANSWER_SUBMITTED' });
  }
});

// Animation loop. Game time enters the core only as TICK events stamped from
// the injected clock; rendering time stays wall-clock so animations play even
// under the manual test clock. Ticks are throttled — the countdown only needs
// a few updates a second, and re-rendering the UI every frame is pure waste.
const TICK_INTERVAL_MS = 250;
let lastFrame = performance.now();
let lastTickAt = Number.NEGATIVE_INFINITY;
function loop(now: number) {
  const dt = now - lastFrame;
  lastFrame = now;
  const gameNow = clock.now();
  if (gameNow - lastTickAt >= TICK_INTERVAL_MS) {
    lastTickAt = gameNow;
    store.dispatch({ type: 'TICK', now: gameNow });
  }
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
