# MathHero — agent guide

A self-contained, offline 3D multiplication game (times tables 1–12) for two kids. One family, their computers, iPhones and iPad, one HTML file.

## Read first

- **`CONTEXT.md`** — the domain glossary. Use its terms **verbatim** in code, tests, commits, and issues (Player, Round, Fact, Power Streak, Hero Level, Adaptive Selection, Save File, Rival, …). The Rival was the Training Dummy until ADR 0012; older ADRs and closed tickets keep the old term.
- **`docs/ARCHITECTURE.md`** — stack, module map, unidirectional event flow, determinism rules, single-file constraints, perf budget.
- **`docs/adr/`** — 0001 packaging (single HTML file, localStorage, manual export), 0002 stack (TypeScript strict, Preact, no CI), 0003 core contract (effects, never state-diffing), 0004–0005 bloom tiers and baked textures, 0006 hosted install alongside the single file, 0007 scripted Blender models, 0008 the Blender hero keeps every appearance choice, 0009 the React Three Fiber character pipeline (R3F owns the 3D scene; sourced characters and Mixamo clips are bake inputs), 0010 HY-Motion clips as bake inputs (`npm run motion`), published on GitHub Pages; the family accepts the risk of the license's territory clause, 0011 Tripo-generated models as bake inputs (`npm run tripo`; the fighter is the Rival's body), 0012 the Tripo hero keeps every appearance choice (parts under one armature, tint regions by hue, the clip owns its length; renames the Training Dummy to the Rival). Do not contradict an ADR; write a new one if a decision must change.

## Work model

- Work comes as **spec issues** on GitHub, each with tickets labeled `ready-for-agent`. Every ticket names its spec under "Parent" and lists its "Blocked by" edges. Work the frontier: any open ticket whose blockers are closed. Check acceptance criteria off in the ticket; close the ticket when all are met. Never modify or close a spec issue.
- Open specs:
  - **#44 Every device** — tickets #46, #47, #48, #57 (layout by screen shape, WebKit smoke set, hosted install; ADR 0006).
  - **#45 Arcade look** — tickets #49–#56, #58 (Blender-built hero, Training Dummy, and arena; Hair Style; ADR 0007). Install a Blender MCP before #49; the committed Blender script is the record, never a hand-edited `.blend` or `.glb`.
- Closed history: #1 (v1, tickets #2–#12; #2 set up the toolchain and both test harnesses), #13, #20, #24, #29, #43.

## Hard rules

- **There is no CI.** `npm run check` (typecheck → lint → core tests → build → Playwright against the built `MathHero.html`) must pass locally **before every commit**. Ticket #2 creates this script; keep it working forever.
- **Game Core purity:** no `Date.now()`, no `performance.now()`, no `Math.random()` in `core` — clock and PRNG are injected. All game rules are tested through `update(state, event) → { state, effects[] }`.
- **Effects, not diffing:** renderer/audio/UI react to the core's `effects[]`; never infer gameplay moments by comparing state snapshots (ADR 0003).
- **Single-file build:** no code-splitting, no workers, no dynamic `import()`, no runtime network requests. Flow tests run against the built file, where inlining failures actually show up.
- **Tests assert behavior only** — never pixels, animation timing, or audio waveforms. Visual/audio quality is verified by eye and ear.
- Audience is a 10-year-old: UI text short, friendly, encouraging. The hero is DBZ-*inspired* but strictly original — no licensed names or likenesses. Sourced models and clips (Tripo, HY-Motion, VRoid, Mixamo) are allowed as bake inputs (ADR 0009–0012).

## Model and animation pipeline

Blender is the bakery: every model and clip in the game is the output of a committed script. AI tools make the inputs. ADR 0007, 0009, 0010, 0011, and 0012 hold the decisions; this section is how to run it. ADR 0012 (the Tripo hero) is in progress: until it lands, the hero is the scripted `hero.py` body.

**Records**

