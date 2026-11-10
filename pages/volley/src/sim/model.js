// F0 agent D: MODELLED run simulation of the new systems (XP and level-ups, stacking, families and sets,
// boss rerolls, Deploy roll and paid reroll, economy, clear rates, fail boost, Hard). Standalone node, no deps.
// It is NOT the game sim: it is a stage-level Monte Carlo. Enemy hit rates, kill times and stage seconds are
// CALIBRATED from the real headless sim (src/sim/out/measure.json, written by measure.js on parts/sim.js with the
// human-like bot of src/bot.js). Everything for stages 11-50, chapters 2-3, upgrades and economy follows the design
// sections 02 / 03 / 04 and is a guess unless the design gives the number. Every guess is marked G: in CFG.
// Usage: node src/sim/model.js [runs=1000]  -> writes src/sim/out/model.json and prints the result table.
'use strict';
var fs = require('fs'), path = require('path');
var RUNS = +process.argv[2] || 1000;

// ---------- RNG ----------
function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function poisson(R, l) { if (l <= 0) return 0; var L = Math.exp(-l), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; }

// ---------- measured calibration (real sim) ----------
var MEAS = null;
try { MEAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'measure.json'), 'utf8')); } catch (e) { }
function lambdas(key) { // hits per second alive, per type, from a measured sweep
  var m = MEAS && MEAS[key || 'baseline_human'], L = {};
  var fall = { 'E-01': 0.0375, 'E-02': 0.0296, 'E-03': 0.197, 'E-04': 0.141, 'E-05': 0.094, 'B-01': 0.0133 };
  if (!m) return fall;
  Object.keys(fall).forEach(function (k) {
    var hpk = typeof m.hitsPerKill[k] === 'number' ? m.hitsPerKill[k] : parseFloat(m.hitsPerKill[k]);
    L[k] = m.lifeMedian[k] ? hpk / m.lifeMedian[k] : fall[k];
  });
  return L;
}

// ---------- config (design numbers quoted with their section; G: = guess by agent D) ----------
var CFG = {
  heroHp: 600, heroAtk: 150, fireInt: 0.8, crit: 0.05,                       // tune.js (built)
  hpGlobal: 0.82, hpSlope: 0.036,                                           // tune.js; 03 table matches over 50 stages
  dmgMult: 1.1, dmgSlopeBuilt: 0.08, dmgSlopeN1: 0.0118,                     // built 0.08 per stage; 03 E-02 60/77/95 -> 0.0118
  gear: { 1: [1.3, 1.3], 2: [2.4, 2.8], 3: [3.8, 4.5] },                     // 02 T8 expected power index ATK/HP
  hardGear: { 1: [4.2, 5.0] },                                              // 02 T9
  pickVal: 0.42,                                                            // 02 T12 value of a pick at 35 picks
  stack: [1, 0.8, 0.6],                                                     // 02 T13
  revive: [0.5, 0.75, 1], hullSetK: 1,      // 03 Backup core; hullSetK = 1 (design)
  setBP: 0.6,                                                               // 02 T13
  bpOff: 0.30, bpDef: 0.20,                // G: 1 BP = Power cell L1 (+30% attack) or Armor L1 (+20% max HP)
  conc: 0.5,                               // G: hit rate x (enemies in room / 3.4)^conc (crowding)
  repairPct: 0.2, repairBase: 0.03, repairPity: 0.005, repairCap: 0.08,     // sim.js (built)
  supplyPct: 0.4, emergencyPct: 0.25,                                       // 02 T14, 03 1.1
  xp: { s: 4, m: 8, l: 16 }, bossXp: { 1: 80, 2: 100, 3: 120 },             // 02 T12
  // level costs 02 T12: first 15, r 1.05, every level after the 21st pick x1.126
  cost: function (n) { var c = 15 * Math.pow(1.05, n - 1); return n > 21 ? c * 1.126 : c; },
  levelCap: 36,
  deployTier: [0.6, 0.3, 0.1], rerollCost: { 1: 20, 2: 25, 3: 30 },        // 02 T16
  failBoost: 0.02, failCap: 0.06,                                           // 02 T8
  timing: { trans: 2.2, pick: 2.5, reroll: 1.0, supply: 6, cache: 8, bbox: 6, bossIntro: 2.5 }, // 04 section 4
  bossLambda: { 'B-01': null, 'B-03': 0.03, 'B-02': 0.03, 'B-03v': 0.04, 'B-04': 0.06 }, // G (B-01 measured)
  bossHpRatio: { 'B-01': 1, 'B-03': 12125 / 7626, 'B-02': 13245 / 7626, 'B-03v': 17309 / 7626, 'B-04': 27860 / 7626 }, // 03 section 4
  bossHpBuilt: 11942,                      // built B-01 at stage 10 (11000 x 0.82 x 1.324)
  bossDmg: 95, fightK: 0.8,                // fightK: calibrated so the model of today matches the measured 117 s
  econ: { fight: 13, boss: 40, cache: 54, pad: 25, bbox: 60 }                // 02 T2, T14 (Chapter 1)
};

