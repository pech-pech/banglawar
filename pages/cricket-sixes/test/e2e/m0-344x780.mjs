// M0 end-to-end at 344x780 ONLY (the closed Fold). Run from the app root:  node test/e2e/m0-344x780.mjs
// Env: E2E_FULL=1 plays the whole season to the end screen; E2E_SHOTS=dir moves the screenshots; E2E_SOFT=1 never exits 1.
// Journey (default): coach -> hub (standings sheet, save sheet) -> squad -> plan -> one match (over panel tapped through)
//   -> result -> training week (Run nets) -> reload mid-week -> end week -> week summary -> hub.   ?seed=e2e-1, fresh context each run.
// r9: the app is ON by default for two new stages: 'freepick' (first launch: tap a facility, tap Take, -> hub) and 'matchday'
//   (Squad/hub Start match -> reveal taps hype/toss/pep + the "?" sheet -> Next: Plan). Both are driven by real taps and audited (scroll-x, taps, text).
//   E2E_FEATURES=off: taps the gear, flips "New match-day and fan features" to Off in Settings (real taps), then plays the OLD flow;
//   fails if freepick or matchday ever shows. Playwright is preinstalled (global); no install. If the app boots into an unknown stage, the run SKIPS with exit 0.
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
const REDUCE = process.env.E2E_REDUCE === '1'; // E2E_REDUCE=1 emulates prefers-reduced-motion: reduce and fails on any running animation
const FEAT_OFF = (process.env.E2E_FEATURES || '') === 'off'; // E2E_FEATURES=off: switch the r9 features off in Settings, expect the old flow
const THEME = process.env.E2E_THEME || ''; // E2E_THEME=scorebook plays the same journey with the Scorebook look set in the save

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
function auditInPage(strict) {
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
  if (bar && !document.querySelector('.t2-ov')) { // a full-screen overlay (nets scene, wheel) covers the screen CTA, so it is not checked against it
    const top = bar.getBoundingClientRect().top;
    // a scroll area (squad list, training list; body counts, it has overflow-x hidden) lets text pass under the bar by design
    const scrolls = (e) => { for (let p = e; p && p !== document.documentElement && !(strict && p === document.body); p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return true; } return false; };
    const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w2.nextNode(); n; n = w2.nextNode()) {
      const t = n.nodeValue.trim(), e = n.parentElement;
      if (!t || !e || !vis(e) || e.closest('script,style,.ss-sr,.sr-only') || bar.contains(e) || scrolls(e)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (r.height > 0 && r.bottom > top + 1) out.underCta.push(`${t.slice(0, 30)} (bottom ${Math.round(r.bottom)} > bar ${Math.round(top)})`);
    }
    out.underCta = [...new Set(out.underCta)].slice(0, 6);
  }
  if (strict && document.body.scrollHeight > vh + 1) out.underCta.push('body scrolls ' + (document.body.scrollHeight - vh) + ' px');
  // the sticky bowler-list header may never sit on top of a tile
  out.overlap = [];
  const hd = document.querySelector('.bv-sb > .bv-head');
  if (hd && vis(hd)) { const hb = hd.getBoundingClientRect(); document.querySelectorAll('.bv-sb > .sb-row').forEach((r) => { const b = r.getBoundingClientRect(); if (b.height > 0 && b.top < hb.bottom - 0.5 && b.bottom > hb.bottom + 0.5) out.overlap.push(label(r)); }); }
  out.anims = document.getAnimations().filter((x) => x.playState === 'running').map((x) => (x.animationName || x.transitionProperty || 'anim') + ' on ' + ((x.effect && x.effect.target && (x.effect.target.className || x.effect.target.tagName)) || '?'));
  out.small = [...new Set(out.small)].slice(0, 8); out.tiny = [...new Set(out.tiny)].slice(0, 8);
  return out;
}

