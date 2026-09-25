# MathHero Architecture

Vocabulary comes from [`CONTEXT.md`](../CONTEXT.md) — use its terms verbatim. Packaging constraints are fixed by [ADR 0001](./adr/0001-static-single-file-with-localstorage.md); the UI/language stack by [ADR 0002](./adr/0002-typescript-preact-local-verification.md); the core contract by [ADR 0003](./adr/0003-core-emits-effects.md); the hosted install by [ADR 0006](./adr/0006-hosted-install-alongside-the-single-file.md); the Blender art pipeline by [ADR 0007](./adr/0007-scripted-blender-models-as-baked-output.md).

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript, `strict: true` everywhere |
| 3D | three.js, pinned to an exact version (no `^`) — addons break across its monthly releases |
| 2D UI | Preact — declarative DOM overlay above the canvas |
| Build | Vite + single-file inlining to one self-contained `MathHero.html` |
| Core tests | Vitest, headless |
| Flow tests | Playwright, run against the **built** `MathHero.html` — full suite on Chromium, plus a WebKit smoke set at phone and iPad viewports (ADR 0006) |
| Audio | WebAudio synthesis only — no audio files |
| Persistence | localStorage + explicit JSON export/import |
| Lint/format | ESLint + Prettier |
| 3D art | Blender, driven by committed `bpy` scripts; `npm run bake:models` exports meshopt glTF (ADR 0007) |
| Distribution | The single file (double-click or an offline viewer app), and a hosted copy on GitHub Pages with a manifest + service worker, deployed by a manual `npm run deploy` (ADR 0006) |

There is no CI: `npm run check` (typecheck → lint → core tests → build → flow tests against the build) is the gate, and it must pass locally before every commit.

| Gate fact | Value |
|---|---|
| Duration (2026-09-24) | About 3 minutes; the flow suite takes about 2 minutes on the GPU |
| GPU | Chromium projects run the full Chromium build with WebGL on the GPU (ANGLE on Direct3D 11); the gate needs a computer with a usable GPU |
| Flow projects | Desktop Chromium (every spec); Chromium touch at iPhone 17 Pro portrait, iPad portrait, and iPad landscape (layout and screen specs); WebKit at iPhone 17 Pro portrait and iPad landscape (smoke spec) |
| One-time setup | `npx playwright install chromium webkit` |

## Unidirectional event flow

```
        ┌────────────────────────────────────────────────┐
        │                  Game Core (pure)              │
        │   update(state, event) → { state, effects[] }  │
        └────────────────────────────────────────────────┘
              ▲ events                    │ state + effects
              │                           ▼
  ┌───────────┴───────────┐   ┌───────────────────────────────┐
  │  UI (Preact overlay)  │   │  Subscribers:                 │
  │  Renderer input hooks │   │  Renderer (three.js) · Audio  │
  │  rAF tick dispatcher  │   │  UI re-render · Persistence   │
  └───────────────────────┘   └───────────────────────────────┘
```

- **Events in, state + effects out.** The UI and shell dispatch domain events (answer submitted, round started, tick, …). The Game Core reduces them and returns the next state plus an ordered list of **effects**.
- **Effects are explicit data** — `TRANSFORMED`, `STREAK_BROKEN`, `BLAST_FIRED`, `LEVEL_UP`, `NEW_PERSONAL_BEST`, `ROUND_ENDED`, … The renderer maps them to animations, the audio module to sounds, persistence to saves. **The shell never diffs state snapshots to infer what happened** (ADR 0003).
- The Game Core is the single test seam: every game rule is exercised through `update` in Vitest with no DOM, no three.js, no browser.

## Determinism rules (Game Core)

- **No clock access.** `Date.now()` / `performance.now()` are forbidden in the core. The shell's `requestAnimationFrame` loop dispatches tick events carrying timestamps from an injected clock. The Round countdown, the timer-zero void rule, and Adaptive Selection's ~6-second speed threshold all derive from tick timestamps.
- **No `Math.random()`.** Question selection uses an injected seeded PRNG (mulberry32). Tests choose seeds; statistical assertions (e.g., Hard's double weighting) run against known seeds.
- Core state is treated as immutable; `update` returns new state.

## Playwright clock control

Flow tests must end a 2-minute Round without waiting 2 minutes. When the page is loaded with a test query flag, the app exposes its injected clock on `window` so Playwright can advance time deterministically. The flag does nothing else, and the built game behaves identically without it.

## Single-file hard rules

`MathHero.html` is the deliverable and every byte must inline, so:

- **No code-splitting** — one chunk.
- **No web workers.**
- **No dynamic `import()`.**
- No external requests of any kind at runtime (fonts, CDNs, telemetry — nothing).

Violations only surface in the built artifact, which is why the flow-test suite targets the build, not the dev server.

## Rendering & performance

- Budget: **60fps on the family's devices** — powerful desktops and iPhones first; the iPad relies on the quality ladder.
- The hero and the arena are baked from committed Blender scripts into inlined glTF ([ADR 0007](./adr/0007-scripted-blender-models-as-baked-output.md)). The Training Dummy's body is a Tripo-generated fighter, which a committed Blender script fits to the game ([ADR 0011](./adr/0011-tripo-models-as-bake-inputs.md)). Light-based effects (aura, arcs, motes, cosmetics, blasts) stay procedural (materials, shaders, particles). Painted textures are **baked, not authored**: `scripts/bake-textures.mjs` generates them deterministically (seeded noise, no external art) into `src/renderer/textures/`, and the build inlines them into the single file ([ADR 0005](./adr/0005-baked-painted-textures-and-tier-ladder.md)). No hand-drawn asset files; the only downloaded ones are the bake inputs of ADR 0010 and ADR 0011.
- Transformation glow is real selective bloom via the pmndrs `postprocessing` composer; the strongest tier adds sun shafts and speed-lines, and sustained low fps sheds one tier at a time down to the additive-sprite fallback ([ADR 0004](./adr/0004-composer-bloom-with-sprite-fallback.md), amended by [ADR 0005](./adr/0005-baked-painted-textures-and-tier-ladder.md)).
- All readable text (questions, score, menus, HUD) lives in the Preact DOM overlay, never rendered inside the canvas.

## Audio

WebAudio contexts start suspended until a user gesture: the audio module unlocks on the first Title-screen interaction. All effects are synthesized; the mute setting lives in the Save File.

## Persistence

One versioned Save File document (schema-version field + forward migrations) holding every Player. The persistence adapter is the only module touching localStorage; export/import moves the same document as a `.json` file. See ADR 0001 for the trade-offs.

## Module map

- `core` — pure Game Core: state, events, effects, question selection, scoring, streaks, XP/levels, mastery, save-document (de)serialization.
- `scene` — the React Three Fiber root on the `#scene` canvas (ADR 0009): renderer, camera, frame loop, and the React components of the 3D scene.
- `renderer` — three.js scene parts that the R3F root mounts: arena, hero, Training Dummy, transformation and blast effects.
- `ui` — Preact screens (Title, Hero creation, Pre-round, HUD, Results, Mastery Grid) and the number pad.
- `audio` — WebAudio synthesizers keyed on effects.
- `persistence` — localStorage adapter, export/import, migrations.
- `app` — bootstrap: wires dispatch, subscribers, the rAF tick loop, injected clock/PRNG, and the test hook.
