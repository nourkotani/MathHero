import { describe, expect, it } from 'vitest';
import {
  BACKUP_REMINDER_MS,
  backupReminderDue,
  buildSaveFile,
  initialState,
  parseSaveFile,
  SAVE_FILE_VERSION,
  serializeSaveFile,
  update,
} from './index';
import type { GameEffect } from './index';
import { dispatchAll, preRound } from './test-helpers';

const DAY = 24 * 60 * 60 * 1000;

describe('export', () => {
  it('hands out exactly the persisted Save File document and stamps the export time', () => {
    let state = dispatchAll(preRound(71, 'Zara'), [
      { type: 'TITLE_OPENED' },
      { type: 'TICK', now: 5000 },
    ]);
    const result = update(state, { type: 'SAVE_EXPORTED' });
    state = result.state;

    expect(state.lastExportAt).toBe(5000);
    const exportReady = result.effects.find(
      (e): e is Extract<GameEffect, { type: 'EXPORT_READY' }> => e.type === 'EXPORT_READY',
    );
    expect(exportReady).toBeDefined();
    // Byte-for-byte the same document persistence writes.
    expect(exportReady?.text).toBe(serializeSaveFile(buildSaveFile(state)));
    expect(result.effects.at(-1)?.type).toBe('SAVE_FILE_CHANGED');

    const parsed = parseSaveFile(exportReady?.text ?? '');
    expect(parsed?.version).toBe(SAVE_FILE_VERSION);
    expect(parsed?.players[0]?.name).toBe('Zara');
  });
});

describe('import', () => {
  it('replaces progress all-or-nothing with a valid document', () => {
    const exported = update(dispatchAll(preRound(72, 'Zara'), [{ type: 'TITLE_OPENED' }]), {
      type: 'SAVE_EXPORTED',
    });
    const text = (
      exported.effects.find((e) => e.type === 'EXPORT_READY') as { text: string } | undefined
    )?.text;

    // A different family imports the file.
    const fresh = initialState({ seed: 1 });
    const result = update(fresh, { type: 'SAVE_IMPORTED', text: text ?? '' });
    expect(result.state.players.map((p) => p.name)).toEqual(['Zara']);
    expect(result.state.activePlayerId).toBeNull();
    expect(result.effects.map((e) => e.type)).toEqual(['IMPORT_SUCCEEDED', 'SAVE_FILE_CHANGED']);
  });

  it('rejects invalid files with zero state change', () => {
    const state = dispatchAll(preRound(73, 'Zara'), [{ type: 'TITLE_OPENED' }]);
    for (const bad of ['garbage', '{}', JSON.stringify({ version: 999 })]) {
      const result = update(state, { type: 'SAVE_IMPORTED', text: bad });
      expect(result.state).toEqual(state);
      expect(result.effects).toEqual([{ type: 'IMPORT_REJECTED' }]);
    }
  });
});

describe('the 7-day backup reminder', () => {
  it('starts its clock at first play and fires after 7 quiet days', () => {
    // Creating the first hero at now = 1000 sets the baseline.
    let state = dispatchAll(initialState({ seed: 74 }), [
      { type: 'TICK', now: 1000 },
      { type: 'HERO_CREATION_OPENED' },
      {
        type: 'PLAYER_CREATED',
        name: 'Zara',
        colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
      },
    ]);
    expect(backupReminderDue(state)).toBe(false);

    state = update(state, { type: 'TICK', now: 1000 + 6 * DAY }).state;
    expect(backupReminderDue(state)).toBe(false);

    state = update(state, { type: 'TICK', now: 1000 + BACKUP_REMINDER_MS + 1 }).state;
    expect(backupReminderDue(state)).toBe(true);

    // Exporting clears it.
    state = update(state, { type: 'SAVE_EXPORTED' }).state;
    expect(backupReminderDue(state)).toBe(false);
  });

  it('never nags an empty Save File', () => {
    const state = update(initialState({ seed: 75 }), { type: 'TICK', now: 30 * DAY }).state;
    expect(backupReminderDue(state)).toBe(false);
  });
});
