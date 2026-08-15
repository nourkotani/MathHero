import { DIFFICULTY_TIERS, MAX_TIMER_SECONDS, MIN_TIMER_SECONDS } from '../core';
import type { AppProps } from './App';
import { formatClock } from './format';

const TIMER_STEP_SECONDS = 30;

export function PreRoundScreen({ state, dispatch }: AppProps) {
  const change = (delta: number) =>
    dispatch({ type: 'TIMER_CHANGED', seconds: state.timerSeconds + delta });

  return (
    <div class="hud screen-center">
      <h1 class="screen-title">Ready to train?</h1>
      <div class="difficulty-picker">
        {DIFFICULTY_TIERS.map((tier) => (
          <button
            key={tier.id}
            class={`pad-key difficulty-button${state.difficulty === tier.id ? ' difficulty-selected' : ''}`}
            data-testid={`difficulty-${tier.id}`}
            onClick={() => dispatch({ type: 'DIFFICULTY_CHANGED', difficulty: tier.id })}
          >
            {tier.label}
          </button>
        ))}
      </div>
      <div class="timer-setting">
        <button
          class="pad-key timer-button"
          data-testid="timer-decrease"
          aria-label="Less time"
          disabled={state.timerSeconds <= MIN_TIMER_SECONDS}
          onClick={() => change(-TIMER_STEP_SECONDS)}
        >
          −
        </button>
        <div class="timer-display" data-testid="timer-display">
          ⏱ {formatClock(state.timerSeconds)}
        </div>
        <button
          class="pad-key timer-button"
          data-testid="timer-increase"
          aria-label="More time"
          disabled={state.timerSeconds >= MAX_TIMER_SECONDS}
          onClick={() => change(TIMER_STEP_SECONDS)}
        >
          +
        </button>
      </div>
      <button
        class="big-button"
        data-testid="start-round"
        onClick={() => dispatch({ type: 'ROUND_STARTED' })}
      >
        GO!
      </button>
    </div>
  );
}
