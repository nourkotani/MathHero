// Player records and the curated color presets. The presets table is the
// single source for both the creation UI's swatches and the renderer's
// character materials.

export interface ColorPreset {
  id: string;
  label: string;
  hex: number;
}

export const HAIR_PRESETS: readonly ColorPreset[] = [
  { id: 'midnight', label: 'Midnight', hex: 0x2b2b2b },
  { id: 'gold', label: 'Gold', hex: 0xffd24d },
  { id: 'flame', label: 'Flame', hex: 0xff6b35 },
  { id: 'sky', label: 'Sky', hex: 0x3ac0ff },
  { id: 'violet', label: 'Violet', hex: 0x9b5aff },
  { id: 'rose', label: 'Rose', hex: 0xff5a8f },
];

export const OUTFIT_PRESETS: readonly ColorPreset[] = [
  { id: 'blue', label: 'Blue', hex: 0x3a6fd8 },
  { id: 'orange', label: 'Orange', hex: 0xff9f1c },
  { id: 'green', label: 'Green', hex: 0x3dbb61 },
  { id: 'red', label: 'Red', hex: 0xe84545 },
  { id: 'purple', label: 'Purple', hex: 0x8f5aff },
  { id: 'teal', label: 'Teal', hex: 0x2ec4b6 },
  { id: 'yellow', label: 'Yellow', hex: 0xffd24d },
  { id: 'white', label: 'White', hex: 0xf2f2f2 },
];

export interface PlayerColors {
  hair: string;
  outfitPrimary: string;
  outfitSecondary: string;
}

export interface PlayerRecord {
  /** Stable id; names are display data, so renames keep every stat. */
  id: string;
  name: string;
  colors: PlayerColors;
  /** Rounds completed by this Player — every Round is attributed to someone. */
  roundsPlayed: number;
  /** Lifetime XP: the sum of every Round's final score. Never resets. */
  xp: number;
}

export const MAX_NAME_LENGTH = 20;

export function presetHex(presets: readonly ColorPreset[], id: string): number {
  const preset = presets.find((p) => p.id === id) ?? presets[0];
  if (!preset) throw new Error('preset table is empty');
  return preset.hex;
}

export function validColors(colors: PlayerColors): boolean {
  return (
    HAIR_PRESETS.some((p) => p.id === colors.hair) &&
    OUTFIT_PRESETS.some((p) => p.id === colors.outfitPrimary) &&
    OUTFIT_PRESETS.some((p) => p.id === colors.outfitSecondary)
  );
}
