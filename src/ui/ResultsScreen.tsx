import { levelForXp, unlockedCosmetics } from '../core';
import type { AppProps } from './App';

export function ResultsScreen({ state, dispatch, newBest }: AppProps) {
  const player = state.players.find((p) => p.id === state.activePlayerId);
  const xp = player?.xp ?? 0;
  const level = levelForXp(xp);
  const levelBefore = levelForXp(xp - state.score);
  const levelsGained = level - levelBefore;
  const newCosmetics = unlockedCosmetics(level).filter((c) => c.level > levelBefore);

  return (
    <div class="hud screen-center">
      <h1 class="screen-title">Time's up!</h1>
      <div class="final-score" data-testid="final-score">
        ⭐ {state.score} points
      </div>
      <div class="xp-gain" data-testid="xp-gain">
        +{state.score} XP
      </div>
      {newBest && (
        <div class="best-banner" data-testid="personal-best">
          🏆 NEW PERSONAL BEST!
        </div>
      )}
      {levelsGained > 0 && (
        <div class="level-up-banner" data-testid="level-up">
          🎉 LEVEL UP! You reached Level {level}!
          {newCosmetics.map((c) => (
            <div class="cosmetic-unlock" key={c.id}>
              ✨ Unlocked: {c.label}!
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
