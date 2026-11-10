(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// DOM HUD, overlays (cards, death, pause), toasts and the tuning drawer.
// Shell-only knobs are added here so the drawer and Copy settings cover them.
if (V.TUNE_DEFAULTS) {
  var SHELL = { EDGE_FLASH: true, HAPTIC_HURT_MS: 40, HAPTIC_KILL_MS: 12 };
  for (var sk in SHELL) if (!(sk in V.TUNE_DEFAULTS)) { V.TUNE_DEFAULTS[sk] = SHELL[sk]; if (V.TUNE && !(sk in V.TUNE)) V.TUNE[sk] = SHELL[sk]; }
}
var BUILD = 'volley-p0-1';
var $ = function(id){ return document.getElementById(id); };

var GROUPS = [
  ['Hero', ['HERO_HP', 'HERO_ATK', 'CRIT_CHANCE', 'CRIT_MULT', 'MOVE_SPEED', 'FIRE_INTERVAL', 'FIRE_FLOOR', 'ROUND_SPEED', 'ROUND_R', 'INVULN', 'PICKUP_R']],
  ['Enemies', ['ENEMY_HP_GLOBAL', 'HP_SLOPE', 'DMG_SLOPE', 'ENEMY_DMG_MULT', 'ENEMY_SHOT_SPEED_MULT', 'TELL_MULT', 'SPAWN_T']],
  ['Feel', ['TIME_SCALE', 'HITSTOP_MS', 'CARDS_OFFERED', 'PICK_DELAY', 'EDGE_FLASH', 'HAPTICS', 'HAPTIC_HURT_MS', 'HAPTIC_KILL_MS', 'SOUND']],
  ['Input', ['BRACE_DELAY', 'DEADZONE_ENTER', 'DEADZONE_EXIT']]
];
var RANGE = {
  HERO_HP: [100, 2000, 10], HERO_ATK: [20, 600, 5], CRIT_CHANCE: [0, 1, 0.01], CRIT_MULT: [1, 4, 0.05], MOVE_SPEED: [1, 10, 0.1],
  FIRE_INTERVAL: [0.1, 2, 0.01], FIRE_FLOOR: [0.05, 1, 0.01], ROUND_SPEED: [3, 30, 0.5], ROUND_R: [0.04, 0.4, 0.01], INVULN: [0, 2, 0.05],
  ENEMY_HP_GLOBAL: [0.1, 3, 0.01], HP_SLOPE: [0, 0.3, 0.002], DMG_SLOPE: [0, 0.3, 0.002], ENEMY_DMG_MULT: [0, 4, 0.05],
  ENEMY_SHOT_SPEED_MULT: [0.2, 3, 0.05], TELL_MULT: [0.2, 3, 0.05], TIME_SCALE: [0.1, 2, 0.05], HITSTOP_MS: [0, 200, 5],
  CARDS_OFFERED: [1, 3, 1], BRACE_DELAY: [0, 1, 0.01], DEADZONE_ENTER: [2, 60, 1], DEADZONE_EXIT: [0, 40, 1],
  HAPTIC_HURT_MS: [0, 200, 5], HAPTIC_KILL_MS: [0, 100, 2]
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
    buildDrawer(); msg('Defaults restored');
  });
  $('drCopyS').addEventListener('click', function(){ copy(JSON.stringify(V.TUNE, null, 1), 'Settings copied'); });
  $('drCopyR').addEventListener('click', function(){ copy(UI.report(), 'Report copied'); });
  buildDrawer();
};

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
    b.addEventListener('click', function(){ V.TUNE[k] = !V.TUNE[k]; paint(); });
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
  var any = ['ovCards', 'ovDead', 'ovPause', 'ovBoot'].some(function(id){ return $(id).classList.contains('on'); }) || UI.drawerOpen();
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
  var t = $('toast'); t.style.top = Math.round(view.oy + 15 * view.s + 12) + 'px';
};

var flashT = 0;
UI.hurtFlash = function(){
  if (V.TUNE.EDGE_FLASH === false) return;
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
    $('hpTxt').textContent = hp + ' / ' + mx;
  }
  UI.rendererLabel(R, view);
};
UI.rendererLabel = function(R, view){
  var t = (R ? R.name : 'none') + ' | ' + Math.round(view.w) + 'x' + Math.round(view.h) + ' | dpr ' + (Math.round((G.devicePixelRatio || 1) * 100) / 100);
  var el = $('rlbl'); if (el.textContent !== t) el.textContent = t;
};

UI.cards = function(S, onPick){
  var list = $('cardList'); list.innerHTML = '';
  $('cardTitle').textContent = 'Field upgrade - level ' + S.hero.level;
  (S.cards || []).forEach(function(ci, i){
    var c = (V.CARDS && V.CARDS[ci]) || { name: 'Card ' + ci, desc: '' };
    var b = document.createElement('button'); b.className = 'card'; b.dataset.i = i;
    var n = document.createElement('b'); n.textContent = c.name; var d = document.createElement('span'); d.textContent = c.desc || '';
    b.appendChild(n); b.appendChild(d);
    b.addEventListener('click', function(){ onPick(i); });
    list.appendChild(b);
  });
  show('ovCards', true);
};

UI.dead = function(S){
  var st = S.stats || {}, rt = st.roomTimes || [];
  var room = V.ROOMS && V.ROOMS[S.roomId];
  var lines = [
    'Reached stage ' + S.stage + (room ? ' (' + room.name + ')' : ''),
    'Level ' + S.hero.level + ' | ' + (st.kills | 0) + ' machines down',
    'Rooms cleared ' + rt.length + ' | Damage taken ' + Math.round(st.dmgTaken || 0)
  ];
  $('deadStats').innerHTML = lines.map(function(l){ return '<div>' + l.replace(/</g, '&lt;') + '</div>'; }).join('');
  show('ovDead', true);
};

// Copy report: everything needed to compare a play session.
UI.report = function(){
  var m = hooks.metrics ? hooks.metrics() : {}, S = m.S || {}, st = S.stats || {};
  var braced = st.playSteps ? Math.round(100 * (st.bracedSteps || 0) / st.playSteps) : 0;
  var r = {
    build: BUILD, date: new Date().toISOString(), seed: S.seed, renderer: m.renderer, viewport: m.viewport, dpr: G.devicePixelRatio || 1,
    ua: navigator.userAgent,
    frameMs: m.frame, gapsOver50ms: m.gaps,
    bracedUptimePct: braced, hitsBy: st.hitsBy, roomTimes: st.roomTimes, kills: st.kills, deaths: m.deaths,
    stage: S.stage, level: S.hero && S.hero.level, picks: st.picks, shots: st.shots, dmgTaken: st.dmgTaken,
    input: V.Input ? { counts: V.Input.counts, log: V.Input.logText() } : null,
    audio: V.Audio ? { state: V.Audio.state, played: V.Audio.played, dropped: V.Audio.dropped } : null,
    settings: V.TUNE
  };
  return 'Project Volley report\n' + JSON.stringify(r, null, 1);
};
UI.BUILD = BUILD;
})();
