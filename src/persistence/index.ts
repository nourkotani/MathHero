// The persistence seam: load and save the serialized Save File document.
// Two adapters — localStorage for the app, in-memory for tests. Nothing else
// in the codebase may touch localStorage.

import { buildSaveFile, parseSaveFile, serializeSaveFile } from '../core';
import type { GameEffect, GameState, SaveFile } from '../core';

export interface PersistenceAdapter {
  load(): string | null;
  save(text: string): void;
}

const STORAGE_KEY = 'mathhero-save';

export function localStorageAdapter(): PersistenceAdapter {
  return {
    load() {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    save(text) {
      try {
        localStorage.setItem(STORAGE_KEY, text);
      } catch {
        // Persistence is best-effort; the export ticket gives the parent a
        // durable copy.
      }
    },
  };
}

export function memoryAdapter(): PersistenceAdapter {
  let stored: string | null = null;
  return {
    load: () => stored,
    save(text) {
      stored = text;
    },
  };
}

/** Load and validate/migrate whatever the adapter holds; null if absent or invalid. */
export function loadSaveFile(adapter: PersistenceAdapter): SaveFile | null {
  const text = adapter.load();
  return text === null ? null : parseSaveFile(text);
}

/** Store subscriber: writes the Save File whenever the core says it changed. */
export function persistenceSubscriber(adapter: PersistenceAdapter) {
  return (state: GameState, effects: GameEffect[]): void => {
    if (effects.some((e) => e.type === 'SAVE_FILE_CHANGED')) {
      adapter.save(serializeSaveFile(buildSaveFile(state)));
    }
  };
}
