// Offline cache for Starfall (working name; folder stays gravity-plumbline). Bump VERSION on every release.
// Install: every file is cached on its own inside Promise.allSettled, so one missing file never fails the install
// (the game draws code fallbacks and shows an "ART: fallback" chip for missing art).
const VERSION = 'pl-beta-3';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const ASSETS = [
  'bg-landscape-1280x720.webp', 'bg-portrait-720x1280.webp', 'corbel.webp', 'crusher-head.webp', 'gate-aurora.webp',
  'hero-hurt.webp', 'hero-idle-flame.webp', 'hero-idle.webp', 'hero-land.webp', 'hero-win-flame.webp', 'hero-win.webp',
  'keyart-720x1280.webp', 'lantern.webp', 'ledge-crumble.webp', 'pip-empty.webp', 'pip-full.webp', 'platform-capL.webp',
  'platform-capR.webp', 'platform-full.webp', 'platform-mid.webp', 'portal-moon.webp', 'spikes-row4.webp', 'stone-tile.webp'
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
// Network first for the page (so updates arrive when online), cache first for the rest.
// Only a good same-origin page (ok + basic) replaces the cached index; anything else serves the cached index.
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
