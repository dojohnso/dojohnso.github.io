// Bump CACHE_NAME on every release so the activate handler purges old caches
// and returning players pick up the new version.
const CACHE_NAME = 'sky-tycoon-v11';
// Relative paths: this app is served from /sky-tycoon/, not the site root.
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Network-first: an online player always gets the latest game; cache is the
// offline fallback. (Cache-first would pin returning players to a stale build.)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // Refresh the cache with the freshly-fetched response.
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
