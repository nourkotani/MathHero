# 0009 — The React Three Fiber character pipeline

## Status

Accepted (2026-09-24) — the family chose this pipeline. Amends [ADR 0002](./0002-typescript-preact-local-verification.md) (React now owns the 3D scene), [ADR 0007](./0007-scripted-blender-models-as-baked-output.md) (sourced characters and clips are allowed as bake inputs), and the rule in CLAUDE.md about licensed assets (only the rule against licensed names and likenesses stays).

## Context

The family wants the standard web pipeline for anime fighters: Blender makes the assets, and React Three Fiber (R3F) shows them. The pipeline has these steps:

1. **Blender** makes or imports the character, adds the clips (VRoid, Sketchfab, Mixamo, or Rokoko), puts every clip in the NLA as a named action on one armature, and exports glTF with "Group by Action Name".
2. **gltfjsx** turns each `.glb` into an editable React component.
3. **R3F, drei, and Rapier** show the scene: `useAnimations` changes the clips, `<meshToonMaterial>` with a three-step gradient map gives cel shading, and sensor colliders on the hand and foot bones give hitboxes.

## Decision

- **R3F owns the `#scene` canvas.** `src/scene/mount.tsx` makes an R3F root on the canvas with `createRoot`. The root owns the WebGL renderer, the scene, the camera, and the frame loop. The Preact overlay keeps `#ui`. Files in `src/scene/` start with `/** @jsxImportSource react */`.
- **The core stays the judge.** The scene reads `effects[]` from the store (ADR 0003 stays). A Rapier sensor contact does not decide a hit. A contact decides the frame on which the hit reaction starts.
- **gltfjsx without Draco.** The Draco decoder needs a web worker and a download from a CDN. `npm run bake:models` already does the `--transform` work (dedup, prune, and meshopt compression). gltfjsx runs on the baked `.glb` to make the component. The hero's component is baked output too: `npm run gen:hero` (`scripts/gltfjsx-hero.mjs`) makes it again after each re-bake, and nobody edits it by hand.
- **Sourced assets are bake inputs.** A VRoid `.vrm`, a Sketchfab `.glb`, or a Mixamo `.fbx` file goes in `scripts/blender/sources/` and is committed. The bake script imports the file, retargets the clips to the armature, puts them in the NLA, and exports. Nobody edits a `.blend` or a `.glb` by hand: ADR 0007 stays in force for everything the bake writes.
- **Rapier** comes from `@react-three/rapier` with the `-compat` build, which inlines its WASM as base64 into the single file.
- **Keyboard:** `main.ts` already maps the answer keys (digits, Enter, Backspace). The game has no move keys, so `useKeyboardControls` is not used.

## Consequences

- React adds about 45 KB to `MathHero.html`. The family waived the size limit (ADR 0007).
- Two UI frameworks share one page. React renders only the 3D scene; Preact renders only the DOM overlay.
- Mixamo requires an Adobe account, and VRoid Studio is a desktop app. A person downloads or exports these files; the agent then commits them and bakes them.
- A sourced character must keep the Hair Styles and the tint regions of ADR 0008, or a new ADR must replace ADR 0008.
- The hero model mounts once for the session (`src/scene/Hero.tsx`). A new appearance or Form changes the visible parts through the hero director (`renderer/heroDirector.ts`) and rebuilds only the light made in code: face, aura, motes, and cosmetics. drei's `useAnimations` keeps each action bound to the first root, so a remounted model would lose its clips.
- Cosmetics attach at the bones' rest positions from the `PIVOTS` table in `hero.ts`, not at the current pose: the model can be in the middle of a clip at a rebuild.
