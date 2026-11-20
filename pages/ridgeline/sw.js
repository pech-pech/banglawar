// Offline cache for Ridgeline. Bump VERSION on every release so phones pick up the new build.
const VERSION = 'rl-proto-4';
const FILES = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './src/rng.js', './src/config.js', './src/terrain.js', './src/sled.js', './src/render.js', './src/hud.js', './src/tweak.js', './src/themes.js', './src/themeui.js', './src/shapes.js', './src/particles.js', './src/main.js',
  './vendor/three.module.js', './vendor/three.core.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first for the page (so updates arrive when online), cache first for the rest.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isPage = e.request.mode === 'navigate';
  if (isPage) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); return r; })
      .catch(() => caches.match('./index.html')));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