| Record | File |
|---|---|
| Tripo briefs, task ids, costs, candidates, the chosen one, rig, clip presets | `scripts/blender/sources/tripo/models.json` |
| Tripo sources: every candidate at full detail, the rigged model, one file per clip | `scripts/blender/sources/tripo/<name>/**/*.glb` (git LFS) |
| HY-Motion briefs, scores, and chosen candidates | `scripts/blender/sources/hy-motion/clips.json`, `*.npz` |
| Bake scripts | `scripts/blender/` (`bake.py` lists the models; `common.py`, `regions.py`, `mocap.py`, `tripo_prepare.py`, `tripo_preview.py`, `motion_score.py`, `contact_sheet.py`) |
| Baked output: committed, never LFS, never edited by hand | `src/renderer/models/*.glb`, `src/scene/models/*.tsx` |

**Commands**

| Step | Command |
|---|---|
| Show the API credit balance | `npm run tripo -- balance` |
| Make the candidates of a brief (plans are checked with `--dry-run`, then the balance) | `npm run tripo -- generate <name>` |
| Render every candidate from four sides | `npm run tripo -- preview <name>` → `build/tripo/<name>/sheet.png` |
| Record the choice (the family picks from the sheet) | `npm run tripo -- pick <name> <id>` |
| Paint the chosen candidate again from the brief's `retexture` text (the UV layout stays; the bake takes only what it needs, such as the face) | `npm run tripo -- retexture <name>` |
| Decimate, then rig with the native skeleton | `npm run tripo -- rig <name>` |
| Make one clip per preset | `npm run tripo -- animate <name>` |
| Make, score, and render HY-Motion candidates for a clip (the brief's `"target"` picks the rig, hero or fighter; `--for` overrides it) | `npm run motion -- <clip> [--for hero\|fighter]` |
| Install a HY-Motion candidate | `npm run motion -- <clip> --pick <id>` |
| Bake models | `npm run bake:models [hero\|fighter\|arena]` |
| Make the hero component again (after every hero bake) | `npm run gen:hero` |

**Rules**

- Use a paid Tripo key only (`TRIPO_API_KEY` or the CLI config). Free-tier outputs are public and CC BY. Never print, copy, or commit the key.
- Tripo's web credits and API credits are separate wallets. Buy API credits with `tripo topup`.
- Prompts describe features only: hair, build, clothing, colors, pose. Never a franchise, character, or trademark name.
- Keep a negative prompt at 255 characters or fewer. The dry run rejects a longer one.
- The task id is the record. A cloud seed does not survive a vendor model update. Never make a finished candidate again.
- If you stop a run, Tripo still finishes and bills each queued task. Find the task with `tripo history`, record its id in the brief, and fetch it with `tripo task watch <id> --download`.
- Decimate before you rig: the retarget fails on the full model (about 780k faces).
- Rig with model `v1.0-20240301` and spec `tripo`. A Mixamo-named rig matches no biped preset (API error 1004).
- Send one preset per retarget task. A task with several presets bills each preset but returns only the last clip.
- Put the Tripo sources in git LFS. Never put `src/renderer/models/` in LFS: the build would inline the pointer text, and the game would break with no error.
- Never edit a `.blend`, a `.glb`, or a generated component by hand. Change the script and bake again.
- The clip owns its length; the code reads it (ADR 0012). Do not copy a clip's duration into a constant.
- HY-Motion runs outside the repo on GPU 1 (memory note `hy-motion-local-setup`). It needs the target's `build/models/<target>.blend`: run `npm run bake:models hero` or `fighter` first. `mocap.py` retargets onto the scripted hero's joints, or onto a Tripo rig through a naming scheme (`mocap.TRIPO`). Its outputs are limited to the license Territory (ADR 0010).
- Tests assert behavior only. Judge the look by eye on the sheet and in the game.

**Tripo CLI exit codes**

| Exit | Meaning | Action |
|---|---|---|
| 2 | Bad parameters | Fix the brief. `--dry-run` shows the plan. |
| 3 | Auth | Run `tripo doctor`. |
| 4 | Not enough credits | Buy API credits with `tripo topup`. |
| 5 | Content policy | Write the prompt again. |
| 6 | Task failed (credits refunded) | Read `task.json`. Try another seed. |
| 9 | Rate limit | Wait, then run again. |
