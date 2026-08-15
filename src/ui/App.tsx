import type { GameEvent, GameState } from '../core';
import { PreRoundScreen } from './PreRoundScreen';
import { ResultsScreen } from './ResultsScreen';
import { RoundScreen } from './RoundScreen';

export interface AppProps {
  state: GameState;
  dispatch: (event: GameEvent) => void;
}

// Screens key off the core's phase field; future screens (Title, Hero
// creation) are new phase values, not new wiring.
export function App({ state, dispatch }: AppProps) {
  switch (state.phase) {
    case 'pre-round':
      return <PreRoundScreen state={state} dispatch={dispatch} />;
    case 'in-round':
      return <RoundScreen state={state} dispatch={dispatch} />;
    case 'results':
      return <ResultsScreen state={state} dispatch={dispatch} />;
  }
}
