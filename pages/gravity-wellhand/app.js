/* Wellhand app.js (maker D): boot, input, loop, overlays, audio, report. Plain JS, global WH. */
(function () {
  'use strict';
  var WH = window.WH = window.WH || {};
  var VERSION = '0.1';
  var DT = 1 / 120, MAXSTEPS = 12;
  var PKEYS = ['S0', 'Smax', 'e', 'R', 'heatBase', 'heatRate', 'cool', 'ignite', 'offset'];

  function need(name) {
    var p = name.split('.'), o = window;
    for (var i = 0; i < p.length; i++) { o = o && o[p[i]]; }
    if (typeof o !== 'function' && !(o && typeof o === 'object')) {
      console.error('[wellhand] missing ' + name + ' (file not loaded or not built yet)');
      return false;
    }
    return true;
  }
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function el(tag, cls, txt, id) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (id) e.id = id;
    return e;
  }
  function btn(txt, cls, fn) {
    var b = el('button', cls || '', txt);
    b.type = 'button';
    b.addEventListener('click', function (ev) { ev.stopPropagation(); initAudio(); fn(ev); });
    return b;
  }

  var canvas = $('c'), ctx = null;
  var btnCopy = $('btnCopy'), btnPause = $('btnPause');
  var ov = $('ov');
  var q = new URLSearchParams(location.search);

  var app = { state: 'start', sim: null, startRun: null, pause: null, resume: null };
  window.WHAPP = app;

  var sim = null, fx = null, view = null;
  var attractSim = null;
  var inputLog = [], pending = [], acc = 0, lastT = 0;
  var runSeed = '1', runP = null, runW = 0, runH = 0;
  var attempts = [];
  var activePtr = null;
  var muted = false;
  var lastVerify = null;
  var tuningOpen = false;

  /* ---------- params ---------- */
  function loadParams() {
    var o = {};
    try { var s = localStorage.getItem('wh_params'); if (s) o = JSON.parse(s) || {}; } catch (e) { o = {}; }
    return o;
  }
  function saveParams(o) { try { localStorage.setItem('wh_params', JSON.stringify(o)); } catch (e) { } }
  function defaults() { return (WH.DEF && typeof WH.DEF === 'object') ? WH.DEF : {}; }
  function currentOverrides() {
    var o = loadParams(), r = {};
    for (var i = 0; i < PKEYS.length; i++) {
      var k = PKEYS[i];
      if (typeof o[k] === 'number' && isFinite(o[k])) r[k] = o[k];
    }
    return r;
  }

  /* ---------- audio ---------- */
  var actx = null;
  function initAudio() {
    if (actx || muted) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    } catch (e) { actx = null; }
    if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) { } }
  }
  function blip(f0, f1, dur, type, g) {
    if (muted || !actx) return;
    try {
      var t = actx.currentTime, o = actx.createOscillator(), gn = actx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      gn.gain.setValueAtTime(g || 0.08, t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn); gn.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  }
  function sound(k) {
    switch (k) {
      case 'capture': blip(660, 990, 0.12, 'sine', 0.09); break;
      case 'blast': blip(160, 50, 0.35, 'sawtooth', 0.12); break;
      case 'clash': blip(300, 180, 0.15, 'square', 0.06); break;
      case 'merge': blip(440, 880, 0.2, 'triangle', 0.09); break;
      case 'stall': blip(220, 70, 0.5, 'sawtooth', 0.1); break;
      case 'resume': blip(330, 660, 0.15, 'triangle', 0.07); break;
      case 'lost': blip(200, 120, 0.15, 'sine', 0.06); break;
      case 'over': blip(300, 40, 0.8, 'sawtooth', 0.12); break;
    }
  }

  /* ---------- toast ---------- */
  var toastEl = null, toastT = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = el('div', 'toast', '', 'toast');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#1c2640;color:#fff;padding:10px 16px;border-radius:10px;font:600 15px system-ui;z-index:50;pointer-events:none;transition:opacity .2s;opacity:0';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg; toastEl.style.opacity = '1';
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.style.opacity = '0'; }, 1600);
  }

  /* ---------- overlays ---------- */
  if (!ov) {
    ov = el('div', '', '', 'ov');
    ov.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(7,11,20,.82);z-index:20;overflow:auto';
    document.body.appendChild(ov);
    console.error('[wellhand] #ov missing in index.html; created fallback');
  }
  var cards = {};
  var seedInput, tuneBox, tuneInputs = {}, reportTA = {}, soundBtns = [];

  function mkCard(name) {
    var c = el('div', 'card', '', 'ov-' + name);
    c.style.display = 'none';
    ov.appendChild(c);
    cards[name] = c;
    return c;
  }
  function row() { return el('div', 'row'); }
  function para(t, st) { var p = el('p', '', t); if (st) p.style.cssText = st; return p; }
  function mkReportTA() {
    var t = el('textarea');
    t.readOnly = true; t.rows = 4; t.style.cssText = 'width:100%;box-sizing:border-box;font:11px monospace;display:none;margin-top:8px;background:#0b1220;color:#9fb3d9;border:1px solid #2a3556;border-radius:6px';
    return t;
  }
  function showOv(name) {
    if (!name) { ov.style.display = 'none'; ov.classList.remove('on'); return; }
    ov.style.display = 'flex'; ov.classList.add('on'); ov.hidden = false;
    for (var k in cards) cards[k].style.display = (k === name) ? '' : 'none';
  }
  function hideOv() { showOv(null); ov.hidden = true; }
  function soundLabel() { return 'Sound: ' + (muted ? 'off' : 'on'); }
  function toggleSound() {
    muted = !muted;
    if (!muted) initAudio();
    for (var i = 0; i < soundBtns.length; i++) soundBtns[i].textContent = soundLabel();
  }

  function buildTuning() {
    tuneBox = el('div', 'tune');
    tuneBox.style.cssText = 'display:none;margin-top:10px;text-align:left';
    var d = defaults(), ov0 = currentOverrides();
    PKEYS.forEach(function (k) {
      var r = row();
      var lab = el('label', '', k);
      lab.style.cssText = 'flex:0 0 80px;font:13px system-ui';
      var inp = el('input');
      inp.type = 'number'; inp.step = 'any';
      inp.style.cssText = 'flex:1;min-width:0;padding:6px;font:14px system-ui';
      inp.placeholder = d[k] == null ? 'auto' : String(d[k]);
      inp.value = (k in ov0) ? ov0[k] : '';
      inp.addEventListener('change', function () {
        var o = loadParams();
        var v = parseFloat(inp.value);
        if (isFinite(v)) o[k] = v; else delete o[k];
        saveParams(o);
      });
      r.appendChild(lab); r.appendChild(inp);
      tuneBox.appendChild(r);
      tuneInputs[k] = inp;
    });
    tuneBox.appendChild(para('Applies on next run. Empty = default.', 'font-size:12px;opacity:.7'));
    var rr = row();
    rr.appendChild(btn('Reset to default', '', function () {
      saveParams({});
      for (var k in tuneInputs) tuneInputs[k].value = '';
      toast('Tuning reset');
    }));
    tuneBox.appendChild(rr);
    return tuneBox;
  }

  function buildStart() {
    var c = mkCard('start');
    c.appendChild(el('h1', '', 'Wellhand'));
    c.appendChild(para('Hold to open a gravity well above your thumb. It pulls glowing orbs into the gold collectors.'));
    c.appendChild(para('Hold longer = stronger pull but more heat. Overheat and the well shuts down. Tap for a short light pull.'));
    c.appendChild(para('Keep orange triangles off the core. Pull two orbs together with a strong well to merge them.'));
    var r = row();
    var lab = el('label', '', 'Seed ');
    seedInput = el('input');
    seedInput.type = 'text'; seedInput.value = q.get('seed') || '1';
    seedInput.autocomplete = 'off'; seedInput.setAttribute('aria-label', 'seed');
    seedInput.style.cssText = 'padding:8px;font:16px system-ui;width:9em';
    lab.appendChild(seedInput);
    r.appendChild(lab);
    c.appendChild(r);
    var r2 = row();
    var b = btn('Start', 'pri', function () { startRun(seedInput.value || '1'); });
    b.id = 'btnStart';
    r2.appendChild(b);
    c.appendChild(r2);
  }

  function buildPause() {
    var c = mkCard('pause');
    c.appendChild(el('h2', '', 'Paused'));
    var r = row();
    var b1 = btn('Resume', 'pri', function () { resume(); }); b1.id = 'btnResume';
    r.appendChild(b1);
    r.appendChild(btn('Restart same seed', '', function () { startRun(runSeed); }));
    c.appendChild(r);
    var r2 = row();
    r2.appendChild(btn('Tuning', '', function () {
      tuningOpen = !tuningOpen; tuneBox.style.display = tuningOpen ? '' : 'none';
    }));
    var sb = btn(soundLabel(), '', toggleSound); soundBtns.push(sb);
    r2.appendChild(sb);
    r2.appendChild(btn('Copy report', '', function () { copyReport('pause'); }));
    c.appendChild(r2);
    c.appendChild(buildTuning());
    reportTA.pause = mkReportTA();
    c.appendChild(reportTA.pause);
  }

  var overParts = {};
  function buildOver() {
    var c = mkCard('over');
    c.appendChild(el('h2', '', 'Run over'));
    overParts.sum = para('', 'font-size:18px;font-weight:600');
    overParts.medal = para('');
    overParts.stats = para('', 'font-size:13px;opacity:.85;line-height:1.5');
    overParts.hist = el('div', 'hist');
    overParts.hist.style.cssText = 'margin:8px 0;text-align:left';
    overParts.verify = para('', 'font-size:13px');
    c.appendChild(overParts.sum); c.appendChild(overParts.medal);
    c.appendChild(overParts.stats); c.appendChild(overParts.hist);
    var r = row();
    var b1 = btn('Same seed again', 'pri', function () { startRun(runSeed); }); b1.id = 'btnSame';
    r.appendChild(b1);
    var b2 = btn('New seed', '', function () { startRun(nextSeed(runSeed)); }); b2.id = 'btnNew';
    r.appendChild(b2);
    c.appendChild(r);
    var r2 = row();
    r2.appendChild(btn('Copy report', '', function () { copyReport('over'); }));
    r2.appendChild(btn('Verify replay', '', function () { doVerify(); renderVerify(); }));
    var sb = btn(soundLabel(), '', toggleSound); soundBtns.push(sb);
    r2.appendChild(sb);
    c.appendChild(r2);
    c.appendChild(overParts.verify);
    reportTA.over = mkReportTA();
    c.appendChild(reportTA.over);
  }

  function nextSeed(s) {
    if (/^\d{1,9}$/.test(String(s))) return String(parseInt(s, 10) + 1);
    var h = '';
    for (var i = 0; i < 6; i++) h += Math.floor(Math.random() * 16).toString(16);
    return h;
  }

  function renderOver() {
    if (!sim) return;
    var r = sim.report();
    overParts.sum.textContent = 'Wave ' + r.wave + '   Score ' + r.score;
    overParts.medal.textContent = 'Medal: ' + (r.medal || 'none') + (r.badge ? '   Badge: ' + r.badge : '') + '   Seed: ' + runSeed;
    var s = r.stats || {};
    overParts.stats.textContent = 'Captures ' + s.captures + ' | Clashes ' + s.clashes + ' | Merges ' + s.merges +
      ' | Stalls ' + s.stalls + ' | Escapes ' + s.escapes + ' | Lost ' + s.lost + ' | Hits ' + s.hits +
      ' | Peak streak ' + s.peakStreak + ' | Max heat ' + Math.round(s.maxHeat || 0) +
      ' | Clean waves ' + s.cleanWaves + ' | Cold waves ' + s.coldWaves;
    var h = s.holdHist || [0, 0, 0, 0, 0], labs = ['<0.12s', '0.12-0.4', '0.4-1', '1-2', '>2s'];
    var mx = Math.max(1, Math.max.apply(null, h));
    overParts.hist.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      var rw = el('div'); rw.style.cssText = 'display:flex;align-items:center;gap:6px;font:12px system-ui;margin:2px 0';
      var l = el('span', '', labs[i]); l.style.cssText = 'flex:0 0 62px';
      var bar = el('span'); bar.style.cssText = 'display:inline-block;height:10px;border-radius:3px;background:#5ef0d0;width:' + Math.round(h[i] / mx * 150) + 'px';
      var n = el('span', '', String(h[i]));
      rw.appendChild(l); rw.appendChild(bar); rw.appendChild(n);
      overParts.hist.appendChild(rw);
    }
    renderVerify();
  }
  function renderVerify() {
    overParts.verify.textContent = lastVerify ? ('Replay verify: ' + (lastVerify.ok ? 'OK' : 'MISMATCH') + ' (' + lastVerify.replayHash + ')') : '';
  }

  /* ---------- report ---------- */
  function doVerify() {
    lastVerify = null;
    if (!sim || !need('WH.replay')) return null;
    try {
      var rep = sim.report();
      var rs = WH.replay(runSeed, runW, runH, runP, inputLog, sim.n);
      var rh = rs.report().hash;
      lastVerify = { replayHash: rh, ok: rh === rep.hash };
    } catch (e) { console.error('[wellhand] verify failed', e); lastVerify = { replayHash: 'error', ok: false }; }
    return lastVerify;
  }
  function summary() {
    var r = sim.report();
    return { seed: runSeed, wave: r.wave, score: r.score, medal: r.medal, badge: r.badge, integrity: r.integrity, time: r.time, hash: r.hash };
  }
  function buildReport() {
    var v = doVerify();
    var log = inputLog, trunc = false;
    if (log.length > 6000) { log = log.slice(log.length - 6000); trunc = true; }
    var run = sim ? sim.report() : null;
    var o = {
      game: 'wellhand', version: VERSION,
      device: { innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio || 1, ua: navigator.userAgent },
      run: run,
      attempts: attempts.slice(),
      inputLog: log,
      holdHist: run && run.stats ? run.stats.holdHist : null,
      tuning: runP ? runP : currentOverrides(),
      verify: v
    };
    if (trunc) o.truncated = true;
    return o;
  }
  function copyReport(where) {
    if (!sim) { toast('No run yet'); return; }
    var txt = JSON.stringify(buildReport());
    var ta = reportTA[where];
    if (ta) { ta.style.display = ''; ta.value = txt; }
    if (where === 'over') renderVerify();
    var done = function () { toast('Report copied'); };
    var fallback = function () {
      try {
        var t = document.createElement('textarea');
        t.value = txt; t.style.cssText = 'position:fixed;left:-999px;top:0';
        document.body.appendChild(t); t.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(t);
        if (ok) done(); else toast('Copy failed: select text below');
      } catch (e) { toast('Copy failed: select text below'); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  /* ---------- layout ---------- */
  function relayout() {
    if (!canvas || !need('WH.layout')) return;
    var s = sim || attractSim;
    if (!s) return;
    view = WH.layout(window.innerWidth, window.innerHeight, s.W, s.H);
    var dpr = view.dpr || window.devicePixelRatio || 1;
    canvas.style.width = view.cssW + 'px';
    canvas.style.height = view.cssH + 'px';
    var pw = Math.round(view.cssW * dpr), ph = Math.round(view.cssH * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
  }

  /* ---------- run control ---------- */
  function startRun(seed) {
    if (!need('WH.createSim')) return;
    initAudio();
    if (sim && app.state !== 'over' && sim.n > 0 && !sim.over) attempts.push(summary());
    runSeed = String(seed == null ? '1' : seed);
    runW = clamp(window.innerWidth, 300, 520);
    runH = Math.max(500, window.innerHeight);
    runP = currentOverrides();
    try { sim = WH.createSim(runSeed, runW, runH, runP); }
    catch (e) { console.error('[wellhand] createSim failed', e); return; }
    app.sim = sim;
    fx = need('WH.createFx') ? WH.createFx() : null;
    inputLog = []; pending = []; acc = 0; lastT = 0; activePtr = null; lastVerify = null;
    for (var k in reportTA) { reportTA[k].style.display = 'none'; reportTA[k].value = ''; }
    app.state = 'play';
    hideOv();
    relayout();
  }
  function pause() {
    if (app.state !== 'play') return;
    app.state = 'pause';
    pending = [];
    if (activePtr != null) { activePtr = null; }
    showOv('pause');
  }
  function resume() {
    if (app.state !== 'pause') return;
    app.state = 'play'; lastT = 0; acc = 0;
    // pointer was released implicitly: tell sim so the well does not stay held
    if (sim && sim.ptr && sim.ptr.down) pending.push(['u', sim.ptr.x, sim.ptr.y]);
    hideOv();
  }
  app.startRun = startRun; app.pause = pause; app.resume = resume;

  function finishRun() {
    app.state = 'over';
    attempts.push(summary());
    pending = [];
    activePtr = null;
    doVerify();
    renderOver();
    showOv('over');
  }

  /* ---------- input ---------- */
  function onPtr(type, e) {
    if (app.state !== 'play' || !sim || !view || !need('WH.viewToSim')) return;
    if (type === 'd') {
      if (activePtr != null) return;
    } else if (e.pointerId !== activePtr) return;
    var p = WH.viewToSim(view, e.clientX, e.clientY);
    if (type === 'd') {
      if (p.y < sim.topbar) return;
      activePtr = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { }
    }
    if (type === 'u') activePtr = null;
    if (type === 'm') {
      // coalesce consecutive moves
      var l = pending[pending.length - 1];
      if (l && l[0] === 'm') { l[1] = p.x; l[2] = p.y; return; }
    }
    pending.push([type, p.x, p.y]);
  }
  function bindInput() {
    if (!canvas) return;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) { initAudio(); e.preventDefault(); onPtr('d', e); });
    canvas.addEventListener('pointermove', function (e) { onPtr('m', e); });
    canvas.addEventListener('pointerup', function (e) { onPtr('u', e); });
    canvas.addEventListener('pointercancel', function (e) { onPtr('u', e); });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ---------- loop ---------- */
  function consumeEv() {
    if (!sim || !sim.ev || !sim.ev.length) return;
    for (var i = 0; i < sim.ev.length; i++) {
      var ev = sim.ev[i];
      if (fx && fx.add) { try { fx.add(ev); } catch (e) { } }
      sound(ev.k);
    }
    sim.ev.length = 0;
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (!lastT) lastT = t;
    var dt = Math.min(0.25, (t - lastT) / 1000);
    lastT = t;
    if (app.state === 'play' && sim) {
      acc += dt;
      var n = 0;
      while (acc >= DT && n < MAXSTEPS) {
        var evs = undefined;
        if (pending.length) {
          evs = pending; pending = [];
          for (var i = 0; i < evs.length; i++) inputLog.push([sim.n, evs[i][0], evs[i][1], evs[i][2]]);
        }
        sim.step(evs);
        consumeEv();
        acc -= DT; n++;
        if (sim.over) { finishRun(); break; }
      }
      if (n >= MAXSTEPS && acc > DT) acc = 0; // drop backlog
    }
    var s = sim || attractSim;
    if (fx && fx.update && app.state === 'play') { try { fx.update(dt); } catch (e) { } }
    if (s && ctx && view && WH.draw) {
      try { WH.draw(ctx, s, view, fx || attractFx, { paused: app.state !== 'play', showPred: false }); }
      catch (e) { if (!frame.err) { frame.err = 1; console.error('[wellhand] draw failed', e); } }
    }
  }
  var attractFx = null;

  /* ---------- boot ---------- */
  function boot() {
    if (!canvas) { console.error('[wellhand] canvas#c not found'); return; }
    ctx = canvas.getContext('2d');
    need('WH.createSim'); need('WH.replay'); need('WH.DEF');
    need('WH.createFx'); need('WH.layout'); need('WH.draw'); need('WH.viewToSim'); need('WH.runTests');

    buildStart(); buildPause(); buildOver();
    bindInput();

    if (WH.createSim) {
      try {
        attractSim = WH.createSim('attract', clamp(window.innerWidth, 300, 520), Math.max(500, window.innerHeight), { noSpawn: true });
      } catch (e) { console.error('[wellhand] attract sim failed', e); }
    }
    if (WH.createFx) { try { attractFx = WH.createFx(); } catch (e) { } }
    relayout();

    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', function () { setTimeout(relayout, 100); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
    window.addEventListener('blur', function () { /* keep running; visibility handles hide */ });

    if (btnPause) {
      btnPause.textContent = 'II';
      btnPause.addEventListener('click', function (e) {
        e.stopPropagation();
        if (app.state === 'play') pause(); else if (app.state === 'pause') resume();
      });
    }
    if (btnCopy) {
      btnCopy.textContent = 'Copy';
      btnCopy.addEventListener('click', function (e) {
        e.stopPropagation();
        copyReport(app.state === 'over' ? 'over' : 'pause');
      });
    }
    showOv('start');

    requestAnimationFrame(frame);

    if (q.get('test') === '1') {
      setTimeout(function () {
        if (!need('WH.runTests')) { document.title = 'WHTEST fail'; window.__wh_tests = { pass: false, error: 'WH.runTests missing' }; return; }
        try {
          var r = WH.runTests();
          window.__wh_tests = r;
          document.title = 'WHTEST ' + (r && r.pass ? 'pass' : 'fail');
        } catch (e) {
          console.error('[wellhand] runTests threw', e);
          window.__wh_tests = { pass: false, error: String(e) };
          document.title = 'WHTEST fail';
        }
      }, 0);
    }
    if (q.get('auto') === '1') startRun(q.get('seed') || '1');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
