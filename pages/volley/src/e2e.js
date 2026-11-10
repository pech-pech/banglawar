#!/usr/bin/env node
// Project Volley P0 end-to-end suite (D TEST). Playwright, headless, phone touch input via CDP.
// Usage: node src/e2e.js [--only=game|index] [--quick]
// Writes src/E2E-RESULTS.txt itself (date, file mtimes, every row). Exit 1 if any FAIL.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const SRC = __dirname;
const ROOT = path.resolve(SRC, '..');
const OUT_TXT = path.join(SRC, 'E2E-RESULTS.txt');
const SHOTS = process.env.E2E_SHOTS || '/tmp/claude-0/-home-user/5a341b30-1083-5daf-a1f7-388564b31c82/scratchpad/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
// Proven swiftshader WebGPU flags (last-over-lane/src/gpu-test.js). Page must be file:// (secure context).
const GPU_ARGS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'];
const SEED = 777;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const ONLY = (argv.find(a => a.startsWith('--only=')) || '').slice(7);

const TARGETS = [
  { name: 'src/game.html', file: path.join(SRC, 'game.html') },
  { name: 'index.html (built)', file: path.join(ROOT, 'index.html') },
].filter(t => !ONLY || t.name.includes(ONLY));

// full = whole functional suite; boot = boot/renderer/label/HUD targets only; wide = cover-note checks.
const SESSIONS = [
  { vp: [344, 882], mode: 'gpu0', plan: 'full' },
  { vp: [344, 882], mode: 'default', plan: 'full' },
  { vp: [412, 904], mode: 'gpu0', plan: 'full', cards: 3 },
  { vp: [412, 904], mode: 'default', plan: 'boot' },
  { vp: [1104, 884], mode: 'gpu0', plan: 'wide' },
  { vp: [1104, 884], mode: 'default', plan: 'wide' },
];

const rows = [];
let curTag = '';
function row(test, status, detail) {
  rows.push({ tag: curTag, test, status, detail: String(detail == null ? '' : detail).replace(/\s+/g, ' ').slice(0, 400) });
  console.log(`[${status}] ${curTag} | ${test} | ${detail || ''}`);
}
const ok = (c, test, detail) => row(test, c ? 'PASS' : 'FAIL', detail);

// ---------- in-page helpers (installed before any page script) ----------
const INIT = () => {
  // Controllable time offset (fake rAF gaps) and visibility (fake hidden tab).
  const pn = performance.now.bind(performance);
  window.__gapOff = 0;
  performance.now = () => pn() + window.__gapOff;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(ts => cb(ts + window.__gapOff));
  window.__fakeHidden = null;
  const hd = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const vs = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return window.__fakeHidden === null ? hd.get.call(this) : window.__fakeHidden; } });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return window.__fakeHidden === null ? vs.get.call(this) : (window.__fakeHidden ? 'hidden' : 'visible'); } });
  window.__ptr = [];
  for (const t of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(t, e => window.__ptr.push({ t, type: e.pointerType, now: performance.now(), frame: window.__pv && window.__pv.S ? window.__pv.S.frame : -1 }), true);
};

