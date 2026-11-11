(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// DOM HUD, overlays (cards, death, pause), toasts and the tuning drawer.
// Shell-only knobs are added here so the drawer and Copy settings cover them.
if (V.TUNE_DEFAULTS) {
  var SHELL = { AUTO_WALK: true, AUTO_WALK_DELAY: 1.0, AUTO_WALK_MULT: 2, EDGE_FLASH: true, HAPTIC_HURT_MS: 40, HAPTIC_KILL_MS: 12 };
  for (var sk in SHELL) if (!(sk in V.TUNE_DEFAULTS)) { V.TUNE_DEFAULTS[sk] = SHELL[sk]; if (V.TUNE && !(sk in V.TUNE)) V.TUNE[sk] = SHELL[sk]; }
}
var BUILD = 'volley-v2-4';
// Persist tuning (only values that differ from defaults). Every storage call is guarded. Sound on/off is NOT kept here any more:
// V.TUNE.SOUND is a view of V.Audio's mute, saved in 'volley.settings.v1' (audio.js), so a tune reset or save wipe keeps it.
// f0-2: sliders were being nudged by accident while scrolling the drawer (M's Fold reports showed FIRE_INTERVAL at the
// slider minimum and many other values moved). New key = one clean reset to defaults; sliders are locked until unlocked.
var STORE = 'volley.tune.v2';
try { if (G.localStorage) localStorage.removeItem('volley.tune'); } catch (_) {}
var slidersUnlocked = /[?&]debug=1/.test(G.location ? location.search : '');
function lockSliders(){ var l = document.querySelectorAll('#drBody input[type=range]'); for (var i = 0; i < l.length; i++) l[i].disabled = !slidersUnlocked;
  var b = document.getElementById('drUnlock'); if (b) b.textContent = slidersUnlocked ? 'Lock sliders' : 'Unlock sliders'; }
function loadTune(){
  try {
    var raw = G.localStorage && localStorage.getItem(STORE); if (!raw) return;
    var o = JSON.parse(raw);
    for (var k in o) if (k !== 'SOUND' && V.TUNE_DEFAULTS && k in V.TUNE_DEFAULTS && typeof o[k] === typeof V.TUNE_DEFAULTS[k]) V.TUNE[k] = o[k];
  } catch (_) {}
}
function tuneDiff(){ var o = {}; try { for (var k in V.TUNE_DEFAULTS) if (k !== 'SOUND' && V.TUNE[k] !== V.TUNE_DEFAULTS[k]) o[k] = V.TUNE[k]; } catch (_) {} return o; }
function saveTune(){
  try {
    var o = {}, n = 0;
    for (var k in V.TUNE_DEFAULTS) if (k !== 'SOUND' && V.TUNE[k] !== V.TUNE_DEFAULTS[k]) { o[k] = V.TUNE[k]; n++; }
    if (n) localStorage.setItem(STORE, JSON.stringify(o)); else localStorage.removeItem(STORE);
  } catch (_) {}
}
if (V.TUNE_DEFAULTS && V.TUNE && !/[?&]fresh=1/.test(G.location ? location.search : '')) loadTune();
V.reducedMotion = !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
var $ = function(id){ return document.getElementById(id); };

var GROUPS = [
  ['Hero', ['HERO_HP', 'HERO_ATK', 'CRIT_CHANCE', 'CRIT_MULT', 'MOVE_SPEED', 'FIRE_INTERVAL', 'FIRE_FLOOR', 'ROUND_SPEED', 'ROUND_R', 'INVULN', 'PICKUP_R']],
  ['Enemies', ['ENEMY_HP_GLOBAL', 'HP_SLOPE', 'DMG_SLOPE', 'ENEMY_DMG_MULT', 'ENEMY_SHOT_SPEED_MULT', 'TELL_MULT', 'SPAWN_T']],
  ['Feel', ['TIME_SCALE', 'HITSTOP_MS', 'CARDS_OFFERED', 'PICK_DELAY', 'EDGE_FLASH', 'HAPTICS', 'HAPTIC_HURT_MS', 'HAPTIC_KILL_MS', 'SOUND']],
  ['Input', ['BRACE_DELAY', 'DEADZONE_ENTER', 'DEADZONE_EXIT', 'AUTO_WALK', 'AUTO_WALK_DELAY', 'AUTO_WALK_MULT']]
];
var RANGE = {
  HERO_HP: [100, 2000, 10], HERO_ATK: [20, 600, 5], CRIT_CHANCE: [0, 1, 0.01], CRIT_MULT: [1, 4, 0.05], MOVE_SPEED: [1, 10, 0.1],
  FIRE_INTERVAL: [0.1, 2, 0.01], FIRE_FLOOR: [0.05, 1, 0.01], ROUND_SPEED: [3, 30, 0.5], ROUND_R: [0.04, 0.4, 0.01], INVULN: [0, 2, 0.05],
  ENEMY_HP_GLOBAL: [0.1, 3, 0.01], HP_SLOPE: [0, 0.3, 0.002], DMG_SLOPE: [0, 0.3, 0.002], ENEMY_DMG_MULT: [0, 4, 0.05],
  ENEMY_SHOT_SPEED_MULT: [0.2, 3, 0.05], TELL_MULT: [0.2, 3, 0.05], TIME_SCALE: [0.1, 2, 0.05], HITSTOP_MS: [0, 200, 5],
  CARDS_OFFERED: [1, 3, 1], BRACE_DELAY: [0, 1, 0.01], DEADZONE_ENTER: [2, 60, 1], DEADZONE_EXIT: [0, 40, 1],
  HAPTIC_HURT_MS: [0, 200, 5], AUTO_WALK_DELAY: [0, 3, 0.1], AUTO_WALK_MULT: [1, 4, 0.1], HAPTIC_KILL_MS: [0, 100, 2]
};
function rangeFor(k, d){
  if (RANGE[k]) return RANGE[k];
  if (d <= 1) return [0, 2, 0.01];
  if (d <= 20) return [0, Math.ceil(d * 3), 0.1];
  return [0, Math.ceil(d * 3), 1];
}
function fmt(v){ return typeof v === 'number' ? (Math.abs(v) >= 100 || v === Math.round(v) ? String(Math.round(v * 1000) / 1000) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')) : String(v); }

var toastT = 0, lastHud = '', hooks = {};
var UI = V.UI = {};

UI.init = function(h){
  hooks = h || {};
  $('gear').addEventListener('click', function(){ UI.openDrawer(true); });
  $('drClose').addEventListener('click', function(){ UI.openDrawer(false); });
  $('drReset').addEventListener('click', function(){
    for (var k in V.TUNE_DEFAULTS) V.TUNE[k] = V.TUNE_DEFAULTS[k];
    saveTune(); buildDrawer(); paintSound(); msg('Defaults restored');
  });
  $('drCopyS').addEventListener('click', function(){ copy(JSON.stringify(V.TUNE, null, 1), 'Settings copied'); });
  $('drCopyR').addEventListener('click', function(){ copy(UI.report(), 'Report copied'); });
  $('btnSound').addEventListener('click', function(e){ e.stopPropagation(); if (V.Audio && V.Audio.setMuted) V.Audio.setMuted(!V.Audio.muted); else V.TUNE.SOUND = V.TUNE.SOUND === false; paintSound(); });
  paintSound();
  buildDrawer();
};

function paintSound(){ var b = $('btnSound'), off = V.Audio && 'muted' in V.Audio ? V.Audio.muted : V.TUNE.SOUND === false; if (b) b.textContent = 'Sound: ' + (off ? 'off' : 'on'); }
UI.saveTune = saveTune;
function msg(t){ $('drMsg').textContent = t; }
function copy(text, ok){
  var done = function(){ msg(ok); };
  var fallback = function(){
    var ta = $('copyArea'); ta.value = text; ta.style.left = '0'; ta.focus(); ta.select();
    var r = false; try { r = document.execCommand('copy'); } catch (_) {}
    ta.style.left = '-9999px'; UI.lastCopy = text;
    msg(r ? ok : 'Copy blocked: text is in window.__pv.lastCopy');
  };
  UI.lastCopy = text;
  try { if (navigator.clipboard && G.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); return; } } catch (_) {}
  fallback();
}

function buildDrawer(){
  var body = $('drBody'); body.innerHTML = '';
  var seen = {}, groups = GROUPS.map(function(g){ return [g[0], g[1].filter(function(k){ return k in V.TUNE_DEFAULTS; })]; });
  groups.forEach(function(g){ g[1].forEach(function(k){ seen[k] = 1; }); });
  var other = Object.keys(V.TUNE_DEFAULTS || {}).filter(function(k){ return !seen[k]; });
  if (other.length) groups.push(['Other', other]);
  groups.push(['Renderer', ['__stress']]);
  groups.forEach(function(g){
    if (!g[1].length) return;
    var h = document.createElement('h4'); h.textContent = g[0]; body.appendChild(h);
    g[1].forEach(function(k){ body.appendChild(knob(k)); });
  });
}
function knob(k){
  var row = document.createElement('div'); row.className = 'kn';
  var isStress = k === '__stress';
  var d = isStress ? 0 : V.TUNE_DEFAULTS[k], v = isStress ? ((V.Scene && V.Scene.stress) | 0) : V.TUNE[k];
  var lab = document.createElement('label'), val = document.createElement('i');
  lab.textContent = isStress ? 'STRESS_SHAPES' : k; lab.appendChild(val); row.appendChild(lab);
  if (typeof d === 'boolean') {
    var b = document.createElement('button'); b.className = 'btn ghost tg';
    var paint = function(){ b.textContent = V.TUNE[k] ? 'On' : 'Off'; val.textContent = V.TUNE[k] ? 'on' : 'off'; };
    b.addEventListener('click', function(){ V.TUNE[k] = !V.TUNE[k]; paint(); saveTune(); if (k === 'SOUND') paintSound(); });
    paint(); row.appendChild(b); return row;
  }
  var rg = isStress ? [0, 2000, 50] : rangeFor(k, d);
  var inp = document.createElement('input'); inp.type = 'range';
  inp.min = rg[0]; inp.max = Math.max(rg[1], v); inp.step = rg[2]; inp.value = v;
  val.textContent = fmt(v);
  inp.addEventListener('input', function(){
    var x = parseFloat(inp.value);
    if (isStress) { if (V.Scene) V.Scene.stress = x | 0; }
    else V.TUNE[k] = x;
    val.textContent = fmt(x);
  });
  inp.addEventListener('change', saveTune);
  inp.disabled = !slidersUnlocked;
  row.appendChild(inp); return row;
}

function bindUnlock(){ var b = document.getElementById('drUnlock'); if (!b || b.__bound) return; b.__bound = true;
  b.addEventListener('click', function(){ slidersUnlocked = !slidersUnlocked; lockSliders(); }); lockSliders(); }
UI.openDrawer = function(on){
  bindUnlock(); lockSliders();
  $('drawer').classList.toggle('on', !!on);
  if (on) { buildDrawer(); msg(''); }
  UI.syncOverlay();
  if (hooks.onDrawer) hooks.onDrawer(!!on);
};
UI.drawerOpen = function(){ return $('drawer').classList.contains('on'); };

UI.syncOverlay = function(){
  var any = ['ovCards', 'ovDead', 'ovSupply', 'ovPause', 'ovBoot'].some(function(id){ return $(id).classList.contains('on'); }) || UI.drawerOpen() || !!(V.Home && V.Home.visible());
  document.body.classList.toggle('ovon', any);
};
function show(id, on){ $(id).classList.toggle('on', !!on); UI.syncOverlay(); }
UI.show = show;

UI.toast = function(text, ms){
  var t = $('toast'); t.textContent = text; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('on'); }, ms || 1600);
};
// Positions below are real CSS px (R42: no scaled frame). view.oy + 15 * view.s is the room's bottom edge; view.apron is the ground below it.
function roomBottom(view){ return view.oy + 15 * view.s; }
function apronOf(view){ return view.apron != null ? view.apron : Math.max(0, view.h - roomBottom(view)); }
var HOWTO_GAP = 8, TOAST_H = 32;   // guesses: gap under the room edge; one-line toast height (13 px text + padding)
var toastView = null;
UI.placeToast = function(view){
  toastView = view;
  // In the ground apron when it has room: never over the HUD band or the room edge (L-TD-5). The apron's top part is the how-to hint's
  // place, so the toast goes under it when both fit; on squat screens (no apron) it sits just under the door row, inside the room.
  var t = $('toast'), top = roomBottom(view), ap = apronOf(view), y;
  if (ap >= 120) y = top + 70;                                   // how-to (up to ~54 px) + gaps above it
  else if (ap >= TOAST_H + 2 * HOWTO_GAP) y = top + (ap - TOAST_H) / 2;
  else {                                                          // D8: squat screens (no apron): just under the HUD bar, top of the room (the bottom band hid under the sandbags / covered the hero)
    var hr = $('hpRow'), hb = hr ? hr.getBoundingClientRect().bottom : 0;
    y = Math.max(hb, view.oy) + HOWTO_GAP;
    var bb = $('bossBar'); if (bb && bb.style.display !== 'none') y = Math.max(y, bb.getBoundingClientRect().bottom + HOWTO_GAP);   // boss rooms: just under the boss bar (read from the element)
  }
  t.style.top = Math.round(y) + 'px';
};

