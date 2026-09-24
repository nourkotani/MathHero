import { defineConfig } from '@playwright/test';
import type { Project } from '@playwright/test';

/** A touch-screen device at one viewport, running the layout suites. */
function touchProject(name: string, width: number, height: number): Project {
  return {
    name,
    testMatch: /(layout|screens)\.spec\.ts/,
    use: {
      browserName: 'chromium',
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    },
  };
}

// Flow tests run against the built dist/MathHero.html over file:// — the same
// way the family actually launches the game (ADR 0001). Run `npm run build` first;
// `npm run check` sequences this correctly.
export default defineConfig({
  testDir: 'tests/flow',
  fullyParallel: true,
  // Each test boots a full three.js scene on software WebGL; too many at
  // once starves the pages' main threads and produces timeout flakes.
  workers: 2,
  // Software WebGL renders the cel-shaded scene (outline hulls, a shadow
  // pass, and now three post passes) far slower than any real GPU;
  // answer-heavy tests need the room. Raised from 60s once the suite passed
  // ~45 tests: two runs starved a page so badly that a single click on an
  // already-resolved button blew the budget. Never paper over this with
  // retries — a retried test reports as "flaky", not "failed", and this
  // gate is the only thing standing between a bug and the family.
  timeout: 90_000,
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // Recent Chromium gates software WebGL (SwiftShader) behind this flag;
        // without it three.js cannot create a context in headless runs.
        launchOptions: { args: ['--enable-unsafe-swiftshader'] },
      },
    },
    // Touch devices, by touch: only the layout suites run here. The full
    // suite on each would multiply the ~14-minute gate. Layout is in CSS
    // px, so DPR 1 keeps software WebGL fast without changing the layout.
    touchProject('iphone-17-pro', 402, 874), // iPhone 17 Pro, portrait
    touchProject('ipad-portrait', 820, 1180),
    touchProject('ipad-landscape', 1180, 820),
  ],
});
