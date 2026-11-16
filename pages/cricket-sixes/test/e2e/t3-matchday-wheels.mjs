// T3 match-day wheels e2e (CONTRACT-A sec 4 and 6) at 344x882: Hype, Toss, Pep through openWheel.
// Run from the app root:  node test/e2e/t3-matchday-wheels.mjs     Env: E2E_SHOTS=dir (default /tmp/t3-e2e/), E2E_SEED=x, E2E_SOFT=1 (never exit 1).
// Per wheel: (a) overlay opens, SPIN then STOP, a result shows; (b) no Skip / Auto / reduced-motion text in the wheel DOM;
// (c) every visible button in the wheel is >= 56 px tall; (d) reload after STOP (before Collect): same result, no SPIN, no new stop recorded.
// Screenshots (ready + result per wheel) at deviceScaleFactor 1. Prints PASS/FAIL per check, exit 1 on any FAIL.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = (process.env.E2E_SHOTS || '/tmp/t3-e2e/').replace(/\/?$/, '/');
const SEED = process.env.E2E_SEED || 't3-e2e';
const VP = { width: 344, height: 882 };
const MIN_H = 56;
const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* global install */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json', '.txt': 'text/plain' };
const server = http.createServer(async (rq, rs) => { // pages are served under /cricket-sixes/
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
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'no-preference' });
const page = await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push('console: ' + m.text()); });
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) errs.push('network outside app: ' + u); });

