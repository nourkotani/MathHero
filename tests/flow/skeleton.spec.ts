import { expect, test } from '@playwright/test';
import {
  advanceClock,
  answerOnPad,
  createHero,
  openGame,
  readCorrectAnswer,
  startRound,
} from './helpers';

test('correct answer via the on-screen pad increases the score', async ({ page }) => {
  await openGame(page);
  await createHero(page);
  await startRound(page);

  await expect(page.getByTestId('score')).toContainText('0');
  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer);

  await expect(page.getByTestId('score')).toContainText('10');
  // A new question appears with an empty answer slot.
  await expect(page.getByTestId('answer')).toHaveText('?');
});

test('keyboard entry with backspace works and submits on Enter', async ({ page }) => {
  await openGame(page);
  await createHero(page);
  await startRound(page);

  // Type a stray digit, erase it, then type the real answer.
  await page.keyboard.press('5');
  await expect(page.getByTestId('answer')).toHaveText('5');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('answer')).toHaveText('?');

  const answer = await readCorrectAnswer(page);
  for (const digit of String(answer)) {
    await page.keyboard.press(digit);
  }
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('score')).toContainText('10');
});

test('mixing pad clicks with the Enter key leaves no stray digit behind', async ({ page }) => {
  await openGame(page);
  await createHero(page);
  await startRound(page);

  // The way a kid mixes mouse and keyboard: click the answer on the pad,
  // then submit with Enter. The last-clicked pad key must not be
  // re-activated by that Enter.
  const answer = await readCorrectAnswer(page);
  for (const digit of String(answer)) {
    await page.getByTestId(`pad-${digit}`).click();
  }
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('score')).toContainText('10');
  // The next question starts from a truly empty answer.
  await expect(page.getByTestId('answer')).toHaveText('?');
});

test('a wrong answer scores nothing and moves on after the teaching moment', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=12345');
  await createHero(page);
  await startRound(page);

  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer + 1);

  await expect(page.getByTestId('score')).toContainText('0');
  // The correct equation is shown until the teaching moment expires,
  // then a fresh question appears.
  await expect(page.getByTestId('feedback')).toContainText(`= ${answer}`);
  await advanceClock(page, 2500);
  await expect(page.getByTestId('question')).toBeVisible();
  await expect(page.getByTestId('answer')).toHaveText('?');
});

test('a held key never adds digits the child did not type', async ({ page }) => {
  // The unforgivable bug: answer correctly, get told you are wrong. Holding
  // a key made the OS fire auto-repeats that the shell counted as real
  // presses, so a correct 27 arrived at the grader as 277.
  await openGame(page, '?testClock=1&seed=4242');
  await createHero(page);
  await startRound(page);

  const answer = await readCorrectAnswer(page);
  const digits = String(answer);
  await page.evaluate((typed) => {
    const press = (key: string, repeat: boolean) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true }));
    for (const digit of typed) {
      press(digit, false); // the press
      press(digit, true); // …held a fraction too long
      press(digit, true);
    }
  }, digits);

  // What the child typed is exactly what the game sees, and it scores —
  // no teaching moment, because nothing was wrong.
  await expect(page.getByTestId('answer')).toHaveText(digits);
  await page.getByTestId('pad-submit').click();
  await expect(page.getByTestId('score')).toContainText('10');
  await expect(page.getByTestId('feedback')).toHaveCount(0);
});

test('every question the game shows grades correctly, right through a Round', async ({ page }) => {
  // End-to-end guard on the whole chain: whatever the HUD displays is what
  // the grader judges. The answer is computed here from the visible prompt
  // alone, so a display/grading mismatch on any Fact fails this test.
  await openGame(page, '?testClock=1&seed=8791');
  await createHero(page);
  await startRound(page);

  for (let i = 0; i < 15; i++) {
    const shown = await page.getByTestId('question').innerText();
    await answerOnPad(page, await readCorrectAnswer(page));
    // A teaching moment here would mean a correct answer was called wrong.
    await expect(page.getByTestId('feedback'), `question "${shown}" was graded wrong`).toHaveCount(
      0,
    );
    await expect(page.getByTestId('answer')).toHaveText('?');
  }
  // 15 unbroken correct answers on Easy: 2×10 + 3×20 + 4×30 + 6×40.
  await expect(page.getByTestId('score')).toContainText('440');
});

