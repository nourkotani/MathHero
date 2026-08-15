import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

test('the mute toggle persists across a browser restart', async ({ page }) => {
  await openGame(page);

  const toggle = page.getByTestId('mute-toggle');
  await expect(toggle).toHaveText('🔊');
  await toggle.click();
  await expect(toggle).toHaveText('🔇');

  await page.reload();
  await expect(page.getByTestId('mute-toggle')).toHaveText('🔇');

  await page.getByTestId('mute-toggle').click();
  await expect(page.getByTestId('mute-toggle')).toHaveText('🔊');
});