// Crit numbers (M's pick: crits only). Pooled DOM, max 8 live.
var dnPool = [], dnNext = 0;
UI.crit = function(x, y, dmg, view, S, id){
  var layer = $('dmgLayer'); if (!layer) return;
  if (dnPool.length < 8) { var d0 = document.createElement('div'); d0.className = 'dn'; layer.appendChild(d0); dnPool.push({ el: d0, anim: null }); }
  var it = dnPool[dnNext % dnPool.length]; dnNext++;
  if (it.anim) { try { it.anim.cancel(); } catch (_) {} }
  var el = it.el; el.textContent = dmg != null ? String(Math.round(dmg)) : 'CRIT';
  var px = view.ox + x * view.s, py = view.oy + y * view.s - view.s * 0.45, anchor = 'translate(-50%,-100%)';
  // D12: crits on the boss float beside its hull (alternating sides), never over the core.
  var B = S && S.boss, be = null;
  if (B && id != null && id === B.id && S.enemies) for (var bi = 0; bi < S.enemies.length; bi++) if (S.enemies[bi].id === id) { be = S.enemies[bi]; break; }
  if (be) {
    var side = (dnNext & 1) ? 1 : -1, br = (be.r || 1) + 0.15;
    px = view.ox + (be.x + side * br) * view.s; py = view.oy + be.y * view.s;
    anchor = side > 0 ? 'translate(0,-50%)' : 'translate(-100%,-50%)';
  }
  var base = 'translate(' + Math.round(px) + 'px,' + Math.round(py) + 'px) ' + anchor;
  var rise = V.reducedMotion ? 0 : -20;
  var kf = [{ transform: base + ' translateY(0px)', opacity: 1 }, { transform: base + ' translateY(' + (rise * 0.5) + 'px)', opacity: 1, offset: 0.4 }, { transform: base + ' translateY(' + rise + 'px)', opacity: 0 }];
  if (el.animate) { it.anim = el.animate(kf, { duration: 600, easing: 'ease-out', fill: 'forwards' }); }
  else { el.style.transform = base; el.style.opacity = 1; setTimeout(function(){ el.style.opacity = 0; }, 600); }
};
UI.critLive = function(){ return dnPool.filter(function(i){ return i.anim && i.anim.playState === 'running'; }).length; };

