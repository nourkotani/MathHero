import { levelForXp } from '../core';
import type { AppProps } from './App';

export function ResultsScreen({ state, dispatch, newBest, levelUps = [] }: AppProps) {
  const player = state.players.find((p) => p.id === state.activePlayerId);
  const level = levelForXp(player?.xp ?? 0);
  const reachedLevel = levelUps.at(-1)?.level;

  return (
    <div class="hud screen-center">
      <h1 class="screen-title">Time's up!</h1>
      <div class="final-score" data-testid="final-score">
        ⭐ {state.score} points
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
          🏆 NEW PERSONAL BEST!
        </div>
      )}
      {reachedLevel !== undefined && (
        <div class="level-up-banner" data-testid="level-up">
          🎉 LEVEL UP! You reached Level {reachedLevel}!
          {levelUps
            .filter((up) => up.cosmeticLabel !== undefined)
            .map((up) => (
              <div class="cosmetic-unlock" key={up.level}>
                ✨ Unlocked: {up.cosmeticLabel}!
              </div>
            ))}
        </div>
      )}
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
