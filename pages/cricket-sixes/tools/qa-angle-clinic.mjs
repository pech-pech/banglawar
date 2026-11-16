// QA N2: 'Tick on: <slice>' readout vs the slice under the drawn landing tick, every animation frame during SPIN (Clinic, Spotlight, Course).
// Tick truth = opaque pixels of the tick canvas (.wh-tk) -> angle; slice truth = colour of the slice canvas (.wh-cv) under that angle, vs the readout chip background.
// Env: W, H, WHEELS=clinic,spotlight,course, MS=6000, E2E_SEED. Same server/fixture/advance as tools/qa-shots-clinic.mjs. Edits nothing in the app.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
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

const errs = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +(process.env.W || 344), height: +(process.env.H || 882) }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__clfx')) { localStorage.setItem('cs.save.1', fx); localStorage.setItem('__clfx', '1'); } } catch (e) { /* blocked */ } }, FIXTURE);
const page = await ctx.newPage(); page.setDefaultTimeout(6000);
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`console: ${m.text()}`); });
const wait = (ms = 300) => page.waitForTimeout(ms);
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
const tapSel = async (sel) => { const e = await page.$(sel); if (!e) return false; await e.click(); await wait(500); return true; };

async function openWheel(which) {
  await load(); await advance('train'); await wait(500);
  for (let i = 0; i < 3 && (await page.$('.tu-ov')); i++) { const bs = await page.$$('.tu-ov button'); if (bs.length) await bs[bs.length - 1].click(); await wait(300); await closeSheets(); }
  await tapSel('.tr-tip [data-tip="skip"]');
  if (which === 'clinic') { if (!(await tapSel('[data-cn="spin"]'))) return 'no [data-cn=spin]'; const rows = await page.$$('.c-sheet [data-cn="pick"]:not([aria-disabled="true"])'); if (!rows.length) return 'no clinic pick rows'; await rows[0].click(); await wait(800); }
  else if (which === 'spotlight') { if (!(await tapSel('[data-lo="spotpick"]'))) return 'no spotpick'; if (!(await tapSel('.c-sheet [data-sp]:not([data-sp=""])'))) return 'no spotlight player'; await wait(400); if (!(await tapSel('[data-lo="runnets"]:not([disabled])'))) return 'runnets disabled'; await wait(700); }
  else if (which === 'course') { if (!(await tapSel('.ct-strip [data-ct="course"]:not([aria-disabled="true"])'))) return 'no course'; await tapSel('.c-sheet [data-cf="yes"]'); await wait(700); }
  return (await page.$('.wh-ov [data-go]')) ? '' : 'no wheel overlay';
}

// in-page: one sample per animation frame. Tick angle = centroid of opaque pixels on the tick canvas; slice colour = slice canvas at 3 radii under that angle; compared with the readout chip background.
const sampler = (ms) => new Promise((done) => {
  const ov = document.querySelector('.wh-ov'), cv = ov.querySelector('canvas.wh-cv'), tk = ov.querySelector('canvas.wh-tk');
  const cx2 = cv.getContext('2d', { willReadFrequently: true }), tx = tk.getContext('2d', { willReadFrequently: true });
  const out = [], t0 = performance.now();
  const near = (a, b) => Math.abs(a[0] - b[0]) < 10 && Math.abs(a[1] - b[1]) < 10 && Math.abs(a[2] - b[2]) < 10;
  const f = () => {
    const t = performance.now() - t0, w = tk.width, chip = ov.querySelector('.wh-nowv'), rec = { t: Math.round(t), now: chip ? chip.textContent : null, tick: false };
    if (chip) {
      const m = /rgb\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(chip).backgroundColor); rec.chip = m ? [+m[1], +m[2], +m[3]] : null;
      const d = tx.getImageData(0, 0, w, w).data; let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 200) { sx += x - w / 2; sy += y - w / 2; n++; }
      if (n > 5 && rec.chip) {
        rec.tick = true; const ang = Math.atan2(sy, sx), R = w / 2 - 1; rec.ang = +ang.toFixed(3); rec.px = [];
        for (const rr of [R - 18, R - 26, R - 34, R - 42]) { const x = Math.round(w / 2 + Math.cos(ang) * rr), y = Math.round(w / 2 + Math.sin(ang) * rr), p = cx2.getImageData(x, y, 1, 1).data; rec.px.push([p[0], p[1], p[2]]); }
        const ok = rec.px.filter((p) => !near(p, [42, 34, 56]) && !(p[0] > 250 && p[1] > 250)); // drop outline / white pixels (tier marks, labels, borders)
        rec.valid = ok.length; rec.match = ok.length === 0 ? null : ok.some((p) => near(p, rec.chip));
      }
    }
    out.push(rec); if (t < ms) requestAnimationFrame(f); else done(out);
  };
  requestAnimationFrame(f);
});
const MS = +(process.env.MS || 6000), WHEELS = (process.env.WHEELS || 'clinic,spotlight,course').split(','), TAG = `${process.env.W || 344}x${process.env.H || 882}`;
try {
  for (const which of WHEELS) {
    const why = await openWheel(which); if (why) { console.log(`[${TAG}] ${which}: SKIP ${why}`); continue; }
    await page.click('.wh-ov [data-go]'); await wait(50);
    const out = await page.evaluate(sampler, MS), fr = out.filter((r) => r.tick), ev = fr.filter((r) => r.match !== null), bad = ev.filter((r) => !r.match);
    console.log(`[${TAG}] ${which}: frames=${out.length} withTick+readout=${fr.length} evaluable=${ev.length} mismatch=${bad.length} (${ev.length ? (100 * bad.length / ev.length).toFixed(1) : 0}%) distinctReadouts=${new Set(fr.map((r) => r.now)).size}`);
    for (const r of bad.slice(0, 5)) console.log(`   t=${r.t}ms readout="${r.now}" chip=${JSON.stringify(r.chip)} tickAng=${r.ang} sliceRGB@R-18/-26/-34/-42=${JSON.stringify(r.px)}`);
  }
} catch (e) { console.log('ERR', e.stack || e); } finally { await browser.close(); server.close(); }
console.log(errs.join('\n') || 'no console errors');
