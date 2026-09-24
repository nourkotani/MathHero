import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { advanceClock, createHero, openGame, readCorrectAnswer, startRound } from './helpers';

// Runs on the desktop project and on the iPhone 17 Pro project; every
// expectation comes from the viewport's shape, as the Layout rule does.

const PAD_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'backspace', 'submit'];

function expectedLayout(page: Page): 'stacked' | 'side-by-side' {
  const size = page.viewportSize();
  if (!size) throw new Error('no viewport');
  return size.height > size.width ? 'stacked' : 'side-by-side';
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('element has no box');
  return found;
}

/** Answer the current Question by touch: one tap per digit, then ✓. */
async function tapAnswer(page: Page, answer: number): Promise<void> {
  for (const digit of String(answer)) {
    await page.getByTestId(`pad-${digit}`).tap();
  }
  await page.getByTestId('pad-submit').tap();
}

async function openRound(page: Page, seed: number): Promise<void> {
  await openGame(page, `?testClock=1&seed=${seed}`);
  await createHero(page);
  await startRound(page);
  await expect(page.getByTestId('question')).toBeVisible();
}

test('the Round shows the layout that the screen shape picks', async ({ page }) => {
  await openRound(page, 501);
  const layout = expectedLayout(page);
  await expect(page.locator('html')).toHaveAttribute('data-layout', layout);

  const viewport = page.viewportSize()!;
  const arena = await box(page.locator('#scene'));
  const pad = await box(page.locator('.number-pad'));
  if (layout === 'stacked') {
    // The arena sits on top; the pad is wholly below it.
    expect(arena.y).toBe(0);
    expect(arena.y + arena.height).toBeLessThanOrEqual(pad.y);
    expect((await box(page.getByTestId('question'))).y).toBeGreaterThanOrEqual(
      arena.y + arena.height,
    );
  } else {
    // Today's look: the arena fills the window behind the HUD.
    expect(arena.width).toBe(viewport.width);
    expect(arena.height).toBe(viewport.height);
  }
});

test('every pad key and ✓ is on screen and big enough for a thumb', async ({ page }) => {
  await openRound(page, 502);
  const viewport = page.viewportSize()!;
  for (const key of PAD_KEYS) {
    const b = await box(page.getByTestId(`pad-${key}`));
    expect(b.x, `pad-${key}`).toBeGreaterThanOrEqual(0);
    expect(b.y, `pad-${key}`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `pad-${key}`).toBeLessThanOrEqual(viewport.width);
    expect(b.y + b.height, `pad-${key}`).toBeLessThanOrEqual(viewport.height);
    expect(b.width, `pad-${key}`).toBeGreaterThanOrEqual(44);
    expect(b.height, `pad-${key}`).toBeGreaterThanOrEqual(44);
  }
});

test('the Round has no text field, so no phone keyboard can open', async ({ page }) => {
  await openRound(page, 503);
  await expect(page.locator('input, textarea, [contenteditable]')).toHaveCount(0);
});

test('turning the device changes the layout at once', async ({ page }) => {
  await openRound(page, 504);
  const { width, height } = page.viewportSize()!;
  const turned = expectedLayout(page) === 'stacked' ? 'side-by-side' : 'stacked';
  await page.setViewportSize({ width: height, height: width });
  await expect(page.locator('html')).toHaveAttribute('data-layout', turned);
  // The canvas follows the new arena region.
  const arena = await box(page.locator('#scene'));
  if (turned === 'side-by-side') expect(arena.height).toBe(width);
  else expect(arena.height).toBeLessThan(width);
});

test.describe('by touch', () => {
  test.use({ hasTouch: true });

  test('a complete Round by tap grades every Question correctly', async ({ page }) => {
    await openRound(page, 8791);
    for (let i = 0; i < 8; i++) {
      const shown = await page.getByTestId('question').innerText();
      await tapAnswer(page, await readCorrectAnswer(page));
      await expect(page.getByTestId('feedback'), `"${shown}" was graded wrong`).toHaveCount(0);
      await expect(page.getByTestId('answer')).toHaveText('?');
    }
    await advanceClock(page, 200_000);
    // 8 unbroken correct answers on Easy: 2×10 + 3×20 + 3×30.
    await expect(page.getByTestId('final-score')).toContainText('170');
  });

  test('a fast double-tap on one key types that digit twice', async ({ page }) => {
    // "44" is two quick taps on one key; a zoom gesture or a swallowed
    // second tap would turn a right answer into a wrong one.
    await openRound(page, 505);
    await page.getByTestId('pad-4').tap();
    await page.getByTestId('pad-4').tap();
    await expect(page.getByTestId('answer')).toHaveText('44');
  });
});
