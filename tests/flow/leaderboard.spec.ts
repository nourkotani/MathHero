import { expect, test } from '@playwright/test';
import { advanceClock, answerOnPad, createHero, openGame, readCorrectAnswer, startRound } from './helpers';

test('a scoring Round celebrates a Personal Best and fills the leaderboard', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=88');
  await createHero(page, 'Zara');
  await startRound(page);

  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer);
  await advanceClock(page, 200_000);

  // First scoring Round on this difficulty → celebration on Results,
  // visibly stamped with the Skill that earned it.
  await expect(page.getByTestId('personal-best')).toContainText('PERSONAL BEST');
  await expect(page.getByTestId('personal-best')).toContainText('✖');

  // The Title screen's Family Leaderboard compares the family's bests.
  await page.getByTestId('play-again').click();
  await page.getByTestId('back-to-title').click();
  await expect(page.getByTestId('leaderboard')).toBeVisible();
  await expect(page.getByTestId('leaderboard-p1')).toContainText('Zara');
  // Bests read per Skill, side by side: the Multiply column holds the score,
  // the never-played Divide column stays honestly empty.
  await expect(page.getByTestId('leaderboard-p1-multiply')).toContainText('10');
  await expect(page.getByTestId('leaderboard-p1-divide')).toContainText('—');
});
