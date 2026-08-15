import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

test('hero creation offers body, hair, length, and garment choices that persist', async ({
  page,
}) => {
  await openGame(page);
  await page.getByTestId('new-hero').click();

  // Pick a fully custom hero; each tap also drives the live 3D preview.
  await page.getByTestId('hero-name').fill('Milo');
  await page.getByTestId('body-boy').click();
  await page.getByTestId('hairstyle-flame').click();
  await page.getByTestId('hairlength-long').click();
  await page.getByTestId('garment-armor').click();
  await page.getByTestId('hair-sky').click();
  await expect(page.getByTestId('hairstyle-flame')).toHaveClass(/mode-selected/);
  await expect(page.getByTestId('garment-armor')).toHaveClass(/mode-selected/);
  await page.getByTestId('create-hero').click();

  await expect(page.getByTestId('active-player')).toContainText('Milo');

  // The appearance is part of the Save File.
  await page.reload();
  await expect(page.getByTestId('player-p1')).toContainText('Milo');
});
