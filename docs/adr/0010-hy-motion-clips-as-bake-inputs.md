# 0010 — HY-Motion clips as bake inputs, published on GitHub Pages

## Status

Accepted (2026-09-24) — the family chose this. Adds a motion source to [ADR 0009](./0009-react-three-fiber-pipeline.md). The hosted copy stays on GitHub Pages ([ADR 0006](./0006-hosted-install-alongside-the-single-file.md)).

## Context

The family wants an AI workflow that the agent can run alone, from a text prompt to a clip on the hero. A trial (2026-09-24) compared the scripted clips with Tencent HY-Motion 1.0, a text-to-motion model that runs locally on the family's GPU. HY-Motion gives natural body motion (weight shifts, stumbles, recovery), but not the arcade look of the scripted strikes: short reach, long clips, and stances that turn toward the side camera.

The HY-Motion license limits use, reproduction, distribution, and display of the model **and its outputs** to its Territory: the world except the EU, the UK, and South Korea (License.txt, section 5(c)). The family lives in the Territory. The GitHub Pages copy is public worldwide, and so is the repo while it is public.

The family considered five options: family-only builds, Meshy's paid API, CMU motion capture, a private repo with a region-blocked host on Cloudflare, and publishing on GitHub Pages as before. They first chose the region-blocked host, then dropped it.

## Decision

- **HY-Motion clips are bake inputs.** A chosen output (`.npz`, SMPL-H) goes in `scripts/blender/sources/hy-motion/`. `clips.json` holds each clip's brief (prompts, frames, samples, master seed, window, length, score weights) and its chosen candidate. `scripts/blender/mocap.py` retargets it onto the hero rig during the bake and fits it to the game: a window of the source, a time scale to the clip's length, the root eased back home, and blends from and to the stance. The model is never needed to bake or to play.
- **A selection loop picks the candidates.** `npm run motion -- <clip>` makes every candidate of a brief, scores each one on the hero's own bones (`scripts/blender/motion_score.py`), and renders the best on a contact sheet; `--pick <id>` installs one.
- **Body reactions first.** The wrong-answer Stagger is the first HY-Motion clip. The strikes keep their scripted dash for now.
- **The game with HY-Motion clips is published on GitHub Pages.** The family accepts that the public site and a public repo can reach the EU, the UK, and South Korea, outside the license's Territory. The family may make the repo private; the Pages site stays public either way.

## Consequences

- The bake stays reproducible without the model. Making a source again needs the model and the brief in `clips.json`; the same brief makes the same candidates, bit for bit.
- Publishing on public GitHub Pages does not follow the license's territory clause (section 5(c)). This is the family's accepted risk. If it must be removed, the options are: a region-blocked host (Cloudflare's free plan can block by country code, a domain costs about $10 a year), or a scripted Stagger again (git history has `stagger_pose`).
- Other clips can follow the same path.
