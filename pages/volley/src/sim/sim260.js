// F0 agent D: recheck at pick 41 (Chapter 1 about 260 enemies, HP growth 0.06, enemy damage x0.58, 1 attack BP = +20%).
// MODEL only (stage-level Monte Carlo calibrated on the measured slice). node src/sim/sim260.js [runs=1000]
'use strict';
var M = require('./model.js'), fs = require('fs'), path = require('path');
var N = +process.argv[2] || 1000, OUT = { runs: N, seeds: '1..' + N, rows: [] };
M.CFG.fightK = 0.8855682373046875;        // runlen.js refit (today's slice = 117.2 s without pick pauses)
M.CFG.hpSlope = 0.06; M.CFG.bpOff = 0.20;  // pick 41 set (bpOff +20% is part of the set)
var COST = [10, 10, 10, 10, 10, 10, 10, 28, 28, 28, 28, 28, 28, 63, 63, 63, 63, 63, 63, 63, 63, 112, 112, 112, 112, 112, 111, 111, 111, 111, 111, 148, 148, 148, 148, 148, 148, 148, 148, 148];
var cost = function (l) { return COST[Math.min(39, l - 1)] * 0.97; };
var O = { allOpen: true, cost: cost, dmgScale: 0.58 };
function wins(a) { return a.filter(function (h) { return h.win; }); }
function pct(x) { return (100 * x).toFixed(1) + '%'; }
function row(id, value, target, pass) { OUT.rows.push({ id: id, value: value, target: target, pass: pass }); console.log((pass === true ? 'PASS' : pass === false ? 'FAIL' : 'INFO') + ' | ' + id + ' | ' + value + ' | ' + target); }
function stats(a) { var w = wins(a); return { clear: M.rate(a), t: M.med(w.map(function (h) { return h.time; })), picks: M.med(w.map(function (h) { return h.picks; })),
  pace: [5, 10, 20, 30, 40, 50].map(function (s) { return +M.mean(w.map(function (h) { return h.picksAt[s]; })).toFixed(1); }),
  blocks: [0, 1, 2, 3, 4].map(function (i) { return Math.round(M.mean(w.map(function (h) { return h.blocks[i]; }))); }),
  credits: M.mean(w.map(function (h) { return h.creditsRun; })), failCredits: M.mean(a.filter(function (h) { return !h.win; }).map(function (h) { return h.creditsRun; })) }; }

// 1) set as locked (random elites, 03 rule)
var C = M.chapter(1, { enemies: 260 }), A = M.sweep(C, O, N, 1), S = stats(A);
row('Pick 41 set, ch1 clear and length', pct(S.clear) + ', ' + S.t.toFixed(0) + ' s', '90 (85-95); 900 s band 780-1020', S.clear >= 0.85 && S.clear <= 0.95 && S.t >= 780 && S.t <= 1020);
row('XP cost row (picks 1-7 / 8-13 / 14-21 / 22-26 / 27-31 / 32+)', '10 / 28 / 63 / 112 / 111 / 148 (x0.97 applied in-run) -> picks ' + S.pace.join('/') + ', median ' + S.picks, '7/13/21/26/31/35 within 2', S.pace.every(function (v, i) { return Math.abs(v - [7, 13, 21, 26, 31, 35][i]) <= 2; }));
var split = [0, 0, 0, 0, 0], el = [];
C.plan.forEach(function (st) { split[Math.floor((st.s - 1) / 10)] += st.en.length; st.en.forEach(function (e) { if (e.el) el.push(st.s); }); });
OUT.split = split; OUT.blocks = S.blocks; OUT.randomEliteStages = el;
row('Per-block enemies (stages 1-10/11-20/21-30/31-40/41-50)', split.join(' / ') + ' = ' + split.reduce(function (a, b) { return a + b; }, 0), 'design guess 27/44/54/65/70', null);
row('Per-block seconds', S.blocks.join(' / '), 'design 145/179/174/182/194', null);

