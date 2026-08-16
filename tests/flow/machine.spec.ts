import { expect, test } from '@playwright/test';
import {
  advanceClock,
  answerOnPad,
  answerQuestion,
  cardsShowing,
  createHero,
  openGame,
  readCorrectAnswer,
  readMachineRule,
  startRound,
} from './helpers';

test('a Machine Round end-to-end: pick ⚙️, crack rules, triple points climb', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=51');
  await createHero(page, 'Zara');

  await page.getByTestId('skill-machine').click();
  await expect(page.getByTestId('skill-machine')).toHaveClass(/mode-selected/);
  await startRound(page);

  for (let i = 0; i < 3; i++) {
    // The training pod shows its example rows for inputs 1, 2, 3...
    await expect(page.getByTestId('machine-panel')).toBeVisible();
    const rows = await Promise.all(
      [1, 2, 3].map((n) => page.getByTestId(`machine-row-${n}`).innerText()),
    );
    const outputs = rows.map((r) => Number(r.match(/→\s*(\d+)/)?.[1]));
    // ...and they obey one linear Secret Rule (a genuine two-step machine).
    expect(outputs[1]! - outputs[0]!).toBe(outputs[2]! - outputs[1]!);
    if (!(await cardsShowing(page))) {
      // The query is a jump input, never one of the examples.
      const query = await page.getByTestId('question').innerText();
      const input = Number(query.match(/(\d+)\s*→/)?.[1]);
      expect(input).toBeGreaterThanOrEqual(5);
      expect(input).toBeLessThanOrEqual(12);
    }
    await answerQuestion(page);
  }
  // Easy base ×3 with the Power Streak igniting on the 3rd: 30 + 30 + 60.
  await expect(page.getByTestId('score')).toContainText('120');
});

test('×8 machine practice: every Secret Rule multiplies by 8', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=52');
  await createHero(page, 'Zara');

  await page.getByTestId('skill-machine').click();
  await page.getByTestId('practice-8').click();
  await expect(page.getByTestId('mode-hint')).toContainText('Only ×8');
  await startRound(page);

  await expect(page.getByTestId('practice-badge')).toContainText('×8 practice');
  for (let i = 0; i < 4; i++) {
    const { a } = await readMachineRule(page);
    expect(a, 'the multiplier is pinned to the table').toBe(8);
    await answerQuestion(page);
  }
});

test('a Machine best celebrates per Skill and lands on leaderboard and grid', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=53');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-machine').click();
  await startRound(page);

  await answerQuestion(page);
  await advanceClock(page, 200_000);

  // Results names the Skill; the celebration is visibly the ⚙️ record.
  await expect(page.getByTestId('results-skill')).toContainText('⚙');
  await expect(page.getByTestId('personal-best')).toContainText('⚙');
  await expect(page.getByTestId('personal-best')).toContainText('PERSONAL BEST');

  await page.getByTestId('play-again').click();
  await page.getByTestId('back-to-title').click();
  await expect(page.getByTestId('leaderboard-p1-machine')).toContainText('30');
  await expect(page.getByTestId('leaderboard-p1-multiply')).toContainText('—');

  // The Mastery Grid opens on the last-played Skill (Machine, with progress).
  await page.getByTestId('grid-p1').click();
  await expect(page.getByTestId('grid-skill-machine')).toHaveClass(/mode-selected/);
  const practiced = page.locator('.mastery-learning, .mastery-mastered, .mastery-struggling');
  expect(await practiced.count()).toBeGreaterThan(0);
});

test('a wrong Machine answer teaches the Secret Rule', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=54');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-machine').click();
  await startRound(page);

  // Skip past any Name-the-Rule surprises to a compute Question.
  for (let i = 0; i < 12 && (await cardsShowing(page)); i++) await answerQuestion(page);
  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer + 1);
  await expect(page.getByTestId('feedback')).toContainText('The rule was ×');
  await expect(page.getByTestId('feedback')).toContainText(`→ ${answer}`);
});
