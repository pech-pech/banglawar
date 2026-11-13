// Installable-app worker for Sixes. NETWORK FIRST for every file, so the phone always gets the newest
// build when online (no version bump needed, no "reopen twice"); the cache is only the offline fallback.
// `cache: 'no-cache'` makes the browser re-check each file with the server instead of using its own
// 10-minute HTTP cache, which is what used to serve stale files after a merge.
const CACHE = 'sixes-offline';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        return Response.error();
      })
  );
});
