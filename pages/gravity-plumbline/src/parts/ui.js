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
  const resizeSafe = () => { if (!overlay) resize(); };
  window.addEventListener('resize', resizeSafe);
  window.addEventListener('orientationchange', resizeSafe);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeSafe);
  resize();

  // ---------- run state ----------
  let seed = 1; // seed of the current run
  let urlSeed = 1;
  { const m = /[?&]seed=(-?\d+)/.exec(location.search); if (m) urlSeed = seed = parseInt(m[1], 10) | 0; }
  let scene = 'menu', mode = 'tutorial', nRooms = 3, showBest = false;
  const DEFAULTS = { G: C.G, CAP: C.CAP, CHARGES: C.CHARGES };
  const TUNE = [
    { id: 'G', label: 'Gravity', min: 1200, max: 1900, step: 100 },
    { id: 'CAP', label: 'Speed cap', min: 500, max: 900, step: 50 },
    { id: 'CHARGES', label: 'Charges', min: 1, max: 4, step: 1 }
  ];
  let tuningOpen = false, runTuned = false, trailBuf = [], trailUntil = 0, trailPts = null, cg = null, tg = null, menuDown = null;
  function tunedNow() { return TUNE.some(t => C[t.id] !== DEFAULTS[t.id]); }
  function tunedStr() { return TUNE.map(t => t.id + '=' + C[t.id] + (C[t.id] !== DEFAULTS[t.id] ? '*' : '')).join(' '); }
  let muted = false;
  try { muted = localStorage.getItem('plumbline.mute') === '1'; } catch (_) {}
  if (PL.audio && PL.audio.setMuted) { try { PL.audio.setMuted(muted); } catch (_) {} }
  function dailySeed() {
    if (PL.meta && PL.meta.dailySeed) return PL.meta.dailySeed();
    const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  let rooms, roomIdx, state, cam, cur, attempts, cleared, inputLog, queue, totalTicks, deaths, flipsTotal;
  let deadHandled, winDelay, complete, completeAt, fx, toast, toastUntil, pathOn = true;
  let fpsFrames = 0, fpsSecs = 0, btn = null, overlay = null;
  function avgFps() { return fpsSecs > 0 ? fpsFrames / fpsSecs : 0; }
  function curFlips() { return flipsTotal + (cur && !cur.result && state ? state.flips : 0); }

  function nowMs() { return performance.now(); }
  function newRun() {
    rooms = mode === 'tutorial' ? PL.buildRooms(seed) : PL.buildShaft(seed, nRooms);
    runTuned = tunedNow(); trailBuf = []; trailPts = null; trailUntil = 0; closeOverlay(); setMenuBtn(false);
    roomIdx = 0; attempts = []; cleared = []; inputLog = []; queue = [];
    totalTicks = 0; deaths = 0; flipsTotal = 0; complete = null; completeAt = 0; fx = [];
    clearGesture();
    cam = PL.camNew();
    startAttempt();
  }
  function startAttempt() {
    state = PL.newState(rooms[roomIdx]);
    const n = attempts.filter(a => a.room === roomIdx + 1).length + 1;
    cur = { room: roomIdx + 1, attempt: n, ticks: 0, result: null, flips: 0, landSpeeds: [], log: [], rides: 0 };
    trailBuf = [];
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
    trailPts = null;
    finishAttempt(result || 'restart');
    startAttempt();
  }
  function gotoRoom(i) {
    setMenuBtn(false); trailPts = null;
    roomIdx = Math.max(0, Math.min(rooms.length - 1, i)); complete = null;
    finishAttempt('abandoned'); startAttempt();
  }
  function startMode(m, s) {
    mode = m; nRooms = m === 'tutorial' ? 3 : 7; seed = s | 0; scene = 'play'; tuningOpen = false;
    newRun();
  }
  function toMenu() {
    scene = 'menu'; complete = null; clearGesture(); tuningOpen = false; closeOverlay(); setMenuBtn(false); setResetBtn(false); acc = 0;
  }
  let menuBtn = null;
  function setMenuBtn(on) {
    if (!menuBtn) {
      menuBtn = document.createElement('button');
      menuBtn.textContent = 'Menu';
      menuBtn.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(24px + env(safe-area-inset-bottom));' +
        'min-width:120px;height:56px;font:700 16px system-ui, -apple-system, Segoe UI, sans-serif;border-radius:8px;border:3px solid #1f2430;background:#f2ecdc;color:#1f2430;z-index:50;display:none';
      menuBtn.addEventListener('click', toMenu);
      document.body.appendChild(menuBtn);
    }
    menuBtn.style.display = on ? 'block' : 'none';
  }
  let resetBtn = null;
  function setResetBtn(on) {
    if (!resetBtn) {
      resetBtn = document.createElement('button');
      resetBtn.textContent = 'Reset defaults';
      resetBtn.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(24px + env(safe-area-inset-bottom));' +
        'min-width:160px;height:56px;font:600 18px sans-serif;border-radius:12px;border:2px solid #fff;background:#222;color:#fff;z-index:50;display:none';
      resetBtn.addEventListener('click', () => { for (const t of TUNE) C[t.id] = DEFAULTS[t.id]; });
      document.body.appendChild(resetBtn);
    }
    resetBtn.style.display = on ? 'block' : 'none';
  }
  function audioInit() { if (PL.audio && PL.audio.init) { try { PL.audio.init(); } catch (_) {} } }
  window.addEventListener('touchend', audioInit, { passive: true });
  window.addEventListener('pointerup', audioInit, true);
  function showToast(t, ms) { toast = t; toastUntil = nowMs() + (ms || 2000); }

  function simTick() {
    if (scene !== 'play' || complete) return;
    const counting = !state.won && !cur.result;
    let inputs = queue.splice(0);
    if (state.dead > 0 || state.won || cur.result) inputs = [];
    for (const i of inputs) {
      const e = { tick: state.t, k: i.k }; if (i.k === 'flip') e.dir = i.dir;
      cur.log.push(e);
      inputLog.push({ room: cur.room, attempt: cur.attempt, tick: e.tick, k: e.k, dir: e.dir });
    }
    PL.step(state, inputs);
    if (counting) totalTicks++;
    trailBuf.push({ x: state.x, y: state.y }); if (trailBuf.length > 240) trailBuf.shift();
    if (!runTuned && tunedNow()) runTuned = true;
    const ev = state.events || [];
    if (PL.audio && PL.audio.onEvents) { try { PL.audio.onEvents(ev, state); } catch (_) {} }
    for (const e of ev) {
      if (e === 'land') {
        cur.landSpeeds.push(Math.round(state.lastLandSpeed || 0));
        if (!reduced) fx.push({ x: state.x, y: state.y, age: 0 });
      } else if (e === 'ride') {
        cur.rides++;
      } else if (e === 'death' && !cur.result) {
        deaths++; finishAttempt('death'); deadHandled = true;
        trailPts = trailBuf.slice(); trailUntil = nowMs() + 1200;
      } else if (e === 'win' && !cur.result) {
        finishAttempt('win');
        cleared[roomIdx] = { log: cur.log.slice(), hash: PL.hash(state), ticks: state.t };
        winDelay = 60;
      }
    }
    if (deadHandled && state.dead <= 0) { startAttempt(); return; }
    if (winDelay > 0 && --winDelay === 0) {
      if (roomIdx + 1 >= rooms.length) { finishRun(); }
      else { roomIdx++; startAttempt(); }
    }
  }

  function finishRun() {
    const c = { timeS: totalTicks * C.DT, flips: flipsTotal, deaths, mode, seed, nRooms: rooms.length, tuned: runTuned,
      medal: 'none', flipStar: false, best: null, newBest: false };
    if (PL.meta) {
      try {
        const key = PL.meta.keyFor(mode, seed, rooms.length);
        const r = PL.meta.recordRun(key, { ticks: totalTicks, flips: flipsTotal, deaths, tuned: runTuned });
        if (r) {
          c.medal = r.medal || 'none'; c.flipStar = !!r.flipStar; c.newBest = !!r.isBest && !runTuned;
          if (r.best) c.best = { timeS: r.best.ticks * C.DT, flips: r.best.flips, medal: r.best.medal };
        }
      } catch (_) {}
    }
    complete = c; completeAt = nowMs(); clearGesture(); setMenuBtn(true);
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
  function clearGesture() { g = null; ring = 0; btn = null; cg = null; tg = null; menuDown = null; }
  function btnAt(x, y) {
    if (!PL.BTN) return null;
    if (rectHit(PL.BTN.copy(view), x, y)) return 'copy';
    if (!complete && rectHit(PL.BTN.path(view), x, y)) return 'path';
    if (PL.BTN.snd && rectHit(PL.BTN.snd(view), x, y)) return 'snd';
    return null;
  }
  canvas.style.touchAction = 'none';
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (PL.audio && PL.audio.init) { try { PL.audio.init(); } catch (_) {} }
    if (overlay) return;
    const x = e.clientX, y = e.clientY;
    if (scene === 'menu') { menuDown = { id: e.pointerId, item: menuItemAt(x, y) }; return; }
    if (x < 140 && y < 56 && !complete) { tg = { id: e.pointerId, t0: nowMs() }; return; }
    const b = btnAt(x, y);
    if (b) { btn = { id: e.pointerId, w: b }; return; }
    if (tuningOpen) { tuneTap(x, y); return; }
    if (complete) {
      if (nowMs() - completeAt <= 500) return;
      cg = { id: e.pointerId, t0: nowMs() };
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
    if (scene === 'menu') {
      const d = menuDown; menuDown = null;
      if (d && d.id === e.pointerId && d.item && menuItemAt(e.clientX, e.clientY) === d.item) menuAct(d.item);
      return;
    }
    if (tg && tg.id === e.pointerId) { tg = null; return; }
    if (cg && cg.id === e.pointerId) {
      const held = nowMs() - cg.t0; cg = null; ring = 0;
      if (complete && held < 600 && nowMs() - completeAt > 500) newRun();
      return;
    }
    if (btn && btn.id === e.pointerId) {
      const w = btn.w; btn = null;
      if (overlay || btnAt(e.clientX, e.clientY) !== w) return;
      if (w === 'copy') copyReport();
      else if (w === 'snd') {
        muted = !muted;
        if (PL.audio && PL.audio.setMuted) { try { PL.audio.setMuted(muted); } catch (_) {} }
        try { localStorage.setItem('plumbline.mute', muted ? '1' : '0'); } catch (_) {}
      } else pathOn = !pathOn;
      return;
    }
    endGesture(e, false);
  });
  canvas.addEventListener('pointercancel', e => {
    if (btn && btn.id === e.pointerId) btn = null;
    if (tg && tg.id === e.pointerId) tg = null;
    if (cg && cg.id === e.pointerId) { cg = null; ring = 0; }
    if (menuDown && menuDown.id === e.pointerId) menuDown = null;
    endGesture(e, true);
  });
  canvas.addEventListener('lostpointercapture', e => endGesture(e, true));
  window.addEventListener('blur', clearGesture);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearGesture(); });
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    audioInit();
    if (overlay) { if (k === 'Escape') closeOverlay(); return; }
    if (scene === 'menu') {
      if (k === '1') menuAct('tutorial'); else if (k === '2') menuAct('daily'); else if (k === '3') menuAct('seed');
      else return;
      e.preventDefault();
      return;
    }
    if (k === 'm' || k === 'M' || k === 'Escape') { toMenu(); return; }
    if (k === 't' || k === 'T') { tuningOpen = !tuningOpen; return; }
    if (complete) { if ((k === ' ' || k === 'Enter') && nowMs() - completeAt > 500) newRun(); return; }
    if (k === 'ArrowUp') qFlip(0); else if (k === 'ArrowRight') qFlip(1);
    else if (k === 'ArrowDown') qFlip(2); else if (k === 'ArrowLeft') qFlip(3);
    else if (k === ' ') qDive(); else if (k === 'r' || k === 'R') restartRoom('restart');
    else if (k === 'p' || k === 'P') pathOn = !pathOn;
    else return;
    e.preventDefault();
  });
  // ---------- menu ----------
  function menuModel() {
    const items = [
      { id: 'tutorial', label: 'Tutorial rooms', sub: '3 rooms, seed ' + urlSeed },
      { id: 'daily', label: 'Shaft: Daily', sub: '7 rooms, seed ' + dailySeed() },
      { id: 'seed', label: 'Shaft: Seed', sub: '7 rooms, type a number' },
      { id: 'best', label: 'Best times', sub: showBest ? 'tap to hide' : 'tap to show' }
    ];
    const bestLines = [];
    if (showBest) {
      const rows = [['Tutorial', 'tutorial', urlSeed, 3], ['Daily ' + dailySeed(), 'daily', dailySeed(), 7]];
      for (const r of rows) {
        let b = null;
        try { b = PL.meta && PL.meta.getBest(PL.meta.keyFor(r[1], r[2], r[3])); } catch (_) {}
        bestLines.push(r[0] + ': ' + (b ? (b.ticks * C.DT).toFixed(2) + 's, ' + b.flips + ' flips, ' + (b.medal || 'none') : 'no run yet'));
      }
    }
    return { title: 'Plumbline', sub: 'Flip gravity. Reach the exit.', items, seed: urlSeed, hint: 'Tap an option (keys 1-3)', bestLines };
  }
  function menuItemAt(x, y) {
    if (!PL.menuLayout) return null;
    const lay = PL.menuLayout(view, menuModel().items) || [];
    for (const it of lay) if (rectHit(it.rect, x, y)) return it.id;
    return null;
  }
  function menuAct(id) {
    if (id === 'tutorial') startMode('tutorial', urlSeed);
    else if (id === 'daily') startMode('daily', dailySeed());
    else if (id === 'seed') seedOverlay();
    else if (id === 'best') showBest = !showBest;
  }
  function seedOverlay() {
    closeOverlay();
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100dvh;z-index:99;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;padding:max(16px,8vh) 16px 16px;box-sizing:border-box;color:#fff;font:18px sans-serif;overflow:hidden';
    const vv = window.visualViewport;
    const fit = () => { if (vv) { o.style.top = vv.offsetTop + 'px'; o.style.left = vv.offsetLeft + 'px'; o.style.height = vv.height + 'px'; o.style.width = vv.width + 'px'; } };
    if (vv) { fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); o._cleanup = () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }; }
    const lab = document.createElement('div'); lab.textContent = 'Shaft seed (digits only)';
    const err = document.createElement('div'); err.style.cssText = 'color:#ff7b7b;min-height:22px;font-size:16px';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.inputMode = 'numeric'; inp.pattern = '[0-9]*'; inp.maxLength = 9; inp.autocomplete = 'off';
    inp.style.cssText = 'font:24px monospace;padding:12px;width:240px;text-align:center;box-sizing:border-box';
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 9); err.textContent = ''; inp.style.outline = ''; });
    lab.addEventListener('click', () => inp.focus());
    const go = () => {
      if (!inp.value) { err.textContent = 'Enter digits first'; inp.style.outline = '3px solid #ff7b7b'; inp.focus(); return; }
      const n = parseInt(inp.value, 10) | 0; closeOverlay(); startMode('seed', n);
    };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:12px';
    const mk = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'font:18px sans-serif;min-width:112px;height:56px'; b.addEventListener('click', f); return b; };
    row.appendChild(mk('Start', go)); row.appendChild(mk('Cancel', closeOverlay));
    o.appendChild(lab); o.appendChild(inp); o.appendChild(err); o.appendChild(row); document.body.appendChild(o);
    overlay = o; inp.focus();
  }

  // ---------- tuning ----------
  function tuneRows() { return TUNE.map(t => ({ id: t.id, label: t.label, value: C[t.id] })); }
  function tuneTap(x, y) {
    if (!PL.tuningLayout) return;
    const lay = PL.tuningLayout(view, tuneRows()) || [];
    for (const r of lay) {
      const t = TUNE.find(q => q.id === r.id); if (!t) continue;
      let d = 0;
      if (rectHit(r.minus, x, y)) d = -t.step; else if (rectHit(r.plus, x, y)) d = t.step;
      if (d) { C[t.id] = Math.max(t.min, Math.min(t.max, C[t.id] + d)); if (tunedNow()) runTuned = true; return; }
    }
  }
  function updateHold() {
    if (tg) {
      if (nowMs() - tg.t0 >= 800) { tuningOpen = !tuningOpen; tg = null; }
      ring = 0; return;
    }
    if (cg) {
      const h = nowMs() - cg.t0;
      ring = Math.max(0, Math.min(1, (h - 250) / 350));
      if (h >= 600) { cg = null; ring = 0; toMenu(); }
      return;
    }
    if (g && !g.fired && !g.moved) {
      const h = nowMs() - g.t0;
      ring = Math.max(0, Math.min(1, (h - 250) / 350));
      if (h >= 600) { g.held = true; ring = 0; if (winDelay <= 0 && !(cur && cur.result === 'win')) restartRoom('restart'); }
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
    L.push('mode: ' + mode + '  rooms: ' + (rooms ? rooms.length : 0));
    L.push('seed: ' + seed);
    L.push('templates: ' + (rooms || []).map(r => r.templateId || r.name).join(','));
    L.push('tuned: ' + (runTuned || tunedNow() ? 'YES (not saved as best) ' : 'no ') + tunedStr());
    if (complete) L.push('result: medal ' + complete.medal + (complete.flipStar ? ' +flipstar' : '') + '  newBest ' + complete.newBest +
      (complete.best ? '  best ' + complete.best.timeS.toFixed(2) + 's/' + complete.best.flips + ' flips/' + complete.best.medal : ''));
    L.push('build: ' + BUILD);
    L.push('UA: ' + navigator.userAgent);
    L.push('viewport: ' + view.W + 'x' + view.H + ' dpr ' + view.dpr + ' inset t' + view.inset.t + ' b' + view.inset.b);
    L.push('avg fps: ' + fps.toFixed(1));
    L.push('run time: ' + fmt(totalTicks * C.DT) + ' (' + totalTicks + ' ticks)  flips ' + curFlips() + '  deaths ' + deaths + (complete ? '  RUN COMPLETE' : '  in progress'));
    L.push('WebGPU output: NOT seen (canvas 2D)');
    L.push('');
    L.push('attempts [room, attempt, ticks, result, flips, landSpeeds]:');
    const all = attempts.concat(cur && !cur.result && !complete ? [Object.assign({}, cur, { ticks: state.t, flips: state.flips, result: 'in-progress' })] : []);
    for (const a of all) L.push('  ' + JSON.stringify({ room: a.room, attempt: a.attempt, ticks: a.ticks, result: a.result, flips: a.flips, landSpeeds: a.landSpeeds, rides: a.rides || 0 }));
    L.push('wall-ride count per room: ' + rooms.map((_, i) => all.filter(x => x.room === i + 1).reduce((s2, x) => s2 + (x.rides || 0), 0)).join(' '));
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
    L.push(runTuned || tunedNow() ? 'determinism: skipped (tuned)' : !rc.any ? 'determinism: no cleared rooms yet' : rc.ok ? 'determinism OK' : 'determinism FAIL');
    L.push('');
    L.push('input log (room, attempt, tick, k, dir):');
    for (const i of inputLog) L.push('  ' + i.room + ' ' + i.attempt + ' ' + i.tick + ' ' + i.k + (i.k === 'flip' ? ' ' + DIRN[i.dir] : ''));
    if (cur && !cur.result) { /* current attempt inputs already in inputLog */ }
    return L.join('\n');
  }
  function closeOverlay() { if (overlay) { if (overlay._cleanup) overlay._cleanup(); overlay.remove(); overlay = null; } }
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
    if (scene !== 'play' || tuningOpen) acc = 0;
    else while (acc >= C.DT && n < 5) { simTick(); acc -= C.DT; n++; }
    setResetBtn(scene === 'play' && tuningOpen);
    if (acc > C.DT) acc = 0; // drop excess beyond 5 steps
    if (scene === 'menu') {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const mm = menuModel();
      if (PL.drawMenu && PL.menuLayout) PL.drawMenu(ctx, view, Object.assign({}, mm, { items: PL.menuLayout(view, mm.items) }));
      else { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, view.W, view.H); ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif'; ctx.fillText('Plumbline', 20, 60); }
      if (toast && nowMs() > toastUntil) toast = null;
      return;
    }
    updateHold();
    for (const f of fx) f.age += dt;
    fx = fx.filter(f => f.age < 0.6);
    if (toast && nowMs() > toastUntil) toast = null;
    const fr = PL.camUpdate(cam, state, view, dt);
    const hud = {
      roomIdx: roomIdx, roomN: roomIdx + 1, roomName: rooms[roomIdx].name, teach: rooms[roomIdx].teach,
      timeS: totalTicks * C.DT, flips: curFlips(), deaths, pathOn, seed, toast,
      ring, completeScreen: complete, fps: avgFps(), fx, reduced,
      roomTotal: rooms.length, nRooms: rooms.length, attempt: cur ? cur.attempt : 1, mode, roomAgeS: state.t * C.DT, muted,
      trail: trailPts && nowMs() < trailUntil ? trailPts : null,
      tuning: { open: tuningOpen, rows: tuneRows(), dirty: runTuned || tunedNow() }
    };
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    PL.draw(ctx, view, fr, state, hud);
  }

  newRun(); // scene stays 'menu' until a mode is picked
  requestAnimationFrame(frame);

  // ---------- test hook ----------
  window.PL_TEST = {
    getState: () => state,
    setSeed: n => { urlSeed = n | 0; seed = urlSeed; scene = 'play'; mode = 'tutorial'; nRooms = 3; newRun(); },
    startMode: (m, s) => { startMode(m, s === undefined ? (m === 'daily' ? dailySeed() : urlSeed) : s); },
    menu: () => { toMenu(); },
    tuning: () => { tuningOpen = !tuningOpen; return tuningOpen; },
    scene: () => scene,
    sceneName: () => scene === 'menu' ? 'menu' : complete ? 'complete' : 'play',
    kill: () => { if (scene === 'play' && !complete && state && !state.dead && !state.won) { state.dead = Math.round(C.RESPAWN_T / C.DT); state.events = (state.events || []).concat(['death']); deaths++; finishAttempt('death'); deadHandled = true; trailPts = trailBuf.slice(); trailUntil = nowMs() + 1200; return true; } return false; },
    inject: arr => { for (const i of (arr || [])) {
      if (!i) continue;
      if (i.k === 'dive') queue.push({ k: 'dive' });
      else if (i.k === 'flip' && Number.isInteger(i.dir) && i.dir >= 0 && i.dir <= 3) queue.push({ k: 'flip', dir: i.dir });
    } },
    room: n => { scene = 'play'; gotoRoom((n | 0) - 1); }, // 1-based
    tick: n => { for (let i = 0; i < (n || 1); i++) simTick(); },
    report: buildReport,
    attempts: () => attempts.slice(),
    inputLog: () => inputLog.slice(),
    getRunStats: () => ({ totalTicks, roomsCleared: cleared.filter(Boolean).length, tuned: runTuned || tunedNow() }),
    isComplete: () => !!complete
  };
  PL.ui = { buildReport };
})();
