// M0 end-to-end at 344x780 ONLY (the closed Fold). Run from the app root:  node test/e2e/m0-344x780.mjs
// Env: E2E_FULL=1 plays the whole season to the end screen; E2E_SHOTS=dir moves the screenshots; E2E_SOFT=1 never exits 1.
// Journey (default): coach -> hub (standings sheet, save sheet) -> squad -> plan -> one match (over panel tapped through)
//   -> result -> training week (drills) -> reload mid-week -> end week -> week summary -> hub.   ?seed=e2e-1, fresh context each run.
// Playwright is preinstalled (global); no install. If the app still boots into the step-0 match, the run SKIPS with exit 0.
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.env.E2E_SHOTS || '/mnt/project-files/games-design/cricket-sixes/build/m0/shots/';
const FULL = process.env.E2E_FULL === '1';
const VIEW = { width: 344, height: 780 };
const SEED = 'e2e-1';

const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* fall through to the global install */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();

// ---- tiny static server (the app has no build step) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html'; // pages are served under /cricket-sixes/ (app.css uses that absolute path)
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    const buf = await readFile(f); rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(buf);
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
let shotsOk = true;
try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { shotsOk = false; console.log(`screenshots not saved (${e.message})`); }

// ---- in-page audit: scroll, CTA, tap targets, text size ----
function auditInPage() {
  const vw = innerWidth, vh = innerHeight;
  const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[aria-hidden="true"]'); };
  const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40);
  const out = { hScroll: document.documentElement.scrollWidth > vw + 1, vScroll: document.documentElement.scrollHeight > vh + 1, cta: null, small: [], tiny: [] };
  const sheet = document.querySelector('.c-sheet');
  const scope = sheet || document;
  const ctas = [...document.querySelectorAll('.m0-ctabar button, .ctabar button, .cta button, .c-btn--cta')].filter(vis);
  if (!sheet) { // main screen: a CTA must be fully inside the viewport with no scrolling
    const c = ctas[0];
    out.cta = c ? { text: label(c), visible: c.getBoundingClientRect().top >= 0 && c.getBoundingClientRect().bottom <= vh, disabled: !!c.disabled } : { none: true };
  }
  const taps = [...scope.querySelectorAll('button, a[href], [role="button"], [role="checkbox"], input, select, textarea, [data-act]')].filter(vis);
  for (const e of taps) { const r = e.getBoundingClientRect(); if (r.height < 55.5 || r.width < 55.5) out.small.push(`${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`); }
  const walker = document.createTreeWalker(scope === document ? document.body : scope, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue.trim(); const e = n.parentElement;
    if (!t || !e || !vis(e) || e.closest('script,style') || seen.has(e)) continue;
    seen.add(e);
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 13.5) out.tiny.push(`${t.slice(0, 24)} ${fs}px`);
  }
  // no visible text box may end below the top of the pinned CTA bar (text under the bar is unreadable). Text inside a scroll area is skipped: it may scroll under the bar.
  out.underCta = [];
  const bar = !sheet && [...document.querySelectorAll('.m0-ctabar, .ctabar')].filter(vis)[0];
  if (bar) {
    const top = bar.getBoundingClientRect().top;
    // a scroll area (squad list, training list; body counts, it has overflow-x hidden) lets text pass under the bar by design
    const scrolls = (e) => { for (let p = e; p && p !== document.documentElement; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return true; } return false; };
    const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w2.nextNode(); n; n = w2.nextNode()) {
      const t = n.nodeValue.trim(), e = n.parentElement;
      if (!t || !e || !vis(e) || e.closest('script,style,.ss-sr') || bar.contains(e) || scrolls(e)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (r.height > 0 && r.bottom > top + 1) out.underCta.push(`${t.slice(0, 30)} (bottom ${Math.round(r.bottom)} > bar ${Math.round(top)})`);
    }
    out.underCta = [...new Set(out.underCta)].slice(0, 6);
  }
  out.small = [...new Set(out.small)].slice(0, 8); out.tiny = [...new Set(out.tiny)].slice(0, 8);
  return out;
}

