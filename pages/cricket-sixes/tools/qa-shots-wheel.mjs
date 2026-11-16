// Wheel-ring QA shots over tools/wheel-sandbox.html (all 8 rings). 344x882, deviceScaleFactor 1, Chromium, local server only (other hosts aborted).
// Run:  node pages/cricket-sixes/tools/qa-shots-wheel.mjs            (all rings + 60 s idle check, about 2 min)
// Env:  E2E_FAST=1 idle check 6 s instead of 60 s | RINGS=spot,hype subset | GUIDE=1 add &guide=1 | QA_OUT=dir (default t1/qa/wheel/)
// Per ring shots: <ring>-1-ready, <ring>-2-spin-1.0s, <ring>-3-glow-3.5s, <ring>-4-result (taken when the result strip shows, waits up to 8 s after STOP). Times are on the page clock from the SPIN click's event.timeStamp (the wheel's own clock).
// Idle check (ring spot): SPIN, then no tap for 60 s (6 s fast): the wheel must still be spinning (STOP label, no result, no stop logged, still moving).
// audit.json: per shot tap targets (every visible button / role=button / input under 56 px listed in small), per-check results, console errors. Exit 1 if any check fails.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = (process.env.QA_OUT || '/mnt/project-files/games-design/cricket-sixes/2026-11-16-combined-handoff/t1/qa/wheel/').replace(/\/?$/, '/');
const ALL = ['spot', 'course', 'find', 'hype', 'toss', 'pep', 'scout', 'finals'];
const RINGS = (process.env.RINGS ? process.env.RINGS.split(',') : ALL).filter((r) => ALL.includes(r));
const IDLE_S = process.env.E2E_FAST === '1' ? 6 : 60, GUIDE = process.env.GUIDE === '1' ? '&guide=1' : '';
const VIEW = { width: 344, height: 882 };
const { chromium } = createRequire(import.meta.url)('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const AUDIT = {}, CHECKS = [], ERRS = [], BLOCKED = [];
const log = (...a) => console.log(...a);
const check = (ring, name, ok, detail = '') => { CHECKS.push({ ring, check: name, ok: !!ok, detail: String(detail) }); log(`  ${ok ? 'PASS' : 'FAIL'} ${ring} ${name}${detail ? ' (' + detail + ')' : ''}`); };
/** Run one named step; a throw (missing element on the old view, timeout) becomes a FAIL for that check only. */
async function step(ring, name, fn) { try { return await fn(); } catch (e) { check(ring, name, false, String(e.message || e).split('\n')[0].slice(0, 160)); return undefined; } }
const wait = async (t0, secs) => { const w = secs * 1000 - (Date.now() - t0); if (w > 0) await new Promise((r) => setTimeout(r, w)); };
/** Page clock: the wheel's t0 is the SPIN click's own event.timeStamp (performance.now() clock), read back from the page; waits poll performance.now() there. */
const spinTs = (page) => page.evaluate(() => window.__clk[window.__clk.length - 1]);
const pageWait = (page, ts, secs) => page.waitForFunction(([t, s]) => performance.now() >= t + s * 1000, [ts, secs], { polling: 'raf', timeout: 0 });
const pageSince = (page, ts) => page.evaluate((t) => (performance.now() - t) / 1000, ts);

function auditInPage() {
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]'); };
  const out = { targets: [], small: [], hScroll: document.documentElement.scrollWidth > innerWidth + 1 };
  const root = document.querySelector('.wh-ov') || document; // the overlay only: the sandbox's own links sit behind it
  for (const e of root.querySelectorAll('button, [role="button"], a[href], input, summary')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect();
    const t = (e.innerText || e.getAttribute('aria-label') || e.className || '').toString().trim().replace(/\s+/g, ' ').slice(0, 30), s = `${t} ${Math.round(r.width)}x${Math.round(r.height)}`;
    out.targets.push(s); if (r.height < 55.5 || r.width < 55.5) out.small.push(s);
  }
  return out;
}
async function newPage(tag, query) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(ORIGIN) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); BLOCKED.push(u); return route.abort(); });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  await page.addInitScript(() => { window.__clk = []; document.addEventListener('click', (e) => window.__clk.push(e.timeStamp), true); });
  page.on('pageerror', (e) => ERRS.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|net::ERR_FAILED/.test(m.text())) ERRS.push(`[${tag}] console: ${m.text()}`); });
  await page.goto(`${ORIGIN}/cricket-sixes/tools/wheel-sandbox.html?${query}`);
  return { ctx, page };
}
async function shot(page, ring, name) { const a = await page.evaluate(auditInPage).catch((e) => ({ err: e.message })); await page.screenshot({ path: `${OUT}${ring}-${name}.png` }); AUDIT[`${ring}-${name}`] = a; log('  shot', `${ring}-${name}`); return a; }
const goState = (page) => page.evaluate(() => { const g = document.querySelector('.wh-ov [data-go], .wh-ov .wh-go'); const res = document.querySelector('.wh-ov [data-res]'); return { go: g ? (g.innerText || '').trim() : null, glow: !!(g && g.classList.contains('is-glow')), res: !!(res && !res.hidden && (res.innerText || '').trim()), stops: (window.__stops || []).length }; });
const canvasSig = (page) => page.evaluate(() => { const c = document.querySelector('.wh-ov .wh-cv'); if (!c) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; });

