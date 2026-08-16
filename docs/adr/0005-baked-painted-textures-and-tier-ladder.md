# 0005 — Baked painted textures, and a three-step quality-tier ladder

## Status

Accepted (2026-08-16) — amends [ADR 0004](./0004-composer-bloom-with-sprite-fallback.md) (facade surface, degradation rule) and the architecture doc's "no asset files" line.

## Context

The art-and-aesthetics upgrade (spec #29) wanted painted-quality surfaces — carved arena stone, a nebula dusk sky, soft cloud and spark sprites — and the family explicitly waived the file-size concern. Three ways to get texture detail were considered:

1. **Runtime procedural generation** (the toon ramp's approach) — zero bytes, but the fbm-noise painting the look needs is far too slow to run per-pixel at boot on the family machine.
2. **Downloaded or hand-authored image assets** — photoreal sources clash with the cel-shaded characters, and licensing/provenance becomes a thing to police forever.
3. **Offline baking**: a checked-in Node script paints the textures deterministically (seeded value noise, hand-tuned palettes, a hand-rolled PNG encoder, zero dependencies) into `src/renderer/textures/`; imports inline them into the single HTML file at build time.

The same upgrade added two more post passes (sun shafts, speed-lines), which strained ADR 0004's single-cliff degradation rule ("drop the composer for the rest of the session") and its minimal facade surface.

## Decision

**Bake, don't author or fetch.** `npm run bake:textures` regenerates every texture byte-for-byte (no `Date`, no `Math.random`); the PNGs are committed like generated lockfile artifacts, and the single-file flow test proves the built game requests nothing beyond the document. Original-by-construction: every pixel comes from the script.

**The tier becomes a ladder.** `full` (shafts + speed-lines + bloom) → `bloom` → `sprites`; sustained low fps sheds exactly one tier per episode, sticky as before, so the expensive extras go before bloom does. The facade gains one verb — `flashSpeedLines()` — which is a documented no-op below the full tier; everything else outside the pipeline module still cannot tell which look is active.

## Consequences

- The single file grows by the inlined textures (~2MB total today) — accepted explicitly by the family; the working budget stays "a little file you copy around", low single-digit MB.
- Texture look changes are script edits plus a re-bake, reviewable as parameters rather than binaries; determinism means an unchanged script always reproduces the committed bytes.
- The committed PNGs can silently drift from the script only if someone edits them by hand — don't; re-bake instead.
- Weak devices now keep bloom longer than under ADR 0004 (they shed shafts/speed-lines first), which is strictly gentler than the old single cliff.
- Shadow resolution (2048) is not on the ladder; if a device ever struggles at the sprite tier, that is the next knob to add.
