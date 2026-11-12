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
//   V.Meta.setPower(v)  = same as setting .power; V.Meta.maxLevel(kind,id) (rifle 10, hp 10, atk 20, rate 20: shape V + option b, pick 48);
//                                    V.Meta.buyRandom('cond') -> stat id or null.
//   F1 SHOP (pick 48, shape V + option b; owner P). Conditioning buy = 1 level for hp, 2 levels for atk and rate (TUNING.COND_BUY_LEVELS; a buy
//     that would pass the cap grants what is left). Rifle buys stay single. At most TUNING.VISIT_MAX (2) purchases per home visit:
//     V.Meta.visitBuys (get, saved as optional top-level 'visitBuys'), V.Meta.visitLeft(), V.Meta.resetVisit() (the sim/run start must call it;
//     nextRunNo() calls it too), V.Meta.whyNot(kind,id) -> '' | 'max' | 'visit' | 'credits' (canBuy() is whyNot() === '').
//     buy(kind,id) returns FALSE when refused, else {ok:true, kind, item, stat, levels, lvl, price, before, after, visit, vn, left}
//     (an object is truthy, so old if (M.buy(...)) callers still work; new callers read .ok/.levels/.price).
//     purchases[] entries gain optional levels (granted), visit (home visit number = runSeq + 1) and vn (1st or 2nd buy of the visit).
//     HP: per-level table TUNING.HP_STEPS (guess, sized for Ch2 later); stats().hpAdd = sum of the first L steps (fractional L blends).
//   Rifle calls use kind 'rifle', id 'rifle' (id is ignored): cost('rifle','rifle'), canBuy, buy.
//   V.Meta.rifleStat(lvl) -> rifle ATK at that level = 50 + 8*(lvl-1) (D4 Surplus rifle). The sim only uses the part above L1 (8 per level).
//   stats(): hpAdd is added to max HP, atkMul multiplies ATK, rateMul > 1 = faster fire (interval = base / rateMul).
//   runs[] is OLDEST FIRST (append), t = epoch ms, kept last 20: show the last 10 by reading from the end.
//   best = highest stage reached (Chapter 1 has 10 stages in P1: show best / 10).
//   V.Meta.boughtCount('cond') (0-30 buys, NOT levels), maxTotal('cond') (30 buys), nextPrice('cond') -> credits or null. UI: use buyRandom('cond') (random roll, one rising ladder).
//   save() and every mutation fire onChange once.
//   V.Meta.setStorage(obj|null)      swap storage (tests use a mock).
//   V.Meta.cost('rifle')             {credits} for next rifle level, or null at level 10. id optional.
//   V.Meta.cost('cond', 'hp'|'atk'|'rate'|'rand')   {credits} or null at max. 'rand' = a random unlocked, not-maxed stat, same price.
//   V.Meta.canBuy(kind,id) / buy(kind,id)  buy returns true/false, saves, notifies. 'rand' stores V.Meta.lastBuy = 'hp'|'atk'|'rate'.
//   V.Meta.level(kind,id) / V.Meta.max(kind)   current level; max(kind) = rifle 10 levels, cond 10 BUYS per stat (levels: maxLevel(kind,id)).
//   V.Meta.TUNING                    every number in one table (prices, per-level values, room credits).
//   V.Meta.stats() -> {hpAdd, atkMul, rateMul, moveMul, dmgTakenMul, power}   neutral {0,1,1,1,1} on a fresh state.
//   V.Meta.totals() -> {maxHp, atk, rate, interval, power, rifleAtk}   what the Operator tab shows (HERO_HP 600, HERO_ATK 150, 0.8 s base).
//   V.Meta.power (get/set 0-1)       DEBUG: blends every level from earned toward the maximum (1 = rifle L10 and all Conditioning 10). Default 0 = earned only. Saved.
//   V.Meta.award(result) -> {credits}  result.credits from the sim; idempotent per result object (result.awarded). Adds credits, run log
//                                    entry (oldest first, kept 20), best stage, codex (result.seen = ['E-01',...]); saves. The sim calls it itself
//                                    in endRun when it was started with Meta, so the shell must NOT need to call it (calling twice is safe).
//   V.Meta.roomCredits(kind, ch) / V.Meta.BOSS_BONUS   pay table (model scale, F1): fight 13, cache 54, boss 40, supply pad = catch room (K). ch = chapter pay factor
//                                    (TUNING.CHAPTER_PAY; Ch1 1.0, Ch2 and Ch3 are guesses). V.Meta.clearPay(ch) = guaranteed pay of a cleared 10-stage slice.
//                                    sim.js keeps a mirror of the table (it must not load V.Meta): keep both in step (test-meta checks the numbers).
//   V.Meta.markSeen(type)            codex entry (ignored for an ID that is not in V.Data.enemies, so the save stays valid).
//   V.Meta.onChange(fn) -> unsubscribe fn.
//   F1 report fields (owner C, TEST-REPORT-SPEC s7; all OPTIONAL so every older v2 save still loads, key stays v2):
//     runs[i] may also hold runNo, runBuild, startedAt (epoch ms), endReason ('clear'|'death'|'abandon'), hpMax, lowestHp,
//       tuneChanged ({KNOB: number|bool}, max 40 keys), picks (['SK-01:2', ...], max 40), cols (9-15). award() asks
//       V.Report.runFields(result) for them when report.js is loaded; without it the entry is the old 6-field shape.
//     top level may also hold runSeq (last run number handed out; V.Meta.nextRunNo() increments it, quiet write),
//       purchases ([{t, run, item, lvl, price, before, after}], last 20; buy() appends and calls V.Report.purchase(item, price)),
//       resets ([{t, reason}], last 5; reason 'corrupt'|'invalid'|'old-version' from load(), 'user' from reset()).
//   V.Meta.sample()                  = loadSample('mid', {save:false}): the design thread's sample save (FIX-ROUND-1 section A), memory only.
//                                    Sets credits 12480, rifle Lv 8, cond 15 bought (hp 6, atk 5, rate 4), next price 2250, schematics 86, keys 1, best 23.
(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};

