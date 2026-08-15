# 0001 — Ship as a static single HTML file with localStorage + manual JSON export

## Status

Accepted (2026-08-14)

## Context

MathHero must be "completely self-contained" and "save state to a JSON file." These pull in opposite directions in a browser: a page opened from disk cannot silently write files, while anything that *can* write files automatically (a local Node server, Electron) adds a runtime dependency to every play session. The players are children on a family machine; launching must be double-click simple and work offline forever.

Alternatives considered:

- **Tiny local Node server** — automatic `save.json` on disk, but every play session depends on Node being installed and a server starting; a `.bat` wrapper that breaks means nobody plays.
- **Electron app** — real file writes, but a heavyweight build and installer for a single-family game.
- **Static file + localStorage + manual export** *(chosen)* — zero play-time dependencies; the JSON file exists via explicit Export/Import buttons.

## Decision

Develop with Vite + npm (three.js bundled from node_modules), and build to a **single self-contained `MathHero.html`** via a single-file inlining plugin. Playing requires only double-clicking that file — no server, no internet, copyable to any computer. Game state lives in browser localStorage; the Save File is exported to / imported from a `.json` on disk through explicit Title-screen buttons, with a reminder if no export has happened in 7 days. Node is needed only to *change* the game, never to *play* it.

## Consequences

- Clearing browser data destroys progress unless an export exists — mitigated by the 7-day backup reminder, not eliminated.
- The save is per-browser: playing in a different browser or machine starts empty until a JSON import.
- No auto-written file on disk; "saves to a JSON file" is satisfied by manual export rather than continuous writes.
- All assets (models, sounds) must be generated in code — the single-file constraint forbids loading external asset files, hence the procedural character and WebAudio-synthesized sound.
- Everything must fit comfortably in one bundle; heavy 3D asset pipelines are off the table by design.
