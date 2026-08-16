import { describe, expect, it } from 'vitest';
import { skillFor, update } from './index';
import type { GameEffect, GameState, Question, Skill } from './index';
import {
  answerCorrectly,
  dispatchAll,
  freshRound,
  submitAnswer as submit,
  typeDigits,
} from './test-helpers';

// Name-the-Rule 🃏: ~1 in 3 detective Questions swap the pad for 3 rule
// cards. The correct card's number is the answer through the unchanged
// grading pipeline; distractors are semantic traps that can never equal the
// truth; recall Skills never see cards.

const has = (effects: GameEffect[], type: GameEffect['type']) =>
  effects.some((e) => e.type === type);

/** A running Round pinned to the given dressed card Question. */
function askingCards(skill: Skill, question: Question): GameState {
  const state = freshRound(1300 + question.a * 13 + question.b, undefined, skill);
  return { ...state, question };
}

/** Dress the Fact repeatedly until the modality draw lands on cards. */
function dressUntilCards(
  skill: Skill,
  fact: Question,
  accept: (q: Question) => boolean = () => true,
): Question {
  for (let prng = 1; prng < 5000; prng++) {
    const { question } = skillFor(skill).dress(fact, { practiceTable: null }, prng);
    if (question.cards && accept(question)) return question;
  }
  throw new Error(`no card question found for ${fact.a},${fact.b}`);
}

describe('card grading through the unchanged pipeline', () => {
  const question = dressUntilCards('machine', { a: 3, b: 2 });

  it('accepts only the correct card number; the other two break the streak', () => {
    const correct = submit(askingCards('machine', question), question.cards!.correct);
    expect(has(correct.effects, 'ANSWER_CORRECT')).toBe(true);
    // Cards pay exactly like that Skill's compute Questions: Easy 10 × 3.
    expect(correct.state.score).toBe(30);

    for (let card = 1; card <= 3; card++) {
      if (card === question.cards!.correct) continue;
      const wrong = submit(askingCards('machine', question), card);
      expect(has(wrong.effects, 'ANSWER_WRONG'), `card ${card}`).toBe(true);
      expect(wrong.state.score).toBe(0);
      expect(wrong.state.streak).toBe(0);
    }
  });

  it('pad digits outside 1–3 and second digits can never reach the grader', () => {
    const state = askingCards('machine', question);
    for (const digit of [0, 4, 7, 9]) {
      expect(update(state, { type: 'DIGIT_PRESSED', digit }).state.answerBuffer).toBe('');
    }
    const typed = update(state, { type: 'DIGIT_PRESSED', digit: 2 }).state;
    expect(typed.answerBuffer).toBe('2');
    expect(update(typed, { type: 'DIGIT_PRESSED', digit: 1 }).state.answerBuffer).toBe('2');
  });

  it('records the attempt into the same Fact mastery as compute Questions', () => {
    const state = update(askingCards('machine', question), { type: 'TICK', now: 1400 }).state;
    const right = submit(state, question.cards!.correct).state.players[0];
    expect(right?.factStats.machine['2x3']).toEqual([{ correct: true, ms: 1400 }]);
    const wrongCard = question.cards!.correct === 1 ? 2 : 1;
    const wrong = submit(state, wrongCard).state.players[0];
    expect(wrong?.factStats.machine['2x3']).toEqual([{ correct: false, ms: 1400 }]);
  });

  it('a wrong pick opens a teaching moment carrying the card set', () => {
    const wrongCard = question.cards!.correct === 1 ? 2 : 1;
    const wrong = submit(askingCards('machine', question), wrongCard);
    expect(wrong.state.feedback?.question.cards).toEqual(question.cards);
    expect(wrong.state.feedback?.correctAnswer).toBe(question.cards!.correct);
    const during = dispatchAll(wrong.state, typeDigits(2));
    expect(during.answerBuffer).toBe('');
  });
});

describe('the card mix', () => {
  it('hits roughly a third of Machine and Pattern Questions', () => {
    for (const skill of ['machine', 'pattern'] as const) {
      let carded = 0;
      const total = 400;
      let state = freshRound(1301, undefined, skill);
      for (let i = 0; i < total; i++) {
        if (state.question.cards) carded++;
        state = answerCorrectly(state).state;
      }
      const rate = carded / total;
      expect(rate, `${skill} card rate ${rate}`).toBeGreaterThan(0.2);
      expect(rate, `${skill} card rate ${rate}`).toBeLessThan(0.5);
    }
  });

  it('never appears in the recall Skills', () => {
    for (const skill of ['multiply', 'divide'] as const) {
      let state = freshRound(1302, undefined, skill);
      for (let i = 0; i < 150; i++) {
        expect(state.question.cards).toBeUndefined();
        state = answerCorrectly(state).state;
      }
    }
  });
});

describe('distractors, exhaustively', () => {
  const distinctAndHonest = (question: Question, truthLabel: string) => {
    const { labels, correct } = question.cards!;
    expect(new Set(labels).size, labels.join(' | ')).toBe(3);
    expect(labels[correct - 1]).toBe(truthLabel);
    for (let i = 0; i < 3; i++) {
      if (i !== correct - 1) expect(labels[i]).not.toBe(truthLabel);
    }
  };

  it('every Machine rule gets 3 distinct cards with exactly one truth', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const question = dressUntilCards('machine', { a, b });
        const truth = a === 1 ? `just + ${b}` : `× ${a} then + ${b}`;
        distinctAndHonest(question, truth);
      }
    }
  });

  it('the one-step trap never masquerades as the ×1 truth (degenerate Facts)', () => {
    // For ×1 + b the one-step rule IS the truth — the builder must dodge it.
    for (const fact of [
      { a: 1, b: 1 },
      { a: 1, b: 5 },
      { a: 4, b: 4 },
      { a: 2, b: 3 },
    ]) {
      const question = dressUntilCards('machine', fact);
      const truth = fact.a === 1 ? `just + ${fact.b}` : `× ${fact.a} then + ${fact.b}`;
      distinctAndHonest(question, truth);
    }
  });

  it('every skip-count chain gets the doubling cross-trap; every twist gets the first-gap trap', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const question = dressUntilCards('pattern', { a, b }, (q) => q.wear === 'add');
        distinctAndHonest(question, `+ ${question.b} each time`);
        expect(question.cards!.labels).toContain('× 2 each time');
      }
    }
    for (const fact of [
      { a: 2, b: 5 },
      { a: 3, b: 12 },
      { a: 2, b: 3 },
      { a: 2, b: 2 },
    ]) {
      const question = dressUntilCards('pattern', fact, (q) => q.wear !== 'add');
      const m = question.b;
      distinctAndHonest(question, `× ${m} each time`);
      // The additive trap fits only the first gap of the geometric chain.
      expect(question.cards!.labels).toContain(`+ ${question.a * m - question.a} each time`);
    }
  });
});
