# MathHero — agent guide

A self-contained, offline 3D multiplication game (times tables 1–12) for two kids. One family, one machine, one HTML file.

## Read first

- **`CONTEXT.md`** — the domain glossary. Use its terms **verbatim** in code, tests, commits, and issues (Player, Round, Fact, Power Streak, Hero Level, Adaptive Selection, Save File, Training Dummy, …).
- **`docs/ARCHITECTURE.md`** — stack, module map, unidirectional event flow, determinism rules, single-file constraints, perf budget.
- **`docs/adr/`** — 0001 packaging (single HTML file, localStorage, manual export), 0002 stack (TypeScript strict, Preact, no CI), 0003 core contract (effects, never state-diffing). Do not contradict an ADR; write a new one if a decision must change.

## Work model

- The spec is GitHub issue **#1**; tickets are **#2–#12**, each labeled `ready-for-agent` with explicit "Blocked by" edges. Work the frontier: any ticket whose blockers are closed. Check acceptance criteria off in the issue; close the ticket when all are met. Never modify or close #1.
- Ticket #2 (walking skeleton) establishes the toolchain and both test harnesses; every later ticket extends them.

## Hard rules

- **There is no CI.** `npm run check` (typecheck → lint → core tests → build → Playwright against the built `MathHero.html`) must pass locally **before every commit**. Ticket #2 creates this script; keep it working forever.
- **Game Core purity:** no `Date.now()`, no `performance.now()`, no `Math.random()` in `core` — clock and PRNG are injected. All game rules are tested through `update(state, event) → { state, effects[] }`.
- **Effects, not diffing:** renderer/audio/UI react to the core's `effects[]`; never infer gameplay moments by comparing state snapshots (ADR 0003).
- **Single-file build:** no code-splitting, no workers, no dynamic `import()`, no runtime network requests. Flow tests run against the built file, where inlining failures actually show up.
- **Tests assert behavior only** — never pixels, animation timing, or audio waveforms. Visual/audio quality is verified by eye and ear.
- Audience is a 10-year-old: UI text short, friendly, encouraging. The hero is DBZ-*inspired* but strictly original — no licensed names, likenesses, or assets.
