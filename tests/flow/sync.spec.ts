import { expect, test } from '@playwright/test';
import { createHero, openGame } from './helpers';

test('a hero created in a second copy of the game appears in the first', async ({
  page,
  context,
}) => {
  await openGame(page);
  await createHero(page, 'Zara');
  await page.getByTestId('back-to-title').click();
  await expect(page.getByTestId('player-p1')).toBeVisible();

  // The family double-clicks the file again: a second copy opens and a
  // sibling makes their hero there.
  const second = await context.newPage();
  await openGame(second);
  await createHero(second, 'Kai');

  // Returning to the first copy must show Kai — a stale copy would export
  // (and overwrite) a Save File without him.
  await page.bringToFront();
  await expect(page.getByTestId('player-p2')).toContainText('Kai');
  await second.close();
});
