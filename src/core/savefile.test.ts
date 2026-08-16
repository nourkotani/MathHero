import { describe, expect, it } from 'vitest';
import { parseSaveFile, SAVE_FILE_VERSION, serializeSaveFile } from './index';
import { perSkill } from './test-helpers';

// The per-Skill Save File seam: the historical migrations (v8 flat shapes →
// v9 per-Skill → v10 Machine) and the validation that guards the per-Skill
// shapes. Everything goes through parseSaveFile — the one codepath from
// bytes to a valid document. Historical fixtures pin their version number;
// only the current-version fixtures ride SAVE_FILE_VERSION.

const COLORS = { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' };
const APPEARANCE = {
  body: 'boy',
  hairStyle: 'spiky',
  hairLength: 'short',
  garment: 'gi',
  skinTone: 'tan',
};

const EARNED_STATS = {
  '3x7': [
    { correct: true, ms: 1500 },
    { correct: false, ms: 4000 },
  ],
};

const v8Player = {
  id: 'p1',
  name: 'Zara',
  colors: COLORS,
  appearance: APPEARANCE,
  roundsPlayed: 12,
  xp: 3400,
  bests: { easy: 120, hard: 300 },
  factStats: EARNED_STATS,
};

const docOf = (version: number, player: object) =>
  JSON.stringify({ version, players: [player], nextPlayerId: 2, lastExportAt: null, muted: false });

describe('historical migrations reach the current per-Skill shapes', () => {
  it('v8 flat shapes: everything earned lands under Multiply; later Skills start fresh', () => {
    const save = parseSaveFile(docOf(8, v8Player));
    expect(save?.version).toBe(SAVE_FILE_VERSION);
    const player = save?.players[0];
    expect(player?.bests).toEqual(perSkill({ multiply: { easy: 120, hard: 300 } }));
    expect(player?.factStats).toEqual(perSkill({ multiply: EARNED_STATS }));
    // Nothing else about the hero moves.
    expect(player).toMatchObject({ name: 'Zara', xp: 3400, roundsPlayed: 12 });
  });

  it('v9 two-Skill documents: Multiply and Divide keep their records; Machine starts fresh', () => {
    const v9Player = {
      ...v8Player,
      bests: { multiply: { easy: 120 }, divide: { medium: 40 } },
      factStats: { multiply: EARNED_STATS, divide: { '2x9': [{ correct: true, ms: 900 }] } },
    };
    const player = parseSaveFile(docOf(9, v9Player))?.players[0];
    expect(player?.bests).toEqual(
      perSkill({ multiply: { easy: 120 }, divide: { medium: 40 } }),
    );
    expect(player?.factStats).toEqual(
      perSkill<object>({ multiply: EARNED_STATS, divide: { '2x9': [{ correct: true, ms: 900 }] } }),
    );
  });

  it('carries the oldest documents all the way to per-Skill shapes', () => {
    const v1 = JSON.stringify({
      version: 1,
      players: [{ id: 'p1', name: 'Zara', colors: COLORS, roundsPlayed: 3 }],
      nextPlayerId: 2,
    });
    const save = parseSaveFile(v1);
    expect(save?.version).toBe(SAVE_FILE_VERSION);
    expect(save?.players[0]?.bests).toEqual(perSkill());
    expect(save?.players[0]?.factStats).toEqual(perSkill());
  });
});

describe('per-Skill validation', () => {
  const currentPlayer = (overrides: object = {}) => ({
    ...v8Player,
    bests: perSkill({ multiply: { easy: 120 } }),
    factStats: perSkill({ multiply: EARNED_STATS }),
    ...overrides,
  });
  const currentDoc = (player: object = currentPlayer()) =>
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

  it('accepts a well-formed current document', () => {
    expect(parseSaveFile(currentDoc())).not.toBeNull();
  });

  it('rejects flat pre-Skill shapes claiming to be current', () => {
    expect(parseSaveFile(currentDoc(currentPlayer({ bests: { easy: 120 } })))).toBeNull();
    expect(parseSaveFile(currentDoc(currentPlayer({ factStats: { '3x7': [] } })))).toBeNull();
  });

  it('rejects documents missing a Skill slice', () => {
    expect(
      parseSaveFile(currentDoc(currentPlayer({ bests: { multiply: {}, divide: {} } }))),
    ).toBeNull();
    expect(parseSaveFile(currentDoc(currentPlayer({ factStats: { divide: {} } })))).toBeNull();
  });

  it('rejects unknown Skill keys', () => {
    expect(
      parseSaveFile(currentDoc(currentPlayer({ bests: { ...perSkill(), laser: {} } }))),
    ).toBeNull();
  });

  it('rejects malformed slices as a whole — never partially applied', () => {
    expect(
      parseSaveFile(
        currentDoc(currentPlayer({ bests: perSkill({ multiply: { easy: Number.NaN } }) })),
      ),
    ).toBeNull();
    expect(
      parseSaveFile(
        currentDoc(currentPlayer({ factStats: perSkill({ multiply: { '3x7': 'nope' } }) })),
      ),
    ).toBeNull();
    expect(
      parseSaveFile(currentDoc(currentPlayer({ bests: { ...perSkill(), multiply: null } }))),
    ).toBeNull();
  });

  it('round-trips a valid current document byte-for-byte', () => {
    const text = currentDoc();
    const save = parseSaveFile(text);
    expect(save).not.toBeNull();
    if (save) expect(serializeSaveFile(save)).toBe(text);
  });
});
