// Squad Duel offline cache. Bump VERSION on every release.
const VERSION = 'sq-season-1b';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './fonts/atkinson-400.woff2', './fonts/atkinson-700.woff2',
  './css/base.css', './css/manager.css', './css/match.css', './css/scene.css', './css/meta-a.css', './css/meta-b.css', './css/tweak.css', './css/match-result.css', './css/match-cards.css', './css/match-acts.css', './css/match-frame.css', './css/season.css', './css/shootout.css',
  './js/rng.js', './js/data.js', './js/odds.js', './js/club-ai.js', './js/fx-nodes.js', './js/fx-players.js', './js/engine.js', './js/progress.js', './js/gacha.js', './js/season.js', './js/shootout.js', './js/app.js',
  './ui/scene.js', './ui/match-help.js', './ui/match-cards.js', './ui/match-acts.js', './ui/match-result.js', './ui/match-frame.js', './ui/match.js', './ui/manager.js', './ui/meta-a.js', './ui/meta-b.js', './ui/season.js', './ui/shootout.js', './ui/tweak.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(CORE.map(f => c.add(new Request(f, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first for every GET (page, js, css): always try fresh files, cache is offline fallback only.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const nav = e.request.mode === 'navigate';
  const key = nav ? './index.html' : e.request;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok && r.type === 'basic') {
      const c = r.clone();
      e.waitUntil(caches.open(VERSION).then(x => x.put(key, c)).catch(() => {}));
    }
    return r;
  }).catch(() => caches.open(VERSION).then(c => c.match(key)).then(m => m || Response.error())));
});
