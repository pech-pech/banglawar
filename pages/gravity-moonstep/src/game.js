/* Moonstep game.js: loop, input, HUD, overlays, storage, report. Uses Moonstep, MoonDraw, MoonAudio. */
(function () {
  'use strict';
  var C = Moonstep.C;
  var DT = C.DT;
  var KEY = 'moonstep.v1';

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var reducedMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reducedMQ && reducedMQ.matches) || !!store.set.reduce; }

  // ---------- storage ----------
  var store = { best: Object.create(null), attempts: [], set: { assist: true, sound: true, tide: 1, reduce: false }, flags: Object.create(null), cnt: Object.create(null), medals: Object.create(null) };
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (o.best && typeof o.best === 'object') for (var bk in o.best) if (typeof o.best[bk] === 'number') store.best[bk] = o.best[bk];
        if (Array.isArray(o.attempts)) store.attempts = o.attempts.slice(-20);
        if (o.set) for (var k in o.set) if (k !== '__proto__') store.set[k] = o.set[k];
        ['flags', 'cnt', 'medals'].forEach(function (f) { if (o[f] && typeof o[f] === 'object') for (var q in o[f]) if (f === 'flags' || typeof o[f][q] === 'number') store[f][q] = o[f][q]; });
        if (store.set.tide !== 0.75 && store.set.tide !== 1 && store.set.tide !== 1.25) store.set.tide = 1;
      }
    }
  } catch (e) {}
  function mergeFrom(raw) {
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      if (o.best && typeof o.best === 'object') for (var bk in o.best) if (typeof o.best[bk] === 'number' && !(o.best[bk] <= (store.best[bk] || 0))) store.best[bk] = o.best[bk];
      ['cnt', 'medals'].forEach(function (f) { if (o[f] && typeof o[f] === 'object') for (var q in o[f]) if (typeof o[f][q] === 'number' && !(o[f][q] <= (store[f][q] || 0))) store[f][q] = o[f][q]; });
      if (Array.isArray(o.attempts)) {
        var seen = {}; store.attempts.forEach(function (a) { seen[a && a.ts] = 1; });
        o.attempts.forEach(function (a) { if (a && typeof a === 'object' && !seen[a.ts]) { store.attempts.push(a); seen[a.ts] = 1; } });
        store.attempts.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
        store.attempts = store.attempts.slice(-20);
      }
    } catch (e) {}
  }
  function save(noMerge) {
    try {
      if (!noMerge) { var cur = localStorage.getItem(KEY); if (cur) mergeFrom(cur); }
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {}
  }
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && e.newValue) { mergeFrom(e.newValue); try { if (typeof ui !== 'undefined' && ui && ui.refresh) ui.refresh(); } catch (x) {} }
  });

  // ---------- audio helper ----------
  function au(fn) {
    var a = typeof MoonAudio !== 'undefined' ? MoonAudio : null;
    if (!a || typeof a[fn] !== 'function') return;
    try { a[fn].apply(a, Array.prototype.slice.call(arguments, 1)); } catch (e) {}
  }

  // ---------- fx ----------
  var fx = (typeof MoonFX !== 'undefined') ? MoonFX.make({ reduced: reduced() }) : null;
  if (reducedMQ && reducedMQ.addEventListener && typeof MoonFX !== 'undefined') {
    reducedMQ.addEventListener('change', function () { fx = MoonFX.make({ reduced: reduced() }); });
  }
  if (reducedMQ && reducedMQ.addEventListener) {
    reducedMQ.addEventListener('change', function () { try { ui.setReduced(reduced()); } catch (e) {} });
  }
  function fxe(name, d) { if (fx) { try { fx.event(name, d); } catch (e) {} } }
  function w2s(x, y) { return [view.w / 2 + x * view.scale, (y - view.camY) * view.scale]; }

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
  var prevMode = 'rim', prevJumps = 0, prevChain = 0, prevSpeed = 0, prevX = 0, prevY = 0, prevVx = 0, prevVy = 0, prevBounced = false, prevMilestone = 0, prevNear = false, prevDead = 0;
  var W = 0, H = 0, dpr = 1;

  function newRun(sd) {
    seed = sd;
    s = Moonstep.newRun(seed, { tideScale: store.set.tide });
    overHandled = false; acc = 0; paused = false;
    prevBounced = false; prevMilestone = 0; prevNear = false; prevDead = 0;
    if (fx) { fx.clearTrail(); fx = MoonFX.make({ reduced: reduced() }); }
    prevMode = 'rim'; prevJumps = 0; prevChain = 0; prevSpeed = 0; prevX = 0; prevY = 0; prevVx = 0; prevVy = 0;
    down = false; pendDown = false; pendRev = false; pendCancel = false; ignoreUntilUp = false;
    if (ui) ui.closeAll();
    try { var u = new URL(location.href); u.searchParams.set('seed', seed); history.replaceState(null, '', u); } catch (e) {}
    if (ui) refreshHud();
  }

  // ---------- medal bands: read from the engine at runtime (never typed here) ----------
  var _bands = null;
  function bands() {
    if (_bands) return _bands;
    var out = [], prev = '';
    for (var hh = 0; hh <= 100000; hh++) {
      var m = Moonstep.medal(hh);
      if (m !== prev) { if (m) out.push({ name: m, min: hh }); prev = m; }
    }
    _bands = out; return out;
  }
  function nextBand(h) { var b = bands(); for (var i = 0; i < b.length; i++) if (h < b[i].min) return b[i]; return null; }
  function bestOverall() {
    var mx = 0; for (var k in store.best) if (store.best[k] > mx) mx = store.best[k];
    return { h: mx, medal: Moonstep.medal(mx) };
  }
  function dailyInfo() { var sd = Moonstep.dailySeed(today()); return { seed: sd, done: store.best[sd] > 0 ? store.best[sd] : null }; }

  // ---------- install ----------
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; if (ui && ui.current() === 'title') ui.refresh(); });
  function standalone() { try { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { return false; } }
  function installState() {
    if (standalone()) return null;
    if (deferredPrompt) return 'prompt';
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    return null;
  }

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
      settings: store.set
    };
    return JSON.stringify(Moonstep.report(s, extra), null, 1);
  }
  function copyText(txt, done, fail) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(function () { if (done) done(); }, function () { if (fail) fail(); }); return; }
    } catch (e) {}
    if (fail) fail();
  }
  function copyReport(cb) {
    var txt = buildReport();
    copyText(txt, cb, function () { ui.showReport(txt); });
  }
  function verify() {
    if (!s.over) return null; // nothing to verify until the run has ended
    try {
      var r = Moonstep.replay(seed, s.log, s.opts);
      return Moonstep.hash(r) === Moonstep.hash(s) ? 'OK' : 'FAIL';
    } catch (e) { return 'FAIL'; }
  }

  // ---------- UI host ----------
  var ui = null;
  var host = {
    store: store, save: save, bands: bands, bestOverall: bestOverall, dailyInfo: dailyInfo,
    medalOf: function (h) { return Moonstep.medal(h); },
    randSeed: randSeed, seed: function () { return seed; },
    start: function (sd) { newRun(sd); },
    retry: function () { newRun(seed); },
    pause: function () { if (!s.over && !ui.blocking()) { ui.open('pause'); } },
    resume: function () { ui.closeAll(); },
    quit: function () { newRun(seed); ui.openRoot('title'); },
    runInfo: function () { var h = Math.floor(s.height); return { h: h, medal: Moonstep.medal(h) }; },
    setSet: function (k, v) {
      store.set[k] = v; save();
      if (k === 'sound') au('setEnabled', v);
      if (k === 'reduce') { ui.setReduced(reduced()); fx = (typeof MoonFX !== 'undefined') ? MoonFX.make({ reduced: reduced() }) : null; }
    },
    reset: function () { store.best = Object.create(null); store.attempts = []; store.cnt = Object.create(null); store.medals = Object.create(null); save(true); ui.refresh(); },
    copyText: function (t) { copyText(t); },
    copyReport: copyReport, verify: verify,
    installState: installState,
    install: function () { if (!deferredPrompt) return; try { deferredPrompt.prompt(); deferredPrompt = null; } catch (e) {} },
    onBlock: function (b) {
      paused = b;
      if (b) { down = false; pointerId = null; au('charge', 0); } else { last = 0; }
    }
  };

  // ---------- game over ----------
  function onOver() {
    overHandled = true; attemptNo++;
    var h = Math.floor(s.height);
    var prev = store.best[seed] || 0;
    if (h > prev) store.best[seed] = h; // never downgrade
    store.cnt[seed] = (store.cnt[seed] || 0) + 1;
    store.attempts.push({ seed: seed, height: h, jumps: s.jumps, chain: s.bestChain, cause: s.cause, ts: Date.now() });
    if (store.attempts.length > 20) store.attempts = store.attempts.slice(-20);
    var medal = Moonstep.medal(h);
    if (medal) store.medals[medal] = (store.medals[medal] || 0) + 1;
    save();
    au('over');
    fxe('over', { x: s.runner.x, y: s.runner.y, cause: s.cause });
    au('charge', 0);
    if (medal) setTimeout(function () { au('medal', String(medal).toLowerCase()); }, 350);
    overAt = performance.now();
    ui.open('results', { h: h, medal: medal, cause: s.cause, newBest: h > prev, prev: prev, best: store.best[seed] || 0, seed: seed, next: nextBand(h), overAt: overAt });
  }

  // ---------- HUD ----------
  function refreshHud() {
    var r = s.runner, h = Math.floor(s.height);
    ui.hud({
      h: h, medal: Moonstep.medal(h), next: nextBand(h), chain: s.chain, seed: seed,
      gap: (s.tideY - r.y) / 10, tideScreenY: w2s(0, s.tideY)[1], viewH: H,
      hint: store.attempts.length < 3 && s.jumps < 1
    });
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
    if (e.key !== 'Escape' && e.key !== 'p') return;
    var c = ui.current();
    if (c === 'pause') host.resume();
    else if (ui.blocking()) { if (e.key === 'Escape' && ui.hasBack()) ui.back(); }
    else host.pause();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && !s.over && !ui.blocking()) host.pause(); });

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
    // audio / fx event detection from state diffs
    var r = s.runner, i, b;
    if (s.jumps > prevJumps) {
      var jl = s.jumpLog[s.jumpLog.length - 1];
      au('jump');
      fxe('jump', { x: prevX, y: prevY, charge01: jl && typeof jl.charge === 'number' ? Math.min(1, jl.charge / C.CHARGE_MAX) : 0 });
      prevJumps = s.jumps;
    }
    if (prevMode === 'air' && r.mode === 'rim') {
      var imp = landImpact(r);
      au('land', imp * C.VMAX);
      fxe('land', { x: r.x, y: r.y, vn: imp * C.VMAX, body: r.body });
      if (fx) fx.clearTrail();
    }
    if (r.mode === 'air' && r.bounced && !prevBounced) { au('bounce'); fxe('bounce', { x: r.x, y: r.y }); }
    prevBounced = r.mode === 'air' && r.bounced;
    if (s.chain > prevChain) { au('chain', s.chain); fxe('chain', { x: r.x, y: r.y, n: s.chain }); }
    prevChain = s.chain;
    var dead = 0, nearNow = false;
    for (i = 0; i < s.bodies.length; i++) {
      b = s.bodies[i];
      if (b.kind === 'crumble' && b.dead) { dead++; if (dead > prevDead) { au('crumble'); fxe('crumble', { x: b.x, y: b.y }); } }
      if (r.mode === 'air' && !b.dead && b.id !== s.owner) {
        var ddx = r.x - b.x, ddy = r.y - b.y, dd = Math.sqrt(ddx * ddx + ddy * ddy) - b.r - C.RUNNER_R;
        if (dd < 14) nearNow = true;
      }
    }
    prevDead = dead;
    if (nearNow && !prevNear) au('near');
    prevNear = nearNow;
    var ms = Math.floor(s.height / 100);
    if (ms > prevMilestone) { au('tick'); prevMilestone = ms; }
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
      if (!(fx && fx.pause() > 0)) acc += dt;
      var n = 0;
      while (acc >= DT && n < 30 && !s.over && !(fx && fx.pause() > 0)) { stepOne(); acc -= DT; n++; }
      if (acc > DT * 30) acc = 0;
      if (s.over && !overHandled) onOver();
    }
    if (fx) fx.update(dt);
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
    if (fx) {
      if (r.mode === 'air' && !s.over && !paused && dt > 0) fx.trail(r.x, r.y);
      ctx.setTransform(view.dpr || 1, 0, 0, view.dpr || 1, 0, 0);
      fx.draw(ctx, view, w2s);
      var sh = fx.shake();
      canvas.style.transform = (sh.x || sh.y) ? 'translate(' + sh.x.toFixed(1) + 'px,' + sh.y.toFixed(1) + 'px)' : '';
    }
    refreshHud();
  }

  // ---------- boot ----------
  au('setEnabled', store.set.sound);
  document.documentElement.classList.toggle('u-rm', reduced());
  resize();
  newRun(seed);
  ui = MoonUI.create(host);
  ui.setReduced(reduced());
  ui.openRoot('title');
  window.__moon = {
    screen: function () { return ui.current(); },
    ui: function () { return ui; },
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
