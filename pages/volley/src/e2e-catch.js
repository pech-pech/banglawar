#!/usr/bin/env node
// Project Volley: real-browser checks of the Supply Drop catch room (agent T2-catch).
// Usage: node src/e2e-catch.js [--sizes=344x882,475x638] [--only=drag|pause]
// Self-contained (does not require src/e2e.js). Builds a PRIVATE copy of the game into the scratch folder
// (build.py's inline()/assets() imported as a module; the repo's index.html is never written) and drives it
// in Chromium with real touch events (CDP) at 344x882, 475x638, 704x783, 475x694 and 475x590.
// Tests behaviour and text only, never pixel positions. Exit 1 if any FAIL.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const SRC = __dirname;
const SCRATCH = process.env.T2_SCRATCH || '/tmp/claude-0/-home-user/5a341b30-1083-5daf-a1f7-388564b31c82/scratchpad/T2';
fs.mkdirSync(SCRATCH, { recursive: true });
const BUILD = path.join(SCRATCH, 'game-private.html');
const SEED = 777;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const argOf = k => (argv.find(a => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
const SIZES = (argOf('sizes') || '344x882,475x638,704x783,475x694,475x590').split(',').map(s => s.split('x').map(Number));
const ONLY = argOf('only');
// expected column counts (V.Layout.cols: 9 / 11 / 13 / 15) are READ from the game; these are what the brief implies (informational check)
const EXPECT_COLS = { '344x882': 9, '475x638': 13, '704x783': 15, '475x694': 11, '475x590': 13 };

const rows = [];
let tag = '';
function row(test, status, detail) {
  rows.push({ tag, test, status, detail: String(detail == null ? '' : detail).replace(/\s+/g, ' ').slice(0, 400) });
  console.log(`[${status}] ${tag} | ${test} | ${detail || ''}`);
}
const ok = (c, test, detail) => row(test, c ? 'PASS' : 'FAIL', detail);

// private build: PYTHONDONTWRITEBYTECODE so nothing is written into the repo
function buildPrivate() {
  const py = `
import sys, os
sys.dont_write_bytecode = True
sys.path.insert(0, ${JSON.stringify(SRC)})
import build
s = build.assets(build.inline(os.path.join(${JSON.stringify(SRC)}, 'game.html')))
open(${JSON.stringify(BUILD)}, 'w', encoding='utf-8').write(s)
print(len(s))
`;
  const out = execFileSync('python3', ['-c', py], { env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1' }) }).toString().trim();
  console.log('private build', BUILD, out, 'bytes');
}

// ---------- in-page helpers ----------
const HELPERS = () => {
  const P = () => window.__pv;
  window.__setTune = o => { const objs = new Set([P().tune, window.V && window.V.TUNE, P().S && P().S.tune].filter(Boolean)); for (const t of objs) Object.assign(t, o); };
  window.__vis = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  window.__snap = () => { const S = P().S, h = S.hero, m = S.mini; return { frame: S.frame, t: S.t, phase: S.phase, stage: S.stage, kind: S.stageKind, hp: h.hp, maxHp: h.maxHp, x: h.x, y: h.y, credits: S.credits, enemies: S.enemies.length, paused: P().paused, hasMini: !!m,
    mini: m ? { phase: m.phase, t: m.t, net: m.net, caught: m.caught, dudHits: m.dudHits, tier: m.tier, cols: m.cols, air: m.crates.filter(c => c.st === 'air').length, spawned: m.crates.length, duds: m.duds.length, plays: m.plays, taken: m.taken } : null }; };
  // rAF recorder of the catch room clock against real time
  window.__rec = { on: false, log: [] };
  window.__startRec = () => { const r = window.__rec; r.on = true; r.log = []; (function tick() { if (!r.on) return; try { const S = P().S, m = S.mini; r.log.push({ now: performance.now(), ph: S.phase, mp: m ? m.phase : null, t: m ? m.t : null, net: m ? m.net : null, caught: m ? m.caught : null }); } catch (e) {} requestAnimationFrame(tick); })(); };
  window.__stopRec = () => { window.__rec.on = false; return window.__rec.log; };
  // test driver for stages 1-4: kill nothing by cheating; harmless enemies (ENEMY_DMG_MULT 0), fast fire; stand, nudge toward enemies when no line
  window.__clearRoom = n => {
    const p = P(); let i = 0; window.__noLine = window.__noLine || 0;
    for (; i < n; i++) {
      const S = p.S; if (S.phase !== 'play') break;
      const h = S.hero; let inp = { mx: 0, my: 0 };
      if (h.lockClear) window.__noLine = 0; else window.__noLine++;
      if (window.__noLine > 150 && S.enemies.length) {
        let best = null, bd = 1e9; for (const e of S.enemies) { const d = Math.hypot(e.x - h.x, e.y - h.y); if (d < bd) { bd = d; best = e; } }
        inp = { mx: best.x - h.x + (window.__noLine % 120 < 60 ? 0.8 : -0.8), my: best.y - h.y };
        if (window.__noLine > 190) window.__noLine = 0;
      }
      p.step(1, inp);
    }
    return i;
  };
  window.__toTarget = n => {
    const p = P(); let i = 0; const key = () => p.S.roomId + '/' + p.S.stage + '/' + p.S.phase + '/' + (p.S.chest ? p.S.chest.open : '');
    const start = key(); const st = window.__dst = window.__dst || { lx: 0, ly: 0, k: 0, det: 0, sgn: 1 };
    for (; i < n; i++) {
      const S = p.S; if (key() !== start) break;
      const h = S.hero, c = S.chest; let tx, ty;
      if (c && !c.open) { tx = c.x; ty = c.y; } else { const d = S.room.door; tx = d.x + d.w / 2; ty = d.y + d.h / 2 - 1; }
      let dx = tx - h.x, dy = ty - h.y;
      if (st.det > 0) { st.det--; dx = st.sgn; dy = -0.15; }
      if (++st.k % 20 === 0) { if (Math.hypot(h.x - st.lx, h.y - st.ly) < 0.08 && st.det === 0) { st.det = 45; st.sgn = (h.x < 4.5 ? -1 : 1) * (st.k % 40 ? 1 : -1); } st.lx = h.x; st.ly = h.y; }
      p.step(1, { mx: dx, my: dy });
    }
    return i;
  };
};

async function T(cdp, type, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: (type === 'touchEnd' || type === 'touchCancel') ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 10, radiusY: 10, force: 1 }] });
}

