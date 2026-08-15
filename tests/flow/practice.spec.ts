import { expect, test } from '@playwright/test';
import { answerOnPad, createHero, openGame, readCorrectAnswer, startRound } from './helpers';

test('practicing a number asks only that times table', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=99');
  await createHero(page, 'Zara');

  await page.getByTestId('practice-3').click();
  await expect(page.getByTestId('mode-hint')).toContainText('Only 3×');
  await startRound(page);

  await expect(page.getByTestId('practice-badge')).toContainText('3× practice');
  for (let i = 0; i < 6; i++) {
    const text = await page.getByTestId('question').innerText();
    const match = text.match(/(\d+)\s*×\s*(\d+)/);
    expect(match).not.toBeNull();
    const [a, b] = [Number(match?.[1]), Number(match?.[2])];
    expect(a === 3 || b === 3).toBe(true);
    await answerOnPad(page, a * b);
  }
});

test('picking a difficulty leaves practice mode', async ({ page }) => {
  await openGame(page);
  await createHero(page, 'Zara');

  await page.getByTestId('practice-5').click();
  await expect(page.getByTestId('practice-5')).toHaveClass(/mode-selected/);

  await page.getByTestId('difficulty-medium').click();
  await expect(page.getByTestId('practice-5')).not.toHaveClass(/mode-selected/);
  await expect(page.getByTestId('difficulty-medium')).toHaveClass(/mode-selected/);

  // The tier cards explain what each difficulty actually asks.
  await expect(page.getByTestId('difficulty-easy')).toContainText('Tables 1–5');
  await expect(page.getByTestId('difficulty-easy')).toContainText('+10 pts');
  await startRound(page);
  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer);
  await expect(page.getByTestId('score')).toContainText('20'); // Medium base points
});