const HELPERS = () => {
  const P = () => window.__pv;
  window.__vis = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  window.__textEls = () => [...document.querySelectorAll('body *')].filter(e => !/^(SCRIPT|STYLE|CANVAS|TEXTAREA|NOSCRIPT)$/.test(e.tagName) &&
    [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && window.__vis(e));
  window.__desc = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '')) : 'null';
  window.__captureHud = () => { window.__hudBase = window.__textEls(); return window.__hudBase.map(e => window.__desc(e) + ' "' + e.textContent.trim().slice(0, 24) + '"'); };
  // L-TD-3: every baseline HUD text element must be hidden, or covered (elementFromPoint at its centre is not it).
  window.__hudLeaks = () => {
    const leaks = [], hidden = [], covered = [];
    for (const el of window.__hudBase || []) {
      if (!window.__vis(el)) { hidden.push(el); continue; }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && (hit === el || el.contains(hit))) leaks.push(window.__desc(el) + ' "' + el.textContent.trim().slice(0, 30) + '"');
      else covered.push(el);
    }
    return { leaks, hidden: hidden.length, covered: covered.length, total: (window.__hudBase || []).length };
  };
  // L-TD-4 targets.
  window.__targets = () => {
    const out = [];
    for (const e of document.querySelectorAll('button,[role=button],a[href],input[type=button],input[type=submit],input[type=checkbox],select,summary')) {
      let t = e;
      if (e.matches('input[type=checkbox]')) t = e.closest('label') || e;
      if (!window.__vis(t)) continue;
      const r = t.getBoundingClientRect();
      out.push({ d: window.__desc(t), txt: (t.textContent || t.getAttribute('aria-label') || '').trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height), cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    }
    return out;
  };
  window.__ranges = () => [...document.querySelectorAll('input[type=range]')].filter(window.__vis).map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  window.__findText = re => window.__textEls().filter(e => re.test(e.textContent.trim())).map(e => { const r = e.getBoundingClientRect(); return { d: window.__desc(e), txt: e.textContent.trim().slice(0, 60), cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
  window.__gameCanvas = () => {
    const cs = ['cgpu', 'c2d'].map(id => document.getElementById(id)).filter(c => c && window.__vis(c));
    const c = cs[0]; if (!c) return null; const r = c.getBoundingClientRect();
    return { id: c.id, all: cs.map(x => x.id), left: r.left, top: r.top, w: r.width, h: r.height };
  };
  window.__view = () => {
    const V = window.V || {}, p = P() || {};
    for (const v of [p.view, p.layout, V.view, V.layout, V.Main && V.Main.view, V.UI && V.UI.view]) if (v && typeof v.s === 'number' && typeof v.oy === 'number') return { ox: v.ox, oy: v.oy, s: v.s, w: v.w, h: v.h };
    return null;
  };
  window.__snap = () => { const S = P().S, h = S.hero; return { frame: S.frame, t: S.t, phase: S.phase, stage: S.stage, roomId: S.roomId, seed: S.seed, x: h.x, y: h.y, hp: h.hp, maxHp: h.maxHp, moving: h.moving, braced: h.braced, fireCd: h.fireCd, lockId: h.lockId, lockClear: h.lockClear, level: h.level, xp: h.xp, xpNext: h.xpNext, shots: S.stats && S.stats.shots, kills: S.stats && S.stats.kills, rounds: S.rounds.length, enemies: S.enemies.length, door: S.room && S.room.door && S.room.door.open, cards: S.cards ? S.cards.slice() : null, picks: S.stats && S.stats.picks ? S.stats.picks.length : null, mods: JSON.stringify(h.mods || {}) }; };
  // rAF sampler of hero state (records sim frames for timing).
  window.__sampler = { on: false, log: [] };
  window.__startSampler = () => { const sm = window.__sampler; sm.on = true; sm.log = []; (function tick() { if (!sm.on) return; try { const S = P().S, h = S.hero; sm.log.push({ now: performance.now(), frame: S.frame, t: S.t, moving: !!h.moving, braced: !!h.braced, shots: S.stats ? S.stats.shots : 0, rounds: S.rounds.length, x: h.x, y: h.y, hp: h.hp, phase: S.phase }); } catch (e) {} requestAnimationFrame(tick); })(); };
  window.__stopSampler = () => { window.__sampler.on = false; return window.__sampler.log; };
  window.__setTune = o => { const objs = new Set([P().tune, window.V && window.V.TUNE, P().S && P().S.tune].filter(Boolean)); for (const t of objs) Object.assign(t, o); };
  window.__resetTune = () => window.__setTune(JSON.parse(JSON.stringify(window.V.TUNE_DEFAULTS)));
  // Canvas 2D pixel signature of a CSS-px rect (for "no joystick graphic at the thumb").
  window.__grab = (x, y, w, h) => {
    const c = document.getElementById('c2d'); if (!c || !window.__vis(c)) return null;
    const r = c.getBoundingClientRect(), kx = c.width / r.width, ky = c.height / r.height;
    const ctx = c.getContext('2d'); if (!ctx) return null;
    return Array.from(ctx.getImageData(Math.round((x - r.left) * kx), Math.round((y - r.top) * ky), Math.round(w * kx), Math.round(h * ky)).data);
  };
  window.__diff = (a, b) => { if (!a || !b || a.length !== b.length) return -1; let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n / (a.length / 4); };
  // Drive the sim: clear the room (stand and fire; nudge toward enemies when no clear line).
  window.__clearRoom = n => {
    const p = P(); let i = 0;
    window.__noLine = window.__noLine || 0;
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
  // Walk to the open door; detour sideways when stuck.
  window.__toDoor = n => {
    const p = P(), start = p.S.roomId + '/' + p.S.stage; let i = 0;
    const st = window.__dst = window.__dst || { lx: 0, ly: 0, k: 0, det: 0, sgn: 1 };
    for (; i < n; i++) {
      const S = p.S; if (S.roomId + '/' + S.stage !== start || S.phase !== 'clear') break;
      const d = S.room.door, h = S.hero;
      let dx = d.x + d.w / 2 - h.x, dy = d.y + d.h / 2 - 1 - h.y;
      if (st.det > 0) { st.det--; dx = st.sgn; dy = -0.15; }
      if (++st.k % 20 === 0) { if (Math.hypot(h.x - st.lx, h.y - st.ly) < 0.08 && st.det === 0) { st.det = 45; st.sgn = (h.x < 4.5 ? -1 : 1) * (st.k % 40 ? 1 : -1); } st.lx = h.x; st.ly = h.y; }
      p.step(1, { mx: dx, my: dy });
    }
    return i;
  };
  window.__hash = S => {
    const o = { f: S.frame, p: S.phase, st: S.stage, r: S.roomId, h: [S.hero.x, S.hero.y, S.hero.hp, S.hero.xp, S.hero.level, S.hero.ang], e: S.enemies.map(e => [e.type, e.x, e.y, e.hp, e.st]), ro: S.rounds.map(r => [r.x, r.y]), sh: S.shots.map(r => [r.x, r.y]), pk: S.pickups.length, k: S.stats.kills, s: S.stats.shots };
    const str = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16) + ':' + str.length;
  };
  window.__scriptInp = k => [[0, -1], [1, 0], [0, 0], [-1, 0], [0, 0], [0, 1]][Math.floor(k / 40) % 6];
};

// ---------- touch via CDP (Chrome turns these into pointer events with pointerType 'touch') ----------
async function T(cdp, type, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: (type === 'touchEnd' || type === 'touchCancel') ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 10, radiusY: 10, force: 1 }] });
}
async function moveTo(cdp, x0, y0, x1, y1, steps = 6, ms = 100) {
  for (let i = 1; i <= steps; i++) { await T(cdp, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(ms / steps); }
}
async function tap(cdp, x, y) { await T(cdp, 'touchStart', x, y); await sleep(40); await T(cdp, 'touchEnd'); }

async function snapshot(page, name) {
  const p = path.join(SHOTS, `${curTag.replace(/[^\w.-]+/g, '_')}-${name}.png`);
  try { await page.screenshot({ path: p, timeout: 8000 }); } catch (e) { /* best effort */ }
}

function targetsRow(name, list) {
  const small = list.filter(t => Math.min(t.w, t.h) < 55.5);
  ok(list.length > 0 && small.length === 0, `touch targets >= 56 px (${name})`, `${list.length} targets` + (small.length ? '; SMALL: ' + small.map(t => `${t.d} "${t.txt}" ${t.w}x${t.h}`).join(', ') : '; min ' + (list.length ? Math.min(...list.map(t => Math.min(t.w, t.h))) : '-') + ' px'));
}
async function hudRow(page, name) {
  const r = await page.evaluate(() => window.__hudLeaks());
  ok(r.leaks.length === 0, `HUD text not visible through ${name} (L-TD-3)`, `${r.total} HUD text els: ${r.hidden} hidden, ${r.covered} covered` + (r.leaks.length ? '; LEAK: ' + r.leaks.join(', ') : ''));
}

// ---------- one session ----------
async function session(browser, target, sess) {
  const [w, h] = sess.vp;
  curTag = `${target.name} ${w}x${h} ${sess.mode}`;
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  const cdp = await ctx.newCDPSession(page);
  const q = '?seed=' + SEED + (sess.mode === 'gpu0' ? '&gpu=0' : '');
  try {
    await page.goto('file://' + target.file + q);
    await page.waitForFunction(() => window.__pv && window.__pv.S && window.__pv.S.hero, null, { timeout: 15000 });
  } catch (e) {
    ok(false, 'boot (window.__pv.S ready)', e.message.split('\n')[0] + (errors.length ? ' | ' + errors.join(' | ') : ''));
    await ctx.close(); return { errors };
  }
  await page.evaluate(HELPERS);
  await sleep(2500); // let the GPU renderer resolve
  const bootErr = errors.slice();
  ok(bootErr.length === 0, 'boots with 0 console errors', bootErr.length ? bootErr.join(' | ') : 'none');
  const seed0 = await page.evaluate(() => window.__pv.S.seed);
  ok(seed0 === SEED, '?seed is read', `S.seed=${seed0} (url seed ${SEED})`);

  // Renderer + label (L-TD-2) + readback (L-TD-1).
  const rn = await page.evaluate(() => window.__pv.renderer);
  if (sess.mode === 'gpu0') ok(rn === 'Canvas 2D', '?gpu=0 forces Canvas 2D', `__pv.renderer=${rn}`);
  else {
    ok(rn === 'WebGPU', 'default picks WebGPU (swiftshader flags)', `__pv.renderer=${rn}`);
    if (rn === 'WebGPU') {
      const rb = await page.evaluate(() => Promise.resolve(window.__pv.readback()).then(r => r && { w: r.w, h: r.h, nonBg: r.nonBg }).catch(e => ({ err: String(e && e.message || e) })));
      ok(rb && rb.nonBg > 0, 'WebGPU output seen via readback (L-TD-1)', rb && rb.nonBg > 0 ? `seen (nonBg ${rb.nonBg}, ${rb.w}x${rb.h})` : 'NOT seen ' + JSON.stringify(rb));
    }
  }
  const lab = await page.evaluate(() => window.__findText(/\b(WebGPU|Canvas 2D)\b/));
  const labWord = lab.length ? (lab[0].txt.match(/\b(WebGPU|Canvas 2D)\b/) || [])[1] : null;
  ok(lab.length > 0 && labWord === rn, 'renderer label text equals __pv.renderer', `label "${lab.length ? lab[0].txt : 'NOT FOUND'}" vs ${rn}`);
  if (lab.length) {
    const t = lab.map(l => l.txt).join(' ');
    ok(t.includes(String(w)) && t.includes(String(h)), 'renderer label shows viewport WxH (+dpr)', `"${t.slice(0, 80)}"`);
  }
  const hudList = await page.evaluate(() => window.__captureHud());
  row('HUD text elements (baseline)', 'INFO', hudList.join('; '));
  targetsRow('HUD', await page.evaluate(() => window.__targets()));
  const cv = await page.evaluate(() => window.__gameCanvas());
  const view = await page.evaluate(() => window.__view());
  ok(!!cv && cv.all.length === 1, 'one game canvas visible (unused one hidden)', cv ? `visible: ${cv.all.join(',')} rect ${Math.round(cv.left)},${Math.round(cv.top)} ${Math.round(cv.w)}x${Math.round(cv.h)}` : 'no visible canvas');
  await snapshot(page, 'boot');

  if (sess.plan === 'wide') {
    const note = await page.evaluate(() => window.__findText(/cover[\s-]*screen/i));
    ok(note.length > 0, 'wide screen shows the cover-screen note', note.length ? `"${note[0].txt}"` : 'no visible text matching /cover screen/');
    if (cv) {
      const asp = cv.w / cv.h, want = 344 / 882;
      ok(Math.abs(asp - want) < 0.03 && Math.abs(cv.left + cv.w / 2 - w / 2) < 4, 'wide: game in centred portrait column 344:882', `canvas ${Math.round(cv.w)}x${Math.round(cv.h)} aspect ${asp.toFixed(3)} (want ${want.toFixed(3)}), centre off ${Math.round(cv.left + cv.w / 2 - w / 2)} px`);
    }
    await dragTest(page, cdp, sess, cv, view, w, h);
    finishErrors(errors, bootErr);
    await ctx.close(); return { errors };
  }

  // Layout / thumb-safe.
  if (view) {
    const top = cv ? cv.top : 0, heroY = top + view.oy + 14.5 * view.s;
    ok(heroY < 0.85 * h, 'thumb-safe: hero start row 14 above bottom 15%', `view s=${view.s.toFixed(2)} oy=${view.oy.toFixed(1)}; hero start y=${heroY.toFixed(0)} vs limit ${(0.85 * h).toFixed(0)}`);
    ok(Math.abs(view.s * 9 - (cv ? cv.w : w)) < 2 || view.s * 15 + view.oy <= (cv ? cv.h : h) + 1, 'room fits width under HUD', `room ${(9 * view.s).toFixed(0)}x${(15 * view.s).toFixed(0)} at oy ${view.oy.toFixed(0)}`);
  } else {
    const s0 = await page.evaluate(() => window.__snap());
    row('thumb-safe: hero start row 14 above bottom 15%', 'SKIP', `no view hook (__pv.view/V.view with s,oy) to map world->screen; hero y=${s0.y}`);
  }
  if (sess.plan === 'boot') { finishErrors(errors, bootErr); await ctx.close(); return { errors }; }

  await dragTest(page, cdp, sess, cv, view, w, h);
  await hysteresisTest(page, cdp, cv);
  await drawerTest(page);
  await pauseTest(page, cdp, w, h);
  await gapTest(page);
  const det = await determinismTest(page);
  await roomFlowTest(page, sess, w, h);
  await deathTest(page, w, h);
  finishErrors(errors, bootErr);
  await ctx.close();
  return { errors, det };
}

function finishErrors(errors, bootErr) {
  const later = errors.slice(bootErr.length);
  ok(later.length === 0, '0 console errors during the whole session', later.length ? later.slice(0, 5).join(' | ') : 'none');
}

function thumbPoint(cv, view, w, h) {
  const x = cv ? cv.left + cv.w / 2 : w / 2;
  const y = (cv ? cv.top + cv.h : h) - 45;
  const roomBottom = view && cv ? cv.top + view.oy + 15 * view.s : null;
  return { x, y, roomBottom };
}

async function dragTest(page, cdp, sess, cv, view, w, h) {
  const { x, y, roomBottom } = thumbPoint(cv, view, w, h);
  if (roomBottom != null) ok(y > roomBottom, 'drag start point is below the room', `touch y=${Math.round(y)}, room bottom y=${Math.round(roomBottom)}`);
  else {
    const est = await page.evaluate(() => { const hb = (window.__hudBase || []).map(e => e.getBoundingClientRect()).filter(r => r.top < innerHeight * 0.25); return hb.length ? Math.max(...hb.map(r => r.bottom)) : 0; });
    const cw = cv ? cv.w : w, ch = cv ? cv.h : h, top = cv ? cv.top : 0, hud = Math.max(0, est - top);
    const rb = top + hud + 15 * Math.min(cw / 9, (ch - hud) / 15);
    row('drag start point is below the room', y > rb ? 'PASS' : 'FAIL', `estimated (no view hook): touch y=${Math.round(y)}, room bottom <= ${Math.round(rb)} (HUD bottom ${Math.round(est)})`);
  }
  const hitEl = await page.evaluate(([x, y]) => window.__desc(document.elementFromPoint(x, y)), [x, y]);
  row('element under thumb point', 'INFO', hitEl);
  const domBefore = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(window.__vis).length);
  const g0 = await page.evaluate(([x, y]) => window.__grab(x - 50, y - 110, 100, 140), [x, y]);
  const s0 = await page.evaluate(() => window.__snap());
  await page.evaluate(() => window.__startSampler());
  await T(cdp, 'touchStart', x, y);
  await moveTo(cdp, x, y, x, y - 60);
  await sleep(250);
  // During hold: no joystick element / graphic near the thumb.
  const dom = await page.evaluate(([x, y]) => {
    const all = [...document.querySelectorAll('body *')].filter(window.__vis);
    const near = all.filter(e => { const r = e.getBoundingClientRect(); const big = r.width * r.height > innerWidth * innerHeight * 0.5; return !big && e.tagName !== 'CANVAS' && ((x >= r.left && x <= r.right && ((y >= r.top && y <= r.bottom) || (y - 60 >= r.top && y - 60 <= r.bottom)))); });
    const named = all.filter(e => /joy|stick|thumb|knob|nub|touchpad|dpad/i.test((e.id || '') + ' ' + (typeof e.className === 'string' ? e.className : '')));
    return { n: all.length, near: near.map(window.__desc), named: named.map(window.__desc) };
  }, [x, y]);
  const g1 = await page.evaluate(([x, y]) => window.__grab(x - 50, y - 110, 100, 140), [x, y]);
  await snapshot(page, 'drag-hold');
  await sleep(350);
  const sHold = await page.evaluate(() => window.__snap());
  await T(cdp, 'touchEnd');
  await sleep(700);
  const log = await page.evaluate(() => window.__stopSampler());
  const g2 = await page.evaluate(([x, y]) => window.__grab(x - 50, y - 110, 100, 140), [x, y]);
  const ptr = await page.evaluate(() => window.__ptr.slice(-4));
  const sAfter = await page.evaluate(() => window.__snap());

  ok(ptr.some(p => p.t === 'pointerdown' && p.type === 'touch'), 'touch arrives as pointer events (pointerType touch)', JSON.stringify(ptr.map(p => p.t + ':' + p.type)));
  const dy = sHold.y - s0.y, dx = sHold.x - s0.x;
  ok(dy < -0.5 && Math.abs(dx) < Math.abs(dy), 'touch drag below the room moves the hero (drag up = north)', `hero (${s0.x.toFixed(2)},${s0.y.toFixed(2)}) -> (${sHold.x.toFixed(2)},${sHold.y.toFixed(2)}) after ~0.7 s hold; moving=${sHold.moving}`);
  ok(dom.near.length === 0 && dom.named.length === 0 && dom.n <= domBefore, 'no joystick element at the thumb (DOM)', `visible els ${domBefore} -> ${dom.n}` + (dom.near.length ? '; near thumb: ' + dom.near.join(',') : '') + (dom.named.length ? '; named: ' + dom.named.join(',') : ''));
  if (g0 && g1 && g2) {
    const d01 = await page.evaluate(([a, b]) => window.__diff(a, b), [g0, g1]);
    const d12 = await page.evaluate(([a, b]) => window.__diff(a, b), [g1, g2]);
    const d02 = await page.evaluate(([a, b]) => window.__diff(a, b), [g0, g2]);
    const ring = d01 > 0.03 && d12 > 0.03 && d02 < 0.03;
    ok(!ring, 'no joystick graphic at the thumb (Canvas 2D pixels)', `ground patch diff base->hold ${(d01 * 100).toFixed(1)}%, hold->after ${(d12 * 100).toFixed(1)}%, base->after ${(d02 * 100).toFixed(1)}%`);
  } else if (sess.mode === 'gpu0') row('no joystick graphic at the thumb (Canvas 2D pixels)', 'SKIP', 'c2d canvas not readable');

  // Release -> brace -> fire timing (sim frames).
  const rel = (await page.evaluate(() => window.__ptr.filter(p => p.t === 'pointerup' || p.t === 'pointercancel').slice(-1)[0])) || null;
  if (rel && log.length) {
    const after = log.filter(l => l.now >= rel.now);
    const f0 = rel.frame;
    const sh0 = (log.filter(l => l.now < rel.now).slice(-1)[0] || after[0] || {}).shots;
    const ro0 = (log.filter(l => l.now < rel.now).slice(-1)[0] || after[0] || {}).rounds;
    const fb = after.find(l => l.braced), ff = after.find(l => l.shots > sh0 || (sh0 == null && l.rounds > ro0));
    const tb = fb ? (fb.frame - f0) / 60 : null, tf = ff ? (ff.frame - f0) / 60 : null;
    const stopped = after.find(l => !l.moving);
    ok(!!stopped, 'release = stop', stopped ? `stopped ${((stopped.frame - f0) / 60).toFixed(3)} s sim after release` : 'still moving after release');
    ok(tb != null && tb <= 0.3, 'release braces within ~0.3 s', tb != null ? `braced after ${tb.toFixed(3)} s sim (${Math.round(fb.now - rel.now)} ms real)` : `never braced in 0.7 s; final ${JSON.stringify({ braced: sAfter.braced, moving: sAfter.moving })}`);
    ok(tf != null && tf <= 0.4, 'release fires within ~0.3 s', tf != null ? `first shot ${tf.toFixed(3)} s sim after release (${Math.round(ff.now - rel.now)} ms real); fireCd at hold ${sHold.fireCd != null ? (+sHold.fireCd).toFixed(2) : '?'}` : `no shot in 0.7 s; lockId=${sAfter.lockId} lockClear=${sAfter.lockClear} enemies=${sAfter.enemies} fireCd=${sAfter.fireCd} phase=${sAfter.phase}`);
  } else row('release braces and fires', 'FAIL', 'no pointerup recorded or no samples');
}

