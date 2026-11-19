// Burn Window game loop, input, state machine, DOM HUD. Browser IIFE; uses BW.sim, BW.gen, BW.render, BW.audio, BW.report.
(function () {
  'use strict';
  const BW = window.BW = window.BW || {};
  const S = BW.sim, C = S.C, SECTORS = 8, RESULT_LOCK = 1000;
  const now = () => (window.performance && performance.now) ? performance.now() : Date.now();
  const A = () => BW.audio || {};
  const ac = (f, a, b) => { try { const o = BW.audio; if (o && o[f]) o[f](a, b); } catch (e) {} };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  // ---- seed ----
  function dailySeed() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function hasSeedParam() { try { return /[?&]seed=(-?\d+)/.test(location.search); } catch (e) { return false; } }
  function skipTitle() { try { return /[?&]skip=1/.test(location.search) || (hasSeedParam() && !/[?&]menu=1/.test(location.search)); } catch (e) { return false; } }
  function parseSeed() { try { const m = /[?&]seed=(-?\d+)/.exec(location.search); if (m) return parseInt(m[1], 10) | 0; } catch (e) {} return dailySeed(); }

  // ---- state ----
  let seed = parseSeed(), idx = 0, sector = null, st = null, phase = 'plot', phaseT = now();
  let fuelStart = 45, leftover = 0, warpOn = false, warpEff = 1, thr = 1, msg = null;
  let events = [], lastB = 0, lastT = 100, burnStart = null, ghostLine = null, pred = null;
  let ghostSt = null, ghostInp = null, bestRec = null;
  let attempts = [], inputLog = [], attemptNo = 0, stranded = false, plotMsg = 'Plotting course...';
  let physicsSteps = 0, bootT = now(), genToken = 0, frameN = 0, drawErrs = 0;
  let tapPending = false, predN = -1, nextShown = null, nextOp = null, nextTxt = null;
  let lowFuelDone = false;
  // near-miss / closest-approach tracking (display + saves only; never feeds the sim)
  const NEAR_MISS_PX = 40, CLOSE_TAG_MS = 1000;
  let closest = 1e9, nearMisses = 0, bodyMin = [], bodyDone = [], closeUntil = 0, closeX = 0, closeY = 0;
  let acc = 0, last = 0, pointers = new Map(), fpsBuf = [], det = { ok: null, checksum: null }, energyDrift = null;
  const cache = {};
  const UI = BW.ui || { settings: { reduced: false, haptics: true, drag: true, warp: true }, host: {}, blocking: () => false, open: () => false, show: () => {}, closeAll: () => {}, sectorHide: () => {}, sector: () => {}, set: () => {}, is: () => false };
  const sysReduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let reduced = sysReduced || !!UI.settings.reduced, autoLaunch = false;
  let muted = lsGet('bw_mute') === '1';

  // ---- fx (feel + juice; render reads G.fx, never touches sim) ----
  const fx = { shake: { x: 0, y: 0 }, parts: [], flash: 0, trail: [], burnPulse: 0 };
  const fxRng = S.mulberry32(0x5eed1e);
  let crashAmp = 0, tapUntil = 0;
  const PART_CAP = 160, TRAIL_MAX = 60;
  function fxSpawn(kind, x, y, vx, vy, max, size) {
    if (reduced) return;
    if (fx.parts.length >= PART_CAP) fx.parts.shift();
    fx.parts.push({ x: x, y: y, vx: vx, vy: vy, life: max, max: max, kind: kind, size: size });
  }
  function fxBurst(kind, x, y, n, speed, max, size) {
    for (let i = 0; i < n; i++) {
      const a = fxRng() * 6.2832, s = speed * (0.35 + fxRng() * 0.65);
      fxSpawn(kind, x, y, Math.cos(a) * s, Math.sin(a) * s, max * (0.6 + fxRng() * 0.4), size * (0.7 + fxRng() * 0.6));
    }
  }
  function fxReset() { fx.parts.length = 0; fx.trail.length = 0; fx.flash = 0; fx.burnPulse = 0; crashAmp = 0; fx.shake.x = 0; fx.shake.y = 0; }
  function fxUpdate(dt) {
    if (reduced) { fx.shake.x = fx.shake.y = 0; fx.parts.length = 0; fx.flash = 0; return; }
    const burning = !!(st && phase === 'run' && st.active);
    fx.burnPulse = burning ? Math.min(1, fx.burnPulse + dt * 8) : Math.max(0, fx.burnPulse - dt * 5);
    if (burning) {
      const hx = st.hx || 0, hy = st.hy || -1, th = thr || 1;
      let n = Math.round(th * 2 + fxRng());
      while (n-- > 0) {
        const sp = 40 + fxRng() * 50 * th, j = (fxRng() - 0.5) * 0.5;
        const c = Math.cos(j), s = Math.sin(j), dx = -hx * c + hy * s, dy = -hy * c - hx * s;
        fxSpawn('flame', st.x + dx * 6, st.y + dy * 6, dx * sp + (st.vx || 0) * 0.3, dy * sp + (st.vy || 0) * 0.3, 0.25 + fxRng() * 0.2, (1.4 + fxRng() * 1.4) * (0.6 + 0.4 * th));
      }
    }
    for (let i = fx.parts.length - 1; i >= 0; i--) {
      const p = fx.parts[i];
      p.life -= dt;
      if (p.life <= 0) { fx.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const d = p.kind === 'dust' ? 0.9 : 0.96; p.vx *= d; p.vy *= d;
    }
    fx.flash = Math.max(0, fx.flash - dt * 2.5);
    crashAmp = Math.max(0, crashAmp - dt * 24);
    const amp = Math.max(crashAmp, burning && thr >= 1 ? 1 : 0);
    fx.shake.x = amp ? (fxRng() * 2 - 1) * amp : 0; fx.shake.y = amp ? (fxRng() * 2 - 1) * amp : 0;
  }
  function vib(ms) { if (reduced || !UI.settings.haptics) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  // ---- DOM ----
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;display:block;touch-action:none;background:#0a1214';
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:0;top:0;right:0;height:56px;pointer-events:none;z-index:5;font:600 14px system-ui,sans-serif';
  document.body.style.cssText += ';margin:0;overflow:hidden;background:#0a1214;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none';
  document.body.appendChild(canvas); document.body.appendChild(hud);
  function mkBtn(label, css, fn, parent) {
    const b = document.createElement('button');
    b.setAttribute('data-bw', '1'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'position:absolute;pointer-events:auto;min-height:56px;min-width:56px;box-sizing:border-box;border:1px solid #c9a24a;border-radius:8px;background:#102024;color:#e8d9a8;font:600 14px system-ui,sans-serif;touch-action:manipulation;cursor:pointer;padding:0 6px;' + css;
    b.addEventListener('pointerdown', () => { b._d = now(); });
    b.addEventListener('click', e => { e.stopPropagation(); fn(b, e); });
    (parent || hud).appendChild(b); return b;
  }
  const bPause = mkBtn('', 'left:12px;top:env(safe-area-inset-top,0px);width:56px;height:56px;padding:0', () => { ac('tick'); openPause(); });
  bPause.setAttribute('aria-label', 'Pause');
  bPause.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="4" y="3" width="5" height="16" rx="1" fill="#e8d9a8"/><rect x="13" y="3" width="5" height="16" rx="1" fill="#e8d9a8"/></svg>';
  const bWarp = mkBtn('x1', 'right:12px;top:env(safe-area-inset-top,0px);width:56px;height:56px;padding:0;color:#3fb8a8;font-size:16px', b => { ac('tick'); setWarp(!warpOn); });
  bWarp.setAttribute('aria-label', 'Warp');
  const pips = document.createElement('div');
  pips.style.cssText = 'position:absolute;left:80px;right:80px;top:env(safe-area-inset-top,0px);height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;pointer-events:none';
  const pipLbl = document.createElement('div'); pipLbl.style.cssText = 'font:700 13px system-ui,sans-serif;color:#c9a24a;letter-spacing:.08em';
  const pipRow = document.createElement('div'); pipRow.style.cssText = 'display:flex;gap:6px';
  pips.appendChild(pipLbl); pips.appendChild(pipRow); hud.appendChild(pips);
  let pipKey = '';
  function updPips() {
    const k = idx + ':' + SECTORS; if (k === pipKey) return; pipKey = k;
    pipLbl.textContent = 'SECTOR ' + (idx + 1) + ' / ' + SECTORS; pipRow.textContent = '';
    for (let i = 0; i < SECTORS; i++) { const d = document.createElement('span'); d.style.cssText = 'width:12px;height:12px;border-radius:50%;box-sizing:border-box;border:1.5px solid ' + (i < idx ? '#3fb8a8;background:#3fb8a8' : i === idx ? '#c9a24a;background:#c9a24a' : 'rgba(201,162,74,.35)'); pipRow.appendChild(d); }
  }
  updPips();
  const devBadge = document.createElement('div'); devBadge.setAttribute('data-bw', 'dev'); devBadge.textContent = 'DEV';
  devBadge.style.cssText = 'position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 60px);pointer-events:none;display:none;padding:2px 6px;border:1px solid #d9694f;border-radius:4px;background:rgba(16,32,36,.85);color:#d9694f;font:700 12px system-ui,sans-serif;letter-spacing:.08em';
  hud.appendChild(devBadge);
  function updDev() { let n = 0; try { n = Object.keys(BW.tweak.diff()).length; } catch (e) {} devBadge.style.display = n ? 'block' : 'none'; }
  if (BW.tweak) BW.tweak.onChange = updDev;
  updDev();
  const bNext = mkBtn('Next sector', 'position:fixed;right:22px;bottom:22px;width:150px;height:56px;display:none;z-index:40;background:#3fb8a8;color:#0a1214;border-color:#3fb8a8;font-size:18px', onNext, document.body);
  bNext.style.position = 'fixed'; bNext.style.pointerEvents = 'auto';
  ac('mute', muted);

  function setWarp(on) { warpOn = !!on && !!UI.settings.warp; bWarp.textContent = 'x' + (warpOn ? 3 : 1); }
  function applyWarpVis() { bWarp.style.display = UI.settings.warp ? 'block' : 'none'; if (!UI.settings.warp) setWarp(false); }
  applyWarpVis();
  function openPause() { if (UI.open() || !sector || !st || (phase !== 'run' && phase !== 'intro')) return; releaseAll(); UI.show('pause'); }
  function pressOk(b, e) {
    b = b || {}; return now() - phaseT >= RESULT_LOCK && ((e && e.detail === 0) || b._d >= phaseT + RESULT_LOCK); }

  // ---- view ----
  const ctx = canvas.getContext('2d');
  let V = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 56 };
  function safeTop() {
    try {
      const p = document.createElement('div');
      p.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;height:0;padding-top:env(safe-area-inset-top,0px)';
      document.body.appendChild(p);
      const v = parseFloat(getComputedStyle(p).paddingTop) || 0;
      document.body.removeChild(p); return v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2), inset = safeTop();
    let L = null;
    try { if (BW.render && BW.render.layout) L = BW.render.layout(w, h, inset); } catch (e) {}
    if (!L || !L.scale) { const sc = Math.max(0.8, Math.min(1.5, Math.min(w / C.W, (h - 56 - inset - 96) / C.H))); L = { scale: sc, ox: (w - C.W * sc) / 2, oy: 56 + inset }; }
    V = Object.assign({}, L, { w: w, h: h, dpr: dpr });
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  }
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);

  // ---- sector flow ----
  function prepare(i, cb) {
    const key = seed + ':' + i;
    if (cache[key]) return cb(cache[key]);
    setTimeout(function () {
      if (cache[key]) return cb(cache[key]);
      let sec = null;
      for (let k = 0; k < 6 && !sec; k++) { try { sec = BW.gen.generateSector(seed + 1000 * k, i); } catch (e) { sec = null; } }
      if (sec) cache[key] = sec;
      cb(sec);
    }, 40);
  }
  function loadSector(i) {
    UI.sectorHide(); idx = i; sector = null; st = null; phase = 'plot'; phaseT = now(); msg = null; ghostLine = null; pred = null; ghostSt = null; setWarp(false); warpEff = 1;
    plotMsg = 'Plotting course...'; attemptNo = 0;
    const tok = ++genToken;
    prepare(i, function (sec) {
      if (tok !== genToken) return;
      if (!sec) { plotMsg = 'Course plot failed. Tap Retry.'; return; }
      sector = sec; fuelStart = Math.min(75, Math.max(14, 2.2 * sec.par.fuel) + 0.4 * leftover); /* admin default: fuel tight = 2.2x par (min 14) + 40% carry-over */
      resetAttempt(true);
    });
  }
  function resetAttempt(intro) {
    st = S.newState(sector, fuelStart); acc = 0; events = []; lastB = 0; lastT = 100; burnStart = null; ghostLine = null;
    stranded = false; thr = 1; msg = null; pointers.clear(); tapPending = false; predN = -1;
    let b = null; try { b = BW.report && BW.report.loadBest ? BW.report.loadBest(seed, idx) : null; } catch (e) {}
    bestRec = b && b.events && ghostOn(idx) ? b : null;
    ghostSt = bestRec ? S.newState(sector, typeof bestRec.fuelStart === 'number' ? bestRec.fuelStart : fuelStart) : null; ghostInp = bestRec ? S.inputFromEvents(bestRec.events) : null;
    UI.sectorHide(); if (intro && autoLaunch) { intro = false; autoLaunch = false; }
    phase = intro ? 'intro' : 'run'; phaseT = now();
    pred = S.predict(st, sector, { seconds: 3 });
    fxReset(); lowFuelDone = false;
    closest = 1e9; nearMisses = 0; bodyMin = []; bodyDone = []; closeUntil = 0;
    if (!intro) for (let i = 0; i < 14; i++) { const a = fxRng() * 6.2832; fxSpawn('dust', st.x + Math.cos(a) * 12, st.y + Math.sin(a) * 12, Math.cos(a) * 28, Math.sin(a) * 28, 0.5 + fxRng() * 0.3, 1.5 + fxRng()); }
  }
  function ghostOn(i) { return lsGet('bw:ghost2:' + seed + ':' + i) !== '0'; }
  function newRun() { UI.sectorHide(); attempts = []; inputLog = []; leftover = 0; genToken++; loadSector(0); }
  function retry() {
    if (phase === 'end') { if (now() - phaseT < RESULT_LOCK) return; return newRun(); }
    if (!sector) { loadSector(idx); return; }
    if (st && st.n > 0 && phase === 'run') logAttempt('retry');
    resetAttempt(false);
  }
  function launch() { if (phase === 'intro') { phase = 'run'; phaseT = now(); } }
  function titleLaunch() { if (phase === 'intro') launch(); else if (phase === 'plot') autoLaunch = true; }
  function quitToTitle() { releaseAll(); autoLaunch = false; newRun(); UI.show('title'); }
  function onNext(b, e) {
    if (!pressOk(b, e)) return;
    ac('tick');
    if (phase === 'docked') { if (idx + 1 >= SECTORS) finishRun(); else loadSector(idx + 1); }
    else if (phase === 'end') { UI.closeAll(); newRun(); }
  }
  function logAttempt(result) {
    attemptNo++;
    attempts.push({ sector: idx, attempt: attemptNo, result: result, fuelUsed: +st.fuelUsed.toFixed(3), par: sector.par ? +sector.par.fuel.toFixed(3) : null, steps: st.n, checksum: S.checksum(st), burns: events.filter((e, i, a) => e[1] && !(i && a[i - 1][1])).length });
    inputLog.push({ sector: idx, attempt: attemptNo, events: events.slice() });
  }
  function efficiency() {
    let par = 0, used = 0; const best = {};
    for (const a of attempts) if (a.result === 'docked' && (!best[a.sector] || a.fuelUsed < best[a.sector].fuelUsed)) best[a.sector] = a;
    for (const k in best) { par += best[k].par || 0; used += best[k].fuelUsed; }
    return used > 0 ? par / used : 0;
  }
  function medal() {
    const docked = new Set(attempts.filter(a => a.result === 'docked').map(a => a.sector)).size;
    if (docked < SECTORS) return 'none';
    const e = efficiency(); return e >= 0.75 ? 'Gold' : e >= 0.55 ? 'Silver' : 'Bronze';
  }
  function finishRun() { UI.sectorHide(); phase = 'end'; phaseT = now(); pointers.clear(); msg = 'Run complete: ' + medal() + ' | efficiency ' + Math.round(efficiency() * 100) + '%';
    const m = medal(), lvl = m === 'Gold' ? 3 : m === 'Silver' ? 2 : m === 'Bronze' ? 1 : 0; if (lvl) ac('medal', lvl); UI.show('runend'); }
  // closest approach to the gate this attempt (sim px) + saved best (min across attempts); saves guarded for M1 availability
  function closestInfo() {
    const rp = BW.report || {}, c = closest < 1e8 ? +closest.toFixed(1) : null;
    let best = c;
    try {
      if (typeof rp.loadClosest === 'function') { const o = rp.loadClosest(seed, idx); if (typeof o === 'number' && isFinite(o) && (best === null || o < best)) best = o; }
      if (c !== null && typeof rp.saveClosest === 'function') rp.saveClosest(seed, idx, c);
    } catch (e) {}
    return { closest: c, bestClosest: best };
  }
  function trackApproach() {
    const t = st.n * C.DT, g = sector.gate;
    if (g) { const d = Math.hypot(st.x - g.x, st.y - g.y); if (d < closest) closest = d; }
    if (Math.hypot(st.vx || 0, st.vy || 0) < 5) return;
    for (let i = 0; i < sector.bodies.length; i++) {
      const b = sector.bodies[i]; if (b.dark || bodyDone[i]) continue;
      const d = Math.hypot(st.x - S.bodyX(b, t), st.y - S.bodyY(b, t)) - b.r, m = bodyMin[i];
      if (m === undefined || d < m) bodyMin[i] = d;
      else if (d > m + 0.5 && m > 0 && m < NEAR_MISS_PX) { /* periapsis passed inside the band */
        bodyDone[i] = true; nearMisses++; closeUntil = now() + CLOSE_TAG_MS; closeX = st.x; closeY = st.y;
        if (!reduced) fxBurst('spark', st.x, st.y, 6, 60, 0.4, 1.2);
      }
    }
  }
  function endAttempt(result) {
    if (phase !== 'run') return;
    logAttempt(result); pointers.clear(); setBurn(false);
    phaseT = now();
    if (result === 'docked') {
      phase = 'docked'; leftover = st.fuel; ac('dock');
      fx.flash = 1; fxBurst('dock', sector.gate.x, sector.gate.y, 36, 90, 0.8, 2); fxBurst('spark', sector.gate.x, sector.gate.y, 20, 140, 0.5, 1.4); vib(12);
      msg = 'Docked | fuel used ' + st.fuelUsed.toFixed(1) + ' / par ' + (sector.par ? sector.par.fuel : 0).toFixed(1);
      let isBest = false;
      try {
        const old = BW.report && BW.report.loadBest ? BW.report.loadBest(seed, idx) : null;
        if (BW.report && BW.report.saveBest && (!old || st.fuelUsed < old.fuel)) { BW.report.saveBest(seed, idx, st.fuelUsed, events.slice(), fuelStart); isBest = true; lsSet('bw:par2:' + seed + ':' + idx, String(sector.par ? sector.par.fuel : 0)); }
      } catch (e) {}
      const parF = sector.par ? sector.par.fuel : 0;
      const rp = BW.report || {}, stars = (typeof rp.starsFor === 'function') ? rp.starsFor(parF, st.fuelUsed) : 0;
      let bestStars = stars;
      try {
        if (typeof rp.loadStars === 'function') { const o = rp.loadStars(seed, idx); if (typeof o === 'number' && o > bestStars) bestStars = o; }
        if (typeof rp.saveStars === 'function') rp.saveStars(seed, idx, stars);
      } catch (e) {}
      const cl = closestInfo();
      UI.sector('docked', { used: st.fuelUsed, par: parF, eff: st.fuelUsed > 0 ? parF / st.fuelUsed : 0, best: isBest,
        stars: stars, parRatio: parF > 0 ? st.fuelUsed / parF : 0, bestStars: bestStars, closest: cl.closest, bestClosest: cl.bestClosest, nearMisses: nearMisses });
      if (idx + 1 < SECTORS) setTimeout(function () { prepare(idx + 1, function () {}); }, 300);
    } else {
      phase = 'failed'; ac('crash');
      if (!reduced) { crashAmp = 6; fxBurst('crash', st.x, st.y, 40, 110, 0.9, 2.2); vib(30); }
      msg = ({ crashed: 'Crashed', lost: 'Lost in space', stranded: 'Stranded: out of fuel', timeout: 'Out of time' }[result] || 'Failed');
      const FT = { crashed: ['CRASHED', 'Hit a body at speed.'], lost: ['LOST', 'Drifted past the chart edge.'], stranded: ['STRANDED', 'Fuel empty before the gate.'], timeout: ['OUT OF TIME', 'The 90 s window closed.'] }[result] || ['FAILED', 'Mission failed.'];
      const cl = closestInfo();
      UI.sector('failed', { title: FT[0], text: FT[1], place: 'bottom', closest: cl.closest, bestClosest: cl.bestClosest, nearMisses: nearMisses });
    }
  }

  // ---- input ----
  function curInput() {
    let b = pointers.size > 0 || tapPending || now() < tapUntil, t = 1; /* tap-to-burn: min ~90 ms feel */
    if (pointers.size > 0 && UI.settings.drag) { let first = null; pointers.forEach(p => { if (!first) first = p; }); const dy = Math.abs(first.y - first.y0); t = Math.max(0.25, Math.min(1, 1 - Math.max(0, dy - 12) / 120)); }
    return { burn: b, throttle: t };
  }
  function onDown(e) {
    ac('init');
    if (UI.blocking() || UI.is('runend')) return;
    if (e.target && e.target.closest && e.target.closest('[data-bw]')) return;
    e.preventDefault && e.preventDefault();
    if (phase === 'intro') { launch(); return; }
    else if (phase === 'failed') { if (now() - phaseT >= RESULT_LOCK) retry(); return; }
    else if (phase !== 'run') return;
    tapPending = true; tapUntil = now() + 90;
    pointers.set(e.pointerId, { y: e.clientY, y0: e.clientY });
    try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function onMove(e) { const p = pointers.get(e.pointerId); if (p) p.y = e.clientY; }
  function onUp(e) { pointers.delete(e.pointerId); }
  window.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', () => ac('init'), true);
  window.addEventListener('pointerdown', () => ac('init'), true);
  window.addEventListener('contextmenu', e => e.preventDefault());
  function releaseAll() { pointers.clear(); tapPending = false; tapUntil = 0; acc = 0; last = 0; }
  document.addEventListener('visibilitychange', () => { releaseAll(); if (document.hidden) { ac('suspend'); if (!navigator.webdriver) openPause(); } else ac('resume'); });
  window.addEventListener('blur', releaseAll);

  // ---- simulation ----
  let burnAudio = false;
  function stepOnce() {
    const ci = curInput(), b = ci.burn ? 1 : 0, tp = Math.round(ci.throttle * 20) * 5;
    if (b !== lastB || (b && tp !== lastT)) {
      events.push([st.n, b, tp]);
      if (b && !lastB) { burnStart = Object.assign({}, st); ghostLine = null; }
      if (!b && lastB && burnStart) { try { ghostLine = S.predict(burnStart, sector, { seconds: 3 }).pts; } catch (e) {} }
      lastB = b; lastT = tp; ac('burn', !!b, tp / 100);
    }
    thr = tp / 100;
    const status = S.step(st, sector, { burn: !!b, throttle: tp / 100 });
    physicsSteps++; tapPending = false;
    try { trackApproach(); } catch (e) {}
    if (!lowFuelDone && st.fuel < 0.2 * fuelStart) { lowFuelDone = true; ac('low_fuel'); }
    if (!reduced && st.n % 3 === 0) { fx.trail.push({ x: st.x, y: st.y, a: 1 }); if (fx.trail.length > TRAIL_MAX) fx.trail.shift(); for (let i = 0; i < fx.trail.length; i++) fx.trail[i].a = (i + 1) / fx.trail.length; }
    if (ghostSt && ghostSt.status === 'flying') S.step(ghostSt, sector, ghostInp(ghostSt.n));
    if (status !== 'flying') return endAttempt(status);
    if (st.n * C.DT > 90) return endAttempt('timeout');
    if (st.fuel <= 0 && !stranded && !st.tickLeft) {
      stranded = true;
      const p = S.predict(st, sector, { seconds: 25, includeDark: true });
      if (p.end === 'crashed' || p.end === 'lost') return endAttempt('stranded');
    }
  }
  function setBurn(on) { if (!on && lastB && st) { events.push([st.n, 0, lastT]); lastB = 0; ac('burn', false, 1); } }
  function nearBody() {
    const t = st.n * C.DT;
    for (const b of sector.bodies) { if (b.dark) continue; if (Math.hypot(st.x - S.bodyX(b, t), st.y - S.bodyY(b, t)) - b.r < 45) return true; }
    return false;
  }

  function nearness() {
    const t = st.n * C.DT; let m = 1e9;
    for (const b of sector.bodies) { if (b.dark) continue; m = Math.min(m, Math.hypot(st.x - S.bodyX(b, t), st.y - S.bodyY(b, t)) - b.r); }
    return Math.max(0, Math.min(1, (110 - m) / 65));
  }

  // ---- report ----
  function fpsStats() {
    if (!fpsBuf.length) return { avg: 0, p95ms: 0, gaps50: 0 };
    const s = fpsBuf.slice().sort((a, b) => a - b), sum = s.reduce((a, b) => a + b, 0);
    return { avg: +(1000 / (sum / s.length)).toFixed(1), p95ms: +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(1), gaps50: s.filter(x => x > 50).length };
  }
  function buildReport() {
    const info = {
      seed: seed, device: { w: V.w, h: V.h, dpr: V.dpr, ua: navigator.userAgent, reducedMotion: reduced }, fps: fpsStats(),
      determinism: det, attempts: attempts, inputLog: inputLog, ticks: { physicsSteps: physicsSteps, elapsedMs: Math.round(now() - bootT) },
      energyDrift: energyDrift, tweaks: (BW.tweak ? BW.tweak.diff() : {}), settings: { muted: muted, reducedOverride: !!UI.settings.reduced, haptics: !!UI.settings.haptics, drag: !!UI.settings.drag, warpButton: !!UI.settings.warp, warp: warpOn, sectors: SECTORS, medal: medal(), efficiency: +efficiency().toFixed(3) }
    };
    try { if (BW.report && BW.report.build) return BW.report.build(info); } catch (e) {}
    return Object.assign({ game: 'burn-window', version: 1, renderer: 'Canvas2D' }, info);
  }
  function copyReport(b) {
    const text = JSON.stringify(buildReport(), null, 1); window.__bwReportText = text;
    const old = b.textContent;
    const done = ok => { b.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { b.textContent = old; }, 1600); };
    try { if (BW.report && BW.report.copy) return BW.report.copy(text).then(done, () => done(false)); } catch (e) {}
    done(false);
  }

  // ---- frame ----
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) { acc = 0; last = ts; pointers.clear(); tapPending = false; tapUntil = 0; return; }
    if (!last) last = ts;
    const ms = ts - last; last = ts;
    if (ms > 0 && ms < 1000) { fpsBuf.push(ms); if (fpsBuf.length > 4000) fpsBuf.shift(); }
    const dt = Math.min(ms / 1000, 0.1);
    frameN++;
    if (UI.blocking()) { acc = 0; if (nextShown !== 'none') { nextShown = 'none'; bNext.style.display = 'none'; } draw(); return; }
    if (sector && st && phase === 'run') {
      if (warpOn && nearBody()) setWarp(false);
      warpEff = warpOn ? 3 : 1;
      const maxSteps = 8 * warpEff;
      acc += dt * warpEff;
      let n = 0;
      while (acc >= C.DT && n < maxSteps && phase === 'run') {
        if (warpEff > 1 && nearBody()) { setWarp(false); warpEff = 1; acc = 0; break; }
        stepOnce(); acc -= C.DT; n++;
      }
      if (acc > C.DT * 2) acc = 0;
      if (phase === 'run') ac('hum', Math.hypot(st.vx, st.vy), nearness());
    }
    if (sector && st && (phase === 'run' || phase === 'intro') && frameN % 3 === 0 && st.n !== predN) { predN = st.n; pred = S.predict(st, sector, { seconds: 3 }); }
    // DOM
    const showNext = phase === 'docked' || phase === 'end', ready = now() - phaseT >= RESULT_LOCK;
    updPips();
    if (phase === 'end') { bNext.style.left = '12px'; bNext.style.right = '12px'; bNext.style.width = 'auto'; bNext.style.bottom = '78px'; }
    else { bNext.style.left = 'auto'; bNext.style.right = '22px'; bNext.style.width = '150px'; bNext.style.bottom = '22px'; }
    const nd = showNext ? 'block' : 'none', no = '1', nt = phase === 'end' ? 'New run' : (idx + 1 >= SECTORS ? 'Finish' : 'Next sector');
    if (nd !== nextShown) { nextShown = nd; bNext.style.display = nd; }
    if (no !== nextOp) { nextOp = no; bNext.style.opacity = no; }
    if (nt !== nextTxt) { nextTxt = nt; bNext.textContent = nt; }
    fxUpdate(dt);
    draw();
  }
  function draw() {
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    if (!sector || !st) {
      ctx.fillStyle = '#0a1214'; ctx.fillRect(0, 0, V.w, V.h);
      ctx.fillStyle = '#c9a24a'; ctx.font = '600 20px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(plotMsg, V.w / 2, V.h / 2); return;
    }
    const G = {
      sector: sector, st: st, t: st.n * C.DT, pred: pred, ghostLine: ghostLine, ghost: ghostSt, phase: (phase === 'docked' || phase === 'failed' || phase === 'end') ? 'ui_' + phase : phase, warp: phase === 'run' ? warpEff : 1,
      throttle: thr, fuelMax: fuelStart, parFuel: sector.par ? sector.par.fuel : 0, msg: msg, reduced: reduced, sectorIndex: idx, sectorCount: SECTORS, fx: fx,
      closePass: phase === 'run' && now() < closeUntil ? { k: (closeUntil - now()) / CLOSE_TAG_MS, x: closeX, y: closeY } : null
    };
    ctx.save();
    try {
      ctx.clearRect(0, 0, V.w, V.h);
      if (!reduced && (fx.shake.x || fx.shake.y)) ctx.translate(fx.shake.x, fx.shake.y);
      if (BW.render && BW.render.draw) BW.render.draw(ctx, V, G);
    }
    catch (e) { if (drawErrs++ < 3 && window.console) console.error(e); }
    try { for (let i = 0; i < 40; i++) ctx.restore(); } catch (e) {}
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  }

  // ---- hooks + boot ----
  window.__bw = {
    get state() { return st; }, get sector() { return sector; }, get phase() { return phase; },
    report: buildReport, retry: function () { retry(); }, launch: function () { UI.closeAll(); launch(); },
    setSeed: function (n) { seed = n | 0; newRun(); },
    hold: function (on, t) { if (on) pointers.set('test', { y: 0, y0: t == null ? 0 : (1 - t) * 120 + 12 }); else pointers.delete('test'); },
    get events() { return events; }, get fx() { return fx; },
    skipTo: function (n) { n = Math.max(0, Math.min(SECTORS - 1, n | 0)); genToken++; loadSector(n); },
    finish: function () {
      genToken++; if (!sector) sector = { par: { fuel: 8 }, bodies: [], gate: { x: 170, y: 60 } };
      const fk = (sector.par && sector.par.fuel) || 8; attempts = [];
      for (let i = 0; i < SECTORS; i++) attempts.push({ sector: i, attempt: 1, result: 'docked', fuelUsed: +(fk * (1.1 + 0.05 * (i % 4))).toFixed(3), par: +fk.toFixed(3), steps: 600 + 20 * i, checksum: 0, burns: 2 + (i % 3) });
      idx = SECTORS - 1; if (!st) st = S.newState(sector, fuelStart || 20);
      finishRun();
    }
  };
  // ---- UI host wiring ----
  const H = UI.host;
  H.seed = () => seed; H.daily = dailySeed; H.isDaily = () => !hasSeedParam();
  H.launch = titleLaunch; H.quit = quitToTitle; H.tick = () => ac('tick');
  H.retry = (b, e) => { ac('tick'); retry(); }; H.pressOk = pressOk;
  H.copy = copyReport;
  H.reloadSector = () => { for (const k in cache) delete cache[k]; updDev(); if (phase === 'end') return; genToken++; loadSector(idx); };
  H.getMuted = () => muted;
  H.setMuted = m => { muted = !!m; lsSet('bw_mute', muted ? '1' : '0'); ac('mute', muted); };
  H.getWarp = () => warpOn; H.setWarp = on => { setWarp(on); };
  H.status = () => ({ sector: idx + 1, count: SECTORS, fuel: st ? Math.max(0, st.fuel) : 0, par: sector && sector.par ? sector.par.fuel : 0 });
  H.runSummary = () => {
    const best = {}; for (const a of attempts) if (a.result === 'docked' && (!best[a.sector] || a.fuelUsed < best[a.sector].fuelUsed)) best[a.sector] = a;
    const sf = (BW.report && BW.report.starsFor) || null;
    const rows = []; let totalStars = 0;
    for (let i = 0; i < SECTORS; i++) {
      let s = 0; if (best[i] && sf) { try { s = sf(best[i].par || 0, best[i].fuelUsed); } catch (e) { s = 1; } }
      totalStars += s;
      rows.push(best[i] ? { used: best[i].fuelUsed, par: best[i].par || 0, stars: s } : { used: null, par: 0, stars: 0 });
    }
    return { medal: medal() === 'none' ? 'Bronze' : medal(), eff: efficiency(), seed: seed, rows: rows, totalStars: totalStars, maxStars: SECTORS * 3 };
  };
  H.bestList = () => { const out = []; for (let i = 0; i < SECTORS; i++) { let b = null; try { b = BW.report.loadBest(seed, i); } catch (e) {} const p = parseFloat(lsGet('bw:par2:' + seed + ':' + i)); const c = cache[seed + ':' + i]; out.push({ i: i, fuel: b ? b.fuel : null, par: isFinite(p) ? p : (c && c.par ? c.par.fuel : null) }); } return out; };
  H.ghostOn = ghostOn;
  H.setGhost = (i, on) => { lsSet('bw:ghost2:' + seed + ':' + i, on ? '1' : '0'); };
  H.eraseSaves = () => { try { const del = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^bw:(best|ghost|par|stars|miss)2?:/.test(k)) del.push(k); } del.forEach(k => localStorage.removeItem(k)); } catch (e) {} bestRec = null; ghostSt = null; ghostInp = null; };
  H.onSettings = (k, v) => {
    if (k === 'reduced') { reduced = sysReduced || !!v; if (reduced) fxReset(); }
    if (k === 'warp') applyWarpVis();
  };
  H.onUi = () => { if (UI.blocking()) { releaseAll(); } };
  window.__bwSkipTitle = skipTitle;
  resize();
  try { if (BW.report && BW.report.selfCheck) { const r = BW.report.selfCheck(); det = { ok: !!r.ok, checksum: r.checksum }; energyDrift = r.energyDrift; } } catch (e) {}
  newRun();
  if (!skipTitle()) UI.show('title');
  requestAnimationFrame(frame);
})();
