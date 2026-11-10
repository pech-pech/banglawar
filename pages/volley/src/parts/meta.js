// V.Meta: P1.5 early meta slice (save, credits, one rifle L1-10, three Conditioning stats, debug power, run log).
// Owner META. Load after mods, before sim. Pure data + localStorage (guarded); no network, no Math.random, no Date in stats/cost.
//
// API beyond HOME-CONTRACT.md (read before using):
//   V.Meta.state                     live object (shape in the contract) plus three extra top-level fields:
//                                    buys (Conditioning purchases so far = ladder index), power (0-1), and optional
//                                    schematics/keys (only set by sample(); the real slice never changes them).
//   V.Meta.load(opts) -> state       opts.storage overrides localStorage; opts.fresh ignores the save. '?fresh=1' in the URL also ignores it.
//   V.Meta.save() -> bool            false when there is no storage or it throws.
//   SAVE RULES (F0 #8, 08 section 4). Key 'volley.save.v2' (V.Meta.KEY; v1 held settings, so the shape changed). Settings are NOT in the save.
//     load(): own keys with a lower version are deleted; higher ones are never touched. The text is parsed, then fully validated
//     (V.Meta.validate: types, ranges, known IDs, caps, no unknown fields). Any failure = fresh start, no partial repair.
//   V.Meta.resetSignal               after load(): '' or 'old-version' | 'corrupt' | 'invalid'. When set, show V.Meta.RESET_LINE once
//                                    ("Progress was reset by this update.", 05 3.1: title screen line + one Home toast). Next boot is quiet.
//   V.Meta.storageOk / BLOCKED_LINE  false when storage is missing or throws: the game plays from memory; note = BLOCKED_LINE.
//   V.Meta.readOnly / V.Meta.note    true after load() when a newer build's save exists (a volley.save.vN key with N > 2, or a payload
//                                    v > 2 in our key, shown best-effort): played but never written back; reset() clears it.
//   V.Meta.reset()                   THE one clean reset: fresh state, saved, listeners notified (Settings "Reset save"). Settings survive.
//   V.Meta.settings() / setSetting(k, v)   key 'volley.settings.v1', one JSON object read field by field with defaults. meta.js owns
//                                    .haptics (bool, applied to V.TUNE.HAPTICS); audio.js owns .audio (agent C). Every writer keeps fields it does not own.
//   V.Meta.SAMPLES / SAMPLE_NAMES / loadSample(name, {save})   'fresh' | 'mid' | 'all' (08 rule 8): the debug menu (Intel > Settings,
//                                    ?debug=1 only) and bots use the same three. loadSample saves unless {save:false}.
//   V.Meta.setPower(v)  = same as setting .power; V.Meta.maxLevel(kind,id) (10 for every stat); V.Meta.buyRandom('cond') -> stat id or null.
//   Rifle calls use kind 'rifle', id 'rifle' (id is ignored): cost('rifle','rifle'), canBuy, buy.
//   V.Meta.rifleStat(lvl) -> rifle ATK at that level = 50 + 8*(lvl-1) (D4 Surplus rifle). The sim only uses the part above L1 (8 per level).
//   stats(): hpAdd is added to max HP, atkMul multiplies ATK, rateMul > 1 = faster fire (interval = base / rateMul).
//   runs[] is OLDEST FIRST (append), t = epoch ms, kept last 20: show the last 10 by reading from the end.
//   best = highest stage reached (Chapter 1 has 10 stages in P1: show best / 10).
//   V.Meta.boughtCount('cond') (0-30), maxTotal('cond') (30), nextPrice('cond') -> credits or null. UI: use buyRandom('cond') (random roll, one rising ladder).
//   save() and every mutation fire onChange once.
//   V.Meta.setStorage(obj|null)      swap storage (tests use a mock).
//   V.Meta.cost('rifle')             {credits} for next rifle level, or null at level 10. id optional.
//   V.Meta.cost('cond', 'hp'|'atk'|'rate'|'rand')   {credits} or null at max. 'rand' = a random unlocked, not-maxed stat, same price.
//   V.Meta.canBuy(kind,id) / buy(kind,id)  buy returns true/false, saves, notifies. 'rand' stores V.Meta.lastBuy = 'hp'|'atk'|'rate'.
//   V.Meta.level(kind,id) / V.Meta.max(kind)   current level and max level (rifle 10, each cond stat 10).
//   V.Meta.TUNING                    every number in one table (prices, per-level values, room credits).
//   V.Meta.stats() -> {hpAdd, atkMul, rateMul, moveMul, dmgTakenMul, power}   neutral {0,1,1,1,1} on a fresh state.
//   V.Meta.totals() -> {maxHp, atk, rate, interval, power, rifleAtk}   what the Operator tab shows (HERO_HP 600, HERO_ATK 150, 0.8 s base).
//   V.Meta.power (get/set 0-1)       DEBUG: blends every level from earned toward the maximum (1 = rifle L10 and all Conditioning 10). Default 0 = earned only. Saved.
//   V.Meta.award(result) -> {credits}  result.credits from the sim; idempotent per result object (result.awarded). Adds credits, run log
//                                    entry (oldest first, kept 20), best stage, codex (result.seen = ['E-01',...]); saves. The sim calls it itself
//                                    in endRun when it was started with Meta, so the shell must NOT need to call it (calling twice is safe).
//   V.Meta.roomCredits(kind) / V.Meta.BOSS_BONUS   used by sim.js.
//   V.Meta.markSeen(type)            codex entry (ignored for an ID that is not in V.Data.enemies, so the save stays valid).
//   V.Meta.onChange(fn) -> unsubscribe fn.
//   V.Meta.sample()                  = loadSample('mid', {save:false}): the design thread's sample save (FIX-ROUND-1 section A), memory only.
//                                    Sets credits 12480, rifle Lv 8, cond 15 bought (hp 6, atk 5, rate 4), next price 2250, schematics 86, keys 1, best 23.
(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};

