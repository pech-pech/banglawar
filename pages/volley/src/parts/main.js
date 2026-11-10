(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Boot, layout, fixed 60 Hz loop, hit-stop, pause, overlays and the window.__pv test hook.
var $ = function(id){ return document.getElementById(id); };
var Q = new URLSearchParams(location.search);
var STEP_MS = 1000 / 60, MAX_STEPS = 5;
var S = null, R = null, list = [], view = { w: 344, h: 882, dpr: 1, ox: 0, oy: 66, s: 38 };
var acc = 0, last = 0, hitstopUntil = 0, paused = false, frozen = Q.get('freeze') === '1';
var shown = { pick: false, dead: false }, deadAt = 0, deaths = 0;
var ft = [], FT_MAX = 1200, gaps = 0, frames = 0;

function fail(t){ $('bootMsg').textContent = t; UI.show('ovBoot', true); console.warn('volley:', t); }
var UI = V.UI;

// ---------- layout ----------
function layout(){
  var W = G.innerWidth, H = G.innerHeight, st = $('stage'), note = $('coverNote');
  var w = W, h = H, left = 0;
  if (W / H > 0.75) {                                  // wide or landscape: portrait column at the cover screen aspect
    w = Math.round(H * 344 / 882); left = Math.round((W - w) / 2);
    var gut = left - 16;
    note.style.display = 'block';
    if (gut >= 120) { note.style.left = '8px'; note.style.top = '8px'; note.style.maxWidth = Math.min(260, gut) + 'px'; }
    else { note.style.left = '8px'; note.style.top = 'auto'; note.style.bottom = '8px'; note.style.maxWidth = Math.max(100, Math.min(260, W * 0.4)) + 'px'; }
  } else note.style.display = 'none';
  st.style.left = left + 'px'; st.style.top = '0px'; st.style.width = w + 'px'; st.style.height = h + 'px';
  var hud = $('hud').offsetHeight || 62;
  var oy = hud + 2, s = Math.min(w / 9, (h - oy) / 15);
  view.w = w; view.h = h; view.dpr = G.devicePixelRatio || 1; view.s = s; view.ox = (w - 9 * s) / 2; view.oy = oy;
  if (R) R.resize(w, h, view.dpr);
  UI.placeToast(view);
}

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
      case 'hit': case 'crit': V.Audio.play('hit'); stop = true; break;
      case 'kill': V.Audio.play('kill'); vib(V.TUNE.HAPTIC_KILL_MS); stop = true; break;
      case 'hurt': V.Audio.play('hurt'); UI.hurtFlash(); vib(V.TUNE.HAPTIC_HURT_MS); break;
      case 'door': V.Audio.play('door'); UI.toast('Area clear. Head north through the door.', 2200); break;
      case 'room': { var rm = V.ROOMS && V.ROOMS[S.roomId]; UI.toast('Stage ' + S.stage + (rm ? ': ' + rm.name : ''), 1500); break; }
      case 'levelup': V.Audio.play('levelup'); UI.toast('Level up', 1200); break;
      case 'death': deaths++; break;
    }
  }
  if (stop && live && V.TUNE.HITSTOP_MS > 0) hitstopUntil = performance.now() + V.TUNE.HITSTOP_MS;
}
function simStep(inp, live){ V.Sim.step(S, inp); if (V.Scene && V.Scene.ingest) V.Scene.ingest(S.events, S); handleEvents(S.events, live); }

// ---------- overlays ----------
function syncPhase(){
  if (S.phase === 'pick' && S.cards) {
    if (!shown.pick) { shown.pick = true; V.Input.release(); UI.cards(S, pick); }
  } else if (shown.pick) { shown.pick = false; UI.show('ovCards', false); }
  if (S.phase === 'dead') {
    if (!shown.dead) { shown.dead = true; deadAt = performance.now(); V.Input.release(); UI.dead(S); }
  } else if (shown.dead) { shown.dead = false; UI.show('ovDead', false); }
}
function pick(i){
  if (!S || S.phase !== 'pick') return;
  V.Sim.pick(S, i);
  handleEvents(S.events, false);
  shown.pick = false; UI.show('ovCards', false);
  syncPhase();                                           // another pending level shows the next card screen
}
function restart(){
  S = V.Sim.restart(S); V.Audio.seed(S.seed);
  acc = 0; hitstopUntil = 0; shown.dead = false; UI.show('ovDead', false); shown.pick = false; UI.show('ovCards', false);
  syncPhase(); return S;
}
function tryRestart(){ if (S && S.phase === 'dead' && performance.now() - deadAt > 450) restart(); }

function pause(){
  if (paused || !S) return;
  paused = true; V.Input.release(); V.Audio.setPaused(true); UI.show('ovPause', true);
}
function resume(){
  if (!paused) return;
  paused = false; acc = 0; last = 0; hitstopUntil = 0; V.Audio.setPaused(false); UI.show('ovPause', false);
}

// ---------- loop ----------
function frame(ts){
  requestAnimationFrame(frame);
  var dt = last ? ts - last : STEP_MS; last = ts;
  if (!S || !R) return;
  var running = !paused && !frozen && !UI.drawerOpen() && (S.phase === 'play' || S.phase === 'clear');
  if (!paused && !document.hidden) {
    frames++; ft.push(dt); if (ft.length > FT_MAX) ft.shift(); if (dt > 50 && frames > 3) gaps++;
  }
  if (running) {
    if (ts < hitstopUntil) acc = 0;
    else {
      acc += Math.min(dt, 250);
      var n = 0;
      while (acc >= STEP_MS && n < MAX_STEPS) {
        simStep(V.Input.read(), true); acc -= STEP_MS; n++;
        if (hitstopUntil > ts || S.phase === 'pick' || S.phase === 'dead') { acc = 0; break; }
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
  V.Input.attach(stage, V.TUNE);
  layout();
  G.addEventListener('resize', layout);
  if (G.visualViewport) G.visualViewport.addEventListener('resize', layout);

  var seed = Q.has('seed') ? (parseInt(Q.get('seed'), 10) | 0) : (Date.now() % 1000000);
  var stress = parseInt(Q.get('stress') || '0', 10) | 0; if (stress > 0) V.Scene.stress = stress;
  S = V.Sim.create(seed, V.TUNE); V.Audio.seed(seed);

  document.addEventListener('visibilitychange', function(){ if (document.hidden) pause(); });
  G.addEventListener('blur', pause);
  G.addEventListener('pagehide', pause);
  $('ovPause').addEventListener('pointerdown', function(e){ e.preventDefault(); resume(); });
  $('btnResume').addEventListener('click', resume);
  $('ovDead').addEventListener('pointerdown', function(e){ if (e.target.id !== 'btnRestart') tryRestart(); });
  $('btnRestart').addEventListener('click', tryRestart);
  G.addEventListener('keydown', function(e){
    if (paused && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) { resume(); return; }
    if (S && S.phase === 'dead' && (e.key === ' ' || e.key === 'Enter' || e.key === 'r')) tryRestart();
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
    get frozen(){ return frozen; },
    get lastCopy(){ return UI.lastCopy; },
    step: function(n, inp){
      n = n || 1; inp = inp || { mx: 0, my: 0 };
      for (var i = 0; i < n; i++) simStep(inp, false);
      syncPhase(); if (R) draw(); return S;
    },
    pick: function(i){ pick(i); return S; },
    restart: function(){ return restart(); },
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
