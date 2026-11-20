// node sw.test.js : sw.js in a vm with fake self / caches / fetch.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
const key = (r) => (typeof r === 'string' ? r : r.url);
function boot(net) { // net: {url: {ok,type,body} | 'throw'}
  const L = {}, stores = {}, waits = [];
  const mkCache = (n) => (stores[n] = stores[n] || new Map(), {
    add: async (f) => { const r = await fetchFn(f); if (!r.ok) throw new Error('bad ' + f); stores[n].set(key(f), r); },
    put: async (k, r) => { stores[n].set(key(k), r); },
    match: async (k) => stores[n].get(key(k)),
  });
  const fetchFn = async (req) => {
    const u = key(req), e = net[u];
    if (!e || e === 'throw') throw new Error('offline ' + u);
    return Object.assign({ clone() { return Object.assign({}, this); } }, e);
  };
  const cachesFn = { open: async (n) => mkCache(n), match: async () => { throw new Error('global caches.match used'); },
    keys: async () => Object.keys(stores), delete: async (k) => delete stores[k] };
  const self = { addEventListener: (t, f) => { L[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  vm.runInContext('0', vm.createContext({}));
  const ctx = vm.createContext({ self, caches: cachesFn, fetch: fetchFn, Promise, console });
  vm.runInContext(SRC, ctx, { filename: 'sw.js' });
  const ev = (o) => { const e = Object.assign({ waitUntil: (p) => waits.push(p), respondWith: (p) => { e.p = Promise.resolve(p); } }, o); return e; };
  return { L, stores, waits, ev, ctx };
}
let n = 0, fails = 0;
async function t(name, fn) { try { await fn(); n++; console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); } }
const OK = (body, type) => ({ ok: true, type: type || 'basic', body });
(async () => {
  await t('VERSION is pl-beta-3', () => assert(/VERSION = 'pl-beta-3'/.test(SRC)));
  await t('install with one missing file still caches the rest and skips waiting', async () => {
    const net = {}; for (const f of ['./', './index.html', './manifest.webmanifest', './icon-192.png']) net[f] = OK(f);
    net['./assets/hero-idle.webp'] = OK('h'); // everything else missing
    const s = boot(net), e = s.ev({}); s.L.install(e); await Promise.all(s.waits);
    const c = s.stores['pl-beta-3'];
    assert(c && c.has('./index.html') && c.has('./assets/hero-idle.webp') && !c.has('./assets/gate-aurora.webp'));
  });
  await t('navigation 404 keeps the old cached index and serves it', async () => {
    const s = boot({ '/p': { ok: false, type: 'basic', body: '404' } });
    s.stores['pl-beta-3'] = new Map([['./index.html', OK('old')]]);
    const e = s.ev({ request: { method: 'GET', mode: 'navigate', url: '/p' } }); s.L.fetch(e);
    const r = await e.p; await Promise.all(s.waits);
    assert.strictEqual(r.body, 'old'); assert.strictEqual(s.stores['pl-beta-3'].get('./index.html').body, 'old');
  });
  await t('navigation ok basic is cached via waitUntil and served', async () => {
    const s = boot({ '/p': OK('new') });
    const e = s.ev({ request: { method: 'GET', mode: 'navigate', url: '/p' } }); s.L.fetch(e);
    const r = await e.p; assert.strictEqual(r.body, 'new'); assert(s.waits.length >= 1);
    await Promise.all(s.waits); assert.strictEqual(s.stores['pl-beta-3'].get('./index.html').body, 'new');
  });
  await t('navigation opaque/non-basic response is not cached', async () => {
    const s = boot({ '/p': OK('x', 'cors') });
    s.stores['pl-beta-3'] = new Map([['./index.html', OK('old')]]);
    const e = s.ev({ request: { method: 'GET', mode: 'navigate', url: '/p' } }); s.L.fetch(e);
    await e.p; await Promise.all(s.waits); assert.strictEqual(s.stores['pl-beta-3'].get('./index.html').body, 'old');
  });
  await t('offline navigation serves the cached index', async () => {
    const s = boot({ '/p': 'throw' });
    s.stores['pl-beta-3'] = new Map([['./index.html', OK('old')]]);
    const e = s.ev({ request: { method: 'GET', mode: 'navigate', url: '/p' } }); s.L.fetch(e);
    assert.strictEqual((await e.p).body, 'old');
  });
  await t('asset hit comes from the versioned cache (no global caches.match)', async () => {
    const s = boot({}); s.stores['pl-beta-3'] = new Map([['/a.webp', OK('cached')]]);
    const e = s.ev({ request: { method: 'GET', mode: 'no-cors', url: '/a.webp' } }); s.L.fetch(e);
    assert.strictEqual((await e.p).body, 'cached');
  });
  await t('asset miss falls back to fetch and is added to the cache when ok', async () => {
    const s = boot({ '/b.webp': OK('net') });
    const e = s.ev({ request: { method: 'GET', mode: 'no-cors', url: '/b.webp' } }); s.L.fetch(e);
    assert.strictEqual((await e.p).body, 'net'); await Promise.all(s.waits);
    assert.strictEqual(s.stores['pl-beta-3'].get('/b.webp').body, 'net');
  });
  await t('asset miss with a 404 is returned but not cached', async () => {
    const s = boot({ '/c.webp': { ok: false, type: 'basic', body: '404' } });
    const e = s.ev({ request: { method: 'GET', mode: 'no-cors', url: '/c.webp' } }); s.L.fetch(e);
    assert.strictEqual((await e.p).body, '404'); await Promise.all(s.waits);
    assert(!s.stores['pl-beta-3'].has('/c.webp'));
  });
  console.log(n + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
})();
