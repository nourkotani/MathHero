// Hero appearance: body style, hair, and garments. Option tables are the
// single source for the creation UI's buttons, validation, and the renderer's
// character builder — adding a style is a new row.

export type BodyStyle = 'girl' | 'boy';
export type HairStyle = 'spiky' | 'flame' | 'ponytail' | 'buzz';
export type HairLength = 'short' | 'long';
export type Garment = 'gi' | 'cape' | 'armor';
export type SkinTone = 'fair' | 'tan' | 'golden' | 'bronze' | 'deep';

export interface HeroAppearance {
  body: BodyStyle;
  hairStyle: HairStyle;
  hairLength: HairLength;
  garment: Garment;
  skinTone: SkinTone;
}

export interface AppearanceOption<T extends string> {
  id: T;
  label: string;
}

export const BODY_OPTIONS: readonly AppearanceOption<BodyStyle>[] = [
  { id: 'girl', label: 'Girl' },
  { id: 'boy', label: 'Boy' },
];

export const HAIR_STYLE_OPTIONS: readonly AppearanceOption<HairStyle>[] = [
  { id: 'spiky', label: 'Spiky' },
  { id: 'flame', label: 'Flame' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'buzz', label: 'Buzz' },
];

export const HAIR_LENGTH_OPTIONS: readonly AppearanceOption<HairLength>[] = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
];

export const GARMENT_OPTIONS: readonly AppearanceOption<Garment>[] = [
  { id: 'gi', label: 'Fighter gi' },
  { id: 'cape', label: 'Caped gi' },
  { id: 'armor', label: 'Battle armor' },
];

/** Skin tones carry a hex so the creation swatches and renderer share it. */
export interface SkinPreset {
  id: SkinTone;
  label: string;
  hex: number;
}

export const SKIN_PRESETS: readonly SkinPreset[] = [
  { id: 'fair', label: 'Fair', hex: 0xffdbc4 },
  { id: 'tan', label: 'Tan', hex: 0xf2c09a },
  { id: 'golden', label: 'Golden', hex: 0xd9a066 },
  { id: 'bronze', label: 'Bronze', hex: 0xa9714b },
  { id: 'deep', label: 'Deep', hex: 0x6f4a30 },
];

export const DEFAULT_APPEARANCE: HeroAppearance = {
  body: 'girl',
  hairStyle: 'spiky',
  hairLength: 'short',
  garment: 'gi',
  skinTone: 'tan',
};

export function validAppearance(appearance: HeroAppearance): boolean {
  return (
    BODY_OPTIONS.some((o) => o.id === appearance.body) &&
    HAIR_STYLE_OPTIONS.some((o) => o.id === appearance.hairStyle) &&
    HAIR_LENGTH_OPTIONS.some((o) => o.id === appearance.hairLength) &&
    GARMENT_OPTIONS.some((o) => o.id === appearance.garment) &&
    SKIN_PRESETS.some((o) => o.id === appearance.skinTone)
  );
}
