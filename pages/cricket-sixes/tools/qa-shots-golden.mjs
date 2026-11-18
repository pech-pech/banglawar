// QA shots for the Captain's Over, six viewports x six states, to /tmp/claude-0/go-shots/<w>x<h>-<state>.png. Run: node tools/qa-shots-golden.mjs
// (adapted from test/e2e/golden-over.mjs) Golden Over e2e (CONTRACT-GO s6) at 475x638 then 344x882: wheel match, pick screen button, calibration, six pointer taps.
// Run from the app root:  node test/e2e/golden-over.mjs     Env: E2E_SHOTS=dir (default /tmp/claude-0/go-shots/), E2E_SEED=x, E2E_SOFT=1.
// Checks: button >= 56 px; calibration (10 taps) completes; 6 taps fill six circles; gold ring present on all six after; reload after 3 taps shows the
// same first 3 results and resumes; every visible button >= 56 px; no console errors. Screenshots: ready, mid-over, summary per viewport.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHOTS = (process.env.E2E_SHOTS || '/tmp/claude-0/go-shots/').replace(/\/?$/, '/');
const SEED = process.env.E2E_SEED || 'go-e2e';
const VPS = [[344, 882], [475, 638], [624, 912], [704, 783], [704, 823], [816, 568]].map(([width, height]) => ({ width, height }));
const MIN_H = 56;
const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* global install */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/json', '.txt': 'text/plain' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* optional */ }


const browser = await chromium.launch();
let count = 0;
async function run(VP) {
  const tag = `${VP.width}x${VP.height}`;
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'no-preference' });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const wait = (ms) => page.waitForTimeout(ms);
  const S = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (n) => { await page.screenshot({ path: `${SHOTS}${tag}-${n}.png` }); count++; console.log('shot', `${tag}-${n}`); };
  async function tapAt(sel, at, lead = 4) {
    const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    const d = await S((t) => t - performance.now(), at); if (d > lead) await wait(Math.max(0, d - lead));
    await page.mouse.down(); await page.mouse.up();
  }
  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`);
  await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(600);
  await S(() => { if (window.__store.get().matchMode !== 'wheel') window.__store.dispatch('SetMatchMode', { mode: 'wheel' }); });
  const st = await S(() => {
    const St = window.__store; let g = 0;
    while (!['bowl', 'chase'].includes(St.get().stage) && g++ < 400) {
      const s = St.get(), d = (c, p) => St.dispatch(c, p), before = s;
      switch (s.stage) {
        case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
        case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
        case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
        case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); if (St.get().stage === 'plan') d('StartMatch'); break;
        case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break; case 'train': d('EndWeek'); break;
        default: return 'stuck:' + s.stage;
      }
      if (St.get() === before) return 'stuck-no-change:' + s.stage;
    }
    return St.get().stage;
  });
  if (!['bowl', 'chase'].includes(st)) { console.log('FAIL ' + tag + ' could not reach pick: ' + st); return ctx.close(); }
  const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await wait(200); }
  await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(900);
  await page.waitForSelector('[data-wm="golden"]', { timeout: 6000 });
  await shot('1-pick');
  await page.click('[data-wm="golden"]');
  await page.waitForSelector('.gocal-pad', { timeout: 4000 });
  await shot('2-calibration');
  await S(() => { window.__calStart = 0; const c = document.querySelector('.gocal-count'); new MutationObserver(() => { if (/^Tap on the beat/.test(c.textContent)) window.__calStart = performance.now(); }).observe(c, { childList: true, characterData: true, subtree: true }); });
  for (let n = 0; n < 10; n++) {
    await page.waitForFunction(() => window.__calStart > 0, null, { timeout: 5000, polling: 10 }).catch(() => {});
    const t0 = await S(() => window.__calStart); await S(() => { window.__calStart = 0; });
    if (!(await page.$('.gocal-pad'))) break;
    await tapAt('.gocal-pad', t0 + 800, 12);
  }
  await page.waitForSelector('.go .go-cv', { timeout: 6000 });
  const pad = '.go-pad';
  const off = await S(() => (window.__store.get().goldCal || {}).offset || 0);
  await wait(300);
  const b0 = await page.locator(pad).boundingBox(); await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2); await page.mouse.down(); await page.mouse.up();
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction((n) => { const r = document.querySelector('.go'); return r && r.dataset.ball === String(n) && r.dataset.hit; }, i, { timeout: 6000, polling: 20 });
    const hit = Number(await S(() => document.querySelector('.go').dataset.hit));
    if (i === 2) { // ball 3 in flight: ~450 ms before the cross
      const d = await S((t) => t - performance.now(), hit); if (d > 450) await wait(d - 450);
      await shot('3-mid-over-ball3');
    }
    await tapAt(pad, hit + off + (i === 3 ? 90 : 0));
    if (i === 1) { await wait(120); await shot('4-ball-result'); }
    await wait(150);
  }
  await page.waitForSelector('.go[data-done="1"]', { timeout: 5000 }); await wait(500);
  await shot('5-summary');
  await page.click(pad); await wait(5000);
  await shot('6-over-panel-gold');
  await ctx.close();
}
try { for (const vp of VPS) await run(vp); } catch (e) { console.log('FAIL ' + (e.stack || e.message)); process.exitCode = 1; }
await browser.close(); server.close();
console.log(`${count} screenshots in ${SHOTS}`);
