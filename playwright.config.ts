import { defineConfig } from '@playwright/test';
import type { LaunchOptions, Project } from '@playwright/test';

// Chromium renders WebGL on the real GPU: the full Chromium build (not the
// headless shell, which has no GPU process) through ANGLE on Direct3D 11.
// SwiftShader drew every frame on the CPU and held the gate near 100% CPU.
// The gate therefore needs a computer with a usable GPU; there is no CI.
const GPU_CHROMIUM: LaunchOptions = {
  channel: 'chromium',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
};

/** A WebKit touch device at one viewport, running only the smoke set. */
function webkitSmoke(name: string, width: number, height: number): Project {
  return {
    name,
    testMatch: /smoke\.spec\.ts/,
    use: {
      browserName: 'webkit',
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  };
}

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
      launchOptions: GPU_CHROMIUM,
    },
  };
}

// Flow tests run against the built dist/MathHero.html over file:// — the same
// way the family actually launches the game (ADR 0001). Run `npm run build` first;
// `npm run check` sequences this correctly.
export default defineConfig({
  testDir: 'tests/flow',
  fullyParallel: true,
  // Each test boots a full three.js scene. The limit of 2 dates from
  // software WebGL, where more workers starved the pages' main threads.
  workers: 2,
  // The budget dates from software WebGL, where answer-heavy tests with the
  // Blender models took ~1.4m with both workers busy. On the GPU (from
  // 2026-09-24) the slowest test takes ~5s, so the budget now only catches
  // a hang. Never paper over a slow test with retries — a retried test
  // reports as "flaky", not "failed", and this gate is the only thing
  // standing between a bug and the family.
  timeout: 120_000,
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: GPU_CHROMIUM,
      },
    },
    // Touch devices, by touch: only the layout suites run here. The full
    // suite on each would multiply the gate time. Layout is in CSS
    // px, so DPR 1 keeps WebGL fast without changing the layout.
    touchProject('iphone-17-pro', 402, 874), // iPhone 17 Pro, portrait
    touchProject('ipad-portrait', 820, 1180),
    touchProject('ipad-landscape', 1180, 820),
    // iOS runs only WebKit (ADR 0006): a smoke Round at the phone and iPad
    // viewports. WebKit needs no GPU flags.
    webkitSmoke('webkit-iphone-17-pro', 402, 874),
    webkitSmoke('webkit-ipad-landscape', 1180, 820),
  ],
});
