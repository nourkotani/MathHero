import { expect, test } from '@playwright/test';
import { advanceClock, answerOnPad, openGame, readCorrectAnswer, startRound } from './helpers';

test('the streak multiplier appears and a wrong answer teaches the equation', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=4242');
  await startRound(page);

  // Three straight correct answers ignite the ×2 aura.
  for (let i = 0; i < 3; i++) {
    const answer = await readCorrectAnswer(page);
    await answerOnPad(page, answer);
  }
  await expect(page.getByTestId('multiplier')).toHaveText('×2');

  // A wrong answer breaks the streak and shows the correct equation.
  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer + 1);
  await expect(page.getByTestId('feedback')).toContainText(`= ${answer}`);
  await expect(page.getByTestId('multiplier')).not.toBeVisible();

  // When the teaching moment expires, a fresh question appears at ×1.
  await advanceClock(page, 2500);
  await expect(page.getByTestId('question')).toBeVisible();
});