// ---------- enemies ----------
// hp/dmg base: built ai-p0/ai-p1 for E-01..E-05; G: for E-06..E-09 and chapter 2/3 types
var EN = {
  'E-01': { hp: 300, dmg: 35, xp: 's', debut: 1 }, 'E-02': { hp: 450, dmg: 55, xp: 'm', debut: 3 },
  'E-03': { hp: 600, dmg: 45, xp: 'm', debut: 4 }, 'E-04': { hp: 500, dmg: 95, xp: 'm', debut: 6 },
  'E-05': { hp: 650, dmg: 130, xp: 'm', debut: 7 }, 'E-06': { hp: 400, dmg: 50, xp: 's', debut: 11, lam: 0.04 },
  'E-08': { hp: 550, dmg: 110, xp: 'l', debut: 13, lam: 0.12 }, 'E-07': { hp: 500, dmg: 50, xp: 'm', debut: 16, lam: 0.14 },
  'E-09': { hp: 700, dmg: 80, xp: 'l', debut: 21, lam: 0.10 }
};
var ELITE_OK = { 'E-02': 1, 'E-03': 1, 'E-04': 1, 'E-05': 1, 'E-07': 1, 'E-08': 1, 'E-09': 1 };
// reference conditions of the measured sweep: stage ~5, fresh hero with about 4 built (full-value) picks
var REF_DPS = 187.5 * 1.05 * 1.6, REF_SCALE = 0.82 * (1 + 0.036 * 4);
function overhead(type, lifeMeas) { var e = EN[type]; return Math.max(0.3, lifeMeas - e.hp * REF_SCALE / REF_DPS); }

