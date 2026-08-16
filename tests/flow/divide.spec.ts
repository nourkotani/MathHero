import { expect, test } from '@playwright/test';
import {
  advanceClock,
  answerOnPad,
  createHero,
  openGame,
  readCorrectAnswer,
  startRound,
} from './helpers';

test('a Divide Round end-to-end: pick ➗, answer divisions, score climbs', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=41');
  await createHero(page, 'Zara');

  await page.getByTestId('skill-divide').click();
  await expect(page.getByTestId('skill-divide')).toHaveClass(/mode-selected/);
  await startRound(page);

  for (let i = 0; i < 3; i++) {
    const text = await page.getByTestId('question').innerText();
    const match = text.match(/(\d+)\s*÷\s*(\d+)/);
    expect(match, `division prompt, got: ${text}`).not.toBeNull();
    const [dividend, divisor] = [Number(match?.[1]), Number(match?.[2])];
    expect(dividend % divisor, 'divisions are always exact').toBe(0);
    await answerOnPad(page, dividend / divisor);
  }
  // Easy base points with the Power Streak igniting on the 3rd: 10 + 10 + 20.
  await expect(page.getByTestId('score')).toContainText('40');
});

test('÷-table practice asks only divisions by the chosen table', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=42');
  await createHero(page, 'Zara');

  await page.getByTestId('skill-divide').click();
  await page.getByTestId('practice-3').click();
  await expect(page.getByTestId('mode-hint')).toContainText('Only ÷3');
  await startRound(page);

  await expect(page.getByTestId('practice-badge')).toContainText('÷3 practice');
  for (let i = 0; i < 4; i++) {
    const text = await page.getByTestId('question').innerText();
    const match = text.match(/(\d+)\s*÷\s*3\b/);
    expect(match, `÷3 prompt, got: ${text}`).not.toBeNull();
    await answerOnPad(page, await readCorrectAnswer(page));
  }
});

test('a Divide best celebrates per Skill and lands on leaderboard and grid', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=44');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-divide').click();
  await startRound(page);

  await answerOnPad(page, await readCorrectAnswer(page));
  await advanceClock(page, 200_000);

  // Results names the Skill; the celebration is visibly the ➗ record.
  await expect(page.getByTestId('results-skill')).toContainText('➗');
  await expect(page.getByTestId('personal-best')).toContainText('➗');
  await expect(page.getByTestId('personal-best')).toContainText('PERSONAL BEST');

  await page.getByTestId('play-again').click();
  await page.getByTestId('back-to-title').click();
  await expect(page.getByTestId('leaderboard-p1-divide')).toContainText('10');
  await expect(page.getByTestId('leaderboard-p1-multiply')).toContainText('—');

  // The Mastery Grid opens on the last-played Skill (Divide, with progress)
  // and the Multiply view is honestly untouched.
  await page.getByTestId('grid-p1').click();
  await expect(page.getByTestId('grid-skill-divide')).toHaveClass(/mode-selected/);
  const practiced = page.locator('.mastery-learning, .mastery-mastered, .mastery-struggling');
  expect(await practiced.count()).toBeGreaterThan(0);
  await page.getByTestId('grid-skill-multiply').click();
  expect(await practiced.count()).toBe(0);
});

test('a wrong division teaches the full equation', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=43');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-divide').click();
  await startRound(page);

  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer + 1);
  await expect(page.getByTestId('feedback')).toContainText('÷');
  await expect(page.getByTestId('feedback')).toContainText(`= ${answer}`);
});
