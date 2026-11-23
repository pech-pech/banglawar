// Squad Duel offline cache. Bump VERSION on every release.
const VERSION = 'sq-slice-1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './fonts/atkinson-400.woff2', './fonts/atkinson-700.woff2',
  './css/base.css', './css/manager.css', './css/match.css', './css/scene.css', './css/meta-a.css', './css/meta-b.css', './css/tweak.css',
  './js/rng.js', './js/data.js', './js/odds.js', './js/club-ai.js', './js/fx-nodes.js', './js/fx-players.js', './js/engine.js', './js/progress.js', './js/gacha.js', './js/app.js',
  './ui/scene.js', './ui/match.js', './ui/manager.js', './ui/meta-a.js', './ui/meta-b.js', './ui/tweak.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(CORE.map(f => c.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const cached = k => caches.open(VERSION).then(c => c.match(k));
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok && r.type === 'basic') {
        const c = r.clone();
        e.waitUntil(caches.open(VERSION).then(x => x.put('./index.html', c)).catch(() => {}));
        return r;
      }
      return cached('./index.html').then(m => m || r);
    }).catch(() => cached('./index.html')));
  } else {
    e.respondWith(cached(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) { const c = r.clone(); e.waitUntil(caches.open(VERSION).then(x => x.put(e.request, c)).catch(() => {})); }
      return r;
    })));
  }
});