// ---------- 38 upgrades (03 table 1.2 and 1.4) ----------
// kind off/def; v = value of L1 in BP before the 35-pick scale (G: core 1.1, normal 1.0, small 0.55, situational 0.8)
var U = [
  [1, 'Bal', 0, 'off', 1.1, 1], [2, 'Bal', 0, 'off', 1.0, 1], [3, 'Bal', 0, 'off', 1.0, 1], [4, 'Bal', 0, 'off', 0.9, 1], [5, 'Bal', 0, 'off', 0.8, 1],
  [6, 'Reb', 0, 'off', 1.0, 0], [7, 'Reb', 0, 'off', 0.9, 0], [8, 'Reb', 's5', 'off', 0.8, 0], [35, 'Reb', 'b20', 'off', 0.9, 0],
  [9, 'Out', 0, 'off', 1.1, 1], [10, 'Out', 's5', 'off', 0.55, 0], [11, 'Out', 0, 'off', 1.1, 1], [12, 'Out', 's5', 'off', 0.55, 0], [13, 'Out', 0, 'off', 1.0, 1], [14, 'Out', 's15', 'off', 0.55, 0],
  [16, 'The', 0, 'off', 0.9, 0], [17, 'The', 0, 'off', 0.9, 0], [18, 'The', 'b10', 'off', 0.8, 0], [34, 'The', 'b40', 'off', 0.9, 0],
  [19, 'Sho', 'b10', 'off', 0.9, 0], [25, 'Sho', 'b20', 'off', 0.8, 0, 1], [26, 'Sho', 'b30', 'off', 0.8, 0, 1], [32, 'Sho', 'b50', 'off', 0.6, 0],
  [20, 'Dro', 'b20', 'off', 0.9, 0], [21, 'Dro', 'b30', 'off', 1.0, 0], [22, 'Dro', 'b30', 'off', 0.8, 0, 1], [23, 'Dro', 's25', 'def', 0.9, 0],
  [28, 'Gam', 'b40', 'xp', 0.3, 0, 1], [29, 'Gam', 's25', 'off', 0.8, 0, 1], [30, 'Gam', 's35', 'off', 0.7, 0, 1], [38, 'Gam', 's45', 'greed', 0.2, 0, 1],
  [15, 'Hul', 0, 'def', 1.0, 1], [24, 'Hul', 's35', 'def', 0.8, 0], [27, 'Hul', 0, 'heal', 0.8, 0], [31, 'Hul', 's15', 'def', 0.8, 0, 1],
  [33, 'Hul', 0, 'def', 1.0, 0], [36, 'Hul', 'b40', 'revive', 0.6, 0, 1], [37, 'Hul', 'b50', 'off', 0.6, 0]
].map(function (a) { return { id: a[0], fam: a[1], unlock: a[2], kind: a[3], v: a[4], core: !!a[5], sit: !!a[6], w: a[6] ? 40 : (a[5] ? 100 : 70) }; });
var FAMS = ['Bal', 'Reb', 'Out', 'The', 'Sho', 'Dro', 'Gam', 'Hul'];
var UNLOCK_ORDER = ['s5', 'b10', 's15', 'b20', 's25', 'b30', 's35', 'b40', 's45', 'b50'];

// ---------- stage plan ----------
var BEATS = ['R', 'B', 'B', 'P', 'SD', 'R', 'B', 'Sp', 'CA', 'BOSS'];
var BEAT_W = { R: 3, B: 4.5, P: 5.5, Sp: 6.5, CA: 2.5 };
var BUILT_1_9 = [['E-01', 'E-01', 'E-01'], ['E-01', 'E-01', 'E-01', 'E-01'], ['E-02', 'E-01', 'E-02'], ['E-03', 'E-02', 'E-01'], [],
  ['E-04', 'E-01', 'E-02', 'E-02'], ['E-05', 'E-01', 'E-01', 'E-05'], ['E-03', 'E-01', 'E-02', 'E-05'], ['E-01', 'E-01']];
var BOSSES = { 10: 'B-01', 20: 'B-03', 30: 'B-02', 40: 'B-03v', 50: 'B-04' };
function buildPlan(ch, total) {
  // chapter 1 (and 2 by the same shape): stages 1-9 as built (ch1), the rest share `total` by beat weight; seeded per stage
  var plan = [], R = rng(9001 + ch), restW = 0, s, beat, i, first = ch === 1 ? 10 : 1;
  for (s = first; s <= 50; s++) { beat = BEATS[(s - 1) % 10]; if (BEAT_W[beat]) restW += BEAT_W[beat]; }
  var rest = total - (ch === 1 ? 27 : 0), carry = 0;
  for (s = 1; s <= 50; s++) {
    beat = BEATS[(s - 1) % 10];
    var st = { s: s, beat: beat, kind: beat === 'SD' ? 'supply' : beat === 'CA' ? 'cache' : beat === 'BOSS' ? 'boss' : 'combat', en: [] };
    if (st.kind === 'boss') st.boss = BOSSES[s];
    if (ch === 1 && s <= 9) st.en = BUILT_1_9[s - 1].map(function (t) { return { t: t, el: false }; });
    else if (BEAT_W[beat]) {
      var want = rest * BEAT_W[beat] / restW + carry;
      var n = Math.round(want); carry = want - n;
      var pool = Object.keys(EN).filter(function (t) { return EN[t].debut <= s; });
      for (i = 0; i < n; i++) { var w = R(); var t = w < 0.25 ? 'E-01' : pool[Math.floor(R() * pool.length)]; st.en.push({ t: t, el: false }); }
      // elites (03): ch1 stages 20-49 combat rooms, 1 room in 3, max 1 (2 from 40); not after a boss, not in an intro stage
      if (ch === 1 && s >= 20 && st.kind === 'combat' && s % 10 !== 1 && s !== 21 && s !== 16) {
        var maxE = s >= 40 ? 2 : 1;
        for (var k = 0; k < maxE; k++) if (R() < 1 / 3) { var c = st.en.filter(function (e) { return ELITE_OK[e.t] && !e.el; }); if (c.length) c[Math.floor(R() * c.length)].el = true; }
      }
    }
    plan.push(st);
  }
  return plan;
}