async function ringRun(ring) {
  log('ring', ring);
  const { ctx, page } = await newPage(ring, `ring=${ring}${GUIDE}`);
  try {
    const info = await step(ring, 'sandbox-loads', async () => { await page.waitForSelector('.wh-ov', { timeout: 6000 }); const t = await page.textContent('#sb-info').catch(() => ''); const bad = /SUM BAD/.test(t || ''); check(ring, 'sandbox-loads', true, t); check(ring, 'ring-sums-10', !bad, t); return t; });
    if (!info) return;
    await page.waitForTimeout(500);
    await step(ring, 'shot-ready', async () => { const a = await shot(page, ring, '1-ready'); check(ring, 'shot-ready', true); check(ring, 'tap-targets-56-ready', !a.small || !a.small.length, (a.small || []).join('; ')); check(ring, 'no-hscroll-ready', !a.hScroll); });
    const clicked = await step(ring, 'spin-tap', async () => { await page.click('.wh-ov [data-go]'); check(ring, 'spin-tap', true); return true; });
    if (!clicked) return;
    const t0 = await spinTs(page); // the SPIN tap's own timeStamp, read from the page
    await pageWait(page, t0, 1.0);
    await step(ring, 'shot-spinning', async () => { const a = await shot(page, ring, '2-spin-1.0s'); const s = await goState(page); const sig1 = await canvasSig(page); await page.waitForTimeout(120); const sig2 = await canvasSig(page); check(ring, 'shot-spinning', true); check(ring, 'spinning-moves', sig1 !== sig2, `go="${s.go}"`); check(ring, 'tap-targets-56-spin', !a.small || !a.small.length, (a.small || []).join('; ')); check(ring, 'no-result-while-spinning', !s.res && s.stops === 0); });
    await pageWait(page, t0, 3.3); // on the wheel's own clock; the audit + screenshot take about 150-200 ms, so this lands the glow shot on about 3.5 s
    await step(ring, 'shot-glow', async () => { const a = await shot(page, ring, '3-glow-3.5s'); const s = await goState(page); check(ring, 'shot-glow', true); check(ring, 'glow-on-at-3.5s', s.glow, `go="${s.go}" at ${(await pageSince(page, t0)).toFixed(2)}s (page clock)`); check(ring, 'tap-targets-56-glow', !a.small || !a.small.length, (a.small || []).join('; ')); });
    await step(ring, 'stop-tap', async () => { await page.click('.wh-ov [data-go]'); check(ring, 'stop-tap', true); });
    const tStop = Date.now();
    await step(ring, 'stop-logged', async () => { await page.waitForFunction(() => (window.__stops || []).length >= 1, null, { timeout: 4000 }); const st = await page.evaluate(() => window.__stops.slice()); const o = st[0]; const keys = ['t', 'phi', 'e', 'stopT', 'cycle', 'tInCycle', 'sliceId', 'respin']; const miss = keys.filter((k) => !(k in o)); check(ring, 'stop-logged', st.length === 1, `n=${st.length}`); check(ring, 'stop-object-keys', !miss.length, miss.length ? 'missing ' + miss.join(',') : JSON.stringify(o)); check(ring, 'stop-near-glow', o.tInCycle >= 3.0 && o.tInCycle <= 4.2, `tInCycle ${o.tInCycle}`); });
    await step(ring, 'shot-result', async () => { await page.waitForFunction(() => { const r = document.querySelector('.wh-ov [data-res]'); return r && !r.hidden && (r.innerText || '').trim(); }, null, { timeout: 8000 }).catch(() => {}); const a = await shot(page, ring, '4-result'); const s = await goState(page); check(ring, 'result-within-8s', s.res, `${((Date.now() - tStop) / 1000).toFixed(1)}s after STOP`); check(ring, 'shot-result', true); check(ring, 'result-shown', s.res, `go="${s.go}"`); check(ring, 'tap-targets-56-result', !a.small || !a.small.length, (a.small || []).join('; ')); check(ring, 'no-hscroll-result', !a.hScroll); });
  } finally { await ctx.close(); }
}

