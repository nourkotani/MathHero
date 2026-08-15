import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

const BUILT_FILE = resolve(import.meta.dirname, '../../dist/MathHero.html');

declare global {
  interface Window {
    __mathhero?: { advance(ms: number): void };
  }
}

/** Open the built single-file game the way the family does: over file://. */
export async function openGame(page: Page, query = ''): Promise<void> {
  await page.goto(pathToFileURL(BUILT_FILE).href + query);
}

/** Press GO! on the pre-round screen. */
export async function startRound(page: Page): Promise<void> {
  await page.getByTestId('start-round').click();
}

/** Drive the injected clock forward (requires opening with ?testClock=1). */
export async function advanceClock(page: Page, ms: number): Promise<void> {
  await page.evaluate((m) => window.__mathhero?.advance(m), ms);
}

/** Read the current question off the HUD and return its correct answer. */
export async function readCorrectAnswer(page: Page): Promise<number> {
  const text = await page.getByTestId('question').innerText();
  const match = text.match(/(\d+)\s*×\s*(\d+)/);
  if (!match) throw new Error(`could not parse question from HUD: ${text}`);
  return Number(match[1]) * Number(match[2]);
}

/** Answer via the on-screen pad, digit by digit, then submit with ✓. */
export async function answerOnPad(page: Page, answer: number): Promise<void> {
  for (const digit of String(answer)) {
    await page.getByTestId(`pad-${digit}`).click();
  }
  await page.getByTestId('pad-submit').click();
}
