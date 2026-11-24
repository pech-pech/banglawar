// Bad Trade Bazaar offline cache. VERSION must equal BUILD in core.js. Network-first for every GET.
const VERSION = 'btb-tune-1';
const CORE = ['./', './index.html', './style.css', './core.js', './ui.js', './house.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(CORE.map(f => c.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const cached = k => caches.open(VERSION).then(c => c.match(k));
  const nav = e.request.mode === 'navigate';
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && r.type === 'basic') {
      const c = r.clone();
      e.waitUntil(caches.open(VERSION).then(x => x.put(nav ? './index.html' : e.request, c)).catch(() => {}));
    }
    return r;
  }).catch(() => cached(nav ? './index.html' : e.request).then(m => m || Response.error())));
});
