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
  function parseSeed() { try { const m = /[?&]seed=(-?\d+)/.exec(location.search); if (m) return parseInt(m[1], 10) | 0; } catch (e) {} return dailySeed(); }

  // ---- state ----
  let seed = parseSeed(), idx = 0, sector = null, st = null, phase = 'plot', phaseT = now();
  let fuelStart = 45, leftover = 0, warpOn = false, warpEff = 1, thr = 1, msg = null;
  let events = [], lastB = 0, lastT = 100, burnStart = null, ghostLine = null, pred = null;
  let ghostSt = null, ghostInp = null, bestRec = null;
  let attempts = [], inputLog = [], attemptNo = 0, stranded = false, plotMsg = 'Plotting course...';
  let physicsSteps = 0, bootT = now(), genToken = 0, frameN = 0, drawErrs = 0;
  let tapPending = false, predN = -1, nextShown = null, nextOp = null, nextTxt = null;
  let acc = 0, last = 0, pointers = new Map(), fpsBuf = [], det = { ok: null, checksum: null }, energyDrift = null;
  const cache = {};
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let muted = lsGet('bw_mute') === '1';

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
  const bRetry = mkBtn('Retry', 'left:0;top:0;width:72px;height:56px', (b, e) => { if (phase === 'end' && !pressOk(b, e)) return; ac('tick'); retry(); });
  const bWarp = mkBtn('Warp x1', 'left:76px;top:0;width:76px;height:56px', b => { ac('tick'); setWarp(!warpOn); });
  const bMute = mkBtn(muted ? 'Muted' : 'Sound', 'left:156px;top:0;width:68px;height:56px', b => { muted = !muted; lsSet('bw_mute', muted ? '1' : '0'); ac('mute', muted); b.textContent = muted ? 'Muted' : 'Sound'; });
  const bCopy = mkBtn('Copy report', 'right:0;top:0;width:96px;height:56px', copyReport);
  const bNext = mkBtn('Next', 'position:fixed;left:50%;margin-left:-80px;bottom:20px;width:160px;height:56px;display:none;z-index:6;background:#3fb8a8;color:#0a1214;border-color:#3fb8a8;font-size:18px', onNext, document.body);
  bNext.style.position = 'fixed'; bNext.style.pointerEvents = 'auto';
  ac('mute', muted);

  function setWarp(on) { warpOn = on; bWarp.textContent = 'Warp x' + (on ? 3 : 1); }
  function pressOk(b, e) { return now() - phaseT >= RESULT_LOCK && ((e && e.detail === 0) || b._d >= phaseT + RESULT_LOCK); }

  // ---- view ----
  const ctx = canvas.getContext('2d');
  let V = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 56 };
  function resize() {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let L = null;
    try { if (BW.render && BW.render.layout) L = BW.render.layout(w, h); } catch (e) {}
    if (!L || !L.scale) { const sc = Math.max(0.8, Math.min(1.5, Math.min(w / C.W, (h - 56 - 96) / C.H))); L = { scale: sc, ox: (w - C.W * sc) / 2, oy: 56 }; }
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
    idx = i; sector = null; st = null; phase = 'plot'; phaseT = now(); msg = null; ghostLine = null; pred = null; ghostSt = null; setWarp(false); warpEff = 1;
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
    bestRec = b && b.events ? b : null;
    ghostSt = bestRec ? S.newState(sector, typeof bestRec.fuelStart === 'number' ? bestRec.fuelStart : fuelStart) : null; ghostInp = bestRec ? S.inputFromEvents(bestRec.events) : null;
    phase = intro ? 'intro' : 'run'; phaseT = now();
    pred = S.predict(st, sector, { seconds: 3 });
  }
  function newRun() { attempts = []; inputLog = []; leftover = 0; genToken++; loadSector(0); }
  function retry() {
    if (phase === 'end') { if (now() - phaseT < RESULT_LOCK) return; return newRun(); }
    if (!sector) { loadSector(idx); return; }
    if (st && st.n > 0 && phase === 'run') logAttempt('retry');
    resetAttempt(false);
  }
  function launch() { if (phase === 'intro') { phase = 'run'; phaseT = now(); } }
  function onNext(b, e) {
    if (!pressOk(b, e)) return;
    ac('tick');
    if (phase === 'docked') { if (idx + 1 >= SECTORS) finishRun(); else loadSector(idx + 1); }
    else if (phase === 'end') newRun();
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
  function finishRun() { phase = 'end'; phaseT = now(); pointers.clear(); msg = 'Run complete: ' + medal() + ' | efficiency ' + Math.round(efficiency() * 100) + '%'; }
  function endAttempt(result) {
    if (phase !== 'run') return;
    logAttempt(result); pointers.clear(); setBurn(false);
    phaseT = now();
    if (result === 'docked') {
      phase = 'docked'; leftover = st.fuel; ac('dock');
      msg = 'Docked | fuel used ' + st.fuelUsed.toFixed(1) + ' / par ' + (sector.par ? sector.par.fuel : 0).toFixed(1);
      try {
        const old = BW.report && BW.report.loadBest ? BW.report.loadBest(seed, idx) : null;
        if (BW.report && BW.report.saveBest && (!old || st.fuelUsed < old.fuel)) BW.report.saveBest(seed, idx, st.fuelUsed, events.slice(), fuelStart);
      } catch (e) {}
      if (idx + 1 < SECTORS) setTimeout(function () { prepare(idx + 1, function () {}); }, 300);
    } else {
      phase = 'failed'; ac('crash');
      msg = ({ crashed: 'Crashed', lost: 'Lost in space', stranded: 'Stranded: out of fuel', timeout: 'Out of time' }[result] || 'Failed');
    }
  }

  // ---- input ----
  function curInput() {
    let b = pointers.size > 0 || tapPending, t = 1;
    if (pointers.size > 0) { let first = null; pointers.forEach(p => { if (!first) first = p; }); const dy = Math.abs(first.y - first.y0); t = Math.max(0.25, Math.min(1, 1 - Math.max(0, dy - 12) / 120)); }
    return { burn: b, throttle: t };
  }
  function onDown(e) {
    ac('init');
    if (e.target && e.target.closest && e.target.closest('[data-bw]')) return;
    e.preventDefault && e.preventDefault();
    if (phase === 'intro') { launch(); return; }
    else if (phase === 'failed') { if (now() - phaseT >= RESULT_LOCK) retry(); return; }
    else if (phase !== 'run') return;
    tapPending = true;
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
  function releaseAll() { pointers.clear(); tapPending = false; acc = 0; last = 0; }
  document.addEventListener('visibilitychange', () => { releaseAll(); if (document.hidden) ac('suspend'); else ac('resume'); });
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
      energyDrift: energyDrift, settings: { muted: muted, warp: warpOn, sectors: SECTORS, medal: medal(), efficiency: +efficiency().toFixed(3) }
    };
    try { if (BW.report && BW.report.build) return BW.report.build(info); } catch (e) {}
    return Object.assign({ game: 'burn-window', version: 1, renderer: 'Canvas2D' }, info);
  }
  function copyReport(b) {
    const text = JSON.stringify(buildReport(), null, 1); window.__bwReportText = text;
    const done = ok => { b.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { b.textContent = 'Copy report'; }, 1600); };
    try { if (BW.report && BW.report.copy) return BW.report.copy(text).then(done, () => done(false)); } catch (e) {}
    done(false);
  }

  // ---- frame ----
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) { acc = 0; last = 0; return; }
    if (!last) last = ts;
    const ms = ts - last; last = ts;
    if (ms > 0 && ms < 1000) { fpsBuf.push(ms); if (fpsBuf.length > 4000) fpsBuf.shift(); }
    const dt = Math.min(ms / 1000, 0.1);
    frameN++;
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
      if (phase === 'run') ac('hum', Math.hypot(st.vx, st.vy));
    }
    if (sector && st && (phase === 'run' || phase === 'intro') && frameN % 3 === 0 && st.n !== predN) { predN = st.n; pred = S.predict(st, sector, { seconds: 3 }); }
    // DOM
    const showNext = phase === 'docked' || phase === 'end', ready = now() - phaseT >= RESULT_LOCK;
    const nd = showNext ? 'block' : 'none', no = ready ? '1' : '0.45', nt = phase === 'end' ? 'New run' : (idx + 1 >= SECTORS ? 'Finish' : 'Next');
    if (nd !== nextShown) { nextShown = nd; bNext.style.display = nd; }
    if (no !== nextOp) { nextOp = no; bNext.style.opacity = no; }
    if (nt !== nextTxt) { nextTxt = nt; bNext.textContent = nt; }
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
      sector: sector, st: st, t: st.n * C.DT, pred: pred, ghostLine: ghostLine, ghost: ghostSt, phase: phase, warp: phase === 'run' ? warpEff : 1,
      throttle: thr, fuelMax: fuelStart, parFuel: sector.par ? sector.par.fuel : 0, msg: msg, reduced: reduced, sectorIndex: idx, sectorCount: SECTORS
    };
    try { ctx.clearRect(0, 0, V.w, V.h); if (BW.render && BW.render.draw) BW.render.draw(ctx, V, G); }
    catch (e) { if (drawErrs++ < 3 && window.console) console.error(e); }
  }

  // ---- hooks + boot ----
  window.__bw = {
    get state() { return st; }, get sector() { return sector; }, get phase() { return phase; },
    report: buildReport, launch: launch,
    setSeed: function (n) { seed = n | 0; newRun(); },
    hold: function (on, t) { if (on) pointers.set('test', { y: 0, y0: t == null ? 0 : (1 - t) * 120 + 12 }); else pointers.delete('test'); },
    get events() { return events; }
  };
  resize();
  try { if (BW.report && BW.report.selfCheck) { const r = BW.report.selfCheck(); det = { ok: !!r.ok, checksum: r.checksum }; energyDrift = r.energyDrift; } } catch (e) {}
  newRun();
  requestAnimationFrame(frame);
})();
