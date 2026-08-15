import type { AppProps } from './App';

export function ResultsScreen({ state, dispatch }: AppProps) {
  return (
    <div class="hud screen-center">
      <h1 class="screen-title">Time's up!</h1>
      <div class="final-score" data-testid="final-score">
        ⭐ {state.score} points
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
