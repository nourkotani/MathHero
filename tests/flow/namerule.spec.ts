import { expect, test } from '@playwright/test';
import {
  answerQuestion,
  cardsShowing,
  createHero,
  openGame,
  readTruthRuleLabel,
  startRound,
} from './helpers';

// Name-the-Rule cards surprise-swap the pad in the detective Skills. Every
// assertion works from the HUD alone: the truth rule is derivable from the
// example rows (Machine) or the chain itself (Pattern).

/** Answer questions until a Name-the-Rule card set is on screen. */
async function reachCards(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 25; i++) {
    if (await cardsShowing(page)) return;
    await answerQuestion(page);
  }
  throw new Error('no Name-the-Rule question within 25 draws');
}

test('Machine cards: the pad disappears, the right tap fires and pays triple', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=71');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-machine').click();
  await startRound(page);

  await reachCards(page);
  // Three cards, no pad, and the example rows still on the pod.
  await expect(page.getByTestId('rule-card-1')).toBeVisible();
  await expect(page.getByTestId('rule-card-2')).toBeVisible();
  await expect(page.getByTestId('rule-card-3')).toBeVisible();
  await expect(page.getByTestId('pad-submit')).toHaveCount(0);
  await expect(page.getByTestId('machine-panel')).toBeVisible();

  const before = Number(await page.getByTestId('score').innerText());
  const truth = await readTruthRuleLabel(page);
  await page.getByRole('button', { name: truth }).click();
  const after = Number(await page.getByTestId('score').innerText());
  expect(after - before, 'a correct card pays like a compute answer').toBeGreaterThanOrEqual(30);
});

test('Pattern cards: a wrong pick highlights the true rule and breaks the streak', async ({
  page,
}) => {
  await openGame(page, '?testClock=1&seed=72');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-pattern').click();
  await startRound(page);

  await reachCards(page);
  const before = await page.getByTestId('score').innerText();
  const truth = await readTruthRuleLabel(page);
  // Deliberately tap a trap card.
  for (let card = 1; card <= 3; card++) {
    const label = await page.getByTestId(`rule-card-${card}`).innerText();
    if (label !== truth) {
      await page.getByTestId(`rule-card-${card}`).click();
      break;
    }
  }
  // The teaching moment shows all three cards with the truth glowing — and
  // the wrong pick cost nothing.
  await expect(page.getByTestId('feedback')).toContainText('The rule was');
  await expect(page.locator('.rule-card-correct')).toHaveText(truth);
  await expect(page.getByTestId('score')).toHaveText(before);
});

test('keys 1–3 answer a card question instantly', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=73');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-machine').click();
  await startRound(page);

  await reachCards(page);
  const truth = await readTruthRuleLabel(page);
  let correctCard = 0;
  for (let card = 1; card <= 3; card++) {
    if ((await page.getByTestId(`rule-card-${card}`).innerText()) === truth) correctCard = card;
  }
  const before = Number(await page.getByTestId('score').innerText());
  await page.keyboard.press(String(correctCard));
  const after = Number(await page.getByTestId('score').innerText());
  expect(after - before, 'the key press is the card tap').toBeGreaterThanOrEqual(30);
});
