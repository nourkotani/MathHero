// The hosted copy's service worker (ADR 0006). It lives beside the game on
// GitHub Pages, never inside MathHero.html, and the page registers it only
// over HTTPS. The game is one file, so the cache is tiny.
//
// Cache first, update in the background: a launch always opens at once from
// the cache (offline too), and when the device is online the worker fetches
// the newest files for the next launch. Nothing about Players is ever here:
// Save Files stay in each device's localStorage.

const CACHE = 'mathhero';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const fresh = fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) void cache.put(request, response.clone());
          return response;
        })
        .catch(() => undefined);
      if (cached) {
        // Keep the worker alive until the background update has landed.
        event.waitUntil(fresh);
        return cached;
      }
      return (await fresh) ?? Response.error();
    }),
  );
});
