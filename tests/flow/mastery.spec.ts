import { expect, test } from '@playwright/test';
import { advanceClock, answerOnPad, createHero, openGame, readCorrectAnswer, startRound } from './helpers';

test('the Mastery Grid opens per player and reflects attempts', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=61');
  await createHero(page, 'Zara');
  await startRound(page);

  // Answer one question correctly so at least one Fact stops being gray.
  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer);
  await advanceClock(page, 200_000);
  await page.getByTestId('play-again').click();
  await page.getByTestId('back-to-title').click();

  await page.getByTestId('grid-p1').click();
  await expect(page.getByTestId('mastery-grid')).toBeVisible();
  // A full 12×12 chart renders.
  await expect(page.getByTestId('cell-12-12')).toBeVisible();
  const practiced = page.locator('.mastery-learning, .mastery-mastered, .mastery-struggling');
  expect(await practiced.count()).toBeGreaterThan(0);

  // A multiply-only hero's Divide view is honestly all-unseen.
  await page.getByTestId('grid-skill-divide').click();
  expect(await practiced.count()).toBe(0);

  await page.getByTestId('close-grid').click();
  await expect(page.getByTestId('mastery-grid')).not.toBeVisible();
});
