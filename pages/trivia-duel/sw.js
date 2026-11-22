// Candle Duel offline cache. Bump VERSION on every release.
const VERSION = 'td-home-1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './art/emblem.webp', './art/player-0.webp', './art/player-1.webp', './art/player-2.webp', './art/player-3.webp', './art/rival-1.webp', './art/rival-2.webp', './art/rival-3.webp', './art/rival-4.webp', './art/rival-5.webp', './art/topic-spells.webp', './art/topic-creatures.webp', './art/topic-places.webp', './art/vs-bg.webp'];
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
