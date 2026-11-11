(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// F1 STAGE PROMPTS (pick 14; spec 05 s3.12; 06 row N1). Learn by playing: three short lines that leave the moment the action is done.
//   P-1 "Drag to move"            shows after 1.5 s with no touch; done when the Operator has moved one tile.
//   P-2 "Stand still to fire"     shows once P-1 is done and the Operator has moved for 4 s without a volley; done when a volley
//                                 fires after a stop that followed a move (standing at the spawn does not count).
//   P-3 "Cover blocks enemy shots" shows when an enemy round is in flight in a room with cover; done when an enemy round hits
//                                 cover within 1.5 tiles of the Operator.
// Rules [spec]: one prompt at a time, in that order; never pauses, never a tap target, hidden on boss stages; done = flagged in the
// settings key at once; a prompt not done returns in the next stage for at most 3 stages, then retires. An action done before its
// prompt shows also counts (the player already knows it). The sim is never touched: everything is read from S and its events.
// Times use sim seconds (S.t), so pause and hit-stop freeze them. Numbers marked (guess) are 05's guesses, not measured.
// API: V.Prompts.show(id), done(id), frame(S, view, o), event(e, S), state(), reset(), isDone(id), TEXT, ORDER, core(io) for tests.
// Saved under `.prompts` in 'volley.settings.v1' (read-modify-write: audio.js owns `.audio`, meta.js `.haptics`).
var ORDER = ['P-1', 'P-2', 'P-3'];
var TEXT = { 'P-1': 'Drag to move', 'P-2': 'Stand still to fire', 'P-3': 'Cover blocks enemy shots' };
var IDLE_SHOW = 1.5;      // s with no touch before P-1 shows (guess, 05)
var MOVE_TILE = 1.0;      // tiles moved for P-1 (guess, 05)
var MOVE_NOFIRE = 4.0;    // s moving without a volley before P-2 shows (guess, 05)
var COVER_R = 1.5;        // tiles: a block this close to the Operator completes P-3 (guess, 05)
var MAX_STAGES = 3;       // stages a prompt may show in before it retires (guess, 05)
var SKEY = 'volley.settings.v1';

function blank(){ return { v: 1, done: {}, stages: {}, retired: {} }; }
function cleanState(o){
  var a = blank(); if (!o || typeof o !== 'object') return a;
  ORDER.forEach(function(id){
    if (o.done && o.done[id] === true) a.done[id] = true;
    if (o.retired && o.retired[id] === true) a.retired[id] = true;
    var n = o.stages && o.stages[id]; if (typeof n === 'number' && n >= 0 && n < 1000) a.stages[id] = Math.floor(n);
  });
  return a;
}
function storeIO(){
  function st(){ try { return G.localStorage || null; } catch (e) { return null; } }
  return {
    load: function(){ var s = st(); if (!s) return null; try { var o = JSON.parse(s.getItem(SKEY) || 'null'); return o && o.prompts; } catch (e) { return null; } },
    save: function(p){ var s = st(); if (!s) return false; try { var o = JSON.parse(s.getItem(SKEY) || 'null'); if (!o || typeof o !== 'object' || Array.isArray(o)) o = {}; o.prompts = p; s.setItem(SKEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
  };
}

// ---- the rules, with no DOM: core(io).observe(obs) once per frame, core.event(e) per sim event ----
function core(io){
  var P = cleanState(io && io.load ? io.load() : null);
  var k = { stage: -1, t0: 0, lastT: null, lastTouch: 0, hx: null, hy: null, path: 0, moving: false, sawMove: false, stopAfterMove: false,
            moveNoFire: 0, shownThisStage: {}, p3Armed: false, cur: null, forced: null, boss: false };
  var api = {};
  function save(){ if (io && io.save) io.save(cleanState(P)); }
  function free(id){ return !P.done[id] && !P.retired[id]; }
  function markDone(id){
    if (P.done[id]) return false;
    P.done[id] = true; save();
    var was = k.cur === id; if (was) k.cur = null; if (k.forced === id) k.forced = null;
    if (api.onDone) api.onDone(id, was);
    return true;
  }
  function display(id){   // first showing in a stage visit counts toward MAX_STAGES
    if (!free(id)) return false;
    if (!k.shownThisStage[id]) {
      if ((P.stages[id] || 0) >= MAX_STAGES) { P.retired[id] = true; save(); return false; }
      k.shownThisStage[id] = true; P.stages[id] = (P.stages[id] || 0) + 1; save();
    }
    k.cur = id; return true;
  }
  function newStage(stage, t){
    k.stage = stage; k.t0 = t; k.lastTouch = t; k.shownThisStage = {}; k.p3Armed = false; k.cur = null; k.moveNoFire = 0;
    k.path = 0; k.sawMove = false; k.stopAfterMove = false; k.moving = false; k.hx = null;
  }
  // obs: { t, stage, kind, phase, touching, hx, hy, shots, cover }
  api.observe = function(o){
    if (o.stage !== k.stage || (k.lastT != null && o.t < k.lastT)) newStage(o.stage, o.t);   // new stage, or a restart (sim time went back)
    var dt = k.lastT == null ? 0 : Math.max(0, Math.min(0.25, o.t - k.lastT)); k.lastT = o.t;
    k.boss = o.kind === 'boss';
    if (o.touching) k.lastTouch = o.t;
    // movement, in tiles
    if (k.hx != null) {
      var d = Math.hypot(o.hx - k.hx, o.hy - k.hy), mv = d > 0.002 && !!o.touching;   // only the player's own steering counts (not walk-in or auto-walk)
      if (mv) { k.path += d; k.sawMove = true; k.stopAfterMove = false; }
      else if (k.moving && k.sawMove) k.stopAfterMove = true;
      k.moving = mv;
      if (mv && o.phase === 'play') k.moveNoFire += dt;
    }
    k.hx = o.hx; k.hy = o.hy;
    if (k.path >= MOVE_TILE && free('P-1')) markDone('P-1');
    if (o.shots > 0 && o.cover) k.p3Armed = true;
    // pick what to show: one at a time, in order
    var want = null;
    if (k.forced && free(k.forced)) want = k.forced;
    else if (free('P-1')) { if (k.cur === 'P-1' || o.t - k.lastTouch >= IDLE_SHOW) want = 'P-1'; }
    else if (free('P-2')) { if (k.cur === 'P-2' || k.moveNoFire >= MOVE_NOFIRE) want = 'P-2'; }
    else if (free('P-3')) { if (k.cur === 'P-3' || k.p3Armed) want = 'P-3'; }
    if (want && want !== k.cur) { if (!display(want)) want = null; }
    if (!want) k.cur = null;
    var visible = !!k.cur && !k.boss && (o.phase === 'play' || o.phase === 'clear');
    return { id: visible ? k.cur : null, ghost: visible && k.cur === 'P-1' && !o.touching };
  };
  // sim events: fire (a volley), block (enemy round stopped by cover), room (a new stage)
  api.event = function(e, hero){
    if (!e) return;
    if (e.k === 'fire') { if (k.stopAfterMove && !k.moving && k.path >= MOVE_TILE && free('P-2')) markDone('P-2'); k.moveNoFire = 0; }
    else if (e.k === 'block' && hero && free('P-3')) { if (Math.hypot(e.x - hero.x, e.y - hero.y) <= COVER_R) markDone('P-3'); }
  };
  api.show = function(id){ if (!TEXT[id] || !free(id)) return false; k.forced = id; return true; };
  api.done = function(id){ return TEXT[id] ? markDone(id) : false; };
  api.isDone = function(id){ return !!P.done[id]; };
  api.state = function(){ return cleanState(P); };
  api.reset = function(){ P = blank(); save(); k.cur = null; k.forced = null; k.shownThisStage = {}; };
  api.get = function(){ return { cur: k.cur, path: k.path, moveNoFire: k.moveNoFire, p3Armed: k.p3Armed, stage: k.stage }; };
  return api;
}

// ---- DOM: one line over the top wall row, fade in, dissolve when done; ghost finger for P-1 ----
var C0 = core(storeIO()), el = null, ghost = null, shownId = null, leaving = 0, lastView = null;
var CSS = [
  '#pvPrompt{position:absolute;left:50%;top:0;z-index:10;pointer-events:none;transform:translate(-50%,0);max-width:calc(100% - 24px);width:max-content;',
  ' padding:8px 14px;font:800 14px/1.2 var(--pv-ui-font-stencil,system-ui,sans-serif);letter-spacing:.1em;text-transform:uppercase;text-align:center;white-space:nowrap;',
  ' color:#f2ead8;background:var(--pv-ui-metal-800,#1b2026);border:1.5px solid #0f1215;border-left:4px solid var(--pv-ui-cyan,#38e8ff);border-radius:6px;',
  ' box-shadow:0 2px 0 rgba(0,0,0,.55);opacity:0;transition:opacity .22s ease-out,transform .22s ease-out,filter .3s}',
  '#pvPrompt.on{opacity:1}',
  '#pvPrompt.gone{opacity:0;filter:blur(3px);transform:translate(-50%,-6px) scale(1.04);transition:opacity .3s ease-in,transform .3s ease-in,filter .3s}',
  '#pvGhost{position:absolute;z-index:10;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;opacity:0;',
  ' background:radial-gradient(circle,rgba(242,234,216,.9) 0 9px,rgba(242,234,216,.25) 10px 15px,transparent 16px);border:2px solid rgba(15,18,21,.55);transition:opacity .2s}',
  '#pvGhost.on{opacity:1;animation:pvGhostSweep 1.6s ease-in-out infinite}',
  '@keyframes pvGhostSweep{0%{transform:translate(0,0)}45%{transform:translate(var(--gx,-56px),-24px)}55%{transform:translate(var(--gx,-56px),-24px)}100%{transform:translate(0,0)}}',
  'body.ovon #pvPrompt,body.ovon #pvGhost{visibility:hidden}',
  '@media (prefers-reduced-motion:reduce){#pvGhost.on{animation:none}#pvPrompt,#pvPrompt.gone{transition:opacity .15s}}'
].join('\n');
function ensure(){
  if (el || typeof document === 'undefined') return !!el;
  var st = document.getElementById('stage'); if (!st) return false;
  if (!document.getElementById('pv-prompts-css')) { var s = document.createElement('style'); s.id = 'pv-prompts-css'; s.textContent = CSS; document.head.appendChild(s); }
  el = document.createElement('div'); el.id = 'pvPrompt'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); st.appendChild(el);
  ghost = document.createElement('div'); ghost.id = 'pvGhost'; ghost.setAttribute('aria-hidden', 'true'); st.appendChild(ghost);
  return true;
}
function leftHanded(){ try { var s = V.Meta && V.Meta.settings && V.Meta.settings(); return !!(s && (s.leftHanded || s.lefty)); } catch (e) { return false; } }
function place(view){
  if (!el || !view) return;
  // over the top wall row (row 0), never under the HUD band; real CSS px (R42)
  var hud = document.getElementById('hud'), hb = hud ? hud.getBoundingClientRect().bottom : 64, h = el.offsetHeight || 34;
  var y = Math.max(hb + 4, (view.oy || 0) + (view.s || 40) * 0.5 - h / 2);
  el.style.top = Math.round(y) + 'px';
  if (ghost) {   // bottom corner of the player's hand, inside the room's bottom rows or the apron
    var W = view.w || G.innerWidth, H = view.h || G.innerHeight, lh = leftHanded();
    var gy = Math.min(H - 60, (view.oy || 0) + 15 * (view.s || 40) - 30), gx = lh ? 64 : W - 64;
    ghost.style.left = Math.round(gx) + 'px'; ghost.style.top = Math.round(gy) + 'px'; ghost.style.setProperty('--gx', (lh ? 56 : -56) + 'px');
  }
}
function paint(r, view){
  if (!ensure()) return;
  var id = r.id;
  if (id && id !== shownId) { el.textContent = TEXT[id]; el.classList.remove('gone'); shownId = id; place(view); el.offsetWidth; el.classList.add('on'); }
  else if (!id && shownId && !leaving) { el.classList.remove('on'); shownId = null; }
  if (id) place(view);
  ghost.classList.toggle('on', !!r.ghost && !V.reducedMotion);
  if (r.ghost && V.reducedMotion) ghost.style.opacity = '0.8'; else ghost.style.opacity = '';
}
C0.onDone = function(id, wasShown){
  if (V.Audio && wasShown) V.Audio.play('prompt_done');   // S-403: small confirm when a prompt vanishes
  if (!el || shownId !== id) return;
  leaving = 1; el.classList.add('gone'); el.classList.remove('on'); if (ghost) ghost.classList.remove('on');
  setTimeout(function(){ leaving = 0; if (shownId === id) { shownId = null; el.classList.remove('gone'); } }, 320);
};
function hasCover(S){ var a = S.room && S.room.solids; if (a) for (var i = 0; i < a.length; i++) if (a[i].kind && a[i].kind !== 'wall') return true; return false; }

V.Prompts = {
  ORDER: ORDER, TEXT: TEXT, SETTINGS_KEY: SKEY,
  core: core,
  show: function(id){ return C0.show(id); },
  done: function(id){ return C0.done(id); },
  isDone: function(id){ return C0.isDone(id); },
  state: function(){ return C0.state(); },
  reset: function(){ C0.reset(); },
  // once per frame from main.js draw(); o = { touching, home, paused }
  frame: function(S, view, o){
    o = o || {}; lastView = view;
    if (!S || !S.hero) return null;
    var off = o.home || o.paused || !!S.mini;
    var steer = !!o.touching || !!(V.Input && V.Input.keyMove);
    var r = C0.observe({ t: S.t, stage: S.stage + ((S.lap || 1) - 1) * 1000, kind: S.stageKind, phase: off ? 'off' : S.phase, touching: steer,
      hx: S.hero.x, hy: S.hero.y, shots: S.shots ? S.shots.length : 0, cover: hasCover(S) });
    paint(r, view);
    return r.id;
  },
  // once per sim event from main.js handleEvents()
  event: function(e, S){ C0.event(e, S && S.hero); },
  get current(){ return shownId; }
};
})();
