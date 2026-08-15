import { isFinalTenSeconds, remainingSeconds, tierForStreak } from '../core';
import type { AppProps } from './App';
import { formatClock } from './format';
import { NumberPad } from './NumberPad';

export function RoundScreen({ state, dispatch }: AppProps) {
  const urgent = isFinalTenSeconds(state);
  const tier = tierForStreak(state.streak);
  return (
    <div class="hud">
      <div class="round-top">
        <div class="score" data-testid="score">
          ⭐ {state.score}
        </div>
        {state.practiceTable !== null && (
          <div class="practice-badge" data-testid="practice-badge">
            ✏️ {state.practiceTable}× practice
          </div>
        )}
        {tier.multiplier > 1 && (
          <div class={`multiplier multiplier-${tier.form}`} data-testid="multiplier">
            ×{tier.multiplier}
          </div>
        )}
        <div class={`countdown${urgent ? ' countdown-urgent' : ''}`} data-testid="countdown">
          ⏱ {formatClock(remainingSeconds(state))}
        </div>
      </div>
      {state.feedback === null ? (
        <>
          <div class="question" data-testid="question">
            {state.question.a} × {state.question.b} ={' '}
            <span class="answer" data-testid="answer">
              {state.answerBuffer === '' ? '?' : state.answerBuffer}
            </span>
          </div>
          <NumberPad dispatch={dispatch} />
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
