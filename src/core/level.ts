// The Hero Level curve and its derived visuals — the only place the XP
// pricing, the level cap, and the milestone table exist.

export const XP_PER_LEVEL = 500;
export const MAX_LEVEL = 100;
/** Levels 1–30 cost XP_PER_LEVEL each; above, each level costs STEEP_RISE more. */
const STEEP_START = 30;
const STEEP_RISE = 25;

/** Cumulative XP required to hold the given Hero Level (clamped to the cap). */
export function xpForLevel(level: number): number {
  const capped = Math.min(Math.max(0, level), MAX_LEVEL);
  if (capped <= STEEP_START) return capped * XP_PER_LEVEL;
  const n = capped - STEEP_START;
  return capped * XP_PER_LEVEL + (STEEP_RISE * n * (n + 1)) / 2;
}

/** Hero Level for a lifetime XP total — capped at MAX_LEVEL, XP never is. */
export function levelForXp(xp: number): number {
  let level = 0;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/**
 * Permanent glow/particle intensity, derived from level — never stored.
 * Levels 1–30 climb exactly as they did before the cap moved to 100 (a
 * level-20 hero must never read weaker after an update); the remaining
 * headroom is spent evenly across the long climb from 30 to 100.
 */
export function glowIntensityForLevel(level: number): number {
  if (level <= STEEP_START) return Math.min(1, level * 0.03);
  return Math.min(1, 0.9 + ((level - STEEP_START) / (MAX_LEVEL - STEEP_START)) * 0.1);
}

/**
 * A Form: the hero's earned, permanent state of power. The Form owns what
 * the hero *is* (its look is the renderer's business); the Power Streak
 * owns how hard they are pushing right now. Append-only, ordered by level.
 */
export interface HeroForm {
  /** Hero Level that earns this Form; every one of these is a Landmark. */
  level: number;
  id: string;
  /** Kid-facing name, announced by the transformation ceremony. */
  label: string;
}

export const FORMS: readonly HeroForm[] = [
  { level: 10, id: 'gold-spark', label: 'Gold Spark' },
  { level: 25, id: 'storm-gold', label: 'Storm Gold' },
  { level: 50, id: 'wild-mane', label: 'Wild Mane' },
  { level: 70, id: 'crimson-sage', label: 'Crimson Sage' },
  { level: 85, id: 'rose-dawn', label: 'Rose Dawn' },
  { level: 100, id: 'legend', label: 'Legend' },
];

/** The Form a hero of this level is in, or undefined below the first one. */
export function formForLevel(level: number): HeroForm | undefined {
  let earned: HeroForm | undefined;
  for (const form of FORMS) {
    if (level >= form.level) earned = form;
  }
  return earned;
}

/** The Form earned exactly at this level, if any — the ceremony's trigger. */
export function formUnlockedAt(level: number): HeroForm | undefined {
  return FORMS.find((form) => form.level === level);
}

/** The piece of the hero a cosmetic tier dresses; higher tiers evolve the slot. */
export type CosmeticSlot = 'ring' | 'crown' | 'wisps' | 'wings' | 'trail' | 'halo' | 'form';

export interface CosmeticTier {
  /** Hero Level that auto-unlocks this tier. */
  level: number;
  id: string;
  label: string;
  slot: CosmeticSlot;
  /** Landmark Levels play the full transformation scene in the ceremony. */
  landmark?: true;
}

// Every 5th level unlocks a cosmetic tier. Tiers through 30 introduce their
// slots; tiers from 35 up evolve one — the hero grows grander, never more
// cluttered. The Landmark flags sit on the levels where a Form is earned
// (see FORMS), so the full transformation scene fires exactly when the hero
// actually transforms; level 100 is Legend, the one tier of the form slot.
export const COSMETIC_MILESTONES: readonly CosmeticTier[] = [
  { level: 5, id: 'crimson-aura', label: 'Crimson aura', slot: 'ring' },
  { level: 10, id: 'energy-crown', label: 'Energy crown', slot: 'crown', landmark: true },
  { level: 15, id: 'lightning-wisps', label: 'Lightning wisps', slot: 'wisps' },
  { level: 20, id: 'energy-wings', label: 'Energy wings', slot: 'wings' },
  { level: 25, id: 'comet-trail', label: 'Comet trail', slot: 'trail', landmark: true },
  { level: 30, id: 'twin-halo', label: 'Twin halo', slot: 'halo' },
  { level: 35, id: 'storm-wisps', label: 'Storm wisps', slot: 'wisps' },
  { level: 40, id: 'blazing-crown', label: 'Blazing crown', slot: 'crown' },
  { level: 45, id: 'phoenix-wings', label: 'Phoenix wings', slot: 'wings' },
  { level: 50, id: 'inferno-ring', label: 'Inferno ring', slot: 'ring', landmark: true },
  { level: 55, id: 'twin-comet-trail', label: 'Twin comet trail', slot: 'trail' },
  { level: 60, id: 'radiant-halo', label: 'Radiant halo', slot: 'halo' },
  { level: 65, id: 'thunder-spirits', label: 'Thunder spirits', slot: 'wisps' },
  { level: 70, id: 'galaxy-wings', label: 'Galaxy wings', slot: 'wings', landmark: true },
  { level: 75, id: 'celestial-crown', label: 'Celestial crown', slot: 'crown' },
  { level: 80, id: 'starfall-trail', label: 'Starfall trail', slot: 'trail' },
  { level: 85, id: 'nova-ring', label: 'Nova ring', slot: 'ring', landmark: true },
  { level: 90, id: 'aurora-halo', label: 'Aurora halo', slot: 'halo' },
  { level: 95, id: 'spirit-storm', label: 'Spirit storm', slot: 'wisps' },
  { level: 100, id: 'legend', label: 'Legend', slot: 'form', landmark: true },
];

export function cosmeticUnlockedAt(level: number): CosmeticTier | undefined {
  return COSMETIC_MILESTONES.find((tier) => tier.level === level);
}

export function unlockedCosmetics(level: number): CosmeticTier[] {
  return COSMETIC_MILESTONES.filter((tier) => tier.level <= level);
}

/**
 * What the hero actually wears: the highest unlocked tier per slot, in the
 * table's order of first introduction — evolution, not accumulation.
 */
export function wornCosmetics(level: number): CosmeticTier[] {
  const bySlot = new Map<CosmeticSlot, CosmeticTier>();
  for (const tier of unlockedCosmetics(level)) bySlot.set(tier.slot, tier);
  return [...bySlot.values()];
}
