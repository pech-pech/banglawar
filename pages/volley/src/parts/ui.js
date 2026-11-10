(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// DOM HUD, overlays (cards, death, pause), toasts and the tuning drawer.
// Shell-only knobs are added here so the drawer and Copy settings cover them.
if (V.TUNE_DEFAULTS) {
  var SHELL = { AUTO_WALK: true, AUTO_WALK_DELAY: 1.0, EDGE_FLASH: true, HAPTIC_HURT_MS: 40, HAPTIC_KILL_MS: 12 };
  for (var sk in SHELL) if (!(sk in V.TUNE_DEFAULTS)) { V.TUNE_DEFAULTS[sk] = SHELL[sk]; if (V.TUNE && !(sk in V.TUNE)) V.TUNE[sk] = SHELL[sk]; }
}
var BUILD = 'volley-f0-1';
// Persist tuning (only values that differ from defaults). Every storage call is guarded. Sound on/off is NOT kept here any more:
// V.TUNE.SOUND is a view of V.Audio's mute, saved in 'volley.settings.v1' (audio.js), so a tune reset or save wipe keeps it.
var STORE = 'volley.tune';
function loadTune(){
  try {
    var raw = G.localStorage && localStorage.getItem(STORE); if (!raw) return;
    var o = JSON.parse(raw);
    for (var k in o) if (k !== 'SOUND' && V.TUNE_DEFAULTS && k in V.TUNE_DEFAULTS && typeof o[k] === typeof V.TUNE_DEFAULTS[k]) V.TUNE[k] = o[k];
  } catch (_) {}
}
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
  ['Input', ['BRACE_DELAY', 'DEADZONE_ENTER', 'DEADZONE_EXIT', 'AUTO_WALK', 'AUTO_WALK_DELAY']]
];
var RANGE = {
  HERO_HP: [100, 2000, 10], HERO_ATK: [20, 600, 5], CRIT_CHANCE: [0, 1, 0.01], CRIT_MULT: [1, 4, 0.05], MOVE_SPEED: [1, 10, 0.1],
  FIRE_INTERVAL: [0.1, 2, 0.01], FIRE_FLOOR: [0.05, 1, 0.01], ROUND_SPEED: [3, 30, 0.5], ROUND_R: [0.04, 0.4, 0.01], INVULN: [0, 2, 0.05],
  ENEMY_HP_GLOBAL: [0.1, 3, 0.01], HP_SLOPE: [0, 0.3, 0.002], DMG_SLOPE: [0, 0.3, 0.002], ENEMY_DMG_MULT: [0, 4, 0.05],
  ENEMY_SHOT_SPEED_MULT: [0.2, 3, 0.05], TELL_MULT: [0.2, 3, 0.05], TIME_SCALE: [0.1, 2, 0.05], HITSTOP_MS: [0, 200, 5],
  CARDS_OFFERED: [1, 3, 1], BRACE_DELAY: [0, 1, 0.01], DEADZONE_ENTER: [2, 60, 1], DEADZONE_EXIT: [0, 40, 1],
  HAPTIC_HURT_MS: [0, 200, 5], AUTO_WALK_DELAY: [0, 3, 0.1], HAPTIC_KILL_MS: [0, 100, 2]
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
  row.appendChild(inp); return row;
}

