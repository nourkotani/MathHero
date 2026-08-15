# MathHero Architecture

Vocabulary comes from [`CONTEXT.md`](../CONTEXT.md) — use its terms verbatim. Packaging constraints are fixed by [ADR 0001](./adr/0001-static-single-file-with-localstorage.md); the UI/language stack by [ADR 0002](./adr/0002-typescript-preact-local-verification.md); the core contract by [ADR 0003](./adr/0003-core-emits-effects.md).

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript, `strict: true` everywhere |
| 3D | three.js, pinned to an exact version (no `^`) — addons break across its monthly releases |
| 2D UI | Preact — declarative DOM overlay above the canvas |
| Build | Vite + single-file inlining to one self-contained `MathHero.html` |
| Core tests | Vitest, headless |
| Flow tests | Playwright, run against the **built** `MathHero.html` |
| Audio | WebAudio synthesis only — no audio files |
| Persistence | localStorage + explicit JSON export/import |
| Lint/format | ESLint + Prettier |

There is no CI: `npm run check` (typecheck → lint → core tests → build → flow tests against the build) is the gate, and it must pass locally before every commit.

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

- Budget: **60fps on integrated graphics** — this runs on a family machine, not a gaming rig.
- The hero, arena, Training Dummy, and all effects are procedural (geometry, materials, shaders, particles). No asset files.
- Whether transformation glow uses post-processing bloom or additive sprites is decided empirically against the fps budget in the spectacle-polish ticket — not fixed here.
- All readable text (questions, score, menus, HUD) lives in the Preact DOM overlay, never rendered inside the canvas.

## Audio

WebAudio contexts start suspended until a user gesture: the audio module unlocks on the first Title-screen interaction. All effects are synthesized; the mute setting lives in the Save File.

## Persistence

One versioned Save File document (schema-version field + forward migrations) holding every Player. The persistence adapter is the only module touching localStorage; export/import moves the same document as a `.json` file. See ADR 0001 for the trade-offs.

## Module map

- `core` — pure Game Core: state, events, effects, question selection, scoring, streaks, XP/levels, mastery, save-document (de)serialization.
- `renderer` — three.js scene: arena, hero, Training Dummy, transformation and blast effects.
- `ui` — Preact screens (Title, Hero creation, Pre-round, HUD, Results, Mastery Grid) and the number pad.
- `audio` — WebAudio synthesizers keyed on effects.
- `persistence` — localStorage adapter, export/import, migrations.
- `app` — bootstrap: wires dispatch, subscribers, the rAF tick loop, injected clock/PRNG, and the test hook.
