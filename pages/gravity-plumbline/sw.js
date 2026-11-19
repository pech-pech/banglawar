// Offline cache for Starfall (working name; folder stays gravity-plumbline). Bump VERSION on every release.
// Install: every file is cached on its own inside Promise.allSettled, so one missing file never fails the install
// (the game draws code fallbacks and shows an "ART: fallback" chip for missing art).
const VERSION = 'pl-beta-1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const ASSETS = [
  'bg-landscape-1280x720.webp', 'bg-portrait-720x1280.webp', 'crusher-head.webp', 'gate-aurora.webp',
  'hero-hurt.webp', 'hero-idle-flame.webp', 'hero-idle.webp', 'hero-land.webp', 'hero-win-flame.webp', 'hero-win.webp',
  'keyart-720x1280.webp', 'ledge-crumble.webp', 'pip-empty.webp', 'pip-full.webp', 'platform-capL.webp',
  'platform-capR.webp', 'platform-full.webp', 'platform-mid.webp', 'portal-moon.webp', 'spikes-row4.webp'
].map(f => './assets/' + f);
const FILES = CORE.concat(ASSETS);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.allSettled(FILES.map(f => c.add(f))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first for the page (so updates arrive when online), cache first for the rest (same origin only).
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
