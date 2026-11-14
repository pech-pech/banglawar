// wa1 visual QA (vqa2): Training tab coach strip, course / scout flows, coaches sheet, hub, Nets result, Workshop.
// Run: cd pages/cricket-sixes && node tools/wa1-shots-train.mjs [outDir]   (serves pages/ with python3 -m http.server)
// Viewport 475x638 (Fold cover), deviceScaleFactor 1. Saves are injected into localStorage (cs.save.1) like test/e2e/p11-flow.mjs.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = process.argv[2] || '/mnt/project-files/games-design/cricket-sixes/build/wa1/shots/';
const PFX = process.env.PFX || 'vqa2-';
mkdirSync(OUT, { recursive: true });
const req = createRequire(import.meta.url);
function loadPlaywright() { try { return req('playwright'); } catch (e) { /* global */ } const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return req(req.resolve('playwright', { paths: [g] })); }
const { chromium } = loadPlaywright();
const FIXTURE = readFileSync(join(ROOT, 'test/fixtures/v4-save-10.json'), 'utf8').trim();
const PORT = 8000 + Math.floor(Math.random() * 900);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: join(ROOT, '..'), stdio: 'ignore' });
await new Promise((ok) => setTimeout(ok, 900));
const URL0 = `http://127.0.0.1:${PORT}/cricket-sixes/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 475, height: 638 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await ctx.addInitScript((fx) => { try { if (!localStorage.getItem('__vqa2')) { localStorage.setItem('cs.save.1', fx); localStorage.setItem('__vqa2', '1'); } } catch (e) { /* blocked */ } }, FIXTURE);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const settle = (ms = 300) => page.waitForTimeout(ms);
const stage = () => page.evaluate(() => (window.__store ? window.__store.get().stage : null));
const shot = async (name) => { await page.screenshot({ path: `${OUT}${PFX}${name}.png` }); console.log('shot', name); };
const clickCta = async () => { const b = (await page.$('.c-btn--cta:not([disabled])')) || (await page.$('.m0-ctabar button:not([disabled]):not(.hb-edit), .ctabar button:not([disabled])')); if (!b) return false; await b.click(); await settle(); return true; };
const closeAll = async () => { for (let i = 0; i < 5 && (await page.$('.c-sheet, .wh-ov, .wk-ov, .tu-ov')); i++) { await page.keyboard.press('Escape'); await settle(200); } };
// Small in-page audit: tap targets < 56 px and tiny text inside a scope; plus items below the fold.
const audit = (sel) => page.evaluate((q) => {
  const scope = (q && document.querySelector(q)) || document.body, vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const lab = (e) => (e.getAttribute('aria-label') || e.innerText || e.className).toString().replace(/\s+/g, ' ').trim().slice(0, 36);
  const small = [], below = [];
  for (const e of scope.querySelectorAll('button, a[href], [role="button"]')) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.height < 55.5 || r.width < 55.5) small.push(`${lab(e)} ${Math.round(r.width)}x${Math.round(r.height)} @y${Math.round(r.top)}`); if (r.top > innerHeight) below.push(`${lab(e)} @y${Math.round(r.top)}`); }
  return { hScroll: document.documentElement.scrollWidth > innerWidth + 1, small: [...new Set(small)].slice(0, 14), below: below.slice(0, 10) };
}, sel || null);
const report = {};
const note = async (name, sel) => { report[name] = await audit(sel); };

// Rewrite the live save: f(state) mutates; then reload.
async function patchSave(f) {
  await page.evaluate(async (src) => {
    const m = await import('./js/core/save-migrate.js');
    const env = JSON.parse(localStorage.getItem('cs.save.1')); const d = env.data; (0, eval)('(' + src + ')')(d);
    localStorage.setItem('cs.save.1', JSON.stringify(m.wrap(d)));
  }, f.toString());
  await page.reload(); await settle(1000);
}

try {
  await page.goto(URL0); await settle(1000);
  // free facility card etc: take it if shown
  // ---- play one match to reach the training week (same drive as p11-flow) ----
  let fpTried = false;
  for (let i = 0; i < 160; i++) {
    const st = await stage(); if (st === 'train') break;
    const fp = fpTried ? null : await page.$('[data-act="sheet:freepick"]'); if (st === 'hub' && fp) { fpTried = true; await fp.click(); await settle(400); const t = await page.$('.c-sheet .c-btn--primary:not([disabled])'); if (t) { await t.click(); await settle(400); } await closeAll(); continue; }
    if (await page.$('.dr-ov, .wh-ov')) { const g = await page.$('.dr-ov [data-go]:not([aria-disabled="true"]), .wh-ov [data-go]:not([aria-disabled="true"])'); if (g) await g.click(); else await page.keyboard.press('Escape'); await settle(900); continue; }
    if (st === 'done') { const star = await page.$('[data-pay-stars]'); if (star) { await star.click(); await settle(150); } if (!(await clickCta())) break; continue; }
    if (st === 'hub' || st === 'semi' || st === 'final' || st === 'week') { if (!(await clickCta())) break; }
    else if (st === 'matchday') { for (const w of ['hype', 'toss', 'pep']) { const b = await page.$(`[data-md="${w}"]`); if (b) { await b.click(); await settle(400); for (let k = 0; k < 12 && (await page.$('.dr-ov')); k++) { const g = await page.$('.dr-ov [data-go]:not([aria-disabled="true"])'); if (g) await g.click(); await settle(900); } } } const go = await page.$('[data-act="MatchdayGo"]:not([disabled])'); if (!go) break; await go.click(); await settle(400); }
    else if (st === 'squad') { for (let k = 0; k < 6; k++) { const b = await page.$('.sq-row--bench'); if (!b) break; await b.click(); await settle(80); } const c = await page.$('[data-confirm]:not([disabled])'); if (!c) break; await c.click(); await settle(); }
    else if (st === 'plan') { let go = await page.$('[data-start]:not([disabled])'); if (!go) { const pat = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3]; for (let k = 0; k < 10; k++) { await (await page.$(`[data-slot="${k}"]`)).click(); await (await page.$(`[data-bowler="${pat[k]}"]`)).click(); } go = await page.$('[data-start]:not([disabled])'); } if (!go) break; await go.click(); await settle(400); }
    else if (st === 'bowl' || st === 'break' || st === 'chase') { if (!(await clickCta())) { const r = await page.$('.sb-row:not([disabled]):not(.is-disabled)'); if (r) { await r.click(); await settle(100); } await clickCta(); } await settle(200); await page.keyboard.press('Escape'); await settle(120); }
    else { console.log('unknown stage', st); break; }
  }
  console.log('stage', await stage());
  const tip = await page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await settle(200); }

  // Base: 2 coaches (one fresh, one strong), Coins, wheel tier for Workshop, scout open (as the save allows).
  await patchSave((d) => {
    const c0 = { id: 'qa1', name: 'Rahman', step: 9, strong: ['bat'], away: 0, courseSeason: null };
    const c1 = { id: 'qa2', name: 'Chowdhury-Hossain', step: 15, strong: ['bowl', 'bat'], away: 0, courseSeason: null };
    d.coaches = [c0, c1]; if (d.econ) d.econ.coins = 900;
    if (d.training && d.training.plan) d.training.plan.coachId = null;
    d.wheelMeta = Object.assign({ tally: 0, spokes: 0, spent: 0, owned: {}, tokens: {} }, d.wheelMeta || {}, { tally: 120, spokes: 40 });
    d.wheelMeta.tokens = { respin: 1, nudge: 1, two: 0, wild: 0, lift: 1 };
  });
  const tip2 = await page.$('.tr-tip [data-tip="skip"]'); if (tip2) { await tip2.click(); await settle(200); }
  await shot('01-strip-normal'); await note('01-strip-normal');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await settle(200); await shot('01b-train-scrolled'); await page.evaluate(() => window.scrollTo(0, 0));

  // picked
  const pick = await page.$('.ct-pick[data-id="qa2"]'); if (pick) { await pick.click(); await settle(400); }
  await shot('02-strip-picked'); await note('02-strip-picked');
  // picked but not strong in the focus (Bowl focus vs Rahman bat)
  const p1 = await page.$('.ct-pick[data-id="qa1"]'); if (p1) { await p1.click(); await settle(300); }
  const bowl = await page.$('[data-act="SetTrainPlan"][data-arg*="bowl"]'); if (bowl) { await bowl.click(); await settle(300); }
  await page.evaluate(() => window.scrollTo(0, 0)); await shot('02b-strip-picked-nohelp');

  // Send on course (from strip) -> coaches sheet course flow
  const course = await page.$('.ct-course[data-id="qa1"]'); if (course) { await course.click(); await settle(700); }
  await shot('03-course-sheet'); await note('03-course-sheet', '.c-sheet');
  // try confirm inside sheet (primary button) -> course wheel
  const cbtn = await page.$('.c-sheet .c-btn--primary:not([disabled]):not([aria-disabled="true"])');
  if (cbtn) { await cbtn.click(); await settle(900); await shot('03b-course-after-confirm'); await note('03b-course-after-confirm');
    for (let k = 0; k < 8 && (await page.$('.wh-ov')); k++) { const g = await page.$('.wh-ov [data-go]:not([aria-disabled="true"]), .wh-ov .c-btn--primary'); if (g) { await g.click(); await settle(1200); if (k === 0) await shot('03c-course-wheel'); } else break; }
    await shot('03d-course-result'); }
  await closeAll(); await settle(300);

  // Away coach (after course or forced)
  await patchSave((d) => { d.coaches[0].away = 1; if (d.training && d.training.plan) d.training.plan.coachId = 'qa2'; });
  await shot('04-strip-away'); await note('04-strip-away');

  // Empty slots: one coach
  await patchSave((d) => { d.coaches = [d.coaches[1]]; d.coaches[0].away = 0; });
  await shot('05-strip-empty'); await note('05-strip-empty');
  await patchSave((d) => { d.coaches = []; if (d.training && d.training.plan) d.training.plan.coachId = null; });
  await shot('05b-strip-nocoach');
  await patchSave((d) => { d.coaches = [{ id: 'qa1', name: 'Rahman', step: 9, strong: ['bat'], away: 0, courseSeason: null }, { id: 'qa2', name: 'Chowdhury-Hossain', step: 15, strong: ['bowl', 'bat'], away: 0, courseSeason: null }, { id: 'qa3', name: 'Mortaza', step: 21, strong: ['bowl'], away: 0, courseSeason: null }]; });
  await shot('05c-strip-full3'); await note('05c-strip-full3');

  // Scout list from strip
  const sc = await page.$('.ct-scout'); if (sc) { await sc.click(); await settle(700); }
  await shot('06-scout-list'); await note('06-scout-list', '.c-sheet');
  await closeAll();
  // Coaches sheet (old entry: "Coaches" button)
  const all = await page.$('.ct-all'); if (all) { await all.click(); await settle(700); }
  await shot('07-coaches-sheet'); await note('07-coaches-sheet', '.c-sheet');
  await page.evaluate(() => { const s = document.querySelector('.c-sheet .c-sheet__body, .c-sheet'); if (s) s.scrollTop = 9999; }); await settle(200); await shot('07b-coaches-sheet-scrolled');
  await closeAll();

  // Nets result card
  const run = await page.$('[data-lo="runnets"]:not([disabled])');
  if (run) { await run.click(); await settle(1200);
    for (let k = 0; k < 10 && (await page.$('.wh-ov')); k++) { const g = await page.$('.wh-ov [data-go]:not([aria-disabled="true"]), .wh-ov .c-btn--primary'); if (g) { await g.click(); await settle(1200); } else break; }
    for (let k = 0; k < 6 && (await page.$('.ns-scene')); k++) { await page.keyboard.press('Escape'); await page.mouse.click(237, 300); await settle(900); }
    await settle(600); await shot('08-nets-result'); await note('08-nets-result');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await settle(200); await shot('08b-nets-result-scrolled');
  }
  // Hub: finish the week, back to hub, then Workshop
  for (let k = 0; k < 5 && (await stage()) !== 'hub'; k++) { if (!(await clickCta())) break; await settle(400); await closeAll(); }
  await page.evaluate(() => window.scrollTo(0, 0)); await shot('09-hub'); await note('09-hub');
  await page.evaluate(() => window.scrollTo(0, 600)); await settle(200); await shot('09b-hub-scrolled'); await page.evaluate(() => window.scrollTo(0, 0));
  const wk = await page.$('[data-act="sheet:workshop"]');
  if (wk) { await wk.click(); await settle(900); await shot('10-workshop'); await note('10-workshop', '.wk-ov');
    for (let y = 1; y <= 4; y++) { await page.evaluate((yy) => { const o = document.querySelector('.wk-ov'); const sc = o && ([o, ...o.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY))); if (sc) sc.scrollTop = yy * 520; }, y); await settle(250); await shot('10' + 'abcd'[y - 1] + '-workshop-scroll' + y); }
    const words = await page.evaluate(() => { const o = document.querySelector('.wk-ov'); return o ? o.innerText : ''; });
    report.workshopText = words.slice(0, 6000);
    // tap the first buyable/owned node to see its detail
    const node = await page.$('.wk-ov [data-node], .wk-ov .wk-node'); if (node) { await node.click(); await settle(500); await shot('10e-workshop-node'); }
  } else console.log('no workshop row on hub');
} catch (e) { console.log('ERR', e.message); }
console.log(JSON.stringify(report, null, 1));
console.log('errors', errs.slice(0, 10));
await browser.close(); srv.kill();
