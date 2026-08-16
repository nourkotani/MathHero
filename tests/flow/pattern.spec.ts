import { expect, test } from '@playwright/test';
import {
  advanceClock,
  answerOnPad,
  answerQuestion,
  cardsShowing,
  createHero,
  openGame,
  readChainTerms,
  readCorrectAnswer,
  startRound,
} from './helpers';

test('a Pattern Round end-to-end: pick 🔁, continue chains, double points climb', async ({
  page,
}) => {
  await openGame(page, '?testClock=1&seed=61');
  await createHero(page, 'Zara');

  await page.getByTestId('skill-pattern').click();
  await expect(page.getByTestId('skill-pattern')).toHaveClass(/mode-selected/);
  await startRound(page);

  for (let i = 0; i < 3; i++) {
    const [t1, t2, t3, t4] = await readChainTerms(page);
    // Every chain obeys one rule: equal steps, or one constant ratio.
    const additive = t2 - t1 === t3 - t2 && t3 - t2 === t4 - t3;
    const geometric = t2 % t1 === 0 && t2 / t1 === t3 / t2 && t3 / t2 === t4 / t3;
    expect(additive || geometric, `chain must follow a rule: ${t1},${t2},${t3},${t4}`).toBe(true);
    await answerQuestion(page);
  }
  // Easy base ×2 with the Power Streak igniting on the 3rd: 20 + 20 + 40.
  await expect(page.getByTestId('score')).toContainText('80');
});

test('count-by-8s practice: every chain steps by 8', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=62');
  await createHero(page, 'Zara');

  await page.getByTestId('skill-pattern').click();
  await page.getByTestId('practice-8').click();
  await expect(page.getByTestId('mode-hint')).toContainText('Only by 8s');
  await startRound(page);

  await expect(page.getByTestId('practice-badge')).toContainText('by 8s practice');
  for (let i = 0; i < 4; i++) {
    const [t1, t2] = await readChainTerms(page);
    expect(t2 - t1, 'the step is pinned to 8').toBe(8);
    await answerQuestion(page);
  }
});

test('a Pattern best celebrates per Skill and lands on leaderboard and grid', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=63');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-pattern').click();
  await startRound(page);

  await answerQuestion(page);
  await advanceClock(page, 200_000);

  await expect(page.getByTestId('results-skill')).toContainText('🔁');
  await expect(page.getByTestId('personal-best')).toContainText('🔁');
  await expect(page.getByTestId('personal-best')).toContainText('PERSONAL BEST');

  await page.getByTestId('play-again').click();
  await page.getByTestId('back-to-title').click();
  await expect(page.getByTestId('leaderboard-p1-pattern')).toContainText('20');
  await expect(page.getByTestId('leaderboard-p1-machine')).toContainText('—');

  await page.getByTestId('grid-p1').click();
  await expect(page.getByTestId('grid-skill-pattern')).toHaveClass(/mode-selected/);
  const practiced = page.locator('.mastery-learning, .mastery-mastered, .mastery-struggling');
  expect(await practiced.count()).toBeGreaterThan(0);
});

test('a wrong Pattern answer teaches the chain rule', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=64');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-pattern').click();
  await startRound(page);

  // Skip past any Name-the-Rule surprises to a compute Question.
  for (let i = 0; i < 12 && (await cardsShowing(page)); i++) await answerQuestion(page);
  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer + 1);
  await expect(page.getByTestId('feedback')).toContainText('each time');
  await expect(page.getByTestId('feedback')).toContainText(`, ${answer}!`);
});
