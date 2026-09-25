# MathHero — agent guide

A self-contained, offline 3D multiplication game (times tables 1–12) for two kids. One family, their computers, iPhones and iPad, one HTML file.

## Read first

- **`CONTEXT.md`** — the domain glossary. Use its terms **verbatim** in code, tests, commits, and issues (Player, Round, Fact, Power Streak, Hero Level, Adaptive Selection, Save File, Training Dummy, …).
- **`docs/ARCHITECTURE.md`** — stack, module map, unidirectional event flow, determinism rules, single-file constraints, perf budget.
- **`docs/adr/`** — 0001 packaging (single HTML file, localStorage, manual export), 0002 stack (TypeScript strict, Preact, no CI), 0003 core contract (effects, never state-diffing), 0004–0005 bloom tiers and baked textures, 0006 hosted install alongside the single file, 0007 scripted Blender models, 0008 the Blender hero keeps every appearance choice, 0009 the React Three Fiber character pipeline (R3F owns the 3D scene; sourced characters and Mixamo clips are bake inputs), 0010 HY-Motion clips as bake inputs (`npm run motion`), published on GitHub Pages; the family accepts the risk of the license's territory clause, 0011 Tripo-generated models as bake inputs (`npm run tripo`; the fighter is the Training Dummy's body). Do not contradict an ADR; write a new one if a decision must change.

## Work model

- Work comes as **spec issues** on GitHub, each with tickets labeled `ready-for-agent`. Every ticket names its spec under "Parent" and lists its "Blocked by" edges. Work the frontier: any open ticket whose blockers are closed. Check acceptance criteria off in the ticket; close the ticket when all are met. Never modify or close a spec issue.
- Open specs:
  - **#44 Every device** — tickets #46, #47, #48, #57 (layout by screen shape, WebKit smoke set, hosted install; ADR 0006).
  - **#45 Arcade look** — tickets #49–#56, #58 (Blender-built hero, Training Dummy, and arena; Hair Style; ADR 0007). Install a Blender MCP before #49; the committed Blender script is the record, never a hand-edited `.blend` or `.glb`.
- Closed history: #1 (v1, tickets #2–#12; #2 set up the toolchain and both test harnesses), #13, #20, #24, #29, #43.

## Hard rules

- **There is no CI.** `npm run check` (typecheck → lint → core tests → build → Playwright against the built `MathHero.html`) must pass locally **before every commit**. Ticket #2 creates this script; keep it working forever.
- **Game Core purity:** no `Date.now()`, no `performance.now()`, no `Math.random()` in `core` — clock and PRNG are injected. All game rules are tested through `update(state, event) → { state, effects[] }`.
- **Effects, not diffing:** renderer/audio/UI react to the core's `effects[]`; never infer gameplay moments by comparing state snapshots (ADR 0003).
- **Single-file build:** no code-splitting, no workers, no dynamic `import()`, no runtime network requests. Flow tests run against the built file, where inlining failures actually show up.
- **Tests assert behavior only** — never pixels, animation timing, or audio waveforms. Visual/audio quality is verified by eye and ear.
- Audience is a 10-year-old: UI text short, friendly, encouraging. The hero is DBZ-*inspired* but strictly original — no licensed names or likenesses. Sourced models and clips (VRoid, Mixamo) are allowed as bake inputs (ADR 0009).
