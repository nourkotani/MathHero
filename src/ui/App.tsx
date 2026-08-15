import type { GameEvent, GameState } from '../core';
import { NumberPad } from './NumberPad';

export interface AppProps {
  state: GameState;
  dispatch: (event: GameEvent) => void;
}

export function App({ state, dispatch }: AppProps) {
  return (
    <div class="hud">
      <div class="score" data-testid="score">
        ⭐ {state.score}
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