var flashT = 0;
UI.hurtFlash = function(){
  if (V.TUNE.EDGE_FLASH === false || V.reducedMotion) return;
  var f = $('flash'); f.classList.add('on'); clearTimeout(flashT);
  flashT = setTimeout(function(){ f.classList.remove('on'); }, 60);
};

UI.hud = function(S, R, view){
  if (!S) return;
  var h = S.hero, room = V.ROOMS && V.ROOMS[S.roomId];
  var hp = Math.max(0, Math.ceil(h.hp)), mx = Math.max(1, Math.round(h.maxHp));
  var xpPct = h.xpNext ? Math.max(0, Math.min(1, h.xp / h.xpNext)) : 1, rr = (S.rerolls | 0);
  var key = [S.stage, S.chNo, V.chapterLen(S.chNo), S.roomId, hp, mx, h.level, Math.round(xpPct * 200), rr, (S.mini && S.stageKind === 'collect') ? 1 : 0].join('|');
  if (key !== lastHud) {
    lastHud = key;
    $('stNum').textContent = S.stage + '/' + V.chapterLen(S.chNo);
    $('roomName').textContent = room ? room.name : (S.roomId || '');
    // No cut-off text (s6): when the chip cannot hold the room name (narrow screens), show only the stage; the name is toasted at room entry.
    $('lvl').textContent = 'Lv ' + h.level;
    var chip = $('rrChip'); if (!chip) { chip = document.createElement('div'); chip.id = 'rrChip'; chip.setAttribute('aria-label', 'Rerolls banked'); $('lvl').parentNode.insertBefore(chip, $('lvl').nextSibling); }
    chip.textContent = 'RR ' + rr; chip.style.display = rr > 0 ? 'block' : 'none';
    var rn = $('roomName'), ht = $('hudTop'); rn.style.display = ''; if (ht && ht.scrollWidth > ht.clientWidth + 1) rn.style.display = 'none';   // D3: the row is full, so the name goes (the stage chip never shrinks)
    $('xpFill').style.width = (xpPct * 100).toFixed(1) + '%';
    var xw = $('xpWrap'); if (xw) xw.style.visibility = (S.mini && S.stageKind === 'collect') ? 'hidden' : '';   // catch room: no XP bar (K)
    $('hpFill').style.width = (hp / mx * 100).toFixed(1) + '%';
    $('hpFill').style.background = hp / mx < 0.3 ? '#f07a6e' : '#5fd06a';
    // The number sits beside the bar (L-PV-7); #hpTxtE is kept hidden for older tests.
    var ht = hp + ' / ' + mx;
    $('hpTxt').textContent = ht; $('hpTxtE').textContent = ht;
  }
  UI.rendererLabel(R, view);
  UI.boss(S, view);
};
var bossKey = '';
UI.boss = function(S, view){
  var b = S.boss, el = $('bossBar');
  var on = !!(b && b.hp > 0 && S.phase !== 'results');
  if (!on) { if (el.style.display !== 'none') { el.style.display = 'none'; if (toastView) UI.placeToast(toastView); } bossKey = ''; return; }
  var k = [b.name, Math.ceil(b.hp), b.maxHp, b.phase, Math.round(view.ox), Math.round(view.oy), Math.round(view.s * 10), view.C].join('|');
  if (k === bossKey) return; bossKey = k;
  // Top of the room, inside the north wall row, so it never covers the HUD bars.
  // D1: name and numbers on a row above a plain full-width bar (block is about 34 px tall).
  el.style.display = 'block';
  // Centred on the room, at most 560 wide (wide screens, s4), never wider than the room less half a tile.
  var rw = (view.C || 9) * view.s, bw = Math.min(560, rw - view.s * 0.5);
  el.style.left = Math.round(view.ox + (rw - bw) / 2) + 'px';
  el.style.width = Math.round(bw) + 'px';
  el.style.top = Math.round(view.oy + Math.max(0, (view.s - (el.offsetHeight || 34)) / 2)) + 'px';
  $('bossFill').style.width = Math.max(0, Math.min(100, b.hp / b.maxHp * 100)).toFixed(1) + '%';
  $('bossName').textContent = (b.name || 'Boss') + (b.phase === 2 ? ' - phase 2' : '');
  $('bossHp').textContent = Math.ceil(b.hp) + ' / ' + Math.round(b.maxHp);
  if (toastView) UI.placeToast(toastView);   // the bar just moved or appeared: keep the toast clear of it
};
UI.howto = function(on, view){
  var el = $('howto');
  if (on) {
    if (el.style.display !== 'block') el.style.display = 'block';
    // On the ground apron when it fits. Otherwise (QA-VISUAL D3 option A) over rows 12-13, which hold no spawns or tells, centred a bit
    // above their middle (row 12.6, a guess) and kept clear of the hero's start tile (row 14 centre) and its HP bar (about 0.55 tile + 7 px above it).
    var hh = el.offsetHeight || 34, below = roomBottom(view) + HOWTO_GAP, fits = apronOf(view) >= hh + 2 * HOWTO_GAP, y;
    if (fits) y = below;
    else {
      var s = view.s, yTop = view.oy + 12 * s, yMax = view.oy + 14.5 * s - 0.28 * s * 1.95 - 10 - 4 - hh;  // hint bottom >= 4 px over the HP bar
      y = Math.max(yTop, Math.min(view.oy + 12.6 * s - hh / 2, yMax));
    }
    y = Math.round(y);
    if (el.style.top !== y + 'px') el.style.top = y + 'px';
  }
  else if (el.style.display !== 'none') el.style.display = 'none';
};
function fmtN(n){ return (V.Home && V.Home.fmt) ? V.Home.fmt(n) : String(n); }
UI.rendererLabel = function(R, view){
  // R42 label: viewport | column class | tile px | device pixel ratio, e.g. "Canvas 2D | 344x882 | c9 | 38.2 px | dpr 2.63"
  var t = (R ? (R.label || R.name) : 'none') + ' | ' + Math.round(view.vw || view.w) + 'x' + Math.round(view.vh || view.h) + ' | c' + (view.C || 9) + ' | ' + (view.s || 0).toFixed(1) + ' px | dpr ' + (Math.round((G.devicePixelRatio || 1) * 100) / 100);
  // D14: the corner label shows only with ?debug=1; the pause card and the tuning drawer always carry it.
  ['rlbl', 'rlblPause', 'rlblDrawer'].forEach(function(id){ var el = $(id); if (el && el.textContent !== t) el.textContent = t; });
};
if (G.location && /[?&]debug=1/.test(location.search)) document.body.classList.add('dbg');

