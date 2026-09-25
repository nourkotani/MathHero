# 0012 — The Tripo hero keeps every appearance choice

## Status

Accepted (2026-09-25) — the family asked for the hero to be made like the fighter, with every appearance choice kept. Amends [ADR 0008](./0008-blender-hero-keeps-every-appearance-choice.md) (Tripo makes the bodies and parts; Blender fits them, and does not build them) and [ADR 0011](./0011-tripo-models-as-bake-inputs.md) (a generated model is no longer one fixed character). Renames the Training Dummy to the **Rival**.

## Context

The fighter from Tripo is detailed; the scripted hero is chunky. The family wants both from the same pipeline. But a Tripo model is one fixed character, and the hero has many choices (ADR 0008):

| Choice | Options |
|---|---|
| Body | girl, boy |
| Hair Style | spiky, flame, ponytail, buzz; each short or long |
| Garment | fighter gi, caped gi, battle armor |
| Skin tone | 5 presets |
| Colors | hair, outfit primary, outfit secondary (presets) |
| Forms | hair recolor, hair growth, 4 manes |

The code sets three limits. The hero mounts once, and drei binds the clips to that one armature, so a model swap loses the clips (ADR 0009). The renderer finds 12 bones by name (`root`, `torso`, `head`, `hair`, `armL/R`, `elbowL/R`, `legL/R`, `kneeL/R`). The runtime tint multiplies a near-white painted map. Tripo has no export for tint masks.

The name "Training Dummy" no longer fits: the opponent is a fighter who takes hits, flies, and taunts.

## Decision

- **Rival** is the new glossary term for the Training Dummy. The code follows (`rival.ts`, `RivalDirector`, `RIVAL_X`, `Rival.tsx`). The model keeps its asset name, `fighter`. Earlier ADRs keep the old term as history.
- **Parts, not combinations.** Tripo makes 2 bodies, 3 garment pieces (gi top, cape, armor), 8 hair pieces, and 4 manes. All parts go under one armature, and the director shows one of each, as today.
- **The bodies.** The hero matches the Rival: the same anime style (the body prompts use the fighter prompt's words) and the same height (the bake scales both bodies to `FIGHTER_HEIGHT`). The family asked for the general traits of two comic-book heroes: a stocky, powerful brawler (the boy) and an athletic, strong heroine (the girl). Each body wears a fitted two-tone suit, with gloves, knee-high boots, and a wide belt. The prompts describe these traits and never name a character (CLAUDE.md). The first tries in arcade proportions stay in the record.
- **One skeleton for both bodies.** Tripo rigs each body with its native skeleton (`v1.0-20240301`, spec `tripo`). The bake keeps the boy's armature, fits the girl to it, and fails if their joints differ by more than 2 % of the height. The bake renames the 11 joints that the renderer uses, by side (the hero faces +Z, so the character's left is `armR`), and adds the `hair` bone.
- **The pivots are baked output.** The bake writes the rest positions and the fist and boot offsets to `src/renderer/models/hero-rig.json`. The renderer reads it in place of hardcoded values.
- **Tint regions by hue.** The body prompt fixes a flat palette: peach skin, a white suit, cyan panels and trim, no hair, a smooth face. The bake sorts each face into Skin, Outfit, or Trim by hue, keeps the texture's light and shade, and removes its color. The runtime tint works as today. Hair and garments come without texture; the bake paints them as it paints the scripted parts.
- **A face layer per body** shows the face that Tripo painted, in the Rival's style. The game's drawn decals fit the chunky scripted head, not these bodies. The bake copies the head's front faces into a thin layer, bakes the painted face onto it, and keeps only the features (eyes, brows, lashes) opaque, so the tinted skin shows through. A body painted without a face gets a second paint (`npm run tripo -- retexture`): Tripo keeps the UV layout, so the bake takes the face from the new texture and the rest from the first. The eye color of each Form moves from the iris decal to this layer's iris.
- **The clip owns its length; the code reads it.** The director receives each clip's duration from the model. Style values keep only fractions of a clip.
- **Clip sources.** Tripo presets: Idle, the four strikes, Blast, and the Rival's clips. HY-Motion (ADR 0010): Charge, Transform, Stagger, Victory, and the Rival's Launch and Recover. The bake adds the strike dash (3.5–4.0 m), the jump arc, and the spin to the root of each strike clip, so the hitboxes and the contact window stay as they are.

## Consequences

- The scripted body goes to git history. The hero's sources go through git LFS, as in ADR 0011.
- `mocap.py` gets a map from SMPL joints to Tripo bone names. The same map lets HY-Motion drive the Rival. `npm run motion` takes a target (hero or fighter).
- `gen:hero` learns one new rule: the Face shell is not drawn; the renderer uses its shape for the decals.
- Budgets:

| Item | Budget |
|---|---|
| Faces per body | 30,000 |
| Faces per garment piece | 8,000 |
| Faces per hair piece or mane | 4,000 |
| Body texture | 1024 px |
| Hero triangles drawn per frame (with the ink hull) | 84,000 |
| `hero.glb` | about 3.3 MB (1.18 MB now) |
| Built file | about 15 MB (13.1 MB now) |
| Credits planned (with the reserve for diagnosis) | 950 (1,100): the first plan's 690, the second body prompt (200), and the gi top (60) |

- If the iPad drops under 60 fps, decimate the Rival to 50,000 faces first, then the bodies to 20,000.
