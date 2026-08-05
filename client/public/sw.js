// Service worker for offline resilience on a flaky event hotspot.
//
// BUG FIX (important): this used to be stale-while-revalidate for
// EVERYTHING — `return cached || network` — including index.html. Since
// index.html is what points at the hashed JS bundle, every visitor kept
// booting the *previous* build's HTML and therefore the previous build's
// JavaScript, with the fresh copy only landing in the cache for "next
// time". In practice a fix pushed mid-event never reached anyone:
// reloading (even hard-reloading) re-served the stale shell.
//
// Correct split, and the standard PWA pattern:
//   • navigations / index.html  → NETWORK FIRST (cache only as offline
//     fallback) so a new build is picked up on the very next load
//   • /assets/* hashed bundles  → CACHE FIRST (the filename changes on
//     every build, so a cached one is never stale) — instant loads,
//     still works fully offline
//   • /api + /socket.io         → never touched; live event state must
//     always come straight from the network
const CACHE_NAME = 'dominance-shell-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isCacheable(url) {
  return url.origin === self.location.origin &&
    !url.pathname.startsWith('/api') &&
    !url.pathname.startsWith('/socket.io');
}

// Hashed build output (Vite emits /assets/index-A1B2C3.js) is immutable
function isImmutableAsset(url) {
  return url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!isCacheable(url)) return; // API/socket.io pass straight through

  const isNavigation = event.request.mode === 'navigate';

  // ── Cache-first: immutable hashed assets ────────────────────────
  if (isImmutableAsset(url) && !isNavigation) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const resp = await fetch(event.request);
        if (resp && resp.status === 200) cache.put(event.request, resp.clone());
        return resp;
      })
    );
    return;
  }

  // ── Network-first: the app shell and everything else ────────────
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const resp = await fetch(event.request);
        if (resp && resp.status === 200) cache.put(event.request, resp.clone());
        return resp;
      } catch (err) {
        const cached = await cache.match(event.request);
        if (cached) return cached;               // offline fallback
        if (isNavigation) {
          const shell = await cache.match('/index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })
  );
});
