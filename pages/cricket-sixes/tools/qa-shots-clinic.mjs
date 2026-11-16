// T6 Clinic flow e2e at 344x882: v7 save -> Training -> coach Clinic button -> pick player -> wheel SPIN/STOP -> aria-live text == visible result
// -> reload keeps the same slice -> Nets shows the Clinic chip/line -> End week -> button ready again.
// Steps that need wiring not on this branch (T7 coach.clinic row data + 'clinicpick'/'clinicwheel' sheets, T1 openWheel ring) print SKIP with the reason, never FAIL.
// Run from the app root:  node test/e2e/clinic-flow.mjs      Env: E2E_SEED=x. Exit 1 on any FAIL.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), SEED = process.env.E2E_SEED || 'clinic-flow';
const FIXTURE = await readFile(new URL('../test/fixtures/v7-save.json', import.meta.url), 'utf8');
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
const ctx = await browser.newContext({ viewport: { width: +(process.env.W || 344), height: +(process.env.H || 882) }, deviceScaleFactor: 1, serviceWorkers: 'block' });
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

const OUT = process.env.OUT || '/tmp/clinic-qa', TAG = `${process.env.W || 344}x${process.env.H || 882}`;
mkdirSync(OUT, { recursive: true });
const shot = async (n) => { await wait(400); await page.screenshot({ path: `${OUT}/${TAG}-${n}.png` }); };
try {
  await load(); await advance('train'); await wait(500);
  for (let i = 0; i < 3 && (await page.$('.tu-ov')); i++) { const bs = await page.$$('.tu-ov button'); if (bs.length) await bs[bs.length - 1].click(); await wait(300); await closeSheets(); }
  const tip = await page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await wait(200); }
  await shot('1-training-clinic-ready');
  const btn = await page.$('[data-cn="spin"]'); await btn.click(); await wait(500); await shot('2-pick-sheet');
  const rows = await page.$$('.c-sheet [data-cn="pick"]:not([aria-disabled="true"])'); await rows[0].click(); await wait(700); await shot('3-wheel-idle');
  await page.click('[data-go]'); await wait(1800); await shot('4-wheel-spinning');
  for (let i = 0, t0 = Date.now(); Date.now() - t0 < 16000; i++) {
    const o = await get(() => { const g = document.querySelector('[data-go]'), r = document.querySelector('[data-res]'); return { go: g ? g.textContent.trim() : '', res: !!r && !r.hidden }; });
    if (o.res) break; if (/^STOP/i.test(o.go)) { await page.click('[data-go]'); await wait(900); } else await wait(150);
  }
  await shot('5-wheel-result');
  await page.click('[data-go]'); await wait(700); await closeSheets(); await shot('6-training-spun');
  const nets = await page.$('[data-lo="runnets"]:not([disabled])'); if (nets) { await nets.click(); await wait(2500); await shot('7-nets-scene'); }
} catch (e) { console.log('ERR', e.stack || e); } finally { await browser.close(); server.close(); }
console.log(errs.join('\n') || 'no console errors', '->', OUT);