async function journey(browser, tag) {
  const problems = [], notes = [], shots = [];
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const bad = (m) => { problems.push(`[${tag}] ${m}`); };
  page.on('pageerror', (e) => bad(`pageerror: ${e.message}`));
  const missing = new Set();
  page.on('response', (r) => { if (r.status() >= 400) missing.add(`${r.status()} ${r.url().replace(ORIGIN, '')}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) bad(`console error: ${m.text()}`); });
  page.on('requestfailed', (r) => bad(`request failed: ${r.url()}`));
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) bad(`network request outside the app: ${r.url()}`); });

  const stage = () => page.evaluate(() => (window.__store ? window.__store.get().stage : null));
  const snap = () => page.evaluate(() => { const s = window.__store.get(); const me = s.clubs && s.clubs.find((c) => c.id === 'c0');
    return JSON.stringify({ stage: s.stage, week: s.training && s.training.week, tp: s.training && s.training.tp, drilled: s.training && s.training.drilled,
      six: me && me.six, table: s.season && s.season.table, round: s.season && s.season.round, coach: s.coachPicked }); });
  const audited = new Set();
  async function audit(key) {
    if (audited.has(key)) return; audited.add(key);
    const a = await page.evaluate(auditInPage);
    if (a.hScroll) bad(`${key}: horizontal scroll`);
    if (a.cta && a.cta.none) notes.push(`${key}: no CTA bar on this screen`);
    else if (a.cta && !a.cta.visible) bad(`${key}: main CTA "${a.cta.text}" is not fully visible without scrolling`);
    if (a.underCta && a.underCta.length) bad(`${key}: text runs under the CTA bar: ${a.underCta.join('; ')}`);
    if (a.small.length) bad(`${key}: tap targets under 56 px: ${a.small.join('; ')}`);
    if (a.tiny.length) bad(`${key}: text under 14 px: ${a.tiny.join('; ')}`);
    if (a.vScroll) notes.push(`${key}: scrolls vertically (allowed only on table, training list, squad list)`);
  }
  async function shot(name) { if (!shotsOk) return; try { await page.screenshot({ path: `${SHOTS}${tag}-${name}.png` }); shots.push(name); } catch (e) { shotsOk = false; notes.push(`screenshot failed: ${e.message}`); } }
  const settle = (ms = 250) => page.waitForTimeout(ms);
  async function closeSheets() { for (let i = 0; i < 4 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await settle(150); } }
  async function clickCta() {
    const b = await page.$('.m0-ctabar button:not([disabled]), .ctabar button:not([disabled]), .c-btn--cta:not([disabled])');
    if (!b) return false; await b.click(); await settle(); return true;
  }

  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${SEED}`); await settle(800);
  const first = await stage();
  if (first !== 'coach') { await ctx.close(); return { skip: `app boots into stage "${first}", not "coach": the season store/UI is not wired yet` }; }

  let steps = 0, hubSeen = 0, weekDone = false, reloaded = false, matchPlayed = false;
  while (steps++ < (FULL ? 600 : 120)) {
    const st = await stage();
    await audit(st + (st === 'hub' && hubSeen ? '#' + hubSeen : ''));
    await shot(String(steps).padStart(2, '0') + '-' + st);
    if (st === 'end') { await shot('end'); break; }
    if (st === 'coach') {
      await (await page.$('[data-pick]')).click(); await settle(100);
      if (!(await clickCta())) bad('coach: no enabled Confirm after picking a coach');
    } else if (st === 'hub' || st === 'semi' || st === 'final') {
      if (weekDone && !FULL) break;
      if (!hubSeen++) { // standings sheet, then the save sheet (view-only; Escape closes over-panel style modals)
        const t = await page.$('[data-act="sheet:table"]'); if (t) { await t.click(); await settle(500); await audit('standings-sheet'); await shot('standings'); await closeSheets(); } else bad('hub: no "Table" button');
        const sv = await page.$('[data-act="sheet:save"]'); if (sv) { await sv.click(); await settle(500); await audit('save-sheet'); await shot('save-sheet'); await closeSheets(); } else bad('hub: no Save button');
      }
      if (!(await clickCta())) bad(`${st}: no enabled CTA`);
    } else if (st === 'squad') {
      for (let k = 0; k < 6; k++) { const b = await page.$('.sq-row--bench'); if (!b) { bad('squad: fewer than six bench rows to pick'); break; } await b.click(); await settle(80); }
      const c = await page.$('[data-confirm]:not([disabled])'); if (!c) { bad('squad: Confirm my six stayed disabled after six picks'); break; } await c.click(); await settle();
    } else if (st === 'plan') {
      let go = await page.$('[data-start]:not([disabled])');
      if (!go) { // fill the plan: four bowlers twice, two once, never twice in a row
        const pat = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3];
        for (let k = 0; k < 10; k++) { await (await page.$(`[data-slot="${k}"]`)).click(); await (await page.$(`[data-bowler="${pat[k]}"]`)).click(); }
        go = await page.$('[data-start]:not([disabled])');
      }
      if (!go) { bad('plan: Start match stayed disabled after a legal plan'); break; } await go.click(); await settle(400);
    } else if (st === 'bowl' || st === 'break' || st === 'chase') {
      matchPlayed = true;
      if (!(await clickCta())) { const r = await page.$('.sb-row:not([disabled]):not(.is-disabled)'); if (r) { await r.click(); await settle(100); } if (!(await clickCta())) { bad(`${st}: nothing to tap`); break; } }
      await settle(300); await page.keyboard.press('Escape'); await settle(200); // over panel
    } else if (st === 'done') {
      if (!(await clickCta())) { bad('done: no CTA'); break; }
    } else if (st === 'train') {
      const rows = await page.$$('[data-act="sheet:player"]');
      if (rows.length < 10) bad(`train: ${rows.length} player rows, want all 10 (bench trains too)`);
      let drilled = 0;
      for (let k = 0; k < Math.min(3, rows.length); k++) {
        await (await page.$$('[data-act="sheet:player"]'))[k].click(); await settle(400);
        if (k === 0) { await audit('player-sheet'); await shot('player-sheet'); }
        const d = await page.$('.c-sheet [data-act="Drill"]:not([disabled])');
        if (d) { await d.click(); await settle(400); if (!drilled++) { await audit('drill-result'); await shot('drill-result'); } }
        await closeSheets();
      }
      if (!drilled) bad('train: no drill button could be tapped');
      if (!reloaded) { // reload mid-week keeps week, table, six, TP and drills; the saved game wins over ?seed
        reloaded = true; const before = await snap(); await page.reload(); await settle(800);
        const after = await snap(); if (before !== after) bad(`reload mid-week changed the state:\n  before ${before}\n  after  ${after}`);
        await audit('train-after-reload');
      }
      if (!(await clickCta())) { bad('train: no End week CTA'); break; }
    } else if (st === 'week') {
      weekDone = true;
      if (!(await clickCta())) { bad('week: no CTA'); break; }
    } else { bad(`unknown stage ${st}`); break; }
  }
  if (steps > (FULL ? 600 : 120)) bad('journey did not finish within the step limit');
  if (!matchPlayed) bad('journey never reached a match');
  for (const m of missing) if (!/\/favicon\.ico$/.test(m)) bad(`failed response ${m}`); // the browser's own favicon probe is not the app
  const final = await snap();
  await ctx.close();
  return { problems, notes, final, shots };
}

const browser = await chromium.launch();
let code = 0;
try {
  const a = await journey(browser, 'run1');
  if (a.skip) { console.log(`SKIP e2e: ${a.skip}`); }
  else {
    const b = await journey(browser, 'run2');
    const problems = [...a.problems, ...b.problems];
    if (a.final !== b.final) problems.push(`same seed twice gave different end states:\n  run1 ${a.final}\n  run2 ${b.final}`);
    console.log(`e2e 344x780 seed ${SEED}${FULL ? ' (full season)' : ' (journey)'}: ${a.shots.length + b.shots.length} screenshots in ${SHOTS}`);
    for (const n of new Set([...a.notes, ...b.notes].map((x) => x))) console.log('note: ' + n);
    if (problems.length) { console.log(`FAIL: ${problems.length} problem(s)`); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); code = 1; }
    else console.log('PASS: no scroll-x, CTA visible, taps >= 56, text >= 14, no console/page errors, no network, reload kept state, same seed twice equal, no text under the CTA bar');
    console.log('not covered: reduced-motion ball reveal; re-roll of the next drill without ?seed (needs two loads with salts)');
  }
} finally { await browser.close(); server.close(); }
process.exit(process.env.E2E_SOFT === '1' ? 0 : code);
