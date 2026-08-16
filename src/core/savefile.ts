// The versioned Save File document: one schema owned by the core, with a
// single validate + migrate pipeline. Export/import reuses this exact
// codepath — anything that turns bytes into a valid document lives here.

import { validAppearance } from './appearance';
import type { HeroAppearance } from './appearance';
import { MAX_NAME_LENGTH, validColors } from './players';
import type { PlayerRecord } from './players';
import { SKILLS } from './skills';
import type { GameState } from './types';

/** A well-formed count/score/timestamp: finite, non-negative number. */
function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export const SAVE_FILE_VERSION = 9;

export interface SaveFile {
  version: number;
  players: PlayerRecord[];
  nextPlayerId: number;
  /** Epoch ms of the last export (or first play, until one happens). */
  lastExportAt: number | null;
  /** Family-wide mute toggle. */
  muted: boolean;
}

/** The persisted slice of core state, byte-for-byte what export downloads. */
export function buildSaveFile(state: GameState): SaveFile {
  return {
    version: SAVE_FILE_VERSION,
    players: state.players,
    nextPlayerId: state.nextPlayerId,
    lastExportAt: state.lastExportAt,
    muted: state.muted,
  };
}

export function serializeSaveFile(save: SaveFile): string {
  return JSON.stringify(save, null, 2);
}

/** Ordered migrations: MIGRATIONS[N - 1] upgrades a version-N document to N + 1. */
const MIGRATIONS: Array<(doc: Record<string, unknown>) => Record<string, unknown>> = [
  // v1 → v2: players gain lifetime XP.
  (doc) => ({
    ...doc,
    version: 2,
    players: (Array.isArray(doc.players) ? doc.players : []).map(
      (p: Record<string, unknown>) => ({ ...p, xp: 0 }),
    ),
  }),
  // v2 → v3: players gain per-difficulty Personal Bests.
  (doc) => ({
    ...doc,
    version: 3,
    players: (Array.isArray(doc.players) ? doc.players : []).map(
      (p: Record<string, unknown>) => ({ ...p, bests: {} }),
    ),
  }),
  // v3 → v4: players gain per-Fact attempt stats.
  (doc) => ({
    ...doc,
    version: 4,
    players: (Array.isArray(doc.players) ? doc.players : []).map(
      (p: Record<string, unknown>) => ({ ...p, factStats: {} }),
    ),
  }),
  // v4 → v5: the document tracks when it was last exported.
  (doc) => ({ ...doc, version: 5, lastExportAt: null }),
  // v5 → v6: the family-wide mute toggle persists.
  (doc) => ({ ...doc, version: 6, muted: false }),
  // v6 → v7: players gain a hero appearance; older heroes keep their old look.
  (doc) => ({
    ...doc,
    version: 7,
    players: (Array.isArray(doc.players) ? doc.players : []).map(
      (p: Record<string, unknown>) => ({
        ...p,
        appearance: { body: 'boy', hairStyle: 'spiky', hairLength: 'short', garment: 'gi' },
      }),
    ),
  }),
  // v7 → v8: heroes gain a skin tone; existing heroes keep the classic tan.
  (doc) => ({
    ...doc,
    version: 8,
    players: (Array.isArray(doc.players) ? doc.players : []).map(
      (p: Record<string, unknown>) => ({
        ...p,
        appearance: {
          ...(typeof p.appearance === 'object' && p.appearance !== null ? p.appearance : {}),
          skinTone: 'tan',
        },
      }),
    ),
  }),
  // v8 → v9: mastery data and Personal Bests become per-Skill. Everything a
  // hero earned belongs to Multiply; Divide starts fresh. Frozen literal on
  // purpose — a migration is a historical snapshot and must not change shape
  // if SKILLS grows later.
  (doc) => ({
    ...doc,
    version: 9,
    players: (Array.isArray(doc.players) ? doc.players : []).map(
      (p: Record<string, unknown>) => ({
        ...p,
        bests: { multiply: p.bests ?? {}, divide: {} },
        factStats: { multiply: p.factStats ?? {}, divide: {} },
      }),
    ),
  }),
];

/**
 * The one codepath from bytes to a valid, current-version document —
 * whether they came from localStorage or an imported file.
 * Returns null (never throws, never partially applies) on anything invalid.
 */