async function journey(browser, tag) {
  const problems = [], notes = [], shots = [];
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, reducedMotion: REDUCE ? 'reduce' : 'no-preference' });
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
  // strict = bowl and chase: nothing may sit under the CTA bar and the body may not scroll, at scroll 0 (P2 R2 QA, D1)
  async function audit(key, strict = false) {
    if (audited.has(key)) return; audited.add(key);
    const a = await page.evaluate(auditInPage, strict);
    if (a.hScroll) bad(`${key}: horizontal scroll`);
    if (a.cta && a.cta.none) notes.push(`${key}: no CTA bar on this screen`);
    else if (a.cta && !a.cta.visible) bad(`${key}: main CTA "${a.cta.text}" is not fully visible without scrolling`);
    if (a.underCta && a.underCta.length) bad(`${key}: text runs under the CTA bar: ${a.underCta.join('; ')}`);
    if (a.small.length) bad(`${key}: tap targets under 56 px: ${a.small.join('; ')}`);
    if (a.tiny.length) bad(`${key}: text under 14 px: ${a.tiny.join('; ')}`);
    if (a.overlap.length) bad(`${key}: bowler-list header covers a tile: ${a.overlap.join('; ')}`);
    if (REDUCE && a.anims.length) bad(`${key}: still animating under prefers-reduced-motion: ${a.anims.join('; ')}`);
    if (a.vScroll) notes.push(`${key}: scrolls vertically (allowed only on table, training list, squad list)`);
  }
  async function shot(name) { if (!shotsOk) return; try { await page.screenshot({ path: `${SHOTS}${tag}-${name}.png` }); shots.push(name); } catch (e) { shotsOk = false; notes.push(`screenshot failed: ${e.message}`); } }
  const settle = (ms = 250) => page.waitForTimeout(ms);
  async function closeSheets() { for (let i = 0; i < 4 && (await page.$('.c-sheet')); i++) { await page.keyboard.press('Escape'); await settle(150); } }
  async function clickCta() {
    const b = await page.$('.c-btn--cta:not([disabled])') || await page.$('.m0-ctabar button:not([disabled]), .ctabar button:not([disabled])');
    if (!b) return false; await b.click(); await settle(); return true;
  }

  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${SEED}`); await settle(800);
  const first = await stage();
  if (first !== 'hub' && first !== 'freepick') { await ctx.close(); return { skip: `app boots into stage "${first}", not "freepick" or "hub": the season store/UI is not wired yet` }; } // p7-first: no coach screen before match 1
  let sawFree = false, sawMd = 0;
  if (THEME) { await page.evaluate((t) => window.__store.dispatch('SetTheme', { theme: t }), THEME); await settle(300); const cls = await page.evaluate(() => document.body.className); if (!cls.includes('skin-' + THEME)) bad(`theme ${THEME} did not set its body class (${cls})`); }
  async function switchFeaturesOff() { // real taps: gear -> Settings sheet -> Features switch Off. Runs on the first hub, after the free pick (the freepick screen has no gear, see E2E.md).
    const gear = await page.$('.st-gear'); if (!gear) { bad('settings: no gear button on the hub'); }
    else {
      await gear.click(); await settle(500);
      const sw = await page.$('[data-md-features]');
      if (!sw) bad('settings: no "New match-day and fan features" switch');
      else {
        await audit('settings-sheet-features'); await shot('settings-features');
        if ((await sw.getAttribute('aria-checked')) !== 'true') bad('settings: features switch is not On by default');
        await sw.click(); await settle(300);
        if ((await sw.getAttribute('aria-checked')) !== 'false' || !/off/i.test(await sw.innerText())) bad('settings: features switch did not show Off with the word Off');
        if (await page.$eval('.md-set--auto', (e) => !e.hidden)) bad('settings: Auto match day row still shown with features off');
        await audit('settings-sheet-features-off');
      }
      await closeSheets(); await settle(300);
      const f = await page.evaluate(() => window.__store.get().features);
      if (f !== false) bad(`settings: store.features is ${f}, want false`);
      const st1 = await stage(); if (st1 !== 'hub') bad(`features off: stage is ${st1}, want hub`);
    }
  }

  let featOffDone = false, coachChecked = false, steps = 0, hubSeen = 0, weekDone = false, reloaded = false, matchPlayed = false;
  while (steps++ < (FULL ? 600 : 120)) {
    const st = await stage();
    const strict = st === 'bowl' || st === 'chase';
    const overNo = strict ? await page.evaluate(() => { const g = window.__store.get(); return (st2(g)).over; function st2(x) { return g.stage === 'chase' ? x.inn2 : x.inn1; } }) : 0;
    await audit(st + (st === 'hub' && hubSeen ? '#' + hubSeen : '') + (strict ? '@over' + overNo : ''), strict);
    if (strict && overNo <= 3) { // worst case: the same screen with hidden grades (grade ?), every extra line and button showing
      const hid = await page.evaluate(() => { const g = window.__store.get(); const was = { d: g.me.players.map((p) => p.drillsHere), salt: g.salt }; g.me.players.forEach((p, i) => { if (i % 2 === 0) p.drillsHere = 0; }); window.__store.dispatch('Reseed', { salt: 'e2e-hid' }); return was; });
      await settle(200); await audit(st + '-hidden@over' + overNo, true);
      await page.evaluate((was) => { const g = window.__store.get(); g.me.players.forEach((p, i) => { p.drillsHere = was.d[i]; }); window.__store.dispatch('Reseed', { salt: was.salt }); }, hid);
      await settle(200);
    }
    await shot(String(steps).padStart(2, '0') + '-' + st);
    if (st === 'end') { await shot('end'); break; }
    if (st === 'freepick') {
      sawFree = true;
      if (FEAT_OFF && featOffDone) { bad('features off, but the freepick screen showed again'); break; }
      await audit('freepick'); await shot('freepick');
      const txt = await page.evaluate(() => document.body.innerText);
      if (!/Pick your free facility/i.test(txt)) bad('freepick: heading "Pick your free facility" missing');
      const cards = await page.$$('[data-cl-pick]:not([disabled])'); if (cards.length < 3) bad(`freepick: only ${cards.length} pickable facilities`);
      const take0 = await page.$('[data-cl-act="TakeFreePick"]'); if (take0 && !(await take0.isDisabled())) bad('freepick: Take button enabled before anything was picked');
      const stands = (await page.$('[data-cl-pick="stands"]:not([disabled])')) || cards[0]; if (!stands) { bad('freepick: nothing to pick'); break; }
      await stands.click(); await settle(200);
      await audit('freepick-picked'); await shot('freepick-picked');
      const take = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (!take) { bad('freepick: Take stayed disabled after a pick'); break; }
      const tb = await take.boundingBox(); if (!tb || tb.y < 0 || tb.y + tb.height > VIEW.height) bad('freepick: the Take button is not fully visible without scrolling');
      await take.click(); await settle(400);
      const after = await stage(); if (after !== 'hub') bad(`freepick: Take returned to "${after}", want hub`);
      if (await page.evaluate(() => /squad is now 8/i.test(document.body.innerText))) bad('hub: shows the "squad is now 8" notice after the free pick (noticeOf must return null for freepick)');
    } else if (st === 'matchday') {
      sawMd++;
      if (FEAT_OFF) { bad('features off, but the matchday screen showed'); break; }
      await audit('matchday'); await shot('matchday-start');
      for (const w of ['hype', 'toss', 'pep']) {
        const b = await page.$(`[data-md="${w}"]`);
        if (!b) continue; // already shown, or no pep slot
        await b.click(); await settle(350); await audit('matchday-after-' + w); await shot('matchday-' + w);
      }
      const q = await page.$('[data-md="info"]');
      if (q) { await q.click(); await settle(500); await audit('matchday-info-sheet'); await shot('matchday-info'); await closeSheets(); } else bad('matchday: no "?" odds button');
      if (await page.$('[data-md]:not([data-md="info"])')) bad('matchday: a reveal tap is still pending after all taps');
      await audit('matchday-done');
      if (!(await page.$('[data-act="MatchdayGo"]:not([disabled])'))) { bad('matchday: no enabled go button (MatchdayGo)'); break; }
      await (await page.$('[data-act="MatchdayGo"]')).click(); await settle(400);
      const nx = await stage(); if (nx !== 'plan' && nx !== 'bowl') bad(`matchday: go led to "${nx}", want plan (or the match)`);
    } else if (st === 'coach') {
      await (await page.$('[data-pick]')).click(); await settle(100);
      if (!(await clickCta())) bad('coach: no enabled Confirm after picking a coach');
    } else if (st === 'hub' || st === 'semi' || st === 'final') {
      if (weekDone && !FULL) break;
      if (FEAT_OFF && !featOffDone) { featOffDone = true; await switchFeaturesOff(); }
      if (!hubSeen++) { // standings sheet, then the save sheet (view-only; Escape closes over-panel style modals)
        const t = await page.$('[data-act="sheet:table"]'); if (t) { await t.click(); await settle(500); await audit('standings-sheet'); await shot('standings'); await closeSheets(); } else bad('hub: no "Table" button');
        const bk = await page.$('[data-act="sheet:book"]'); // P4: the Pairing Book opens from the hub, both tabs
        if (bk) { await bk.click(); await settle(500); await audit('book-sheet'); await shot('book'); const ct = await page.$('[data-tab="combos"]'); if (ct) { await ct.click(); await settle(300); await audit('book-combos'); await shot('book-combos'); } await closeSheets(); } else bad('hub: no Book button');
        const sv = await page.$('[data-act="sheet:save"]'); if (sv) { await sv.click(); await settle(500); await audit('save-sheet'); await shot('save-sheet'); await closeSheets(); } else bad('hub: no Save button');
      }
      if (st === 'hub' && hubSeen === 1) { // P6: the team sheet opens from the Six and Overs chips; a swap and an overs edit persist
        const six0 = await page.evaluate(() => window.__store.get().clubs[0].six.join());
        const chip = await page.$('.hb-edit'); if (!chip) bad('hub: no Six chip');
        else {
          await chip.click(); await settle(400); await audit('team-sheet-six'); await shot('team-six');
          const on = await page.$('.ts-row:not(.ts-row--bench)');
          if (on) { await on.click(); await settle(100); const off = await page.$('.ts-row--bench'); if (off) { await shot('team-pick'); await off.click(); await settle(200); await shot('team-swapped'); } }
          const ot = await page.$('[data-tab="overs"]'); if (ot) { await ot.click(); await settle(300); await audit('team-sheet-overs'); await shot('team-overs'); }
          const swapped = await page.evaluate(() => window.__store.get().clubs[0].six.join());
          if (swapped === six0) bad('hub: a swap in the team sheet did not change the six');
          const done = await page.$('[data-done]:not([disabled])'); if (done) await done.click(); else bad('team sheet: Done is off after a swap');
          await settle(200);
          if (await page.$('.c-sheet')) bad('team sheet: Done did not close it');
          if ((await stage()) !== 'hub') bad('team sheet changed the stage');
        }
        await audit('hub-after-edit'); await shot('hub-after-edit');
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
      // P11 redo: Focus + Effort + optional Spotlight, one Run nets, then Done. Two taps a normal week.
      const rows = await page.$$('[data-act="sheet:player"]');
      if (rows.length < 8) bad(`train: ${rows.length} player rows, want all 8 (bench trains too)`);
      if (!(await page.$('[data-act="SetTrainPlan"]'))) bad('train: no Focus/Effort buttons');
      await audit('train'); await shot('train');
      const run = await page.$('[data-lo="runnets"]:not([disabled])');
      if (!run) bad('train: Run nets missing or disabled');
      else {
        await run.click(); await settle(400);
        if (await page.$('.wh-ov')) { // a Spotlight is set (remembered plan): SPIN, STOP, COLLECT
          await audit('wheel'); await shot('wheel');
          await (await page.$('.wh-ov [data-go]')).click(); await settle(REDUCE ? 300 : 2800); if (!REDUCE) { await (await page.$('.wh-ov [data-go]')).click(); await settle(1500); }
          await shot('wheel-result'); await (await page.$('.wh-ov [data-go]')).click(); await settle(400);
        }
        if (await page.$('.ns-scene')) { await audit('nets-scene'); await shot('nets-scene'); await (await page.$('.ns-skip')).click(); await settle(200); if (await page.$('.ns-scene')) { await (await page.$('.ns-skip')).click(); await settle(200); } }
        if (!(await page.$('.t2-line'))) bad('train: no result lines after Run nets');
        await audit('nets-result'); await shot('nets-result');
      }
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
  if (FEAT_OFF && !featOffDone) bad('features-off run never reached a hub to switch them off');
  if (!matchPlayed) bad('journey never reached a match');
  if (!sawFree) bad('the freepick screen never showed on a new game (features default on)');
  if (!FEAT_OFF && !sawMd) bad('features on: the matchday screen never showed before a match');
  for (const m of missing) if (!/\/favicon\.ico$/.test(m)) bad(`failed response ${m}`); // the browser's own favicon probe is not the app
  const final = await snap();
  await ctx.close();
  return { problems, notes, final, shots };
}


// ---- P2: season end (promoted / stayed) and Hall of Fame, drawn from stub view-models (view contract; no core needed) ----
const stubRows = (me) => Array.from({ length: 10 }, (_, i) => ({ pos: i + 1, name: i === me ? 'Kestrel Park Kings' : 'Club ' + (i + 1), me: i === me, p: 9, w: 9 - i, l: i, pts: (9 - i) * 2, rd: 10 - i, tp: 0 }));
const STUB_ROWS = stubRows(1);
const STUB_END = { rows: STUB_ROWS, finals: null, champion: 'Club 1', myPlace: 2, tpWon: 120, chapter: null, lastSeason: false, cta: 'NewSeason',
  result: { place: 2, promoted: true, toLeague: 2, stayed: false, line: 'Promoted to League 2.' } };
const STUB_RUNEND = { score: 1800, max: 9999, seasons: 12, bestLeague: 4, titles: 3,
  rows: [{ key: 'titles', label: 'League titles', value: 3, points: 600, maxPoints: 1500, pending: false },
    { key: 'league', label: 'Best league', value: 4, points: 800, maxPoints: 2000, pending: false },
    { key: 'best_player', label: 'Best player', value: 87, points: 400, maxPoints: 1000, pending: false },
    { key: 'fans', label: 'Fans', value: '', points: 0, maxPoints: 2000, pending: true },
    { key: 'club_build', label: 'Club buildings', value: '', points: 0, maxPoints: 1500, pending: true }],
  chapters: [{ name: 'Name a Stand', done: true, reached: true }, { name: 'Kickoff Crest', done: false, reached: true }, { name: 'Open the Academy', done: false, reached: false }],
  carry: [{ key: 'legend', label: 'Your legend', detail: 'Ravi, at 60% of his best', available: true }, { key: 'coach', label: 'One coach at level 2', detail: 'Pick one at the start', available: true }, { key: 'stadium', label: 'Stadium', detail: 'Comes with the stadium', available: false }], cta: 'NewRun' };

async function p2Screens(browser) {
  const problems = [], notes = [];
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[p2] pageerror: ${e.message}`));
  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${SEED}`); await page.waitForTimeout(600);
  const hasSel = await page.evaluate(async () => !!(await import('/cricket-sixes/js/store/selectors.js')).runEndVM);
  notes.push(hasSel ? 'p2: sel.runEndVM exists (screens below still use stub view-models)' : 'p2: sel.runEndVM not there yet; screens use stub view-models');
  const cases = [
    ['end-promoted', 'end-view', STUB_END],
    ['end-stayed', 'end-view', { ...STUB_END, rows: stubRows(4), myPlace: 5, result: { place: 5, promoted: false, toLeague: 1, stayed: true, line: 'Finished 5th. Top 2 go up.' } }],
    ['end-chapter-last', 'end-view', { ...STUB_END, lastSeason: true, cta: 'RunEnd', chapter: { name: 'Name a Stand', reward: 'TP 100', feat: { text: 'Win 6 matches in a row', done: false } } }],
    ['runend', 'runend-view', STUB_RUNEND],
    ['hub', 'hub-view', { season: { n: 1, league: 1 }, run: { season: 1, of: 12, league: 1, chapter: null, nextChapter: { season: 3, name: 'Kickoff Crest' } }, phaseWord: 'League', round: 1, tp: 40,
      next: { oppName: 'Club 4', kindWord: 'League match', oppStrength: 'Even' }, table5: STUB_ROWS.slice(0, 5), cta: { label: 'Pick your six' } }],
  ];
  for (const [name, mod, vm] of cases) {
    await page.evaluate(async ([m, v]) => { const mm = await import('/cricket-sixes/js/ui/' + m + '.js'); mm.render(document.getElementById('app'), v, () => {}); }, [mod, vm]);
    await page.waitForTimeout(250);
    const a = await page.evaluate(auditInPage);
    const bad = (m) => problems.push(`[p2] ${name}: ${m}`);
    if (a.hScroll) bad('horizontal scroll');
    if (!a.cta || !a.cta.visible) bad('main CTA not fully visible');
    if (a.underCta.length) bad('text under the CTA bar: ' + a.underCta.join('; '));
    if (a.small.length) bad('tap targets under 56 px: ' + a.small.join('; '));
    if (a.tiny.length) bad('text under 14 px: ' + a.tiny.join('; '));
    const text = await page.evaluate(() => document.getElementById('app').innerText);
    if (/Top 2 go up once the stadium/.test(text)) bad('dead-end line still shown');
    if (name === 'end-promoted' && !/promoted/i.test(text)) bad('no "Promoted" words');
    if (name === 'end-stayed' && !/stayed/i.test(text)) bad('no "Stayed" words');
    if (name === 'end-chapter-last' && !/see your run/i.test(text)) bad('CTA is not "See your run"');
    if (name === 'runend' && (text.match(/coming in a later update/gi) || []).length < 2) bad('pending rows do not say "Coming in a later update"');
    if (shotsOk) { const dir = process.env.E2E_P2_SHOTS || SHOTS; try { mkdirSync(dir, { recursive: true }); await page.screenshot({ path: `${dir}p2-${name}.png` }); } catch (e) { notes.push('p2 screenshot failed: ' + e.message); } }
  }
  await ctx.close();
  return { problems, notes };
}

const browser = await chromium.launch();
let code = 0;
try {
  const p2 = await p2Screens(browser);
  p2.notes.forEach((n) => console.log('note: ' + n));
  if (p2.problems.length) { console.log(`FAIL (P2 screens): ${p2.problems.length} problem(s)`); p2.problems.forEach((p) => console.log(' - ' + p)); code = 1; }
  else console.log('PASS (P2 end + Hall of Fame screens at 344x780)');
  const a = await journey(browser, 'run1');
  if (a.skip) { console.log(`SKIP e2e: ${a.skip}`); }
  else {
    const b = await journey(browser, 'run2');
    const problems = [...a.problems, ...b.problems];
    if (a.final !== b.final) problems.push(`same seed twice gave different end states:\n  run1 ${a.final}\n  run2 ${b.final}`);
    console.log(`e2e 344x780 seed ${SEED}${FULL ? ' (full season)' : ' (journey)'}${FEAT_OFF ? ' (features OFF)' : ''}: ${a.shots.length + b.shots.length} screenshots in ${SHOTS}`);
    for (const n of new Set([...a.notes, ...b.notes].map((x) => x))) console.log('note: ' + n);
    if (problems.length) { console.log(`FAIL: ${problems.length} problem(s)`); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); code = 1; }
    else console.log('PASS: no scroll-x, CTA visible, taps >= 56, text >= 14, no console/page errors, no network, reload kept state, same seed twice equal, no text under the CTA bar');
    console.log('not covered: reduced-motion ball reveal; re-roll of the next drill without ?seed (needs two loads with salts)');
  }
} finally { await browser.close(); server.close(); }
process.exit(process.env.E2E_SOFT === '1' ? 0 : code);
