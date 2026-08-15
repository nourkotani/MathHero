// The versioned Save File document: one schema owned by the core, with a
// single validate + migrate pipeline. Export/import reuses this exact
// codepath — anything that turns bytes into a valid document lives here.

import { validColors } from './players';
import type { PlayerRecord } from './players';
import type { GameState } from './types';

export const SAVE_FILE_VERSION = 2;

export interface SaveFile {
  version: number;
  players: PlayerRecord[];
  nextPlayerId: number;
}

/** The persisted slice of core state, byte-for-byte what export downloads. */
export function buildSaveFile(state: GameState): SaveFile {
  return {
    version: SAVE_FILE_VERSION,
    players: state.players,
    nextPlayerId: state.nextPlayerId,
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
  if (typeof doc.nextPlayerId !== 'number') return null;

  const players: PlayerRecord[] = [];
  for (const entry of doc.players) {
    const player = validatePlayer(entry);
    if (player === null) return null;
    players.push(player);
  }
  return { version: SAVE_FILE_VERSION, players, nextPlayerId: doc.nextPlayerId };
}

function validatePlayer(entry: unknown): PlayerRecord | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const p = entry as Record<string, unknown>;
  const colors = p.colors as Record<string, unknown> | undefined;
  if (
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    p.name.length === 0 ||
    typeof p.roundsPlayed !== 'number' ||
    typeof p.xp !== 'number' ||
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
    name: p.name,
    colors: playerColors,
    roundsPlayed: p.roundsPlayed,
    xp: p.xp,
  };
}
