// Installable-app worker for Sixes. NETWORK FIRST for every file, so the phone always gets the newest
// build when online (no version bump needed, no "reopen twice"); the cache is only the offline fallback.
// `cache: 'no-cache'` makes the browser re-check each file with the server instead of using its own
// 10-minute HTTP cache, which is what used to serve stale files after a merge.
const CACHE = 'sixes-offline';
// Captain's Over files are pre-cached (best effort, one by one) so the hand-played over also works offline; everything else is cached as it is fetched.
const GOLDEN = [
  './css/golden-over.css',
  './css/golden-cal.css',
  './js/ui/golden-over-view.js',
  './js/ui/golden-cal.js',
  './js/ui/golden-audio.js',
  './img/golden/ball-0.webp',
  './img/golden/ball-1.webp',
  './img/golden/ball-2.webp',
  './img/golden/ball-3.webp',
  './img/golden/band.webp',
  './img/golden/batter-backswing.webp',
  './img/golden/batter-hit.webp',
  './img/golden/batter-miss.webp',
  './img/golden/batter-run1.webp',
  './img/golden/batter-run2.webp',
  './img/golden/batter-stance.webp',
  './img/golden/bowler-follow.webp',
  './img/golden/bowler-release.webp',
  './img/golden/bowler-runup1.webp',
  './img/golden/bowler-runup2.webp',
  './img/golden/dash.webp',
  './img/golden/fielder-crouch.webp',
  './img/golden/fielder-idle.webp',
  './img/golden/ground.webp',
  './img/golden/manifest.json',
  './img/golden/shadow.webp',
  './img/golden/stumps-broken.webp',
  './img/golden/stumps.webp',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(GOLDEN.map((u) => c.add(u).catch(() => {})))).catch(() => {}).then(() => self.skipWaiting()));
});
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
