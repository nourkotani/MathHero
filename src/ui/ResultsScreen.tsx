import { levelForXp, skillFor } from '../core';
import type { AppProps } from './App';

export function ResultsScreen({ state, dispatch, newBest, levelUps = [] }: AppProps) {
  const player = state.players.find((p) => p.id === state.activePlayerId);
  const level = levelForXp(player?.xp ?? 0);
  const reachedLevel = levelUps.at(-1)?.level;
  const skill = skillFor(state.skill);

  return (
    <div class="hud screen-center">
      <h1 class="screen-title">Time's up!</h1>
      <div class="final-score" data-testid="final-score">
        <span class="power-orb" /> {state.score} points{' '}
        <span class="results-skill" data-testid="results-skill" title={skill.label}>
          {skill.symbol}
        </span>
      </div>
      <div class="results-row">
        <div class="xp-gain" data-testid="xp-gain">
          +{state.score} XP
        </div>
        <div class="best-streak" data-testid="best-streak">
          🔥 Best streak: {state.bestStreak}
        </div>
      </div>
      {newBest && (
        <div class="best-banner" data-testid="personal-best">
          🏆 NEW {skillFor(newBest.skill).symbol} PERSONAL BEST!
        </div>
      )}
      {reachedLevel !== undefined && (
        <div
          class={levelUps.some((up) => up.landmark) ? 'level-up-banner landmark' : 'level-up-banner'}
          data-testid="level-up"
        >
          🎉 LEVEL UP! You reached Level {reachedLevel}!
          {levelUps
            .filter((up) => up.cosmeticLabel !== undefined)
            .map((up) =>
              up.landmark ? (
                <div class="cosmetic-unlock landmark-unlock" key={up.level} data-testid="landmark">
                  🌟 TRANSFORMATION! {up.cosmeticLabel}!
                </div>
              ) : (
                <div class="cosmetic-unlock" key={up.level}>
                  ✨ Unlocked: {up.cosmeticLabel}!
                </div>
              ),
            )}
        </div>
      )}
      {levelUps.some((up) => up.landmark) && <div class="landmark-flash" />}
      <div class="hero-level" data-testid="hero-level">
        {player?.name} — Level {level}
      </div>
      <p class="encourage">Awesome training session!</p>
      <button
        class="big-button"
        data-testid="play-again"
        onClick={() => dispatch({ type: 'PLAY_AGAIN' })}
      >
        Train again!
      </button>
    </div>
  );
}