async function hysteresisTest(page, cdp, cv) {
  const x = cv.left + cv.w / 2, y = cv.top + cv.h - 45;
  await T(cdp, 'touchStart', x, y);
  const st = [];
  for (const [d, wait] of [[-10, 300], [-20, 300], [-10, 300], [-5, 300]]) {
    await moveTo(cdp, x, y + (st.length ? st[st.length - 1].d : 0), x, y + d, 3, 40);
    await sleep(wait);
    st.push({ d, moving: await page.evaluate(() => !!window.__pv.S.hero.moving) });
  }
  await T(cdp, 'touchEnd');
  await sleep(200);
  const want = [false, true, true, false];
  ok(st.every((s, i) => s.moving === want[i]), 'deadzone hysteresis (enter 14 px / exit 8 px from touch-down)', st.map(s => `${-s.d}px:${s.moving ? 'move' : 'stop'}`).join(' ') + ' (want 10:stop 20:move 10:move 5:stop)');
  // pointercancel releases.
  await T(cdp, 'touchStart', x, y); await moveTo(cdp, x, y, x + 50, y); await sleep(200);
  const m1 = await page.evaluate(() => !!window.__pv.S.hero.moving);
  await T(cdp, 'touchCancel'); await sleep(250);
  const m2 = await page.evaluate(() => !!window.__pv.S.hero.moving);
  ok(m1 && !m2, 'touchcancel / pointercancel releases', `moving while held=${m1}, after cancel=${m2}`);
}