// 1b) design's rising split 27/44/54/65/70
var CR = M.chapter(1, { enemies: 260, blockW: [1, 0.80, 0.98, 1.18, 1.27] }), AR = M.sweep(CR, O, N, 1), SR = stats(AR), sp2 = [0, 0, 0, 0, 0];
CR.plan.forEach(function (st) { sp2[Math.floor((st.s - 1) / 10)] += st.en.length; });
OUT.risingSplit = { split: sp2, blocks: SR.blocks, clear: SR.clear, t: SR.t, pace: SR.pace };
row('Design rising split ' + sp2.join('/'), pct(SR.clear) + ', ' + SR.t.toFixed(0) + ' s, blocks ' + SR.blocks.join('/') + ', picks ' + SR.pace.join('/'), '90 (85-95), 780-1020 s, picks within 2', SR.clear >= 0.85 && SR.clear <= 0.95 && SR.pace.every(function (v, i) { return Math.abs(v - [7, 13, 21, 26, 31, 35][i]) <= 2; }));
// 2) elites fixed at 22/27/33/37/43/48
var CE = M.chapter(1, { enemies: 260, eliteStages: [22, 27, 33, 37, 43, 48] }), AE = M.sweep(CE, O, N, 1), SE = stats(AE);
row('Elites fixed at 22/27/33/37/43/48 (6 elites)', pct(SE.clear) + ' vs ' + pct(S.clear) + ' with the random rule (' + el.length + ' elites), ' + SE.t.toFixed(0) + ' s', 'near 90 (85-95)', SE.clear >= 0.85 && SE.clear <= 0.95);

