import { isFinalTenSeconds, remainingSeconds, skillFor, tierForStreak } from '../core';
import type { AppProps } from './App';
import { formatClock } from './format';
import { NumberPad } from './NumberPad';

export function RoundScreen({ state, dispatch }: AppProps) {
  const urgent = isFinalTenSeconds(state);
  const tier = tierForStreak(state.streak);
  const skill = skillFor(state.skill);
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
            ✏️ {skill.practiceLabel(state.practiceTable)} practice
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
          {skill.exampleRows ? (
            // The Machine: a glowing training pod shows what it did to the
            // example inputs; the kid cracks the Secret Rule and answers for
            // the jump input — or names the rule itself.
            <div
              class="machine-panel"
              data-testid="machine-panel"
              key={`${state.question.a}x${state.question.b}:${state.question.input}`}
            >
              <div class="machine-title">Crack the secret rule!</div>
              {skill.exampleRows(state.question).map((row) => (
                <div class="machine-row" data-testid={`machine-row-${row.input}`} key={row.input}>
                  <span class="machine-in">{row.input}</span>
                  <span class="machine-arrow">→</span>
                  <span class="machine-out">{row.output}</span>
                </div>
              ))}
              {!state.question.cards && (
                <div class="machine-row machine-query question" data-testid="question">
                  <span class="machine-in">{state.question.input}</span>
                  <span class="machine-arrow">→</span>
                  <span class="answer" data-testid="answer" key={state.answerBuffer}>
                    {state.answerBuffer === '' ? '?' : state.answerBuffer}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div
              class="question"
              data-testid="question"
              key={`${state.question.a}x${state.question.b}`}
            >
              {skill.display(state.question)}
              {!state.question.cards && (
                <>
                  {skill.promptSeparator}
                  <span class="answer" data-testid="answer" key={state.answerBuffer}>
                    {state.answerBuffer === '' ? '?' : state.answerBuffer}
                  </span>
                </>
              )}
            </div>
          )}
          {state.question.cards ? (
            // Name-the-Rule: three big cards replace the pad; the tap fires
            // the blast (keys 1–3 work too).
            <div class="rule-cards" data-testid="rule-cards">
              <div class="rule-cards-title">Name the secret rule!</div>
              {state.question.cards.labels.map((label, i) => (
                <button
                  key={label}
                  class="big-button rule-card"
                  data-testid={`rule-card-${i + 1}`}
                  onClick={() => {
                    dispatch({ type: 'DIGIT_PRESSED', digit: i + 1 });
                    dispatch({ type: 'ANSWER_SUBMITTED' });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <NumberPad dispatch={dispatch} armed={state.answerBuffer !== ''} />
          )}
        </>
      ) : state.feedback.question.cards ? (
        <div class="feedback" data-testid="feedback">
          <div class="feedback-title">Almost! The rule was:</div>
          <div class="rule-cards">
            {state.feedback.question.cards.labels.map((label, i) => (
              <div
                key={label}
                class={`big-button rule-card${
                  i + 1 === state.feedback?.question.cards?.correct ? ' rule-card-correct' : ''
                }`}
                data-testid={`rule-reveal-${i + 1}`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div class="feedback" data-testid="feedback">
          <div class="feedback-title">Almost! Remember:</div>
          <div class="feedback-equation">{skill.reveal(state.feedback.question)}</div>
        </div>
      )}
    </div>
  );
}