async function findBtn(page, re) {
  return page.evaluate(src => { const re = new RegExp(src, 'i'); return window.__targets().filter(t => re.test(t.txt) || re.test(t.d)); }, re.source);
}
async function findGear(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('button,[role=button]')].filter(window.__vis);
    const g = els.find(e => /⚙|gear|tun|setting|drawer/i.test((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.title || '') + ' ' + e.id + ' ' + e.className));
    if (!g) return null; const r = g.getBoundingClientRect(); return { d: window.__desc(g), cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
}

async function drawerTest(page) {
  const gear = await findGear(page);
  ok(!!gear, 'gear button for the tuning drawer present', gear ? gear.d : 'not found');
  if (!gear) return;
  await page.touchscreen.tap(gear.cx, gear.cy);
  await sleep(400);
  const rg = await page.evaluate(() => window.__ranges());
  const info = await page.evaluate(() => {
    const keys = Object.keys(window.V.TUNE_DEFAULTS || {});
    const inputs = [...document.querySelectorAll('input')].filter(e => e.type === 'range' || e.type === 'checkbox' || e.type === 'number');
    const txt = document.body.innerText;
    const missing = keys.filter(k => !inputs.some(i => [i.name, i.id, i.dataset.k, i.dataset.key].includes(k)) && !txt.includes(k));
    return { keys: keys.length, inputs: inputs.length, missing };
  });
  ok(rg.length > 0, 'tuning drawer opens with sliders', `${rg.length} visible sliders`);
  ok(info.missing.length === 0, 'drawer has a control for every TUNE knob', `${info.keys} knobs, ${info.inputs} inputs` + (info.missing.length ? '; no control found by name/id/data-k/label for: ' + info.missing.join(',') : ''));
  const need = ['reset', 'copy settings', 'copy report'];
  const have = await page.evaluate(() => window.__targets().map(t => t.txt.toLowerCase()));
  const miss = need.filter(n => !have.some(t => t.includes(n)));
  ok(miss.length === 0, 'drawer buttons Reset / Copy settings / Copy report', miss.length ? 'missing: ' + miss.join(', ') : 'all present');
  targetsRow('drawer open', await page.evaluate(() => window.__targets()));
  const small = rg.filter(r => r.h < 56);
  row('drawer slider heights (info, L-TD-4)', 'INFO', rg.length ? `min ${Math.min(...rg.map(r => r.h))} px; ${small.length}/${rg.length} under 56` : '-');
  await snapshot(page, 'drawer');
  // Copy report (clipboard may be unavailable on file://; textarea fallback expected). Info only.
  const cr = await findBtn(page, /copy report/);
  if (cr.length) {
    const before = await page.evaluate(() => document.querySelectorAll('textarea').length);
    await page.touchscreen.tap(cr[0].cx, cr[0].cy); await sleep(300);
    const ta = await page.evaluate(() => { const lc = window.__pv && window.__pv.lastCopy; const t = (typeof lc === 'string' && lc) || [...document.querySelectorAll('textarea')].map(e => e.value).filter(Boolean).pop(); return t ? String(t).slice(0, 4000) : null; });
    const fields = ta ? ['p50', 'p95', 'seed', 'brac', 'kills'].filter(f => !ta.toLowerCase().includes(f)) : null;
    row('Copy report (info)', 'INFO', ta ? `report text ${ta.length} chars via textarea; missing words: ${fields.join(',') || 'none'}` : `no textarea value after tap (textareas ${before}); clipboard not readable headless`);
  }
  // Close the drawer.
  const close = await findBtn(page, /close|done|×|✕|back/);
  if (close.length) await page.touchscreen.tap(close[0].cx, close[0].cy);
  else { const g = await findGear(page); if (g) await page.touchscreen.tap(g.cx, g.cy); else await page.keyboard.press('Escape'); }
  await sleep(400);
  const rg2 = await page.evaluate(() => window.__ranges());
  ok(rg2.length === 0, 'drawer closes', `${rg2.length} sliders still visible`);
  // In case a pause card came up from closing, resume by tap.
  await resumeIfPaused(page);
}