// ---------- chapter settings ----------
function chapter(ch, opt) {
  opt = opt || {};
  var c = { ch: ch, stages: 50, enemies: opt.enemies || { 1: 155, 2: 185, 3: 155 }[ch], gear: opt.gear || (opt.hard ? CFG.hardGear[ch] : CFG.gear[ch]) };
  c.hpMul = opt.hpMul || 1; c.dmgMul = opt.dmgMul || 1;
  // chapter scaling vs chapter 1 stage 1 (03 table: E-02 HP 324/518/891, hit 60/78/150 at each chapter's stage 1)
  c.hpBase = { 1: 1, 2: 518 / 324, 3: 891 / 324 }[ch];
  c.hpSlope = { 1: CFG.hpSlope, 2: (1611 / 518 - 1) / 49, 3: (2618 / 891 - 1) / 19 }[ch];
  c.dmgBase = { 1: 1, 2: 78 / 60, 3: 150 / 60 }[ch];
  c.dmgSlope = opt.builtDmg ? CFG.dmgSlopeBuilt : { 1: CFG.dmgSlopeN1, 2: (204 / 78 - 1) / 49, 3: (327 / 150 - 1) / 19 }[ch];
  if (ch === 3) c.stages = 20;
  c.plan = ch === 3 ? plan3() : buildPlan(ch, c.enemies);
  return c;
}
function plan3() { // 04: 20 stages, 8 wave arenas (about 19 enemies), 4 bosses (5/10/15/20), 8 Supply Drops
  var R = rng(9333), plan = [], waves = [1, 3, 6, 8, 11, 13, 16, 18], sd = [2, 4, 7, 9, 12, 14, 17, 19];
  var pool = ['E-01', 'E-02', 'E-03', 'E-04', 'E-05', 'E-06', 'E-07', 'E-08', 'E-09'];
  for (var s = 1; s <= 20; s++) {
    var st = { s: s, en: [], kind: s % 5 === 0 ? 'boss' : sd.indexOf(s) >= 0 ? 'supply' : 'combat', wave: true };
    if (st.kind === 'boss') st.boss = { 5: 'B-02', 10: 'B-03v', 15: 'B-03v', 20: 'B-04' }[s];
    if (st.kind === 'combat') { var n = s === 16 || s === 18 ? 21 : 18.5; for (var i = 0; i < Math.round(n + (R() - 0.5)); i++) st.en.push({ t: R() < 0.3 ? 'E-01' : pool[Math.floor(R() * pool.length)], el: false }); }
    plan.push(st);
  }
  return plan;
}

