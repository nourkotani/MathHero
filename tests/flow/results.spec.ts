import { expect, test } from '@playwright/test';
import { advanceClock, answerOnPad, createHero, openGame, readCorrectAnswer, startRound } from './helpers';

test('the Results screen shows the XP gained', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=31');
  await createHero(page, 'Zara');
  await startRound(page);

  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer);
  await advanceClock(page, 200_000);

  await expect(page.getByTestId('final-score')).toContainText('10');
  await expect(page.getByTestId('xp-gain')).toHaveText('+10 XP');
  await expect(page.getByTestId('hero-level')).toContainText('Zara — Level 0');

  // XP survives a restart via the Save File.
  await page.reload();
  await expect(page.getByTestId('player-p1')).toContainText('Lv 0');
});