// Text glyphs (U+FE0E keeps them out of emoji style).
var GLYPH = { 'SK-01': '‖', 'SK-02': '≡', 'SK-03': '⋀', 'SK-04': '↔', 'SK-05': '↓', 'SK-06': '↯', 'SK-07': '⇢',
  'SK-09': '↑', 'SK-10': '↑', 'SK-11': '»', 'SK-12': '»', 'SK-13': '✦', 'SK-14': '✦', 'SK-15': '✚',
  'SK-16': '♨', 'SK-17': '☣', 'SK-27': '♥', 'SK-33': '◎', repair: '✚' };
function row(cls, glyph, tag, name, desc, onTap){
  var b = document.createElement('button'); b.className = cls;
  var g = document.createElement('div'); g.className = 'gl'; g.textContent = glyph + '︎';
  var tx = document.createElement('div'); tx.className = 'tx';
  if (tag) { var t = document.createElement('small'); t.textContent = tag; tx.appendChild(t); }
  var n = document.createElement('b'); n.textContent = name; var d = document.createElement('span'); d.textContent = desc || '';
  tx.appendChild(n); tx.appendChild(d); b.appendChild(g); b.appendChild(tx);
  b.addEventListener('click', onTap); return b;
}
function glyphFor(c){ return GLYPH[c.id] || (c.name || '?').charAt(0).toUpperCase(); }
// ---- Level-up offer (picks 19-21; 05 3.11) ----
// Guard: no row accepts input until every finger is up and 350 ms have passed, and only a press that BEGAN after that counts.
// One accepted tap applies the pick and unfreezes the sim (M, 2026-11-11: no confirm tap).
// So a steering thumb that is still down cannot pick. A click with no pointer press (keyboard, test) counts as a press now.
var PICK_GUARD_MS = 350, cardCtx = null, ptr = { ids: {}, n: 0, press: 0, lift: 0, get down(){ return this.n; } };   // pointers by pointerId: a lost pointerup cannot leave a stuck count
function pnow(){ return (G.performance && performance.now) ? performance.now() : Date.now(); }
(function trackPointers(){
  if (!G.addEventListener || ptr.on) return; ptr.on = true;
  function recount(){ var n = 0; for (var k in ptr.ids) n++; ptr.n = n; }
  function lifted(){ ptr.lift = pnow(); recount(); if (cardCtx && ptr.n === 0 && cardCtx.armAt === Infinity) cardCtx.armAt = ptr.lift + PICK_GUARD_MS; }   // the thumb that was down at open: arms 350 ms after it lifts
  G.addEventListener('pointerdown', function(e){ ptr.ids[e && e.pointerId != null ? e.pointerId : 'm'] = 1; recount(); ptr.press = pnow(); }, true);
  var up = function(e){ delete ptr.ids[e && e.pointerId != null ? e.pointerId : 'm']; lifted(); };
  G.addEventListener('pointerup', up, true); G.addEventListener('pointercancel', up, true);
  var clear = function(){ ptr.ids = {}; lifted(); };           // focus or visibility lost: every finger counts as lifted
  G.addEventListener('blur', clear);
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', clear);
})();
var LVL_CSS = '' +
  '#xpWrap{height:10px}#xpFill{background:#8f7bff}' +
  '.pips{display:inline-flex;gap:4px;margin:3px 0 1px}.pips i{width:12px;height:12px;border-radius:50%;border:2px solid var(--cyan);box-sizing:border-box;display:block}.pips i.on{background:var(--cyan)}' +
  '.card small.nw{color:#0d1b1d;background:var(--cyan);display:inline-block;padding:0 6px;border-radius:4px;font-weight:800}' +
  '.card.rp{border-color:#5fd06a}.card.rp .gl{color:#5fd06a;border-color:#2f7a37}' +
  '#ovCards.wait .card,#ovCards.wait #cardRr{opacity:.55}' +
  '#cardRr{min-height:56px;width:200px;min-width:200px;flex:none}#cardRr.is-dim{opacity:.6}' +
  '#cardRrNote{font-size:12px;min-height:16px}' +
  '.card.flip{animation:cardFlip .26s ease-out}@keyframes cardFlip{from{transform:rotateX(70deg);opacity:.2}to{transform:none;opacity:1}}' +
  '#cardCont{position:absolute;inset:0;z-index:5;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12%;font:700 18px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.08)}' +
  '#cardCont span{background:rgba(13,27,29,.9);border:2px solid var(--cyan);border-radius:10px;padding:14px 22px;min-height:56px;box-sizing:border-box}' +
  '#rrChip{flex:none;font-weight:800;font-size:13px;color:#0d1b1d;background:#ffd25a;border-radius:6px;padding:4px 6px;white-space:nowrap;display:none}' +
  // D3: the stage chip never shrinks (it was cut to "St..." beside the RR chip at 344); the XP bar gives the room back, the room name drops first.
  '#stageLbl{flex:none;overflow:visible;text-overflow:clip}#xpWrap{flex:1 1 40px;min-width:48px}' +
  // D14: stencil headings (titles only; body text stays sans), same recipe as #ovDead h2.
  '.ov h2,body #cuSheet h2,body #cuSheet .cu-t b{font-family:var(--pv-ui-font-stencil);font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--pv-ui-sand,#e8d9a8)}' +
  '.ov h2{font-size:22px;line-height:1.1}body #cuSheet h2{font-size:18px}' +
  // D17 (CSS net until P's snippet lands): a maxed tile shows no "+N levels per buy"; with every stat maxed the visit line goes.
  '.tl.mx .per{display:none}#tb-visit:not(:has(~ .tb-grid3 > .tl:not(.mx))){display:none}' +
  // D5: the level-up dim is light (about .55) so enemies and the Operator stay readable; text keeps an ink shadow; the stack sits at the top, under the HUD.
  '#ovCards{background:rgba(20,19,16,.55);justify-content:flex-end;gap:8px;padding-bottom:var(--lv-pb,16px)}' +
  // N3-follow: Reroll sits top right under the HUD and the stack sits just above the Operator, so the enemy row stays visible.
  '#ovCards #cardRr{position:absolute;top:calc(max(0px,env(safe-area-inset-top,0px)) + 72px);right:8px;width:120px;min-width:120px;min-height:56px;z-index:2}' +
  '#ovCards #cardRrNote{position:absolute;top:calc(max(0px,env(safe-area-inset-top,0px)) + 72px);left:8px;width:calc(100% - 144px);text-align:left;min-height:0}' +
  '#ovCards h2,#ovCards p,#cardRrNote{text-shadow:0 1px 3px #000,0 0 6px #000}' +
  '#ovCards h2{margin-top:0}' +
  '@media (prefers-reduced-motion:reduce){.card.flip{animation:none}}';