UI.openDrawer = function(on){
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
UI.placeToast = function(view){
  // Below the room, in the ground area: never over the HUD bars or the room edge (L-TD-5).
  // D10: one line, in the band below the room, under the two-line how-to box (top +14, ~50 px tall), clear of the spawn.
  var t = $('toast'); t.style.top = Math.round(Math.min(view.oy + 15 * view.s + 76, view.h - 56)) + 'px';   // clamp: short screens have no band below the room
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
  var xpPct = h.xpNext ? Math.max(0, Math.min(1, h.xp / h.xpNext)) : 1;
  var key = [S.stage, S.roomId, hp, mx, h.level, Math.round(xpPct * 200)].join('|');
  if (key !== lastHud) {
    lastHud = key;
    $('stNum').textContent = S.stage;
    $('roomName').textContent = room ? room.name : (S.roomId || '');
    $('lvl').textContent = 'Lv ' + h.level;
    $('xpFill').style.width = (xpPct * 100).toFixed(1) + '%';
    $('hpFill').style.width = (hp / mx * 100).toFixed(1) + '%';
    $('hpFill').style.background = hp / mx < 0.3 ? '#f07a6e' : '#5fd06a';
    // Dark text is clipped to the filled part, light text to the empty part.
    var cut = (100 - hp / mx * 100).toFixed(1) + '%', ht = hp + ' / ' + mx;
    $('hpTxt').textContent = ht; $('hpTxtE').textContent = ht;
    $('hpTxt').style.clipPath = 'inset(0 ' + cut + ' 0 0)';
    $('hpTxtE').style.clipPath = 'inset(0 0 0 ' + (hp / mx * 100).toFixed(1) + '%)';
  }
  UI.rendererLabel(R, view);
  UI.boss(S, view);
};
var bossKey = '';
UI.boss = function(S, view){
  var b = S.boss, el = $('bossBar');
  var on = !!(b && b.hp > 0 && S.phase !== 'results');
  if (!on) { if (el.style.display !== 'none') el.style.display = 'none'; bossKey = ''; return; }
  var k = [b.name, Math.ceil(b.hp), b.maxHp, b.phase, Math.round(view.ox), Math.round(view.oy), Math.round(view.s)].join('|');
  if (k === bossKey) return; bossKey = k;
  // Top of the room, inside the north wall row, so it never covers the HUD bars.
  // D1: name and numbers on a row above a plain full-width bar (block is about 34 px tall).
  el.style.display = 'block';
  el.style.left = Math.round(view.ox + view.s * 0.25) + 'px';
  el.style.width = Math.round(view.s * 8.5) + 'px';
  el.style.top = Math.round(view.oy + Math.max(0, (view.s - (el.offsetHeight || 34)) / 2)) + 'px';
  $('bossFill').style.width = Math.max(0, Math.min(100, b.hp / b.maxHp * 100)).toFixed(1) + '%';
  $('bossName').textContent = (b.name || 'Boss') + (b.phase === 2 ? ' - phase 2' : '');
  $('bossHp').textContent = Math.ceil(b.hp) + ' / ' + Math.round(b.maxHp);
};
UI.howto = function(on, view){
  var el = $('howto');
  if (on) { el.style.top = Math.round(view.oy + 15 * view.s + 14) + 'px'; if (el.style.display !== 'block') el.style.display = 'block'; }
  else if (el.style.display !== 'none') el.style.display = 'none';
};
function fmtN(n){ return (V.Home && V.Home.fmt) ? V.Home.fmt(n) : String(n); }
UI.rendererLabel = function(R, view){
  var t = (R ? R.name : 'none') + ' | ' + Math.round(view.vw || view.w) + 'x' + Math.round(view.vh || view.h) + ' | x' + (view.scale || 1).toFixed(2) + ' | dpr ' + (Math.round((G.devicePixelRatio || 1) * 100) / 100);
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
UI.cards = function(S, onPick){
  var list = $('cardList'); list.innerHTML = '';
  $('cardTitle').textContent = S.stageKind === 'cache' ? 'Cache: free field upgrade' : 'Field upgrade - level ' + S.hero.level;
  (S.cards || []).forEach(function(ci, i){
    var c = (V.CARDS && V.CARDS[ci]) || { name: 'Card ' + ci, desc: '' };
    var b = row('card', glyphFor(c), '', c.name, c.desc, function(){ onPick(i); }); b.dataset.i = i;
    list.appendChild(b);
  });
  show('ovCards', true);
};

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
    out.push((c ? c.name : k) + (m[k] > 1 ? ' x' + m[k] : ''));
  }
  return out;
}
function mmss(t){ t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
UI.results = function(S){
  var r = S.result || { win: false, stage: S.stage, t: S.t, kills: S.stats && S.stats.kills, level: S.hero.level, dmgTaken: S.stats && S.stats.dmgTaken };
  var t = $('resTitle'); t.textContent = r.win ? 'Chapter 1 clear' : 'Operator down'; t.className = r.win ? 'win' : '';
  var mods = modNames(S);
  var rows = [['Result', r.win ? 'Win' : 'Lost'], ['Stage reached', (r.stage != null ? r.stage : S.stage) + ' / 10'], ['Time', mmss(r.t != null ? r.t : S.t)],
    ['Kills', fmtN(r.kills | 0)], ['Level', r.level != null ? r.level : S.hero.level], ['Damage taken', fmtN(Math.round(r.dmgTaken || 0))], ['Mods', mods.length ? mods.join(', ') : 'none']];
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
    build: BUILD, date: new Date().toISOString(), seed: S.seed, renderer: m.renderer, viewport: m.viewport, dpr: G.devicePixelRatio || 1,
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
