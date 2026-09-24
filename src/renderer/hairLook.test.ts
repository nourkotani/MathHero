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

  const MANE_FORMS = {
    'wild-mane': 'Hair_mane_wild',
    'crimson-sage': 'Hair_mane_crimson',
    'rose-dawn': 'Hair_mane_rose',
    legend: 'Hair_mane_legend',
  };
  for (const [form, mane] of Object.entries(MANE_FORMS)) {
    it(`shows the ${form} shared mane for every Hair Style`, () => {
      for (const style of STYLES) {
        for (const length of LENGTHS) {
          expect(hairMeshFor(form, style, length)).toBe(mane);
        }
      }
    });
  }

  it('gives the manes to exactly the Forms from Wild Mane on', () => {
    const fromWildMane = FORMS.filter((f) => f.level >= 50).map((f) => f.id);
    expect(Object.keys(MANE_FORMS).sort()).toEqual([...fromWildMane].sort());
  });

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
