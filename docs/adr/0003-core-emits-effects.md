# 0003 — The Game Core emits effects; the shell never infers

## Status

Accepted (2026-08-14)

## Context

The renderer and audio layers must react to gameplay moments — a transformation, a broken streak, a level-up, a new personal best. There are two ways they could learn about them:

1. **State diffing** — subscribers compare consecutive state snapshots and infer what happened ("multiplier went from 2 to 3, so a transformation occurred").
2. **Explicit effects** — the core's `update(state, event)` returns `{ state, effects[] }`, where effects are ordered data values (`TRANSFORMED`, `STREAK_BROKEN`, `BLAST_FIRED`, `LEVEL_UP`, `NEW_PERSONAL_BEST`, `ROUND_ENDED`, …) that subscribers consume directly.

Diffing looks cheaper at first — no effect vocabulary to maintain — but the inference logic is duplicated per subscriber, breaks silently when state shape changes, cannot express ordering (level-up *then* personal-best ceremony), and is untestable at the core seam because the "what happened" knowledge lives outside the core.

## Decision

The Game Core returns an ordered `effects[]` list from every `update`. Effects are plain serializable data. The renderer, audio, UI, and persistence subscribe to effects; **no subscriber may diff state snapshots to infer gameplay moments.** The effect vocabulary lives in the core alongside the events and is part of the tested surface: core tests assert which effects fire and in what order.

## Consequences

- Every gameplay moment that has an animation or sound is testable headlessly: "given this state and event, `TRANSFORMED` fires" runs in Vitest with no browser.
- Adding a new spectacle means adding an effect in the core (with a test) plus a handler in the shell — two obvious places, no hidden coupling.
- The effect vocabulary must be maintained; a moment nobody emits is a moment nobody can animate. This is deliberate friction: it keeps the core the single source of truth for *what happened*.
- Effects are fire-and-forget one-way notifications; subscribers cannot respond to an effect with anything but new dispatched events, preserving the unidirectional loop.
