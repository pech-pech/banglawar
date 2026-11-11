(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Boot, layout, fixed 60 Hz loop, hit-stop, pause, overlays and the window.__pv test hook.
var $ = function(id){ return document.getElementById(id); };
var Q = new URLSearchParams(location.search);
var STEP_MS = 1000 / 60, MAX_STEPS = 5;
var S = null, R = null, list = [], view = { w: 344, h: 882, dpr: 1, ox: 0, oy: 64, s: 38.2, scale: 1, C: 9 };
var moved = false, acc = 0, last = 0, hitstopUntil = 0, paused = false, frozen = Q.get('freeze') === '1';
var shown = { pick: false, dead: false, supply: false, endPhase: '' }, deadAt = 0, deaths = 0;
// Deploy home (S-10, minimal) is the first screen; ?home=0 skips it (tests and bots). The sim waits behind it.
var home = Q.get('home') !== '0';   // V.Home (home.js) owns the screens; V.Run below is its handle on the run
var ft = [], FT_MAX = 1200, gaps = 0, frames = 0;

function fail(t){ $('bootMsg').textContent = t; UI.show('ovBoot', true); console.warn('volley:', t); }
var UI = V.UI;

// ---------- layout (R42 stepped room, pick 43; FULLSCREEN-LAYOUT section 1) ----------
// No scaled frame: #stage is the whole viewport in CSS px at scale 1. The room is 15 rows tall and C = 9, 11, 13 or 15 columns wide:
//   playH = H - 64 - insetTop - insetBottom, Wu = W - insetL - insetR (L-PV-13), t0 = min(playH / 15, 64),
//   C = clamp(nextOdd(ceil(Wu / t0 - 1)), 9, 15), tile = min(t0, Wu / C).
// The room is centred horizontally and starts under the 64 px HUD band; spare height below it is the ground apron.
// C is read by the sim at room entry only (opts.colsFn). A resize inside a room pauses, keeps S.cols and refits the tile.
var HUD_H = 64, TILE_MAX = 64, ROWS = 15, C_MIN = 9, C_MAX = 15, W_WIDE = 600, H_SHORT = 720, sbProbe = null;
var RESIZE_PAUSE = 0.02;   // guess (kept from f0-3): a change above 2% of width, height or tile (fold, unfold, rotate, toolbar) pauses a run; URL-bar jitter under 2% does not
var vp = { W: 0, H: 0, ins: { t: 0, r: 0, b: 0, l: 0 } }, laidOut = false, fitNow = null;
function safeInsets(){
  if (!sbProbe) { sbProbe = document.createElement('div'); sbProbe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(sbProbe); }
  var cs = getComputedStyle(sbProbe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function nextOdd(x){ var n = Math.ceil(x - 1e-9); return (n % 2 === 1 || n % 2 === -1) ? n : n + 1; }   // smallest odd whole number >= x (1e-9: float noise)
function normIns(ins){ ins = ins || {}; return { t: +ins.t || 0, r: +ins.r || 0, b: +ins.b || 0, l: +ins.l || 0 }; }
// Pure: the whole R42 fit for a viewport. C forces the column count (a room already entered); omitted = the count for this viewport.
function fitFor(W, H, insets, C){
  var ins = normIns(insets);
  var Wu = Math.max(1, W - ins.l - ins.r), playH = Math.max(1, H - HUD_H - ins.t - ins.b);
  var t0 = Math.min(playH / ROWS, TILE_MAX);
  var Cv = Math.max(C_MIN, Math.min(C_MAX, nextOdd(Wu / t0 - 1)));
  var c = C || Cv, tile = Math.min(t0, Wu / c), roomW = c * tile, roomH = ROWS * tile;
  var ox = ins.l + (Wu - roomW) / 2, oy = ins.t + HUD_H;
  return { W: W, H: H, Wu: Wu, playH: playH, insets: ins, t0: t0, C: c, Cview: Cv, tile: tile, ox: ox, oy: oy, roomW: roomW, roomH: roomH,
    apron: Math.max(0, H - ins.b - oy - roomH), sideWall: (Wu - roomW) / 2, clamped: Wu / t0 > C_MAX + 1,
    widthClass: W < W_WIDE ? 'w-narrow' : 'w-wide', short: H < H_SHORT };
}
function colsFor(W, H, insets){ return fitFor(W, H, insets).Cview; }
function roomCols(){ return (S && (S.cols || (S.room && S.room.w))) || 0; }
// Shared read-only view of the current layout (contract: V.Layout, owner B). cols() = the column count a room entered now would get.
V.Layout = {
  colsFor: colsFor, fitFor: fitFor, HUD_H: HUD_H, TILE_MAX: TILE_MAX,
  cols: function(){ return colsFor(vp.W || G.innerWidth, vp.H || G.innerHeight, vp.ins); },
  get W(){ return fitNow ? fitNow.W : 0; }, get H(){ return fitNow ? fitNow.H : 0; }, get Wu(){ return fitNow ? fitNow.Wu : 0; },
  get playH(){ return fitNow ? fitNow.playH : 0; }, get insets(){ return fitNow ? fitNow.insets : normIns(); }, get t0(){ return fitNow ? fitNow.t0 : 0; },
  get C(){ return fitNow ? fitNow.C : 0; }, get tile(){ return fitNow ? fitNow.tile : 0; }, get ox(){ return fitNow ? fitNow.ox : 0; }, get oy(){ return fitNow ? fitNow.oy : 0; },
  get roomW(){ return fitNow ? fitNow.roomW : 0; }, get roomH(){ return fitNow ? fitNow.roomH : 0; }, get apron(){ return fitNow ? fitNow.apron : 0; },
  get widthClass(){ return fitNow ? fitNow.widthClass : 'w-narrow'; }, get short(){ return fitNow ? fitNow.short : false; }, get clamped(){ return fitNow ? fitNow.clamped : false; }
};
// Recompute the room fit from the cached viewport and the room's column count (cheap; also runs when a new room changes C).
function refit(){
  var f = fitFor(vp.W, vp.H, vp.ins, roomCols() || undefined);
  fitNow = f;
  view.w = f.W; view.h = f.H; view.vw = f.W; view.vh = f.H; view.s = f.tile; view.ox = f.ox; view.oy = f.oy; view.C = f.C;
  view.apron = f.apron; view.roomW = f.roomW; view.roomH = f.roomH; view.insets = f.insets; view.scale = 1; view.left = 0; view.top = 0;
  var st = $('stage'); if (st) { st.style.setProperty('--pv-tile', f.tile.toFixed(2) + 'px'); st.style.setProperty('--pv-room-top', f.oy + 'px'); st.style.setProperty('--pv-room-bottom', (f.oy + f.roomH).toFixed(1) + 'px'); }
  UI.placeToast(view);
  return f;
}
function layout(){
  var W = G.innerWidth, H = G.innerHeight, st = $('stage'), b = document.body;
  var prev = laidOut ? { W: vp.W, H: vp.H, s: view.s } : null;
  vp.W = W; vp.H = H; vp.ins = safeInsets();
  st.style.width = W + 'px'; st.style.height = H + 'px'; st.style.transform = '';
  st.style.setProperty('--pv-frame-w', W + 'px'); st.style.setProperty('--pv-scale', '1');   // compat: menus CSS reads --pv-frame-w
  var f = refit();
  b.classList.toggle('w-narrow', f.widthClass === 'w-narrow'); b.classList.toggle('w-wide', f.widthClass === 'w-wide'); b.classList.toggle('h-short', f.short);
  view.dpr = Math.min(2, G.devicePixelRatio || 1);   // canvas backing = CSS size x dpr, capped at 2 (L-PV-15; renderers cap too)
  if (R) R.resize(W, H, view.dpr);
  if (R) UI.rendererLabel(R, view);
  var rel = function(a, c){ return a > 0 ? Math.abs(c - a) / a : 0; };
  if (prev && Math.max(rel(prev.W, W), rel(prev.H, H), rel(prev.s, view.s)) > RESIZE_PAUSE && S && !home && !isEnd() && (S.phase === 'play' || S.phase === 'clear')) pause();
  laidOut = true;
}
// Compat shim (input.js, tests): no scaled frame any more, so scale is 1 and a client point is a stage point (the stage sits at 0,0).
function toFrame(cx, cy){ return { x: cx - (view.left || 0), y: cy - (view.top || 0) }; }
V.Frame = { get W(){ return vp.W; }, get H(){ return vp.H; }, toFrame: toFrame, scale: 1, left: 0, top: 0 };

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
    if (!shown.dead || shown.endPhase !== S.phase) { shown.dead = true; shown.endPhase = S.phase; deadAt = deadAt || performance.now(); V.Input.release(); if (V.Report) V.Report.runEnd(S, S.result); UI.results(S); }
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
  S = V.Sim.restart(S); V.Audio.seed(S.seed); refit(); if (V.Report) V.Report.runStart(S);
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
// The sim reads the column count at each room entry (contract: opts.colsFn, owner A); ?cols=N forces a class for tests (guess: debug only).
var colsQ = parseInt(Q.get('cols') || '0', 10), simOpts = { colsFn: function(){ return (colsQ >= 9 && colsQ <= 15 && colsQ % 2) ? colsQ : V.Layout.cols(); } };
V.Run = {
  setHome: function(on){ home = !!on; if (on) V.Input.release(); acc = 0; last = 0; },
  start: function(){ if (!S) return;
    if (isEnd() || S.t > 0) restart();
    if (V.Report) V.Report.runStart(S);
    else if (roomCols() && roomCols() !== simOpts.colsFn()) { S = V.Sim.create(S.seed, S.tune, simOpts); syncPhase(); }   // the screen changed shape on Home: the untouched first room is rebuilt at the new column count, same seed
    home = false; V.Input.release(); acc = 0; last = 0; moved = false; refit(); },
  get home(){ return home; }
};
function pause(){
  if (paused || !S || home) return;
  paused = true; V.Input.release(); V.Audio.setPaused(true); if (UI.pauseInfo) UI.pauseInfo(S); UI.show('ovPause', true);
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
  dir.walk = V.TUNE.AUTO_WALK_MULT || 2;   // pick 45 (M): auto-walk at least 2x faster
  return dir;
}

// ---------- loop ----------
function frame(ts){
  requestAnimationFrame(frame);
  var dt = last ? ts - last : STEP_MS; last = ts;
  if (!S || !R) return;
  if (V.Report && !document.hidden) V.Report.tick(S, dt, (!home && !paused && !frozen && !UI.drawerOpen() && (S.phase === 'play' || S.phase === 'clear')) ? 'play' : 'menu');
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
  if (roomCols() && roomCols() !== view.C) refit();   // a new room was entered with another column count: refit the tile (C changes only here)
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
  S = V.Sim.create(seed, V.TUNE, simOpts); V.Audio.seed(seed);

  document.addEventListener('visibilitychange', function(){ if (document.hidden) pause(); });
  G.addEventListener('blur', pause);
  G.addEventListener('pagehide', pause);
  $('ovPause').addEventListener('pointerdown', function(e){ if (e.target.closest && e.target.closest('button')) return; e.preventDefault(); resume(); });
  $('btnHome').addEventListener('click', function(e){ if (guardOk(e.detail === 0 ? performance.now() : (resPressAt > deadAt ? resPressAt : 0)) && V.Home) V.Home.show(); });
  $('btnResume').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', function(){ pause(); });
  $('btnRestartRun').addEventListener('click', function(e){ e.stopPropagation(); restart(); resume(); });
  $('btnTune').addEventListener('click', function(e){ e.stopPropagation(); UI.openDrawer(true); });
  // Pick 45 (M): a touch during the clear phase PAUSES auto-walk (it no longer cancels it). While the finger is down the player steers;
  // after the lift, auto-walk resumes once AUTO_WALK_DELAY has passed with no input (autoWalkInput resets aw.idle on any input).
  stage.addEventListener('pointerdown', function(e){
    if (S && S.phase === 'clear' && aw.on && !(e.target.closest && e.target.closest('button, .ov, #drawer'))) { aw.on = false; V.Input.note('awp', 0, 0); }
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
    get frame(){ return { scale: 1, left: 0, top: 0, w: vp.W, h: vp.H, vw: vp.W, vh: vp.H }; },   // compat: the stage is the viewport
    get layout(){ return Object.assign({ colsNext: V.Layout.cols() }, fitNow); },
    relayout: layout,
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
