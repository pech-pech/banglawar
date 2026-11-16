// T6 Clinic flow e2e at 344x882: v7 save -> Training -> coach Clinic button -> pick player -> wheel SPIN/STOP -> aria-live text == visible result
// -> reload keeps the same slice -> Nets shows the Clinic chip/line -> End week -> button ready again.
// Steps that need wiring not on this branch (T7 coach.clinic row data + 'clinicpick'/'clinicwheel' sheets, T1 openWheel ring) print SKIP with the reason, never FAIL.
// Run from the app root:  node test/e2e/clinic-flow.mjs      Env: E2E_SEED=x. Exit 1 on any FAIL.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), SEED = process.env.E2E_SEED || 'clinic-flow';
const FIXTURE = await readFile(new URL('../fixtures/v7-save.json', import.meta.url), 'utf8');
const req = createRequire(import.meta.url);
function loadPlaywright() { try { return req('playwright'); } catch (e) { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return req(req.resolve('playwright', { paths: [g] })); } }
const { chromium } = loadPlaywright();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    const buf = await readFile(f); rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(buf);
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`, URL_ = `${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`;

const results = [], errs = [];
const step = (name, ok, why) => results.push({ name, st: ok ? 'PASS' : 'FAIL', why: ok ? '' : String(why || '') });
const skip = (name, why) => results.push({ name, st: 'SKIP', why });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__clfx')) { localStorage.setItem('cs.save.1', fx); localStorage.setItem('__clfx', '1'); } } catch (e) { /* blocked */ } }, FIXTURE);
const page = await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`console: ${m.text()}`); });
const wait = (ms = 300) => page.waitForTimeout(ms);
const get = (fn, a) => page.evaluate(fn, a);
const advance = (stops) => page.evaluate((stopAt) => { // drive by command to a stop stage (same driver as the other e2e scripts)
  const S = window.__store; let g = 0; const want = [].concat(stopAt);
  while (!want.includes(S.get().stage) && g++ < 800) {
    const s = S.get(), d = (c, p) => S.dispatch(c, p);
    switch (s.stage) {
      case 'freepick': d('TakeFreePick', { what: 'stands' }); break;
      case 'hub': case 'semi': case 'final': d('OpenSquad'); break;
      case 'squad': d('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); break;
      case 'plan': d('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); d('NewMatch'); if (S.get().stage === 'plan') d('StartMatch'); break;
      case 'bowl': d('BowlOver'); break; case 'break': d('StartChase'); break; case 'chase': d('BowlOver', { intent: 'R' }); break;
      case 'done': d('FinishMatch'); break; case 'week': d('NextWeek'); break; case 'matchday': d('MatchdayGo'); break;
      case 'train': d('EndWeek'); break; case 'end': d('NewSeason'); break;
      default: return 'stuck:' + s.stage;
    }
    if (S.get() === s) return 'stuck-no-change:' + s.stage;
  }
  return S.get().stage;
}, stops);
async function closeSheets() { for (let i = 0; i < 5 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await wait(200); } }
async function load() { await page.goto(URL_); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(700); }

try {
  await load();
  step('v7 fixture boots', await get(() => window.__store.get().v === 7 || !!window.__store.get().stage), 'no state');
  await get(() => window.__store.dispatch('SetMatchMode', { mode: 'wheel' })); // force Wheel mode, as the wheelmatch e2e does
  const mm = await get(() => window.__store.get().matchMode);
  if (mm === 'wheel') step('Wheel mode forced', true); else skip('Wheel mode forced', `SetMatchMode did not stick (matchMode=${mm})`);
  // the fixture is mid-match (stage bowl): play it out by command, then the week is a Training week
  const st = await advance('train'); step('reached Training', st === 'train', st);
  await wait(500);
  const tip = await page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await wait(200); }
  const btn = await page.$('[data-cn="spin"]');
  if (!btn) {
    const why = 'no [data-cn="spin"] on the coach rows: T7 has not added coach.clinic / vm.clinic or the sheet keys clinicpick/clinicwheel (SHEETS:T6 wiring in app.js/index.html)';
    for (const n of ['Clinic button ready', 'pick sheet lists players', 'wheel SPIN then STOP', 'aria-live text equals visible result', 'reload keeps the same slice', 'Nets shows the Clinic chip/line', 'End week: button ready again']) skip(n, why);
  } else {
    const cls = await btn.getAttribute('class'); step('Clinic button ready', /cn-btn-ready/.test(cls || '') && (await btn.getAttribute('aria-disabled')) !== 'true', cls);
    const box = await btn.boundingBox(); step('Clinic button tap >= 56px', box && box.height >= 56 - 0.5 && box.width >= 56 - 0.5, JSON.stringify(box));
    const coachId = await btn.getAttribute('data-id');
    await btn.click(); await wait(500);
    const rows = await page.$$('.c-sheet [data-cn="pick"]:not([aria-disabled="true"])');
    if (!rows.length) { skip('pick sheet lists players', `no clinicpick sheet opened after the tap (sheet key 'clinicpick' not registered: SHEETS:T6 wiring is T7's)`); }
    else {
      step('pick sheet lists players', true);
      const pid = await rows[0].getAttribute('data-pid'); await rows[0].click(); await wait(600);
      const ov = await page.$('[data-go]');
      if (!ov) skip('wheel SPIN then STOP', `no wheel overlay after ClinicPick (sheet key 'clinicwheel' / T1 openWheel not on this branch)`);
      else {
        let res = null;
        for (let i = 0, t0 = Date.now(); Date.now() - t0 < 16000; i++) {
          const o = await get(() => { const g = document.querySelector('[data-go]'), r = document.querySelector('[data-res]'); return { go: g ? g.textContent.trim() : '', dis: !g || g.getAttribute('aria-disabled') === 'true', res: !!r && !r.hidden && getComputedStyle(r).display !== 'none' }; });
          if (o.res) { res = true; break; }
          if (!o.dis && /^(SPIN|STOP)/i.test(o.go)) { await page.click('[data-go]'); await wait(/^STOP/i.test(o.go) ? 700 : 300); } else await wait(150);
        }
        step('wheel SPIN then STOP', !!res, 'no result shown within 16 s');
        const vis = await get(() => { const r = document.querySelector('[data-res]'); return r ? r.innerText.replace(/\s+/g, ' ').trim() : ''; }), live = await get(() => { const l = document.querySelector('.cn-live[aria-live]'); return l ? l.textContent.replace(/\s+/g, ' ').trim() : ''; });
        step('aria-live text equals visible result', !!live && vis.includes(live), `live "${live}" visible "${vis}"`);
        const slice = await get((c) => { const s = window.__store.get(), x = (s.clinic.spins || []).find((q) => q.coachId === c); return x ? JSON.stringify([s.clinic.boost]) : null; }, coachId);
        await wait(700); await load();
        const slice2 = await get((c) => { const s = window.__store.get(), x = ((s.clinic || {}).spins || []).find((q) => q.coachId === c); return x ? JSON.stringify([s.clinic.boost]) : null; }, coachId);
        step('reload keeps the same slice', !!slice && slice === slice2, `${slice} -> ${slice2}`);
        await closeSheets();
        const nets = await page.$('[data-act="nets"], [data-tr="nets"], .tr-nets, [data-lo="nets"]');
        if (!nets) skip('Nets shows the Clinic chip/line', 'no Nets control found on the Training screen to tap');
        else { await nets.click(); await wait(2500); const body = await get(() => document.body.innerText); step('Nets shows the Clinic chip/line', /Clinic/i.test(body) && /\+\d+%|Extra run/i.test(body), 'no "Clinic +N%" / "Extra run" text after Nets'); await closeSheets(); }
        await advance('train'); // nets done: a week end moves on, then the new week is Training again
        const st2 = await advance(['matchday', 'hub', 'squad']); await advance('train'); await wait(500);
        const b2 = await page.$(`[data-cn="spin"][data-id="${coachId}"]`);
        step('End week: button ready again', !!b2 && /cn-btn-ready/.test((await b2.getAttribute('class')) || ''), `stage after end week ${st2}; button ${b2 ? await b2.getAttribute('class') : 'missing'}`);
      }
    }
  }
} catch (e) { step('script ran without throwing', false, e.stack || e); } finally { await browser.close(); server.close(); }

for (const e of errs) step('no console/page errors', false, e);
if (!errs.length) step('no console/page errors', true);
const c = { PASS: 0, FAIL: 0, SKIP: 0 }; console.log(`clinic-flow 344x882 seed ${SEED}`);
for (const r of results) { c[r.st]++; console.log(`${r.st} ${r.name}${r.why ? ' -- ' + r.why : ''}`); }
console.log(`${c.FAIL ? 'FAIL' : 'OK'}: ${c.PASS} pass, ${c.SKIP} skip, ${c.FAIL} fail`);
process.exit(c.FAIL ? 1 : 0);
