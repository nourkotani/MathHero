import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createHero, openGame } from './helpers';

test('export, wipe, then import restores all progress', async ({ page }) => {
  await openGame(page);
  await createHero(page, 'Zara');
  await page.getByTestId('back-to-title').click();

  // Export downloads the Save File as JSON.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-save').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('MathHero-save.json');
  const savedPath = await download.path();
  const saved = JSON.parse(readFileSync(savedPath, 'utf8'));
  expect(saved.players[0].name).toBe('Zara');

  // Wipe the browser's storage — all heroes are gone.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('player-p1')).not.toBeVisible();

  // Import the backup: confirmation, then everything is back.
  await page.getByTestId('import-file').setInputFiles(savedPath);
  await expect(page.getByTestId('import-confirm')).toBeVisible();
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('player-p1')).toContainText('Zara');

  // And it survives another restart.
  await page.reload();
  await expect(page.getByTestId('player-p1')).toContainText('Zara');
});

test('an invalid file is rejected with a friendly message and no changes', async ({ page }) => {
  await openGame(page);
  await createHero(page, 'Zara');
  await page.getByTestId('back-to-title').click();

  await page.getByTestId('import-file').setInputFiles({
    name: 'not-a-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"definitely": "not a save"}'),
  });
  await expect(page.getByTestId('import-error')).toContainText('heroes are safe');
  await page.getByTestId('dismiss-import-error').click();
  await expect(page.getByTestId('player-p1')).toContainText('Zara');
});
