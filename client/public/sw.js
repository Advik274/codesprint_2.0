// Minimal service worker: stale-while-revalidate for the app shell (JS/CSS/
// fonts/HTML) so a flaky event-hotspot connection doesn't block a reload,
// and lets the app install as a home-screen icon. API calls and the
// socket.io transport are explicitly never intercepted — live event state
// must always come straight from the network, never from a cache.
const CACHE_NAME = 'dominance-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function isCacheable(url) {
  return url.origin === self.location.origin &&
    !url.pathname.startsWith('/api') &&
    !url.pathname.startsWith('/socket.io');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!isCacheable(url)) return; // let API/socket.io pass straight through, uncached

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200) cache.put(event.request, resp.clone());
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
