import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  advanceClock,
  answerOnPad,
  answerQuestion,
  cardsShowing,
  createHero,
  openGame,
  readCorrectAnswer,
  readTruthRuleLabel,
  startRound,
} from './helpers';

// Every screen fits every shape (ticket #57). Runs on the desktop project and
// on the phone and iPad projects: at each viewport, every control that shows
// is inside the viewport and big enough for a thumb.

const MIN_TAP = 44;

/**
 * Every visible control that is cut off or too small to tap, by name.
 *
 * A control below the fold passes only when a child can scroll to it: its
 * scroll box must scroll vertically and let a finger pan it. (A script can
 * scroll an overflow:hidden box; a finger cannot.) Nothing may stick out
 * sideways.
 */
async function misfits(page: Page): Promise<string[]> {
  return page.evaluate((minTap) => {
    const out: string[] = [];
    const inside = (r: DOMRect) =>
      r.left >= -0.5 &&
      r.top >= -0.5 &&
      r.right <= window.innerWidth + 0.5 &&
      r.bottom <= window.innerHeight + 0.5;
    const fingerScrollBox = (el: HTMLElement): HTMLElement | null => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        const scrolls = s.overflowY === 'auto' || s.overflowY === 'scroll';
        const pans = s.touchAction === 'auto' || s.touchAction.includes('pan-y');
        const touchable = s.pointerEvents !== 'none';
        if (scrolls && pans && touchable && a.scrollHeight > a.clientHeight) return a;
      }
      return null;
    };
    const controls = document.querySelectorAll<HTMLElement>(
      '#ui button, #ui input:not([type=file]), #ui label.import-label',
    );
    for (const el of controls) {
      let r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      const name = el.dataset.testid ?? el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '?';
      if (!inside(r) && fingerScrollBox(el)) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        r = el.getBoundingClientRect();
      }
      if (!inside(r)) out.push(`${name}: outside the viewport`);
      if (r.width < minTap - 0.5 || r.height < minTap - 0.5) {
        out.push(`${name}: ${Math.round(r.width)}×${Math.round(r.height)} is too small`);
      }
    }
    return out;
  }, MIN_TAP);
}

async function expectFits(page: Page, screen: string): Promise<void> {
  // Let entrance animations settle: a scaled-in panel is measured at rest.
  await page.waitForTimeout(400);
  expect(await misfits(page), `${screen} at ${JSON.stringify(page.viewportSize())}`).toEqual([]);
}

/** A hero 40 XP shy of level 25 (Storm Gold): one short Round earns a Landmark. */
async function seedLandmarkHero(page: Page): Promise<void> {
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
            bests: { multiply: { easy: 120 }, divide: {}, machine: {}, pattern: {} },
            factStats: { multiply: {}, divide: {}, machine: {}, pattern: {} },
          },
          {
            id: 'p2',
            name: 'Maximilian',
            colors: { hair: 'flame', outfitPrimary: 'red', outfitSecondary: 'white' },
            appearance: {
              body: 'boy',
              hairStyle: 'spiky',
              hairLength: 'short',
              garment: 'gi',
              skinTone: 'fair',
            },
            roundsPlayed: 3,
            xp: 900,
            bests: { multiply: { easy: 90 }, divide: {}, machine: {}, pattern: {} },
            factStats: { multiply: {}, divide: {}, machine: {}, pattern: {} },
          },
        ],
        nextPlayerId: 3,
        lastExportAt: null,
        muted: false,
      }),
    );
  });
  await page.reload();
}

test('the Title, Hero creation, and Pre-round screens fit', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=601');
  await expectFits(page, 'first Title');
  await page.getByTestId('new-hero').click();
  await expectFits(page, 'Hero creation');
  await page.getByTestId('hero-name').fill('Testo');
  await page.getByTestId('create-hero').click();
  await expectFits(page, 'Pre-round');
});

test('a full Title with heroes, the Mastery Grid, and a confirm box fit', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=602');
  await seedLandmarkHero(page);
  await expectFits(page, 'Title with two heroes');
  await page.getByTestId('grid-p1').click();
  await expectFits(page, 'Mastery Grid');
  await page.getByTestId('close-grid').click();
  await page.getByTestId('delete-p2').click();
  await expectFits(page, 'delete confirm');
});

test('Results with a Landmark ceremony fits', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=603');
  await seedLandmarkHero(page);
  await page.getByTestId('player-p1').click();
  await advanceClock(page, 50);
  await startRound(page);
  for (let i = 0; i < 4; i++) {
    await answerOnPad(page, await readCorrectAnswer(page));
  }
  await advanceClock(page, 600_000);
  await expect(page.getByTestId('landmark')).toBeVisible();
  await expectFits(page, 'Results with a Landmark');
});

test('a Name-the-Rule card is answered by a tap', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch viewports only');
  await openGame(page, '?testClock=1&seed=71');
  await createHero(page, 'Zara');
  await page.getByTestId('skill-machine').tap();
  await startRound(page);
  for (let i = 0; i < 25 && !(await cardsShowing(page)); i++) await answerQuestion(page);
  await expect(page.getByTestId('rule-card-1')).toBeVisible();
  await expectFits(page, 'Name-the-Rule cards');

  const before = Number(await page.getByTestId('score').innerText());
  await page.getByRole('button', { name: await readTruthRuleLabel(page) }).tap();
  await expect(page.getByTestId('feedback')).toHaveCount(0);
  expect(Number(await page.getByTestId('score').innerText())).toBeGreaterThan(before);
});

test('turning the device mid-Round switches the layout and the Round goes on', async ({
  page,
}) => {
  await openGame(page, '?testClock=1&seed=604');
  await createHero(page);
  await startRound(page);
  await answerOnPad(page, await readCorrectAnswer(page));
  await expect(page.getByTestId('score')).toContainText('10');

  const { width, height } = page.viewportSize()!;
  const before = await page.locator('html').getAttribute('data-layout');
  await page.setViewportSize({ width: height, height: width });
  await expect(page.locator('html')).not.toHaveAttribute('data-layout', before ?? '');
  await expectFits(page, 'turned Round');

  // The same Round goes on: the score stays, and the next answer counts.
  await expect(page.getByTestId('score')).toContainText('10');
  await answerOnPad(page, await readCorrectAnswer(page));
  await expect(page.getByTestId('score')).toContainText('20');
});
