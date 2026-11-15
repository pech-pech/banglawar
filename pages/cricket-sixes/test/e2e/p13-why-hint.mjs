// P13 e2e: inline "Why:" line on the bowl and chase call screens + the "your call vs other call" hint on the over panel.
// Run from the app root:  node test/e2e/p13-why-hint.mjs
// Env: E2E_SHOTS=dir (default build/p13/shots), E2E_SOFT=1 (never exit 1).  Seed ?seed=e2e-p13, fresh context per config.
// M PICKS override the spec: the Why sheet is REMOVED, so P13-6 = no Why? button, no data-why, no #why on bowl/chase, the last-over block
// is not a button and tapping it opens no sheet.
// Configs: A 344x882 (dsf 2, shots) -> P13-1,2,5,6 | B 344x780 -> P13-4 | C 704x783 -> P13-3,5 | D 344x882 reduced motion -> P13-7
//          E scorebook 344x882 + F scorebook 704x783 -> P13-8 | G 344x882, innings forced to end mid-over -> P13-9
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHOTS = process.env.E2E_SHOTS || '/mnt/project-files/games-design/cricket-sixes/build/p13/shots/';
const SEED = 'e2e-p13';
const req = createRequire(import.meta.url);
function loadPlaywright() {
  try { return req('playwright'); } catch (e) { /* global install */ }
  const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return req(req.resolve('playwright', { paths: [g] }));
}
const { chromium } = loadPlaywright();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webmanifest': 'application/json' };
const server = http.createServer(async (rq, rs) => {
  try {
    let p = decodeURIComponent(new URL(rq.url, 'http://x').pathname).replace(/^\/cricket-sixes(?=\/|$)/, ''); if (!p || p.endsWith('/')) p += '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) throw new Error('outside root');
    const buf = await readFile(f); rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(buf);
  } catch (e) { rs.writeHead(404); rs.end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
let shotsOk = true;
try { mkdirSync(SHOTS, { recursive: true }); } catch (e) { shotsOk = false; }

const results = []; // { id, ok, why }
const rec = (id, ok, why) => results.push({ id, ok: !!ok, why: ok ? '' : why });

// ---- in-page measurements ----
/** The last-over block on a call screen: returns facts about .lw and the block. */
function lwFacts(stage) {
  const blk = document.querySelector(stage === 'bowl' ? '.bv-last' : '.last-b');
  const lw = blk && blk.querySelector('.lw');
  const bar = [...document.querySelectorAll('.m0-ctabar, .ctabar')].find((e) => e.getBoundingClientRect().height > 0);
  const out = { block: !!blk, lw: !!lw, vw: innerWidth };
  if (!lw) return out;
  const r = lw.getBoundingClientRect(), cs = getComputedStyle(lw);
  out.text = lw.innerText.trim(); out.fs = parseFloat(cs.fontSize); out.sw = lw.scrollWidth; out.cw = lw.clientWidth; out.h = Math.round(r.height);
  out.bottom = Math.round(r.bottom); out.top = Math.round(r.top); out.right = Math.round(r.right); out.left = Math.round(r.left);
  out.barTop = bar ? Math.round(bar.getBoundingClientRect().top) : null;
  const colR = document.querySelector('.colR'); out.inColR = !!(colR && colR.contains(lw));
  if (colR) { const c = colR.getBoundingClientRect(); out.colRight = Math.round(c.right); out.colLeft = Math.round(c.left); }
  out.hasWhyLabel = /^Why:/.test(out.text);
  out.keyChips = blk.querySelectorAll('.is-key').length;
  out.sr = !!blk.querySelector('.ss-sr');
  out.anims = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && (a.effect.target.closest('.lw') || a.effect.target.closest('.op-call'))).length;
  out.blockIsButton = blk.tagName === 'BUTTON' || !!blk.closest('button, [role="button"], a[href]') || blk.hasAttribute('data-act') || blk.hasAttribute('tabindex');
  out.tooSmallFont = [...blk.querySelectorAll('.lw, .lw *')].some((e) => parseFloat(getComputedStyle(e).fontSize) < 14);
  out.docH = document.documentElement.scrollHeight; { const sv = lw.style.display; lw.style.display = 'none'; out.docHNoLw = document.documentElement.scrollHeight; lw.style.display = sv; const cb = document.querySelector('.colR'); out.colRH = cb ? Math.round(cb.getBoundingClientRect().height) : null; } out.scrollX = document.documentElement.scrollWidth > innerWidth + 1;
  return out;
}
/** Things that must be gone from bowl and chase (Q1=B). */
function noWhy() {
  const bad = [];
  if (document.querySelector('[data-why]')) bad.push('[data-why]');
  if (document.querySelector('#why')) bad.push('#why');
  for (const b of document.querySelectorAll('button, [role="button"]')) if (/^\s*why\s*\??\s*$/i.test(b.innerText || '') || /^why\??$/i.test(b.getAttribute('aria-label') || '')) bad.push('Why? button');
  return bad;
}
function panelFacts() {
  const card = document.querySelector('.op-card'), call = document.querySelector('.op-call'), next = document.querySelector('.op-next');
  const o = { card: !!card, call: !!call, next: !!next, balls: document.querySelectorAll('.op-slot:not(.is-unused)').length };
  if (!card) return o;
  const cr = card.getBoundingClientRect();
  if (next) { const nr = next.getBoundingClientRect(); o.nextIn = nr.top >= cr.top - 0.5 && nr.bottom <= cr.bottom + 0.5 && nr.left >= cr.left - 0.5 && nr.right <= cr.right + 0.5 && nr.height > 0; o.nextTop = Math.round(nr.top); o.nextBottom = Math.round(nr.bottom); }
  o.cardBottom = Math.round(cr.bottom); o.cardTop = Math.round(cr.top); o.vh = innerHeight;
  o.cardFits = cr.top >= -0.5 && cr.bottom <= innerHeight + 0.5;
  if (call) {
    const r = call.getBoundingClientRect(), cs = getComputedStyle(call);
    o.text = call.innerText.trim(); o.words = o.text.split(/\s+/).filter(Boolean).length; o.fs = parseFloat(cs.fontSize);
    o.callIn = r.width > 0 && r.height > 0 && r.top >= cr.top - 0.5 && r.bottom <= cr.bottom + 0.5 && r.left >= cr.left - 0.5 && r.right <= cr.right + 0.5;
    o.callTop = Math.round(r.top); o.callBottom = Math.round(r.bottom); o.callH = Math.round(r.height);
    o.inFoot = !!call.closest('.op-foot');
    o.beforeNext = !!(next && (call.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING));
    o.role = call.getAttribute('role'); o.live = call.getAttribute('aria-live'); o.label = call.getAttribute('aria-label');
    o.scrollW = call.scrollWidth; o.clientW = call.clientWidth;
    o.anims = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && (a.effect.target.closest('.op-call') || a.effect.target.closest('.lw'))).length;
    o.bannedWords = /\b(better|good|wrong)\b|%/i.test(o.text);
  }
  // are the why lines clipped by the fixed card (spec risk b)? list clipped lines
  const lines = card.querySelector('.op-lines');
  if (lines) {
    const foot = card.querySelector('.op-foot'); const ft = foot ? foot.getBoundingClientRect().top : cr.bottom;
    o.lineCount = lines.children.length; o.linesClipped = [];
    [...lines.children].forEach((li, i) => { const r = li.getBoundingClientRect(); if (r.bottom > ft + 1 || r.bottom > cr.bottom + 1) o.linesClipped.push(i + 1); });
    o.linesScroll = lines.scrollHeight > lines.clientHeight + 1;
  }
  return o;
}

/** One fresh context. cfg: {tag, w, h, dsf, theme, reduce, force, shots} */
async function runConfig(browser, cfg) {
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: cfg.dsf || 1, reducedMotion: cfg.reduce ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(`console: ${m.text()}`); });
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errs.push(`network outside app: ${r.url()}`); });
  const settle = (ms = 250) => page.waitForTimeout(ms);
  const stage = () => page.evaluate(() => (window.__store ? window.__store.get().stage : null));
  const overOf = () => page.evaluate(() => { const g = window.__store.get(); const i = g.stage === 'chase' ? g.inn2 : g.inn1; return i ? i.over : 0; });
  const shot = async (name) => { if (!cfg.shots || !shotsOk) return; try { await page.screenshot({ path: `${SHOTS}${name}.png` }); } catch (e) { /* optional */ } };
  const clickCta = async () => { const b = await page.$('.c-btn--cta:not([disabled])') || await page.$('.m0-ctabar button:not([disabled]), .ctabar button:not([disabled])'); if (!b) return false; await b.click(); await settle(); return true; };

  await page.goto(`${ORIGIN}/cricket-sixes/?seed=${SEED}`); await settle(800);
  if (cfg.theme) await page.evaluate((t) => window.__store.dispatch('SetTheme', { theme: t }), cfg.theme);
  await page.evaluate(() => { window.__ops = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; const nx = n.matches && n.matches('.op-next') ? n : n.querySelector && n.querySelector('.op-next'); if (nx) { const card = nx.closest('.op-card'); window.__ops.push({ balls: card ? card.querySelectorAll('.op-slot:not(.is-unused)').length : -1, call: !!(card && card.querySelector('.op-call')) }); } } }).observe(document.body, { childList: true, subtree: true }); });

  const seen = { bowl: false, chase: false, firstBowl: false, firstChase: false, panel: false, forced: false };
  const sizeNote = `${cfg.w}x${cfg.h}${cfg.theme ? ' ' + cfg.theme : ''}${cfg.reduce ? ' reduce' : ''}`;
  const fail = (id, m) => rec(id, false, `[${sizeNote}] ${m}`);
  const okc = [];   // ids that ran a check in this config
  const ids = cfg.ids;
  const mark = (id, cond, why) => { okc.push(id); rec(id, cond, `[${sizeNote}] ${why}`); };

  async function checkCallScreen(st) {
    const f = await page.evaluate(lwFacts, st);
    const idRun = st === 'bowl' ? ids.bowl : ids.chase;
    for (const id of idRun) {
      if (!f.block) { mark(id, false, `${st}: last-over block not found`); continue; }
      if (!f.lw) { mark(id, false, `${st}: no .lw after over 1`); continue; }
      const probs = [];
      if (!f.hasWhyLabel) probs.push(`text does not start with "Why:" (${JSON.stringify(f.text)})`);
      if (f.fs < 14) probs.push(`font ${f.fs}px < 14`);
      if (f.sw > f.cw) probs.push(`text cut: scrollWidth ${f.sw} > clientWidth ${f.cw} (${JSON.stringify(f.text)})`);
      if (f.tooSmallFont) probs.push('a child of .lw is under 14px');
      if (f.scrollX) probs.push('horizontal scroll');
      if (id === 'P13-1' || id === 'P13-2' || id === 'P13-4' || (id === 'P13-8' && cfg.w < 600)) { if (f.barTop != null && f.bottom > f.barTop) probs.push(`.lw bottom ${f.bottom} below CTA bar top ${f.barTop}`); }
      if (id === 'P13-3' || id === 'P13-8') {
        if (cfg.w >= 600) {
          if (!f.inColR) probs.push('.lw not inside .colR');
          if (f.h > 20) probs.push(`.lw height ${f.h}px > 20 (wraps)`);
          if (f.colRight != null && (f.right > f.colRight + 0.5 || f.left < f.colLeft - 0.5)) probs.push('.lw sticks out of .colR');
        }
      }
      if (cfg.w >= 600 && f.bottom > cfg.h) (cfg.notes || (cfg.notes = [])).push(`[${sizeNote}] ${st}: .lw is below the fold (bottom ${f.bottom} of ${cfg.h}); page already scrolls ${f.docH} and ${f.docHNoLw} without the .lw, so not caused by P13`);
      else if (f.bottom > cfg.h) probs.push(`.lw bottom ${f.bottom} is below the viewport (${cfg.h}); page scroll ${f.docH} (${f.docHNoLw} without the .lw), colR h ${f.colRH}`);
      if (!f.keyChips) probs.push('no .is-key chip in the last-over block');
      if (!f.sr) probs.push('no .ss-sr say text');
      if (id === 'P13-7' && f.anims) probs.push(`${f.anims} running animation(s) on .lw/.op-call`);
      mark(id, !probs.length, `${st}: ${probs.join('; ')}`);
    }
    // Q1=B: Why? is gone and the block is no tap target (P13-6)
    if (ids.nowhy) {
      const bad = await page.evaluate(noWhy);
      const probs = [...bad];
      if (f.blockIsButton) probs.push('last-over block is a button/link/focusable');
      // tap the block: it must open nothing
      const blk = await page.$(st === 'bowl' ? '.bv-last' : '.last-b');
      if (blk) { const before = await stage(); await blk.click({ position: { x: 6, y: 6 } }).catch(() => {}); await settle(400);
        const sheet = await page.evaluate(() => !!document.querySelector('.c-sheet, [role="dialog"]:not(.op-card), .sheet'));
        if (sheet) probs.push('tapping the last-over block opened a sheet');
        if (/why: last over/i.test(await page.evaluate(() => document.body.innerText))) probs.push('a "Why: last over" sheet title is on screen');
        if ((await stage()) !== before) probs.push('tapping the block changed the stage');
        await page.keyboard.press('Escape').catch(() => {}); await settle(100);
      } else probs.push('no last-over block to tap');
      mark('P13-6', !probs.length, `${st}: ${probs.join('; ')}`);
    }
  }

  async function checkPanel(tagName) {
    await page.waitForSelector('.op-next', { timeout: 15000 });
    const f = await page.evaluate(panelFacts);
    const probs = [];
    if (!f.call) probs.push('no .op-call on a 6-ball over');
    else {
      if (!f.callIn) probs.push('.op-call not fully inside .op-card');
      if (f.words > 8) probs.push(`${f.words} words > 8 (${JSON.stringify(f.text)})`);
      if (!f.inFoot) probs.push('.op-call not inside .op-foot');
      if (!f.beforeNext) probs.push('.op-call not before .op-next');
      if (f.role !== 'status' || f.live !== 'polite' || !f.label) probs.push(`aria wrong (role=${f.role} live=${f.live} label=${!!f.label})`);
      if (f.bannedWords) probs.push('banned word (better/good/wrong/%) in hint');
      if (f.scrollW > f.clientW + 1) probs.push('.op-call text overflows');
    }
    if (!f.nextIn) probs.push(`.op-next not fully inside .op-card (top ${f.nextTop} bottom ${f.nextBottom}, card bottom ${f.cardBottom})`);
    if (!f.cardFits) probs.push(`card outside the viewport (top ${f.cardTop} bottom ${f.cardBottom} of ${f.vh})`);
    for (const id of ids.panel) mark(id, !probs.length, `panel ${tagName}: ${probs.join('; ')}${f.text ? ' [' + f.text + ']' : ''}`);
    if (ids.panel.includes('P13-7')) { // present at first paint: check the hint was already there at the first poll (reduced motion -> instant)
      // measured by the caller via the immediate probe
    }
    if (f.linesClipped && f.linesClipped.length) pageNotes.push(`[${sizeNote}] why lines clipped by the fixed card: ${f.linesClipped.length} of ${f.lineCount} (lines ${f.linesClipped.join(',')}); .op-lines scrolls: ${f.linesScroll}`);
    return f;
  }
  const pageNotes = cfg.notes || (cfg.notes = []);

  // ---- drive the app ----
  let steps = 0, quit = false;
  while (steps++ < 160 && !quit) {
    const st = await stage();
    if (st === 'freepick') { const c = await page.$('[data-cl-pick="stands"]:not([disabled])') || await page.$('[data-cl-pick]:not([disabled])'); if (c) await c.click(); await settle(150); const t = await page.$('[data-cl-act="TakeFreePick"]:not([disabled])'); if (t) await t.click(); await settle(300); }
    else if (st === 'matchday') { for (const w of ['hype', 'toss', 'pep']) { const b = await page.$(`[data-md="${w}"]`); if (!b) continue; await b.click(); await settle(350); for (let i = 0; i < 12 && (await page.$('.dr-ov')); i++) { const g = await page.$('.dr-ov [data-go]:not([aria-disabled="true"])'); if (g) await g.click(); await settle(i === 0 ? 1600 : 900); } } const go = await page.$('[data-act="MatchdayGo"]:not([disabled])'); if (go) await go.click(); await settle(400); }
    else if (st === 'coach') { const p = await page.$('[data-pick]'); if (p) await p.click(); await clickCta(); }
    else if (st === 'hub' || st === 'semi' || st === 'final') { if (!(await clickCta())) { rec('SETUP', false, 'hub: no CTA'); break; } }
    else if (st === 'squad') { for (let k = 0; k < 6; k++) { const b = await page.$('.sq-row--bench'); if (!b) break; await b.click(); await settle(60); } const c = await page.$('[data-confirm]:not([disabled])'); if (c) await c.click(); await settle(); }
    else if (st === 'plan') {
      let go = await page.$('[data-start]:not([disabled])');
      if (!go) { const pat = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3]; for (let k = 0; k < 10; k++) { await (await page.$(`[data-slot="${k}"]`)).click(); await (await page.$(`[data-bowler="${pat[k]}"]`)).click(); } go = await page.$('[data-start]:not([disabled])'); }
      if (go) await go.click(); await settle(400);
    }
    else if (st === 'bowl' || st === 'chase' || st === 'break') {
      if (st === 'break') { if (!(await clickCta())) { rec('SETUP', false, 'break: no CTA'); break; } continue; }
      const skipB = await page.$('[data-strip-skip]'); if (skipB) { await skipB.click(); await settle(250); }
      const over = await overOf();
      // first over of an innings: no .lw
      if (over === 1) {
        const f = await page.evaluate(lwFacts, st);
        if (f.lw && !seen['first' + (st === 'bowl' ? 'Bowl' : 'Chase')]) { seen['first' + (st === 'bowl' ? 'Bowl' : 'Chase')] = true; for (const id of ['P13-1']) if (ids.firstOver) mark(id + 'a', false, `${st}: .lw drawn in over 1 (should be absent)`); }
      }
      if (over >= 2 && !seen[st]) {
        seen[st] = true;
        await checkCallScreen(st);
        await shot(st === 'bowl' ? cfg.shotBowl : cfg.shotChase);
        // P13-9 forced: end the chase innings after the next ball
        if (cfg.force && st === 'chase') await page.evaluate(() => { const g = window.__store.get(); g.inn2.target = g.inn2.runs - 1; });
        if (cfg.force && st === 'chase') seen.forced = true;
      }
      if (!(await clickCta())) { rec('SETUP', false, `${st}: nothing to tap`); break; }
      // over panel
      const needFull = !seen.panel && over >= 1 && ids.panel.length && (cfg.panelOnOver ? over === cfg.panelOnOver : over >= 2) && st === (cfg.panelStage || 'bowl');
      if (needFull) {
        seen.panel = true;
        if (cfg.reduce) { // reduced motion: hint is there at first paint, no running animation
          await page.waitForSelector('.op-card'); const f0 = await page.evaluate(panelFacts);
          mark('P13-7', f0.call && f0.anims === 0, `hint ${f0.call ? 'present' : 'MISSING'} at first paint, running animations on .op-call: ${f0.anims}`);
        }
        const f = await checkPanel(st + ' over ' + over);
        await shot(cfg.shotPanel);
        const nx = await page.$('.op-next'); if (nx) await nx.click(); await settle(250);
      } else {
        await page.waitForSelector('.op-card', { timeout: 4000 }).catch(() => {});
        if (cfg.force && st === 'chase' && seen.forced) { // wait for the short over's foot, then read it
          await page.waitForSelector('.op-next', { timeout: 15000 }).catch(() => {});
          const f = await page.evaluate(panelFacts);
          mark('P13-9', f.card && f.balls > 0 && f.balls < 6 && !f.call, `forced short over: balls=${f.balls}, .op-call ${f.call ? 'PRESENT' : 'absent'}${f.balls >= 6 ? ' (over was not short; force failed)' : ''}`);
          const nx = await page.$('.op-next'); if (nx) await nx.click(); await settle(250);
          seen.forced = false; cfg.forcedDone = true;
        } else { await page.keyboard.press('Escape'); await settle(120); }
      }
      if (cfg.forcedDone) quit = true;
      const got = (!ids.bowl.length || seen.bowl) && (!ids.chase.length || seen.chase) && (!ids.panel.length || seen.panel);
      if (got && !cfg.force && !cfg.natural) quit = true;
    }
    else if (st === 'done' || st === 'week' || st === 'train' || st === 'end') break;
    else { rec('SETUP', false, `unknown stage ${st}`); break; }
  }
  // natural scan of every over panel seen in the run: an over with <6 balls must have no .op-call, a 6-ball over must have one
  const ops = await page.evaluate(() => window.__ops || []);
  cfg.ops = ops;
  if (errs.length) rec('ERRORS', false, `[${sizeNote}] ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
  await ctx.close();
  return cfg;
}

const browser = await chromium.launch();
let code = 0;
try {
  const A = await runConfig(browser, { tag: 'A', w: 344, h: 882, dsf: 2, shots: true, shotBowl: 'bowl-344', shotChase: 'chase-344', shotPanel: 'panel-344', natural: false,
    ids: { bowl: ['P13-1'], chase: ['P13-2'], panel: ['P13-5'], nowhy: true, firstOver: true } });
  const Bc = await runConfig(browser, { tag: 'B', w: 344, h: 780, ids: { bowl: ['P13-4'], chase: ['P13-4'], panel: [], nowhy: false } });
  const C = await runConfig(browser, { tag: 'C', w: 704, h: 783, ids: { bowl: ['P13-3'], chase: ['P13-3'], panel: ['P13-5'], nowhy: false } });
  const D = await runConfig(browser, { tag: 'D', w: 344, h: 882, reduce: true, ids: { bowl: ['P13-7'], chase: ['P13-7'], panel: ['P13-7'], nowhy: false } });
  const E = await runConfig(browser, { tag: 'E', w: 344, h: 882, theme: 'scorebook', ids: { bowl: ['P13-8'], chase: ['P13-8'], panel: [], nowhy: false } });
  const F = await runConfig(browser, { tag: 'F', w: 704, h: 783, theme: 'scorebook', ids: { bowl: ['P13-8'], chase: ['P13-8'], panel: [], nowhy: false } });
  const G = await runConfig(browser, { tag: 'G', w: 344, h: 882, force: true, natural: true, ids: { bowl: [], chase: [], panel: [], nowhy: false } });
  // natural P13-9 evidence from every run's panel log
  const allOps = [A, Bc, C, D, E, F, G].flatMap((c) => c.ops || []);
  const shortOps = allOps.filter((o) => o.balls > 0 && o.balls < 6);
  const badShort = shortOps.filter((o) => o.call);
  const full = allOps.filter((o) => o.balls === 6), noHintFull = full.filter((o) => !o.call);
  rec('P13-9n', !badShort.length, `an over with < 6 balls showed .op-call (${badShort.length} of ${shortOps.length} short overs)`);
  if (!noHintFull.length) results.push({ id: 'P13-9n-info', ok: true, why: `natural: ${shortOps.length} short over(s), ${full.length} full overs all with hint` });
  else rec('P13-5n', false, `${noHintFull.length} of ${full.length} full 6-ball overs had no .op-call (may be legit when callCompare returns null)`);
  const notes = [A, Bc, C, D, E, F, G].flatMap((c) => c.notes || []);

  // verdict per P13-n: any failed result with that prefix fails it; any id never run fails it
  const want = ['P13-1', 'P13-2', 'P13-3', 'P13-4', 'P13-5', 'P13-6', 'P13-7', 'P13-8', 'P13-9'];
  console.log(`P13 e2e (seed ${SEED}) shots: ${shotsOk ? SHOTS : 'not saved'}`);
  for (const w of want) {
    const rs = results.filter((r) => r.id === w || (w === 'P13-9' && r.id === 'P13-9n') || (w === 'P13-5' && r.id === 'P13-5n') || r.id === w + 'a');
    const bad = rs.filter((r) => !r.ok);
    if (!rs.length) { console.log(`FAIL ${w}: never ran`); code = 1; }
    else if (bad.length) { console.log(`FAIL ${w} (${rs.length - bad.length}/${rs.length} checks ok)`); bad.forEach((b) => console.log('   - ' + b.why)); code = 1; }
    else console.log(`PASS ${w} (${rs.length} check${rs.length > 1 ? 's' : ''})`);
  }
  for (const r of results.filter((r) => ['SETUP', 'ERRORS'].includes(r.id) && !r.ok)) { console.log(`FAIL ${r.id}: ${r.why}`); code = 1; }
  for (const r of results.filter((r) => r.id === 'P13-9n-info')) console.log('note: ' + r.why);
  [...new Set(notes)].forEach((n) => console.log('note: ' + n));
} finally { await browser.close(); server.close(); }
process.exit(process.env.E2E_SOFT === '1' ? 0 : code);
