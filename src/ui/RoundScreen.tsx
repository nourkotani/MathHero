import { isFinalTenSeconds, remainingSeconds, tierForStreak } from '../core';
import type { AppProps } from './App';
import { formatClock } from './format';
import { NumberPad } from './NumberPad';

export function RoundScreen({ state, dispatch }: AppProps) {
  const urgent = isFinalTenSeconds(state);
  const tier = tierForStreak(state.streak);
  return (
    <div class="hud">
      <button
        class="corner-button quit-button"
        data-testid="quit-round"
        onClick={() => dispatch({ type: 'ROUND_QUIT' })}
      >
        ✕ Quit
      </button>
      <div class="round-top">
        <div class="score" data-testid="score">
          <span class="power-orb" />{' '}
          {/* Keyed by value: every score change replays the arcade pop. */}
          <span class="score-value" key={state.score}>
            {state.score}
          </span>
        </div>
        {state.practiceTable !== null && (
          <div class="practice-badge" data-testid="practice-badge">
            ✏️ {state.practiceTable}× practice
          </div>
        )}
        {tier.multiplier > 1 && (
          <div
            class={`multiplier multiplier-${tier.form}`}
            data-testid="multiplier"
            key={tier.multiplier}
          >
            ×{tier.multiplier}
          </div>
        )}
        <div class={`countdown${urgent ? ' countdown-urgent' : ''}`} data-testid="countdown">
          ⏱ {formatClock(remainingSeconds(state))}
        </div>
      </div>
      {state.feedback === null ? (
        <>
          {/* Keyed so each fresh Question replays its entrance (the same
              Question never repeats twice in a row, so the key always turns
              over) and each typed digit replays the answer pop. */}
          <div
            class="question"
            data-testid="question"
            key={`${state.question.a}x${state.question.b}`}
          >
            {state.question.a} × {state.question.b} ={' '}
            <span class="answer" data-testid="answer" key={state.answerBuffer}>
              {state.answerBuffer === '' ? '?' : state.answerBuffer}
            </span>
          </div>
          <NumberPad dispatch={dispatch} armed={state.answerBuffer !== ''} />
        </>
      ) : (
        <div class="feedback" data-testid="feedback">
          <div class="feedback-title">Almost! Remember:</div>
          <div class="feedback-equation">
            {state.feedback.question.a} × {state.feedback.question.b} ={' '}
            {state.feedback.correctAnswer}
          </div>
        </div>
      )}
    </div>
  );
}
