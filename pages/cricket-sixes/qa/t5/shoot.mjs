import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
const ROOT = '/home/user/bw/pages/cricket-sixes/', OUT = ROOT + 'qa/t5/';
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch (e) { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); pw = req(req.resolve('playwright', { paths: [g] })); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/json' };
const server = http.createServer(async (rq, rs) => { try { let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html'; const f = normalize(join(ROOT, p)); rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(await readFile(f)); } catch (e) { rs.writeHead(404); rs.end('nf'); } });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const URL_ = `http://127.0.0.1:${server.address().port}/cricket-sixes/?seed=t5`;
const fx = JSON.parse(await readFile(ROOT + 'test/fixtures/v7-save.json', 'utf8')).data;
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
const wait = (ms = 400) => page.waitForTimeout(ms);
const measure = [], notes = [];
async function load(mut) {
  const data = JSON.parse(JSON.stringify(fx)); data.stage = 'train'; mut && mut(data);
  await page.goto(URL_); await page.waitForFunction(() => window.__store, null, { timeout: 15000 });
  await page.evaluate(async (d) => { const m = await import('/cricket-sixes/js/core/save-migrate.js'); localStorage.setItem('cs.save.1', JSON.stringify(m.wrap(d))); }, data);
  await page.goto(URL_); await page.waitForFunction(() => window.__store && window.__store.get(), null, { timeout: 15000 }); await wait(800);
  await dismiss();
}
async function dismiss() {
  for (let i = 0; i < 5; i++) {
    const tu = await page.$('.tu-ov [data-tu-done]'); if (tu) { await tu.click(); await wait(400); continue; }
    const tip = await page.$('.tr-tip [data-tip="skip"]'); if (tip) { await tip.click(); await wait(300); continue; }
    break;
  }
}
async function shot(name) {
  await wait(300); await page.screenshot({ path: OUT + name + '.png' });
  const m = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-cw]')].map((e) => { const r = e.getBoundingClientRect(); let min = 99; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n; const own = []; while ((n = w.nextNode())) if (n.nodeValue.trim()) own.push(parseFloat(getComputedStyle(n.parentElement).fontSize)); if (own.length) min = Math.min(...own);
      return { cw: e.getAttribute('data-cw'), cls: typeof e.className === 'string' ? e.className : '', w: +r.width.toFixed(1), h: +r.height.toFixed(1), minFont: min === 99 ? null : min, text: e.textContent.trim().slice(0, 24) }; });
    const de = document.documentElement; return { els, overflowX: de.scrollWidth > de.clientWidth, scrollW: de.scrollWidth, clientW: de.clientWidth };
  });
  measure.push({ shot: name, ...m }); }
const dispatch = (c, p) => page.evaluate(([c, p]) => window.__store.dispatch(c, p), [c, p]);
const mk = (d, n) => { while (d.coaches.length < n) { const b = JSON.parse(JSON.stringify(d.coaches[0])); b.id = 'x' + d.coaches.length; b.name = 'Okonkwo-Bramley'; d.coaches.push(b); } d.coaches.length = n; };
const setC = (d, i, o) => Object.assign(d.coaches[i], o);

