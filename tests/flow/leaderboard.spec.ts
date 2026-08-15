import { expect, test } from '@playwright/test';
import { advanceClock, answerOnPad, createHero, openGame, readCorrectAnswer, startRound } from './helpers';

test('a scoring Round celebrates a Personal Best and fills the leaderboard', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=88');
  await createHero(page, 'Zara');
  await startRound(page);

  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer);
  await advanceClock(page, 200_000);

  // First scoring Round on this difficulty → celebration on Results.
  await expect(page.getByTestId('personal-best')).toContainText('NEW PERSONAL BEST');

  // The Title screen's Family Leaderboard compares the family's bests.
  await page.getByTestId('play-again').click();
  await page.getByTestId('back-to-title').click();
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  await expect(page.getByTestId('leaderboard-p1')).toContainText('Zara');
  await expect(page.getByTestId('leaderboard-p1')).toContainText('Easy: 10');
});
