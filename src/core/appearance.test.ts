import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, initialState, parseSaveFile, SAVE_FILE_VERSION, update } from './index';
import type { HeroAppearance } from './index';
import { dispatchAll, TEST_APPEARANCE, TEST_COLORS } from './test-helpers';

const CUSTOM: HeroAppearance = {
  body: 'boy',
  hairStyle: 'flame',
  hairLength: 'long',
  garment: 'armor',
  skinTone: 'deep',
};

describe('the creation draft', () => {
  it('opens with defaults, previews changes, and clears on cancel', () => {
    let state = update(initialState({ seed: 1 }), { type: 'HERO_CREATION_OPENED' }).state;
    expect(state.draft?.appearance).toEqual(DEFAULT_APPEARANCE);

    state = update(state, { type: 'DRAFT_CHANGED', colors: TEST_COLORS, appearance: CUSTOM }).state;
    expect(state.draft).toEqual({ colors: TEST_COLORS, appearance: CUSTOM });

    state = update(state, { type: 'CREATION_CANCELLED' }).state;
    expect(state.draft).toBeNull();
  });

  it('rejects invalid draft values and unknown appearance ids on creation', () => {
    const opened = update(initialState({ seed: 1 }), { type: 'HERO_CREATION_OPENED' }).state;
    const bad = { ...CUSTOM, hairStyle: 'mohawk' } as unknown as HeroAppearance;

    expect(
      update(opened, { type: 'DRAFT_CHANGED', colors: TEST_COLORS, appearance: bad }).state,
    ).toEqual(opened);
    expect(
      update(opened, { type: 'PLAYER_CREATED', name: 'Zara', colors: TEST_COLORS, appearance: bad })
        .state,
    ).toEqual(opened);
  });

  it('the created hero keeps the chosen appearance and it round-trips the Save File', () => {
    const state = dispatchAll(initialState({ seed: 1 }), [
      { type: 'HERO_CREATION_OPENED' },
      { type: 'PLAYER_CREATED', name: 'Milo', colors: TEST_COLORS, appearance: CUSTOM },
    ]);
    expect(state.players[0]?.appearance).toEqual(CUSTOM);
    expect(state.draft).toBeNull();
  });
});

describe('appearance migration', () => {
  it('v6 Save Files gain the classic look', () => {
    const v6 = JSON.stringify({
      version: 6,
      players: [
        {
          id: 'p1',
          name: 'Zara',
          colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
          roundsPlayed: 1,
          xp: 50,
          bests: {},
          factStats: {},
        },
      ],
      nextPlayerId: 2,
      lastExportAt: null,
      muted: false,
    });
    const migrated = parseSaveFile(v6);
    expect(migrated?.version).toBe(SAVE_FILE_VERSION);
    expect(migrated?.players[0]?.appearance).toEqual({
      body: 'boy',
      hairStyle: 'spiky',
      hairLength: 'short',
      garment: 'gi',
      skinTone: 'tan',
    });
  });

  it('v7 Save Files gain the classic tan skin tone', () => {
    const v7 = JSON.stringify({
      version: 7,
      players: [
        {
          id: 'p1',
          name: 'Zara',
          colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
          appearance: { body: 'girl', hairStyle: 'ponytail', hairLength: 'long', garment: 'cape' },
          roundsPlayed: 1,
          xp: 50,
          bests: {},
          factStats: {},
        },
      ],
      nextPlayerId: 2,
      lastExportAt: null,
      muted: false,
    });
    const migrated = parseSaveFile(v7);
    expect(migrated?.version).toBe(SAVE_FILE_VERSION);
    expect(migrated?.players[0]?.appearance).toEqual({
      body: 'girl',
      hairStyle: 'ponytail',
      hairLength: 'long',
      garment: 'cape',
      skinTone: 'tan',
    });
  });

  it('rejects documents with unknown appearance ids', () => {
    const doc = JSON.stringify({
      version: SAVE_FILE_VERSION,
      players: [
        {
          id: 'p1',
          name: 'Zara',
          colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
          appearance: {
            body: 'alien',
            hairStyle: 'spiky',
            hairLength: 'short',
            garment: 'gi',
            skinTone: 'tan',
          },
          roundsPlayed: 0,
          xp: 0,
          bests: {},
          factStats: {},
        },
      ],
      nextPlayerId: 2,
      lastExportAt: null,
      muted: false,
    });
    expect(parseSaveFile(doc)).toBeNull();
  });

  it('TEST_APPEARANCE matches the creation default', () => {
    expect(TEST_APPEARANCE).toEqual(DEFAULT_APPEARANCE);
  });
});
