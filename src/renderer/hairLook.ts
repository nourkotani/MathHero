// The hair look table (spec #45, ADR 0008): which hair mesh of the Blender
// hero shows, from the earned Form and the chosen Hair Style. A pure table,
// tested with no scene. The Form's colors (hair, eyes, aura) live in the
// per-Form palettes in hero.ts; this table decides only the shape.

import type { HairLength, HairStyle } from '../core';

/** Forms whose hair grows long whatever length was chosen. Until the
 *  ascended manes arrive (ticket #52), this is Wild Mane's whole look. */
const LONG_FORMS: ReadonlySet<string> = new Set(['wild-mane']);

/** The mesh name in hero.glb for this Form (null: none yet) and style. */
export function hairMeshFor(form: string | null, style: HairStyle, length: HairLength): string {
  const shown = form !== null && LONG_FORMS.has(form) ? 'long' : length;
  return `Hair_${style}_${shown}`;
}
