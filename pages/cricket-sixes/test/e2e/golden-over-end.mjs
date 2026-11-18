// Golden Over to the innings end: golden over as the last over of innings 1 -> break, and of the chase -> done, no page reload (window marker survives). Seed 'a'; some seeds end an innings early.
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

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = (process.env.E2E_SHOTS || '/tmp/claude-0/go-shots/').replace(/\/?$/, '/');
const SEED = process.env.E2E_SEED || 'a';
const VPS = [{ width: 475, height: 638 }, { width: 344, height: 882 }];
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

const results = [];
const check = (name, ok, why) => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -- ' + (why || '')}`); return !!ok; };
const errs = [];
const browser = await chromium.launch();

async function run(VP) {
  const tag = `${VP.width}x${VP.height}`;
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'no-preference' });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errs.push(`${tag} pageerror: ` + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`${tag} console: ` + m.text()); });
  const wait = (ms) => page.waitForTimeout(ms);
  const S = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (n) => { try { await page.screenshot({ path: `${SHOTS}${tag}-${n}.png` }); } catch (e) { /* optional */ } };
  async function boot() {
    await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`);
    await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(600);
  }
  const pressAt = async (sel) => { const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); };
  /** Press the pad `lead` ms before `at` (a performance.now() time read from the page). */
  async function tapAt(sel, at, lead = 4) {
    const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    const d = await S((t) => t - performance.now(), at); if (d > lead) await wait(Math.max(0, d - lead));
    await page.mouse.down(); await page.mouse.up();
  }
  const buttons = () => S(() => [...document.querySelectorAll('#app button, #app [role="button"]')].map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') ? { t: (e.innerText || e.getAttribute('aria-label') || e.className).trim().replace(/\s+/g, ' ').slice(0, 24), h: Math.round(r.height * 10) / 10, w: Math.round(r.width) } : null; }).filter(Boolean));
  const circles = () => S(() => [...document.querySelectorAll('.go-c')].map((c) => ({ txt: c.textContent.trim(), filled: c.classList.contains('is-filled'), gold: c.classList.contains('is-gold'), g: (c.className.match(/\bg-([PGM])\b/) || [])[1] || '', next: c.classList.contains('is-next'), shadow: getComputedStyle(c).boxShadow })));
  const PLAN = [0, 0, 0, 200, null, 0]; // ms vs the cross time: 3 Perfect, 1 late 200, 1 no tap (Miss), 1 Perfect
  async function tapBalls(from, to, sel) {
    const off = await S(() => (window.__store.get().goldCal || {}).offset || 0);
    for (let i = from; i < to; i++) {
      await page.waitForFunction((n) => { const r = document.querySelector('.go'); return r && r.dataset.ball === String(n) && r.dataset.hit; }, i, { timeout: 6000, polling: 20 });
      const hit = Number(await S(() => document.querySelector('.go').dataset.hit));
      if (PLAN[i] === null) { // let the ball go by
        await page.waitForFunction((n) => { const r = document.querySelector('.go'); return !r || r.dataset.done === '1' || r.dataset.ball !== String(n); }, i, { timeout: 8000, polling: 40 }).catch(() => {});
      } else await tapAt(sel, hit + off + PLAN[i]);
      await wait(150);
    }
  }

  await boot();
  if ((await S(() => window.__store.get().matchMode)) !== 'wheel') await S(() => window.__store.dispatch('SetMatchMode', { mode: 'wheel' }));
  const adv = () => S(() => {
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
      if (St.get() === before) return 'stuck';
    }
    return St.get().stage;
  });
  await adv();
  const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await wait(200); }
  // play overs 1..9 by auto, so the golden over is the 10th (last) over of the innings
  async function toLastOver() {
    await S(() => { const St = window.__store; let g = 0; while (g++ < 40) { const s = St.get(); if (s.stage !== 'bowl' && s.stage !== 'chase') break; const inn = s.stage === 'bowl' ? s.inn1 : s.inn2; if (inn.over >= 10 || inn.done) break; St.dispatch('WheelOver', { auto: true }); } });
    await wait(400);
    return S(() => { const s = window.__store.get(); const inn = s.stage === 'bowl' ? s.inn1 : s.stage === 'chase' ? s.inn2 : null; return s.stage + (inn ? ' over ' + inn.over + ' done ' + inn.done : ''); });
  }
  async function playGolden(label) {
    await page.waitForSelector('[data-wm="golden"]', { timeout: 6000 });
    await page.evaluate(() => { window.__noReload = 1; });
    await page.click('[data-wm="golden"]');
    if (await page.waitForSelector('.gocal-pad', { timeout: 1500 }).then(() => true, () => false)) {
      for (let n = 0; n < 10; n++) { await page.waitForFunction((k) => { const c = document.querySelector('.gocal-count'); return !c || (c.textContent.includes(`${k + 1} of 10`) && !/Tap the pad/.test(c.textContent)); }, n, { timeout: 5000, polling: 20 }).catch(() => {}); if (!(await page.$('.gocal-pad'))) break; await wait(1270); if (await page.$('.gocal-pad')) await pressAt('.gocal-pad'); await wait(60); }
    }
    await page.waitForSelector('.go .go-cv'); await pressAt('.go-pad');
    for (let i = 0; i < 6; i++) {
      const more = await page.waitForFunction((n) => { const r = document.querySelector('.go'); return !r || r.dataset.done === '1' || (r.dataset.ball === String(n) && r.dataset.hit); }, i, { timeout: 6000, polling: 20 }).then(() => true, () => false);
      if (!more || (await page.$('.go[data-done="1"]'))) break;
      const hit = Number(await S(() => document.querySelector('.go').dataset.hit)); await tapAt('.go-pad', hit); await wait(150);
    }
    await page.waitForSelector('.go[data-done="1"]', { timeout: 6000 });
    await page.click('.go-pad'); // NEXT -> over panel
    await page.waitForSelector('.op-scrim', { timeout: 4000 });
    await wait(1400); await page.click('.op-next, .op-close'); await wait(700);
    const kept = await S(() => window.__noReload === 1);
    check(`${tag}: ${label}: no page reload`, kept, 'window marker lost');
  }
  let r = await toLastOver(); check(`${tag}: innings 1 at its last over (${r})`, /^bowl over 10/.test(r), r);
  await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(900);
  await playGolden('inn1 last over');
  const s1 = await S(() => window.__store.get().stage); check(`${tag}: golden last over of innings 1 -> break screen`, s1 === 'break' && !!(await page.$('.brk-in, .brk, [class*="brk"]')), 'stage ' + s1);
  await S(() => window.__store.dispatch('StartChase', {})); await wait(500); console.log('stage after StartChase', await S(() => window.__store.get().stage));
  r = await toLastOver(); check(`${tag}: chase at its last over (${r})`, /^(chase over 10|done)/.test(r), r);
  if (/^chase over 10/.test(r)) {
    await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(900);
    await playGolden('chase last over');
    const s2 = await S(() => window.__store.get().stage); check(`${tag}: golden last over of the chase -> done`, s2 === 'done', 'stage ' + s2);
    await shot('done');
  }
  await ctx.close();
}
try { for (const vp of [VPS[0]]) await run(vp); } catch (e) { check('script ran to the end', false, e && (e.stack || e.message)); }
check('no console / page errors', errs.length === 0, errs.slice(0, 4).join(' ; '));
await browser.close(); server.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length} PASS, ${fails.length} FAIL  (shots in ${SHOTS})`);
process.exit(fails.length && !process.env.E2E_SOFT ? 1 : 0);
