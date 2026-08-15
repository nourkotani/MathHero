import { describe, expect, it } from 'vitest';
import {
  buildSaveFile,
  initialState,
  parseSaveFile,
  SAVE_FILE_VERSION,
  serializeSaveFile,
  update,
} from './index';

describe('the mute toggle', () => {
  it('flips and persists through the Save File', () => {
    const state = initialState({ seed: 81 });
    expect(state.muted).toBe(false);

    const result = update(state, { type: 'MUTE_TOGGLED' });
    expect(result.state.muted).toBe(true);
    expect(result.effects).toEqual([{ type: 'SAVE_FILE_CHANGED' }]);

    const restored = initialState({
      seed: 2,
      save: parseSaveFile(serializeSaveFile(buildSaveFile(result.state))),
    });
    expect(restored.muted).toBe(true);

    expect(update(result.state, { type: 'MUTE_TOGGLED' }).state.muted).toBe(false);
  });

  it('v5 Save Files migrate to v6 unmuted', () => {
    const v5 = JSON.stringify({
      version: 5,
      players: [],
      nextPlayerId: 1,
      lastExportAt: null,
    });
    const migrated = parseSaveFile(v5);
    expect(migrated?.version).toBe(SAVE_FILE_VERSION);
    expect(migrated?.muted).toBe(false);
  });
});
