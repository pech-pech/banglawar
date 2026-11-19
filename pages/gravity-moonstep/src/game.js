/* Moonstep game.js: loop, input, HUD, overlays, storage, report. Uses Moonstep, MoonDraw, MoonAudio. */
(function () {
  'use strict';
  var C = Moonstep.C;
  var DT = C.DT;
  var KEY = 'moonstep.v1';
  var BANDS = [[150, 'Bronze'], [400, 'Silver'], [800, 'Gold'], [1500, 'Moon']];

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var reducedMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reducedMQ && reducedMQ.matches); }

  // ---------- storage ----------
  var store = { best: Object.create(null), attempts: [], set: { assist: true, sound: true, tide: 1 } };
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (o.best && typeof o.best === 'object') for (var bk in o.best) if (typeof o.best[bk] === 'number') store.best[bk] = o.best[bk];
        if (Array.isArray(o.attempts)) store.attempts = o.attempts.slice(-20);
        if (o.set) for (var k in o.set) store.set[k] = o.set[k];
        if (store.set.tide !== 0.75 && store.set.tide !== 1 && store.set.tide !== 1.25) store.set.tide = 1;
      }
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

  // ---------- audio helper ----------
  function au(fn) {
    var a = typeof MoonAudio !== 'undefined' ? MoonAudio : null;
    if (!a || typeof a[fn] !== 'function') return;
    try { a[fn].apply(a, Array.prototype.slice.call(arguments, 1)); } catch (e) {}
  }

  // ---------- seed ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
  function randSeed() {
    var cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = '';
    for (var i = 0; i < 4; i++) r += cs[Math.floor(Math.random() * cs.length)];
    return r;
  }
  var seed;
  try { seed = new URLSearchParams(location.search).get('seed'); } catch (e) { seed = null; }
  seed = seed ? String(seed).slice(0, 24) : randSeed();

  // ---------- state ----------
  var s, view, paused = false, overAt = 0, overHandled = false, attemptNo = 0;
  var acc = 0, last = 0, frameTimes = [], simT = 0;
  var down = false, pointerId = null, pdx = 0, pdy = 0, pdt = 0;
  var pendDown = false, pendRev = false, pendCancel = false, ignoreUntilUp = false;
  var prevMode = 'rim', prevJumps = 0, prevChain = 0, prevSpeed = 0, prevX = 0, prevY = 0, prevVx = 0, prevVy = 0;
  var W = 0, H = 0, dpr = 1;

  function newRun(sd) {
    seed = sd;
    s = Moonstep.newRun(seed, { tideScale: store.set.tide });
    attemptNo++;
    overHandled = false; acc = 0; paused = false;
    prevMode = 'rim'; prevJumps = 0; prevChain = 0; prevSpeed = 0; prevX = 0; prevY = 0; prevVx = 0; prevVy = 0;
    down = false; pendDown = false; pendRev = false; pendCancel = false; ignoreUntilUp = false;
    hideAll();
    try { var u = new URL(location.href); u.searchParams.set('seed', seed); history.replaceState(null, '', u); } catch (e) {}
    refreshHud();
  }

  // ---------- DOM ----------
  var css = document.createElement('style');
  css.textContent =
    'html,body{margin:0;height:100%;background:#0b0e14;overflow:hidden;overscroll-behavior:none}' +
    '#c{position:fixed;inset:0;width:100%;height:100%;touch-action:none;display:block;-webkit-user-select:none;user-select:none}' +
    '.mx{position:fixed;font:14px/1.3 system-ui,sans-serif;color:#e8ecf4;-webkit-tap-highlight-color:transparent}' +
    '.mxb{width:56px;height:56px;border-radius:14px;border:1px solid #556;background:#0f1424;color:#e8ecf4;font:600 13px system-ui,sans-serif;padding:0;touch-action:manipulation}' +
    '.mxb:focus-visible,.mxbtn:focus-visible{outline:3px solid #8cf;outline-offset:2px}' +
    '#mx-hud{left:50%;transform:translateX(-50%);max-width:calc(100% - 144px);box-sizing:border-box;top:calc(8px + env(safe-area-inset-top));text-align:center;pointer-events:none;text-shadow:0 1px 3px #000;background:rgba(10,14,24,.86);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:4px 12px 6px;color:#fff}' +
    '#mx-h{font:700 28px system-ui,sans-serif}#mx-m,#mx-s,#mx-f{opacity:1;color:#dfe5f2;font-size:12px}#mx-f:empty{display:none}' +
    '#mx-chain{width:120px;height:6px;margin:4px auto 0;background:rgba(255,255,255,.18);border-radius:3px;overflow:hidden}' +
    '#mx-cf{height:100%;width:0;background:#7fe0a0}' +
    '.mxo{inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,8,14,.78);z-index:5;padding:calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))}' +
    '.mxp{background:#161c2c;border:1px solid #445;border-radius:16px;padding:18px;max-width:340px;width:100%;box-sizing:border-box;max-height:100%;overflow:auto}' +
    '.mxp h2{margin:0 0 6px;font-size:22px}.mxp p{margin:4px 0 10px}' +
    '.mxbtn{display:block;width:100%;min-height:56px;margin:8px 0;border-radius:12px;border:1px solid #667;background:#243050;color:#fff;font:600 15px system-ui,sans-serif;touch-action:manipulation}' +
    '.mxbtn:disabled{opacity:.45}.mxbtn.on{background:#2d6a4a;border:2px solid #9fe8b8}' +
    '.mxgo{text-align:center}.mxgo .big{font:700 44px/1.1 system-ui,sans-serif}.mxgo .cause{margin:2px 0 10px;opacity:.9}.mxgo .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;text-align:left}.mxgo .grid div{background:#0d1220;border-radius:8px;padding:6px 10px}.mxgo .grid b{display:block;font-size:11px;font-weight:600;opacity:.7;text-transform:uppercase}' +
    '.mxrow{display:flex;gap:8px}.mxrow .mxbtn{margin:8px 0}' +
    '.mxp input,.mxp textarea{width:100%;box-sizing:border-box;border-radius:8px;border:1px solid #667;background:#0d1220;color:#fff;font:14px monospace;padding:8px}' +
    '.mxp textarea{height:160px}';
  document.head.appendChild(css);

  function el(tag, cls, parent, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    (parent || document.body).appendChild(e);
    return e;
  }
  var hud = el('div', 'mx', null); hud.id = 'mx-hud';
  var hH = el('div', null, hud); hH.id = 'mx-h';
  var hM = el('div', null, hud); hM.id = 'mx-m';
  var hC = el('div', null, hud); hC.id = 'mx-chain';
  var hCf = el('div', null, hC); hCf.id = 'mx-cf';
  var hS = el('div', null, hud); hS.id = 'mx-s';
  var hCh = el('div', null, hud); hCh.id = 'mx-f';

  var bPause = el('button', 'mx mxb', null, 'Pause');
  bPause.setAttribute('aria-label', 'Pause');
  bPause.style.cssText = 'left:calc(8px + env(safe-area-inset-left));top:calc(8px + env(safe-area-inset-top));z-index:3';
  var bCopy = el('button', 'mx mxb', null, 'Copy');
  bCopy.setAttribute('aria-label', 'Copy report');
  bCopy.style.cssText = 'right:calc(8px + env(safe-area-inset-right));top:calc(8px + env(safe-area-inset-top));z-index:3';

  function overlay() { var o = el('div', 'mx mxo', null); var p = el('div', 'mxp', o); var v = { o: o, p: p }; ovs.push(v); return v; }
  function btn(txt, parent, fn) {
    var b = el('button', 'mxbtn', parent, txt);
    b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(b); });
    return b;
  }
  var ovs = [];
  function chrome() {
    var open = ovs.some(function (v) { return v.o.style.display === 'flex'; });
    [hud, bCopy].forEach(function (e) { e.style.visibility = open ? 'hidden' : 'visible'; });
  }
  function show(ov) { ov.o.style.display = 'flex'; chrome(); }
  function hide(ov) { ov.o.style.display = 'none'; chrome(); }

  // pause overlay
  var pov = overlay();
  el('h2', null, pov.p, 'Paused');
  var bAssist = btn('', pov.p, function () { store.set.assist = !store.set.assist; save(); syncMenu(); });
  var bSound = btn('', pov.p, function () { store.set.sound = !store.set.sound; au('setEnabled', store.set.sound); save(); syncMenu(); });
  el('p', null, pov.p, 'Tide speed (next run)');
  var tideRow = el('div', 'mxrow', pov.p), tideBtns = [];
  [0.75, 1, 1.25].forEach(function (v) {
    tideBtns.push({ v: v, b: btn(v + 'x', tideRow, function () { store.set.tide = v; save(); syncMenu(); }) });
  });
  el('p', null, pov.p, 'Seed');
  var seedIn = el('input', null, pov.p); seedIn.maxLength = 24; seedIn.setAttribute('aria-label', 'Seed');
  btn('Start this seed', pov.p, function () {
    var v = (seedIn.value || '').trim().slice(0, 24);
    newRun(v || randSeed());
  });
  btn('Daily seed', pov.p, function () { newRun(Moonstep.dailySeed(today())); });
  btn('Resume', pov.p, function () { setPaused(false); });
  function syncMenu() {
    bAssist.textContent = 'Assist arc: ' + (store.set.assist ? 'ON' : 'OFF');
    bAssist.className = 'mxbtn' + (store.set.assist ? ' on' : '');
    bSound.textContent = 'Sound: ' + (store.set.sound ? 'ON' : 'OFF');
    bSound.className = 'mxbtn' + (store.set.sound ? ' on' : '');
    tideBtns.forEach(function (t) { var on = store.set.tide === t.v; t.b.className = 'mxbtn' + (on ? ' on' : ''); t.b.textContent = (on ? '\u2713 ' : '') + t.v + 'x'; t.b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }

  // game over overlay
  var gov = overlay();
  var goTitle = el('h2', null, gov.p, 'Run over');
  var goInfo = el('div', 'mxgo', gov.p);
  var goVer = el('p', null, gov.p, '');
  var goBtns = [];
  goBtns.push(btn('Retry same seed', gov.p, function () { newRun(seed); }));
  goBtns.push(btn('New seed', gov.p, function () { newRun(randSeed()); }));
  goBtns.push(btn('Copy report', gov.p, function () { copyReport(); }));
  goBtns.push(btn('Verify replay', gov.p, function () { verify(); }));

  // text fallback overlay
  var tov = overlay();
  el('h2', null, tov.p, 'Report');
  el('p', null, tov.p, 'Clipboard blocked. Select all and copy.');
  var ta = el('textarea', null, tov.p); ta.readOnly = true;
  btn('Close', tov.p, function () { hide(tov); });

  function hideAll() { hide(pov); hide(gov); hide(tov); goVer.textContent = ''; }
  function setPaused(p) {
    if (s.over) return;
    paused = p;
    if (p) { seedIn.value = seed; syncMenu(); show(pov); down = false; au('charge', 0); }
    else { hide(pov); last = 0; }
  }
  bPause.addEventListener('click', function (e) { e.stopPropagation(); setPaused(!paused); });
  bCopy.addEventListener('click', function (e) { e.stopPropagation(); copyReport(); });

  // ---------- report ----------
  function pct(a, p) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    return +b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(2);
  }
  function buildReport() {
    var extra = {
      attempt: attemptNo,
      attempts: store.attempts,
      aimedVsLanded: s.jumpLog,
      viewKey: view ? view.key : '',
      renderer: 'canvas2d',
      webgpu: 'WebGPU output: NOT seen',
      frameMs: { p50: pct(frameTimes, 0.5), p95: pct(frameTimes, 0.95), n: frameTimes.length },
      settings: store.set,
      inputLog: Moonstep.report(s, {}).inputLog
    };
    var r = Moonstep.report(s, extra);
    return JSON.stringify(r, null, 1);
  }
  function copyReport() {
    var txt = buildReport();
    function fallback() { ta.value = txt; show(tov); setTimeout(function () { ta.focus(); ta.select(); }, 0); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { flash('Copied'); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }
  var flashT = 0;
  function flash(msg) { hCh.textContent = msg; clearTimeout(flashT); flashT = setTimeout(function () { hCh.textContent = ''; }, 1500); }
  function verify() {
    try {
      var r = Moonstep.replay(seed, s.log, s.opts || { tideScale: store.set.tide });
      goVer.textContent = Moonstep.hash(r) === Moonstep.hash(s) ? 'Replay: OK' : 'Replay: FAIL';
    } catch (e) { goVer.textContent = 'Replay: FAIL (' + e.message + ')'; }
  }

  // ---------- game over ----------
  function onOver() {
    overHandled = true;
    var h = Math.floor(s.height);
    var prev = store.best[seed] || 0;
    if (h > prev) store.best[seed] = h; // never downgrade
    store.attempts.push({ seed: seed, height: h, jumps: s.jumps, chain: s.bestChain, cause: s.cause });
    if (store.attempts.length > 20) store.attempts = store.attempts.slice(-20);
    save();
    au('over');
    au('charge', 0);
    var medal = Moonstep.medal(h);
    goTitle.textContent = medal ? medal + ' medal' : 'Run over';
    goInfo.textContent = '';
    el('div', 'big', goInfo, h + ' m');
    el('div', 'cause', goInfo, s.cause === 'tide' ? 'Swallowed by the tide' : 'Lost in space');
    var gr = el('div', 'grid', goInfo);
    [['Best', store.best[seed] + ' m'], ['Jumps', s.jumps], ['Chain', s.bestChain], ['Seed', seed]].forEach(function (x) {
      var d = el('div', null, gr); el('b', null, d, x[0]); d.appendChild(document.createTextNode(String(x[1])));
    });
    goVer.textContent = '';
    overAt = performance.now();
    goBtns.forEach(function (b) { b.disabled = true; });
    show(gov);
    setTimeout(function () { goBtns.forEach(function (b) { b.disabled = false; }); }, 600);
  }

  // ---------- HUD ----------
  var hudKey = '';
  function refreshHud() {
    var h = Math.floor(s.height), nb = null;
    for (var i = 0; i < BANDS.length; i++) if (h < BANDS[i][0]) { nb = BANDS[i]; break; }
    var cur = Moonstep.medal(h);
    var key = h + '|' + s.chain + '|' + seed + '|' + cur;
    if (key === hudKey) return;
    hudKey = key;
    hH.textContent = h + ' m';
    hM.textContent = (cur ? cur + '  ' : '') + (nb ? 'next ' + nb[1] + ' ' + nb[0] + ' m' : 'max medal') +
      '  |  best ' + (store.best[seed] || 0);
    hCf.style.width = Math.min(100, s.chain / 10 * 100) + '%';
    hS.textContent = 'seed ' + seed + (s.chain > 1 ? '  |  chain x' + s.chain : '');
  }

  // ---------- input ----------
  function inZone(y) { return y >= H * 0.58; }
  canvas.addEventListener('pointerdown', function (e) {
    if (paused || s.over || pointerId !== null) return;
    e.preventDefault();
    au('init');
    if (!inZone(e.clientY)) return;
    pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    down = true; pendDown = true; ignoreUntilUp = false;
    pdx = e.clientX; pdy = e.clientY; pdt = e.timeStamp;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerId !== pointerId || !down) return;
    var dx = e.clientX - pdx, dy = e.clientY - pdy, dt = e.timeStamp - pdt;
    if (Math.abs(dx) >= 40 && dt < 150 && Math.abs(dx) > Math.abs(dy)) {
      pendRev = true; pdx = e.clientX; pdy = e.clientY; pdt = e.timeStamp;
    } else if (dt >= 150) {
      pdx = e.clientX; pdt = e.timeStamp; // flick window slides; cancel anchor y stays
    }
    if (dy >= 60 && s.runner.charging) {
      pendCancel = true; pendDown = false; down = false; ignoreUntilUp = true;
    }
  });
  function up(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null; down = false; ignoreUntilUp = false;
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'p') setPaused(!paused);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && !s.over) setPaused(true); });

  // ---------- resize ----------
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    view = MoonDraw.makeView(W, H);
    view.dpr = dpr; view.w = W; view.h = H;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // ---------- sim ----------
  var inp = { down: false, reverse: false, cancel: false };
  // impact 0..1: pre-landing speed along the contact normal; falls back to speed/VMAX if body unknown
  function landImpact(r) {
    var b = r.body != null ? r.body : r.bodyId;
    if (typeof b === 'number') b = s.bodies[b];
    if (b && typeof b.x === 'number' && typeof b.y === 'number') {
      var nx = prevX - b.x, ny = prevY - b.y, l = Math.sqrt(nx * nx + ny * ny);
      if (l > 1e-6) return Math.min(1, Math.abs(prevVx * nx + prevVy * ny) / l / C.VMAX);
    }
    return Math.min(1, prevSpeed / C.VMAX);
  }
  function stepOne() {
    inp.down = down || pendDown;
    pendDown = false;
    inp.reverse = pendRev; inp.cancel = pendCancel;
    pendRev = false; pendCancel = false;
    Moonstep.tick(s, inp);
    simT += DT;
    // audio / event detection
    var r = s.runner;
    if (s.jumps > prevJumps) { au('jump'); prevJumps = s.jumps; }
    if (prevMode === 'air' && r.mode === 'rim') au('land', landImpact(r));
    if (s.chain > prevChain) au('chain', s.chain);
    prevChain = s.chain;
    prevMode = r.mode;
    prevSpeed = Math.sqrt(r.vx * r.vx + r.vy * r.vy);
    prevX = r.x; prevY = r.y; prevVx = r.vx; prevVy = r.vy;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt > 0 && !paused) {
      frameTimes.push(dt * 1000);
      if (frameTimes.length > 300) frameTimes.shift();
    }
    if (!paused && !s.over) {
      acc += dt;
      var n = 0;
      while (acc >= DT && n < 30 && !s.over) { stepOne(); acc -= DT; n++; }
      if (acc > DT * 30) acc = 0;
      if (s.over && !overHandled) onOver();
    }
    // audio per frame
    var r = s.runner;
    var ch01 = r.charging ? Math.min(1, r.charge / C.CHARGE_MAX) : 0;
    au('charge', paused || s.over ? 0 : ch01);
    au('tideLevel', paused || s.over ? 0 : Math.max(0, Math.min(1, 1 - (s.tideY - r.y) / 500)));
    // draw
    var pred = null;
    if (store.set.assist && r.charging && r.mode === 'rim' && !paused && !s.over) {
      pred = Moonstep.predict(s, r.charge, 60);
    }
    view.camY = MoonDraw.camera(s, view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    MoonDraw.frame(ctx, s, view, { pred: pred, charge01: ch01, reduced: reduced(), t: simT });
    refreshHud();
  }

  // ---------- boot ----------
  au('setEnabled', store.set.sound);
  resize();
  newRun(seed);
  window.__moon = {
    state: function () { return s; },
    step: function (n, i) {
      n = n || 1;
      for (var k = 0; k < n; k++) {
        var d = i || {};
        Moonstep.tick(s, { down: !!d.down, reverse: !!d.reverse, cancel: !!d.cancel });
      }
      if (s.over && !overHandled) onOver();
      return s;
    }
  };
  requestAnimationFrame(frame);
})();
