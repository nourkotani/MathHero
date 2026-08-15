import type { GameEvent } from '../core';

export interface NumberPadProps {
  dispatch: (event: GameEvent) => void;
}

const ROWS: number[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

// Pad clicks must never move focus: a focused key gets re-activated by the
// Enter that submits the answer, sneaking a stray digit into the next buffer.
const keepFocus = (e: MouseEvent) => e.preventDefault();

export function NumberPad({ dispatch }: NumberPadProps) {
  return (
    <div class="number-pad">
      {ROWS.flat().map((digit) => (
        <button
          key={digit}
          class="pad-key"
          data-testid={`pad-${digit}`}
          onMouseDown={keepFocus}
          onClick={() => dispatch({ type: 'DIGIT_PRESSED', digit })}
        >
          {digit}
        </button>
      ))}
      <button
        class="pad-key pad-backspace"
        data-testid="pad-backspace"
        aria-label="Erase"
        onMouseDown={keepFocus}
        onClick={() => dispatch({ type: 'BACKSPACE_PRESSED' })}
      >
        ⌫
      </button>
      <button
        class="pad-key"
        data-testid="pad-0"
        onMouseDown={keepFocus}
        onClick={() => dispatch({ type: 'DIGIT_PRESSED', digit: 0 })}
      >
        0
      </button>
      <button
        class="pad-key pad-submit"
        data-testid="pad-submit"
        aria-label="Submit answer"
        onMouseDown={keepFocus}
        onClick={() => dispatch({ type: 'ANSWER_SUBMITTED' })}
      >
        ✓
      </button>
    </div>
  );
}
