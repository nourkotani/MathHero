import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

// A Hair Style (ADR 0008): chosen at Hero creation, changed from the Title
// screen, kept in the Save File.

test('a Hair Style is chosen at creation, changed on the Title screen, and kept', async ({
  page,
}) => {
  await openGame(page);
  await page.getByTestId('new-hero').click();
  await page.getByTestId('hero-name').fill('Zara');
  await page.getByTestId('hairstyle-ponytail').click();
  await page.getByTestId('create-hero').click();
  await page.getByTestId('back-to-title').click();

  // The Title screen shows the stored style.
  await page.getByTestId('hair-p1').click();
  await expect(page.getByTestId('hair-picker')).toBeVisible();
  await expect(page.getByTestId('new-hairstyle-ponytail')).toHaveClass(/mode-selected/);
  await expect(page.getByTestId('new-hairlength-short')).toHaveClass(/mode-selected/);

  // A new style and length, then the picker closes.
  await page.getByTestId('new-hairstyle-flame').click();
  await page.getByTestId('new-hairlength-long').click();
  await expect(page.getByTestId('new-hairstyle-flame')).toHaveClass(/mode-selected/);
  await page.getByTestId('hair-done').click();
  await expect(page.getByTestId('hair-picker')).toHaveCount(0);

  // The change survives a reload.
  await page.reload();
  await page.getByTestId('hair-p1').click();
  await expect(page.getByTestId('new-hairstyle-flame')).toHaveClass(/mode-selected/);
  await expect(page.getByTestId('new-hairlength-long')).toHaveClass(/mode-selected/);
});