const wait = (ms) => page.waitForTimeout(ms);
const S = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => { try { await page.screenshot({ path: `${SHOTS}${n}.png` }); } catch (e) { /* optional */ } };
async function boot() {
  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`);
  await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(600);
  const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await wait(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await wait(400); } }
}
const advance = (stops) => S((want) => {
  const St = window.__store; let g = 0; want = [].concat(want);
  while (!want.includes(St.get().stage) && g++ < 800) {
    const s = St.get(), d = (c, p) => St.dispatch(c, p), before = s;
    switch (s.stage) {
      case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
      case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
      case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
      case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); if (St.get().stage === 'plan') d('StartMatch'); break;
      case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
      case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break;
      case 'train': d('EndWeek'); break; case 'end': d('NewSeason'); break;
      default: return 'stuck:' + s.stage;
    }
    if (St.get() === before) return 'stuck-no-change:' + s.stage;
  }
  return St.get().stage;
}, stops);

const OV = '.wh-ov';
const ovState = () => S((q) => {
  const ov = document.querySelector(q); if (!ov) return { gone: true };
  const go = ov.querySelector('[data-go]'), r = ov.querySelector('[data-res]');
  const resShown = !!r && !r.hidden && getComputedStyle(r).display !== 'none' && r.innerText.trim().length > 0;
  return { go: go ? go.textContent.trim() : '', dis: !go || go.getAttribute('aria-disabled') === 'true' || go.disabled, res: resShown, resText: resShown ? r.innerText.replace(/\s+/g, ' ').trim() : '' };
}, OV);
const ovText = () => S((q) => { const o = document.querySelector(q); return o ? o.innerText : ''; }, OV);
/** Visible buttons inside the overlay with their height. */
const ovButtons = () => S((q) => {
  const o = document.querySelector(q); if (!o) return [];
  return [...o.querySelectorAll('button, [role="button"], a[href]')].map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') ? { t: (e.innerText || e.getAttribute('aria-label') || e.className).trim().replace(/\s+/g, ' ').slice(0, 24), h: Math.round(r.height * 10) / 10, w: Math.round(r.width) } : null; }).filter(Boolean);
}, OV);
const wmOf = (w) => S((id) => { const s = window.__store.get(); return JSON.stringify({ stops: s.wheels && s.wheels.stops && s.wheels.stops[id] ? s.wheels.stops[id] : null }); }, w);
const BAD = /\bskip\b|\bauto\b|reduced[\s-]*motion|show result/i;
const short = (b) => b.map((x) => `${x.t} ${x.w}x${x.h}`).join(' | ');

try {
  await boot();
  check('boot: store present', !!(await S(() => window.__store.get().stage)));
  // force Wheel mode before the first match (new game may default to it already)
  const mm0 = await S(() => window.__store.get().matchMode);
  if (mm0 !== 'wheel') await S(() => window.__store.dispatch('SetMatchMode', { mode: 'wheel' }));
  check('new game forced to Wheel mode (s.matchMode)', (await S(() => window.__store.get().matchMode)) === 'wheel', 'matchMode ' + (await S(() => window.__store.get().matchMode)));
  const st = await advance('matchday'); await wait(500);
  if (!check('reached the match-day screen', st === 'matchday', 'stage ' + st)) throw new Error('no match day');
  check('match-day VM carries wheel meta (vm.wm: hype, toss, pep)', await S(() => { const s = window.__store.get(); return !!(s.matchMode === 'wheel' && document.querySelector('[data-md="hype"]') && document.querySelector('[data-md="toss"]') && document.querySelector('[data-md="pep"]')); }), 'missing [data-md] cards');

  for (const w of ['hype', 'toss', 'pep']) {
    const tag = w.toUpperCase();
    const b = await page.$(`[data-md="${w}"]`);
    if (!check(`${tag}: card button on match day`, !!b, 'no [data-md=' + w + ']')) continue;
    await b.click(); await wait(500);
    const opened = !!(await page.$(OV));
    if (!check(`${tag}: openWheel overlay (.wh-ov) opens`, opened, 'no .wh-ov; dial/reel overlay present: ' + !!(await page.$('.dr-ov')) + (await page.$('.dr-ov') ? ' (old dial-view, T1 openWheel not wired)' : ''))) {
      // still try to get on: close whatever opened and mark the rest of this wheel's checks as unreachable failures
      for (const n of ['SPIN then STOP shows a result', 'no Skip / Auto / reduced-motion text', 'all buttons >= ' + MIN_H + ' px tall', 'reload after STOP shows the same result, no re-spin']) check(`${tag}: ${n}`, false, 'overlay did not open');
      const x = await page.$('.dr-ov [data-go], .dr-ov .c-icon-btn'); await page.keyboard.press('Escape'); await wait(300);
      await advance('matchday'); await S((k) => window.__store.dispatch('MdKeep', { which: [] }), w).catch(() => {});
      continue;
    }
    // ready state
    await shot(`${w}-ready`);
    const t0 = await ovText(), b0 = await ovButtons();
    let spinBtn = await ovState();
    check(`${tag}: ready screen shows SPIN`, /^SPIN/i.test(spinBtn.go), 'go button "' + spinBtn.go + '"');
    // SPIN
    await page.click(`${OV} [data-go]`); await wait(300);
    const t1 = await ovText(), b1 = await ovButtons();
    // wait for STOP to be live, then tap it
    const stopLive = await page.waitForFunction((q) => { const g = document.querySelector(q + ' [data-go]'); return g && /^STOP/i.test(g.textContent.trim()) && g.getAttribute('aria-disabled') !== 'true' && !g.disabled; }, OV, { timeout: 5000, polling: 50 }).then(() => true, () => false);
    const stopTxt = await S((q) => { const g = document.querySelector(q + ' [data-go]'); return g ? g.textContent.trim() : ''; }, OV);
    const t2 = await ovText(), b2 = await ovButtons();
    if (stopLive) await page.click(`${OV} [data-go]`);
    const landed = await page.waitForFunction((q) => { const o = document.querySelector(q), r = o && o.querySelector('[data-res]'); return !!r && !r.hidden && getComputedStyle(r).display !== 'none' && r.innerText.trim().length > 0; }, OV, { timeout: 9000, polling: 50 }).then(() => true, () => false);
    await wait(400);
    const rs = await ovState();
    await shot(`${w}-result`);
    const t3 = await ovText(), b3 = await ovButtons();
    check(`${tag}: SPIN then STOP -> result appears`, stopLive && landed && rs.res, `stopLive ${stopLive} ("${stopTxt}") landed ${landed} res "${rs.resText.slice(0, 80)}"`);
    check(`${tag}: no Skip / Auto / reduced-motion text in the wheel DOM (ready, spinning, result)`, ![t0, t1, t2, t3].some((t) => BAD.test(t)), [t0, t1, t2, t3].map((t) => (t.match(BAD) || [''])[0]).join(',') + ' | ' + [t0, t1, t2, t3].filter((t) => BAD.test(t)).map((t) => t.replace(/\s+/g, ' ').slice(0, 120)).join(' || '));
    const small = [b0, b1, b2, b3].flat().filter((x) => x.h < MIN_H);
    check(`${tag}: every button >= ${MIN_H} px tall (ready, spinning, result)`, small.length === 0, 'too short: ' + [...new Map(small.map((x) => [x.t + x.h, x])).values()].map((x) => `${x.t} ${x.w}x${x.h}`).join(' | ') + ' ; result buttons: ' + short(b3));
    const stopsBefore = await wmOf(w);
    check(`${tag}: stop recorded in s.wheels.stops.${w}`, stopsBefore !== JSON.stringify({ stops: null }), 'no wheels.stops entry (recordStop not wired / T1+T3 handler not landed)');
    // reload after STOP, before Collect
    await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(700);
    let stage = await S(() => window.__store.get().stage);
    if (stage !== 'matchday') stage = await advance('matchday');
    await wait(300);
    const card = await page.$(`[data-md="${w}"]`);
    let again = null, re = null;
    if (card) { await card.click(); await wait(300); re = await ovState(); again = !!(await page.$(OV)); }
    const reSpinBtn = re && !re.gone && /^SPIN/i.test(re.go) && !re.res;
    const sameRes = re && re.res && re.resText === rs.resText;
    check(`${tag}: reload after STOP shows the same result, no re-spin`, !!(again && sameRes && !reSpinBtn), `overlay ${again}; before "${rs.resText.slice(0, 70)}"; after "${re ? re.resText.slice(0, 70) : ''}" go "${re ? re.go : ''}"`);
    check(`${tag}: reload leaves the stored stop untouched`, (await wmOf(w)) === stopsBefore, 'stops changed after reload');
    await shot(`${w}-reloaded`);
    // collect and move on
    for (let i = 0; i < 6 && (await page.$(OV)); i++) { const g = await page.$(`${OV} [data-go]:not([aria-disabled="true"])`); if (g) await g.click().catch(() => {}); await wait(500); }
    if (await page.$(OV)) { await page.keyboard.press('Escape'); await wait(300); }
  }
  check('no console / page errors, no network outside the app', errs.length === 0, errs.slice(0, 4).join(' ; '));
} catch (e) {
  check('script ran to the end', false, e && e.message);
}
await browser.close(); server.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length} PASS, ${fails.length} FAIL  (shots in ${SHOTS})`);
process.exit(fails.length && !process.env.E2E_SOFT ? 1 : 0);
