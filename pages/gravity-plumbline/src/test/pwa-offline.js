// node pwa-offline.js : service worker + offline + manifest checks on the built index.html (local http, Playwright Chromium).
// Needs NODE_PATH=/opt/node22/lib/node_modules
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const fails = []; let nOk = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (c) nOk++; else fails.push(m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
let hits = [];
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); hits.push(p); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot(ctx, url, errs, netfail) {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('requestfailed', (r) => netfail.push(r.url() + ' ' + (r.failure() || {}).errorText));
  await page.goto(url);
  await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.screen, null, { timeout: 10000 });
  await page.waitForFunction(() => PL.Assets && (PL.Assets.missing ? true : false), null, { timeout: 10000 });
  await sleep(1200); // art load
  return page;
}
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
  const errs = [], nf = [];
  let page = await boot(ctx, base + '/index.html?seed=7', errs, nf);
  // ---- service worker active ----
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); if (!r) return null; await navigator.serviceWorker.ready; return { scope: r.scope, state: (r.active || {}).state }; });
  ok(!!sw && sw.state === 'activated', `service worker registered and activated (${JSON.stringify(sw)})`);
  // ---- cache contents ----
  const want = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].concat(fs.readdirSync(path.join(ROOT, 'assets')).map((f) => 'assets/' + f));
  let cached = []; for (let i = 0; i < 20; i++) { cached = await page.evaluate(async () => { const ks = await caches.keys(), out = []; for (const k of ks) { const c = await caches.open(k); for (const q of await c.keys()) out.push(k + ' ' + new URL(q.url).pathname); } return out; }); if (cached.length >= want.length) break; await sleep(300); }
  const paths = cached.map((s) => s.split(' ')[1]);
  const missing = want.filter((w) => paths.indexOf('/' + w) < 0);
  ok(missing.length === 0, `cache holds all ${want.length} files (index, manifest, 3 icons, ${want.length - 5} assets); missing: ${missing.join(',') || 'none'}`);
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = (swSrc.match(/'[a-z0-9\-]+\.webp'/gi) || []).map((s) => s.replace(/'/g, ''));
  const onDisk = fs.readdirSync(path.join(ROOT, 'assets'));
  ok(onDisk.every((f) => listed.indexOf(f) >= 0) && listed.every((f) => onDisk.indexOf(f) >= 0), `sw.js asset list matches assets/ on disk (${listed.length} vs ${onDisk.length})`);
  const gameAssets = await page.evaluate(() => PL.Assets.missing());
  ok(gameAssets.length === 0, `online: no art missing (${gameAssets.join(',') || 'none'})`);
  // ---- manifest ----
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  ok(m.name && m.short_name && m.start_url && m.display && /^(standalone|fullscreen|minimal-ui)$/.test(m.display), `manifest name/short_name/start_url/display (${m.name}, ${m.start_url}, ${m.display})`);
  const ic = m.icons || [];
  const has = (s, p) => ic.some((i) => i.sizes === s && (i.purpose || 'any').split(' ').indexOf(p) >= 0);
  ok(has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'), 'manifest icons 192 any, 512 any, 512 maskable');
  ok(ic.every((i) => fs.existsSync(path.join(ROOT, i.src))), 'manifest icon files exist');
  const dim = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
  ok(ic.every((i) => dim(i.src) === i.sizes), 'manifest icon pixel sizes match declared sizes: ' + ic.map((i) => dim(i.src)).join(','));
  ok(/^#[0-9a-f]{6}$/i.test(m.theme_color) && /^#[0-9a-f]{6}$/i.test(m.background_color), 'manifest colours are hex');
  const linked = await page.evaluate(() => { const l = document.querySelector('link[rel=manifest]'); return l && l.getAttribute('href'); });
  ok(!!linked, `index links the manifest (${linked})`);
  // ---- offline reload ----
  await page.close();
  await ctx.setOffline(true); hits = [];
  const errs2 = [], nf2 = [];
  let p2; try { p2 = await boot(ctx, base + '/index.html?seed=7', errs2, nf2); } catch (e) { ok(false, 'offline reload boots: ' + e.message); }
  if (p2) {
    ok(true, 'offline: game boots from the cache');
    const miss = await p2.evaluate(() => PL.Assets.missing()), chip = await p2.evaluate(() => PL_TEST.chips());
    ok(miss.length === 0 && !chip.artFallback, `offline: art shows, no "ART: fallback" chip (missing ${miss.join(',') || 'none'})`);
    ok(hits.length === 0, `offline: no request reached the server (${hits.length}: ${hits.slice(0, 4).join(',')})`);
    ok(errs2.length === 0, `offline: no console/page errors ${errs2.slice(0, 3).join(' || ')}`);
    const expectedFail = nf2.filter((u) => !/favicon|sw\.js/.test(u));
    ok(expectedFail.length === 0, `offline: no unexpected network failures ${expectedFail.slice(0, 3).join(' || ')}`);
    await p2.evaluate(() => PL_TEST.startMode('short', 7)); await sleep(500);
    ok(await p2.evaluate(() => PL_TEST.screen()) === 'play', 'offline: a climb starts and plays');
    await p2.close();
  }
  // ---- delete one asset from the cache, reload offline -> fallback chip, still plays ----
  const p3a = await ctx.newPage(); await p3a.goto(base + '/index.html?seed=7'); await sleep(800);
  const deleted = await p3a.evaluate(async () => { const ks = await caches.keys(); let n = 0; for (const k of ks) { const c = await caches.open(k); if (await c.delete('./assets/hero-idle.webp')) n++; else if (await c.delete(new Request(location.origin + '/assets/hero-idle.webp'))) n++; } return n; });
  ok(deleted === 1, `deleted assets/hero-idle.webp from the cache (${deleted})`);
  await p3a.close(); hits = [];
  const errs3 = [], nf3 = [];
  const p3 = await boot(ctx, base + '/index.html?seed=7', errs3, nf3);
  const miss3 = await p3.evaluate(() => PL.Assets.missing()), chip3 = await p3.evaluate(() => PL_TEST.chips());
  ok(miss3.length >= 1 && chip3.artFallback, `offline + one asset gone: chip artFallback true (missing ${miss3.join(',')})`);
  await p3.evaluate(() => PL_TEST.startMode('short', 7)); await sleep(400);
  const txt = await p3.evaluate(() => { const o = []; return new Promise((res) => { const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t) { o.push(String(t)); return ft.apply(this, arguments); }; setTimeout(() => { CanvasRenderingContext2D.prototype.fillText = ft; res(o.join('|')); }, 600); }); });
  ok(/ART: fallback/.test(txt), `"ART: fallback" text drawn in play (${/ART[^|]*/.exec(txt) || 'not found'})`);
  const t0 = await p3.evaluate(() => PL_TEST.getRunStats().totalTicks);
  await p3.evaluate(() => PL_TEST.tick(120));
  const t1 = await p3.evaluate(() => PL_TEST.getRunStats().totalTicks);
  ok(await p3.evaluate(() => PL_TEST.screen()) !== 'firstOpen' && t1 > t0, `still plays with fallback art (ticks ${t0} -> ${t1})`);
  const real = errs3.filter((e) => !/Failed to load resource/.test(e));
  ok(real.length === 0, `no console/page errors with a missing asset, apart from the one expected failed fetch (${errs3.length} total) ${real.slice(0, 3).join(' || ')}`);
  await browser.close(); srv.close();
  console.log(`\n${nOk} passed, ${fails.length} failed`); fails.forEach((f) => console.log(' - ' + f));
  process.exit(fails.length ? 1 : 0);
})();