function tp(h, k, v) { h.time += v; h.tparts = h.tparts || {}; h.tparts[k] = (h.tparts[k] || 0) + v; }
// ---------- one run ----------
function newRun(seed, C, o) {
  var R = rng(seed * 2654435761 + 7);
  var h = { R: R, C: C, o: o, maxHp: 0, hp: 0, lv: {}, sets: {}, xp: 0, level: 1, picks: 0, picksAt: {}, banked: 0, rerollsUsed: 0,
    sinceRepair: 0, revive: false, shield: 0, credits: 0, dead: false, stage: 0, time: 0, pauses: 0, emergency: 0, shortOffers: 0,
    offers: 0, unwanted: 0, deploy: null, deployReroll: false, open: {}, killsXp: 0, kills: 0, bpLog: {}, blocks: [0, 0, 0, 0, 0], hitsTaken: 0, bboxes: 0 };
  U.forEach(function (u) { if (!u.unlock || (o.allOpen) || (o.unlocked && o.unlocked[u.unlock])) h.open[u.id] = 1; });
  return h;
}
function bp(h, kind) { // build points of a kind
  var b = 0;
  U.forEach(function (u) { var n = h.lv[u.id] || 0; if (!n) return; var val = 0; for (var i = 0; i < n; i++) val += CFG.stack[i]; val *= u.v * CFG.pickVal;
    if (u.kind === kind || (kind === 'off' && u.id === 37) || (kind === 'def' && u.kind === 'heal')) b += val; });
  FAMS.forEach(function (f) { if (h.sets[f]) { if (kind === 'def' && f === 'Hul') b += CFG.setBP * CFG.hullSetK; else if (kind === 'off' && f !== 'Hul') b += f === 'Gam' ? CFG.setBP / 2 : CFG.setBP; } });
  return b;
}
function deployMods(h) { var d = h.deploy, m = { atk: 0, rate: 0, hp: 0, dr: 0, crit: 0, fam: null, famMul: 1, credits: 0 }; if (!d) return m;
  var T = d.tier, k = d.id;
  if (k === 2) m.atk = [0.05, 0.1, 0.17][T]; if (k === 3) m.rate = [0.05, 0.1, 0.17][T]; if (k === 4) m.hp = [0.06, 0.12, 0.21][T];
  if (k === 5) m.dr = [0.04, 0.08, 0.14][T]; if (k === 6) m.crit = [0.04, 0.08, 0.14][T]; if (k === 1) { m.fam = d.fam; m.famMul = [1.5, 2, 3][T]; }
  if (k === 9) m.credits = [0.1, 0.2, 0.35][T];
  return m; }
function dps(h) { var C = h.C, d = deployMods(h);
  return 187.5 * C.gear[0] * (1 + d.atk) * (1 + d.rate) * (1 + CFG.crit + d.crit) / (1 + CFG.crit) * 1.05 * (1 + CFG.bpOff * bp(h, 'off')); }
function maxHp(h) { var d = deployMods(h); return CFG.heroHp * h.C.gear[1] * (1 + d.hp) * (1 + CFG.bpDef * bp(h, 'def')); }
function dmgTakenMul(h) { var d = deployMods(h); var greed = h.lv[38] ? [1.1, 1.2, 1.3][h.lv[38] - 1] : 1; var fb = Math.min(CFG.failCap, CFG.failBoost * (h.o.fails || 0));
  return (1 - Math.min(0.5, d.dr + fb)) * greed * (h.o.dmgMul || 1) * h.C.dmgMul; }
function refreshHp(h, healGain) { var n = maxHp(h); if (healGain && n > h.maxHp) h.hp += n - h.maxHp; h.maxHp = n; h.hp = Math.min(h.hp, n); }

