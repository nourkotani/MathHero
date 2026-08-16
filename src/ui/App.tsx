import type { Difficulty, GameEvent, GameState, Skill } from '../core';
import { HeroCreationScreen } from './HeroCreationScreen';
import { PreRoundScreen } from './PreRoundScreen';
import { ResultsScreen } from './ResultsScreen';
import { RoundScreen } from './RoundScreen';
import { TitleScreen } from './TitleScreen';

/** The NEW_PERSONAL_BEST payload the shell hands the Results screen. */
export interface BestCelebration {
  skill: Skill;
  difficulty: Difficulty;
  score: number;
}

export interface AppProps {
  state: GameState;
  dispatch: (event: GameEvent) => void;
  /** Set by the shell when a NEW_PERSONAL_BEST effect fires; cleared on leaving Results. */
  newBest?: BestCelebration | null;
  /** LEVEL_UP effects captured by the shell for this Results screen, in order. */
  levelUps?: Array<{ level: number; cosmeticLabel?: string; landmark?: boolean }>;
}

// Screens key off the core's phase field; a future screen is a new phase
// value, not new wiring.
export function App({ state, dispatch, newBest, levelUps }: AppProps) {
  switch (state.phase) {
    case 'title':
      return <TitleScreen state={state} dispatch={dispatch} />;
    case 'hero-creation':
      return <HeroCreationScreen state={state} dispatch={dispatch} />;
    case 'pre-round':
      return <PreRoundScreen state={state} dispatch={dispatch} />;
    case 'in-round':
      return <RoundScreen state={state} dispatch={dispatch} />;
    case 'results':
      return <ResultsScreen state={state} dispatch={dispatch} newBest={newBest} levelUps={levelUps} />;
  }
}
