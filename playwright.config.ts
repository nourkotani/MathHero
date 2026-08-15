import { defineConfig } from '@playwright/test';

// Flow tests run against the built dist/MathHero.html over file:// — the same
// way the family actually launches the game (ADR 0001). Run `npm run build` first;
// `npm run check` sequences this correctly.
export default defineConfig({
  testDir: 'tests/flow',
  fullyParallel: true,
  // Each test boots a full three.js scene on software WebGL; too many at
  // once starves them and produces timeout flakes.
  workers: 4,
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
  ],
});