// ---------- session helpers ----------
async function openSession(browser, w, h, extraQuery) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url().slice(-60)));
  const cdp = await ctx.newCDPSession(page);
  await page.goto('file://' + BUILD + '?seed=' + SEED + '&home=0&title=0&gpu=0&debug=1' + (extraQuery || ''));
  await page.waitForFunction(() => window.__pv && window.__pv.S && window.__pv.S.hero, null, { timeout: 15000 });
  await page.evaluate(HELPERS);
  await page.addStyleTag({ content: '#home:not(.on){display:none!important}' });
  await sleep(400);
  return { ctx, page, cdp, errors };
}

// Drive stages 1-4 (harmless enemies, fast fire) until the catch room opens. Returns true if S.phase === 'collect' at stage 5.
async function reachCatchRoom(page, hpFrac) {
  await page.evaluate(() => { window.__setTune({ ENEMY_DMG_MULT: 0, FIRE_INTERVAL: 0.25 }); window.__pv.restart(); });
  const log = [];
  for (let k = 0; k < 400; k++) {
    const s = await page.evaluate(() => window.__snap());
    if (!log.length || log[log.length - 1] !== s.stage + ':' + s.kind) log.push(s.stage + ':' + s.kind);
    if (s.phase === 'collect') {
      // measurable repair: set HP before the room ends (the sheet reads missing HP when it opens)
      if (hpFrac) await page.evaluate(f => { const h = window.__pv.S.hero; h.hp = Math.round(h.maxHp * f); }, hpFrac);
      return { ok: true, log };
    }
    if (s.phase === 'play') await page.evaluate(() => window.__clearRoom(300));
    else if (s.phase === 'clear') await page.evaluate(() => window.__toTarget(240));
    else if (s.phase === 'pick') await page.evaluate(() => window.__pv.pick(0));
    else if (s.phase === 'results' || s.phase === 'dead') return { ok: false, log, why: 'run ended at ' + s.stage };
    else await page.evaluate(() => window.__pv.step(20, { mx: 0, my: 0 }));
  }
  return { ok: false, log, why: 'never reached collect' };
}