function famHeld(h, f) { return U.filter(function (u) { return u.fam === f && h.lv[u.id]; }).length; }
function score(h, u, policy) {
  var n = h.lv[u.id] || 0; if (n >= 3) return -1;
  var s = u.v * CFG.stack[n];
  if (u.kind === 'xp') s = 0.5; if (u.kind === 'greed') s = 0.1; if (u.kind === 'revive') s = n === 0 ? 1.4 : 0.6;
  if (u.kind === 'def' || u.kind === 'heal' || u.kind === 'revive') s *= (h.hp < 0.5 * h.maxHp ? 1.3 : 0.9);
  var completes = !n && famHeld(h, u.fam) === 2 && !h.sets[u.fam];
  if (completes) s += CFG.setBP / CFG.pickVal * 0.5;
  if (policy === 'greedy') { if (n > 0) s += 5; if (completes) s += 6; }
  if (policy && policy.fam) { if (u.fam === policy.fam) s += 10; }
  if (policy === 'random') s = h.R();
  return s;
}
function offer(h) {
  var dm = deployMods(h);
  var legal = U.filter(function (u) { return h.open[u.id] && (h.lv[u.id] || 0) < 3; });
  var out = [], pool = legal.slice();
  function draw(filter) { var c = pool.filter(filter); if (!c.length) return null; var tw = 0;
    c.forEach(function (u) { tw += u.w * (dm.fam === u.fam ? dm.famMul : 1); }); var x = h.R() * tw;
    for (var i = 0; i < c.length; i++) { x -= c[i].w * (dm.fam === c[i].fam ? dm.famMul : 1); if (x <= 0) break; } var u = c[Math.min(i, c.length - 1)];
    pool.splice(pool.indexOf(u), 1); return u; }
  var core = draw(function (u) { return u.core; }); if (core) out.push(core);
  while (out.length < 3) { var hasSit = out.some(function (u) { return u.sit; }); var u = draw(function (x) { return !(hasSit && x.sit); }); if (!u) break; out.push(u); }
  return out;
}
function doPick(h, policy) {
  h.offers++;
  var cards = offer(h);
  if (cards.length < 3) h.shortOffers++;
  function best(cs) { var b = null, bs = -1; cs.forEach(function (u) { var s = score(h, u, policy); if (s > bs) { bs = s; b = u; } }); return { u: b, s: bs }; }
  var b = best(cards);
  var wanted = b.u && b.s >= 0.55;
  if (!wanted) h.unwanted++;
  if (!wanted && h.banked > 0 && cards.length === 3) { h.banked--; h.rerollsUsed++; tp(h, 'reroll', CFG.timing.reroll); var c2 = offer(h); var b2 = best(c2); if (b2.s > b.s) b = b2; }
  h.picks++; tp(h, 'pickPause', CFG.timing.pick);
  if (!b.u) { h.emergency++; h.hp = Math.min(h.maxHp, h.hp + CFG.emergencyPct * h.maxHp); return; }
  var u = b.u; h.lv[u.id] = (h.lv[u.id] || 0) + 1;
  if (u.kind === 'revive') h.revive = h.revive === 'used' ? 'used' : CFG.revive[h.lv[u.id] - 1];
  if (!h.sets[u.fam] && famHeld(h, u.fam) >= 3) h.sets[u.fam] = h.stage || 1;
  refreshHp(h, u.id === 15);
}
function addXp(h, v, policy) {
  var mul = 1 + (h.lv[28] ? [0.2, 0.3, 0.3][h.lv[28] - 1] : 0) + (h.sets.Gam ? 0.1 : 0);
  h.xp += v * mul; h.xpCum = (h.xpCum || 0) + v * mul;
  var cap = CFG.levelCap + (h.lv[28] >= 2 ? h.lv[28] - 1 : 0);
  var costFn = h.o.cost || CFG.cost;
  while (h.level < cap && h.xp >= costFn(h.level)) { h.xp -= costFn(h.level); h.level++; doPick(h, policy); }
}
function hit(h, raw) {
  if (h.R() < Math.min(0.4, 0.0)) return; // dodge folded into def BP (G)
  var d = raw * dmgTakenMul(h);
  h.hitsTaken++;
  if (h.shield > 0) { var a = Math.min(h.shield, d); h.shield -= a; d -= a; }
  h.hp -= d;
  if (h.hp <= 0) { if (typeof h.revive === 'number') { h.hp = h.revive * h.maxHp; h.revive = 'used'; } else h.dead = true; }
}
function heal(h, f) { h.hp = Math.min(h.maxHp, h.hp + f * h.maxHp); }
function unlockAt(h, key) { if (!h.o.unlocked) return; if (!h.o.unlocked[key]) { h.o.unlocked[key] = 1; U.forEach(function (u) { if (u.unlock === key) h.open[u.id] = 1; }); } }