// F0 #8 save rules (08 section 4): the key holds the version; a shape change raises VERSION and starts fresh (pick 12, no migration).
var VERSION = 2, PREFIX = 'volley.save.v', KEY = PREFIX + VERSION, SETTINGS_KEY = 'volley.settings.v1';
// ---------- tuning table (every number lives here) ----------
var TUNING = {
  HERO_HP: 600, HERO_ATK: 150, BASE_INTERVAL: 0.8,          // mirror of tune.js (used only for totals())
  RIFLE_MAX: 10, COND_MAX: 10,
  // Rifle upgrade price for level n -> n+1: 200 x n (D4 2.7 reference, "Ref Credits") x 1.25 (N2 gear multiplier), rounded to 25.
  RIFLE_REF_STEP: 200, GEAR_MULT: 1.25,
  // Conditioning ladder, reference price of purchase N (D4 1.4, N = 1..30) x 1.25 (N2), rounded to 25. One ladder for all three stats.
  COND_REF: [200,250,300,350,400,450,500,600,700,800,900,1000,1200,1400,1600,1800,2000,2200,2400,2600,2800,3000,3500,4000,4500,5000,5500,6000,6500,7000],
  COND_MULT: 1.25,
  // Per-level values (chosen here; D4 talent tables are for the 11-talent full game).
  RIFLE_ATK_PER_LVL: 8,       // flat ATK per level above L1 (D4 2.2 Surplus rifle +8/level); L1 is the neutral baseline
  COND_HP_PER_LVL: 40,        // max HP flat
  COND_ATK_PER_LVL: 0.03,     // ATK multiplier fraction
  COND_RATE_PER_LVL: 0.03,    // fire-rate multiplier fraction
  // Credits per cleared room (D4 3.1 weights: fight 1, Supply 0, Cache 4, boss 3; 23.8 credits per weight rounded to 24; a 10-stage
  // run is a fifth of the 50-stage chapter, so a full win pays about 334 of the 1,667 chapter mid).
  CREDITS_PER_WEIGHT: 24,
  ROOM: { combat: 24, supply: 0, cache: 95, boss: 24 },
  BOSS_BONUS: 47,             // added on boss kill (boss room total 71)
  RUN_LOG_KEEP: 20,
  // save validation caps (guesses): credits, stage numbers, and the longest save text accepted (a full v2 save is about 2 KB)
  CREDITS_MAX: 1e9, STAGE_MAX: 999, SAVE_TEXT_MAX: 65536
};
function r25(x){ return Math.round(x / 25) * 25; }

