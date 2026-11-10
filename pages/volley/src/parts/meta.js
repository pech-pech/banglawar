// V.Meta: P1.5 early meta slice (save, credits, one rifle L1-10, three Conditioning stats, debug power, run log).
// Owner META. Load after mods, before sim. Pure data + localStorage (guarded); no network, no Math.random, no Date in stats/cost.
//
// API beyond HOME-CONTRACT.md (read before using):
//   V.Meta.state                     live object (shape in the contract) plus three extra top-level fields:
//                                    buys (Conditioning purchases so far = ladder index), power (0-1), and optional
//                                    schematics/keys (only set by sample(); the real slice never changes them).
//   V.Meta.load(opts) -> state       opts.storage overrides localStorage; opts.fresh ignores the save. '?fresh=1' in the URL also ignores it.
//   V.Meta.save() -> bool            false when there is no storage or it throws.
//   V.Meta.reset()                   fresh state, saved, listeners notified (Settings "Reset save").
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
//   V.Meta.markSeen(type)            codex entry.
//   V.Meta.onChange(fn) -> unsubscribe fn.
//   V.Meta.sample()                  loads the design thread's sample save (FIX-ROUND-1 section A) into state, in memory only (not saved).
//                                    Sets credits 12480, rifle Lv 8, cond 15 bought (hp 6, atk 5, rate 4), next price 2250, schematics 86, keys 1, best 23.
(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};

var KEY = 'volley.save.v1';
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
  RUN_LOG_KEEP: 20
};
function r25(x){ return Math.round(x / 25) * 25; }

function fresh(){
  return { v:1, credits:0, rifle:{ lvl:1 }, cond:{ hp:0, atk:0, rate:0 }, buys:0, power:0, runs:[], best:0,
    codex:{ seen:{} }, settings:{ sound:true, haptics:true } };
}
var storage = null, listeners = [], M = {};
try { storage = (typeof localStorage !== 'undefined') ? localStorage : (G.localStorage || null); } catch (e) { storage = null; }
M.state = fresh();
M.TUNING = TUNING;
M.BOSS_BONUS = TUNING.BOSS_BONUS;
M.lastBuy = null;

function clampInt(v, lo, hi, d){ v = Math.floor(+v); if (!isFinite(v)) return d; return Math.max(lo, Math.min(hi, v)); }
function sanitize(raw){
  var s = fresh();
  if (!raw || typeof raw !== 'object') return s;
  s.credits = clampInt(raw.credits, 0, 1e9, 0);
  s.rifle.lvl = clampInt(raw.rifle && raw.rifle.lvl, 1, TUNING.RIFLE_MAX, 1);
  var c = raw.cond || {};
  s.cond.hp = clampInt(c.hp, 0, TUNING.COND_MAX, 0); s.cond.atk = clampInt(c.atk, 0, TUNING.COND_MAX, 0); s.cond.rate = clampInt(c.rate, 0, TUNING.COND_MAX, 0);
  s.buys = s.cond.hp + s.cond.atk + s.cond.rate;   // ladder index always equals levels bought
  var p = +raw.power; s.power = isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
  if (Array.isArray(raw.runs)) s.runs = raw.runs.slice(-TUNING.RUN_LOG_KEEP).map(function(r){
    return { t:+r.t || 0, stage:clampInt(r.stage, 0, 999, 0), win:!!r.win, kills:clampInt(r.kills, 0, 1e6, 0), credits:clampInt(r.credits, 0, 1e9, 0), dur:+r.dur || 0 }; });
  s.best = clampInt(raw.best, 0, 999, 0);
  if (raw.codex && raw.codex.seen && typeof raw.codex.seen === 'object') for (var k in raw.codex.seen) if (raw.codex.seen[k]) s.codex.seen[String(k)] = true;
  if (raw.settings) { s.settings.sound = raw.settings.sound !== false; s.settings.haptics = raw.settings.haptics !== false; }
  return s;
}
function notify(){ for (var i = 0; i < listeners.length; i++) { try { listeners[i](M.state); } catch (e) {} } }

M.setStorage = function(s){ storage = s || null; };
M.load = function(opts){
  opts = opts || {};
  var skip = !!opts.fresh;
  try { if (!skip && typeof location !== 'undefined' && /[?&]fresh=1\b/.test(location.search || '')) skip = true; } catch (e) {}
  var st = opts.storage || storage, raw = null;
  if (opts.storage) storage = opts.storage;
  if (!skip && st) { try { var txt = st.getItem(KEY); if (txt) raw = JSON.parse(txt); } catch (e) { raw = null; } }
  M.state = sanitize(raw);
  notify();
  return M.state;
};
M.save = function(){   // always notifies onChange listeners, also when there is no storage
  var okk = false;
  if (storage) { try { storage.setItem(KEY, JSON.stringify(M.state)); okk = true; } catch (e) { okk = false; } }
  notify();
  return okk;
};
M.reset = function(){ M.state = fresh(); M.lastBuy = null; M.save(); };
M.onChange = function(fn){ listeners.push(fn); return function(){ var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };

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
M.markSeen = function(type){ if (type) { M.state.codex.seen[String(type)] = true; } };
M.award = function(result){
  var s = M.state;
  if (!result || result.awarded) return { credits: 0 };
  result.awarded = true;
  var c = Math.max(0, Math.floor(+result.credits || 0));
  s.credits += c;
  var seen = result.seen;
  if (Array.isArray(seen)) seen.forEach(M.markSeen); else if (seen && typeof seen === 'object') for (var k in seen) if (seen[k]) M.markSeen(k);
  var stage = Math.max(0, Math.floor(+result.stage || 0));
  if (stage > s.best) s.best = stage;
  var now = 0; try { now = Date.now(); } catch (e) {}   // UI timestamp only
  s.runs.push({ t: now, stage: stage, win: !!result.win, kills: Math.floor(+result.kills || 0), credits: c, dur: +(+result.t || 0).toFixed(1) });
  if (s.runs.length > TUNING.RUN_LOG_KEEP) s.runs.splice(0, s.runs.length - TUNING.RUN_LOG_KEEP);
  M.save();
  return { credits: c };
};

// ---------- design sample (FIX-ROUND-1 section A), memory only ----------
M.sample = function(){
  var s = fresh();
  s.credits = 12480; s.rifle.lvl = 8; s.cond = { hp:6, atk:5, rate:4 }; s.buys = 15; s.best = 23;
  s.schematics = 86; s.keys = 1; s.codex.seen = { 'E-01':true, 'E-02':true, 'E-03':true, 'E-04':true, 'E-05':true };
  M.state = s; notify();
  return s;
};

V.Meta = M;
// auto-load once in a browser; Node tests call load() themselves with a mock. bot.js never loads this file.
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') M.load();
})();
