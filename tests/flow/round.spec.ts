import { expect, test } from '@playwright/test';
import { advanceClock, answerOnPad, openGame, readCorrectAnswer, startRound } from './helpers';

test('the timer is settable on the pre-round screen', async ({ page }) => {
  await openGame(page);

  await expect(page.getByTestId('timer-display')).toContainText('2:00');
  await page.getByTestId('timer-decrease').click();
  await expect(page.getByTestId('timer-display')).toContainText('1:30');
  await page.getByTestId('timer-increase').click();
  await expect(page.getByTestId('timer-display')).toContainText('2:00');
});

test('a complete Round: countdown, urgency pulse, Results, play again', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=777');
  await startRound(page);

  await expect(page.getByTestId('countdown')).toContainText('2:00');

  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer);
  await expect(page.getByTestId('score')).toContainText('1');

  // Jump to the final ten seconds: the countdown turns urgent.
  await advanceClock(page, 110_000);
  await expect(page.getByTestId('countdown')).toContainText('0:10');
  await expect(page.getByTestId('countdown')).toHaveClass(/countdown-urgent/);

  // Type part of an answer, then let the timer expire: the Round ends
  // instantly and the in-progress question scores nothing.
  await page.getByTestId('pad-9').click();
  await advanceClock(page, 10_001);
  await expect(page.getByTestId('final-score')).toContainText('1');

  await page.getByTestId('play-again').click();
  await expect(page.getByTestId('start-round')).toBeVisible();
  await expect(page.getByTestId('timer-display')).toContainText('2:00');
});