function fresh(){
  return { v:VERSION, credits:0, rifle:{ lvl:1 }, cond:{ hp:0, atk:0, rate:0 }, buys:0, power:0, runs:[], best:0, codex:{ seen:{} } };
}
var storage = null, listeners = [], M = {};
try { storage = (typeof localStorage !== 'undefined') ? localStorage : (G.localStorage || null); } catch (e) { storage = null; }   // blocked storage can throw on the property access itself
M.state = fresh();
M.TUNING = TUNING;
M.BOSS_BONUS = TUNING.BOSS_BONUS;
M.KEY = KEY; M.SETTINGS_KEY = SETTINGS_KEY; M.VERSION = VERSION;
M.RESET_LINE = 'Progress was reset by this update.';            // 05 3.1 wording (ruling R20); the title screen and Home toast show it
M.BLOCKED_LINE = 'Storage is blocked: progress will not be kept.';
M.lastBuy = null;
M.readOnly = false; M.note = '';   // readOnly: a newer build's save exists; save() does not write (see load)
M.resetSignal = '';                // after load(): '' or why progress started fresh ('old-version', 'corrupt', 'invalid'); UI shows RESET_LINE once
M.storageOk = true;                // false when storage is missing or throws: play from memory, show BLOCKED_LINE

// ---------- validation (08 section 4: types, ranges, known IDs, caps; any failure = fresh start, no partial repair) ----------
function isInt(v, lo, hi){ return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }
function isNum(v, lo, hi){ return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
function isObj(o){ return !!o && typeof o === 'object' && !Array.isArray(o); }
function onlyKeys(o, allowed){ for (var k in o) if (allowed.indexOf(k) < 0) return false; return true; }
function knownId(id){
  var T = V.Data && V.Data.enemies;
  return T ? Object.prototype.hasOwnProperty.call(T, id) : /^[EB]-\d\d$/.test(id);
}
var TOP = ['v', 'credits', 'rifle', 'cond', 'buys', 'power', 'runs', 'best', 'codex', 'schematics', 'keys'];
// Returns a clean deep copy of a valid v2 save, or null. Never throws.
function validate(raw){
  try {
    if (!isObj(raw) || raw.v !== VERSION || !onlyKeys(raw, TOP)) return null;
    var T = TUNING;
    if (!isInt(raw.credits, 0, T.CREDITS_MAX)) return null;
    if (!isObj(raw.rifle) || !onlyKeys(raw.rifle, ['lvl']) || !isInt(raw.rifle.lvl, 1, T.RIFLE_MAX)) return null;
    var c = raw.cond;
    if (!isObj(c) || !onlyKeys(c, ['hp', 'atk', 'rate']) || !isInt(c.hp, 0, T.COND_MAX) || !isInt(c.atk, 0, T.COND_MAX) || !isInt(c.rate, 0, T.COND_MAX)) return null;
    if (raw.buys !== c.hp + c.atk + c.rate) return null;                       // ladder index always equals levels bought
    if (!isNum(raw.power, 0, 1)) return null;
    if (!Array.isArray(raw.runs) || raw.runs.length > T.RUN_LOG_KEEP) return null;
    var runs = [];
    for (var i = 0; i < raw.runs.length; i++) {
      var r = raw.runs[i];
      if (!isObj(r) || !onlyKeys(r, ['t', 'stage', 'win', 'kills', 'credits', 'dur'])) return null;
      if (!isNum(r.t, 0, 1e15) || !isInt(r.stage, 0, T.STAGE_MAX) || typeof r.win !== 'boolean' || !isInt(r.kills, 0, 1e6) || !isInt(r.credits, 0, T.CREDITS_MAX) || !isNum(r.dur, 0, 1e7)) return null;
      runs.push({ t:r.t, stage:r.stage, win:r.win, kills:r.kills, credits:r.credits, dur:r.dur });
    }
    if (!isInt(raw.best, 0, T.STAGE_MAX)) return null;
    if (!isObj(raw.codex) || !onlyKeys(raw.codex, ['seen']) || !isObj(raw.codex.seen)) return null;
    var seen = {};
    for (var k in raw.codex.seen) { if (!knownId(k) || raw.codex.seen[k] !== true) return null; seen[k] = true; }
    var s = { v:VERSION, credits:raw.credits, rifle:{ lvl:raw.rifle.lvl }, cond:{ hp:c.hp, atk:c.atk, rate:c.rate }, buys:raw.buys,
      power:raw.power, runs:runs, best:raw.best, codex:{ seen:seen } };
    if ('schematics' in raw) { if (!isInt(raw.schematics, 0, T.CREDITS_MAX)) return null; s.schematics = raw.schematics; }
    if ('keys' in raw) { if (!isInt(raw.keys, 0, 999)) return null; s.keys = raw.keys; }
    return s;
  } catch (e) { return null; }
}
M.validate = validate;
// Best-effort read of a NEWER build's save (PV-19), shown read-only and never written: clamps instead of rejecting.
function clampInt(v, lo, hi, d){ v = Math.floor(+v); if (!isFinite(v)) return d; return Math.max(lo, Math.min(hi, v)); }
function lenient(raw){
  var s = fresh();
  try {
    s.credits = clampInt(raw.credits, 0, TUNING.CREDITS_MAX, 0);
    s.rifle.lvl = clampInt(raw.rifle && raw.rifle.lvl, 1, TUNING.RIFLE_MAX, 1);
    var c = isObj(raw.cond) ? raw.cond : {};
    s.cond.hp = clampInt(c.hp, 0, TUNING.COND_MAX, 0); s.cond.atk = clampInt(c.atk, 0, TUNING.COND_MAX, 0); s.cond.rate = clampInt(c.rate, 0, TUNING.COND_MAX, 0);
    s.buys = s.cond.hp + s.cond.atk + s.cond.rate;
    s.best = clampInt(raw.best, 0, TUNING.STAGE_MAX, 0);
  } catch (e) { return fresh(); }
  return s;
}
function notify(){ for (var i = 0; i < listeners.length; i++) { try { listeners[i](M.state); } catch (e) {} } }

// ---------- storage helpers (every access guarded, L-PV-23) ----------
function sget(st, k){ try { return st.getItem(k); } catch (e) { M.storageOk = false; return null; } }
function sset(st, k, v){ try { st.setItem(k, v); return true; } catch (e) { return false; } }
function sdel(st, k){ try { if (st.removeItem) st.removeItem(k); } catch (e) {} }
// Our own save keys in storage: { ver: key }. Uses length/key() when the storage has them (a mock may not).
function ownKeys(st){
  var out = {};
  try {
    var n = +st.length;
    if (isFinite(n) && typeof st.key === 'function') for (var i = 0; i < n; i++) { var k = st.key(i), m = /^volley\.save\.v(\d+)$/.exec(k || ''); if (m) out[+m[1]] = k; }
    else if (st.d && typeof st.d === 'object') for (var k2 in st.d) { var m2 = /^volley\.save\.v(\d+)$/.exec(k2); if (m2) out[+m2[1]] = k2; }   // test mock
  } catch (e) {}
  for (var v = 1; v < VERSION; v++) if (!(v in out) && sget(st, PREFIX + v) != null) out[v] = PREFIX + v;   // older keys we know by name
  return out;
}

M.setStorage = function(s){ storage = s || null; };
M.load = function(opts){
  opts = opts || {};
  var skip = !!opts.fresh;
  try { if (!skip && typeof location !== 'undefined' && /[?&]fresh=1\b/.test(location.search || '')) skip = true; } catch (e) {}
  if (opts.storage) storage = opts.storage;
  var st = storage, txt = null, raw = null, newer = false, old = false;
  M.readOnly = false; M.note = ''; M.resetSignal = ''; M.storageOk = !!st;
  if (st) {
    var keys = ownKeys(st);
    for (var ver in keys) {
      if (+ver < VERSION) { old = true; sdel(st, keys[ver]); }               // own lower-version keys: deleted on boot
      else if (+ver > VERSION) newer = true;                                  // higher: never touched
    }
    if (!skip) txt = sget(st, KEY);
  }
  var s = null, reason = '';
  if (txt != null && txt !== '') {
    if (typeof txt !== 'string' || txt.length > TUNING.SAVE_TEXT_MAX) reason = 'invalid';
    else { try { raw = JSON.parse(txt); } catch (e) { raw = null; reason = 'corrupt'; } }
    if (!reason) {
      if (isObj(raw) && typeof raw.v === 'number' && raw.v > VERSION) { newer = true; s = lenient(raw); }   // PV-19: newer build wrote our key
      else { s = validate(raw); if (!s) reason = 'invalid'; }
    }
  } else if (old && !skip) reason = 'old-version';
  M.state = s || fresh();
  M.readOnly = newer;
  M.resetSignal = reason;
  M.note = newer ? 'Save from a newer version: progress this session is not saved' : (!M.storageOk ? M.BLOCKED_LINE : (reason ? M.RESET_LINE : ''));
  if (reason && reason !== 'old-version' && st && !newer) sset(st, KEY, JSON.stringify(M.state));   // a bad save is replaced at once, so the line shows once
  applySettings();
  notify();
  return M.state;
};
M.save = function(){   // always notifies onChange listeners, also when there is no storage
  var okk = false;
  if (storage && !M.readOnly) okk = sset(storage, KEY, JSON.stringify(M.state));
  notify();
  return okk;
};
// The one clean reset (Settings "Reset save" and the sample menu's "fresh"): fresh state, written, listeners told. Settings survive.
M.reset = function(){ M.readOnly = false; M.note = ''; M.resetSignal = ''; M.state = fresh(); M.lastBuy = null; return M.save(); };
M.onChange = function(fn){ listeners.push(fn); return function(){ var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };

// ---------- settings: own key, read field by field with defaults, survive a save wipe (08 section 4) ----------
// One JSON object. audio.js owns the .audio sub-object (agreed with agent C); meta.js owns .haptics and keeps every other field it finds.
var SETTINGS_DEFAULTS = { haptics:true };
function readSettings(){
  var o = null, txt = storage ? sget(storage, SETTINGS_KEY) : null;
  if (typeof txt === 'string' && txt.length <= TUNING.SAVE_TEXT_MAX) { try { o = JSON.parse(txt); } catch (e) { o = null; } }
  if (!isObj(o)) o = {};
  for (var k in SETTINGS_DEFAULTS) if (typeof o[k] !== typeof SETTINGS_DEFAULTS[k]) o[k] = SETTINGS_DEFAULTS[k];
  return o;
}
var memSettings = null;   // used when storage is missing or blocked
M.settings = function(){ var o = storage ? readSettings() : (memSettings || (memSettings = readSettings())); return o; };
M.setSetting = function(k, v){
  if (!(k in SETTINGS_DEFAULTS) || typeof v !== typeof SETTINGS_DEFAULTS[k]) return false;
  var o = M.settings(); o[k] = v; memSettings = o;
  var okk = storage ? sset(storage, SETTINGS_KEY, JSON.stringify(o)) : false;
  applySettings(o);
  return okk;
};
function applySettings(o){ try { o = o || M.settings(); if (V.TUNE && 'HAPTICS' in V.TUNE) V.TUNE.HAPTICS = o.haptics; } catch (e) {} }

// ---------- costs and buying ----------
M.max = function(kind){ return kind === 'rifle' ? TUNING.RIFLE_MAX : TUNING.COND_MAX; };
M.rifleStat = function(lvl){ return 50 + TUNING.RIFLE_ATK_PER_LVL * (Math.max(1, Math.floor(+lvl || 1)) - 1); };
M.maxLevel = function(kind, id){ return M.max(kind); };   // all caps are 10 (TABS-B assumed hp 25, atk 25, rate 10; see TUNING)
M.level = function(kind, id){ return kind === 'rifle' ? M.state.rifle.lvl : (M.state.cond[id] || 0); };
function ladder(n){ var i = Math.min(n, TUNING.COND_REF.length - 1); return r25(TUNING.COND_REF[i] * TUNING.COND_MULT); }  // n = purchases so far (0-based)
function condOpen(){ return ['hp', 'atk', 'rate'].filter(function(k){ return M.state.cond[k] < TUNING.COND_MAX; }); }
M.cost = function(kind, id){
  var s = M.state;
  if (kind === 'rifle') return s.rifle.lvl >= TUNING.RIFLE_MAX ? null : { credits: r25(TUNING.RIFLE_REF_STEP * s.rifle.lvl * TUNING.GEAR_MULT) };
  if (kind === 'cond') {
    if (id === 'rand') { if (!condOpen().length) return null; }
    else if (!(id in s.cond) || s.cond[id] >= TUNING.COND_MAX) return null;
    return { credits: ladder(s.buys) };
  }
  return null;
};
M.canBuy = function(kind, id){ var c = M.cost(kind, id); return !!c && M.state.credits >= c.credits; };
M.buy = function(kind, id){
  if (!M.canBuy(kind, id)) return false;
  var s = M.state, c = M.cost(kind, id);
  s.credits -= c.credits;
  if (kind === 'rifle') s.rifle.lvl++;
  else {
    var pick = id;
    if (id === 'rand') {
      var open = condOpen();
      // deterministic pseudo-random from the save itself (no Math.random): purchases, credits and run count
      var h = (s.buys * 2654435761 + s.credits * 40503 + s.runs.length * 9973 + 12345) >>> 0;
      pick = open[h % open.length];
    }
    s.cond[pick]++; s.buys++; M.lastBuy = pick;
  }
  M.save();
  return true;
};
// Random Conditioning (D4: each buy upgrades a random unlocked stat). Returns the stat id bought, or null (cannot afford / all maxed).
// Counter helpers for "N / M bought" and the next price (random roll uses one ladder across all buys).
M.boughtCount = function(kind){ return kind === 'cond' ? M.state.buys : M.state.rifle.lvl - 1; };
M.maxTotal = function(kind){ return kind === 'cond' ? 3 * TUNING.COND_MAX : TUNING.RIFLE_MAX - 1; };
M.nextPrice = function(kind){ var c = M.cost(kind, kind === 'cond' ? 'rand' : 'rifle'); return c ? c.credits : null; };
M.buyRandom = function(kind){ return (kind === 'cond' && M.buy('cond', 'rand')) ? M.lastBuy : null; };

// ---------- stats ----------
function effLevels(){
  var s = M.state, p = Math.max(0, Math.min(1, +M.state.power || 0));
  function e(v, mx){ return v + p * (mx - v); }
  return { rifle: e(s.rifle.lvl, TUNING.RIFLE_MAX), hp: e(s.cond.hp, TUNING.COND_MAX), atk: e(s.cond.atk, TUNING.COND_MAX), rate: e(s.cond.rate, TUNING.COND_MAX) };
}
M.stats = function(){
  var L = effLevels(), T = TUNING;
  var rifleAtk = T.RIFLE_ATK_PER_LVL * (L.rifle - 1);
  var atkMul = (1 + rifleAtk / T.HERO_ATK) * (1 + T.COND_ATK_PER_LVL * L.atk);
  return { hpAdd: T.COND_HP_PER_LVL * L.hp, atkMul: atkMul, rateMul: 1 + T.COND_RATE_PER_LVL * L.rate,
    moveMul: 1, dmgTakenMul: 1, power: M.state.power || 0 };
};
M.totals = function(){
  var st = M.stats(), T = TUNING, L = effLevels();
  var rate = st.rateMul;
  return { maxHp: Math.round(T.HERO_HP + st.hpAdd), atk: Math.floor(T.HERO_ATK * st.atkMul), rate: rate,
    interval: +(T.BASE_INTERVAL / rate).toFixed(3), power: st.power, rifleAtk: Math.round(T.RIFLE_ATK_PER_LVL * (L.rifle - 1)) };
};
M.setPower = function(v){ v = +v; M.state.power = isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; M.save(); };
Object.defineProperty(M, 'power', { get: function(){ return M.state.power || 0; },
  set: function(v){ M.setPower(v); } });

// ---------- income and run log ----------
M.roomCredits = function(kind){ var v = TUNING.ROOM[kind]; return v == null ? TUNING.ROOM.combat : v; };
M.markSeen = function(type){ if (type && knownId(String(type))) { M.state.codex.seen[String(type)] = true; } };   // unknown IDs are ignored so the save stays valid
M.award = function(result){
  var s = M.state;
  if (!result || result.awarded) return { credits: 0 };
  result.awarded = true;
  var c = clampInt(result.credits, 0, TUNING.CREDITS_MAX, 0);
  s.credits = Math.min(TUNING.CREDITS_MAX, s.credits + c);
  var seen = result.seen;
  if (Array.isArray(seen)) seen.forEach(M.markSeen); else if (seen && typeof seen === 'object') for (var k in seen) if (seen[k]) M.markSeen(k);
  var stage = clampInt(result.stage, 0, TUNING.STAGE_MAX, 0);
  if (stage > s.best) s.best = stage;
  var now = 0; try { now = Date.now(); } catch (e) {}   // UI timestamp only
  s.runs.push({ t: now, stage: stage, win: !!result.win, kills: clampInt(result.kills, 0, 1e6, 0), credits: c,
    dur: Math.max(0, Math.min(1e7, +(+result.t || 0).toFixed(1))) });   // clamped so the entry always passes validate()
  if (s.runs.length > TUNING.RUN_LOG_KEEP) s.runs.splice(0, s.runs.length - TUNING.RUN_LOG_KEEP);
  M.save();
  return { credits: c };
};

// ---------- sample saves (08 structure rule 8; F0 #12). Plain data; each passes validate(). Bots and the debug menu use the same three. ----------
var ALL_IDS = ['E-01', 'E-02', 'E-03', 'E-04', 'E-05', 'B-01'];
function seenOf(ids){ var o = {}; ids.forEach(function(k){ o[k] = true; }); return o; }
M.SAMPLES = {
  fresh: function(){ return fresh(); },
  // mid-game: the design thread's sample (FIX-ROUND-1 section A): credits 12480, rifle Lv 8, cond 15 bought (6/5/4), next price 2250, best 23
  mid: function(){ var s = fresh(); s.credits = 12480; s.rifle.lvl = 8; s.cond = { hp:6, atk:5, rate:4 }; s.buys = 15; s.best = 23;
    s.schematics = 86; s.keys = 1; s.codex.seen = seenOf(ALL_IDS.slice(0, 5)); return s; },
  // all unlocked: every level maxed, every contact filed, chapter cleared, credits to spare (amount is a guess)
  all: function(){ var s = fresh(); s.credits = 99999; s.rifle.lvl = TUNING.RIFLE_MAX; s.cond = { hp:TUNING.COND_MAX, atk:TUNING.COND_MAX, rate:TUNING.COND_MAX };
    s.buys = 3 * TUNING.COND_MAX; s.best = 10; s.codex.seen = seenOf(ALL_IDS); return s; }
};
M.SAMPLE_NAMES = ['fresh', 'mid', 'all'];
// loadSample(name, {save:true}): replaces progress with a sample. save:false keeps it in memory only. Returns the state or null.
M.loadSample = function(name, opts){
  if (!Object.prototype.hasOwnProperty.call(M.SAMPLES, name)) return null;
  if (name === 'fresh' && !(opts && opts.save === false)) { M.reset(); return M.state; }
  M.state = M.SAMPLES[name](); M.lastBuy = null;
  if (opts && opts.save === false) notify(); else { M.readOnly = false; M.note = ''; M.save(); }
  return M.state;
};
M.sample = function(){ return M.loadSample('mid', { save:false }); };   // P1.5 name: the mid-game sample, memory only

V.Meta = M;
// auto-load once in a browser; Node tests call load() themselves with a mock. bot.js never loads this file.
try { if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') M.load(); } catch (e) { /* storage blocked (PV-20): stay on the in-memory fresh state */ }
})();
