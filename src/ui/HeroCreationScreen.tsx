import { useState } from 'preact/hooks';
import { HAIR_PRESETS, MAX_NAME_LENGTH, OUTFIT_PRESETS } from '../core';
import type { ColorPreset } from '../core';
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

export function HeroCreationScreen({ dispatch }: AppProps) {
  const [name, setName] = useState('');
  const [hair, setHair] = useState(HAIR_PRESETS[0]?.id ?? '');
  const [outfitPrimary, setOutfitPrimary] = useState(OUTFIT_PRESETS[0]?.id ?? '');
  const [outfitSecondary, setOutfitSecondary] = useState(OUTFIT_PRESETS[1]?.id ?? '');

  return (
    <div class="hud screen-center">
      <h1 class="screen-title">Create your hero!</h1>
      <input
        class="name-input"
        data-testid="hero-name"
        placeholder="Hero name"
        maxLength={MAX_NAME_LENGTH}
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <SwatchRow title="Hair" presets={HAIR_PRESETS} prefix="hair" selected={hair} onPick={setHair} />
      <SwatchRow
        title="Outfit"
        presets={OUTFIT_PRESETS}
        prefix="primary"
        selected={outfitPrimary}
        onPick={setOutfitPrimary}
      />
      <SwatchRow
        title="Trim"
        presets={OUTFIT_PRESETS}
        prefix="secondary"
        selected={outfitSecondary}
        onPick={setOutfitSecondary}
      />
      <div class="confirm-actions">
        <button
          class="big-button"
          data-testid="cancel-creation"
          onClick={() => dispatch({ type: 'CREATION_CANCELLED' })}
        >
          Back
        </button>
        <button
          class="big-button"
          data-testid="create-hero"
          disabled={name.trim() === ''}
          onClick={() =>
            dispatch({
              type: 'PLAYER_CREATED',
              name,
              colors: { hair, outfitPrimary, outfitSecondary },
            })
          }
        >
          Let's go!
        </button>
      </div>
    </div>
  );
}
