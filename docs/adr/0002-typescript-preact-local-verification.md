# 0002 — TypeScript strict, Preact overlay UI, local-only verification

## Status

Accepted (2026-08-14)

## Context

The stack beneath the game is largely forced by ADR 0001 (Vite single-file build, three.js, localStorage, WebAudio, Vitest + Playwright). Three choices remained open, each with real alternatives:

1. **Language** — plain JavaScript vs TypeScript. The architecture's load-bearing contracts (domain events, effects, the versioned save schema) are exactly the kind of thing types either verify or silently let rot. Tickets will be implemented by agents in fresh contexts, raising the value of compiler-checked contracts.
2. **2D UI layer** — the five screens plus HUD and Mastery Grid overlay the 3D canvas. Options: vanilla TS + manual DOM (zero deps, most wiring code, most room for UI-state sync bugs), Preact (~4KB, declarative render-from-state), React (same model, ~45KB heavier in a single-file bundle for no added benefit at this scale). In-canvas UI was rejected outright: DOM text is crisper, accessible, and testable.
3. **Continuous integration** — GitHub Actions vs local-only verification.

## Decision

- **TypeScript with `strict: true`** across every module.
- **Preact** for the DOM overlay UI, rendering declaratively from Game Core state.
- **No CI.** The user chose local-only verification: a single `npm run check` script (typecheck → lint → core tests → build → Playwright against the built file) is the quality gate and must pass before every commit.

## Consequences

- UI screens are pure functions of core state, matching the unidirectional architecture; manual DOM bookkeeping is avoided.
- Preact adds ~4KB to the single-file bundle — negligible against three.js.
- Nothing guards the main branch automatically: **every committer (human or agent) must run `npm run check` before committing.** A broken main stays broken until someone notices locally. Revisit this ADR if that starts happening.
- React-ecosystem components can't be assumed compatible; the UI dependency surface stays Preact-only.
