# 0011 — Tripo-generated models as bake inputs

## Status

Accepted (2026-09-25) — the family asked for a high-polygon male fighter made by AI. Adds a model source to [ADR 0009](./0009-react-three-fiber-pipeline.md). The fighter is candidate `p0s0`, and it is now the Training Dummy's body.

## Context

The family wants a detailed original fighter, inspired by anime martial-arts heroes and comic-book superhero teams. The Tripo API makes textured 3D models from a text prompt, rigs a humanoid, and applies preset animations to the rig. Its outputs belong to the user on a paid key; free-tier outputs are public and CC BY. Tripo's web-app credits and API credits are separate wallets.

A generated model is one fixed character. The hero keeps every appearance choice ([ADR 0008](./0008-blender-hero-keeps-every-appearance-choice.md)), so a generated fighter fits best as the opponent. The Training Dummy is that opponent: the fighter takes its place, and the Dummy director (`renderer/dummy.ts`) picks the fighter's clips.

## Decision

- **Briefs and records live in `scripts/blender/sources/tripo/models.json`.** A brief holds the prompts, the negative prompt, the seeds, and the options. `npm run tripo` runs each step through the official Tripo CLI and writes each task's id, status, and cost back into the brief. The task id is the record: a cloud seed does not survive a vendor model update.
- **A paid API key only**, read from `TRIPO_API_KEY` or the CLI's own config. The tool checks the balance against its cost estimate before it spends.
- **Prompts are original.** They describe features (hair, build, clothing, colors, pose), never franchise, character, or trademark names (CLAUDE.md).
- **Candidates are judged on a sheet.** `npm run tripo -- preview <name>` renders each candidate from four sides; `pick` records the choice.
- **Decimate first, then rig.** Tripo's retarget fails on the full-detail candidate (about 780k faces). `rig` decimates the chosen candidate to the brief's face count (`scripts/blender/tripo_prepare.py`), then Tripo rigs that model.
- **The native skeleton.** The rig uses model `v1.0-20240301` with spec `tripo`. The biped presets need this skeleton: a rig with Mixamo bone names fails with API error 1004 ("unsupported target skeleton").
- **One preset per retarget task.** A task with several presets bills for each of them but returns only the last clip. `animate` sends one task per clip. The first clip carries the geometry; the others carry the animation only.
- **The bake fits the model to the game.** `scripts/blender/fighter.py` moves every clip onto one armature under the director's clip names. It keeps only the base-color texture at 2048 px, as for every model; Tripo's metallic, roughness, and normal maps are not used. It adds a baked ink hull as wide on screen as the hero's. The model keeps Tripo's size (about 1 m) and facing (+X); `src/scene/Fighter.tsx` scales it and turns it toward the hero.
- **Stand-in clips.** Tripo has no preset for the Dummy's launch and its drop back in. Those cues play a hit clip while the component flies the fighter out of the frame and back.
- **The sources go through git LFS.** The rigged model and its clips (`sources/tripo/<name>/*.glb`) are committed as LFS files. The game model in `src/renderer/models/` is never an LFS file: the build would inline the pointer text in its place.

## Consequences

- Each candidate costs about 50 API credits ($0.50) at detailed geometry and texture; a rig costs 25, and each preset animation 10.
- A fresh clone needs git LFS before `npm run bake:models fighter`. Git for Windows includes it; on macOS, install it with Homebrew.
- A generated model cannot be changed by editing a script. A change means a new prompt or seed, or a Blender step in the bake.
- The fighter adds about 200k triangles (the surface and the ink hull) and about 2.9 MB to the single file. The 60 fps budget on the iPad needs a check by eye.
