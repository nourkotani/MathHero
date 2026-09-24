# 0010 — HY-Motion clips, a private repo, and a region-blocked host

## Status

Accepted (2026-09-24) — the family chose this. Amends [ADR 0006](./0006-hosted-install-alongside-the-single-file.md) (where the hosted copy lives) and adds a motion source to [ADR 0009](./0009-react-three-fiber-pipeline.md). The move of the repo and the host is not done yet; see Consequences.

## Context

The family wants an AI workflow that the agent can run alone, from a text prompt to a clip on the hero. A trial (2026-09-24) compared the scripted clips with Tencent HY-Motion 1.0, a text-to-motion model that runs locally on the family's GPU. HY-Motion gives natural body motion (weight shifts, stumbles, recovery), but not the arcade look of the scripted strikes: short reach, long clips, and stances that turn toward the side camera.

The HY-Motion license limits use, reproduction, distribution, and display of the model **and its outputs** to its Territory: the world except the EU, the UK, and South Korea. The family lives in the Territory. The repo and the GitHub Pages copy were public worldwide, so a baked HY-Motion clip there would be distributed and displayed outside the Territory.

The family considered four options: family-only builds, Meshy's paid API, CMU motion capture, and a private repo with region-blocked hosting.

## Decision

- **HY-Motion clips are bake inputs.** A chosen output (`.npz`, SMPL-H) goes in `scripts/blender/sources/hy-motion/`, with its prompt, seed, and command in `manifest.json`. `scripts/blender/mocap.py` retargets it onto the hero rig during the bake and fits it to the game: a window of the source, a time scale to the clip's length, the root eased back home, and blends from and to the stance. The model itself is never needed to bake or to play.
- **Body reactions first.** The wrong-answer Stagger is the first HY-Motion clip. The strikes keep their scripted dash for now.
- **The repo becomes private, and the hosted copy moves behind a region block.** The game is served from the family's own domain through Cloudflare, which refuses visitors from the EU, the UK, and South Korea. GitHub Pages stops serving it.
- **No HY-Motion output is pushed while the repo is public.** HY-Motion work lives on branches that stay local until the repo is private.

## Consequences

- The bake stays reproducible without the model; making a source again needs the model, the prompt, and the seed from the manifest.
- Anyone who gets the game from the family outside the Territory would receive HY-Motion output. The family shares the game only inside the Territory.
- A region block by IP address is a reasonable effort, not a guarantee (VPNs pass it).
- Steps that only the family can do: buy the domain, create the Cloudflare account and an API token. Then the agent moves the host, makes the repo private, and stops GitHub Pages, in that order.
- Other clips can follow the same path. A selection loop (many seeds, measured scores, a contact sheet) picks the candidates.
