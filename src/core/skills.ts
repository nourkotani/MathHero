// The Skill dimension: which operation a Round trains. All operation
// knowledge lives in this one definition table — display, grading, dressing,
// pacing, and pay resolve through skillFor, and no call site ever switches on
// the Skill id. Skill is data, not branching, like the Difficulty tiers.

import { FAST_MS } from './mastery';
import { nextRandom } from './prng';
import type { Question } from './types';

export type Skill = 'multiply' | 'divide' | 'machine';

/** Every Skill, in the canonical (serialization) order. Append-only. */
export const SKILLS: readonly Skill[] = ['multiply', 'divide', 'machine'];

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
  /**
   * The one-line text for a Question: the prompt for recall Skills, the
   * Secret Rule for Machine (its prompt is the example-row panel instead).
   * Also serves the Mastery Grid tooltips, so it must read without any
   * Skill-drawn presentation fields present.
   */
  display(question: Question): string;
  /** The one correct answer for a Question. */
  answer(question: Question): number;
  /** The teaching-moment line after a wrong answer — the full truth, kid-style. */
  reveal(question: Question): string;
  /** The badge/chip text for practicing one table (e.g. "8×", "÷8"). */
  practiceLabel(table: number): string;
  /**
   * Machine-style Skills only: the example rows the prompt panel shows.
   * Absent for Skills whose whole prompt is the display line.
   */
  exampleRows?(question: Question): Array<{ input: number; output: number }>;
  /**
   * Dress the selected Fact into a full Question: orient it (Practice may pin
   * a side — the ÷8 table must actually divide by 8) and draw any Skill-
   * specific presentation via the threaded PRNG.
   *
   * Draw-order policy: selection consumes the shared commutative-flip draw
   * first, then hands the flipped Fact here. Multiply and Divide are frozen
   * at zero draws forever; Machine draws its jump input. A Skill's draw
   * count may grow as it gains features, which re-pins that Skill's seeded
   * expectations and nothing else's.
   */
  dress(question: Question, ctx: DressContext, prng: number): { question: Question; prng: number };
}

const multiplyDisplay = (q: Question) => `${q.a} × ${q.b}`;
const divideDisplay = (q: Question) => `${q.a * q.b} ÷ ${q.a}`;
const machineRule = (q: Question) => `× ${q.a} then + ${q.b}`;
const machineOutput = (q: Question, input: number) => q.a * input + q.b;

/** Practice pins the Fact's first operand to the table (swap if needed). */
const pinFirst = (q: Question, ctx: DressContext): Question =>
  ctx.practiceTable !== null && q.a !== ctx.practiceTable ? { a: q.b, b: q.a } : q;

/** The Machine's example rows always show inputs 1, 2, 3. */
const MACHINE_EXAMPLE_INPUTS = [1, 2, 3];
/** The jump input is drawn from 5–12: far enough that the rule must be found. */
export const MACHINE_JUMP_MIN = 5;
export const MACHINE_JUMP_MAX = 12;

export const SKILL_DEFS: readonly SkillDef[] = [
  {
    id: 'multiply',
    label: 'Multiply',
    symbol: '✖️',
    basePointScale: 1,
    masteryWindowMs: FAST_MS,
    display: multiplyDisplay,
    answer: (q) => q.a * q.b,
    reveal: (q) => `${multiplyDisplay(q)} = ${q.a * q.b}`,
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
    display: divideDisplay,
    answer: (q) => q.b,
    reveal: (q) => `${divideDisplay(q)} = ${q.b}`,
    practiceLabel: (table) => `÷${table}`,
    dress: (q, ctx, prng) => ({ question: pinFirst(q, ctx), prng }),
  },
  {
    id: 'machine',
    label: 'Machine',
    symbol: '⚙️',
    // A two-step Secret Rule takes real detective work — pay triple, and
    // judge fluency at a ~25-second pace instead of recall pace.
    basePointScale: 3,
    masteryWindowMs: 25_000,
    // The Fact worn as the Secret Rule "(Input × a) + b". The display line is
    // the rule itself; the prompt is the example-row panel plus the jump
    // input, so the rule must actually be cracked, not read.
    display: machineRule,
    // dress always sets the jump input; ?? 1 degenerates an undressed
    // Question to its first example row, deterministically.
    answer: (q) => machineOutput(q, q.input ?? 1),
    reveal: (q) => {
      const input = q.input ?? 1;
      return `The rule was ${machineRule(q)}! So ${input} → ${machineOutput(q, input)}`;
    },
    practiceLabel: (table) => `×${table}`,
    exampleRows: (q) =>
      MACHINE_EXAMPLE_INPUTS.map((input) => ({ input, output: machineOutput(q, input) })),
    dress: (q, ctx, prng) => {
      // Practice pins the multiplier: every ×8 machine really multiplies by 8.
      const oriented = pinFirst(q, ctx);
      const draw = nextRandom(prng);
      const span = MACHINE_JUMP_MAX - MACHINE_JUMP_MIN + 1;
      const input = MACHINE_JUMP_MIN + Math.floor(draw.value * span);
      return { question: { ...oriented, input }, prng: draw.state };
    },
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
