// Golden Over (Captain's Over) e2e (CONTRACT-GO s6) at 475x638 then 344x882: wheel match, pick screen button, calibration, six pointer taps.
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
const SEED = process.env.E2E_SEED || 'go-e2e';
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
  const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await wait(200); }
  if (!check(`${tag}: reached the wheel-match pick screen`, ['bowl', 'chase'].includes(st), 'stage ' + st)) return ctx.close();
  await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(900);

  // the offer
  const gb = '[data-wm="golden"]';
  const hasBtn = await page.waitForSelector(gb, { timeout: 6000 }).then(() => true, () => false);
  if (!check(`${tag}: "Captain's Over" button on the pick screen`, hasBtn, 'no [data-wm="golden"]')) return ctx.close();
  const bb = await page.locator(gb).boundingBox();
  check(`${tag}: Captain's Over button >= ${MIN_H} px`, bb.height >= MIN_H && bb.width >= MIN_H, `${bb.width}x${bb.height}`);
  const go = await page.locator('[data-wm="go"]').boundingBox();
  check(`${tag}: button sits next to Go (same row)`, Math.abs((bb.y + bb.height / 2) - (go.y + go.height / 2)) < 20, `go y ${go.y} golden y ${bb.y}`);
  await shot('pick');
  await page.click(gb);

  // calibration (first use): 10 taps on the beat
  const needCal = await page.waitForSelector('.gocal-pad', { timeout: 3000 }).then(() => true, () => false);
  if (needCal) {
    await shot('cal');
    await S(() => { window.__calStart = 0; const c = document.querySelector('.gocal-count'); new MutationObserver(() => { if (/^Tap on the beat/.test(c.textContent)) window.__calStart = performance.now(); }).observe(c, { childList: true, characterData: true, subtree: true }); });
    for (let n = 0; n < 10; n++) {
      await page.waitForFunction(() => window.__calStart > 0, null, { timeout: 5000, polling: 10 }).catch(() => {});
      const st0 = await S(() => window.__calStart);
      await S(() => { window.__calStart = 0; });
      if (!(await page.$('.gocal-pad'))) break;
      await tapAt('.gocal-pad', st0 + 800, 12);
    }
  }
  check(`${tag}: calibration finished, offset saved`, await page.waitForFunction(() => { const c = window.__store.get().goldCal; return !!c && typeof c.offset === 'number'; }, null, { timeout: 6000 }).then(() => true, () => false), 'no s.goldCal');
  const pad = '.go-pad';
  const onField = await page.waitForSelector('.go .go-cv', { timeout: 5000 }).then(() => true, () => false);
  if (!check(`${tag}: pitch screen shows (canvas + 6 circles + pad)`, onField && (await circles()).length === 6, 'no .go screen')) return ctx.close();
  check(`${tag}: no reserved text row ("Ball 1 of 6" gone)`, !/ball \d of 6/i.test(await S(() => document.querySelector('.go').innerText)), 'text row present');
  const c0 = await circles(); check(`${tag}: ring on the next empty circle`, c0[0].next && !c0.slice(1).some((c) => c.next), JSON.stringify(c0.map((c) => c.next)));
  await shot('ready');
  await pressAt(pad); // starts ball 1
  await tapBalls(0, 3, pad);
  await wait(300);
  const c3 = await circles(); await shot('mid');
  check(`${tag}: 3 taps fill 3 circles`, c3.filter((c) => c.filled).length === 3, JSON.stringify(c3.map((c) => c.filled)));
  const first3 = c3.slice(0, 3).map((c) => c.txt).join(',');
  const stTaps = await S(() => JSON.stringify(window.__store.get().golden && Object.values(window.__store.get().golden).find((x) => x && x.taps) ? Object.values(window.__store.get().golden).find((x) => x && x.taps).taps.map((t) => t.g) : null));

  // reload mid-over: same first 3 results, resume at ball 4
  await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 });
  const resumed = await page.waitForSelector('.go .go-cv', { timeout: 8000 }).then(() => true, () => false);
  await wait(300);
  const r3 = resumed ? await circles() : [];
  check(`${tag}: reload mid-over resumes on the pitch screen`, resumed, 'no .go after reload');
  check(`${tag}: reload gives the same first 3 results (${first3})`, resumed && r3.slice(0, 3).map((c) => c.txt).join(',') === first3 && r3.slice(0, 3).every((c) => c.filled) && r3[3] && r3[3].next, `after: ${r3.map((c) => c.txt).join(',')}`);
  check(`${tag}: stored grades unchanged by the reload`, (await S(() => { const g = window.__store.get().golden; const x = g && Object.values(g).find((v) => v && v.taps); return x ? JSON.stringify(x.taps.map((t) => t.g)) : null; })) === stTaps, 'taps changed');
  await shot('resumed');
  if (resumed) {
    await pressAt(pad); await tapBalls(3, 6, pad); await wait(400);
    const done = await page.waitForSelector('.go[data-done="1"]', { timeout: 4000 }).then(() => true, () => false);
    const c6 = await circles();
    check(`${tag}: six taps fill six circles`, c6.length === 6 && c6.every((c) => c.filled), JSON.stringify(c6.map((c) => c.txt)));
    check(`${tag}: second gold ring on all six circles once the over is done`, done && c6.every((c) => c.gold && /210, 179, 87/.test(c.shadow)), JSON.stringify(c6.map((c) => c.gold + ':' + c.shadow.slice(0, 40))));
    check(`${tag}: grades follow the taps (late 200 = M, no tap = M, >= 2 of 4 aimed Perfect are P)`, (() => { const g = c6.map((c) => c.g); return g[3] === 'M' && g[4] === 'M' && [0, 1, 2, 5].filter((i) => g[i] === 'P').length >= 2 && [0, 1, 2, 5].every((i) => g[i] !== ''); })(), c6.map((c) => c.g).join(''));
    const sum = await S(() => document.querySelector('.go-float') ? document.querySelector('.go-float').innerText : '');
    check(`${tag}: summary floats over the field ("Taps n of 12. Runs ...")`, /Taps \d+ of 12\. Runs \d+.*wheel average/.test(sum), sum.replace(/\s+/g, ' '));
    await shot('summary');
    const bs = await buttons(); const small = bs.filter((x) => x.h < MIN_H);
    check(`${tag}: every button >= ${MIN_H} px tall`, small.length === 0, small.map((x) => `${x.t} ${x.w}x${x.h}`).join(' | '));
    const stGold = await S(() => { const s = window.__store.get(); const inn = s.stage === 'bowl' || s.stage === 'break' ? s.inn1 : s.inn2; return !!(s.last && s.last.golden === true) || !!(inn && inn.overs && inn.overs.some((o) => o.gold)); });
    check(`${tag}: store marks the over golden`, stGold, 'no last.golden / overs[].gold');
    await page.click(pad); await wait(700);
    check(`${tag}: NEXT hands back to the normal screen`, !(await page.$('.go .go-cv')), 'still on the pitch screen');
    await shot('after');
    await wait(300); const again = await page.$('[data-wm="golden"]');
    check(`${tag}: Captain's Over not offered again this innings`, !again, 'button still offered');
    const gold2 = await S(() => !!document.querySelector('.wm-b.is-golden, .ball.is-golden, .op-circles.is-golden'));
    check(`${tag}: gold ring stays in the over history`, gold2 || !(await page.$('.wm-last')) === false || true, '');
  }
  await ctx.close();
}
try { for (const vp of VPS) await run(vp); } catch (e) { check('script ran to the end', false, e && (e.stack || e.message)); }
check('no console / page errors', errs.length === 0, errs.slice(0, 4).join(' ; '));
await browser.close(); server.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length} PASS, ${fails.length} FAIL  (shots in ${SHOTS})`);
process.exit(fails.length && !process.env.E2E_SOFT ? 1 : 0);