// 3) economy
var cr = S.credits, perH = cr / S.t * 3600, basis = 1000 / 900 * 3600;
OUT.credits = { perClear: cr, failRun: S.failCredits, perHourRunOnly: perH };
row('Credits per clear (before x1.3)', cr.toFixed(0) + ' (failed runs ' + S.failCredits.toFixed(0) + ')', '02 T2 1,000 mid, band 900-1,150', cr >= 900 && cr <= 1150);
row('Credits per hour of run time', (perH).toFixed(0) + '/h before x1.3, ' + (perH * 1.3).toFixed(0) + '/h after', '02 basis 1,000 per 900 s = 4,000/h (+-15%)', Math.abs(perH * 1.3 / basis - 1) <= 0.15);
function career(creditMul, flat) {
  var cond = [250, 325, 375, 450, 500, 575, 625, 750, 875, 1000], c = 1000, i;
  if (flat) for (i = 11; i <= 80; i++) cond.push(1000 + 50 * (i - 10));
  else { for (i = 0; i < 10; i++) { c = Math.round(c * (i ? 1.135 : 1.125) / 25) * 25; cond.push(c); } for (i = 0; i < 60; i++) { c = Math.round(c * 1.08 / 25) * 25; cond.push(c); } }
  var need = [1, 2, 4, 6, 8, 10, 10, 10, 10, 15]; function gc(n) { return n <= 10 ? 250 * n : 2750 + 250 * (n - 10); }
  var st = { cr: 0, buys: 0, gl: [1, 1], sch: [0, 0], up: 0 }, fails = 0, clears = 0, per = [], hours = 0, h30 = null, h10 = null, unlocked = {};
  for (var run = 1; run <= 140 && clears < 85; run++) {
    var h = M.runOne(100000 + run, C, Object.assign({}, O, { allOpen: false, unlocked: unlocked, warm: run <= 5, fails: fails, bank: st.cr }));
    hours += (h.time + 20) / 3600;             // G: +20 s per run for Deploy, results and home taps
    st.cr += Math.round(h.creditsRun * creditMul) - (h.deployReroll ? 20 : 0); if (run === 1) st.cr += 300;
    var f = h.win ? 1 : h.stage / 50; st.sch[0] += 3 * f; st.sch[1] += 3 * f;
    var b0 = st.up;
    for (var g = 0; g < 80; g++) { var opts = [{ k: 'c', p: cond[st.buys] }];
      [0, 1].forEach(function (q) { var n = st.gl[q]; if (n < 20 && st.sch[q] >= (need[n - 1] || 15)) opts.push({ k: q, p: gc(n) }); });
      opts.sort(function (x, y) { return x.p - y.p; }); var o = opts[0]; if (o.p > st.cr) break;
      st.cr -= o.p; st.up++; if (o.k === 'c') st.buys++; else { st.sch[o.k] -= (need[st.gl[o.k] - 1] || 15); st.gl[o.k]++; } }
    if (st.buys >= 10 && h10 == null) h10 = hours; if (st.buys >= 30 && h30 == null) h30 = hours;
    if (h.win) { clears++; fails = 0; per.push(st.up - b0); } else { fails++; if (per.length) per[per.length - 1] += st.up - b0; }
  }
  function w(a, b) { return M.mean(per.slice(a, b)); }
  return { runs: run - 1, clears: clears, hours: +hours.toFixed(1), buys: st.buys, gear: st.gl, w620: w(5, 20), w2150: w(20, 50), w5185: w(50, 85), h10: h10 && +h10.toFixed(1), h30: h30 && +h30.toFixed(1) };
}
var cOld = career(1, false), cNew = career(1.3, true), cFlat = career(1, true);
OUT.career = { design02: cOld, proposed: cNew, flatOnly: cFlat };
row('Flat Conditioning, Credits x1.0 (gate-safe option)', '6-20 ' + cFlat.w620.toFixed(2) + ', 21-50 ' + cFlat.w2150.toFixed(2) + ', 51-85 ' + cFlat.w5185.toFixed(2) + '; ' + cFlat.buys + ' buys after ' + cFlat.clears + ' clears; 30 buys at ' + cFlat.h30 + ' h', 'about 1 per clear', cFlat.w620 >= 0.7 && cFlat.w2150 >= 0.7);
row('Meta upgrades per clear, flat Conditioning + Credits x1.3', 'clears 6-20 ' + cNew.w620.toFixed(2) + ', 21-50 ' + cNew.w2150.toFixed(2) + ', 51-85 ' + cNew.w5185.toFixed(2) + '; ' + cNew.buys + ' Conditioning buys and gear ' + cNew.gear.join('/') + ' after ' + cNew.clears + ' clears (' + cNew.hours + ' h)', 'about 1 per clear (0.7-1.5 in clears 6-50)', cNew.w620 >= 0.7 && cNew.w620 <= 1.5 && cNew.w2150 >= 0.7 && cNew.w2150 <= 1.5);
row('Same at 02 prices, no x1.3 (reference)', '6-20 ' + cOld.w620.toFixed(2) + ', 21-50 ' + cOld.w2150.toFixed(2) + ', 51-85 ' + cOld.w5185.toFixed(2) + '; ' + cOld.buys + ' buys after ' + cOld.clears + ' clears (' + cOld.hours + ' h)', 'reference', null);
// power gate proxy: 02 T11 scales the 8-10 h gate from N2 Credits per hour; Release 1 cannot reach ch3, so the gate is checked as Credits-per-hour and hours to 30 Conditioning buys
var ratio = perH * 1.3 / basis;
row('8-10 h power gate (proxy)', 'Credits/h x' + ratio.toFixed(2) + ' of the 02 basis -> gate about ' + (8 / ratio).toFixed(1) + '-' + (10 / ratio).toFixed(1) + ' h if Credit-bound; 30 Conditioning buys at ' + cNew.h30 + ' h (proposed) vs ' + cOld.h30 + ' h (02 prices, no x1.3)', 'gate 8-10 h; 02 T11 expects 30 buys at about 85 clears', 8 / ratio >= 7 && 10 / ratio <= 11);

