// node soak.js : seeded random pad taps through shafts. 475x638 for 180 s, 344x882 and 816x568 for 60 s each.
// Env SOAK_SCALE=0.1 shortens every run (quick check). Needs NODE_PATH=/opt/node22/lib/node_modules.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const SCALE = parseFloat(process.env.SOAK_SCALE || '1');
const fails = []; let nOk = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (c) nOk++; else fails.push(m); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function soak(browser, port, W, H, secs, seedN) {
  const tag = W + 'x' + H, R = rng(seedN);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html?seed=11`);
  await page.waitForFunction(() => window.PL_TEST && window.PL_TEST.screen, null, { timeout: 8000 });
  await sleep(400);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const m = await cdp.send('Performance.getMetrics'); return m.metrics.find((x) => x.name === 'JSHeapUsedSize').value / 1048576; };
  await page.evaluate(() => { // frame-gap monitor
    window.__gap = { max: 0, n: 0, last: performance.now() };
    (function f(t) { const g = window.__gap; g.max = Math.max(g.max, t - g.last); g.last = t; g.n++; requestAnimationFrame(f); })(performance.now());
    window.__maxStat = { particles: 0, cap: 0, peak: 0 }; window.__nan = [];
  });
  // start a Short climb straight away
  await page.evaluate(() => PL_TEST.startMode('short', 11));
  const t0 = Date.now(), tHeap = 30000 * Math.min(1, SCALE * 2 > 1 ? 1 : Math.max(SCALE * 2, 0.1));
  let heapBase = null, heapMax = 0, taps = 0, wins = 0, restarts = 0, maxParticlesOverCap = 0, nanHit = null, nextWin = 8000, heapStart = null;
  heapStart = await heap();
  while (Date.now() - t0 < secs * 1000) {
    const el = Date.now() - t0;
    const info = await page.evaluate(() => {
      const s = PL_TEST.screen(), L = PL.Input.layout(innerWidth, innerHeight), vs = PL.Vfx.stats();
      const st = PL_TEST.getState(), bad = [];
      if (st) for (const k of ['x', 'y', 'vx', 'vy', 't']) if (typeof st[k] === 'number' && !isFinite(st[k])) bad.push(k);
      const M = window.__maxStat; M.particles = Math.max(M.particles, vs.particles); M.cap = Math.max(M.cap, vs.cap); M.q = vs.quality; M.peak = Math.max(M.peak, vs.peak);
      return { s, L, over: vs.particles > vs.cap, bad, nans: Object.entries(vs).filter(([k, v]) => typeof v === 'number' && !isFinite(v)).map((e) => e[0]), complete: PL_TEST.isComplete() };
    });
    if (info.over) maxParticlesOverCap++;
    if (info.bad.length || info.nans.length) nanHit = nanHit || info.bad.concat(info.nans).join(',');
    if (heapBase === null && el >= tHeap) { heapBase = await heap(); }
    if (heapBase !== null && taps % 40 === 0) heapMax = Math.max(heapMax, await heap());
    if (info.complete || info.s === 'complete' || info.s === 'shaftComplete') { await page.evaluate(() => PL_TEST.startMode('short')); restarts++; continue; }
    if (info.s === 'roomClear') { await page.mouse.click(W / 2, H / 2).catch(() => {}); await page.evaluate(() => PL_TEST.advance()).catch(() => {}); await sleep(60); continue; }
    if (info.s === 'pause' || info.s === 'settings' || info.s === 'menu' || info.s === 'shaftPick') { await page.evaluate(() => PL_TEST.startMode('short')); restarts++; continue; }
    if (el > nextWin) { nextWin = el + 6000 + R() * 6000; if (await page.evaluate(() => PL_TEST.winRoom())) wins++; }
    // random pad tap (real pointer events); 8% of the time a Dive, 4% Retry
    const r = R(), L = info.L; let rc;
    if (r < 0.08) rc = L.dive; else if (r < 0.12) rc = L.retry; else rc = L.keys[Math.floor(R() * 4)];
    const x = rc.x + rc.w / 2, y = rc.y + rc.h / 2;
    await page.evaluate(([x, y]) => { const c = document.querySelector('canvas'); const o = { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y };
      c.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ buttons: 1 }, o))); setTimeout(() => c.dispatchEvent(new PointerEvent('pointerup', Object.assign({ buttons: 0 }, o))), 30); }, [x, y]);
    taps++;
    await sleep(60 + Math.floor(R() * 240));
  }
  const heapEnd = await heap(); heapMax = Math.max(heapMax, heapEnd);
  const fin = await page.evaluate(() => ({ gap: window.__gap, M: window.__maxStat, vs: PL.Vfx.stats() }));
  const growth = heapBase === null ? 0 : heapMax - heapBase;
  console.log(`  ${tag}: ${secs}s taps ${taps} wins ${wins} restarts ${restarts} heap start ${heapStart.toFixed(1)} base(30s) ${heapBase && heapBase.toFixed(1)} max ${heapMax.toFixed(1)} end ${heapEnd.toFixed(1)} MB; frames ${fin.gap.n} maxGap ${fin.gap.max.toFixed(0)} ms; particles max ${fin.M.particles}/cap ${fin.M.cap} peak ${fin.M.peak}; avgMs ${fin.vs.avgMs && fin.vs.avgMs.toFixed ? fin.vs.avgMs.toFixed(1) : fin.vs.avgMs} p95 ${fin.vs.p95Ms && fin.vs.p95Ms.toFixed ? fin.vs.p95Ms.toFixed(1) : fin.vs.p95Ms}`);
  ok(errs.length === 0, `${tag} no page/console errors ${errs.slice(0, 3).join(' || ')}`);
  ok(growth < 15, `${tag} heap growth after first 30 s < 15 MB (${growth.toFixed(1)} MB)`);
  ok(maxParticlesOverCap === 0 && fin.M.peak <= fin.M.cap, `${tag} particles never exceed cap (max ${fin.M.particles}, peak ${fin.M.peak}, max cap seen ${fin.M.cap}, quality at end ${fin.M.q}, over-cap samples ${maxParticlesOverCap})`);
  ok(fin.gap.max < 1000, `${tag} frame loop never stalls > 1 s (max gap ${fin.gap.max.toFixed(0)} ms)`);
  ok(!nanHit, `${tag} no NaN in state/vfx stats ${nanHit || ''}`);
  ok(taps > 20 * Math.min(1, SCALE * 3), `${tag} taps actually sent (${taps})`);
  await ctx.close();
}
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  try {
    await soak(browser, port, 475, 638, 180 * SCALE, 101);
    await soak(browser, port, 344, 882, 60 * SCALE, 202);
    await soak(browser, port, 816, 568, 60 * SCALE, 303);
  } catch (e) { ok(false, 'soak threw ' + e.message); }
  await browser.close(); srv.close();
  console.log(`\n${nOk} passed, ${fails.length} failed`); fails.forEach((f) => console.log(' - ' + f));
  process.exit(fails.length ? 1 : 0);
})();