// F0 #8 save rules (08 section 4): the key holds the version; a shape change raises VERSION and starts fresh (pick 12, no migration).
var DEPLOY_KEY = 'volley.deploy.v1';   // G's Deploy roll save (home.js owns the value); Reset save clears it too
var VERSION = 2, PREFIX = 'volley.save.v', KEY = PREFIX + VERSION, SETTINGS_KEY = 'volley.settings.v1';
// ---------- tuning table (every number lives here) ----------
var TUNING = {
  HERO_HP: 600, HERO_ATK: 150, BASE_INTERVAL: 0.8,          // mirror of tune.js (used only for totals())
  RIFLE_MAX: 10, COND_MAX: 10,   // COND_MAX = BUYS per Conditioning stat (30 buys, one ladder); levels per stat: COND_CAPS
  // Rifle upgrade price for level n -> n+1: 200 x n (D4 2.7 reference, "Ref Credits") x 1.25 (N2 gear multiplier), rounded to 25.
  RIFLE_REF_STEP: 200, GEAR_MULT: 1.25,
  // Conditioning ladder, reference price of purchase N (D4 1.4, N = 1..30) x 1.25 (N2), rounded to 25. One ladder for all three stats.
  COND_REF: [200,250,300,350,400,450,500,600,700,800,900,1000,1200,1400,1600,1800,2000,2200,2400,2600,2800,3000,3500,4000,4500,5000,5500,6000,6500,7000],
  COND_MULT: 1.25,
  // Shape V + option (b), pick 48 (M, 2026-11-11). Levels granted per buy and level caps: atk and rate 10 buys x 2 = 20 levels, hp 10 x 1 = 10.
  // The ladder is unchanged (30 rungs, total with rifle 98,100: ECON-CH1 option b), so the extra levels cost no extra Credits.
  COND_BUY_LEVELS: { hp:1, atk:2, rate:2 },
  COND_CAPS: { hp:10, atk:20, rate:20 },
  VISIT_MAX: 2,               // purchases per home visit (rifle and Conditioning together); reset when a run starts
  // Per-level values (chosen here; D4 talent tables are for the 11-talent full game).
  RIFLE_ATK_PER_LVL: 8,       // flat ATK per level above L1 (D4 2.2 Surplus rifle +8/level); L1 is the neutral baseline
  COND_HP_PER_LVL: 46,        // = HP_STEPS[0] (first level); kept for old readers. The real per-level values are HP_STEPS.
  // HP raise [G, P 2026-11-11]: ECON-CH23 says Chapter 2 needs HP index about 3.2 at DPS 2.50 for ~87%. Under option (b) DPS is 3.79 at max, and the model
  // (scratchpad P/grid.js, 600 seeds) gives Ch2 80% at HP index 2.4, 94% at 2.8, 98% at 3.2 for DPS 3.79, so ~90% needs about 2.67 = 1,600 HP.
  // Meta alone therefore carries +1,000 HP (was +400): 10 levels, rising steps 46, 58, ... 154 (first buy stays about +7.7%, last +10.6%). Gear may add more later.
  // To make the meta carry the full 3.2 instead: set steps summing to 1,320 (for example start 60, step 17.5) - data only, no code change.
  HP_STEPS: [46, 58, 70, 82, 94, 106, 118, 130, 142, 154],
  COND_ATK_PER_LVL: 0.03,     // ATK multiplier fraction
  COND_RATE_PER_LVL: 0.03,    // fire-rate multiplier fraction
  // Credits per cleared room (D4 3.1 weights: fight 1, Supply 0, Cache 4, boss 3; 23.8 credits per weight rounded to 24; a 10-stage
  // run is a fifth of the 50-stage chapter, so a full win pays about 334 of the 1,667 chapter mid).
  // F1 pay table (pick 48 design default): the model's 1,141 per 50-stage clear (sim/model.js CFG.econ, 02 T2): fight room 13, cache 54, boss 40,
  // supply pad 25 in the model. The built 24 / 95 / 24 + 47 table paid 1,670 per 50 stages (334 per 10-stage slice); 13 / 54 / 40 pays 185 per slice.
  CREDITS_PER_WEIGHT: 13,
  ROOM: { combat: 13, supply: 0, cache: 54, boss: 40 },
  BOSS_BONUS: 0,              // folded into ROOM.boss (40 total)
  SUPPLY_PAD: 25,             // model value per Supply Drop; the catch room (K, SPEC R50) pays its own Credits pad, Chapter 1 20 / 24 / 28 by chapter: K reads this or SPEC
  // Chapter pay factor (data, applied to every room value). Ch1 1.0. Ch2 and Ch3 are GUESSES: the ratios of design T2's mid clear pay 1,000 / 1,100 / 1,500 (ECON-CH23 s2).
  CHAPTER_PAY: { 1: 1.0, 2: 1.1, 3: 1.5 },
  FEEL: { fight:['Too easy', 'About right', 'Too hard', 'Unfair in places'], up:['Clearly stronger', 'A little', 'No difference'], kill:['Popped too fast', 'About right', 'Felt like a sponge'] },   // TEST-REPORT-SPEC s4 words
  RUN_LOG_KEEP: 20, PURCHASE_KEEP: 20, RESETS_KEEP: 5, RUN_TUNE_KEYS: 40, RUN_PICKS: 40,   // F1 report caps (guesses: 20 runs of about 400 B = 8 KB, well under SAVE_TEXT_MAX)
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
M.DEPLOY_KEY = DEPLOY_KEY; M.KEY = KEY; M.SETTINGS_KEY = SETTINGS_KEY; M.VERSION = VERSION;
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
var TOP = ['v', 'credits', 'rifle', 'cond', 'buys', 'power', 'runs', 'best', 'codex', 'schematics', 'keys', 'runSeq', 'purchases', 'resets', 'visitBuys', 'sd', 'gear', 'rolls', 'catUsed'];
var RUN_BASE = ['t', 'stage', 'win', 'kills', 'credits', 'dur'];
var RUN_EXTRA = ['runNo', 'runBuild', 'startedAt', 'endReason', 'hpMax', 'lowestHp', 'tuneChanged', 'picks', 'cols', 'feel', 'touchContinue'];
var GEAR_IDS = ['exo', 'modA', 'modB', 'droneA', 'droneB', 'perk2'], GEAR_MAX = 5;
var END_REASONS = ['clear', 'death', 'abandon'], RESET_REASONS = ['corrupt', 'invalid', 'old-version', 'user'];
function isStr(v, max){ return typeof v === 'string' && v.length <= max; }
// One optional F1 run field: returns the clean value, or undefined when it is not valid (validate() then rejects the save;
// cleanExtra() just drops it, so award() can never write an entry that fails validation).
function runExtra(k, v){
  var T = TUNING;
  switch (k) {
    case 'runNo': return isInt(v, 1, 1e9) ? v : undefined;
    case 'runBuild': return isStr(v, 40) ? v : undefined;
    case 'startedAt': return isNum(v, 0, 1e15) ? v : undefined;
    case 'endReason': return END_REASONS.indexOf(v) >= 0 ? v : undefined;
    case 'hpMax': return isInt(v, 0, 1e6) ? v : undefined;
    case 'lowestHp': return isInt(v, 0, 1e6) ? v : undefined;
    case 'touchContinue': return isInt(v, 0, 9999) ? v : undefined;   // extra "Touch to continue" taps in the run (G, level-up pick)
    case 'cols': return isInt(v, 1, 99) ? v : undefined;
    case 'feel': {   // feel strip answers (TEST-REPORT-SPEC s4): { fight, up, kill } each one of the owner's card words or 'skip'
      if (!isObj(v)) return undefined;
      var f = {};
      for (var fk in v) { var words = T.FEEL[fk]; if (!words || !(v[fk] === 'skip' || words.indexOf(v[fk]) >= 0)) return undefined; f[fk] = v[fk]; }
      return f;
    }
    case 'tuneChanged': {
      if (!isObj(v)) return undefined;
      var o = {}, n = 0;
      for (var q in v) { var x = v[q]; if (++n > T.RUN_TUNE_KEYS || !/^[A-Z][A-Z0-9_]{0,39}$/.test(q) || !((typeof x === 'number' && isFinite(x)) || typeof x === 'boolean')) return undefined; o[q] = x; }
      return o;
    }
    case 'picks': {
      if (!Array.isArray(v) || v.length > T.RUN_PICKS) return undefined;
      for (var i = 0; i < v.length; i++) if (!isStr(v[i], 24)) return undefined;
      return v.slice();
    }
  }
  return undefined;
}
function cleanExtra(x){ var o = {}; if (!isObj(x)) return o; RUN_EXTRA.forEach(function(k){ if (k in x) { var c = runExtra(k, x[k]); if (c !== undefined) o[k] = c; } }); return o; }
function validPurchase(p){
  return isObj(p) && onlyKeys(p, ['t', 'run', 'item', 'lvl', 'price', 'before', 'after', 'levels', 'visit', 'vn']) && isNum(p.t, 0, 1e15) && isInt(p.run, 0, 1e9) && isStr(p.item, 24) &&
    isInt(p.lvl, 0, 99) && isInt(p.price, 0, TUNING.CREDITS_MAX) && isInt(p.before, 0, TUNING.CREDITS_MAX) && isInt(p.after, 0, TUNING.CREDITS_MAX) &&
    (!('levels' in p) || isInt(p.levels, 0, 99)) && (!('visit' in p) || isInt(p.visit, 0, 1e9 + 1)) && (!('vn' in p) || isInt(p.vn, 1, 99));   // F1 shape V: optional, so older v2 saves load
}
function validReset(r){ return isObj(r) && onlyKeys(r, ['t', 'reason']) && isNum(r.t, 0, 1e15) && RESET_REASONS.indexOf(r.reason) >= 0; }
// Returns a clean deep copy of a valid v2 save, or null. Never throws.
function validate(raw){
  try {
    if (!isObj(raw) || raw.v !== VERSION || !onlyKeys(raw, TOP)) return null;
    var T = TUNING;
    if (!isInt(raw.credits, 0, T.CREDITS_MAX)) return null;
    if (!isObj(raw.rifle) || !onlyKeys(raw.rifle, ['lvl']) || !isInt(raw.rifle.lvl, 1, T.RIFLE_MAX)) return null;
    var c = raw.cond;
    if (!isObj(c) || !onlyKeys(c, ['hp', 'atk', 'rate']) || !isInt(c.hp, 0, T.COND_CAPS.hp) || !isInt(c.atk, 0, T.COND_CAPS.atk) || !isInt(c.rate, 0, T.COND_CAPS.rate)) return null;
    // ladder index = purchases made. Shape V: an atk or rate buy is 2 levels, an older single-level save has 1, so buys lies between
    // hp + ceil(atk/2) + ceil(rate/2) and hp + atk + rate (an old save, all singles, sits on the upper edge and still loads).
    if (!isInt(raw.buys, c.hp + Math.ceil(c.atk / 2) + Math.ceil(c.rate / 2), c.hp + c.atk + c.rate)) return null;
    if (!isNum(raw.power, 0, 1)) return null;
    if (!Array.isArray(raw.runs) || raw.runs.length > T.RUN_LOG_KEEP) return null;
    var runs = [];
    for (var i = 0; i < raw.runs.length; i++) {
      var r = raw.runs[i];
      if (!isObj(r) || !onlyKeys(r, RUN_BASE.concat(RUN_EXTRA))) return null;
      if (!isNum(r.t, 0, 1e15) || !isInt(r.stage, 0, T.STAGE_MAX) || typeof r.win !== 'boolean' || !isInt(r.kills, 0, 1e6) || !isInt(r.credits, 0, T.CREDITS_MAX) || !isNum(r.dur, 0, 1e7)) return null;
      var ent = { t:r.t, stage:r.stage, win:r.win, kills:r.kills, credits:r.credits, dur:r.dur };
      for (var e = 0; e < RUN_EXTRA.length; e++) { var ek = RUN_EXTRA[e]; if (ek in r) { var ev = runExtra(ek, r[ek]); if (ev === undefined) return null; ent[ek] = ev; } }
      runs.push(ent);
    }
    if (!isInt(raw.best, 0, T.STAGE_MAX)) return null;
    if (!isObj(raw.codex) || !onlyKeys(raw.codex, ['seen']) || !isObj(raw.codex.seen)) return null;
    var seen = {};
    for (var k in raw.codex.seen) { if (!knownId(k) || raw.codex.seen[k] !== true) return null; seen[k] = true; }
    var s = { v:VERSION, credits:raw.credits, rifle:{ lvl:raw.rifle.lvl }, cond:{ hp:c.hp, atk:c.atk, rate:c.rate }, buys:raw.buys,
      power:raw.power, runs:runs, best:raw.best, codex:{ seen:seen } };
    if ('schematics' in raw) { if (!isInt(raw.schematics, 0, T.CREDITS_MAX)) return null; s.schematics = raw.schematics; }
    if ('keys' in raw) { if (!isInt(raw.keys, 0, 999)) return null; s.keys = raw.keys; }
    if ('runSeq' in raw) { if (!isInt(raw.runSeq, 0, 1e9)) return null; s.runSeq = raw.runSeq; }
    if ('purchases' in raw) {
      if (!Array.isArray(raw.purchases) || raw.purchases.length > T.PURCHASE_KEEP) return null;
      s.purchases = [];
      for (var pi = 0; pi < raw.purchases.length; pi++) { var p = raw.purchases[pi]; if (!validPurchase(p)) return null; var pe = { t:p.t, run:p.run, item:p.item, lvl:p.lvl, price:p.price, before:p.before, after:p.after }; if ('levels' in p) pe.levels = p.levels; if ('visit' in p) pe.visit = p.visit; if ('vn' in p) pe.vn = p.vn; s.purchases.push(pe); }
    }
    if ('resets' in raw) {
      if (!Array.isArray(raw.resets) || raw.resets.length > T.RESETS_KEEP) return null;
      s.resets = [];
      for (var ri2 = 0; ri2 < raw.resets.length; ri2++) { var rr = raw.resets[ri2]; if (!validReset(rr)) return null; s.resets.push({ t:rr.t, reason:rr.reason }); }
    }
    if ('visitBuys' in raw) { if (!isInt(raw.visitBuys, 0, 99)) return null; s.visitBuys = raw.visitBuys; }
    if ('gear' in raw) {   // step 8: slot levels, 0 = locked, 1-5 = owned at that level; missing keys read as 0
      var g = raw.gear;
      if (!isObj(g) || !onlyKeys(g, GEAR_IDS)) return null;
      s.gear = {};
      for (var gi = 0; gi < GEAR_IDS.length; gi++) { var gv = (GEAR_IDS[gi] in g) ? g[GEAR_IDS[gi]] : 0; if (!isInt(gv, 0, GEAR_MAX)) return null; s.gear[GEAR_IDS[gi]] = gv; }
    }
    if ('rolls' in raw) { if (!isInt(raw.rolls, 0, 1e6)) return null; s.rolls = raw.rolls; }
    if ('catUsed' in raw) { if (!isInt(raw.catUsed, 0, 1e4)) return null; s.catUsed = raw.catUsed; }
    if ('sd' in raw) {   // Supply Drop catch room (owner K, SPEC R50): plays so far and the pending payout sheet
      var q = raw.sd, pe = null;
      if (!isObj(q) || !onlyKeys(q, ['plays', 'pending']) || !isInt(q.plays, 0, 9999)) return null;
      if (q.pending != null) {
        var pp = q.pending;
        if (!isObj(pp) || !onlyKeys(pp, ['chapter', 'stage', 'tier', 'defaults']) || !isInt(pp.chapter, 1, 9) || !isInt(pp.stage, 0, T.STAGE_MAX) || !isInt(pp.tier, 0, 3) || !Array.isArray(pp.defaults) || pp.defaults.length > 3) return null;
        for (var di = 0; di < pp.defaults.length; di++) if (['repair', 'credits', 'schematics'].indexOf(pp.defaults[di]) < 0) return null;
        pe = { chapter:pp.chapter, stage:pp.stage, tier:pp.tier, defaults:pp.defaults.slice() };
      }
      s.sd = { plays:q.plays, pending:pe };
    }
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
    s.cond.hp = clampInt(c.hp, 0, TUNING.COND_CAPS.hp, 0); s.cond.atk = clampInt(c.atk, 0, TUNING.COND_CAPS.atk, 0); s.cond.rate = clampInt(c.rate, 0, TUNING.COND_CAPS.rate, 0);
    s.buys = s.cond.hp + Math.ceil(s.cond.atk / 2) + Math.ceil(s.cond.rate / 2);
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
  if (reason && !newer) addReset(M.state, reason);   // F1 save health: the fresh save remembers why it is fresh
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
M.reset = function(){
  var prev = (M.state && Array.isArray(M.state.resets)) ? M.state.resets : [];
  M.readOnly = false; M.note = ''; M.resetSignal = ''; M.state = fresh(); M.lastBuy = null;
  M.state.resets = prev.slice(); addReset(M.state, 'user');
  try { if (V.Home && V.Home.deploy && V.Home.deploy.forget) V.Home.deploy.forget(); } catch (_) {}   // G: drop the in-memory roll too, or home.js would write it back
  if (storage) sdel(storage, DEPLOY_KEY);   // the Deploy roll belongs to the save: a reset starts it fresh too (guarded: blocked storage cannot throw)
  return M.save();
};
function nowMs(){ try { return Date.now(); } catch (e) { return 0; } }   // report timestamps only, never in stats or costs
function addReset(s, reason){ if (RESET_REASONS.indexOf(reason) < 0) return; s.resets = (s.resets || []).concat([{ t: nowMs(), reason: reason }]); if (s.resets.length > TUNING.RESETS_KEEP) s.resets.splice(0, s.resets.length - TUNING.RESETS_KEEP); }
// F1 report: the next run number (kept in the save as runSeq). Written without notifying listeners (nothing on screen shows it).
M.nextRunNo = function(){
  var s = M.state; s.runSeq = Math.min(1e9, (s.runSeq | 0) + 1);
  if (s.visitBuys) s.visitBuys = 0;   // a run is starting: the home visit is over, the next visit has a fresh buy allowance
  if (storage && !M.readOnly) sset(storage, KEY, JSON.stringify(s));
  return s.runSeq;
};
// Home-visit allowance (shape V): resetVisit() is called when a run starts (nextRunNo does it; sim create / bots may call it directly). Quiet write.
M.resetVisit = function(){
  var s = M.state; if (!s.visitBuys) return 0;
  s.visitBuys = 0; if (storage && !M.readOnly) sset(storage, KEY, JSON.stringify(s));
  return 0;
};
M.sdState = function(){ var q = M.state.sd; return { plays:q ? q.plays : 0, pending:q ? q.pending : null }; };
M.sdOpen = function(p){ var s = M.state, q = s.sd || (s.sd = { plays:0, pending:null }); q.pending = { chapter:p.chapter | 0, stage:p.stage | 0, tier:p.tier | 0, defaults:(p.defaults || []).slice(0, 3) }; M.save(); };
M.sdTake = function(g){ var s = M.state, q = s.sd || (s.sd = { plays:0, pending:null }); q.plays = Math.min(9999, q.plays + 1); q.pending = null; if (g && g.schematics > 0) s.schematics = Math.min(TUNING.CREDITS_MAX, (s.schematics | 0) + (g.schematics | 0)); M.save(); };
M.onChange = function(fn){ listeners.push(fn); return function(){ var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };

// ---------- settings: own key, read field by field with defaults, survive a save wipe (08 section 4) ----------
// One JSON object. audio.js owns the .audio sub-object (agreed with agent C); meta.js owns .haptics and keeps every other field it finds.
var SETTINGS_DEFAULTS = { haptics:true, feel:true, sdSkip:false, leftHanded:false };   // leftHanded: mirrors the fight touch layout (05 s3.9 row 4); catch-scene.js and prompts.js already read settings().leftHanded
// feel = the results-screen feel questions (TEST-REPORT-SPEC s4; Intel > Settings row "Feel questions: on or off")
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
M.max = function(kind){ return kind === 'rifle' ? TUNING.RIFLE_MAX : TUNING.COND_MAX; };   // rifle: levels; cond: BUYS per stat (levels: maxLevel)
M.rifleStat = function(lvl){ return 50 + TUNING.RIFLE_ATK_PER_LVL * (Math.max(1, Math.floor(+lvl || 1)) - 1); };
M.maxLevel = function(kind, id){ return kind === 'rifle' ? TUNING.RIFLE_MAX : (TUNING.COND_CAPS[id] || TUNING.COND_MAX); };   // hp 10, atk 20, rate 20 levels
M.level = function(kind, id){ return kind === 'rifle' ? M.state.rifle.lvl : (M.state.cond[id] || 0); };
function ladder(n){ var i = Math.min(n, TUNING.COND_REF.length - 1); return r25(TUNING.COND_REF[i] * TUNING.COND_MULT); }  // n = purchases so far (0-based)
function condOpen(){ return ['hp', 'atk', 'rate'].filter(function(k){ return M.state.cond[k] < TUNING.COND_CAPS[k]; }); }
M.cost = function(kind, id){
  var s = M.state;
  if (kind === 'rifle') return s.rifle.lvl >= TUNING.RIFLE_MAX ? null : { credits: r25(TUNING.RIFLE_REF_STEP * s.rifle.lvl * TUNING.GEAR_MULT) };
  if (kind === 'cond') {
    if (id === 'rand') { if (!condOpen().length) return null; }
    else if (!(id in s.cond) || s.cond[id] >= TUNING.COND_CAPS[id]) return null;
    return { credits: ladder(s.buys) };
  }
  return null;
};
// Home-visit allowance (pick 48 shape V: at most VISIT_MAX purchases per home visit, reset when a run starts).
Object.defineProperty(M, 'visitBuys', { get: function(){ return M.state.visitBuys | 0; } });
M.visitLeft = function(){ return Math.max(0, TUNING.VISIT_MAX - (M.state.visitBuys | 0)); };
// Why a buy is refused: '' (it can be bought), 'max' (nothing left to buy), 'visit' (allowance used), 'credits' (too poor). Checked in this order.
M.whyNot = function(kind, id){
  var c = M.cost(kind, id);
  if (!c) return 'max';
  if (M.visitLeft() <= 0) return 'visit';
  return M.state.credits >= c.credits ? '' : 'credits';
};
M.canBuy = function(kind, id){ return M.whyNot(kind, id) === ''; };
M.buy = function(kind, id){
  if (!M.canBuy(kind, id)) return false;
  var s = M.state, c = M.cost(kind, id), before = s.credits, item, lvl, levels = 1, stat = null;
  s.credits -= c.credits;
  if (kind === 'rifle') { s.rifle.lvl++; item = 'Rifle'; lvl = s.rifle.lvl; }
  else {
    var pick = id;
    if (id === 'rand') {
      var open = condOpen();
      // deterministic pseudo-random from the save itself (no Math.random): purchases, credits and run count
      var h = (s.buys * 2654435761 + s.credits * 40503 + s.runs.length * 9973 + 12345) >>> 0;
      pick = open[h % open.length];
    }
    levels = Math.min(TUNING.COND_BUY_LEVELS[pick] || 1, TUNING.COND_CAPS[pick] - s.cond[pick]);   // 2 for atk and rate, 1 for hp, never past the cap
    s.cond[pick] += levels; s.buys++; M.lastBuy = pick; stat = pick;
    item = 'Cond ' + pick; lvl = s.cond[pick];
  }
  var vn = (s.visitBuys | 0) + 1, visit = Math.min(1e9 + 1, (s.runSeq | 0) + 1);
  // F1 purchase log (TEST-REPORT-SPEC s3): run = the last run number handed out, so the buy shows "before run run+1"; levels = granted; visit = home visit number; vn = nth buy in it
  s.purchases = (s.purchases || []).concat([{ t: nowMs(), run: Math.min(1e9, s.runSeq | 0), item: item, lvl: lvl, price: c.credits, before: before, after: s.credits, levels: levels, visit: visit, vn: vn }]);
  if (s.purchases.length > TUNING.PURCHASE_KEEP) s.purchases.splice(0, s.purchases.length - TUNING.PURCHASE_KEEP);
  s.visitBuys = vn;
  M.save();
  try { if (V.Report && V.Report.purchase) V.Report.purchase(item + ' L' + lvl, c.credits, { levels: levels, visit: visit, vn: vn }); } catch (e) {}
  return { ok: true, kind: kind, item: item, stat: stat, levels: levels, lvl: lvl, price: c.credits, before: before, after: s.credits, visit: visit, vn: vn, left: M.visitLeft() };
};
// Random Conditioning (D4: each buy upgrades a random unlocked stat). Returns the stat id bought, or null (cannot afford / all maxed / visit used).
// Counter helpers for "N / M bought" and the next price (random roll uses one ladder across all buys).
M.boughtCount = function(kind){ return kind === 'cond' ? M.state.buys : M.state.rifle.lvl - 1; };
M.maxTotal = function(kind){ return kind === 'cond' ? 3 * TUNING.COND_MAX : TUNING.RIFLE_MAX - 1; };
M.nextPrice = function(kind){ var c = M.cost(kind, kind === 'cond' ? 'rand' : 'rifle'); return c ? c.credits : null; };
M.buyRandom = function(kind){ return (kind === 'cond' && M.buy('cond', 'rand')) ? M.lastBuy : null; };

// ---------- stats ----------
function effLevels(){
  var s = M.state, p = Math.max(0, Math.min(1, +M.state.power || 0));
  function e(v, mx){ return v + p * (mx - v); }
  var C = TUNING.COND_CAPS;
  return { rifle: e(s.rifle.lvl, TUNING.RIFLE_MAX), hp: e(s.cond.hp, C.hp), atk: e(s.cond.atk, C.atk), rate: e(s.cond.rate, C.rate) };
}
// Max HP added by the first L HP levels (L may be fractional when debug power blends): the sum of TUNING.HP_STEPS.
function hpAddAt(L){ var S = TUNING.HP_STEPS, t = 0; for (var i = 0; i < S.length; i++) t += S[i] * Math.max(0, Math.min(1, L - i)); return t; }
M.hpAddAt = hpAddAt;
M.stats = function(){
  var L = effLevels(), T = TUNING;
  var rifleAtk = T.RIFLE_ATK_PER_LVL * (L.rifle - 1);
  var atkMul = (1 + rifleAtk / T.HERO_ATK) * (1 + T.COND_ATK_PER_LVL * L.atk);
  var o = { hpAdd: hpAddAt(L.hp), atkMul: atkMul, rateMul: 1 + T.COND_RATE_PER_LVL * L.rate,
    moveMul: 1, dmgTakenMul: 1, power: M.state.power || 0 };
  // step 8 gear: terms exist only when that gear level is above 0, so a fresh save returns exactly the neutral object above (sim hash).
  var g = M.gearLevel('exo');   if (g > 0) { o.hpAdd += 20 * g; o.dmgTakenMul *= (1 - 0.01 * g); }
  g = M.gearLevel('modA');      if (g > 0) o.critAdd = 0.015 * g;
  g = M.gearLevel('modB');      if (g > 0) o.critDmgAdd = 0.05 * g;
  g = M.gearLevel('droneA');    if (g > 0) o.droneFrac = 0.03 + 0.01 * g;
  g = M.gearLevel('droneB');    if (g > 0) o.guardEvery = 15 - g;
  g = M.gearLevel('perk2');     if (g > 0) o.pierceFrac = 0.3 + 0.1 * g;
  return o;
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
M.chapterPay = function(ch){ var f = TUNING.CHAPTER_PAY[ch == null ? 1 : ch]; return f == null ? 1 : f; };
M.roomCredits = function(kind, ch){ var v = TUNING.ROOM[kind]; if (v == null) v = TUNING.ROOM.combat; return Math.round(v * M.chapterPay(ch)); };
// THE chapter-length helper (one place): length of chapter chNo's stage list, honouring the chlen test cap (?chlen=N / V.SimOpts.chlen).
// Uses V.Sim.stageList when sim.js is loaded (it owns the cap), else reads V.STAGES / V.Data.stages and applies the cap itself. Fallback 10. Call lazily (load order).
V.chapterLen = function(chNo){
  var n = 0, T = V.STAGES || (V.Data && V.Data.stages), cap = V.SimOpts && V.SimOpts.chlen;
  if (V.Sim && V.Sim.stageList) { var l = V.Sim.stageList(chNo || 1); n = l && l.length; }
  else { var c = T && ((T['ch' + (chNo || 1)] && T['ch' + (chNo || 1)].length) ? T['ch' + (chNo || 1)] : T.ch1); n = Array.isArray(c) ? c.length : 0; if (cap > 0 && n > cap) n = cap; }
  return n > 0 ? n : 10;
};
// Guaranteed pay of a cleared chapter: the rooms in the stage list, each by kind (combat 13, cache 54, boss 40, supply 0: the Supply Drop room pays its own pad, SUPPLY_PAD / K's payout).
// Ch1 at 10 stages: 7 x 13 + 54 + 40 = 185. At 20 (14 combat, 2 supply, 2 cache, 2 boss): 14 x 13 + 2 x 54 + 2 x 40 = 370. Pad adds 20 per supply room (205 / 410).
M.clearPay = function(ch){
  var T = V.STAGES || (V.Data && V.Data.stages), key = 'ch' + (ch == null ? 1 : ch), L = T && ((T[key] && T[key].length) ? T[key] : T.ch1), n = V.chapterLen(ch == null ? 1 : ch), sum = 0, i;
  if (!Array.isArray(L)) L = null;
  for (i = 0; i < n; i++) { var k = L && L[i] ? L[i].kind : (i === n - 1 ? 'boss' : 'combat'); sum += k === 'supply' ? 0 : M.roomCredits(k, ch); }
  return sum + Math.round(TUNING.BOSS_BONUS * M.chapterPay(ch));
};
// Feel strip answers (TEST-REPORT-SPEC s4): patch the saved run entry. fields: { fight, up, kill } with the owner's card words or 'skip'. Quiet write.
M.setFeel = function(runNo, fields){
  var runs = M.state.runs, e = null;
  for (var i = runs.length - 1; i >= 0; i--) if (runs[i].runNo === runNo) { e = runs[i]; break; }
  if (!e) return false;
  var f = {}, k; if (e.feel) for (k in e.feel) f[k] = e.feel[k];
  for (k in fields) f[k] = fields[k];
  var c = runExtra('feel', f); if (c === undefined) return false;
  e.feel = c;
  if (storage && !M.readOnly) sset(storage, KEY, JSON.stringify(M.state));
  return true;
};
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
  var entry = { t: now, stage: stage, win: !!result.win, kills: clampInt(result.kills, 0, 1e6, 0), credits: c,
    dur: Math.max(0, Math.min(1e7, +(+result.t || 0).toFixed(1))) };   // clamped so the entry always passes validate()
  var extra = null; try { if (V.Report && V.Report.runFields) extra = V.Report.runFields(result); } catch (e) { extra = null; }
  var ex = cleanExtra(extra); for (var ek in ex) entry[ek] = ex[ek];   // F1 report fields; invalid ones are dropped, never saved
  s.runs.push(entry);
  if (s.runs.length > TUNING.RUN_LOG_KEEP) s.runs.splice(0, s.runs.length - TUNING.RUN_LOG_KEEP);
  M.save();
  return { credits: c };
};

// ---------- step 8: chosen upgrades, tier odds, Catalyst, buyable slots + gear (SPEC-NUMBERS, PICKS) ----------
M.TIERS = [{ id:'basic', name:'Basic', mult:1.2, odds:[80, 20, 0] }, { id:'std', name:'Standard', mult:1.6, odds:[48, 44, 8] }, { id:'prem', name:'Premium', mult:2.0, odds:[25, 50, 25] }];
M.GRADES = [{ id:'common', steps:1 }, { id:'rare', steps:2 }, { id:'epic', steps:3 }];
M.CATALYST_COST = 100;
M.SLOTS = [
  { id:'exo',    slot:'Exo-plating',  item:'Reactive Plate',  price:850,  max:GEAR_MAX, fx:'Max HP +20, damage taken -1% per level' },
  { id:'modA',   slot:'Module A',     item:'Aim Module',      price:1400, max:GEAR_MAX, fx:'Crit chance +1.5% per level' },
  { id:'droneA', slot:'Drone A',      item:'Wing Drone',      price:1700, max:GEAR_MAX, fx:'Drone shots deal 3% + 1% per level of ATK' },
  { id:'modB',   slot:'Module B',     item:'Overload Cell',   price:1700, max:GEAR_MAX, fx:'Crit damage +5% per level' },
  { id:'droneB', slot:'Drone B',      item:'Guard Drone',     price:1950, max:GEAR_MAX, fx:'Blocks one enemy bullet every 15 s minus 1 s per level' },
  { id:'perk2',  slot:'Rifle perk 2', item:'Piercing Rounds', price:2250, max:GEAR_MAX, fx:'Shots pass through one machine at 30% + 10% per level damage' }
];
var GEAR_STEP = 250;   // price of the gear step from level L = 250 x L (the rifle rule)
var STEP_RUNGS = 4;    // rungs read per price (the biggest tier is 2.0 so 3 is enough; one spare)
function slotOf(id){ for (var i = 0; i < M.SLOTS.length; i++) if (M.SLOTS[i].id === id) return M.SLOTS[i]; return null; }
function tierOf(id){ for (var i = 0; i < M.TIERS.length; i++) if (M.TIERS[i].id === id) return M.TIERS[i]; return null; }
M.gearLevel = function(id){ var g = M.state.gear; var v = g && Object.prototype.hasOwnProperty.call(g, id) ? g[id] : 0; return isInt(v, 0, GEAR_MAX) ? v : 0; };
M.slotWhy = function(id){
  var sl = slotOf(id); if (!sl) return 'unknown';
  if (M.gearLevel(id) > 0) return 'owned';
  return M.state.credits >= sl.price ? '' : 'credits';
};
function logPurchase(item, lvl, price, before, levels, vn, visit){
  var s = M.state, e = { t: nowMs(), run: Math.min(1e9, s.runSeq | 0), item: item, lvl: lvl, price: price, before: before, after: s.credits };
  if (levels != null) e.levels = levels; if (visit != null) e.visit = visit; if (vn != null) e.vn = vn;
  s.purchases = (s.purchases || []).concat([e]);
  if (s.purchases.length > TUNING.PURCHASE_KEEP) s.purchases.splice(0, s.purchases.length - TUNING.PURCHASE_KEEP);
}
M.buySlot = function(id){
  var sl = slotOf(id);
  if (!sl || M.slotWhy(id) !== '') return false;
  var s = M.state, before = s.credits;
  s.credits -= sl.price;
  s.gear = s.gear || { exo:0, modA:0, modB:0, droneA:0, droneB:0, perk2:0 };
  s.gear[id] = 1;
  logPurchase('Slot ' + id, 1, sl.price, before, null, null, null);   // no roll used: visitBuys untouched
  M.save();
  try { if (V.Report && V.Report.purchase) V.Report.purchase('Slot ' + sl.item, sl.price, {}); } catch (e) {}
  return { ok: true, id: id, item: sl.item, price: sl.price };
};
// One item's state: levels, steps left and the price of its next rungs (rung i = the step i ahead).
function itemInfo(kind, id){
  var s = M.state, lvl, max, left, rung;
  if (kind === 'rifle') { lvl = s.rifle.lvl; max = TUNING.RIFLE_MAX; left = max - lvl; rung = function(i){ return r25(TUNING.RIFLE_REF_STEP * Math.min(lvl + i, max - 1) * TUNING.GEAR_MULT); }; }
  else if (kind === 'cond') {
    if (!(id in TUNING.COND_CAPS)) return null;
    lvl = s.cond[id]; max = TUNING.COND_CAPS[id]; left = Math.ceil((max - lvl) / TUNING.COND_BUY_LEVELS[id]);
    rung = function(i){ return ladder(s.buys + i); };
  } else if (kind === 'gear') {
    if (!slotOf(id)) return null;
    lvl = M.gearLevel(id); if (lvl < 1) return null; max = GEAR_MAX; left = max - lvl;
    rung = function(i){ return GEAR_STEP * Math.min(lvl + i, max - 1); };
  } else return null;
  return { kind: kind, id: id, lvl: lvl, max: max, stepsLeft: Math.max(0, left), rung: rung };
}
function tierPrice(info, mult){
  var whole = Math.floor(mult), frac = mult - whole, t = 0, i;
  for (i = 0; i < whole; i++) t += info.rung(i);
  return r25(t + frac * info.rung(whole));
}
function oddsAfter(tier, catalyst){ var o = tier.odds.slice(); if (catalyst) { o[1] += o[0]; o[0] = 0; } return o; }
M.quote = function(kind, id, tierId, opts){
  var info = itemInfo(kind, id), tier = tierOf(tierId), cat = !!(opts && opts.catalyst);
  if (!info || !tier) return null;
  var s = M.state, left = info.stepsLeft, price = left > 0 ? tierPrice(info, tier.mult) : 0;
  var odds = oddsAfter(tier, cat), refundNote = false;
  for (var g = 0; g < 3; g++) if (odds[g] > 0 && M.GRADES[g].steps > left) refundNote = true;
  var catOk = left >= 2 && (s.schematics | 0) >= M.CATALYST_COST;
  var why = '';
  if (left <= 0) why = 'max';
  else if (M.visitLeft() <= 0) why = 'visit';
  else if (cat && left < 2) why = 'cat-last-step';
  else if (cat && (s.schematics | 0) < M.CATALYST_COST) why = 'schematics';
  else if (s.credits < price) why = 'credits';
  return { price: price, odds: odds, stepsLeft: left, maxGain: Math.min(3, left), refundNote: refundNote, catOk: catOk, why: why };
};
// Deterministic grade draw: a hash of the save (buys, credits, runs, rolls, schematics, item, tier). No Math.random, no Date.
function seedDraw(kind, id, tierId){
  var s = M.state, h = 0x811C9DC5 | 0;
  function mix(x){ h = Math.imul(h ^ (x | 0), 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; }
  [s.buys, s.credits, s.runs.length, s.rolls | 0, s.schematics | 0, s.rifle.lvl, s.cond.hp, s.cond.atk, s.cond.rate, s.runSeq | 0].forEach(mix);
  (kind + ':' + id + ':' + tierId).split('').forEach(function(c){ mix(c.charCodeAt(0)); });
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
M.roll = function(kind, id, tierId, opts){
  var q = M.quote(kind, id, tierId, opts);
  if (!q || q.why) return false;
  var s = M.state, info = itemInfo(kind, id), tier = tierOf(tierId), cat = !!(opts && opts.catalyst);
  var u = seedDraw(kind, id, tierId) * 100, acc = 0, gi = 2, i;
  var base = tier.odds;   // draw from the plain tier odds; Catalyst then lifts a Common to Rare (final odds = quote().odds)
  for (i = 0; i < 3; i++) { acc += base[i]; if (u < acc) { gi = i; break; } }
  while (gi > 0 && base[gi] === 0) gi--;   // float edge: never land on a 0% grade
  var catUsedNow = cat && gi === 0;        // Schematics are spent only when the Catalyst changed the grade
  if (catUsedNow) gi = 1;
  var grade = M.GRADES[gi], gained = Math.min(grade.steps, q.stepsLeft);
  var stepVal = q.price / tier.mult;   // ruling: the player always pays at least one step
  var refund = Math.max(0, Math.min(Math.floor((grade.steps - gained) * stepVal / 25) * 25, Math.floor((q.price - stepVal) / 25) * 25));
  var before = M.stats(), lvlBefore = info.lvl, before$ = s.credits, lvlAfter;
  s.credits = Math.min(TUNING.CREDITS_MAX, s.credits - q.price + refund);
  if (catUsedNow) { s.schematics = (s.schematics | 0) - M.CATALYST_COST; s.catUsed = Math.min(1e4, (s.catUsed | 0) + 1); }
  var item, levels;
  if (kind === 'rifle') { s.rifle.lvl += gained; lvlAfter = s.rifle.lvl; item = 'Rifle'; levels = gained; }
  else if (kind === 'cond') {
    levels = Math.min(TUNING.COND_BUY_LEVELS[id] * gained, TUNING.COND_CAPS[id] - s.cond[id]);
    s.cond[id] += levels; s.buys += gained; lvlAfter = s.cond[id]; item = 'Cond ' + id; M.lastBuy = id;
  } else { s.gear[id] += gained; lvlAfter = s.gear[id]; item = 'Gear ' + id; levels = gained; }
  s.rolls = Math.min(1e6, (s.rolls | 0) + 1);
  var vn = (s.visitBuys | 0) + 1, visit = Math.min(1e9 + 1, (s.runSeq | 0) + 1);
  s.visitBuys = vn;
  logPurchase(item, lvlAfter, q.price, before$, levels, vn, visit);
  M.save();
  try { if (V.Report && V.Report.purchase) V.Report.purchase(item + ' L' + lvlAfter, q.price, { levels: levels, visit: visit, vn: vn }); } catch (e) {}
  return { ok: true, kind: kind, id: id, tier: tierId, grade: grade.id, steps: grade.steps, gained: gained, refund: refund, price: q.price, catalyst: catUsedNow, catNotNeeded: cat && !catUsedNow,
    lvlBefore: lvlBefore, lvlAfter: lvlAfter, before: before, after: M.stats(), left: M.visitLeft() };
};
var ITEM_NAMES = { rifle:'Rifle', hp:'Hit points', atk:'Attack', rate:'Fire rate' };
var ITEM_WHAT = { rifle:'Rifle damage', hp:'Max HP', atk:'Attack power', rate:'Fire rate' };
M.items = function(){
  var ids = [['rifle', 'rifle'], ['cond', 'hp'], ['cond', 'atk'], ['cond', 'rate']];
  M.SLOTS.forEach(function(sl){ if (M.gearLevel(sl.id) > 0) ids.push(['gear', sl.id]); });
  var live = [], poor = [], capped = [];
  ids.forEach(function(p){
    var info = itemInfo(p[0], p[1]), sl = p[0] === 'gear' ? slotOf(p[1]) : null, cap = info.stepsLeft <= 0;
    var basic = cap ? null : tierPrice(info, M.TIERS[0].mult), aff = !cap && M.state.credits >= basic;
    var it = { kind: p[0], id: p[1], name: sl ? sl.item : ITEM_NAMES[p[1]], what: sl ? sl.fx : ITEM_WHAT[p[1]], lvl: info.lvl, max: info.max,
      stepsLeft: info.stepsLeft, capped: cap, basicPrice: basic, affordable: aff };
    (cap ? capped : aff ? live : poor).push(it);
  });
  return live.concat(poor, capped);
};

// ---------- sample saves (08 structure rule 8; F0 #12). Plain data; each passes validate(). Bots and the debug menu use the same three. ----------
var ALL_IDS = ['E-01', 'E-02', 'E-03', 'E-04', 'E-05', 'B-01'];
function seenOf(ids){ var o = {}; ids.forEach(function(k){ o[k] = true; }); return o; }
M.SAMPLES = {
  fresh: function(){ return fresh(); },
  // mid-game: the design thread's sample (FIX-ROUND-1 section A): credits 12480, rifle Lv 8, cond 15 bought, next price 2250, best 23.
  // Shape V: 5 hp buys (5 levels), 5 atk buys (10 levels), 5 rate buys (10 levels).
  mid: function(){ var s = fresh(); s.credits = 12480; s.rifle.lvl = 8; s.cond = { hp:5, atk:10, rate:10 }; s.buys = 15; s.best = 23;
    s.schematics = 86; s.keys = 1; s.codex.seen = seenOf(ALL_IDS.slice(0, 5)); return s; },
  // all unlocked: every level maxed, every contact filed, chapter cleared, credits to spare (amount is a guess)
  all: function(){ var s = fresh(); s.credits = 99999; s.rifle.lvl = TUNING.RIFLE_MAX; s.cond = { hp:TUNING.COND_CAPS.hp, atk:TUNING.COND_CAPS.atk, rate:TUNING.COND_CAPS.rate };
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
