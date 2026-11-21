// Offline cache for Ridgeline. Bump VERSION on every release so phones pick up the new build.
const VERSION = 'rl-proto-14';
const FILES = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './src/rng.js', './src/config.js', './src/terrain.js', './src/sled.js', './src/render.js', './src/hud.js', './src/tweak.js', './src/themes.js', './src/looks.js', './src/lookparts.js', './src/themeui.js', './src/shapes.js', './src/particles.js', './src/telemetry.js', './src/medals.js', './src/main.js', './src/duneatlas.js', './src/dunefx.js', './src/physics.js', './src/dunes.js', './src/endless.js', './src/props.js', './src/night.js', './src/marks.js', './src/hulls.js', './src/save2.js', './src/daily.js', './vendor/rapier.mjs', './assets/dune-atlas.webp',
  './vendor/three.module.js', './vendor/three.core.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first for everything (bypassing the HTTP cache) so a merged fix reaches the phone on the
// next open; the cache is only the offline fallback. Cache-first kept old main.js alive after #91.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const isPage = e.request.mode === 'navigate';
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(isPage ? './index.html' : e.request, c)); }
    return r;
  }).catch(() => caches.match(isPage ? './index.html' : e.request)));
});
