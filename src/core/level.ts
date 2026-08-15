// The Hero Level curve and its derived visuals — the only place the
// N × 500 rule and the every-5th-level milestone table exist.

export const XP_PER_LEVEL = 500;

/** Hero Level N requires N × 500 cumulative XP (spec). */
export function levelForXp(xp: number): number {
  return Math.max(0, Math.floor(xp / XP_PER_LEVEL));
}

export function xpForLevel(level: number): number {
  return level * XP_PER_LEVEL;
}

/** Permanent glow/particle intensity, derived from level — never stored. */
export function glowIntensityForLevel(level: number): number {
  return Math.min(1, level * 0.03);
}

export interface CosmeticTier {
  /** Hero Level that auto-unlocks this tier. */
  level: number;
  id: string;
  label: string;
}

// Every 5th level unlocks a major cosmetic tier; a new tier is a new row.
export const COSMETIC_MILESTONES: readonly CosmeticTier[] = [
  { level: 5, id: 'crimson-aura', label: 'Crimson aura' },
  { level: 10, id: 'energy-crown', label: 'Energy crown' },
  { level: 15, id: 'lightning-wisps', label: 'Lightning wisps' },
  { level: 20, id: 'energy-wings', label: 'Energy wings' },
  { level: 25, id: 'comet-trail', label: 'Comet trail' },
  { level: 30, id: 'twin-halo', label: 'Twin halo' },
];

export function cosmeticUnlockedAt(level: number): CosmeticTier | undefined {
  return COSMETIC_MILESTONES.find((tier) => tier.level === level);
}

export function unlockedCosmetics(level: number): CosmeticTier[] {
  return COSMETIC_MILESTONES.filter((tier) => tier.level <= level);
}
