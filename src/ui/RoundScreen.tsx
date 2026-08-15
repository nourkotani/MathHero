import { isFinalTenSeconds, remainingSeconds } from '../core';
import type { AppProps } from './App';
import { formatClock } from './format';
import { NumberPad } from './NumberPad';

export function RoundScreen({ state, dispatch }: AppProps) {
  const urgent = isFinalTenSeconds(state);
  return (
    <div class="hud">
      <div class="round-top">
        <div class="score" data-testid="score">
          ⭐ {state.score}
        </div>
        <div class={`countdown${urgent ? ' countdown-urgent' : ''}`} data-testid="countdown">
          ⏱ {formatClock(remainingSeconds(state))}
        </div>
      </div>
      <div class="question" data-testid="question">
        {state.question.a} × {state.question.b} ={' '}
        <span class="answer" data-testid="answer">
          {state.answerBuffer === '' ? '?' : state.answerBuffer}
        </span>
      </div>
      <NumberPad dispatch={dispatch} />
    </div>
  );
}
