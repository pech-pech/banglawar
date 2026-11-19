// Moonstep soak. Run: node tests/soak.js   (SOAK_MS=180000 default; set lower for a smoke run)
// Per viewport: automated hold/release play, console/page errors, rAF frame p50/p95, JS heap growth,
// and Copy report output must contain 'WebGPU output: NOT seen'. Exit 1 on any failure.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const DURATION = +process.env.SOAK_MS || 180000;
const HEAP_LIMIT_MB = +process.env.SOAK_HEAP_MB || 30;
const VIEWPORTS = [[344, 882], [475, 638]];
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

// Visible buttons (defensive: any button / role=button / link-ish element)
const visibleButtons = page => page.evaluate(() => [...document.querySelectorAll('button,[role=button],a[href]')].map(b => {
  const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
  return { t: (b.textContent || b.getAttribute('aria-label') || b.title || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height,
    vis: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none' };
}).filter(b => b.vis)).catch(() => []);
async function clickBtn(page, re) {
  const b = (await visibleButtons(page)).find(x => re.test(x.t));
  if (!b) return false;
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2).catch(() => {});
  return true;
}
const moon = (page, fn, arg) => page.evaluate(fn, arg).catch(() => null);

async function heapMB(cdp) {
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (e) {}
  try {
    const r = await cdp.send('Runtime.getHeapUsage');
    return r.usedSize / 1048576;
  } catch (e) { return NaN; }
}

async function getReportText(page, ctx) {
  // 1) click Copy report, read clipboard
  const cands = [/copy report/i, /^report$/i, /copy/i];
  // Report button may sit on a sub-screen; try common openers if not visible.
  let found = false;
  for (const opener of [null, /settings|menu|more|stats|about|pause|⚙|≡/i]) {
    if (opener && !(await clickBtn(page, opener))) continue;
    await sleep(250);
    for (const re of cands) { if (await clickBtn(page, re)) { found = true; break; } }
    if (found) break;
  }
  if (!found) return { text: '', how: 'no Copy report button found' };
  await sleep(400);
  let text = '';
  try { text = await page.evaluate(() => navigator.clipboard.readText()); } catch (e) {}
  if (text && text.includes('WebGPU')) return { text, how: 'clipboard' };
  // 2) fallback textarea (clipboard blocked UI) or page text
  const alt = await page.evaluate(() => [...document.querySelectorAll('textarea,input,pre')].map(e => e.value || e.textContent || '').join('\n') + '\n' + document.body.innerText).catch(() => '');
  return { text: text || alt, how: text ? 'clipboard' : 'fallback-dom' };
}

async function soak(browser, w, h, base) {
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => {
    try { if (!localStorage.getItem('moonstep.v1')) localStorage.setItem('moonstep.v1', JSON.stringify({ flags: { howto: true } })); } catch (e) {}
    // rAF delta recorder
    window.__soakFrames = []; let last = 0;
    (function tick(t) { if (last) window.__soakFrames.push(t - last); last = t; requestAnimationFrame(tick); })(0);
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('crash', () => errs.push('page crashed'));
  page.on('requestfailed', r => { if (!/favicon/.test(r.url())) errs.push('requestfailed: ' + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable').catch(() => {});

  await page.goto(base + '/index.html', { waitUntil: 'load' });
  const hasHook = await page.waitForFunction(() => window.__moon && window.__moon.state && window.__moon.state(), null, { timeout: 8000 }).then(() => true, () => false);
  if (!hasHook) errs.push('window.__moon hooks missing');

  const res = { size: w + 'x' + h, errs, runs: 0, maxHeight: 0, frames: 0, p50: 0, p95: 0, heap0: NaN, heap1: NaN, report: '', reportHow: '' };
  const startPlay = async () => { // dismiss title / overlays until no screen
    for (let i = 0; i < 6; i++) {
      const scr = await moon(page, () => window.__moon && window.__moon.screen && window.__moon.screen());
      if (!scr) return;
      await clickBtn(page, /^(climb|play|start|continue|resume|retry|again|restart|ok|got it|close|done|next)\b/i) || await clickBtn(page, /./);
      await sleep(250);
    }
  };
  await startPlay();
  await sleep(1500);
  res.heap0 = await heapMB(cdp);

  const t0 = Date.now();
  let lastRunHeight = 0, lastOverClick = 0;
  while (Date.now() - t0 < DURATION) {
    const info = await moon(page, () => { const m = window.__moon, s = m && m.state(); return s ? { over: !!s.over, height: s.height || 0, scr: m.screen ? m.screen() : null } : null; });
    if (!info) { await sleep(200); continue; }
    res.maxHeight = Math.max(res.maxHeight, info.height);
    if (info.scr || info.over) {
      if (info.over && !info.scr) { res.runs++; }
      if (Date.now() - lastOverClick > 400) {
        lastOverClick = Date.now();
        const ok = await clickBtn(page, /(climb again|again|retry|restart|try|new run|climb|play|continue|close|ok|done)\b/i);
        if (!ok) await clickBtn(page, /./);
      }
      await sleep(300);
      continue;
    }
    // hold/release loop on the canvas (lower-middle, away from HUD buttons)
    const cx = w / 2 + (Math.random() - 0.5) * w * 0.3, cy = h * (0.55 + Math.random() * 0.2);
    try {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await sleep(40 + Math.random() * 520);
      if (Math.random() < 0.3) await page.mouse.move(cx + (Math.random() - 0.5) * 80, cy - Math.random() * 100, { steps: 3 });
      await page.mouse.up();
    } catch (e) { errs.push('input: ' + e.message); }
    await sleep(30 + Math.random() * 400);
    // occasional deterministic stepping through the hook to exercise sim/death paths
    if (Math.random() < 0.05) await moon(page, () => window.__moon.step(30, { down: true }));
  }
  await page.mouse.up().catch(() => {});

  // frame stats
  const fr = await moon(page, () => window.__soakFrames) || [];
  const sorted = fr.filter(x => x > 0).sort((a, b) => a - b);
  const pc = p => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(2) : 0;
  res.frames = sorted.length; res.p50 = pc(0.5); res.p95 = pc(0.95);
  res.heap1 = await heapMB(cdp);

  // Copy report check (make sure no overlay hides it: try as-is)
  const rep = await getReportText(page, ctx);
  res.report = rep.text; res.reportHow = rep.how;
  await ctx.close();
  return res;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const results = [], failures = [];
  console.log(`Soak: ${DURATION / 1000}s per viewport, ${VIEWPORTS.length} viewports`);
  for (const [w, h] of VIEWPORTS) {
    let r;
    try { r = await soak(browser, w, h, base); }
    catch (e) { r = { size: w + 'x' + h, errs: ['soak threw: ' + e.message], runs: 0, maxHeight: 0, frames: 0, p50: 0, p95: 0, heap0: NaN, heap1: NaN, report: '', reportHow: '' }; }
    const growth = r.heap1 - r.heap0;
    r.growth = growth;
    r.reportOk = r.report.includes('WebGPU output: NOT seen');
    if (r.errs.length) failures.push(`${r.size}: ${r.errs.length} error(s): ${[...new Set(r.errs)].slice(0, 5).join(' | ')}`);
    if (!r.reportOk) failures.push(`${r.size}: report missing 'WebGPU output: NOT seen' (${r.reportHow})`);
    if (!r.frames) failures.push(`${r.size}: no rAF frames recorded`);
    if (growth > HEAP_LIMIT_MB) failures.push(`${r.size}: heap grew ${growth.toFixed(1)}MB > ${HEAP_LIMIT_MB}MB`);
    results.push(r);
  }
  await browser.close(); server.close();

  const f = n => (Number.isFinite(n) ? n.toFixed(1) : 'n/a');
  console.log('\nviewport | runs | maxH  | frames | p50ms | p95ms | heap0MB | heap1MB | growMB | errs | report');
  for (const r of results) console.log([r.size, r.runs, f(r.maxHeight), r.frames, r.p50, r.p95, f(r.heap0), f(r.heap1), f(r.growth), r.errs.length, r.reportOk ? 'OK(' + r.reportHow + ')' : 'MISSING'].join(' | '));
  if (failures.length) { console.log('\nFAIL'); failures.forEach(x => console.log(' - ' + x)); process.exit(1); }
  console.log('\nPASS');
})().catch(e => { console.error(e); try { server.close(); } catch (x) {} process.exit(1); });
