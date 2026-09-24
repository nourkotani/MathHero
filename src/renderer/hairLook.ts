// The hair look table (spec #45, ADR 0008): which hair mesh of the Blender
// hero shows, from the earned Form and the chosen Hair Style. A pure table,
// tested with no scene. The Form's colors (hair, eyes, aura) live in the
// per-Form palettes in hero.ts; this table decides only the shape.

import type { HairLength, HairStyle } from '../core';

/** From Wild Mane on, every Hair Style ascends into its Form's shared mane:
 *  past level 50 the hero has outgrown their old look (CONTEXT.md, Form). */
const MANES: Readonly<Record<string, string>> = {
  'wild-mane': 'Hair_mane_wild',
  'crimson-sage': 'Hair_mane_crimson',
  'rose-dawn': 'Hair_mane_rose',
  legend: 'Hair_mane_legend',
};

/** The mesh name in hero.glb for this Form (null: none yet) and style. */
export function hairMeshFor(form: string | null, style: HairStyle, length: HairLength): string {
  return (form !== null ? MANES[form] : undefined) ?? `Hair_${style}_${length}`;
}
