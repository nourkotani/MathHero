import { describe, expect, it } from 'vitest';
import { FORMS, HAIR_LENGTH_OPTIONS, HAIR_STYLE_OPTIONS } from '../core';
import { hairMeshFor } from './hairLook';

const STYLES = HAIR_STYLE_OPTIONS.map((o) => o.id);
const LENGTHS = HAIR_LENGTH_OPTIONS.map((o) => o.id);

describe('the hair look table: (Form, Hair Style) → the hair that shows', () => {
  for (const form of [null, 'gold-spark', 'storm-gold'] as const) {
    it(`shows the hero's own Hair Style with ${form ?? 'no Form'}`, () => {
      for (const style of STYLES) {
        for (const length of LENGTHS) {
          expect(hairMeshFor(form, style, length)).toBe(`Hair_${style}_${length}`);
        }
      }
    });
  }

  it('has an entry for every Form, every Hair Style, and every length', () => {
    for (const form of [null, ...FORMS.map((f) => f.id)]) {
      for (const style of STYLES) {
        for (const length of LENGTHS) {
          expect(hairMeshFor(form, style, length), `${form} ${style} ${length}`).toMatch(/^Hair_/);
        }
      }
    }
  });
});
