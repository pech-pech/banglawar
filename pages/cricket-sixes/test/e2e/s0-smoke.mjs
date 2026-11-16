// S0 smoke e2e at 344x882: new game -> Training (coaches sheet, Spotlight) -> match day (Hype/Toss/Pep) -> match to the end -> next week
// -> reload mid-season resumes -> Settings "Copy report (full)" non-empty. Fails on any console error, pageerror, failed/4xx js/css load.
// Run from the app root:  node test/e2e/s0-smoke.mjs      Env: E2E_SEED=x. Exit 1 on any FAIL.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), SEED = process.env.E2E_SEED || 's0-smoke';
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
const ORIGIN = `http://127.0.0.1:${server.address().port}`, URL_ = `${ORIGIN}/cricket-sixes/?seed=${encodeURIComponent(SEED)}`;

const results = [], errs = [];
const step = (name, ok, why) => { results.push({ name, ok: !!ok, why: ok ? '' : String(why || '') }); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 1, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message} ${(e.stack || '').split('\n')[1] || ''}`.trim()));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`console: ${m.text()} @ ${m.location().url}:${m.location().lineNumber}`); });
page.on('requestfailed', (r) => errs.push(`request failed: ${r.url()} ${r.failure() && r.failure().errorText}`));
page.on('response', (r) => { if (r.status() >= 400 && /\.(js|mjs|css)(\?|$)/.test(r.url())) errs.push(`load ${r.status()}: ${r.url()}`); });
const wait = (ms = 300) => page.waitForTimeout(ms);
const stage = () => page.evaluate(() => (window.__store && window.__store.get() ? window.__store.get().stage : null));
const text = (sel) => page.evaluate((q) => { const e = document.querySelector(q); return e ? e.innerText : ''; }, sel);
async function boot() {
  await page.goto(URL_); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(600);
  const pick = await page.$('[data-cl-pick]'); if (pick) { await pick.click(); await wait(200); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) { await t.click(); await wait(400); } }
}
const advance = (stops) => page.evaluate((stopAt) => { // drive stages by command until a stop stage (same driver as wa1-flow)
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
async function spin(ov) { // tap SPIN/STOP until a result shows, then COLLECT until the overlay closes
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    const st = await page.evaluate((q) => { const o = document.querySelector(q); if (!o) return { gone: 1 }; const go = o.querySelector('[data-go]'), r = o.querySelector('[data-res]');
      return { go: go ? go.textContent.trim() : '', dis: !go || go.getAttribute('aria-disabled') === 'true' || go.disabled, res: !!r && !r.hidden && getComputedStyle(r).display !== 'none' }; }, ov);
    if (st.gone) return false;
    if (st.res && /COLLECT|OK|DONE|NEXT/i.test(st.go)) break;
    if (!st.dis && /^(SPIN|STOP|GO|FLIP|TAP)/i.test(st.go)) { await page.click(`${ov} [data-go]`); await wait(st.go === 'STOP' ? 600 : 300); } else await wait(150);
  }
  for (let i = 0; i < 6 && (await page.$(ov)); i++) { const g = await page.$(`${ov} [data-go]:not([aria-disabled="true"])`); if (g) await g.click().catch(() => {}); await wait(500); }
  return !(await page.$(ov));
}

try {
  await boot();
  step('app boots (store present)', await stage(), 'no stage');
  await page.evaluate(() => window.__store.dispatch('SetMatchMode', { mode: 'classic' })); // Classic is the quickest to the end via BowlOver
  let st = await advance('train'); step('reached Training', st === 'train', st);
  if (st === 'train') {
    const tip = await page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await wait(200); }
    await page.waitForSelector('.ct-strip [data-ct="scout"]', { timeout: 4000 }).catch(() => {}); const scout = await page.$('.ct-strip [data-ct="scout"]'); step('coach strip + Scout link', !!scout, 'no [data-ct=scout]');
    if (scout) { await page.click('.ct-strip [data-ct="scout"]'); await wait(600); const sheet = await page.$('.c-sheet'), reel = await page.$('.dr-ov, .wh-ov'); step('coaches sheet opens', sheet || reel, 'nothing opened'); if (reel) await spin('.dr-ov, .wh-ov'); await closeSheets(); }
    const sp = await page.$('[data-lo="spotpick"]:not([aria-disabled="true"])');
    if (sp) { await page.click('[data-lo="spotpick"]'); await wait(400); const row = await page.$('.c-sheet [data-sp]:not([data-sp=""])'); if (row) { await page.click('.c-sheet [data-sp]:not([data-sp=""])'); await wait(400); } step('Spotlight picked', await page.evaluate(() => !!(window.__store.get().training || {}).spotlight_id), 'no spotlight'); await closeSheets(); } else step('Spotlight row available (optional)', true);
  }
  st = await advance('matchday'); step('reached match day', st === 'matchday', st);
  if (st === 'matchday') {
    await wait(500);
    for (const w of ['hype', 'toss', 'pep']) { const b = await page.$(`[data-md="${w}"]`); if (!b) { step(`${w} button`, false, 'missing'); continue; } await b.click(); await wait(500); step(`${w} spin resolves + collects`, (await page.$('.dr-ov')) && (await spin('.dr-ov')), 'overlay missing or stuck'); }
  }
  st = await advance('week'); step('match played to the end (stage week)', st === 'week', st);
  const w0 = await page.evaluate(() => window.__store.get().week ?? null);
  st = await advance(['train', 'hub', 'matchday', 'squad']); const w1 = await page.evaluate(() => window.__store.get().week ?? null);
  step('next week reached', st !== 'week' && (w0 == null || w1 !== w0 || st !== 'week'), `stage ${st} week ${w0}->${w1}`);
  await wait(500); // the save is debounced; give it a beat, then reload mid-season
  const before = await page.evaluate(() => { const s = window.__store.get(); return { stage: s.stage, week: s.week ?? null }; });
  await page.reload(); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(800);
  const after = await page.evaluate(() => { const s = window.__store.get(); return { stage: s.stage, week: s.week ?? null }; });
  step('reload resumes the season (same week, no new game)', after.week === before.week && after.stage !== 'freepick' && !!(await page.evaluate(() => localStorage.getItem('cs.save.1'))), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  await closeSheets(); // Settings -> Copy report (full)
  const gear = await page.$('.st-gear'); step('Settings gear present', !!gear, 'no .st-gear');
  if (gear) {
    await gear.click(); await wait(500); const full = await page.$('[data-st="full"]'); step('Copy report (full) button', !!full, 'missing');
    if (full) { await full.click(); await wait(600);
      const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')), fb = await page.$eval('.st-fallback textarea', (t) => t.value).catch(() => '');
      step('Copy report text non-empty', (clip || fb).trim().length > 20, `clip ${clip.length} fallback ${fb.length}; status "${(await text('.st-status')).slice(0, 60)}"`); }
  }
} catch (e) { step('script ran without throwing', false, e.stack || e); } finally { await browser.close(); server.close(); }

for (const e of errs) step('no console/page/load errors', false, e);
if (!errs.length) step('no console/page/load errors', true);
let bad = 0; console.log(`s0-smoke 344x882 seed ${SEED}`);
for (const r of results) { if (!r.ok) bad++; console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' -- ' + r.why}`); }
console.log(bad ? `FAIL: ${bad} of ${results.length}` : `PASS: ${results.length} checks`);
process.exit(bad ? 1 : 0);
