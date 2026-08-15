# 0004 — Real bloom via a post-processing composer, with the sprite fallback

## Status

Accepted (2026-08-15) — supersedes the "additive sprites, decided empirically" note the architecture doc carried since the spectacle-polish ticket.

## Context

The transformation glow was originally implemented as additive sprites because a full-screen bloom pass looked too risky for the 60fps-on-integrated-graphics budget, and the architecture doc deferred the decision to empirical testing. The stylized-anime visual upgrade (spec #13) reopened it: cel-shaded characters with punchy neon emissives are exactly what real bloom flatters most, and sprites alone cannot make an aura *bleed* light.

Three routes were considered:

1. **Keep sprites** — zero risk, but the Super-mode aura never truly radiates.
2. **three.js's own `UnrealBloomPass`** — no new dependency, but it is the notoriously heavy implementation; worst fit for the tablet.
3. **The pmndrs `postprocessing` library** — a new dependency (+~76KB on a ~600KB bundle, pinned exact like every dependency), with a meaningfully faster, better-looking bloom built for exactly this situation.

A second fork inside the bloom choice: *threshold* bloom cannot work here. The game deliberately runs `NoToneMapping` with bright cel bands, so any luminance threshold that catches the neon glows also catches white gi trim and pale arena stone — the whole frame hazes. *Selective* bloom sidesteps luminance entirely.

## Decision

Adopt `postprocessing` (pinned exact) behind a **pipeline facade**: one module owns how a frame reaches the screen and exposes only `render`/`setTier`/`setSize`. Bloom is **selective** — glow meshes (auras, blasts, particles, cosmetic energy, the arena rim, the sun disc) are marked on a dedicated layer at their creation sites; lit surfaces and ink hulls are never marked.

The additive sprites remain in the code as the **fallback tier**. A pure reducer (`qualityTier`) holds the whole degradation rule — sustained sub-45fps for ~3 consecutive seconds drops the composer for the rest of the session; brief dips are ignored; degradation is sticky. The frame loop only feeds it averaged samples and obeys. There is no settings UI, ever: a 10-year-old should never see a graphics menu, and the fallback also protects unknown devices now that the game is public.

## Consequences

- Super mode genuinely radiates on capable machines; weak devices silently get the pre-bloom look, which remains a first-class code path.
- The degradation rule is unit-tested in Vitest as a pure function — the only new test seam this upgrade added.
- The composer is the single place any future pass (vignette, color grade) plugs in; nothing outside the pipeline module knows it exists.
- The bundle grows by the library's inlined size; the single-file build and no-network rules are unaffected (flow tests against the built file prove it).
- The 60fps acceptance gate on the family tablet is satisfied by *either* outcome: bloom holding 60fps, or a clean automatic landing on the fallback tier.
