import { defineConfig } from '@playwright/test';

// Flow tests run against the built dist/MathHero.html over file:// — the same
// way the family actually launches the game (ADR 0001). Run `npm run build` first;
// `npm run check` sequences this correctly.
export default defineConfig({
  testDir: 'tests/flow',
  fullyParallel: true,
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
