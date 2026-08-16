import { expect, test } from '@playwright/test';
import { advanceClock, answerOnPad, createHero, openGame, readCorrectAnswer, startRound } from './helpers';

test('creating a hero persists across a browser restart', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('new-hero').click();
  await page.getByTestId('hero-name').fill('Zara');
  await page.getByTestId('hair-gold').click();
  await page.getByTestId('primary-purple').click();
  await page.getByTestId('secondary-teal').click();
  await page.getByTestId('create-hero').click();

  await expect(page.getByTestId('active-player')).toContainText('Zara');

  // Reload the built file — the Save File in localStorage restores the hero.
  await page.reload();
  await expect(page.getByTestId('player-p1')).toContainText('Zara');
});

test('renaming a hero keeps them selectable', async ({ page }) => {
  await openGame(page);
  await createHero(page, 'Milo');
  await page.getByTestId('back-to-title').click();

  await page.getByTestId('rename-p1').click();
  await page.getByTestId('rename-input-p1').fill('Super Milo');
  await page.getByTestId('rename-save-p1').click();
  await expect(page.getByTestId('player-p1')).toContainText('Super Milo');

  await page.reload();
  await expect(page.getByTestId('player-p1')).toContainText('Super Milo');
});

test('deleting a hero needs the scary confirmation', async ({ page }) => {
  await openGame(page);
  await createHero(page, 'Zara');
  await page.getByTestId('back-to-title').click();

  await page.getByTestId('delete-p1').click();
  await expect(page.getByTestId('delete-confirm')).toContainText('forever');

  // Backing out keeps the hero.
  await page.getByTestId('cancel-delete').click();
  await expect(page.getByTestId('player-p1')).toBeVisible();

  // Confirming removes them for good.
  await page.getByTestId('delete-p1').click();
  await page.getByTestId('confirm-delete').click();
  await expect(page.getByTestId('player-p1')).not.toBeVisible();

  await page.reload();
  await expect(page.getByTestId('player-p1')).not.toBeVisible();
  await expect(page.getByTestId('new-hero')).toBeVisible();
});

test('a veteran hero above level 30 keeps their level when the save migrates', async ({ page }) => {
  await openGame(page);
  // A v11 document from before the curve steepened: 17,500 XP was level 35
  // under the flat 500-per-level rule. Migration must not demote the hero.
  await page.evaluate(() => {
    localStorage.setItem(
      'mathhero-save',
      JSON.stringify({
        version: 11,
        players: [
          {
            id: 'p1',
            name: 'Zara',
            colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
            appearance: {
              body: 'boy',
              hairStyle: 'spiky',
              hairLength: 'short',
              garment: 'gi',
              skinTone: 'tan',
            },
            roundsPlayed: 40,
            xp: 17_500,
            bests: { multiply: {}, divide: {}, machine: {}, pattern: {} },
            factStats: { multiply: {}, divide: {}, machine: {}, pattern: {} },
          },
        ],
        nextPlayerId: 2,
        lastExportAt: null,
        muted: false,
      }),
    );
  });
  await page.reload();
  await expect(page.getByTestId('player-p1')).toContainText('Lv 35');
});

test('crossing a Landmark Level plays the transformation ceremony with its tier name', async ({
  page,
}) => {
  await openGame(page, '?testClock=1&seed=77');
  // A hero 40 XP shy of Landmark Level 25 — one short Round crosses it.
  await page.evaluate(() => {
    localStorage.setItem(
      'mathhero-save',
      JSON.stringify({
        version: 12,
        players: [
          {
            id: 'p1',
            name: 'Kai',
            colors: { hair: 'gold', outfitPrimary: 'blue', outfitSecondary: 'teal' },
            appearance: {
              body: 'girl',
              hairStyle: 'ponytail',
              hairLength: 'short',
              garment: 'gi',
              skinTone: 'tan',
            },
            roundsPlayed: 50,
            xp: 12_460,
            bests: { multiply: {}, divide: {}, machine: {}, pattern: {} },
            factStats: { multiply: {}, divide: {}, machine: {}, pattern: {} },
          },
        ],
        nextPlayerId: 2,
        lastExportAt: null,
        muted: false,
      }),
    );
  });
  await page.reload();
  await page.getByTestId('player-p1').click();
  await advanceClock(page, 50);
  await startRound(page);
  for (let i = 0; i < 4; i++) {
    await answerOnPad(page, await readCorrectAnswer(page));
  }
  await advanceClock(page, 600_000);

  // The ceremony names the level and the Landmark tier — and nothing about
  // the transformation scene blocks the Results screen under the test clock.
  await expect(page.getByTestId('level-up')).toContainText('Level 25');
  await expect(page.getByTestId('landmark')).toContainText('TRANSFORMATION! Comet trail!');
  await expect(page.getByTestId('play-again')).toBeVisible();
});

test('two heroes can take turns', async ({ page }) => {
  await openGame(page);
  await createHero(page, 'Zara');
  await page.getByTestId('back-to-title').click();
  await createHero(page, 'Milo');
  await page.getByTestId('back-to-title').click();

  await page.getByTestId('player-p1').click();
  await expect(page.getByTestId('active-player')).toContainText('Zara');
  await page.getByTestId('back-to-title').click();
  await page.getByTestId('player-p2').click();
  await expect(page.getByTestId('active-player')).toContainText('Milo');
});
