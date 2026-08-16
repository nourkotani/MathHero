import {
  DIFFICULTY_TIERS,
  MAX_PRACTICE_TABLE,
  MAX_TIMER_SECONDS,
  MIN_PRACTICE_TABLE,
  MIN_TIMER_SECONDS,
  PRACTICE_BASE_POINTS,
  SKILL_DEFS,
  skillFor,
} from '../core';
import type { AppProps } from './App';
import { formatClock } from './format';

const TIMER_STEP_SECONDS = 30;

const PRACTICE_TABLES = Array.from(
  { length: MAX_PRACTICE_TABLE - MIN_PRACTICE_TABLE + 1 },
  (_, i) => MIN_PRACTICE_TABLE + i,
);

export function PreRoundScreen({ state, dispatch }: AppProps) {
  const change = (delta: number) =>
    dispatch({ type: 'TIMER_CHANGED', seconds: state.timerSeconds + delta });

  const activePlayer = state.players.find((p) => p.id === state.activePlayerId);
  const practicing = state.practiceTable !== null;
  const skill = skillFor(state.skill);

  return (
    <div class="hud screen-center pre-round">
      <button
        class="corner-button"
        data-testid="back-to-title"
        onClick={() => dispatch({ type: 'TITLE_OPENED' })}
      >
        ← Heroes
      </button>
      <h1 class="screen-title" data-testid="active-player">
        Ready, {activePlayer?.name ?? 'hero'}?
      </h1>

      <div class="picker-section">
        <div class="picker-label">Pick your power</div>
        <div class="skill-picker">
          {SKILL_DEFS.map((def) => (
            <button
              key={def.id}
              class={`mode-card skill-card${state.skill === def.id ? ' mode-selected' : ''}`}
              data-testid={`skill-${def.id}`}
              onClick={() => dispatch({ type: 'SKILL_CHANGED', skill: def.id })}
            >
              <span class="skill-symbol">{def.symbol}</span>
              <span class="skill-text">
                <span class="mode-name">{def.label}</span>
                <span class="skill-tagline">{def.tagline}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div class="picker-section">
        <div class="picker-label">Pick your challenge</div>
        <div class="difficulty-picker">
          {DIFFICULTY_TIERS.map((tier) => (
            <button
              key={tier.id}
              class={`mode-card${!practicing && state.difficulty === tier.id ? ' mode-selected' : ''}`}
              data-testid={`difficulty-${tier.id}`}
              onClick={() => dispatch({ type: 'DIFFICULTY_CHANGED', difficulty: tier.id })}
            >
              <span class="mode-name">{tier.label}</span>
              <span class="mode-detail">
                Tables {tier.tableMin}–{tier.tableMax}
              </span>
              <span class="mode-points">+{tier.basePoints} pts</span>
            </button>
          ))}
        </div>
        <div class="picker-hint" data-testid="mode-hint">
          {state.practiceTable !== null
            ? `Only ${skill.practiceLabel(state.practiceTable)} questions — go master that table! (+${PRACTICE_BASE_POINTS} pts each)`
            : 'One number comes from those tables — the other can be anything up to 12!'}
        </div>
      </div>

      <div class="picker-section">
        <div class="picker-label">…or practice one table</div>
        <div class="practice-picker">
          {PRACTICE_TABLES.map((table) => (
            <button
              key={table}
              class={`practice-chip${state.practiceTable === table ? ' mode-selected' : ''}`}
              data-testid={`practice-${table}`}
              onClick={() => dispatch({ type: 'PRACTICE_TABLE_CHANGED', table })}
            >
              {skill.practiceChip(table)}
            </button>
          ))}
        </div>
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
