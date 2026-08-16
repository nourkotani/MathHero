// The Skill dimension: which operation a Round trains. All operation
// knowledge lives in this one definition table — display, grading, dressing,
// pacing, and pay resolve through skillFor, and no call site ever switches on
// the Skill id. Skill is data, not branching, like the Difficulty tiers.

import { FAST_MS } from './mastery';
import type { Question } from './types';

export type Skill = 'multiply' | 'divide';

/** Every Skill, in the canonical (serialization) order. Append-only. */
export const SKILLS: readonly Skill[] = ['multiply', 'divide'];

/** What `dress` may react to beyond the Fact itself. */
export interface DressContext {
  /** Practice mode: the chosen table, or null for a difficulty Round. */
  practiceTable: number | null;
}

export interface SkillDef {
  id: Skill;
  /** Kid-facing name on the Pre-round picker. */
  label: string;
  /** The operation glyph — the single source for every screen. */
  symbol: string;
  /**
   * Points pay: difficulty/practice base points are multiplied by this, so
   * slower detective Skills still earn fair XP per minute of training.
   */
  basePointScale: number;
  /**
   * The mastery window: an answer faster than this counts as fluent for this
   * Skill's pace. Feeds both mastery classification and adaptive weighting.
   */
  masteryWindowMs: number;
  /** The prompt text for a Question, in its display order. */
  display(question: Question): string;
  /** The one correct answer for a Question. */
  answer(question: Question): number;
  /** The badge/chip text for practicing one table (e.g. "8×", "÷8"). */
  practiceLabel(table: number): string;
  /**
   * Dress the selected Fact into a full Question: orient it (Practice may pin
   * a side — the ÷8 table must actually divide by 8) and draw any Skill-
   * specific presentation via the threaded PRNG.
   *
   * Draw-order policy: selection consumes the shared commutative-flip draw
   * first, then hands the flipped Fact here. Multiply and Divide are frozen
   * at zero draws forever; a future Skill's draw count may grow as it gains
   * features, which re-pins that Skill's seeded expectations and nothing
   * else's.
   */
  dress(question: Question, ctx: DressContext, prng: number): { question: Question; prng: number };
}

export const SKILL_DEFS: readonly SkillDef[] = [
  {
    id: 'multiply',
    label: 'Multiply',
    symbol: '✖️',
    basePointScale: 1,
    masteryWindowMs: FAST_MS,
    display: (q) => `${q.a} × ${q.b}`,
    answer: (q) => q.a * q.b,
    practiceLabel: (table) => `${table}×`,
    // Multiplication reads the same in either order — even in Practice.
    dress: (q, _ctx, prng) => ({ question: q, prng }),
  },
  {
    id: 'divide',
    label: 'Divide',
    symbol: '➗',
    basePointScale: 1,
    masteryWindowMs: FAST_MS,
    // The same Fact worn inside-out: the dividend is the product, the first
    // display operand is the divisor, and the missing factor is the answer —
    // always exact, never a remainder.
    display: (q) => `${q.a * q.b} ÷ ${q.a}`,
    answer: (q) => q.b,
    practiceLabel: (table) => `÷${table}`,
    dress: (q, ctx, prng) => ({
      question:
        ctx.practiceTable !== null && q.a !== ctx.practiceTable ? { a: q.b, b: q.a } : q,
      prng,
    }),
  },
];

export function skillFor(id: Skill): SkillDef {
  const def = SKILL_DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`unknown skill: ${id}`);
  return def;
}

/** A fresh per-Skill map, keys in SKILLS order so documents serialize stably. */
export function emptyPerSkill<T>(make: () => T): Record<Skill, T> {
  return Object.fromEntries(SKILLS.map((skill) => [skill, make()])) as Record<Skill, T>;
}
