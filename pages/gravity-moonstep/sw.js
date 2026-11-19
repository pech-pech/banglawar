// Offline cache for Moonstep. Bump CACHE on every release so phones pick up the new build.
const CACHE = 'moonstep-v9';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './src/audio.js', './src/engine.js', './src/gen.js', './src/fx.js', './src/draw.js', './src/ui.js', './src/ui.css', './src/game.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request).then(n => {
    const c = n.clone(); caches.open(CACHE).then(x => x.put(e.request, c)).catch(() => {}); return n;
  }).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