(function injectCss(){ if (typeof document === 'undefined' || !document.head || !document.getElementById || document.getElementById('pvLvlCss')) return; var st = document.createElement('style'); st.id = 'pvLvlCss'; st.textContent = LVL_CSS; document.head.appendChild(st); })();
function pipsEl(n){ var w = document.createElement('div'); w.className = 'pips'; w.setAttribute('role', 'img'); w.setAttribute('aria-label', 'Level ' + n + ' of 3');
  for (var i = 1; i <= 3; i++) { var d = document.createElement('i'); if (i <= n) d.className = 'on'; w.appendChild(d); } return w; }
function cardRow(S, ci, i, onTap){
  var c = (V.CARDS && V.CARDS[ci]) || { name: 'Card ' + ci, desc: '' }, M = V.Mods;
  var rp = !!(M && M.isRepair && M.isRepair(ci)), lv = rp || !M ? 1 : M.levelAfter(S, ci);
  var tag = rp ? 'Repair' : (lv <= 1 ? 'NEW' : 'Lv ' + (lv - 1) + ' to ' + lv);
  var b = row('card' + (rp ? ' rp' : ''), glyphFor(c), tag, c.name, lv > 1 && c.up ? c.up : c.desc, onTap);
  if (!rp) { var sm = b.querySelector('small'); if (lv <= 1 && sm) sm.className = 'nw'; b.querySelector('.tx').insertBefore(pipsEl(lv), b.querySelector('b').nextSibling); b.setAttribute('aria-label', c.name + ', ' + tag + ', level ' + lv + ' of 3'); }
  b.dataset.i = i; return b;
}
function rerollFn(S){ return (V.Sim && V.Sim.reroll) || (V.Mods && V.Mods.reroll); }
// Level-up stack placement: bottom-aligned just above the Operator, but never above the HUD bottom + 8 px (QA: the title crossed the top at 344x882 and 475x590).
// When there is no room it starts under the HUD and covers the hero instead. Needs the overlay to be displayed to measure.
function fitStack(){
  try {
    var ov = $('ovCards'), S = cardCtx && cardCtx.S; if (!ov || !S) return;
    var pv = G.__pv, vw = pv && pv.view, hh = S.hero, H = G.innerHeight || 0, hud = $('hud');
    var pb = (vw && hh && H) ? Math.max(16, Math.round(H - (vw.oy + hh.y * vw.s) + 34)) : 16;
    var hudB = hud ? Math.ceil(hud.getBoundingClientRect().bottom) : 64, minTop = hudB + 8;
    var h = 0, n = 0; ['cardTitle', 'cardList'].forEach(function(id){ var e = $(id); if (e) { h += e.offsetHeight; n++; } });
    var pp = ov.querySelector('p'); if (pp) { h += pp.offsetHeight; n++; }
    h += (n - 1) * 8;
    var tight = H && h > 0 && (H - pb - h) < minTop;
    ov.style.setProperty('--lv-pb', pb + 'px');
    ov.style.justifyContent = tight ? 'flex-start' : '';
    ov.style.paddingTop = tight ? minTop + 'px' : '';
    ov.classList.toggle('lv-tight', !!tight);
  } catch (_) {}
}
function cardsRender(flip){
  var cx = cardCtx; if (!cx) return; var S = cx.S, list = $('cardList'); list.innerHTML = '';
  var pend = (S.pendingLevels | 0) + (S.freePicks | 0), lvl = S.hero.level - Math.max(0, (S.pendingLevels | 0) - 1);
  var ov = $('ovCards'), p = ov.querySelector('p');
  if ((S.pendingLevels | 0) > 0) { $('cardTitle').textContent = 'Level ' + lvl; if (p) p.textContent = pend > 1 ? 'Level-up 1 of ' + pend + ': pick 1 of ' + (S.cards || []).length : 'Pick 1 of ' + (S.cards || []).length; }
  else { $('cardTitle').textContent = S.stageKind === 'cache' ? 'Cache: free field upgrade' : 'Head start: free upgrade'; if (p) p.textContent = pend > 1 ? 'Pick 1 of ' + (S.cards || []).length + ' (' + pend + ' picks)' : 'Pick 1 of ' + (S.cards || []).length; }
  (S.cards || []).forEach(function(ci, i){
    var b = cardRow(S, ci, i, function(e){ cardTap(i, e); }); if (flip) { b.classList.add('flip'); b.style.animationDelay = (i * 50) + 'ms'; } list.appendChild(b);
  });
  var rr = $('cardRr'); if (!rr) { rr = document.createElement('button'); rr.id = 'cardRr'; rr.className = 'btn ghost'; rr.type = 'button'; ov.appendChild(rr);
    rr.addEventListener('click', function(e){ rerollTap(e); }); var nt = document.createElement('div'); nt.id = 'cardRrNote'; ov.appendChild(nt); }
  fitStack();
  var n = V.Mods ? V.Mods.rerolls(S) : 0;
  rr.textContent = 'Reroll (' + n + ')'; rr.style.display = ''; rr.classList.toggle('is-dim', !(V.Mods && V.Mods.canReroll(S)));
  rr.setAttribute('aria-label', 'Reroll, ' + n + ' banked');
  $('cardRrNote').textContent = '';
}
function accepted(e){
  var cx = cardCtx; if (!cx) return false;
  var t = (e && e.detail === 0) ? pnow() : ptr.press;      // the press that began this click
  return ptr.down === 0 && pnow() >= cx.armAt && t >= cx.armAt;
}
// M 2026-11-11: one tap picks; no "Touch to continue" confirm step. The 350 ms arm guard still stops a steering thumb from picking.
function cardTap(i, e){
  var cx = cardCtx; if (!cx || cx.chosen >= 0 || !accepted(e)) return;
  cx.chosen = i; var f = cx.onPick; closeCards(); f(i);
}
function contTap(e){
  var cx = cardCtx; if (!cx || cx.chosen < 0 || !accepted(e)) return;
  try { if (V.Report && V.Report.note) V.Report.note('touchContinue'); } catch (_) {}
  var i = cx.chosen, f = cx.onPick; closeCards(); f(i);
}
function rerollTap(e){
  var cx = cardCtx; if (!cx || cx.chosen >= 0 || !accepted(e)) return;
  var S = cx.S, M = V.Mods, n = M ? M.rerolls(S) : 0, note = $('cardRrNote');
  if (!n) { note.textContent = 'Beat a boss to earn a reroll.'; UI.toast('Beat a boss to earn a reroll.', 1400); return; }
  if (!M.canReroll(S)) { note.textContent = 'No other upgrade to roll.'; return; }
  var f = rerollFn(S); if (f(S)) { if (V.Audio && V.Audio.play) { try { V.Audio.play('reroll'); } catch (_) {} } cardsRender(!V.reducedMotion); }
}
function closeCards(){
  cardCtx = null; clearInterval(UI._cardWait);
  var c = $('cardCont'); if (c && c.parentNode) c.parentNode.removeChild(c);
  var ov = $('ovCards'); ov.classList.remove('wait'); show('ovCards', false);
}
UI.cards = function(S, onPick){
  cardCtx = { S: S, onPick: onPick, chosen: -1, armAt: pnow() + PICK_GUARD_MS };
  if (ptr.down > 0) cardCtx.armAt = Infinity;                // a finger is down: arms 350 ms after the last one lifts
  cardsRender(false);
  var ov = $('ovCards'), old = $('cardCont'); if (old && old.parentNode) old.parentNode.removeChild(old);
  show('ovCards', true); fitStack();
  clearInterval(UI._cardWait);
  var tick = function(){ var w = !cardCtx || pnow() < cardCtx.armAt || ptr.down > 0; ov.classList.toggle('wait', w); if (!w) clearInterval(UI._cardWait); };
  ov.classList.add('wait'); UI._cardWait = setInterval(tick, 60);
};
UI.cardsOpen = function(){ return !!cardCtx; };
UI.cardsArmed = function(){ return !!cardCtx && ptr.down === 0 && pnow() >= cardCtx.armAt; };

