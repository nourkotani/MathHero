# 0006 — Hosted install for iPhone and iPad, alongside the single file

## Status

Accepted (2026-09-23) — amends [ADR 0001](./0001-static-single-file-with-localstorage.md) (distribution) and [ADR 0002](./0002-typescript-preact-local-verification.md) (the check gate).

## Context

The family now plays on powerful desktops, iPhones (iPhone 17 Pro size), and an iPad. ADR 0001 ships one `MathHero.html` that is opened with a double-click. iOS cannot do that: the Files app does not run a local HTML file as a full web page. The options were:

- **Hosted web app** — put the built file on static HTTPS (GitHub Pages) and install it with "Add to Home Screen"; a service worker keeps it offline after the first visit.
- **Offline HTML viewer app** — keep the single file and open it in a third-party iOS app. This works, but the game then depends on that app's WebGL and storage support.
- **Native wrapper (Capacitor)** — needs a Mac, Xcode, and an Apple developer account; free signing lasts 7 days.

## Decision

Support **both** the hosted install and the single file. The built `MathHero.html` stays the one deliverable and still runs offline from a double-click or in a viewer app. The hosted copy adds a web manifest and a service worker **around** that file; the game never needs them to run, and it registers the worker only when it is served over HTTPS.

- **Deploy is manual:** `npm run deploy` runs `npm run check`, then pushes the build, the manifest, and the worker to the `gh-pages` branch. There is still no CI (ADR 0002).
- **Saves stay per device.** Each device keeps its own Save File in its own `localStorage`; Export/Import (through the iOS share sheet on iPhone and iPad) is the only bridge.
- **The check gate grows a WebKit smoke set.** iOS runs only WebKit, so every `npm run check` also boots the build in Playwright WebKit at a phone viewport and an iPad viewport and plays one touch Round to Results. The full flow suite stays on Chromium.

## Consequences

- "No internet, ever" becomes "internet once, to install and to update". The desktop double-click path is unchanged.
- The repo is public, so the game is public at its Pages URL. No Player data is ever in the repo or the build.
- An installed iPhone gets a new version at its next online launch; until then it keeps the cached one.
- The check gate becomes slower by the WebKit smoke set.
- iOS can evict web-app storage for an app that is not used for a long time; the 7-day backup reminder is the protection, as for cleared browser data in ADR 0001.