/** Idle: SPIN and never tap. The wheel must keep spinning for the whole time (no auto-stop, no coast, no result). */
async function idleCheck() {
  const ring = RINGS[0] || 'spot'; log('idle', ring, IDLE_S + ' s');
  const { ctx, page } = await newPage('idle', `ring=${ring}${GUIDE}`);
  try {
    await step('idle', 'idle-open', async () => { await page.waitForSelector('.wh-ov [data-go]', { timeout: 6000 }); await page.click('.wh-ov [data-go]'); });
    const t0 = await spinTs(page); await pageWait(page, t0, IDLE_S);
    await step('idle', 'idle-still-spinning', async () => {
      const s = await goState(page), a = await canvasSig(page); await page.waitForTimeout(120); const b = await canvasSig(page);
      await shot(page, 'idle', `${IDLE_S}s`);
      check('idle', 'idle-no-stop-logged', s.stops === 0, `stops=${s.stops}`); check('idle', 'idle-no-result', !s.res); check('idle', 'idle-wheel-moving', a !== b, `go="${s.go}"`);
    });
  } finally { await ctx.close(); }
}

const idle = idleCheck().catch((e) => check('idle', 'idle-run', false, e.message)); // runs alongside the ring shots (own browser context)
for (const r of RINGS) await ringRun(r).catch((e) => check(r, 'ring-run', false, e.message));
await idle;
await browser.close(); server.close();
const fails = CHECKS.filter((c) => !c.ok);
writeFileSync(OUT + 'audit.json', JSON.stringify({ rings: RINGS, idleSeconds: IDLE_S, view: VIEW, shots: AUDIT, checks: CHECKS, summary: { pass: CHECKS.length - fails.length, fail: fails.length }, consoleErrors: [...new Set(ERRS)], blockedRequests: [...new Set(BLOCKED)] }, null, 1));
log(`\n${CHECKS.length - fails.length} pass / ${fails.length} fail, ${Object.keys(AUDIT).length} shots, ${new Set(ERRS).size} console errors -> ${OUT}audit.json`);
for (const f of fails) log(`  FAIL ${f.ring} ${f.check} ${f.detail}`);
process.exit(fails.length ? 1 : 0);