function runOne(seed, C, o) {
  o = o || {}; var policy = o.policy || 'human', L = o.lambdas || lambdas(), E = MEAS && MEAS.baseline_human;
  var h = newRun(seed, C, o), R = h.R, s, i;
  // Deploy roll (02 T16)
  function roll() { var id = 1 + Math.floor(R() * 12), x = R(), tier = x < CFG.deployTier[0] ? 0 : x < CFG.deployTier[0] + CFG.deployTier[1] ? 1 : 2;
    return { id: id, tier: tier, fam: FAMS[Math.floor(R() * 8)] }; }
  if (o.forceDeploy) h.deploy = o.forceDeploy; else if (!o.noDeploy) {
    h.deploy = roll();
    // paid reroll policy (G): reroll a common roll of any kind, or a non-power earning roll below elite, if Credits allow
    var earning = h.deploy.id >= 9;
    if (o.bank >= CFG.rerollCost[C.ch] && (h.deploy.tier === 0 || (earning && h.deploy.tier < 2))) { h.deploy = roll(); h.deployReroll = true; }
  }
  h.maxHp = maxHp(h); h.hp = h.maxHp;
  var d = h.deploy && h.deploy.id;
  if (d === 8) h.shield = [0.1, 0.2, 0.35][h.deploy.tier] * h.maxHp;
  if (d === 7) { var n7 = h.deploy.tier === 2 ? 2 : 1; for (i = 0; i < n7; i++) { doPick(h, policy); h.picks--; h.headStart = (h.headStart || 0) + 1; if (h.deploy.tier >= 1) { /* enters at level 2 */ var last = U.filter(function (u) { return h.lv[u.id] === 1; }).pop(); if (last) h.lv[last.id] = 2; } } refreshHp(h, false); }
  var dmCredits = deployMods(h).credits;
  var luck = 0.8 + 0.4 * R();
  var bossHitNoDmg;
  for (var si = 0; si < C.plan.length && !h.dead; si++) {
    var st = C.plan[si]; s = st.s; h.stage = s;
    if (o.stopAt && s > o.stopAt) break;
    var late = (o.hpMulLate && s > 10) ? o.hpMulLate : 1;
    var hpS = 0.82 * C.hpBase * (1 + C.hpSlope * (s - 1)) * C.hpMul * late;
    var dmS = CFG.dmgMult * C.dmgBase * (1 + C.dmgSlope * (s - 1)) * (o.dmgScale || 1);
    var t0 = h.time;
    if (st.kind === 'supply') { heal(h, CFG.supplyPct); if (h.hp >= 0.6 * h.maxHp && R() < 0.5) h.credits += CFG.econ.pad; tp(h, 'supplySheet', CFG.timing.supply); tp(h, 'transition', CFG.timing.trans); if (s === 5) unlockAt(h, 's5'); if (s % 10 === 5 && s > 5) unlockAt(h, 's' + s); }
    else if (st.kind === 'combat' || st.kind === 'cache') {
      var n = st.en.length, D = dps(h), conc = Math.pow(Math.max(1, n) / 3.4, CFG.conc) * (st.wave ? 1.6 : 1), fight = 1.2;
      for (i = 0; i < n && !h.dead; i++) {
        var e = st.en[i], B = EN[e.t], ehp = B.hp * hpS * (e.el ? 1.5 : 1);
        var lifeMeas = E && E.lifeMedian[e.t] ? E.lifeMedian[e.t] : 2.5;
        var life = overhead(e.t, lifeMeas) + ehp / D;
        var lam = (L[e.t] != null ? L[e.t] : B.lam) * conc;
        var k = poisson(R, lam * life);
        for (var j = 0; j < k && !h.dead; j++) hit(h, B.dmg * dmS);
        if (h.dead) break;
        fight += life * (n > 1 ? 0.75 : 1);                    // G: some overlap of kill times inside a room
        h.lifeSum = (h.lifeSum || 0) + life; h.kills++; var xv = CFG.xp[B.xp] * (e.el ? 2 : 1); h.killsXp += xv;
        // repair drops (built: 3 percent per kill, +0.5 per dry kill, cap 8 percent, heals 20 percent)
        var p = Math.min(CFG.repairCap, CFG.repairBase + CFG.repairPity * h.sinceRepair);
        if (R() < p) { heal(h, CFG.repairPct); h.sinceRepair = 0; } else h.sinceRepair++;
        if (h.lv[27]) heal(h, [0.015, 0.02, 0.025][h.lv[27] - 1] * CFG.pickVal / 0.42 * 0.42);
        addXp(h, xv, policy);
        h.credits += 0;
      }
      if (h.dead) break;
      tp(h, 'fight', fight * CFG.fightK); tp(h, 'transition', CFG.timing.trans);
      h.peak = Math.max(h.peak || 0, n);
      if (st.kind === 'cache') { heal(h, 2 * CFG.repairPct); h.credits += CFG.econ.cache; tp(h, 'cacheExtra', CFG.timing.cache - 2); }
      else h.credits += C.ch === 3 ? 96 : CFG.econ.fight;
    } else if (st.kind === 'boss') {
      var bid = st.boss, bhp = CFG.bossHpBuilt * CFG.bossHpRatio[bid] / CFG.bossHpRatio['B-01'] * (C.ch === 1 ? 1 : C.hpBase * (C.ch === 3 ? 1.6 : 1.3)) * C.hpMul;
      if (bid === 'B-01') bhp = CFG.bossHpBuilt * C.hpMul * (C.ch === 1 ? 1 : C.hpBase);
      bhp *= late; var bD = dps(h) * 1.25;                                   // G: calibrated so B-01 lasts about 26 s as measured
      var btime = CFG.timing.bossIntro + bhp / bD;
      var blam = (bid === 'B-01' ? (L['B-01'] || 0.0133) : CFG.bossLambda[bid]);
      var bk = poisson(R, blam * btime), hp0 = h.hp;
      for (i = 0; i < bk && !h.dead; i++) hit(h, CFG.bossDmg * dmS);
      if (h.dead) break;
      tp(h, 'bossIntro', CFG.timing.bossIntro); tp(h, 'bossFight', btime - CFG.timing.bossIntro); tp(h, 'bossBanner', 1.5); tp(h, 'transition', CFG.timing.trans); h.banked++;
      h.credits += C.ch === 3 ? 144 : (C.ch === 2 ? 44 : CFG.econ.boss);
      addXp(h, CFG.bossXp[C.ch], policy);
      unlockAt(h, 'b' + s);
      // Black Box (02 T14): after a no-damage boss, else 15 percent; never after the last; bot takes it above 60 percent HP
      var nodmg = h.hp >= hp0 - 1e-9;
      if (s < C.plan.length && !o.noBbox && (nodmg || R() < 0.15)) { tp(h, 'blackBox', CFG.timing.bbox); if (h.hp > 0.6 * h.maxHp) { h.hp -= Math.max(0, Math.min(0.2 * h.maxHp, h.hp - 0.4 * h.maxHp)); h.credits += CFG.econ.bbox; h.bboxes++; } }
    }
    if (h.dead) break;
    h.blocks[Math.floor((s - 1) / 10)] += h.time - t0;
    if ([5, 10, 20, 30, 40, 50].indexOf(s) >= 0) h.picksAt[s] = h.picks;
    (h.xpAt = h.xpAt || {})[s] = h.xpCum || 0;
    if (C.ch === 1 && s % 10 === 5) unlockAt(h, 's' + s);
  }
  h.win = !h.dead;
  h.creditsRun = Math.round(h.credits * luck * (1 + dmCredits) * (o.warm ? 1.5 : 1));
  return h;
}

// ---------- helpers ----------
function sweep(C, o, n, seed0) { var a = []; for (var s = 0; s < n; s++) a.push(runOne((seed0 || 1) + s, C, Object.assign({}, o, { unlocked: o.unlocked ? Object.assign({}, o.unlocked) : null }))); return a; }
function rate(a) { return a.filter(function (h) { return h.win; }).length / a.length; }
function med(a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b.length ? b[Math.floor((b.length - 1) / 2)] : NaN; }
function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : NaN; }
function ci(p, n) { return 1.96 * Math.sqrt(p * (1 - p) / n); }

module.exports = { CFG: CFG, EN: EN, U: U, FAMS: FAMS, chapter: chapter, runOne: runOne, sweep: sweep, rate: rate, med: med, mean: mean, ci: ci, lambdas: lambdas, MEAS: MEAS };