await load((d) => { mk(d, 3); setC(d, 0, { xp: 20, job: 'nets' }); setC(d, 1, { xp: 40, step: 10, job: 'study' }); setC(d, 2, { xp: 5, step: 2, job: 'match' }); });
notes.push('stage after load: ' + await page.evaluate(() => window.__store.get().stage));
await shot('01-strip-3coach');
await page.click('[data-cw="job"] >> nth=0').catch((e) => notes.push('chip click fail ' + e.message.slice(0, 80))); await wait(600);
await shot('02-job-picker-open');
const scout = await page.$('[data-cw="setjob"][data-job="scout"]');
if (scout) { await scout.click(); await wait(500); } else notes.push('scout row not tappable');
await shot('03-after-scout-strip');
await load((d) => { mk(d, 2); setC(d, 0, { xp: 30, job: 'study' }); setC(d, 1, { xp: 8, job: 'scout' }); }); await shot('04-strip-2coach');
await load((d) => { mk(d, 1); setC(d, 0, { xp: 30, job: 'study' }); }); await shot('05-strip-1coach');
await load((d) => { mk(d, 3); setC(d, 1, { xp: 30, step: 4 }); const id = d.coaches[0].id; d.training = d.training || {}; d.training.coach_id = id; setC(d, 0, { xp: 20, job: 'nets' }); }); await shot('05b-nets-chip');
await load((d) => { mk(d, 0); }); await shot('06-strip-0coach');
await load((d) => { mk(d, 2); setC(d, 0, { away: 1, xp: 10, job: 'study' }); }); await shot('07-away-coach');
await load((d) => { mk(d, 2); setC(d, 0, { step: 3, xp: 0, job: 'study' }); });
const need = await page.evaluate(async () => { const m = await import('/cricket-sixes/js/data/coach-weekly.js'); return m.XP_PER_STEP[2]; });
await load((d) => { mk(d, 2); setC(d, 0, { step: 3, xp: need - 3, job: 'study' }); setC(d, 1, { job: 'scout' }); }); await shot('08-xp-near-full');
const before = await page.evaluate(() => window.__store.get().coaches.map((c) => [c.step, c.xp, c.stepUpPending]));
await dispatch('EndWeek', {}); await wait(800);
const after = await page.evaluate(() => ({ stage: window.__store.get().stage, c: window.__store.get().coaches.map((c) => [c.step, c.xp, c.stepUpPending]) }));
notes.push('payout via EndWeek: before ' + JSON.stringify(before) + ' after ' + JSON.stringify(after));
await shot('09-after-payout');
const auto = await page.$('.cw-stepup');
notes.push('step-up card auto-shown after payout: ' + !!auto);
if (!auto) {
  await page.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-act', 'sheet:stepup'); b.id = 'qa-su'; b.style.cssText = 'position:fixed;top:0;left:0;width:10px;height:10px;opacity:0'; (document.getElementById('app') || document.body).appendChild(b); }); // bindActs listens on #app
  await page.click('#qa-su', { force: true }).catch(() => {}); await wait(600);
  notes.push('NOTE: step-up card is registered as sheet "stepup" but nothing opens it automatically (main.js installs the watcher only if mount() returns {openByName}; mount() returns dispatch); shot 10 opened it by a synthetic data-act="sheet:stepup" click. Card present: ' + !!(await page.$('.cw-stepup')));
}
await shot('10-stepup-card');
// 11: fold check at 475x638 dsf 2, 3-coach strip, no scrolling
await page.setViewportSize({ width: 475, height: 638 });
await load((d) => { mk(d, 3); setC(d, 0, { xp: 20, job: 'nets' }); setC(d, 1, { xp: 40, step: 10, job: 'study' }); setC(d, 2, { xp: 5, step: 2, job: 'match' }); });
await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
const fold = await page.evaluate(() => {
  const vh = window.innerHeight, vw = window.innerWidth, se = document.scrollingElement;
  const strip = document.querySelector('.ct-strip'), run = document.querySelector('[data-lo="runnets"]');
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1) }; };
  // also check inner scroll containers: is the run button clipped by any scrollable ancestor?
  let clipped = false; if (run) { const rr = run.getBoundingClientRect(); for (let p = run.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowY)) { const pr = p.getBoundingClientRect(); if (rr.top < pr.top - 0.5 || rr.bottom > pr.bottom + 0.5) clipped = true; } } }
  const rb = box(run);
  return { viewport: vw + 'x' + vh, scrollY: window.scrollY, pageScrollH: se.scrollHeight, strip: box(strip), stripHeight: strip ? box(strip).h : null, runNets: rb,
    runNetsFullyVisibleNoScroll: !!rb && rb.top >= 0 && rb.bottom <= vh && rb.left >= 0 && rb.right <= vw && !clipped, runNetsClippedByScroller: clipped,
    coachSlots: document.querySelectorAll('.ct-strip .ct-slot:not(.ct-empty)').length };
});
notes.push('fold 475x638: ' + JSON.stringify(fold));
await shot('11-fold-3coach');
notes.push(...errs.map((e) => 'ERR ' + e));
await writeFile(OUT + 'measure.json', JSON.stringify({ viewport: '344x882@2x (shot 11: 475x638@2x)', fold475x638: fold, notes, shots: measure }, null, 1));
const bad = []; for (const s of measure) for (const e of s.els) { if (e.h < 56 || e.w < 56) bad.push(`${s.shot} ${e.cw} ${e.cls} ${e.w}x${e.h}`); if (e.minFont != null && e.minFont < 14) bad.push(`${s.shot} ${e.cw} font ${e.minFont}`); }
console.log(notes.join('\n')); console.log([...new Set(bad)].join('\n')); console.log('overflowX', measure.filter((m) => m.overflowX).map((m) => m.shot));
await browser.close(); server.close();
