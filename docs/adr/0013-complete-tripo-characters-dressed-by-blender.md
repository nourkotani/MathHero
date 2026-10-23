# 0013 — Complete Tripo characters, dressed by Blender

## Status

Accepted (2026-10-22) — the family asked for the hero to be made again, with fewer artifacts and more of the work in Blender. Replaces the parts pipeline of [ADR 0012](./0012-tripo-hero-keeps-every-appearance-choice.md) (the bodies, the face layers, the tint regions by face, the Tripo hair and garment pieces). Keeps its rename (the Rival), its one-set-of-clips-per-rig rule, and the appearance choices of [ADR 0008](./0008-blender-hero-keeps-every-appearance-choice.md).

## Context

The ADR 0012 hero was worse than the Rival, and the family said so. The Rival is one complete Tripo character, used almost as Tripo painted it. The hero was not:

| ADR 0012 step | What it did to the look |
|---|---|
| Bald, faceless bodies in a flat palette | Tripo painted a mannequin: seams and scratches over featureless skin |
| The color stripped from the paint, so a tint could replace it | Only Tripo's dirty light and shade remained: gray plastic |
| Tint regions sorted face by face | Specks of the wrong region on every border; a hard edge at every region |
| The face copied onto a thin layer at 512 px | A smeared, floating face |
| Hair and garments from separate Tripo tasks, fitted by tables of numbers | Blobs of hair, pokes through the garments, a cape in the wrong color |

The family then made two complete characters in Tripo Studio, and asked that Blender do more of the work itself.

## Decision

**Each hero body is one complete Tripo character, kept as painted; Blender builds everything else on it.**

- **A body is a complete character**: a painted face, a buzz cut or cropped hair, the fighter gi, gloves, and boots, in a flat palette (peach skin, a white gi, cyan trim, a charcoal undersuit, dark hair). The API briefs `boy-gi` and `girl-gi` made the first ones (prompts in the Rival's words, "teenage"); the Studio briefs `girl-studio` and `boy-studio` take the family's own models by hand (the API cannot read a Studio task). `hero.py` names each body's brief in `BRIEFS`; a change of body is a change of that table and a bake. Every body goes through the same steps: `preview`, `pick`, `rig` (decimated to 40,000 faces first), then the bake.
- **The paint stays, repaired.** Each body keeps its base-color texture at 2048 px under one material (`PaintedBodyBoy`, `PaintedBodyGirl`). The painted face is the hero's face; the face and iris layers go. Tripo pads each UV island with a dark fringe and leaves dark patches where its views did not reach, which read as black cracks: the bake repaints each island's border pixels and every dark pixel off the head from the nearest good paint, and extends the islands' colors into the gaps (`masks.repair`).
- **The body is decimated by the bake, and the rig gives only its skeleton and weights.** The bake decimates the full candidate to 40,000 faces itself and transfers the rigged model's weights onto it by nearest face, then smooths them over the surface and drops the small shares: Tripo's auto-weights put a share of a thigh on the waist and of a clavicle on the collar, which stretched the Idle pose into slivers (115 stretched edges on the boy; 2 after). Above the top of the neck, within the head's own reach, a vertex then keeps only the head and neck bones (the girl's ear carried 0.9 of an upper-arm twist bone, and the guard's raised arm pulled it into a pale stick; a general rule by bone distance or bone chain tore the torso instead, since the spine's bones are short under a wide skin). A long, thin face (a wisp of hair) is dropped.
- **Colors by masks, in the texture's own space** (`masks.py`). The bake writes two opaque images per body next to the model: the tints (R skin, G outfit, B trim) and the marks (R the body's own hair, G the iris). A pixel's label comes from its hue; the head's geometry settles hair against brows (the scalp above the hairline), and the face's features stay unmasked; a repeated majority vote removes specks, and a short blur softens every edge. The runtime recolors a masked pixel to the chosen color times the pixel's light relative to the region's mean (`hero-rig.json` "tint"), so Tripo's folds, shading, and strands stay, and leaves the rest as painted. A Form's eye color is the iris mark. No mask rides in an alpha channel: a browser drops a pixel's color where its alpha is 0 when it uploads an image to WebGL.
- **The hair is built in Blender** (`hair.py`): every Hair Style and every Form's mane is a set of spikes, flat tapered blades rooted on the scalp by rays from the skull's core, their sizes shares of the skull's width, so one table fits both bodies. The body's own painted hair shows between the spikes and recolors with them; the short buzz cut is no piece at all, the long one a field of tufts. The shapes are DBZ-inspired and original.
- **The garments are built from the body** (`garments.py`): the fighter gi is the body itself; the battle armor is plates cut from the body's own faces (chest, back, shoulders, forearms, shins), pushed out and made solid, with a belt; the caped gi adds a sheet hung from the shoulders. A plate keeps the weights of the faces it came from, so it moves as the skin under it and never pokes through; the cape is weighted by height to the torso's bones.
- **The pieces are painted near white** into one atlas (`HeroPieces`), as the scripted hero was, and the runtime tints them (hair color, outfit colors).
- **The clips stay.** The preset strikes and the Blast come from the `hero-boy` brief's files and fit any Tripo rig; the HY-Motion clips retarget onto each rig (ADR 0010). No animation credits are spent on a new body.
- **The runtime**: one masked painterly material per body (`maskedPainterlySurface`), whose tint uniforms are the same color objects the look code already recolors; the garments and hair keep the tinted painterly materials. The body glows per region, not as a whole: the outfit's, the trim's, and the hair's emissive reach it through the same masks, so a Stagger's wince or a Streak's glow never reddens the face. A part the director asks for that has no piece (`GarmentGi`, `Hair_buzz_short`) shows the body alone (`heroDirector.partShows`).

## Consequences

- The Tripo hair and garment briefs (`hero-hair`, `hero-garments`) and the ADR 0012 bodies stay in the record and in LFS; nothing reads them. `regions.py` and the face-layer code go.
- A body's face is whatever Tripo painted: the family picks a candidate by its face as much as by its body.
- A new body needs: a candidate, a rig (25 credits), and a bake. Masks tune by the brief's palette (`masks.HERO_PALETTE`); a body in other colors needs its own rules.
- Sizes: a body is 40,000 faces and a 2048 px texture; the pieces share a 2048 px atlas. The single file grows by the two textures; the face budgets of ADR 0012 hold (a hair piece under 4,000 faces, a garment under 8,000).
- The hero's look changes for every Player: the same choices, a new body. No Save File changes.
- The body's own painted hair glows with the hair color but does not bloom: the bloom layer holds the hair pieces, and a whole body on it would haze the skin. The short buzz cut is the one Hair Style without bloom.
- The generated `HeroModel.tsx` imports one runtime rule, `partShows`; the generator keeps the mesh tree only.
- Credits spent on 2026-10-22: 4 candidates (200), 2 rigs (50).
