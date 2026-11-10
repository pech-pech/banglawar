(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Boot, layout, fixed 60 Hz loop, hit-stop, pause, overlays and the window.__pv test hook.
var $ = function(id){ return document.getElementById(id); };
var Q = new URLSearchParams(location.search);
var STEP_MS = 1000 / 60, MAX_STEPS = 5;
var S = null, R = null, list = [], view = { w: 344, h: 882, dpr: 1, ox: 0, oy: 66, s: 38 };
var moved = false, acc = 0, last = 0, hitstopUntil = 0, paused = false, frozen = Q.get('freeze') === '1';
var shown = { pick: false, dead: false, supply: false, endPhase: '' }, deadAt = 0, deaths = 0;
// Deploy home (S-10, minimal) is the first screen; ?home=0 skips it (tests and bots). The sim waits behind it.
var home = Q.get('home') !== '0';   // V.Home (home.js) owns the screens; V.Run below is its handle on the run
var ft = [], FT_MAX = 1200, gaps = 0, frames = 0;

function fail(t){ $('bootMsg').textContent = t; UI.show('ovBoot', true); console.warn('volley:', t); }
var UI = V.UI;

// ---------- layout ----------
// Scaled frame (pick 1, spec 05 s1 / 08 s2): the whole game (Home and run) is one 344 x 882 frame. scale = min(usable W / 344,
// usable H / 882), usable = window minus safe-area insets (L-PV-13); centred; the spare sides are flat bars (body background).
// Layout inside the frame never changes with the device. Canvas pixels = shown frame x devicePixelRatio, capped at 2 (render2d/gpu cap).
var FRAME_W = 344, FRAME_H = 882, BERM_PX = 30, sbProbe = null;   // BERM_PX: sandbag rows + their shadow below the room line (scene.js drawRoomEdge reaches ~y0+27)
var frame0 = { scale: 1, left: 0, top: 0, vw: 0, vh: 0 }, laidOut = false;
var RESIZE_PAUSE = 0.02;   // guess: a scale change above 2% (fold, unfold, rotate) pauses a run (spec 05 s1); smaller ones (URL bar jitter) do not
function safeInsets(){
  if (!sbProbe) { sbProbe = document.createElement('div'); sbProbe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(sbProbe); }
  var cs = getComputedStyle(sbProbe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function layout(){
  var W = G.innerWidth, H = G.innerHeight, st = $('stage'), ins = safeInsets();
  var uw = Math.max(1, W - ins.l - ins.r), uh = Math.max(1, H - ins.t - ins.b);
  var sc = Math.min(uw / FRAME_W, uh / FRAME_H);
  var left = ins.l + (uw - FRAME_W * sc) / 2, top = ins.t + (uh - FRAME_H * sc) / 2;
  var prev = frame0.scale;
  frame0.scale = sc; frame0.left = left; frame0.top = top; frame0.vw = W; frame0.vh = H;
  st.style.width = FRAME_W + 'px'; st.style.height = FRAME_H + 'px';
  st.style.transform = 'translate(' + left + 'px,' + top + 'px) scale(' + sc + ')';
  st.style.setProperty('--pv-scale', String(sc));
  var w = FRAME_W, h = FRAME_H;
  var hud = $('hud').offsetHeight || 62;   // offsetHeight is in frame units (transforms do not change it)
  // Contain fit inside the frame: the room (9x15 tiles) plus the berm below it must sit under the HUD. Safe areas are outside the frame now.
  var oy = hud + 2, s = Math.min(w / 9, (h - oy - BERM_PX) / 15);
  view.w = w; view.h = h; view.dpr = (G.devicePixelRatio || 1) * sc; view.s = s; view.ox = (w - 9 * s) / 2; view.oy = oy;
  view.scale = sc; view.left = left; view.top = top; view.vw = W; view.vh = H;
  if (R) R.resize(w, h, view.dpr);
  UI.placeToast(view);
  if (laidOut && Math.abs(sc - prev) / prev > RESIZE_PAUSE && S && !home && !isEnd() && (S.phase === 'play' || S.phase === 'clear')) pause();
  laidOut = true;
}
// Screen (client) px -> frame units. Input steering is relative, so only the scale matters for drags; taps on DOM are mapped by the browser.
function toFrame(cx, cy){ return { x: (cx - frame0.left) / frame0.scale, y: (cy - frame0.top) / frame0.scale }; }
V.Frame = { W: FRAME_W, H: FRAME_H, toFrame: toFrame, get scale(){ return frame0.scale; }, get left(){ return frame0.left; }, get top(){ return frame0.top; } };

// ---------- events from the sim ----------
function vib(ms){
  var ua = navigator.userActivation;   // vibrate before any tap logs a console error in Chrome
  if (V.TUNE.HAPTICS && ms > 0 && navigator.vibrate && (!ua || ua.hasBeenActive)) { try { navigator.vibrate(ms); } catch (_) {} }
}
function handleEvents(ev, live){
  if (!ev) return;
  var stop = false;
  for (var i = 0; i < ev.length; i++) {
    var e = ev[i];
    switch (e.k) {
      case 'fire': V.Audio.play('fire'); break;
      case 'hit': V.Audio.play('hit'); stop = true; break;
      case 'crit': UI.crit(e.x, e.y, e.dmg, view, S, e.id); stop = true; break;
      case 'kill': V.Audio.play('kill'); vib(V.TUNE.HAPTIC_KILL_MS); stop = true; break;
      case 'hurt': V.Audio.play('hurt'); UI.hurtFlash(); vib(V.TUNE.HAPTIC_HURT_MS); break;
      case 'door': V.Audio.play('door'); awReset(); UI.toast('Stage ' + S.stage + ' clear', 1100); break;
      case 'room': { awReset(); var rm = V.ROOMS && V.ROOMS[S.roomId]; UI.toast('Stage ' + S.stage + (rm ? ': ' + rm.name : ''), 1500); break; }
      case 'levelup': V.Audio.play('levelup'); UI.toast('Level up', 1200); break;
      case 'death': deaths++; break;
      case 'supply': V.Audio.play('door'); break;
      case 'chest': V.Audio.play('levelup'); UI.toast('Cache open', 1400); break;
      case 'boss': UI.toast('Boss: ' + ((S.boss && S.boss.name) || 'incoming'), 1800); break;
      case 'bossphase': V.Audio.play('hurt'); UI.toast('Boss phase 2', 1400); break;
      case 'win': V.Audio.play('levelup'); break;
    }
  }
  if (stop && live && V.TUNE.HITSTOP_MS > 0) hitstopUntil = performance.now() + V.TUNE.HITSTOP_MS;
}
function simStep(inp, live){ V.Sim.step(S, inp); if (V.Scene && V.Scene.ingest) V.Scene.ingest(S.events, S); handleEvents(S.events, live); }

// ---------- overlays ----------
function isEnd(){ return S.phase === 'results' || S.phase === 'dead'; }
function syncPhase(){
  if (S.phase === 'pick' && S.cards) {
    if (!shown.pick) { shown.pick = true; V.Input.release(); UI.cards(S, pick); }
  } else if (shown.pick) { shown.pick = false; UI.show('ovCards', false); }
  if (S.phase === 'supply' && S.supply) {
    if (!shown.supply) { shown.supply = true; V.Input.release(); UI.supply(S, pickSupply); }
  } else if (shown.supply) { shown.supply = false; UI.show('ovSupply', false); }
  // P1: death and boss kill both end in 'results'. A brief 'dead' phase (if the sim has one) shows the same screen.
  if (isEnd()) {
    if (!shown.dead || shown.endPhase !== S.phase) { shown.dead = true; shown.endPhase = S.phase; deadAt = deadAt || performance.now(); V.Input.release(); UI.results(S); }
    var armed = performance.now() - deadAt >= RESULTS_GUARD_MS, ovd = $('ovDead');
    if (ovd.classList.contains('armed') !== armed) ovd.classList.toggle('armed', armed);
  } else if (shown.dead) { shown.dead = false; deadAt = 0; $('ovDead').classList.remove('armed'); UI.show('ovDead', false); }
}
function pickSupply(i){
  if (!S || S.phase !== 'supply') return;
  var f = V.Sim.pickSupply || V.Sim.supply;
  if (f) f(S, i); else V.Sim.pick(S, i);
  if (V.Scene && V.Scene.ingest) V.Scene.ingest(S.events, S);
  handleEvents(S.events, false);
  shown.supply = false; UI.show('ovSupply', false);
  syncPhase();
}
function pick(i){
  if (!S || S.phase !== 'pick') return;
  V.Sim.pick(S, i);
  if (V.Scene && V.Scene.ingest) V.Scene.ingest(S.events, S);
  handleEvents(S.events, false);
  shown.pick = false; UI.show('ovCards', false);
  syncPhase();                                           // another pending level shows the next card screen
}
function restart(){
  S = V.Sim.restart(S); V.Audio.seed(S.seed);
  acc = 0; hitstopUntil = 0; deadAt = 0; moved = false; awReset(); shown.dead = false; UI.show('ovDead', false); shown.pick = false; UI.show('ovCards', false); shown.supply = false; UI.show('ovSupply', false);
  syncPhase(); return S;
}
// Results tap guard: the screen waits RESULTS_GUARD_MS, and only a press that BEGAN after that counts,
// so a finger still on the glass from the fight (or a tap just after the kill) never skips the results.
var RESULTS_GUARD_MS = 1000;
function guardOk(pressT){ return !!(S && isEnd() && deadAt && pressT - deadAt >= RESULTS_GUARD_MS); }
function tryRestart(pressT){ if (guardOk(pressT == null ? performance.now() : pressT)) restart(); }
var resPressAt = 0;

// Handoff with home.js: setHome freezes the sim behind the home screens; start() begins a run at stage 1 (fresh unless S is untouched).
V.Run = {
  setHome: function(on){ home = !!on; if (on) V.Input.release(); acc = 0; last = 0; },
  start: function(){ if (!S) return; if (isEnd() || S.t > 0) restart(); home = false; V.Input.release(); acc = 0; last = 0; moved = false; },
  get home(){ return home; }
};
function pause(){
  if (paused || !S || home) return;
  paused = true; V.Input.release(); V.Audio.setPaused(true); UI.show('ovPause', true);
  if (R) UI.rendererLabel(R, view);   // the card carries the renderer label at once, not only after the next hud() frame (slow host flake)
}
function resume(){
  if (!paused) return;
  paused = false; acc = 0; last = 0; hitstopUntil = 0; V.Audio.setPaused(false); UI.show('ovPause', false);
}

// ---------- auto-walk to the open door (M's pick 3) ----------
var aw = { idle: 0, cancelled: false, on: false };
function awReset(){ aw.idle = 0; aw.cancelled = false; aw.on = false; }
function tileBlocked(S, tx, ty, spikes){
  var a = S.room.solids, cx = tx + 0.5, cy = ty + 0.5;
  for (var i = 0; i < a.length; i++) { var b = a[i]; if (cx > b.x - 0.3 && cx < b.x + b.w + 0.3 && cy > b.y - 0.3 && cy < b.y + b.h + 0.3) return true; }
  if (spikes && S.hazards) for (var j = 0; j < S.hazards.length; j++) { var h = S.hazards[j]; if (cx > h.x && cx < h.x + h.w && cy > h.y && cy < h.y + h.h) return true; }
  return false;
}
function doorPath(S, avoidSpikes){
  var W = S.room.w || 9, H = S.room.h || 15, d = S.room.door, h = S.hero;
  var gx = Math.floor(d.x + d.w / 2), gy = Math.floor(d.y + d.h / 2), sx = Math.min(W - 1, Math.max(0, Math.floor(h.x))), sy = Math.min(H - 1, Math.max(0, Math.floor(h.y)));
  var prev = new Int16Array(W * H).fill(-1), q = [sy * W + sx]; prev[sy * W + sx] = sy * W + sx;
  for (var qi = 0; qi < q.length; qi++) {
    var c = q[qi], cx = c % W, cy = (c / W) | 0;
    if (cx === gx && cy === gy) break;
    var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var k = 0; k < 4; k++) {
      var nx = cx + nb[k][0], ny = cy + nb[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      var ni = ny * W + nx; if (prev[ni] !== -1) continue;
      if (!(nx === gx && ny === gy) && tileBlocked(S, nx, ny, avoidSpikes)) continue;
      prev[ni] = c; q.push(ni);
    }
  }
  var g = gy * W + gx; if (prev[g] === -1) return null;
  var path = []; for (var p = g; p !== sy * W + sx; p = prev[p]) path.push(p); path.reverse();
  return path.map(function(i){ return { x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 }; });
}
function doorDir(){
  var h = S.hero, d = S.room.door, tx = d.x + d.w / 2, ty = d.y + d.h / 2;
  if (!(V.Sim.clearLine && V.Sim.clearLine(S, h.x, h.y, tx, ty, 0.36))) {
    var path = doorPath(S, true) || doorPath(S, false);
    if (path && path.length) {
      var t = path[0];
      for (var i = path.length - 1; i >= 0; i--) if (V.Sim.clearLine(S, h.x, h.y, path[i].x, path[i].y, 0.36)) { t = path[i]; break; }
      tx = t.x; ty = t.y;
    }
  }
  var dx = tx - h.x, dy = ty - h.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
  return { mx: dx / l, my: dy / l };
}
function autoWalkInput(inp, dtS){
  if (S.phase !== 'clear' || !V.TUNE.AUTO_WALK || aw.cancelled) { aw.idle = 0; return inp; }
  if (V.Input.down || inp.mx || inp.my) { aw.idle = 0; return inp; }
  aw.idle += dtS;
  if (aw.idle < (V.TUNE.AUTO_WALK_DELAY || 0)) return inp;
  var dir = doorDir(), h = S.hero;
  if (!aw.on) { aw.on = true; V.Input.note('aw', h.x * 10, h.y * 10); }
  return dir;
}

// ---------- loop ----------
function frame(ts){
  requestAnimationFrame(frame);
  var dt = last ? ts - last : STEP_MS; last = ts;
  if (!S || !R) return;
  var running = !home && !paused && !frozen && !UI.drawerOpen() && (S.phase === 'play' || S.phase === 'clear');
  if (!paused && !document.hidden) {
    frames++; ft.push(dt); if (ft.length > FT_MAX) ft.shift(); if (dt > 50 && frames > 3) gaps++;
  }
  if (running) {
    if (ts < hitstopUntil) acc = 0;
    else {
      acc += Math.min(dt, 250);
      var n = 0;
      while (acc >= STEP_MS && n < MAX_STEPS) {
        simStep(autoWalkInput(V.Input.read(), 1 / 60), true); acc -= STEP_MS; n++;
        if (hitstopUntil > ts || (S.phase !== 'play' && S.phase !== 'clear')) { acc = 0; break; }
      }
      if (n >= MAX_STEPS) acc = 0;                       // never chase a long stall (L-LOL-2)
    }
  } else if (!paused && !frozen && !UI.drawerOpen()) {
    // pick/dead: the sim may still animate; nothing to step here
  }
  syncPhase();
  draw();
}
function draw(){
  V.Scene.build(S, view, list);
  R.draw(list, view);
  UI.hud(S, R, view);
  if (!moved && (V.Input.active || S.stage > 1)) moved = true;
  UI.howto(!moved && S.phase === 'play', view);
}

function pct(a, p){ if (!a.length) return 0; var b = a.slice().sort(function(x, y){ return x - y; }); return Math.round(b[Math.min(b.length - 1, Math.floor(p * b.length))] * 10) / 10; }
function metrics(){
  return { S: S, renderer: R ? R.name + (R.why ? ' (' + R.why + ')' : '') : 'none', viewport: Math.round(view.w) + 'x' + Math.round(view.h),
    frame: { p50: pct(ft, 0.5), p95: pct(ft, 0.95), max: Math.round(Math.max.apply(null, ft.concat([0])) * 10) / 10, n: ft.length },
    gaps: gaps, deaths: deaths };
}

// ---------- boot ----------
function boot(){
  if (!V.Sim || !V.Scene || !V.Render || !V.TUNE) { fail('Missing parts: ' + ['Sim', 'Scene', 'Render', 'TUNE'].filter(function(k){ return !V[k]; }).join(', ')); return; }
  UI.init({ metrics: metrics, onDrawer: function(on){ if (on) V.Input.release(); acc = 0; last = 0; } });
  var stage = $('stage');
  V.Input.attach(document.body, V.TUNE);   // body, not #stage: in a run a touch that starts in a bar steers too (spec 05 s1)
  layout();
  G.addEventListener('resize', layout);
  if (G.visualViewport) G.visualViewport.addEventListener('resize', layout);

  var seed = Q.has('seed') ? (parseInt(Q.get('seed'), 10) | 0) : (Date.now() % 1000000);
  var stress = parseInt(Q.get('stress') || '0', 10) | 0; if (stress > 0) V.Scene.stress = stress;
  S = V.Sim.create(seed, V.TUNE); V.Audio.seed(seed);

  document.addEventListener('visibilitychange', function(){ if (document.hidden) pause(); });
  G.addEventListener('blur', pause);
  G.addEventListener('pagehide', pause);
  $('ovPause').addEventListener('pointerdown', function(e){ if (e.target.closest && e.target.closest('button')) return; e.preventDefault(); resume(); });
  $('btnHome').addEventListener('click', function(e){ if (guardOk(e.detail === 0 ? performance.now() : (resPressAt > deadAt ? resPressAt : 0)) && V.Home) V.Home.show(); });
  $('btnResume').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', function(){ pause(); });
  $('btnRestartRun').addEventListener('click', function(e){ e.stopPropagation(); restart(); resume(); });
  $('btnTune').addEventListener('click', function(e){ e.stopPropagation(); UI.openDrawer(true); });
  // Any touch during the clear phase cancels auto-walk for this room.
  stage.addEventListener('pointerdown', function(e){
    if (S && S.phase === 'clear' && !aw.cancelled && !(e.target.closest && e.target.closest('button, .ov, #drawer'))) { aw.cancelled = true; V.Input.note(aw.on ? 'awx' : 'awc', 0, 0); }
  }, true);
  $('ovDead').addEventListener('pointerdown', function(e){ resPressAt = performance.now(); });
  // A click counts only when its press began on this screen after the guard (keyboard clicks have detail 0).
  $('btnRestart').addEventListener('click', function(e){ tryRestart(e.detail === 0 ? performance.now() : (resPressAt > deadAt ? resPressAt : 0)); });
  G.addEventListener('keydown', function(e){
    if (paused && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) { resume(); return; }
    if (S && isEnd() && !e.repeat && (e.key === ' ' || e.key === 'Enter' || e.key === 'r')) tryRestart();
    if (S && S.phase === 'supply' && /^[1-2]$/.test(e.key) && S.supply && +e.key <= S.supply.length) pickSupply(+e.key - 1);
    if (S && S.phase === 'pick' && /^[1-3]$/.test(e.key) && S.cards && +e.key <= S.cards.length) pick(+e.key - 1);
  });

  V.Render.create({ c2d: $('c2d'), cgpu: $('cgpu'), forceCanvas: Q.get('gpu') === '0' }).then(function(r){
    R = r; layout();
    if (R.onChange) R.onChange(function(){ layout(); UI.rendererLabel(R, view); });
    UI.show('ovBoot', false);
    syncPhase();
    requestAnimationFrame(frame);
  }).catch(function(e){ console.error(e); fail('Renderer failed: ' + (e && e.message)); });

  G.__pv = {
    get renderer(){ return R ? R.name : 'none'; },
    get rendererWhy(){ return R ? R.why : ''; },
    get R(){ return R; },
    get S(){ return S; },
    get paused(){ return paused; },
    get view(){ return view; },
    get frame(){ return { scale: frame0.scale, left: frame0.left, top: frame0.top, w: FRAME_W * frame0.scale, h: FRAME_H * frame0.scale, vw: frame0.vw, vh: frame0.vh }; },
    toFrame: toFrame,
    get frozen(){ return frozen; },
    get autoWalk(){ return { idle: aw.idle, cancelled: aw.cancelled, on: aw.on }; },
    get lastCopy(){ return UI.lastCopy; },
    step: function(n, inp){
      n = n || 1; inp = inp || { mx: 0, my: 0 };
      for (var i = 0; i < n; i++) simStep(typeof inp === 'function' ? inp(S) : inp, false);
      syncPhase(); if (R) draw(); return S;
    },
    pick: function(i){ pick(i); return S; },
    doorDir: function(){ return S ? doorDir() : { mx: 0, my: 0 }; },  // same path the auto-walk uses
    pickSupply: function(i){ pickSupply(i); return S; },
    restart: function(){ return restart(); },
    get home(){ return home; },
    readback: function(){ return R && R.readback ? R.readback() : Promise.resolve(null); },
    freeze: function(on){ frozen = on !== false; acc = 0; return frozen; },  // stop real-time stepping (deterministic tests)
    pause: pause, resume: resume,
    drawer: function(on){ UI.openDrawer(on); },
    report: function(){ return UI.report(); },
    metrics: metrics,
    hash: function(){ return V.Sim.hash ? V.Sim.hash(S) : null; },
    tune: V.TUNE,
    input: V.Input,
    audio: V.Audio,
    build: UI.BUILD
  };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