test('browser shortcut keystrokes never land in the answer', async ({ page }) => {
  await openGame(page, '?testClock=1&seed=4243');
  await createHero(page);
  await startRound(page);

  await page.evaluate(() => {
    const shortcut = (key: string, mods: KeyboardEventInit) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods }));
    shortcut('1', { ctrlKey: true }); // switch browser tab
    shortcut('4', { altKey: true });
    shortcut('3', { metaKey: true });
  });

  await expect(page.getByTestId('answer')).toHaveText('?');
});

test('localStorage works under file:// (persistence harness smoke check)', async ({ page }) => {
  await openGame(page);
  const roundTrip = await page.evaluate(() => {
    localStorage.setItem('mathhero-smoke', 'ok');
    const value = localStorage.getItem('mathhero-smoke');
    localStorage.removeItem('mathhero-smoke');
    return value;
  });
  expect(roundTrip).toBe('ok');
});

test('the game makes no network requests', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', (request) => {
    // blob: is in-memory: the baked model's texture, decoded from the file's
    // own inlined bytes (ADR 0007). It never leaves the page.
    const url = request.url();
    if (!url.startsWith('file://') && !url.startsWith('blob:')) remote.push(url);
  });
  await openGame(page);
  await createHero(page);
  await startRound(page);
  const answer = await readCorrectAnswer(page);
  await answerOnPad(page, answer);
  expect(remote).toEqual([]);
});

test('the built file is truly single: nothing is requested beyond the document', async ({
  page,
}) => {
  // Baked textures and every other asset must be inlined — a sibling-file
  // request would mean the game breaks the moment only MathHero.html is
  // copied to a family device.
  const extra: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    const inMemory = url.startsWith('data:') || url.startsWith('blob:');
    if (!inMemory && !/MathHero\.html/.test(url)) extra.push(url);
  });
  await openGame(page);
  await createHero(page);
  await startRound(page);
  expect(extra).toEqual([]);
});

test('the baked Training Dummy loads from the single file', async ({ page }) => {
  // The model is inlined meshopt glTF (ADR 0007), decoded on the main
  // thread. A missing decoder, a worker, or a bad inline reports here.
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /baked model/.test(message.text())) failures.push(message.text());
  });
  page.on('pageerror', (error) => failures.push(error.message));
  // The single file forbids web workers; the decoder must not start one.
  page.on('worker', (worker) => failures.push(`worker: ${worker.url()}`));
  await openGame(page);
  await createHero(page);
  await startRound(page);
  await page.waitForTimeout(3000);
  expect(failures).toEqual([]);
});

test('the single file registers no service worker (ADR 0006)', async ({ page }) => {
  // The worker belongs to the hosted copy only. Opened from disk, the game
  // must stay exactly the single file: it never even tries to register.
  await page.addInitScript(() => {
    const w = window as unknown as { __registerCalls: string[] };
    w.__registerCalls = [];
    if (typeof ServiceWorkerContainer === 'undefined') return;
    const original = ServiceWorkerContainer.prototype.register;
    ServiceWorkerContainer.prototype.register = function (url, options) {
      w.__registerCalls.push(String(url));
      return original.call(this, url, options);
    };
  });
  await openGame(page);
  await createHero(page);
  await startRound(page);
  const calls = await page.evaluate(
    () => (window as unknown as { __registerCalls: string[] }).__registerCalls,
  );
  expect(calls).toEqual([]);
  expect(page.context().serviceWorkers()).toEqual([]);
});
