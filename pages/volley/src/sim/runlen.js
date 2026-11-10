// F0 agent D follow-up: run-length options for M's card. node src/sim/runlen.js [runs=1000]
'use strict';
var M = require('./model.js'), N = +process.argv[2] || 1000, fs = require('fs'), path = require('path');
var out = { runs: N, seeds: '1..' + N };
function wins(a) { return a.filter(function (h) { return h.win; }); }
function medT(a) { return M.med(wins(a).map(function (h) { return h.time; })); }
// 1) recalibrate fightK: today's measured 117.2 s has no pick pause (the sim does not run during cards)
var LC = [0, 0, 25, 35, 50, 65, 90, 125, 175, 245, 335, 465];
function today() { var pv = M.CFG.pickVal; M.CFG.pickVal = 1; var a = M.sweep(M.chapter(1, { gear: [1, 1], builtDmg: true }), { stopAt: 10, noDeploy: true, noBbox: true, cost: function (l) { return LC[l + 1] || 1e9; } }, N, 1); M.CFG.pickVal = pv;
  return M.med(wins(a).map(function (h) { return h.time - (h.tparts.pickPause || 0); })); }
var lo = 0.3, hi = 2; for (var i = 0; i < 14; i++) { M.CFG.fightK = (lo + hi) / 2; if (today() < 117.2) lo = M.CFG.fightK; else hi = M.CFG.fightK; }
M.CFG.fightK = (lo + hi) / 2; out.fightK = M.CFG.fightK; out.todayCheck = today();
// cost table from the XP each option actually earns by stages 5/10/20/30/40/50
var MS = [0, 5, 10, 20, 30, 40, 50], PK = [0, 7, 13, 21, 26, 31, 35];
function costsFor(C, o) {
  var a = wins(M.sweep(C, Object.assign({ allOpen: true }, o, { dmgScale: 0.3, cost: function (l) { return 30 * Math.pow(1.05, l); } }), 300, 1));
  var x = MS.map(function (s) { return s ? M.mean(a.map(function (h) { return h.xpAt[s]; })) : 0; }), t = [];
  for (var l = 1; l <= 40; l++) { var g = 0; while (g < 5 && l > PK[g + 1]) g++; t.push(Math.round((x[g + 1] - x[g]) / (PK[g + 1] - PK[g]))); }
  return t;
}
function fit(C, o) { var lo = 0.1, hi = 4; for (var i = 0; i < 16; i++) { var m = (lo + hi) / 2; if (M.rate(M.sweep(C, Object.assign({}, o, { dmgScale: m }), 600, 1)) > 0.9) lo = m; else hi = m; } return (lo + hi) / 2; }
function option(name, enemies, hpSlope, bpOff, hpMulLate) {
  var keep = [M.CFG.hpSlope, M.CFG.bpOff]; M.CFG.hpSlope = hpSlope; M.CFG.bpOff = bpOff;
  var C = M.chapter(1, { enemies: enemies }), o = { allOpen: true, hpMulLate: hpMulLate || 1, dmgScale: 1.26 };
  var tbl = costsFor(C, o); o.cost = function (l) { return tbl[Math.min(39, l - 1)] * 0.97; };
  var k = fit(C, o); o.dmgScale = k;
  var a = M.sweep(C, o, N, 1), w = wins(a), parts = {};
  w.forEach(function (h) { for (var p in h.tparts) parts[p] = (parts[p] || 0) + h.tparts[p] / w.length; });
  Object.keys(parts).forEach(function (p) { parts[p] = Math.round(parts[p]); });
  var pace = [5, 10, 20, 30, 40, 50].map(function (s) { return +M.mean(w.map(function (h) { return h.picksAt[s]; })).toFixed(1); });
  var room = 0; C.plan.forEach(function (st) { room = Math.max(room, st.en.length); });
  var r = { option: name, enemies: enemies, hpSlope: hpSlope, offBP: bpOff, hpMulLate: hpMulLate || 1, dmgScale: +k.toFixed(2),
    clear: M.rate(a), timeMedian: Math.round(medT(a)), timeP10: Math.round(M.med(w.map(function (h) { return h.time; }).sort(function (x, y) { return x - y; }).slice(0, Math.ceil(w.length / 5)))),
    picksMedian: M.med(w.map(function (h) { return h.picks; })), pace: pace, killSecMean: +M.mean(w.map(function (h) { return h.lifeSum / h.kills; })).toFixed(2),
    peakRoomEnemies: room, blocks: [0, 1, 2, 3, 4].map(function (i) { return Math.round(M.mean(w.map(function (h) { return h.blocks[i]; }))); }), parts: parts, costs: tbl };
  M.CFG.hpSlope = keep[0]; M.CFG.bpOff = keep[1];
  console.log(JSON.stringify(r)); return r;
}
out.options = [
  option('155 design (baseline)', 155, 0.036, 0.30),
  option('155 tougher machines (HP x2 in stages 11-50)', 155, 0.036, 0.30, 2.0),
  option('155 tougher machines (HP x2.6 in stages 11-50)', 155, 0.036, 0.30, 2.6),
  option('200 mix B', 200, 0.06, 0.20),
  option('200 mix D', 200, 0.07, 0.20),
  option('200 mix E', 200, 0.06, 0.15),
  option('200 mix F', 200, 0.07, 0.15),
  option('230 mix', 230, 0.06, 0.20),
  option('260 (earlier best)', 260, 0.08, 0.20),
  option('260 milder', 260, 0.06, 0.20)
];
fs.writeFileSync(path.join(__dirname, 'out', 'runlen.json'), JSON.stringify(out, null, 1));
console.log('fightK', out.fightK, 'today check', out.todayCheck);
