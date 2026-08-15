// The Game Core's public vocabulary. Later tickets extend these unions —
// they never add a second entry point (ADR 0003, docs/ARCHITECTURE.md).

/** A multiplication question in the operand order it is displayed. */
export interface Question {
  a: number;
  b: number;
}

export interface GameConfig {
  /** Seed for the injected PRNG — the core never calls Math.random. */
  seed: number;
}

export interface GameState {
  /** Injected PRNG state; advanced immutably by every random draw. */
  prng: number;
  score: number;
  question: Question;
  /** Digits typed so far, most recent last. Submit is an explicit event. */
  answerBuffer: string;
}

export type GameEvent =
  | { type: 'DIGIT_PRESSED'; digit: number }
  | { type: 'BACKSPACE_PRESSED' }
  | { type: 'ANSWER_SUBMITTED' };

export type GameEffect =
  | { type: 'ANSWER_CORRECT'; question: Question; points: number }
  | { type: 'ANSWER_WRONG'; question: Question; correctAnswer: number }
  | { type: 'QUESTION_ASKED'; question: Question };

export interface UpdateResult {
  state: GameState;
  effects: GameEffect[];
}