// 4) Hard
function htd(gHp, dmgMul, s, type) { var d = M.EN[type].dmg * 1.1 * (1 + 0.0118 * (s - 1)) * 0.58 * dmgMul; return (600 * gHp) / d; }
var AH = M.sweep(M.chapter(1, { enemies: 260, hard: true, hpMul: 3.2, dmgMul: 5.0 }), O, N, 1), rh = M.rate(AH);
var lo = 2, hi = 12; for (var it = 0; it < 16; it++) { var m = (lo + hi) / 2; if (M.rate(M.sweep(M.chapter(1, { enemies: 260, hard: true, hpMul: 3.2, dmgMul: m }), O, 600, 1)) > 0.65) lo = m; else hi = m; }
OUT.hardFit = (lo + hi) / 2;
var rh48 = M.rate(M.sweep(M.chapter(1, { enemies: 260, hard: true, hpMul: 3.2, dmgMul: 4.8 }), O, N, 1)); OUT.hard48 = rh48;
row('Hard ch1 x3.2 HP x4.8 dmg (proposed)', pct(rh48) + '; hits to die E-02 s25 ' + htd(5.0, 4.8, 25, 'E-02').toFixed(1) + ', E-05 s50 ' + htd(5.0, 4.8, 50, 'E-05').toFixed(1), '60-70', Math.abs(rh48 - 0.65) <= 0.05);
row('Hard ch1 x3.2 HP x5.0 dmg at Hard gear 4.2/5.0', pct(rh) + '; fitted dmg for 65% = x' + OUT.hardFit.toFixed(2) + '; hits to die (no build) E-02 s25 Normal ' + htd(1.3, 1, 25, 'E-02').toFixed(1) + ' / Hard ' + htd(5.0, 5.0, 25, 'E-02').toFixed(1) + ', E-05 s50 ' + htd(1.3, 1, 50, 'E-05').toFixed(1) + ' / ' + htd(5.0, 5.0, 50, 'E-05').toFixed(1), 'about 65 (60-70)', Math.abs(rh - 0.65) <= 0.05);

// 5) Chapters 2 and 3 at the pick 41 rules (bpOff +20%; their own 03 HP and damage curves)
function chRow(ch, enemies, target, len, costFn) {
  var CC = M.chapter(ch, { enemies: enemies }), o = { allOpen: true, cost: costFn, dmgScale: 1 };
  var l = 0.05, h = 4; for (var i = 0; i < 16; i++) { var m = (l + h) / 2; if (M.rate(M.sweep(CC, Object.assign({}, o, { dmgScale: m }), 500, 1)) > target) l = m; else h = m; }
  o.dmgScale = (l + h) / 2; var a = M.sweep(CC, o, N, 1), w = wins(a), t = M.med(w.map(function (x) { return x.time; })), pk = M.med(w.map(function (x) { return x.picks; }));
  var peak = 0; CC.plan.forEach(function (st) { peak = Math.max(peak, st.en.length); });
  return { ch: ch, enemies: enemies, dmg: +o.dmgScale.toFixed(2), clear: M.rate(a), t: t, picks: pk, peak: peak, lenOk: Math.abs(t - len) / len <= 0.13 };
}
var c2cost = function (l) { return COST[Math.min(39, l - 1)] * 0.97 * 1.25; }; // G: ch2 kill XP mean 7.8 vs 6.4 (02 T12)
var c3cost = function (l) { return 52 * Math.pow(1.05, l - 1); };
OUT.ch2 = [185, 260, 310].map(function (n) { return chRow(2, n, 0.75, 900, c2cost); });
OUT.ch3 = [155, 220, 280].map(function (n) { return chRow(3, n, 0.60, 1200, c3cost); });
OUT.ch2.concat(OUT.ch3).forEach(function (r) {
  row('Ch' + r.ch + ' at ' + r.enemies + ' enemies', 'run ' + (r.t ? r.t.toFixed(0) : '-') + ' s, clear ' + pct(r.clear) + ' with fitted dmg x' + r.dmg + ', picks ' + r.picks + ', peak ' + r.peak, (r.ch === 2 ? '900 s, 75%' : '1,200 s, 60%') + ' (length within 13%)', r.lenOk && Math.abs(r.clear - (r.ch === 2 ? 0.75 : 0.6)) <= 0.05);
});
fs.writeFileSync(path.join(__dirname, 'out', 'sim260.json'), JSON.stringify(OUT, null, 1));
