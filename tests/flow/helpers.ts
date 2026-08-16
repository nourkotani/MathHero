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

/** Create a hero from the Title screen, landing on pre-round. */
export async function createHero(page: Page, name = 'Testo'): Promise<void> {
  await page.getByTestId('new-hero').click();
  await page.getByTestId('hero-name').fill(name);
  await page.getByTestId('create-hero').click();
}

/** Press GO! on the pre-round screen. */
export async function startRound(page: Page): Promise<void> {
  await page.getByTestId('start-round').click();
}

/** Drive the injected clock forward (requires opening with ?testClock=1). */
export async function advanceClock(page: Page, ms: number): Promise<void> {
  await page.evaluate((m) => window.__mathhero?.advance(m), ms);
}

/** The Machine's Secret Rule, cracked from its example rows: output = a·input + b. */
export async function readMachineRule(page: Page): Promise<{ a: number; b: number }> {
  const row = async (input: number) => {
    const text = await page.getByTestId(`machine-row-${input}`).innerText();
    const match = text.match(/→\s*(\d+)/);
    if (!match) throw new Error(`could not parse machine row ${input}: ${text}`);
    return Number(match[1]);
  };
  const [o1, o2] = [await row(1), await row(2)];
  return { a: o2 - o1, b: o1 - (o2 - o1) };
}

/** Read the current question off the HUD and return its correct answer — every Skill. */
export async function readCorrectAnswer(page: Page): Promise<number> {
  const text = await page.getByTestId('question').innerText();
  const multiply = text.match(/(\d+)\s*×\s*(\d+)/);
  if (multiply) return Number(multiply[1]) * Number(multiply[2]);
  const divide = text.match(/(\d+)\s*÷\s*(\d+)/);
  if (divide) return Number(divide[1]) / Number(divide[2]);
  const machine = text.match(/(\d+)\s*→/);
  if (machine) {
    const { a, b } = await readMachineRule(page);
    return a * Number(machine[1]) + b;
  }
  throw new Error(`could not parse question from HUD: ${text}`);
}

/** Answer via the on-screen pad, digit by digit, then submit with ✓. */
export async function answerOnPad(page: Page, answer: number): Promise<void> {
  for (const digit of String(answer)) {
    await page.getByTestId(`pad-${digit}`).click();
  }
  await page.getByTestId('pad-submit').click();
}
