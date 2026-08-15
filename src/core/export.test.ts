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

describe('cross-tab Save File reload', () => {
  const otherTabDoc = (names: string[], firstId = 1) =>
    JSON.stringify({
      version: SAVE_FILE_VERSION,
      players: names.map((name, i) => ({
        id: `p${firstId + i}`,
        name,
        colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
        appearance: {
          body: 'boy',
          hairStyle: 'spiky',
          hairLength: 'short',
          garment: 'gi',
          skinTone: 'tan',
        },
        roundsPlayed: 0,
        xp: 0,
        bests: {},
        factStats: {},
      })),
      nextPlayerId: names.length + 1,
      lastExportAt: 4321,
      muted: true,
    });

  it('adopts another tab\'s document silently, so exports are never stale', () => {
    const state = dispatchAll(preRound(81, 'Zara'), [{ type: 'TITLE_OPENED' }]);
    const result = update(state, { type: 'SAVE_RELOADED', text: otherTabDoc(['Zara', 'Kai']) });
    expect(result.state.players.map((p) => p.name)).toEqual(['Zara', 'Kai']);
    expect(result.state.nextPlayerId).toBe(3);
    expect(result.state.lastExportAt).toBe(4321);
    expect(result.state.muted).toBe(true);
    // No SAVE_FILE_CHANGED: echoing storage back would ping-pong between tabs.
    expect(result.effects).toEqual([]);

    const exported = update(result.state, { type: 'SAVE_EXPORTED' });
    const text = (
      exported.effects.find((e) => e.type === 'EXPORT_READY') as { text: string } | undefined
    )?.text;
    expect(parseSaveFile(text ?? '')?.players.map((p) => p.name)).toEqual(['Zara', 'Kai']);
  });

  it('ignores invalid documents', () => {
    const state = dispatchAll(preRound(82, 'Zara'), [{ type: 'TITLE_OPENED' }]);
    const result = update(state, { type: 'SAVE_RELOADED', text: 'garbage' });
    expect(result.state).toEqual(state);
    expect(result.effects).toEqual([]);
  });

  it('never reloads mid-Round — the Round is mutating player stats', () => {
    const state = dispatchAll(preRound(83, 'Zara'), [{ type: 'ROUND_STARTED' }]);
    const result = update(state, { type: 'SAVE_RELOADED', text: otherTabDoc(['Zara', 'Kai']) });
    expect(result.state).toEqual(state);
  });

  it('never drops the selected hero', () => {
    const state = preRound(84, 'Zara'); // Zara is p1 and selected.
    const result = update(state, { type: 'SAVE_RELOADED', text: otherTabDoc(['Milo'], 2) });
    expect(result.state).toEqual(state);
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
        appearance: {
          body: 'girl',
          hairStyle: 'ponytail',
          hairLength: 'long',
          garment: 'gi',
          skinTone: 'golden',
        },
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

  it('a migrated save with heroes but no export baseline starts its clock at the first Round', () => {
    const v3 = JSON.stringify({
      version: 3,
      players: [
        {
          id: 'p1',
          name: 'Zara',
          colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
          roundsPlayed: 3,
          xp: 250,
          bests: {},
        },
      ],
      nextPlayerId: 2,
    });
    // Also covers the previously untested v3→v4 and v4→v5 migrations.
    const save = parseSaveFile(v3);
    expect(save?.version).toBe(SAVE_FILE_VERSION);
    expect(save?.players[0]?.factStats).toEqual({});
    expect(save?.lastExportAt).toBeNull();

    let state = dispatchAll(initialState({ seed: 76, save }), [
      { type: 'TICK', now: 1000 },
      { type: 'PLAYER_SELECTED', id: 'p1' },
      { type: 'ROUND_STARTED' },
      { type: 'TICK', now: 999_999 },
    ]);
    expect(state.lastExportAt).toBe(999_999);
    state = update(state, { type: 'TICK', now: 999_999 + BACKUP_REMINDER_MS + 1 }).state;
    expect(backupReminderDue(state)).toBe(true);
  });
});

describe('Save File validation hardening', () => {
  const validPlayer = {
    id: 'p1',
    name: 'Zara',
    colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
    appearance: {
      body: 'girl',
      hairStyle: 'flame',
      hairLength: 'long',
      garment: 'cape',
      skinTone: 'bronze',
    },
    roundsPlayed: 1,
    xp: 100,
    bests: {},
    factStats: {},
  };
  const doc = (overrides: object, player: object = validPlayer) =>
    JSON.stringify({
      version: SAVE_FILE_VERSION,
      players: [player],
      nextPlayerId: 2,
      lastExportAt: null,
      muted: false,
      ...overrides,
    });

  it('rejects non-finite or negative numbers', () => {
    expect(parseSaveFile(doc({}, { ...validPlayer, xp: Number.NaN }))).toBeNull();
    expect(parseSaveFile(doc({}, { ...validPlayer, roundsPlayed: -1 }))).toBeNull();
    expect(parseSaveFile(doc({ nextPlayerId: Number.POSITIVE_INFINITY }))).toBeNull();
    expect(parseSaveFile(doc({}, { ...validPlayer, bests: { easy: Number.NaN } }))).toBeNull();
  });

  it('normalizes imported names the way creation does', () => {
    const parsed = parseSaveFile(doc({}, { ...validPlayer, name: '  Zara  '.padEnd(60, 'x') }));
    expect(parsed?.players[0]?.name.length).toBeLessThanOrEqual(20);
    expect(parseSaveFile(doc({}, { ...validPlayer, name: '   ' }))).toBeNull();
  });

  it('never lets a stale counter mint duplicate player ids', () => {
    const parsed = parseSaveFile(doc({ nextPlayerId: 1 }, { ...validPlayer, id: 'p7' }));
    expect(parsed?.nextPlayerId).toBe(8);
  });
});
