# 0007 — Scripted Blender models as baked output

## Status

Accepted (2026-09-23) — amends [ADR 0001](./0001-static-single-file-with-localstorage.md) ("all assets must be generated in code"), [ADR 0005](./0005-baked-painted-textures-and-tier-ladder.md) ("bake, don't author"), and the architecture doc's "procedural hero" line.

## Context

The family wants an arcade-fighter look inspired by 2XKO: chunky readable silhouettes, painterly texture, rim light, a 2.5D side view, exaggerated authored poses, and VFX that look 2D. Code-built geometry in `hero.ts` cannot reach that quality, and authored poses need a rig and animation clips. Blender 5.2 is installed, and the agent drives it through a Blender MCP.

The source of truth had three options:

- **Script-captured** — the MCP is a workbench; every kept step goes into a committed `bpy` script, and a bake regenerates the output.
- **Binary-canonical** — committed `.blend` files are the source. This is faster, but no diff can review a change and nobody can reproduce it.
- **Hybrid** — a script starts the model and hand polish finishes it; the script stops being the truth after the first hand edit.

## Decision

**The `bpy` scripts are the source; everything Blender writes is baked output.** Scripts live in `scripts/blender/`. `npm run bake:models` runs Blender headless and writes the `.blend` and `.glb` files again. Only the `.glb` files are committed (the build needs them); `*.blend` is in `.gitignore` and can be regenerated for viewing at any time. Nobody edits a `.blend` or a `.glb` by hand — change the script and re-bake, as for the PNGs in ADR 0005.

Blender makes the hero (one shared body, the Hair Styles, the shared ascended manes, the rig, and the animation clips), the Training Dummy (body and clips), and the arena. Light-based effects (aura, arcs, motes, milestone cosmetics) stay in code.

**Compression without workers.** Draco and KTX2 decoders in three.js use web workers, which the single-file rules forbid. Models use meshopt compression and WebP textures, inlined into the single file. **There is no size limit** on `MathHero.html`; the family waived it.

## Consequences

- Blender becomes a development dependency, like Node: needed to *change* the art, never to *play*.
- Art changes are reviewable as script diffs; `.glb` diffs are opaque, so a re-bake from an unchanged script is the check that the committed binary is honest.
- Git history grows with each re-bake of a `.glb`; the `.blend` files do not add to it.
- The renderer loads glTF at boot from inlined bytes, so boot time grows with the models. The quality ladder in ADR 0005 is unchanged.
- The look is 2XKO-*inspired* only: no Riot champion, name, likeness, or asset appears in any script or output.
