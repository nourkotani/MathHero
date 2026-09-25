import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { advanceClock, openGame, readCorrectAnswer } from './helpers';

// The WebKit smoke set (ADR 0006): iOS runs only WebKit, so the check gate
// plays one whole Round in it at the phone and iPad viewports. The full
// suite stays on Chromium; this file also runs there, where it is cheap.

test('boot, one Round by touch, then Results, with no page errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // R3F reports a failed scene component on the console, not as a page
  // error (ADR 0009): a missing JSX element blanks the Rival silently.
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const press = (target: Locator) => (testInfo.project.use.hasTouch ? target.tap() : target.click());

  await openGame(page, '?testClock=1&seed=701');
  await press(page.getByTestId('new-hero'));
  await page.getByTestId('hero-name').fill('Wes');
  await press(page.getByTestId('create-hero'));
  await press(page.getByTestId('start-round'));

  for (let i = 0; i < 3; i++) {
    for (const digit of String(await readCorrectAnswer(page))) {
      await press(page.getByTestId(`pad-${digit}`));
    }
    await press(page.getByTestId('pad-submit'));
    await expect(page.getByTestId('feedback')).toHaveCount(0);
    await expect(page.getByTestId('answer')).toHaveText('?');
  }
  await advanceClock(page, 200_000);

  // 3 unbroken correct answers on Easy: 2×10 + 1×20.
  await expect(page.getByTestId('final-score')).toContainText('40');
  expect(errors).toEqual([]);
});
