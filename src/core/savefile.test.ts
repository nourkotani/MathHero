import { describe, expect, it } from 'vitest';
import { parseSaveFile, SAVE_FILE_VERSION, serializeSaveFile } from './index';

// The per-Skill Save File seam: the v8 → v9 migration and the validation
// that guards the per-Skill shapes. Everything goes through parseSaveFile —
// the one codepath from bytes to a valid document.

const COLORS = { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' };
const APPEARANCE = {
  body: 'boy',
  hairStyle: 'spiky',
  hairLength: 'short',
  garment: 'gi',
  skinTone: 'tan',
};

const v8Player = {
  id: 'p1',
  name: 'Zara',
  colors: COLORS,
  appearance: APPEARANCE,
  roundsPlayed: 12,
  xp: 3400,
  bests: { easy: 120, hard: 300 },
  factStats: {
    '3x7': [
      { correct: true, ms: 1500 },
      { correct: false, ms: 4000 },
    ],
  },
};

const v8Doc = (player: object = v8Player) =>
  JSON.stringify({
    version: 8,
    players: [player],
    nextPlayerId: 2,
    lastExportAt: null,
    muted: false,
  });

describe('v8 → v9 migration: mastery & bests become per-Skill', () => {
  it('moves everything a hero earned under Multiply and starts Divide fresh', () => {
    const save = parseSaveFile(v8Doc());
    expect(save?.version).toBe(SAVE_FILE_VERSION);
    const player = save?.players[0];
    expect(player?.bests).toEqual({ multiply: { easy: 120, hard: 300 }, divide: {} });
    expect(player?.factStats).toEqual({ multiply: v8Player.factStats, divide: {} });
    // Nothing else about the hero moves.
    expect(player).toMatchObject({ name: 'Zara', xp: 3400, roundsPlayed: 12 });
  });

  it('carries the oldest documents all the way to per-Skill shapes', () => {
    const v1 = JSON.stringify({
      version: 1,
      players: [{ id: 'p1', name: 'Zara', colors: COLORS, roundsPlayed: 3 }],
      nextPlayerId: 2,
    });
    const save = parseSaveFile(v1);
    expect(save?.version).toBe(SAVE_FILE_VERSION);
    expect(save?.players[0]?.bests).toEqual({ multiply: {}, divide: {} });
    expect(save?.players[0]?.factStats).toEqual({ multiply: {}, divide: {} });
  });
});

describe('per-Skill validation', () => {
  const v9Player = (overrides: object = {}) => ({
    ...v8Player,
    bests: { multiply: { easy: 120 }, divide: {} },
    factStats: { multiply: v8Player.factStats, divide: {} },
    ...overrides,
  });
  const v9Doc = (player: object = v9Player()) =>
    JSON.stringify(
      {
        version: SAVE_FILE_VERSION,
        players: [player],
        nextPlayerId: 2,
        lastExportAt: null,
        muted: false,
      },
      null,
      2,
    );

  it('accepts a well-formed v9 document', () => {
    expect(parseSaveFile(v9Doc())).not.toBeNull();
  });

  it('rejects flat pre-Skill shapes claiming to be v9', () => {
    expect(parseSaveFile(v9Doc(v9Player({ bests: { easy: 120 } })))).toBeNull();
    expect(parseSaveFile(v9Doc(v9Player({ factStats: { '3x7': [] } })))).toBeNull();
  });

  it('rejects documents missing a Skill slice', () => {
    expect(parseSaveFile(v9Doc(v9Player({ bests: { multiply: {} } })))).toBeNull();
    expect(parseSaveFile(v9Doc(v9Player({ factStats: { divide: {} } })))).toBeNull();
  });

  it('rejects unknown Skill keys', () => {
    expect(
      parseSaveFile(v9Doc(v9Player({ bests: { multiply: {}, divide: {}, laser: {} } }))),
    ).toBeNull();
  });

  it('rejects malformed slices as a whole — never partially applied', () => {
    expect(
      parseSaveFile(v9Doc(v9Player({ bests: { multiply: { easy: Number.NaN }, divide: {} } }))),
    ).toBeNull();
    expect(
      parseSaveFile(v9Doc(v9Player({ factStats: { multiply: { '3x7': 'nope' }, divide: {} } }))),
    ).toBeNull();
    expect(
      parseSaveFile(v9Doc(v9Player({ bests: { multiply: null, divide: {} } }))),
    ).toBeNull();
  });

  it('round-trips a valid v9 document byte-for-byte', () => {
    const text = v9Doc();
    const save = parseSaveFile(text);
    expect(save).not.toBeNull();
    if (save) expect(serializeSaveFile(save)).toBe(text);
  });
});
