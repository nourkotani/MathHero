import { useState } from 'preact/hooks';
import {
  BODY_OPTIONS,
  DEFAULT_APPEARANCE,
  GARMENT_OPTIONS,
  HAIR_LENGTH_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HAIR_PRESETS,
  MAX_NAME_LENGTH,
  OUTFIT_PRESETS,
} from '../core';
import type { AppearanceOption, ColorPreset, HeroAppearance, PlayerColors } from '../core';
import type { AppProps } from './App';

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

interface SwatchRowProps {
  title: string;
  presets: readonly ColorPreset[];
  prefix: string;
  selected: string;
  onPick: (id: string) => void;
}

function SwatchRow({ title, presets, prefix, selected, onPick }: SwatchRowProps) {
  return (
    <div class="swatch-row">
      <span class="swatch-title">{title}</span>
      <div class="swatches">
        {presets.map((preset) => (
          <button
            key={preset.id}
            class={`swatch${selected === preset.id ? ' swatch-selected' : ''}`}
            style={{ background: hexCss(preset.hex) }}
            aria-label={`${title}: ${preset.label}`}
            data-testid={`${prefix}-${preset.id}`}
            onClick={() => onPick(preset.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface OptionRowProps<T extends string> {
  title: string;
  options: readonly AppearanceOption<T>[];
  prefix: string;
  selected: T;
  onPick: (id: T) => void;
}

function OptionRow<T extends string>({ title, options, prefix, selected, onPick }: OptionRowProps<T>) {
  return (
    <div class="swatch-row">
      <span class="swatch-title">{title}</span>
      <div class="option-buttons">
        {options.map((option) => (
          <button
            key={option.id}
            class={`option-button${selected === option.id ? ' mode-selected' : ''}`}
            data-testid={`${prefix}-${option.id}`}
            onClick={() => onPick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HeroCreationScreen({ state, dispatch }: AppProps) {
  const [name, setName] = useState('');
  const draft = state.draft ?? {
    colors: {
      hair: HAIR_PRESETS[0]?.id ?? '',
      outfitPrimary: OUTFIT_PRESETS[0]?.id ?? '',
      outfitSecondary: OUTFIT_PRESETS[1]?.id ?? '',
    },
    appearance: DEFAULT_APPEARANCE,
  };

  const changeColors = (colors: Partial<PlayerColors>) =>
    dispatch({
      type: 'DRAFT_CHANGED',
      colors: { ...draft.colors, ...colors },
      appearance: draft.appearance,
    });
  const changeAppearance = (appearance: Partial<HeroAppearance>) =>
    dispatch({
      type: 'DRAFT_CHANGED',
      colors: draft.colors,
      appearance: { ...draft.appearance, ...appearance },
    });

  return (
    <div class="hud creation-layout">
      <div class="creation-panel">
        <h1 class="screen-title creation-title">Create your hero!</h1>
        <input
          class="name-input"
          data-testid="hero-name"
          placeholder="Hero name"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <OptionRow
          title="Hero"
          options={BODY_OPTIONS}
          prefix="body"
          selected={draft.appearance.body}
          onPick={(body) => changeAppearance({ body })}
        />
        <OptionRow
          title="Hair"
          options={HAIR_STYLE_OPTIONS}
          prefix="hairstyle"
          selected={draft.appearance.hairStyle}
          onPick={(hairStyle) => changeAppearance({ hairStyle })}
        />
        <OptionRow
          title="Length"
          options={HAIR_LENGTH_OPTIONS}
          prefix="hairlength"
          selected={draft.appearance.hairLength}
          onPick={(hairLength) => changeAppearance({ hairLength })}
        />
        <OptionRow
          title="Outfit"
          options={GARMENT_OPTIONS}
          prefix="garment"
          selected={draft.appearance.garment}
          onPick={(garment) => changeAppearance({ garment })}
        />
        <SwatchRow
          title="Hair color"
          presets={HAIR_PRESETS}
          prefix="hair"
          selected={draft.colors.hair}
          onPick={(hair) => changeColors({ hair })}
        />
        <SwatchRow
          title="Outfit color"
          presets={OUTFIT_PRESETS}
          prefix="primary"
          selected={draft.colors.outfitPrimary}
          onPick={(outfitPrimary) => changeColors({ outfitPrimary })}
        />
        <SwatchRow
          title="Trim color"
          presets={OUTFIT_PRESETS}
          prefix="secondary"
          selected={draft.colors.outfitSecondary}
          onPick={(outfitSecondary) => changeColors({ outfitSecondary })}
        />
        <div class="confirm-actions">
          <button
            class="big-button creation-button"
            data-testid="cancel-creation"
            onClick={() => dispatch({ type: 'CREATION_CANCELLED' })}
          >
            Back
          </button>
          <button
            class="big-button creation-button"
            data-testid="create-hero"
            disabled={name.trim() === ''}
            onClick={() =>
              dispatch({
                type: 'PLAYER_CREATED',
                name,
                colors: draft.colors,
                appearance: draft.appearance,
              })
            }
          >
            Let's go!
          </button>
        </div>
      </div>
    </div>
  );
}
