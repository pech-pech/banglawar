// ui.js: DOM, input, loop, flow, report. draw.js owns all pixels.
const PL = (globalThis.PL = globalThis.PL || {});
(function () {
  'use strict';
  const BUILD = 'plumbline-2026-11-18';
  const C = PL.C;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DIRN = ['up', 'right', 'down', 'left'];

  // ---------- viewport ----------
  const view = { W: 0, H: 0, dpr: 1, inset: { t: 0, b: 0, l: 0, r: 0 } };
  let probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  function resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(window.innerWidth)), H = Math.max(1, Math.round(window.innerHeight));
    const cs = getComputedStyle(probe);
    view.W = W; view.H = H; view.dpr = dpr;
    view.inset = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
      b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  // ---------- run state ----------
  let seed = 1;
  { const m = /[?&]seed=(-?\d+)/.exec(location.search); if (m) seed = parseInt(m[1], 10) | 0; }
  let rooms, roomIdx, state, cam, cur, attempts, cleared, inputLog, queue, totalTicks, deaths, flipsTotal;
  let deadHandled, winDelay, complete, completeAt, fx, toast, toastUntil, pathOn = true;
  let fpsFrames = 0, fpsSecs = 0, btn = null, overlay = null;
  function avgFps() { return fpsSecs > 0 ? fpsFrames / fpsSecs : 0; }
  function curFlips() { return flipsTotal + (cur && !cur.result && state ? state.flips : 0); }

  function nowMs() { return performance.now(); }
  function newRun() {
    rooms = PL.buildRooms(seed);
    roomIdx = 0; attempts = []; cleared = []; inputLog = []; queue = [];
    totalTicks = 0; deaths = 0; flipsTotal = 0; complete = null; completeAt = 0; fx = [];
    clearGesture();
    cam = PL.camNew();
    startAttempt();
  }
  function startAttempt() {
    state = PL.newState(rooms[roomIdx]);
    const n = attempts.filter(a => a.room === roomIdx + 1).length + 1;
    cur = { room: roomIdx + 1, attempt: n, ticks: 0, result: null, flips: 0, landSpeeds: [], log: [] };
    deadHandled = false; winDelay = 0;
    queue = [];
    cam = PL.camNew();
  }
  function finishAttempt(result) {
    if (!cur || cur.result) return;
    cur.result = result; cur.ticks = state.t; cur.flips = state.flips;
    attempts.push(cur);
    flipsTotal += state.flips;
  }
  function restartRoom(result) {
    finishAttempt(result || 'restart');
    startAttempt();
  }
  function gotoRoom(i) {
    roomIdx = Math.max(0, Math.min(rooms.length - 1, i)); complete = null;
    finishAttempt('abandoned'); startAttempt();
  }
  function showToast(t, ms) { toast = t; toastUntil = nowMs() + (ms || 2000); }

  function simTick() {
    if (complete) return;
    let inputs = queue.splice(0);
    if (state.dead > 0 || state.won || cur.result) inputs = [];
    for (const i of inputs) {
      const e = { tick: state.t, k: i.k }; if (i.k === 'flip') e.dir = i.dir;
      cur.log.push(e);
      inputLog.push({ room: cur.room, attempt: cur.attempt, tick: e.tick, k: e.k, dir: e.dir });
    }
    PL.step(state, inputs);
    totalTicks++;
    const ev = state.events || [];
    for (const e of ev) {
      if (e === 'land') {
        cur.landSpeeds.push(Math.round(state.lastLandSpeed || 0));
        if (!reduced) fx.push({ x: state.x, y: state.y, age: 0 });
      } else if (e === 'death' && !cur.result) {
        deaths++; finishAttempt('death'); deadHandled = true;
      } else if (e === 'win' && !cur.result) {
        finishAttempt('win');
        cleared[roomIdx] = { log: cur.log.slice(), hash: PL.hash(state), ticks: state.t };
        winDelay = 60;
      }
    }
    if (deadHandled && state.dead <= 0) { startAttempt(); return; }
    if (winDelay > 0 && --winDelay === 0) {
      if (roomIdx + 1 >= rooms.length) { complete = { timeS: totalTicks * C.DT, flips: flipsTotal, deaths }; completeAt = nowMs(); clearGesture(); }
      else { roomIdx++; startAttempt(); }
    }
  }

  // ---------- input ----------
  function qFlip(dir) { queue.push({ k: 'flip', dir }); }
  function qDive() { queue.push({ k: 'dive' }); }
  function rectHit(r, x, y) {
    if (!r) return false;
    const a = Array.isArray(r) ? r : [r.x, r.y, r.w, r.h];
    return x >= a[0] && x <= a[0] + a[2] && y >= a[1] && y <= a[1] + a[3];
  }
  let g = null; // active gesture
  let ring = 0;
  function clearGesture() { g = null; ring = 0; btn = null; }
  function btnAt(x, y) {
    if (!PL.BTN) return null;
    if (rectHit(PL.BTN.copy(view), x, y)) return 'copy';
    if (!complete && rectHit(PL.BTN.path(view), x, y)) return 'path';
    return null;
  }
  canvas.style.touchAction = 'none';
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (overlay) return;
    const x = e.clientX, y = e.clientY;
    const b = btnAt(x, y);
    if (b) { btn = { id: e.pointerId, w: b }; return; }
    if (complete) {
      if (nowMs() - completeAt > 500) newRun();
      return;
    }
    if (g && nowMs() - g.t0 > 3000) g = null; // stale gesture
    if (y < 0.6 * view.H || g) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    g = { id: e.pointerId, x0: x, y0: y, t0: nowMs(), fired: false, moved: false, held: false };
  });
  function tryFlick(x, y) {
    const dx = x - g.x0, dy = y - g.y0;
    if (g.fired || Math.hypot(dx, dy) <= 24) return;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax >= 1.25 * ay) { qFlip(dx > 0 ? 1 : 3); g.fired = true; }
    else if (ay >= 1.25 * ax) { qFlip(dy > 0 ? 2 : 0); g.fired = true; }
  }
  canvas.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) >= 10) g.moved = true;
    tryFlick(e.clientX, e.clientY);
  });
  function endGesture(e, cancel) {
    if (!g || e.pointerId !== g.id) return;
    if (!cancel) tryFlick(e.clientX, e.clientY);
    const dt = nowMs() - g.t0, d = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
    if (!cancel && !g.fired && !g.held && !g.moved && d < 10 && dt < 180) qDive();
    g = null; ring = 0;
  }
  canvas.addEventListener('pointerup', e => {
    if (btn && btn.id === e.pointerId) {
      const w = btn.w; btn = null;
      if (overlay || btnAt(e.clientX, e.clientY) !== w) return;
      if (w === 'copy') copyReport(); else pathOn = !pathOn;
      return;
    }
    endGesture(e, false);
  });
  canvas.addEventListener('pointercancel', e => {
    if (btn && btn.id === e.pointerId) btn = null;
    endGesture(e, true);
  });
  canvas.addEventListener('lostpointercapture', e => endGesture(e, true));
  window.addEventListener('blur', clearGesture);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearGesture(); });
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key;
    if (overlay) { if (k === 'Escape') closeOverlay(); return; }
    if (complete) { if ((k === ' ' || k === 'Enter') && nowMs() - completeAt > 500) newRun(); return; }
    if (k === 'ArrowUp') qFlip(0); else if (k === 'ArrowRight') qFlip(1);
    else if (k === 'ArrowDown') qFlip(2); else if (k === 'ArrowLeft') qFlip(3);
    else if (k === ' ') qDive(); else if (k === 'r' || k === 'R') restartRoom('restart');
    else if (k === 'p' || k === 'P') pathOn = !pathOn;
    else return;
    e.preventDefault();
  });
  function updateHold() {
    if (g && !g.fired && !g.moved) {
      const h = nowMs() - g.t0;
      ring = Math.max(0, Math.min(1, (h - 250) / 350));
      if (h >= 600) { g.held = true; ring = 0; restartRoom('restart'); }
    } else ring = 0;
  }

  // ---------- report ----------
  function replayCheck() {
    const lines = []; let ok = true, any = false;
    for (let i = 0; i < cleared.length; i++) {
      const c = cleared[i]; if (!c) continue; any = true;
      let r; try { r = PL.replay(rooms[i], c.log); } catch (e) { r = { hash: 'ERR ' + e.message }; }
      const same = r.hash === c.hash; if (!same) ok = false;
      lines.push('  room ' + (i + 1) + ': ' + (same ? 'match' : 'MISMATCH') + ' (' + c.log.length + ' inputs, ' + c.ticks + ' ticks)');
    }
    return { ok, any, lines };
  }
  function fmt(t) { return t.toFixed(2) + 's'; }
  function buildReport() {
    const L = [];
    const fps = avgFps();
    L.push('PLUMBLINE REPORT');
    L.push('seed: ' + seed);
    L.push('build: ' + BUILD);
    L.push('UA: ' + navigator.userAgent);
    L.push('viewport: ' + view.W + 'x' + view.H + ' dpr ' + view.dpr + ' inset t' + view.inset.t + ' b' + view.inset.b);
    L.push('avg fps: ' + fps.toFixed(1));
    L.push('run time: ' + fmt(totalTicks * C.DT) + ' (' + totalTicks + ' ticks)  flips ' + curFlips() + '  deaths ' + deaths + (complete ? '  RUN COMPLETE' : '  in progress'));
    L.push('WebGPU output: NOT seen (canvas 2D)');
    L.push('');
    L.push('attempts [room, attempt, ticks, result, flips, landSpeeds]:');
    const all = attempts.concat(cur && !cur.result && !complete ? [Object.assign({}, cur, { ticks: state.t, flips: state.flips, result: 'in-progress' })] : []);
    for (const a of all) L.push('  ' + JSON.stringify({ room: a.room, attempt: a.attempt, ticks: a.ticks, result: a.result, flips: a.flips, landSpeeds: a.landSpeeds }));
    L.push('');
    L.push('2nd attempt vs 1st per room:');
    for (let r = 1; r <= rooms.length; r++) {
      const a = all.filter(x => x.room === r);
      if (a.length < 2) L.push('  room ' + r + ': n/a (' + a.length + ' attempt' + (a.length === 1 ? '' : 's') + ')');
      else {
        const cmp = (a[0].result === 'win' && a[1].result === 'win') ? '' : '  (not like-for-like)';
        const t1 = a[0].ticks * C.DT, t2 = a[1].ticks * C.DT, d = t2 - t1;
        L.push('  room ' + r + ': 1st ' + fmt(t1) + ' (' + a[0].result + ')  2nd ' + fmt(t2) + ' (' + a[1].result + ')  delta ' + (d >= 0 ? '+' : '') + d.toFixed(2) + 's' + cmp);
      }
    }
    L.push('');
    const rc = replayCheck();
    L.push('determinism check (replay of cleared rooms):');
    for (const l of rc.lines) L.push(l);
    L.push(!rc.any ? 'determinism: no cleared rooms yet' : rc.ok ? 'determinism OK' : 'determinism FAIL');
    L.push('');
    L.push('input log (room, attempt, tick, k, dir):');
    for (const i of inputLog) L.push('  ' + i.room + ' ' + i.attempt + ' ' + i.tick + ' ' + i.k + (i.k === 'flip' ? ' ' + DIRN[i.dir] : ''));
    if (cur && !cur.result) { /* current attempt inputs already in inputLog */ }
    return L.join('\n');
  }
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
  function showManual(text) {
    try { console.log(text); } catch (_) {}
    closeOverlay();
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.85);display:flex;flex-direction:column;gap:8px;padding:12px;box-sizing:border-box';
    const ta = document.createElement('textarea');
    ta.value = text; ta.readOnly = true;
    ta.style.cssText = 'flex:1;width:100%;font:16px monospace;box-sizing:border-box';
    ta.addEventListener('focus', () => { try { ta.select(); ta.setSelectionRange(0, text.length); } catch (_) {} });
    const bt = document.createElement('button');
    bt.textContent = 'Close'; bt.style.cssText = 'font:16px sans-serif;padding:12px';
    bt.addEventListener('click', closeOverlay);
    o.appendChild(ta); o.appendChild(bt); document.body.appendChild(o);
    overlay = o; ta.focus();
  }
  function copyReport() {
    const text = buildReport();
    const fallback = () => {
      let ok = false;
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.readOnly = true;
        ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;font-size:16px';
        document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
        ok = document.execCommand('copy'); ta.remove();
      } catch (_) { ok = false; }
      if (ok) showToast('Report copied'); else { showToast('Copy failed'); showManual(text); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => showToast('Report copied'), fallback);
      } else fallback();
    } catch (_) { fallback(); }
  }

  // ---------- loop ----------
  let last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts;
    if (dt <= 0) return;
    if (dt > 0.25) dt = 0.25; // tab was hidden
    else { fpsFrames++; fpsSecs += dt; }
    acc += dt;
    let n = 0;
    while (acc >= C.DT && n < 5) { simTick(); acc -= C.DT; n++; }
    if (acc > C.DT) acc = 0; // drop excess beyond 5 steps
    updateHold();
    for (const f of fx) f.age += dt;
    fx = fx.filter(f => f.age < 0.6);
    if (toast && nowMs() > toastUntil) toast = null;
    const fr = PL.camUpdate(cam, state, view, dt);
    const hud = {
      roomIdx: roomIdx, roomN: roomIdx + 1, roomName: rooms[roomIdx].name, teach: rooms[roomIdx].teach,
      timeS: totalTicks * C.DT, flips: curFlips(), deaths, pathOn, seed, toast,
      ring, completeScreen: complete, fps: avgFps(), fx, reduced
    };
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    PL.draw(ctx, view, fr, state, hud);
  }

  newRun();
  requestAnimationFrame(frame);

  // ---------- test hook ----------
  window.PL_TEST = {
    getState: () => state,
    setSeed: n => { seed = n | 0; newRun(); },
    inject: arr => { for (const i of (arr || [])) {
      if (!i) continue;
      if (i.k === 'dive') queue.push({ k: 'dive' });
      else if (i.k === 'flip' && Number.isInteger(i.dir) && i.dir >= 0 && i.dir <= 3) queue.push({ k: 'flip', dir: i.dir });
    } },
    room: n => { gotoRoom((n | 0) - 1); }, // 1-based
    tick: n => { for (let i = 0; i < (n || 1); i++) simTick(); },
    report: buildReport,
    attempts: () => attempts.slice(),
    inputLog: () => inputLog.slice(),
    isComplete: () => !!complete
  };
  PL.ui = { buildReport };
})();
