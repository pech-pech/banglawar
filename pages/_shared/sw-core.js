// PGS shared service worker core (pgs-update-1). See CONTRACT-pwa-update.md section 2.
// Loaded by each game's sw.js via importScripts. Network first ALWAYS; cache is only an offline fallback.
(function (self) {
  'use strict';

  self.pgsServiceWorker = function pgsServiceWorker(cfg) {
    cfg = cfg || {};
    var game = String(cfg.game || 'game');
    var build = String(cfg.build || 'dev');
    var precache = Array.isArray(cfg.precache) ? cfg.precache : [];
    var legacy = Array.isArray(cfg.legacy) ? cfg.legacy : [];
    var PREFIX = 'pgs-' + game + '-';
    var CACHE = PREFIX + build;
    self.PGS_BUILD = build;

    function scope() { return self.registration.scope; }
    function shared() { return new URL('../_shared/', scope()).href; }

    // Cache key for a navigation: scope + index.html, or the .html URL itself (no search/hash).
    function navKey(url) {
      var u = new URL(url);
      if (/\.html$/i.test(u.pathname)) return u.origin + u.pathname;
      return scope() + 'index.html';
    }

    // install: warm the cache; one bad file must not fail install.
    self.addEventListener('install', function (e) {
      e.waitUntil((function () {
        return caches.open(CACHE).then(function (c) {
          return Promise.allSettled([scope() + 'index.html', shared() + 'update.js'].concat(precache).map(function (u) {
            return c.add(new Request(u, { cache: 'reload' }));
          }));
        }).catch(function () {}).then(function () { return self.skipWaiting(); });
      })());
    });

    // activate: drop this game's old builds + declared legacy names. Never touch other games' caches.
    self.addEventListener('activate', function (e) {
      e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) {
          if (k.indexOf(PREFIX) === 0 && k !== CACHE) return true;
          return legacy.some(function (l) { return l && (k === l || k.indexOf(l) === 0); });
        }).map(function (k) { return caches.delete(k); }));
      }).catch(function () {}).then(function () { return self.clients.claim(); }));
    });

    // Offline fallback: this build's cache, then older caches of this game only.
    function fallback(req, key) {
      var opts = { ignoreSearch: true };
      return caches.open(CACHE).then(function (c) {
        return c.match(key || req, opts).then(function (m) {
          if (m) return m;
          if (key) return c.match(scope() + 'index.html', opts);
        });
      }).then(function (m) {
        if (m) return m;
        return caches.keys().then(function (keys) {
          var mine = keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; });
          var p = Promise.resolve(undefined);
          mine.forEach(function (k) {
            p = p.then(function (found) {
              if (found) return found;
              return caches.open(k).then(function (c) {
                return c.match(key || req, opts).then(function (x) {
                  return x || (key ? c.match(scope() + 'index.html', opts) : undefined);
                });
              });
            });
          });
          return p;
        });
      }).then(function (m) { return m || Response.error(); }, function () { return Response.error(); });
    }

    self.addEventListener('fetch', function (e) {
      try {
        var req = e.request;
        if (req.method !== 'GET') return;
        var url = new URL(req.url);
        if (url.origin !== self.location.origin) return;
        // In scope, or the shared folder (update.js lives in ../_shared/, so offline play keeps it).
        if (req.url.indexOf(scope()) !== 0 && req.url.indexOf(shared()) !== 0) return;
        if (req.headers.has('range')) return;

        // version.json is never cached: it is the "is there a new build" probe.
        if (/\/version\.json$/.test(url.pathname)) {
          e.respondWith(fetch(req.url, { cache: 'no-store' }).catch(function () { return Response.error(); }));
          return;
        }

        var nav = req.mode === 'navigate';
        var key = nav ? navKey(req.url) : null;
        var net = nav
          ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
          : fetch(req, { cache: 'no-cache' });

        e.respondWith(net.then(function (res) {
          try {
            if (res && res.ok && res.status === 200 && res.type === 'basic') {
              var copy = res.clone();
              e.waitUntil(caches.open(CACHE).then(function (c) {
                return c.put(key || req, copy);
              }).catch(function () {}));
            }
          } catch (_) {}
          return res;
        }).catch(function () { return fallback(req, key); }));
      } catch (_) { /* let the browser handle it */ }
    });

    self.addEventListener('message', function (e) {
      try {
        var d = e.data || {};
        if (d.type === 'SKIP_WAITING') self.skipWaiting();
        else if (d.type === 'GET_BUILD') {
          var msg = { type: 'BUILD', build: build };
          if (e.ports && e.ports[0]) e.ports[0].postMessage(msg);
          else if (e.source) e.source.postMessage(msg);
        }
      } catch (_) {}
    });
  };
})(self);
