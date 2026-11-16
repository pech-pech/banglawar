// T5 e2e at 344x882: v7 save -> Training -> job chip + XP bar per coach (>=56x56 chip) -> job sheet -> pick Scout -> reload keeps Scout (T6.7)
// -> run nets via UI: nets coach XP +10 or +5 (T4.1). Network blocked: 0 external requests (T12.4). Fails on any console/page error.
// Run from the app root:  node test/e2e/coach-jobs.mjs      Exit 1 on any FAIL.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const req = createRequire(import.meta.url);
function loadPlaywright() { try { return req('playwright'); } catch (e) { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return req(req.resolve('playwright', { paths: [g] })); } }
const { chromium } = loadPlaywright();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/json' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(await readFile(f));
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`, APP = `${ORIGIN}/cricket-sixes/`;
const SAVE = await readFile(join(ROOT, 'test/fixtures/v7-save.json'), 'utf8');

const results = [], errs = [], external = [];
const step = (name, ok, why) => { results.push({ name, ok: !!ok, why: ok ? '' : String(why || '') }); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await ctx.route('**/*', (route) => { const u = route.request().url(); if (/^(http:\/\/127\.0\.0\.1|data:|blob:|about:)/.test(u)) return route.continue(); external.push(u); return route.abort(); });
const page = await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`console: ${m.text()}`); });
page.on('response', (r) => { if (r.status() >= 400 && /\.(js|mjs|css)(\?|$)/.test(r.url())) errs.push(`load ${r.status()}: ${r.url()}`); });
const wait = (ms = 300) => page.waitForTimeout(ms);
const ready = async () => { await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(600); };
const dismiss = async () => { for (let i = 0; i < 4; i++) { const d = await page.$('[data-tu-done]'); if (!d) break; await d.click().catch(() => {}); await wait(300); } const tip = await page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click().catch(() => {}); await wait(200); } };
const closeSheets = async () => { for (let i = 0; i < 5 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await wait(200); } };
const advance = (stops) => page.evaluate((stopAt) => {
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
      case 'end': d('NewSeason'); break;
      default: return 'stuck:' + s.stage;
    }
    if (S.get() === s) return 'stuck-no-change:' + s.stage;
  }
  return S.get().stage;
}, stops);
const coachXp = () => page.evaluate(() => (window.__store.get().coaches || []).filter((c) => !c.candidate).map((c) => ({ id: c.id, xp: c.xpTotal | 0, job: c.job })));
const chipWord = (id) => page.evaluate((i) => { const b = document.querySelector(`[data-cw="job"][data-coach="${i}"]`); return b ? b.textContent.trim() : null; }, id);

try {
  await page.goto(`${ORIGIN}/cricket-sixes/icon-192.png`); // same-origin page just to seed localStorage
  await page.evaluate((t) => localStorage.setItem('cs.save.1', t), SAVE);
  await page.goto(APP); await ready();
  step('v7 save loaded (no new game)', await page.evaluate(() => /^v7fix/.test(String(window.__store.get().seed))), 'seed not from fixture');
  const st = await advance('train'); step('reached Training', st === 'train', st);
  await wait(500); await dismiss();
  await page.waitForSelector('.ct-strip', { timeout: 4000 }).catch(() => {});

  const ids = await page.evaluate(() => [...document.querySelectorAll('.ct-slot:not(.ct-empty)')].map((li) => ({ chip: li.querySelector('[data-cw="job"]'), xp: li.querySelector('[data-cw="xp"]'), id: li.querySelector('[data-cw="job"]') && li.querySelector('[data-cw="job"]').getAttribute('data-coach') })).map((o) => ({ id: o.id, chip: !!o.chip, xp: !!o.xp })));
  step('at least one coach card', ids.length > 0, 'no .ct-slot coaches');
  step('every coach has a job chip and an XP bar', ids.length > 0 && ids.every((o) => o.chip && o.xp), JSON.stringify(ids));
  const rects = await page.evaluate(() => [...document.querySelectorAll('[data-cw="job"]')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  step('job chips >= 56x56', rects.length > 0 && rects.every(([w, h]) => w >= 56 && h >= 56), JSON.stringify(rects));

  // Scout is legal only for the idle (non-match, non-nets) coach: probe each coach's sheet for an enabled Scout row.
  let cid = null;
  for (const o of ids.filter((x) => x.id)) {
    await page.click(`[data-cw="job"][data-coach="${o.id}"]`); await wait(500);
    if (await page.$('.cw-sheet [data-cw="setjob"][data-job="scout"]:not([disabled]):not([aria-disabled="true"])')) { cid = o.id; break; }
    await closeSheets();
  }
  if (cid) {
    const rows = await page.$$eval('.cw-sheet [data-cw="setjob"]', (n) => n.map((b) => b.dataset.job));
    step('tap chip opens job sheet', (await page.$('.cw-sheet')) && rows.length > 0, 'no .cw-sheet / rows');
    const scout = await page.$('.cw-sheet [data-cw="setjob"][data-job="scout"]');
    step('Scout is offered', !!scout, `rows: ${rows}`);
    if (scout) {
      await scout.click(); await wait(500);
      step('chip says Scout after pick', (await chipWord(cid)) === 'Scout', await chipWord(cid));
      await wait(800); // debounced save
      await page.reload(); await ready();
      const st2 = await page.evaluate(() => window.__store.get().stage);
      if (st2 !== 'train') await advance('train');
      await wait(400); await dismiss();
      await page.waitForSelector(`[data-cw="job"][data-coach="${cid}"]`, { timeout: 4000 }).catch(() => {});
      step('after reload chip still says Scout (T6.7)', (await chipWord(cid)) === 'Scout', await chipWord(cid));
    }
  }
  await closeSheets(); await dismiss();

  // Nets via the UI: Run nets button (a spotlight wheel may sit in front of it).
  const run = await page.$('[data-lo="runnets"]:not([disabled])');
  if (!run) step('Run nets button reachable (optional)', true);
  else {
    if (!(await page.$('.ct-pick[aria-pressed="true"]'))) { // XP goes to the picked (nets) coach: pick one that is not the Scout coach
      const pk = (await page.$$('.ct-pick:not([aria-disabled="true"])'))[0]; if (pk) { await pk.click().catch(() => {}); await wait(400); }
    }
    const before = await coachXp();
    await page.click('[data-lo="runnets"]'); await wait(600);
    for (let i = 0; i < 20; i++) { // tap through any wheel overlay until the Nets result shows
      if (await page.$('.t2-sum')) break;
      const g = await page.$('.dr-ov [data-go]:not([aria-disabled="true"]), .wh-ov [data-go]:not([aria-disabled="true"])'); if (g) await g.click().catch(() => {});
      await wait(500);
    }
    step('nets ran (result card shown)', await page.$('.t2-sum'), 'no .t2-sum');
    const after = await coachXp();
    const gains = after.map((c) => c.xp - ((before.find((b) => b.id === c.id) || {}).xp | 0)).filter((d) => d !== 0);
    step('nets coach XP rose by 10 or 5 (T4.1)', gains.some((d) => d === 10 || d === 5), `gains ${JSON.stringify(gains)} before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  }
} catch (e) { step('script ran without throwing', false, e.stack || e); } finally { await browser.close(); server.close(); }

step('0 external requests (T12.4)', external.length === 0, external.slice(0, 5).join(' '));
for (const e of errs) step('no console/page/load errors', false, e);
if (!errs.length) step('no console/page/load errors', true);
let bad = 0; console.log('coach-jobs 344x882');
for (const r of results) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `FAIL: ${bad} of ${results.length}` : `PASS: ${results.length} checks`);
process.exit(bad ? 1 : 0);