export function parseSaveFile(text: string): SaveFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  let doc = raw as Record<string, unknown>;

  if (typeof doc.version !== 'number' || doc.version < 1 || doc.version > SAVE_FILE_VERSION) {
    return null;
  }
  for (let v = doc.version as number; v < SAVE_FILE_VERSION; v++) {
    const migrate = MIGRATIONS[v - 1];
    if (!migrate) return null;
    doc = migrate(doc);
  }
  return validateCurrent(doc);
}

function validateCurrent(doc: Record<string, unknown>): SaveFile | null {
  if (doc.version !== SAVE_FILE_VERSION) return null;
  if (!Array.isArray(doc.players)) return null;
  if (!validCount(doc.nextPlayerId)) return null;
  if (doc.lastExportAt !== null && !validCount(doc.lastExportAt)) return null;
  if (typeof doc.muted !== 'boolean') return null;

  const players: PlayerRecord[] = [];
  for (const entry of doc.players) {
    const player = validatePlayer(entry);
    if (player === null) return null;
    players.push(player);
  }
  // Never mint an id that collides with an existing player, even if the
  // document's counter is out of step.
  const maxPlayerId = Math.max(
    0,
    ...players.map((p) => (/^p\d+$/.test(p.id) ? Number(p.id.slice(1)) : 0)),
  );
  return {
    version: SAVE_FILE_VERSION,
    players,
    nextPlayerId: Math.max(Math.floor(doc.nextPlayerId), maxPlayerId + 1),
    lastExportAt: doc.lastExportAt as number | null,
    muted: doc.muted,
  };
}

function validatePlayer(entry: unknown): PlayerRecord | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const p = entry as Record<string, unknown>;
  const colors = p.colors as Record<string, unknown> | undefined;
  const name = typeof p.name === 'string' ? p.name.trim().slice(0, MAX_NAME_LENGTH) : '';
  if (
    typeof p.id !== 'string' ||
    name === '' ||
    !validCount(p.roundsPlayed) ||
    !validCount(p.xp) ||
    !validPerSkill(p.bests, validBestsSlice) ||
    !validPerSkill(p.factStats, validFactStatsSlice) ||
    !validPlayerAppearance(p.appearance) ||
    typeof colors !== 'object' ||
    colors === null ||
    typeof colors.hair !== 'string' ||
    typeof colors.outfitPrimary !== 'string' ||
    typeof colors.outfitSecondary !== 'string'
  ) {
    return null;
  }
  const playerColors = {
    hair: colors.hair,
    outfitPrimary: colors.outfitPrimary,
    outfitSecondary: colors.outfitSecondary,
  };
  if (!validColors(playerColors)) return null;
  return {
    id: p.id,
    name,
    colors: playerColors,
    appearance: p.appearance as HeroAppearance,
    roundsPlayed: p.roundsPlayed as number,
    xp: p.xp as number,
    bests: p.bests as PlayerRecord['bests'],
    factStats: p.factStats as PlayerRecord['factStats'],
  };
}

function validPlayerAppearance(appearance: unknown): boolean {
  if (typeof appearance !== 'object' || appearance === null) return false;
  return validAppearance(appearance as HeroAppearance);
}

/**
 * A per-Skill map is valid when it holds exactly one valid slice per Skill —
 * no Skill missing, no unknown keys. The same slice validators serve every
 * Skill, so a future Skill is a SKILLS entry plus a migration.
 */
function validPerSkill(value: unknown, validSlice: (slice: unknown) => boolean): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const map = value as Record<string, unknown>;
  const keys = Object.keys(map);
  return (
    keys.length === SKILLS.length &&
    SKILLS.every((skill) => keys.includes(skill) && validSlice(map[skill]))
  );
}

function validFactStatsSlice(stats: unknown): boolean {
  if (typeof stats !== 'object' || stats === null) return false;
  return Object.entries(stats).every(
    ([key, attempts]) =>
      /^\d{1,2}x\d{1,2}$/.test(key) &&
      Array.isArray(attempts) &&
      attempts.every(
        (a) =>
          typeof a === 'object' &&
          a !== null &&
          typeof (a as Record<string, unknown>).correct === 'boolean' &&
          validCount((a as Record<string, unknown>).ms),
      ),
  );
}

function validBestsSlice(bests: unknown): boolean {
  if (typeof bests !== 'object' || bests === null) return false;
  return Object.entries(bests).every(
    ([key, value]) => ['easy', 'medium', 'hard'].includes(key) && validCount(value),
  );
}
