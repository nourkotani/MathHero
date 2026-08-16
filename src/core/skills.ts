// The Skill dimension: which operation a Round trains. Deliberately minimal —
// persistence and record-keeping only need the keys. The per-Skill definition
// table (prompt display + grading) arrives with the Divide Round.

export type Skill = 'multiply' | 'divide';

/** Every Skill, in the canonical (serialization) order. */
export const SKILLS: readonly Skill[] = ['multiply', 'divide'];

/** A fresh per-Skill map, keys in SKILLS order so documents serialize stably. */
export function emptyPerSkill<T>(make: () => T): Record<Skill, T> {
  return Object.fromEntries(SKILLS.map((skill) => [skill, make()])) as Record<Skill, T>;
}
