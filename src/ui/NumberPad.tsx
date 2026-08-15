import type { GameEvent } from '../core';

export interface NumberPadProps {
  dispatch: (event: GameEvent) => void;
}

const ROWS: number[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

export function NumberPad({ dispatch }: NumberPadProps) {
  return (
    <div class="number-pad">
      {ROWS.flat().map((digit) => (
        <button
          key={digit}
          class="pad-key"
          data-testid={`pad-${digit}`}
          onClick={() => dispatch({ type: 'DIGIT_PRESSED', digit })}
        >
          {digit}
        </button>
      ))}
      <button
        class="pad-key pad-backspace"
        data-testid="pad-backspace"
        aria-label="Erase"
        onClick={() => dispatch({ type: 'BACKSPACE_PRESSED' })}
      >
        ⌫
      </button>
      <button
        class="pad-key"
        data-testid="pad-0"
        onClick={() => dispatch({ type: 'DIGIT_PRESSED', digit: 0 })}
      >
        0
      </button>
      <button
        class="pad-key pad-submit"
        data-testid="pad-submit"
        aria-label="Submit answer"
        onClick={() => dispatch({ type: 'ANSWER_SUBMITTED' })}
      >
        ✓
      </button>
    </div>
  );
}
