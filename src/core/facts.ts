// Fact canonicalization: 7×8 and 8×7 are the same Fact. This is the ONLY
// place Fact keys are built — stats recording, selection, mastery, and the
// grid all call factKey.

export type FactKey = string;

/** Canonical key for a commutative pair, small × large (e.g. "3x7"). */
export function factKey(a: number, b: number): FactKey {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}x${hi}`;
}
