# 0008 — The Blender hero keeps every appearance choice

## Status

Accepted (2026-09-24) — amends [ADR 0007](./0007-scripted-blender-models-as-baked-output.md) ("one shared body") and the "Arcade look" spec (#45: "One body for every Player", "3 Hair Styles", "the migration gives every existing hero style 1").

## Context

The design session for the arcade look (2026-09-23) decided that every Player shares one body, and that a new **Hair Style** choice with 3 styles gives each hero its identity. That decision missed what the game already had. Hero creation already offers:

| Choice | Options |
|---|---|
| Body | girl, boy |
| Hair style | spiky, flame, ponytail, buzz |
| Hair length | short, long |
| Garment | fighter gi, caped gi, battle armor |
| Skin tone | 5 presets |

Every existing Save File holds these choices. Building the spec as written would remove the girl and boy bodies, the garments, and the skin tones, and would reset every hero's hair to one style. The children's heroes would change without their consent.

## Decision

**The Blender hero keeps every appearance choice.** The owner chose this on 2026-09-24.

- Blender builds both bodies (girl and boy), with the same heroic-teen arcade proportions and a shared rig, so that one set of clips drives both.
- The **Hair Style** is the existing hair style choice: spiky, flame, ponytail, and buzz, each in short and long. Gold Spark and Storm Gold recolor it; from Wild Mane on, each Form shows its shared mane (spec #45 is unchanged on the manes).
- Garments (gi, caped gi, battle armor) and skin tones stay. Skin tone and the chosen colors apply at runtime through tint masks, as spec #45 says for hair and outfit colors.
- **No Save File migration is needed**: the data already holds every choice. A child can change the look from the Title screen, next to Rename (ticket #50).

## Consequences

- More Blender work: 2 bodies, 4 hair styles × 2 lengths, 3 garments, and 4 manes, instead of 1 body and 3 styles.
- Every existing hero keeps its look through the upgrade.
- The glossary entries for Character and Hair Style change to match.
