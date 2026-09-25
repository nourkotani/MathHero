# 0011 — Tripo-generated models as bake inputs

## Status

Accepted (2026-09-25) — the family asked for a high-polygon male fighter made by AI. Adds a model source to [ADR 0009](./0009-react-three-fiber-pipeline.md). No model is chosen yet.

## Context

The family wants a detailed original fighter, inspired by anime martial-arts heroes and comic-book superhero teams. The Tripo API makes textured 3D models from a text prompt, can rig a humanoid with Mixamo bone names, and can apply preset animations. Its outputs belong to the user on a paid key; free-tier outputs are public and CC BY. Tripo's web-app credits and API credits are separate wallets.

A generated model is one fixed character. The hero keeps every appearance choice ([ADR 0008](./0008-blender-hero-keeps-every-appearance-choice.md)), so a generated fighter fits best as an opponent, beside or in place of the Training Dummy.

## Decision

- **Briefs and records live in `scripts/blender/sources/tripo/models.json`.** A brief holds the prompts, the negative prompt, the seeds, and the options. `npm run tripo -- generate <name>` makes one candidate per prompt and seed, and writes each task's id, status, and cost back into the brief. The task id is the record: a cloud seed does not survive a vendor model update.
- **A paid API key only**, read from `TRIPO_API_KEY`. The tool checks the balance against its cost estimate before it spends.
- **Prompts are original.** They describe features (hair, build, clothing, colors, pose), never franchise, character, or trademark names (CLAUDE.md).
- **High-polygon source, lighter game model.** The chosen candidate is the source at full detail. The bake makes the game's version: fewer faces, turned from Tripo's facing (+X) to the game's (+Z), and given a baked ink hull like the scripted models. The game uses only the base-color texture, as for every model (`models.ts`); Tripo's metallic, roughness, and normal maps are not used.
- **Candidates are judged on a sheet.** `npm run tripo -- preview <name>` renders each candidate from four sides; `pick` records the choice.

## Consequences

- Each candidate costs about 50 API credits ($0.50) at detailed geometry and texture; a rig costs 25, and each preset animation 10.
- The source model can be tens of MB. If it goes into the repo, it goes through git LFS.
- A generated model cannot be changed by editing a script. A change means a new prompt or seed, or a Blender step in the bake.