async function sheetInfo(page) {
  return page.evaluate(() => {
    const el = document.getElementById('cuSheet');
    if (!el || !window.__vis(el)) return null;
    const rows = [...el.querySelectorAll('.cu-r')].map(b => ({ id: b.getAttribute('data-id'), state: b.getAttribute('data-s'), disabled: b.getAttribute('aria-disabled') === 'true', text: b.textContent.replace(/\s+/g, ' ').trim() }));
    const take = el.querySelector('.cu-take'); const tr = take ? take.getBoundingClientRect() : null;
    return { text: el.textContent.replace(/\s+/g, ' ').trim(), rows, hasTake: !!take, takeH: tr ? Math.round(tr.height) : 0, left: (document.getElementById('cuLeft') || {}).textContent || '' };
  });
}
async function rowCenter(page, id) {
  return page.evaluate(id => { const b = document.querySelector('#cuSheet .cu-r[data-id="' + id + '"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
}
async function takeCenter(page) {
  return page.evaluate(() => { const b = document.querySelector('#cuSheet .cu-take'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
}
async function waitFor(page, fn, ms, every = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await sleep(every); }
  return false;
}
async function shot(page, name) { try { await page.screenshot({ path: path.join(SCRATCH, tag.replace(/[^\w.-]+/g, '_') + '-' + name + '.png'), timeout: 8000 }); } catch (e) { /* best effort */ } }

// ---------- run A: drag to catch, clock, tier, sheet, Take, resume ----------
async function runDrag(browser, w, h) {
  const size = w + 'x' + h; tag = size + ' drag';
  const s = await openSession(browser, w, h);
  const { page, cdp, errors } = s;
  try {
    const r = await reachCatchRoom(page, 0.5);
    ok(r.ok, 'room opens from the stage-5 collect room', r.ok ? 'stages ' + r.log.join(' ') : r.why + ' | ' + r.log.join(' '));
    if (!r.ok) return;
    await page.evaluate(() => window.__startRec());
    const s0 = await page.evaluate(() => window.__snap());
    ok(s0.stage === 5 && s0.kind === 'collect' && s0.hasMini, 'stage 5 is kind "collect" with S.mini', `stage ${s0.stage} kind ${s0.kind} mini ${JSON.stringify(s0.mini)}`);
    ok(s0.enemies === 0, 'no enemies in the catch room', `enemies ${s0.enemies}`);
    ok(s0.mini.cols === EXPECT_COLS[size], `${EXPECT_COLS[size]} columns at ${size}`, `S.mini.cols ${s0.mini.cols}`);
    ok(s0.mini.phase === 'countin' || s0.mini.phase === 'play', 'room starts with the count-in', `mini.phase ${s0.mini.phase}`);
    await shot(page, '1-entry');
    await waitFor(page, () => window.__pv.S.mini && window.__pv.S.mini.phase === 'play', 5000, 40);
    const sPlay = await page.evaluate(() => window.__snap());
    // drag-follow: finger offset steers (joystick); steer to the soonest-landing crate
    const x0 = Math.round(w / 2), y0 = Math.round(h - 90);
    await T(cdp, 'touchStart', x0, y0);
    let fx = x0, steerMoves = 0, minX = 99, maxX = -1, rtT = null, midShot = false;
    const tStart = Date.now();
    while (Date.now() - tStart < 14000) {
      const q = await page.evaluate(() => { const S = window.__pv.S, m = S.mini; if (!m || S.phase !== 'collect' || m.phase !== 'play') return { stop: S.phase !== 'collect' || (m && m.phase === 'end') }; const air = m.crates.filter(c => c.st === 'air').sort((a, b) => (b.y - a.y)); return { hx: S.hero.x, tx: air[0] ? air[0].x : null, t: m.t, ph: m.phase }; });
      if (q.stop) break;
      if (q.hx == null) { await sleep(40); continue; }
      minX = Math.min(minX, q.hx); maxX = Math.max(maxX, q.hx);
      let want = x0;
      if (q.tx != null) { const d = q.tx - q.hx; if (d > 0.2) want = x0 + 70; else if (d < -0.2) want = x0 - 70; }
      if (want !== fx) { fx = want; steerMoves++; await T(cdp, 'touchMove', fx, y0); }
      if (!midShot && q.t > 4) { midShot = true; await shot(page, '2-play-mid'); }
      await sleep(35);
    }
    await T(cdp, 'touchEnd');
    const log = await page.evaluate(() => window.__stopRec());
    // clock vs real time
    const pl = log.filter(e => e.mp === 'play' && e.t != null);
    if (pl.length > 10) {
      const a = pl[0], b = pl[pl.length - 1];
      const mid = pl.find(e => e.t >= 5);
      // pairs of (rAF time, sim t) so a slow frame or screenshot stall in the test does not count against the clock (R53: stalled real time is fed in as steps)
      const realSpan = (b.now - a.now) / 1000, simSpan = b.t - a.t;
      ok(Math.abs(realSpan - simSpan) < 0.6, 'the 10 s clock runs in real time', `sim ${simSpan.toFixed(2)} s over ${realSpan.toFixed(2)} s real (play frames ${pl.length}, first t ${a.t.toFixed(2)}, last t ${b.t.toFixed(2)})`);
      const tEnd = log.find(e => e.mp === 'end');
      if (tEnd) { const rs = (tEnd.now - a.now) / 1000, ss = 10 - a.t; ok(Math.abs(rs - ss) < 0.8 && tEnd.t <= 10.0001, 'room ends at t=10 after 10 s of clock (real time from the first play frame matches)', `first play frame t ${a.t.toFixed(2)}; end seen ${rs.toFixed(2)} s real later (want ${ss.toFixed(2)}); t at end ${tEnd.t}`); }
      else row('room ends at t=10', 'FAIL', 'no end phase seen in the recorder');
      if (mid) { const ra = (mid.now - a.now) / 1000; ok(Math.abs(ra - (mid.t - a.t)) < 0.8, 'clock at t=5 matches real time', `real ${ra.toFixed(2)} s vs sim ${(mid.t - a.t).toFixed(2)} s`); }
    } else row('the 10 s clock runs in real time', 'FAIL', 'recorder saw ' + pl.length + ' play frames');
    // drag effect
    ok(steerMoves >= 2 && maxX - minX > 1.5, 'dragging steers the Operator sideways', `${steerMoves} steer changes; hero x ${minX.toFixed(2)}..${maxX.toFixed(2)}`);
    // end beat, tier decided at the end
    await waitFor(page, () => window.__pv.S.mini && (window.__pv.S.mini.phase === 'end' || window.__pv.S.phase === 'supply'), 4000, 50);
    const e1 = await page.evaluate(() => { const S = window.__pv.S, m = S.mini, C = window.V.Catch; return { net: m.net, caught: m.caught, dud: m.dudHits, tier: m.tier, tierOf: C.tierOf(m.net), pay: m.pay ? m.pay.name : null, phase: m.phase, spawned: m.crates.length }; });
    ok(e1.caught >= 3, 'crates can be caught by dragging', `caught ${e1.caught}/20 (net ${e1.net}, duds hit ${e1.dud}); crates spawned ${e1.spawned}`);
    ok(e1.spawned === 20, 'all 20 crates drop', `spawned ${e1.spawned}`);
    ok(e1.tier === e1.tierOf, 'tier at the end equals tierOf(net)', `net ${e1.net} -> tier ${e1.tier} (tierOf ${e1.tierOf}) name ${e1.pay || '(set when the sheet opens)'}`);
    // sheet
    const opened = await waitFor(page, () => !!document.getElementById('cuSheet'), 6000, 80);
    ok(opened, 'payout sheet opens after the room', opened ? 'cuSheet in the DOM' : 'no #cuSheet within 6 s; phase ' + (await page.evaluate(() => window.__pv.S.phase)));
    if (!opened) return;
    await sleep(500);
    await shot(page, '3-sheet');
    const sh = await sheetInfo(page);
    const mini = await page.evaluate(() => ({ tierName: window.__pv.S.mini.pay.name, net: window.__pv.S.mini.net, tier: window.__pv.S.mini.tier, all: window.__pv.S.mini.pay.all, picks: window.__pv.S.mini.pay.picks }));
    ok(!!sh && /supply drop/i.test(sh.text) && sh.text.toLowerCase().includes(mini.tierName.toLowerCase()), 'sheet shows the title and the tier word', sh ? sh.text.slice(0, 120) : 'sheet not visible');
    ok(!!sh && new RegExp('you caught\\s*' + mini.net + '\\s*/\\s*20', 'i').test(sh.text), 'sheet shows "You caught n/20" with the real net', sh ? sh.text.slice(0, 120) : '');
    ok(!!sh && ['repair', 'credits', 'schematics'].every(id => sh.rows.some(r => r.id === id)), 'sheet has Repair, Credits and Schematics pads', sh ? JSON.stringify(sh.rows.map(r => r.id + ':' + r.state)) : '');
    ok(!!sh && sh.hasTake && sh.takeH >= 56, 'Take button is there and at least 56 px tall', sh ? 'height ' + sh.takeH : '');
    ok(!!sh && (mini.all ? sh.left === '' : /picks/i.test(sh.left) && /\d/.test(sh.left)), mini.all ? 'Great/Perfect: no picks counter' : 'Basic/Good: a picks counter is shown ("Picks left: n" in the contract)', sh ? JSON.stringify(sh.left) : '');
    ok(!/you lost|game over|failed/i.test(sh ? sh.text : ''), 'sheet never says "you lost"', '');
    const frozen0 = await page.evaluate(() => ({ f: window.__pv.S.frame, hp: window.__pv.S.hero.hp }));
    await sleep(1200);
    const sheetStill = await sheetInfo(page);
    ok(!!sheetStill, 'sheet has no timer or auto-close (still open after 1.2 s)', sheetStill ? 'open' : 'closed by itself');
    // Take: measure what the chosen pads promise
    const before = await page.evaluate(() => ({ cr: window.__pv.S.credits, hp: window.__pv.S.hero.hp, max: window.__pv.S.hero.maxHp, sch: (window.V.Meta && window.V.Meta.state) ? window.V.Meta.state.schematics | 0 : null, plays: (window.V.Meta && window.V.Meta.sdState) ? window.V.Meta.sdState().plays : null }));
    const picked = (await sheetInfo(page)).rows.filter(r => r.state === 'taken');
    const takeAt = await takeCenter(page);
    await page.touchscreen.tap(takeAt.x, takeAt.y);
    await sleep(60);
    await page.touchscreen.tap(takeAt.x, takeAt.y);   // double tap: must not grant twice
    await sleep(700);
    const after = await page.evaluate(() => ({ cr: window.__pv.S.credits, hp: window.__pv.S.hero.hp, phase: window.__pv.S.phase, sheet: !!document.getElementById('cuSheet'), sch: (window.V.Meta && window.V.Meta.state) ? window.V.Meta.state.schematics | 0 : null, plays: (window.V.Meta && window.V.Meta.sdState) ? window.V.Meta.sdState().plays : null, door: window.__pv.S.room && window.__pv.S.room.door ? window.__pv.S.room.door.open : null }));
    const wantCr = picked.filter(r => r.id === 'credits').map(r => +(/\+(\d+)/.exec(r.text) || [0, 0])[1])[0] || 0;
    const repairRow = picked.find(r => r.id === 'repair'); const wantHeal = repairRow ? +(/\((\d+)\)/.exec(repairRow.text) || [0, 0])[1] : 0;
    const wantSch = picked.filter(r => r.id === 'schematics').map(r => +(/\+(\d+)/.exec(r.text) || [0, 0])[1])[0] || 0;
    ok(!after.sheet, 'Take closes the sheet', `sheet in DOM ${after.sheet}`);
    ok(after.cr - before.cr === wantCr, 'Take pays the Credits pad exactly once (double tap)', `picked ${picked.map(r => r.id).join('+') || 'none'}; credits ${before.cr} -> ${after.cr} (want +${wantCr})`);
    ok(Math.abs((after.hp - before.hp) - wantHeal) <= 1, 'Take pays the Repair pad (heals the shown amount)', `hp ${before.hp.toFixed(0)} -> ${after.hp.toFixed(0)} / ${before.max} (want +${wantHeal})`);
    if (before.sch != null) ok(after.sch - before.sch === wantSch, 'Take banks the Schematics pad once', `schematics ${before.sch} -> ${after.sch} (want +${wantSch})`);
    if (before.plays != null) ok(after.plays === before.plays + 1, 'Take counts one Supply Drop play', `plays ${before.plays} -> ${after.plays}`);
    ok(after.phase !== 'supply' && after.phase !== 'collect', 'the run resumes after Take (door phase)', `phase ${after.phase}, door open ${after.door}`);
    // walk to the door, stage 6 is a normal room
    let st6 = null;
    for (let k = 0; k < 40; k++) {
      const q = await page.evaluate(() => window.__snap());
      if (q.stage === 6) { st6 = q; break; }
      if (q.phase === 'clear') await page.evaluate(() => window.__toTarget(240)); else await sleep(200);
    }
    ok(!!st6, 'the run walks on to stage 6', st6 ? `stage 6 phase ${st6.phase} kind ${st6.kind}` : 'stage 6 never loaded');
    if (st6) { await sleep(400); const q = await page.evaluate(() => { const S = window.__pv.S; return { mini: !!S.mini, kind: S.stageKind, ph: S.phase, en: S.enemies.length }; }); ok(!q.mini && q.kind !== 'collect', 'stage 6 is not the catch room (S.mini cleared)', JSON.stringify(q)); }
  } catch (e) {
    row('run A completed without an exception', 'FAIL', e.message.split('\n')[0]);
  } finally {
    ok(errors.length === 0, 'run A: 0 console errors', errors.length ? errors.join(' | ') : 'none');
    await s.ctx.close();
  }
}

// ---------- run B: pause mid-room, resume; lazy play to the end; locked pad and swap ----------
async function runPause(browser, w, h) {
  const size = w + 'x' + h; tag = size + ' pause';
  const s = await openSession(browser, w, h);
  const { page, errors } = s;
  try {
    const r = await reachCatchRoom(page, 0.5);
    ok(r.ok, 'room opens from the stage-5 collect room', r.ok ? 'stages ' + r.log.join(' ') : r.why);
    if (!r.ok) return;
    await waitFor(page, () => window.__pv.S.mini && window.__pv.S.mini.phase === 'play' && window.__pv.S.mini.t > 2.5, 8000, 50);
    // pause with the on-screen pause button (real tap) when visible, else a blur (fold / toolbar)
    const pb = await page.evaluate(() => { const b = document.getElementById('pauseBtn'); if (!b || !window.__vis(b)) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const t1 = await page.evaluate(() => window.__snap());
    if (pb) await page.touchscreen.tap(pb.x, pb.y); else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await sleep(300);
    const p1 = await page.evaluate(() => { const o = document.getElementById('ovPause'); return { paused: window.__pv.paused, vis: window.__vis(o), text: o ? o.innerText.replace(/\s+/g, ' ').trim() : '', t: window.__pv.S.mini.t, via: 0 }; });
    row('pause entered via', 'INFO', pb ? 'on-screen pause button tap' : 'window blur (pause button not visible in the room)');
    ok(p1.paused && p1.vis, 'pausing mid-room shows the pause card', `paused ${p1.paused}, overlay visible ${p1.vis}`);
    await shot(page, '4-paused');
    ok(/touch to continue/i.test(p1.text), 'the pause card says "Touch to continue"', `card text: "${p1.text.slice(0, 160)}"`);
    await sleep(1800);
    const p2 = await page.evaluate(() => ({ t: window.__pv.S.mini.t, ph: window.__pv.S.mini.phase, frame: window.__pv.S.frame }));
    ok(Math.abs(p2.t - p1.t) < 0.05, 'clock is frozen while paused (1.8 s real)', `t ${p1.t.toFixed(3)} -> ${p2.t.toFixed(3)}`);
    // resume with a touch outside the buttons (the card's own wording), top-left corner of the overlay
    // pick a point on the overlay that is not a button and not above the HUD pause button (a tap there makes the click land on the pause button once the overlay is gone)
    const rp = await page.evaluate(() => { const pb = document.getElementById('pauseBtn').getBoundingClientRect(); const W = innerWidth, H = innerHeight;
      for (const [x, y] of [[W / 2, H - 20], [W - 20, H - 20], [20, H - 20], [W / 2, H / 2 + 120], [W - 15, H / 2]]) { const e = document.elementFromPoint(x, y); if (e && e.closest('#ovPause') && !e.closest('button') && !(x > pb.left - 4 && x < pb.right + 4 && y > pb.top - 4 && y < pb.bottom + 4)) return { x, y }; } return null; });
    row('resume tap point (not a button, not over the pause button)', 'INFO', JSON.stringify(rp));
    await page.touchscreen.tap(rp ? rp.x : 20, rp ? rp.y : 20);
    await sleep(250);
    const r1 = await page.evaluate(() => ({ paused: window.__pv.paused, t: window.__pv.S.mini.t, now: performance.now() }));
    ok(!r1.paused, 'a touch outside the buttons resumes the game', `paused ${r1.paused}`);
    await sleep(700);
    const r2 = await page.evaluate(() => ({ t: window.__pv.S.mini.t, ph: window.__pv.S.mini.phase, now: performance.now() }));
    const rr = (r2.now - r1.now) / 1000; ok(Math.abs((r2.t - r1.t) - rr) < 0.25 && r1.t - p1.t < 0.5, 'the clock runs again after resume in real time, with no catch-up jump', `t ${r1.t.toFixed(2)} -> ${r2.t.toFixed(2)} over ${rr.toFixed(2)} s real (paused at ${p1.t.toFixed(2)}, resumed at ${r1.t.toFixed(2)})`);
    // pause again with a blur / refocus path (fold), then resume with the Resume button
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(250);
    const b2 = await page.evaluate(() => ({ paused: window.__pv.paused, t: window.__pv.S.mini.t }));
    ok(b2.paused, 'a blur (fold, toolbar, backgrounding) also pauses the room', `paused ${b2.paused}`);
    const rb = await page.evaluate(() => { const b = document.getElementById('btnResume'); if (!b || !window.__vis(b)) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (rb) { await page.touchscreen.tap(rb.x, rb.y); await sleep(250); }
    const b3 = await page.evaluate(() => ({ paused: window.__pv.paused, t: window.__pv.S.mini.t }));
    ok(rb && !b3.paused, 'Resume button resumes the room', `paused ${b3.paused}, t ${b2.t.toFixed(2)} -> ${b3.t.toFixed(2)}`);
    // ghost click: pause, then tap exactly where the HUD pause button sits (the card says any touch outside its buttons resumes)
    if (pb) {
      await page.touchscreen.tap(pb.x, pb.y); await sleep(500);
      const g0 = await page.evaluate(() => window.__pv.paused);
      await page.touchscreen.tap(pb.x, pb.y); await sleep(400);
      const g1 = await page.evaluate(() => window.__pv.paused);
      ok(g0 && !g1, 'resume tap over the HUD pause button resumes (no ghost click re-pausing)', `paused after pause tap ${g0}; after the resume tap ${g1}`);
      if (g1) { const rb2 = await page.evaluate(() => { const b = document.getElementById('btnResume'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await page.touchscreen.tap(rb2.x, rb2.y); await sleep(300); }
    }
    // lazy play (no touch): ends, tier from the net, sheet
    const done = await waitFor(page, () => !!document.getElementById('cuSheet'), 14000, 100);
    ok(done, 'after the pauses the room still ends and opens the sheet', done ? 'sheet open' : 'no sheet; ' + JSON.stringify(await page.evaluate(() => window.__snap())));
    if (!done) return;
    await sleep(500);
    const e = await page.evaluate(() => { const m = window.__pv.S.mini; return { net: m.net, tier: m.tier, tierOf: window.V.Catch.tierOf(m.net), name: m.pay.name, all: m.pay.all, picks: m.pay.picks, tMax: m.t }; });
    ok(e.tier === e.tierOf && e.tMax <= 10.0001, 'lazy run: tier decided from net at the end; clock stopped at 10 s', `net ${e.net} tier ${e.tier}/${e.tierOf} (${e.name}); t ${e.tMax}`);
    ok(e.tier <= 1, 'lazy (no touch) run lands in Basic or Good', `tier ${e.name}`);
    const sh = await sheetInfo(page);
    await shot(page, '5-sheet-lazy');
    if (e.all) { row('locked pad shows "opens at" and still swaps', 'SKIP', 'tier ' + e.name + ' takes every pad'); }
    else {
      const locked = sh.rows.filter(x => x.state === 'locked' || x.state === 'swap');   // over-limit rows read "Tap to swap in" (QA2 N1); tier locks keep "opens at"
      ok(locked.length >= 1 && locked.every(x => /opens at (Good|Great)|Tap to swap in/.test(x.text)), 'an over-limit pad shows "Tap to swap in" (or a tier lock "opens at")', locked.length ? locked.map(x => x.id + ': ' + x.text).join(' | ') : 'no locked rows: ' + JSON.stringify(sh.rows.map(x => x.id + ':' + x.state)));
      ok(locked.length >= 1 && locked.every(x => !x.disabled), 'a locked pad is not blocked (not aria-disabled)', locked.map(x => x.id + ' disabled ' + x.disabled).join(' | '));
      const takenBefore = sh.rows.filter(x => x.state === 'taken').map(x => x.id);
      const target = locked.find(x => x.id !== 'repair') || locked[0];
      if (target) {
        const c = await rowCenter(page, target.id);
        await page.touchscreen.tap(c.x, c.y); await sleep(250);
        const sh2 = await sheetInfo(page);
        const tr = sh2.rows.find(x => x.id === target.id);
        const takenAfter = sh2.rows.filter(x => x.state === 'taken').map(x => x.id);
        ok(tr.state === 'taken' && takenAfter.length === takenBefore.length && !takenAfter.includes(takenBefore[0]) || (tr.state === 'taken' && takenAfter.length === takenBefore.length), 'tapping a locked pad swaps it in (pick count unchanged)', `taken ${takenBefore.join('+')} -> ${takenAfter.join('+')}; ${target.id} now ${tr.state}; "${sh2.left}"`);
        ok(sh2.rows.some(x => (x.state === 'locked' || x.state === 'swap') && x.id !== target.id), 'the pad swapped out is now open to swap back in', JSON.stringify(sh2.rows.map(x => x.id + ':' + x.state)));
        await shot(page, '6-sheet-swapped');
        // Take pays the swapped pad (credits or schematics, whichever was swapped in)
        const b0 = await page.evaluate(() => ({ cr: window.__pv.S.credits, hp: window.__pv.S.hero.hp }));
        const tk = await takeCenter(page); await page.touchscreen.tap(tk.x, tk.y); await sleep(600);
        const a0 = await page.evaluate(() => ({ cr: window.__pv.S.credits, hp: window.__pv.S.hero.hp, ph: window.__pv.S.phase }));
        const wantCr = takenAfter.includes('credits'), wantHp = takenAfter.includes('repair');
        ok((a0.cr > b0.cr) === wantCr && (a0.hp > b0.hp) === wantHp && a0.ph !== 'supply', 'Take after a swap pays the swapped-in pad and resumes the run', `taken ${takenAfter.join('+')}; credits ${b0.cr} -> ${a0.cr}; hp ${b0.hp.toFixed(0)} -> ${a0.hp.toFixed(0)}; phase ${a0.ph}`);
      }
    }
  } catch (e) {
    row('run B completed without an exception', 'FAIL', e.message.split('\n')[0]);
  } finally {
    ok(errors.length === 0, 'run B: 0 console errors', errors.length ? errors.join(' | ') : 'none');
    await s.ctx.close();
  }
}

(async () => {
  buildPrivate();
  const browser = await chromium.launch();
  for (const [w, h] of SIZES) {
    if (!ONLY || ONLY === 'drag') await runDrag(browser, w, h);
    if (!ONLY || ONLY === 'pause') await runPause(browser, w, h);
  }
  await browser.close();
  const pass = rows.filter(r => r.status === 'PASS').length, fail = rows.filter(r => r.status === 'FAIL').length, other = rows.length - pass - fail;
  const txt = rows.map(r => `[${r.status}] ${r.tag} | ${r.test} | ${r.detail}`).join('\n') + `\n\nTOTAL: ${pass} pass, ${fail} fail, ${other} info/skip\n`;
  fs.writeFileSync(path.join(SCRATCH, 'e2e-catch-results.txt'), txt);
  console.log(`\nTOTAL: ${pass} pass, ${fail} fail, ${other} info/skip (rows saved to ${path.join(SCRATCH, 'e2e-catch-results.txt')})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