// the sim defers its 'door' event to the next step (toast 'Stage N clear'); show the result just after it so it is not overwritten
function supToast(t){ setTimeout(function(){ UI.toast(t, 1800); }, 80); }
UI.supply = function(S, onPick){
  var list = $('supList'); list.innerHTML = '';
  (S.supply || []).forEach(function(o, i){
    var b;
    if (o.kind === 'repair') b = row('card sup', GLYPH.repair, 'Repair', 'Field repair', 'Restore ' + Math.round((o.pct || 0.4) * 100) + '% of max HP now.', function(){ onPick(i); supToast('Repaired ' + Math.round((o.pct || 0.4) * 100) + '% HP'); });
    else { var c = (V.CARDS && V.CARDS[o.index]) || { name: 'Supply mod', desc: '' }; b = row('card sup', glyphFor(c), 'Supply mod', c.name, c.desc, function(){ onPick(i); supToast('+ ' + c.name); }); }
    b.dataset.i = i; list.appendChild(b);
  });
  UI.show('ovSupply', true);
};

function modNames(S){
  var out = [], m = (S.hero && S.hero.mods) || {};
  for (var k in m) if (m[k] > 0) {
    var c = (V.CARDS || []).filter(function(x){ return x.key === k; })[0];
    if (k === 'repair') continue;                      // Emergency repair is a one-off heal, not a held upgrade
    out.push((c ? c.name : k) + (m[k] > 1 ? ' Lv ' + m[k] : ''));
  }
  return out;
}
function mmss(t){ t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
UI.results = function(S){
  var r = S.result || { win: false, stage: S.stage, t: S.t, kills: S.stats && S.stats.kills, level: S.hero.level, dmgTaken: S.stats && S.stats.dmgTaken };
  var t = $('resTitle'); t.textContent = r.win ? 'Chapter 1 clear' : 'Operator down'; t.className = r.win ? 'win' : '';
  var mods = modNames(S);
  var rows = [['Result', r.win ? 'Win' : 'Lost'], ['Stage reached', (r.stage != null ? r.stage : S.stage) + ' / ' + V.chapterLen(S.chNo)], ['Time', mmss(r.t != null ? r.t : S.t)],
    ['Kills', fmtN(r.kills | 0)], ['Level', r.level != null ? r.level : S.hero.level], ['Damage taken', fmtN(Math.round(r.dmgTaken || 0))], ['Mods', mods.length ? mods.join(', ') : 'none']];
  var bo = deployInfo(S); if (bo) rows.push(['Deploy boost', bo.name + ' (' + bo.tierName + '): ' + bo.text]);
  if (S.rerolls > 0) rows.push(['Rerolls banked', S.rerolls]);
  var box = $('resStats'); box.innerHTML = '';
  rows.forEach(function(rw){ var d = document.createElement('div'); d.className = 'row'; var a = document.createElement('span'); a.textContent = rw[0]; var b = document.createElement('b'); b.textContent = String(rw[1]); d.appendChild(a); d.appendChild(b); box.appendChild(d); });
  if (r.credits != null) {      // credits earned this run (S.result.credits, added by META), with the coin
    var cr = document.createElement('div'); cr.className = 'row'; var ca = document.createElement('span'); ca.textContent = 'Credits earned';
    var cb = document.createElement('b'); cb.style.color = '#ffe27a'; cb.style.display = 'inline-flex'; cb.style.alignItems = 'center';
    var ci = document.createElement('span'); ci.className = 'pv-coin'; ci.setAttribute('aria-hidden', 'true'); ci.style.cssText = 'width:20px;height:20px;margin-right:6px'; cb.appendChild(ci);   // code coin under 32 px
    cb.appendChild(document.createTextNode('+' + fmtN(r.credits | 0))); cr.appendChild(ca); cr.appendChild(cb); box.insertBefore(cr, box.firstChild);
  }
  UI.show('ovDead', true);
};
UI.dead = UI.results;
// Pause card: the run's mods (the list scrolls inside the panel).
function deployInfo(S){ try { return S && S.deploy && V.Mods && V.Mods.Deploy ? V.Mods.Deploy.info(S.deploy) : null; } catch (_) { return null; } }
UI.pauseInfo = function(S){ var el = $('pauseMods'); if (!el || !S || !S.hero) return; var m = modNames(S), bo = deployInfo(S), t = [];
  if (bo) t.push('Boost: ' + bo.name + ' ' + '\u25CF\u25CF\u25CF'.slice(0, bo.pips) + ' (' + bo.text + ')');
  if (m.length) t.push('Mods: ' + m.join(', '));
  if (S.rerolls > 0) t.push('Rerolls banked: ' + S.rerolls);
  el.textContent = t.join(' | '); };

function metaBlock(){
  var m = V.Meta && V.Meta.state; if (!m) return null;
  var runs = m.runs || [];
  return { credits: m.credits, rifleLevel: m.rifle && m.rifle.lvl, cond: { hp: m.cond && m.cond.hp, atk: m.cond && m.cond.atk, rate: m.cond && m.cond.rate },
    runCount: runs.length, bestStage: m.best,
    lastRuns: runs.slice(-3).map(function(r){ return { stage: r.stage, win: r.win, credits: r.credits, dur: r.dur, kills: r.kills }; }) };
}
// Copy report: everything needed to compare a play session.
UI.report = function(){
  var m = hooks.metrics ? hooks.metrics() : {}, S = m.S || {}, st = S.stats || {};
  var braced = st.playSteps ? Math.round(100 * (st.bracedSteps || 0) / st.playSteps) : 0;
  var r = {
    build: BUILD, date: new Date().toISOString(), tuneChanged: tuneDiff(), window: (G.innerWidth | 0) + 'x' + (G.innerHeight | 0), seed: S.seed, renderer: m.renderer, viewport: m.viewport, dpr: G.devicePixelRatio || 1,
    ua: navigator.userAgent,
    frameMs: m.frame, gapsOver50ms: m.gaps,
    bracedUptimePct: braced, hitsBy: st.hitsBy, roomTimes: st.roomTimes, kills: st.kills, deaths: m.deaths,
    stage: S.stage, stageReached: S.result ? S.result.stage : S.stage, result: S.result ? (S.result.win ? 'win' : 'lose') : (S.phase === 'dead' ? 'lose' : 'in progress'), mods: S.hero ? S.hero.mods : null, modNames: S.hero ? modNames(S) : null, level: S.hero && S.hero.level, picks: st.picks, shots: st.shots, dmgTaken: st.dmgTaken,
    input: V.Input ? { counts: V.Input.counts, log: V.Input.logText() } : null,
    audio: V.Audio ? { state: V.Audio.state, played: V.Audio.played, dropped: V.Audio.dropped, settings: V.Audio.settings ? V.Audio.settings() : null } : null,
    settings: V.TUNE,
    homeVisible: !!(V.Home && V.Home.visible && V.Home.visible()),
    meta: metaBlock()
  };
  return 'Project Volley report\n' + JSON.stringify(r, null, 1);
};
UI.BUILD = BUILD;
})();
