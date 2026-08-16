// The Skill dimension: which operation a Round trains. All operation
// knowledge lives in this one definition table — display, grading, and
// presentation resolve through skillFor, and no call site ever switches on
// the Skill id. Skill is data, not branching, like the Difficulty tiers.

import type { Question } from './types';

export type Skill = 'multiply' | 'divide';

/** Every Skill, in the canonical (serialization) order. */
export const SKILLS: readonly Skill[] = ['multiply', 'divide'];

export interface SkillDef {
  id: Skill;
  /** Kid-facing name on the Pre-round picker. */
  label: string;
  /** The operation glyph — the single source for every screen. */
  symbol: string;
  /** The prompt text for a Question, in its display order. */
  display(question: Question): string;
  /** The one correct answer for a Question. */
  answer(question: Question): number;
  /** The badge/chip text for practicing one table (e.g. "8×", "÷8"). */
  practiceLabel(table: number): string;
  /**
   * How Practice orients a selected Fact. Multiplication reads the same in
   * either order, but the ÷8 table must actually divide by 8.
   */
  orientPractice(question: Question, table: number): Question;
}

export const SKILL_DEFS: readonly SkillDef[] = [
  {
    id: 'multiply',
    label: 'Multiply',
    symbol: '✖️',
    display: (q) => `${q.a} × ${q.b}`,
    answer: (q) => q.a * q.b,
    practiceLabel: (table) => `${table}×`,
    orientPractice: (q) => q,
  },
  {
    id: 'divide',
    label: 'Divide',
    symbol: '➗',
    // The same Fact worn inside-out: the dividend is the product, the first
    // display operand is the divisor, and the missing factor is the answer —
    // always exact, never a remainder.
    display: (q) => `${q.a * q.b} ÷ ${q.a}`,
    answer: (q) => q.b,
    practiceLabel: (table) => `÷${table}`,
    orientPractice: (q, table) => (q.a === table ? q : { a: q.b, b: q.a }),
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