async function resumeIfPaused(page) {
  const f0 = await page.evaluate(() => window.__pv.S.frame); await sleep(200);
  const f1 = await page.evaluate(() => window.__pv.S.frame);
  if (f1 === f0) {
    const b = await findBtn(page, /resume|continue|play|tap/);
    const vp = page.viewportSize();
    if (b.length) await page.touchscreen.tap(b[0].cx, b[0].cy); else await page.touchscreen.tap(vp.width / 2, vp.height / 2);
    await sleep(300);
  }
}

async function pauseTest(page, cdp, w, h) {
  const s0 = await page.evaluate(() => window.__snap());
  await page.evaluate(() => { window.__fakeHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(400);
  const fA = await page.evaluate(() => window.__pv.S.frame);
  await sleep(500);
  const fB = await page.evaluate(() => window.__pv.S.frame);
  ok(fA === fB, 'hidden tab pauses the sim', `frame ${fA} -> ${fB} over 0.5 s hidden`);
  const card = await page.evaluate(() => window.__findText(/pause|resume|tap to/i));
  ok(card.length > 0, 'pause card shown', card.length ? `"${card[0].txt}"` : 'no visible pause/resume text');
  await snapshot(page, 'pause');
  await hudRow(page, 'pause card');
  targetsRow('pause card', await page.evaluate(() => window.__targets()));
  // Fake a 1 s rAF gap while hidden, then come back.
  await page.evaluate(() => { window.__gapOff += 1000; });
  await sleep(1000);
  await page.evaluate(() => { window.__fakeHidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  await sleep(400);
  const s1 = await page.evaluate(() => window.__snap());
  ok(s1.frame === fB, 'stays paused after the tab returns (resume by tap, L-LOL-2)', `frame ${fB} -> ${s1.frame} after visible again`);
  ok(s1.hp === s0.hp || s1.hp >= s0.hp, 'no damage during the faked 1 s gap', `hp ${s0.hp} -> ${s1.hp}; frame ${s0.frame} -> ${s1.frame}`);
  await page.evaluate(() => window.__startSampler());
  const b = await findBtn(page, /resume|continue|play|tap/);
  if (b.length) await page.touchscreen.tap(b[0].cx, b[0].cy); else await page.touchscreen.tap(w / 2, h / 2);
  await sleep(500);
  const log = await page.evaluate(() => window.__stopSampler());
  let maxJump = 0; for (let i = 1; i < log.length; i++) maxJump = Math.max(maxJump, log[i].frame - log[i - 1].frame);
  const s2 = await page.evaluate(() => window.__snap());
  ok(s2.frame > s1.frame, 'tap resumes', `frame ${s1.frame} -> ${s2.frame}` + (b.length ? ` (tapped ${b[0].d})` : ' (tapped centre)'));
  ok(maxJump <= 5, 'no catch-up burst after resume', `max sim steps in one rAF after resume: ${maxJump}; hp ${s1.hp} -> ${s2.hp}`);
}

async function gapTest(page) {
  // Visible 1 s rAF stall mid-play: the accumulator must clamp (max 5 steps per frame).
  await page.evaluate(() => window.__startSampler());
  await sleep(300);
  const s0 = await page.evaluate(() => window.__snap());
  await page.evaluate(() => { window.__gapOff += 1000; });
  await sleep(300);
  const log = await page.evaluate(() => window.__stopSampler());
  let maxJump = 0, at = -1; for (let i = 1; i < log.length; i++) { const j = log[i].frame - log[i - 1].frame; if (j > maxJump) { maxJump = j; at = i; } }
  const hpd = at > 0 ? log[at].hp - log[at - 1].hp : 0;
  ok(maxJump <= 5, 'faked 1 s rAF gap (visible): steps clamped <= 5 per frame', `max steps in one rAF ${maxJump}; hp change in that frame ${hpd}; phase ${s0.phase}`);
  const s1 = await page.evaluate(() => window.__snap());
  row('hp across visible gap (info)', 'INFO', `hp ${s0.hp} -> ${s1.hp}`);
  await resumeIfPaused(page);
}

async function determinismTest(page) {
  // (a) through __pv: restart then 600 scripted steps in one synchronous evaluate (no live frame in between).
  const a = await page.evaluate(() => {
    const p = window.__pv; p.restart(); const seed = p.S.seed;
    for (let k = 0; k < 600; k++) { const d = window.__scriptInp(k); p.step(1, { mx: d[0], my: d[1] }); }
    return { seed, hash: window.__hash(p.S), frame: p.S.frame, phase: p.S.phase };
  });
  // (b) pure sim twice in-page with the same seed and tune.
  const b = await page.evaluate(seed => {
    const run = () => { const S0 = window.V.Sim.create(seed, JSON.parse(JSON.stringify(window.V.TUNE_DEFAULTS))); let S = S0; for (let k = 0; k < 600; k++) { const d = window.__scriptInp(k); window.V.Sim.step(S, { mx: d[0], my: d[1] }); } return window.__hash(S); };
    return [run(), run()];
  }, a.seed);
  ok(b[0] === b[1], 'same seed gives the same run (V.Sim, 600 steps twice)', `seed ${a.seed}: ${b[0]} vs ${b[1]}`);
  row('__pv run hash after restart (compared across sessions)', 'INFO', `seed ${a.seed} hash ${a.hash} frame ${a.frame} phase ${a.phase}`);
  await page.evaluate(() => window.__pv.restart());
  return { seed: a.seed, pv: a.hash, sim: b[0] };
}

async function roomFlowTest(page, sess, w, h) {
  // Make the room flow fast and safe: no enemy damage, quicker fire. Restored after.
  await page.evaluate(n => { window.__pv.restart(); window.__setTune({ ENEMY_DMG_MULT: 0, FIRE_INTERVAL: 0.25 }); if (n) window.__setTune({ CARDS_OFFERED: n }); }, sess.cards || 0);
  const r0 = await page.evaluate(() => window.__snap());
  let steps = 0;
  while (steps < 60 * 120) { const n = await page.evaluate(() => window.__clearRoom(300)); steps += n; const ph = await page.evaluate(() => window.__pv.S.phase); if (ph !== 'play') break; if (n === 0) break; }
  const r1 = await page.evaluate(() => window.__snap());
  ok(r1.phase === 'clear' && r1.door === true, 'room clear opens the door', `${r0.roomId} stage ${r0.stage}: phase ${r1.phase}, door.open=${r1.door}, kills ${r1.kills}, enemies left ${r1.enemies}, ${steps} steps, hp ${r1.hp}/${r1.maxHp}`);
  await sleep(150); await snapshot(page, 'clear');
  if (r1.phase === 'clear') {
    steps = 0;
    while (steps < 1800) { const n = await page.evaluate(() => window.__toDoor(200)); steps += n; const s = await page.evaluate(() => window.__snap()); if (s.roomId !== r1.roomId || s.stage !== r1.stage || s.phase !== 'clear') break; if (n === 0) break; }
    const r2 = await page.evaluate(() => window.__snap());
    ok(r2.roomId !== r1.roomId && r2.stage === r1.stage + 1, 'walking north through the door loads the next room', `${r1.roomId} st${r1.stage} -> ${r2.roomId} st${r2.stage} phase ${r2.phase} after ${steps} steps; hero (${r2.x.toFixed(2)},${r2.y.toFixed(2)})`);
    ok(r2.roomId === 'R02', 'room order R01 -> R02', r2.roomId);
  }
  // Clear R02 to reach a pending level-up -> card screen.
  steps = 0;
  let s = await page.evaluate(() => window.__snap());
  while (steps < 60 * 150 && s.phase === 'play') { const n = await page.evaluate(() => window.__clearRoom(300)); steps += n; s = await page.evaluate(() => window.__snap()); if (n === 0) break; }
  // If the room cleared but no pick yet, give the sim a few idle steps (pickups / transition).
  if (s.phase === 'clear') { await page.evaluate(() => window.__pv.step(120, { mx: 0, my: 0 })); s = await page.evaluate(() => window.__snap()); }
  const want = await page.evaluate(() => window.__pv.tune.CARDS_OFFERED);
  if (s.phase !== 'pick') {
    row('card screen at stage clear with a level-up pending', 'FAIL', `phase ${s.phase} room ${s.roomId} st${s.stage} level ${s.level} xp ${s.xp}/${s.xpNext} kills ${s.kills} (expected 'pick' after R02: 12+20 XP >= 25)`);
  } else {
    await sleep(400); await snapshot(page, 'cards');
    const vis = await page.evaluate(() => {
      const S = window.__pv.S, C = window.V.CARDS, offered = S.cards.map(i => C[i].name);
      const els = window.__textEls();
      const find = name => { let e = els.find(x => x.textContent.trim() === name) || els.find(x => x.textContent.trim().includes(name)); if (!e) return null; const c = e.closest('button,[role=button],[data-card],[data-i],[data-idx],.card') || e; const r = c.getBoundingClientRect(); return { el: c, d: window.__desc(c), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) }; };
      const found = offered.map(find);
      const others = C.map(c => c.name).filter(n => !offered.includes(n)).filter(n => els.some(x => x.textContent.trim() === n));
      const uniq = new Set(found.filter(Boolean).map(f => f.el)).size;
      return { offered, n: S.cards.length, uniq, found: found.map(f => f && { d: f.d, cx: f.cx, cy: f.cy, w: f.w, h: f.h }), others };
    });
    ok(vis.n === want && vis.uniq === want && vis.others.length === 0, `card screen shows TUNE.CARDS_OFFERED (${want}) cards`, `S.cards ${vis.n}, visible distinct cards ${vis.uniq}: ${vis.offered.join(' | ')}` + (vis.others.length ? '; non-offered names visible: ' + vis.others.join(',') : ''));
    await hudRow(page, 'card screen');
    targetsRow('card screen', await page.evaluate(() => window.__targets()));
    if (vis.found[0]) {
      const b = await page.evaluate(() => window.__snap());
      await page.touchscreen.tap(vis.found[0].cx, vis.found[0].cy);
      await sleep(400);
      const a = await page.evaluate(() => window.__snap());
      ok(a.phase !== 'pick' || a.picks > b.picks, 'tapping a card applies it', `phase ${b.phase} -> ${a.phase}; picks ${b.picks} -> ${a.picks}; mods ${b.mods} -> ${a.mods}; level ${a.level}`);
      ok(a.mods !== b.mods, 'picked card changes hero.mods', `${vis.offered[0]}: ${b.mods} -> ${a.mods}`);
      // A second pending level would show another card screen; resolve it with a tap too.
      for (let k = 0; k < 3; k++) { const p2 = await page.evaluate(() => window.__pv.S.phase); if (p2 !== 'pick') break; await page.evaluate(() => window.__pv.pick(0)); await sleep(200); }
    } else row('tapping a card applies it', 'FAIL', 'offered card element not found in DOM');
  }
  await page.evaluate(() => window.__resetTune());
}

async function deathTest(page, w, h) {
  await page.evaluate(() => { window.__pv.restart(); window.__setTune({ ENEMY_DMG_MULT: 40 }); });
  let s = await page.evaluate(() => window.__snap()), steps = 0;
  while (s.phase !== 'dead' && steps < 60 * 180) { await page.evaluate(() => { for (let i = 0; i < 300 && window.__pv.S.phase !== 'dead'; i++) { if (window.__pv.S.phase === 'pick') window.__pv.pick(0); window.__pv.step(1, { mx: 0, my: 0 }); } }); steps += 300; s = await page.evaluate(() => window.__snap()); }
  await page.evaluate(() => window.__resetTune());
  if (s.phase !== 'dead') { row('death screen', 'FAIL', `idle hero with ENEMY_DMG_MULT 40 not dead after ${steps} steps: hp ${s.hp}, phase ${s.phase}`); return; }
  await sleep(500); await snapshot(page, 'death');
  const txt = await page.evaluate(() => window.__findText(/restart|again|retry|redeploy|tap|down|kia|lost|fallen|defeat|game over/i));
  ok(txt.length > 0, 'death screen shown', txt.map(t => `"${t.txt}"`).slice(0, 4).join(' ') || 'no visible death/restart text');
  await hudRow(page, 'death screen');
  targetsRow('death screen', await page.evaluate(() => window.__targets()));
  const b = await findBtn(page, /restart|again|retry|redeploy|tap|run/);
  const seedDead = s.seed;
  if (b.length) await page.touchscreen.tap(b[0].cx, b[0].cy); else await page.touchscreen.tap(w / 2, h / 2);
  await sleep(500);
  const a = await page.evaluate(() => window.__snap());
  ok(a.phase === 'play' && a.stage === 1 && a.hp === a.maxHp && a.seed !== seedDead, 'one tap restarts the run', `tapped ${b.length ? b[0].d + ' "' + b[0].txt + '"' : 'screen centre'}: phase ${a.phase}, stage ${a.stage}, hp ${a.hp}/${a.maxHp}, seed ${seedDead} -> ${a.seed}`);
}

// ---------- main ----------
(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  const dets = [];
  for (const target of TARGETS) {
    if (!fs.existsSync(target.file)) { curTag = target.name; row('target file exists', 'SKIP', target.file + ' not found'); continue; }
    for (const sess of SESSIONS) {
      try { const r = await session(browser, target, sess); if (r && r.det) dets.push({ tag: curTag, ...r.det }); }
      catch (e) { row('session crashed', 'FAIL', e.message.split('\n')[0]); }
    }
  }
  await browser.close();
  curTag = 'cross-session';
  if (dets.length > 1) {
    const bySeed = {};
    for (const d of dets) (bySeed[d.seed] = bySeed[d.seed] || []).push(d);
    for (const [sd, ds] of Object.entries(bySeed)) {
      const pv = new Set(ds.map(d => d.pv)), sim = new Set(ds.map(d => d.sim));
      ok(pv.size === 1, `same ?seed gives the same run across page loads (__pv.restart + 600 steps, seed ${sd})`, ds.map(d => `${d.tag}: ${d.pv}`).join('; '));
      ok(sim.size === 1, `pure sim hash equal across page loads (seed ${sd})`, [...sim].join(' vs '));
      ok(ds.every(d => d.pv === d.sim), `__pv run equals pure V.Sim run (seed ${sd})`, ds.map(d => `${d.pv}/${d.sim}`).slice(0, 2).join('; '));
    }
  }
  // Results file.
  const mt = f => { try { return fs.statSync(f).mtime.toISOString(); } catch (e) { return 'missing'; } };
  const files = ['game.html', 'parts/main.js', 'parts/input.js', 'parts/ui.js', 'parts/sim.js', 'parts/render.js', 'parts/gpu.js', '../index.html'].map(f => `  ${f}: ${mt(path.join(SRC, f))}`);
  const cnt = s => rows.filter(r => r.status === s).length;
  const lines = [
    `Project Volley P0 E2E results`,
    `Date: ${new Date().toISOString()}  (suite src/e2e.js, ${((Date.now() - t0) / 1000).toFixed(0)} s)`,
    `Chromium headless, flags ${GPU_ARGS.join(' ')}; contexts hasTouch+isMobile, dpr 1; touch via CDP Input.dispatchTouchEvent; url ?seed=${SEED} (+&gpu=0)`,
    `Files under test (mtime):`, ...files,
    `Totals: PASS ${cnt('PASS')}  FAIL ${cnt('FAIL')}  SKIP ${cnt('SKIP')}  INFO ${cnt('INFO')}`,
    '',
    ...rows.map(r => `${r.status.padEnd(4)} | ${r.tag} | ${r.test} | ${r.detail}`),
    '',
    `Screenshots: ${SHOTS}`,
  ];
  fs.writeFileSync(OUT_TXT, lines.join('\n') + '\n');
  console.log(`\nPASS ${cnt('PASS')} FAIL ${cnt('FAIL')} SKIP ${cnt('SKIP')} -> ${OUT_TXT}`);
  process.exit(cnt('FAIL') ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
