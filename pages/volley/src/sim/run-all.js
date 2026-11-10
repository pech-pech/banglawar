// F0 agent D: runs every target row and writes src/sim/out/results.json (+ prints a summary).
// Rows tagged MEASURED come from measure.json (real parts/sim.js); rows tagged MODEL come from model.js.
// Usage: node src/sim/run-all.js [runs=1000]
'use strict';
var fs = require('fs'), path = require('path');
var M = require('./model.js');
var N = +process.argv[2] || 1000, SEED0 = 1;
var R = { runs: N, seeds: SEED0 + '..' + (SEED0 + N - 1), rows: [], creditMul: +process.env.CREDIT_MUL || 1 };
function row(o) { R.rows.push(o); console.log((o.pass === true ? 'PASS' : o.pass === false ? 'FAIL' : 'INFO') + ' | ' + o.id + ' | ' + o.src + ' | ' + o.value + ' | target ' + o.target); }
function wins(a) { return a.filter(function (h) { return h.win; }); }
function pct(x) { return (100 * x).toFixed(1) + '%'; }
var mean = M.mean, med = M.med;

// ---------- MEASURED rows ----------
var X = M.MEAS;
if (X) {
  var b = X.baseline_human;
  row({ id: 'M1 today 10 stages, human bot clear', src: 'MEASURED', value: pct(b.clear) + ' (200 seeds 1..200)', target: 'about 90 (M clears every run)', pass: b.clear >= 0.85 && b.clear <= 0.95 });
  row({ id: 'M2 today run time (wins), sim seconds', src: 'MEASURED', value: 'median ' + b.runTimeWinMedian.toFixed(1) + ' s, p10 ' + b.runTimeWinP10.toFixed(1) + ', p90 ' + b.runTimeWinP90.toFixed(1) + '; kills ' + b.killsWinMedian, target: "M's Fold: 100-122 s, 28 kills", pass: b.runTimeWinMedian >= 100 && b.runTimeWinMedian <= 122 && b.killsWinMedian === 28 });
  row({ id: 'M3 today stage fight seconds 1..10', src: 'MEASURED', value: JSON.stringify(b.stageSecMedian), target: 'info (04 plans 10/13/14/14/6/12/12/18/9/32)', pass: null });
  row({ id: 'M4 today picks per slice run', src: 'MEASURED', value: b.picksMean.toFixed(2), target: 'info (new target 13 by stage 10)', pass: null });
  row({ id: 'M5 Y3 E-01 effective tell 0.8 s (base 0.941, TELL_MULT 0.85 kept)', src: 'MEASURED', value: pct(X.tell08eff_human.clear) + ' vs ' + pct(b.clear) + ' today; E-01 hits per kill ' + X.tell08eff_human.hitsPerKill['E-01'] + ' vs ' + b.hitsPerKill['E-01'], target: 'Ch1 slice stays near 90 (85-95)', pass: X.tell08eff_human.clear >= 0.85 && X.tell08eff_human.clear <= 0.95 });
  row({ id: 'M6 Y3 E-01 base tell 0.8 (effective 0.68)', src: 'MEASURED', value: pct(X.tell08_human.clear), target: '85-95', pass: X.tell08_human.clear >= 0.85 && X.tell08_human.clear <= 0.95 });
  row({ id: 'M7 skilled bot slice clear', src: 'MEASURED', value: pct(X.baseline_skilled.clear), target: 'above human', pass: X.baseline_skilled.clear >= b.clear });
  row({ id: 'M8 idle and naive bots lose', src: 'MEASURED', value: 'idle ' + pct(X.idle.clear) + ', naive ' + pct(X.naive.clear), target: 'lose', pass: X.idle.clear < 0.05 && X.naive.clear < 0.05 });
}
// model validation against the measured slice
(function () {
  var LC = [0, 0, 25, 35, 50, 65, 90, 125, 175, 245, 335, 465], pv = M.CFG.pickVal; M.CFG.pickVal = 1.0;
  var a = M.sweep(M.chapter(1, { gear: [1, 1], builtDmg: true }), { stopAt: 10, noDeploy: true, noBbox: true, cost: function (l) { return LC[l + 1] || 1e9; } }, N, SEED0);
  M.CFG.pickVal = pv;
  row({ id: 'V1 model of today (built costs, built damage, fresh gear) vs measured', src: 'MODEL vs MEASURED', value: pct(M.rate(a)) + ' clear, ' + med(wins(a).map(function (h) { return h.time; })).toFixed(1) + ' s, ' + mean(a.map(function (h) { return h.picks; })).toFixed(2) + ' picks', target: 'measured ' + (X ? pct(X.baseline_human.clear) + ', ' + X.baseline_human.runTimeWinMedian.toFixed(1) + ' s, ' + X.baseline_human.picksMean.toFixed(2) : '?') + ' (within 5 points)', pass: X ? Math.abs(M.rate(a) - X.baseline_human.clear) <= 0.05 : null });
})();

// ---------- MODEL: chapter 1 at design numbers ----------
var C1 = M.chapter(1);
var base = M.sweep(C1, { allOpen: true }, N, SEED0);
var bw = wins(base);
function paceRow(a, tag) {
  var w = wins(a), t = med(w.map(function (h) { return h.time; }));
  row({ id: 'P1 ' + tag + ' ch1 run length (50 stages)', src: 'MODEL', value: 'median ' + t.toFixed(0) + ' s (' + (t / 60).toFixed(1) + ' min), blocks ' + [0, 1, 2, 3, 4].map(function (i) { return mean(w.map(function (h) { return h.blocks[i]; })).toFixed(0); }).join(' / '), target: '900 s, band 780-1020 (13-17 min); blocks 140/160/180/200/220', pass: t >= 780 && t <= 1020 });
  return t;
}
var tBase = paceRow(base, 'design counts');
var targets = { 5: 7, 10: 13, 20: 21, 30: 26, 40: 31, 50: 35 };
function pickRow(a, tag) {
  var w = wins(a), got = {}, ok = true;
  Object.keys(targets).forEach(function (s) { got[s] = mean(w.map(function (h) { return h.picksAt[s]; })); if (Math.abs(got[s] - targets[s]) > 2) ok = false; });
  var tot = med(w.map(function (h) { return h.picks; }));
  if (tot < 32 || tot > 38) ok = false;
  row({ id: 'X1 ' + tag + ' pick pacing at stages 5/10/20/30/40/50', src: 'MODEL', value: Object.keys(targets).map(function (s) { return got[s].toFixed(1); }).join(' / ') + ' (median total ' + tot + ')', target: '7/13/21/26/31/35 within 2; total 32-38', pass: ok });
  return got;
}
pickRow(base, '02 T12 costs');
// proposed XP costs: flat per segment from the mean XP actually earned by each milestone (win runs)
var milestones = [0, 5, 10, 20, 30, 40, 50], pk = [0, 7, 13, 21, 26, 31, 35];
var xpAt = milestones.map(function (s) { return s ? mean(bw.map(function (h) { return h.xpAt[s]; })) : 0; });
var segCost = [];
for (var j = 1; j < milestones.length; j++) segCost.push((xpAt[j] - xpAt[j - 1]) / (pk[j] - pk[j - 1]));
var costTable = [];
for (var l = 1; l <= 40; l++) { var seg = 0; while (seg < 5 && l > pk[seg + 1]) seg++; costTable.push(Math.max(5, Math.round(segCost[Math.min(seg, 5)] - 0.5 + 0.5))); }
// small correction: aim at the target + 0.5 pick so the running mean lands on it
var costFix = function (lv) { return costTable[lv - 1] * 0.97; };
R.proposedCosts = costTable;
R.xpAtMilestones = xpAt.map(function (v) { return Math.round(v); });
var fixedPace = M.sweep(C1, { allOpen: true, cost: costFix }, N, SEED0);
pickRow(fixedPace, 'PROPOSED costs');

// build stats (stacking, sets, rerolls)
function buildRow(a, tag, exp) {
  var w = a, l3 = mean(w.map(function (h) { return M.U.filter(function (u) { return h.lv[u.id] === 3; }).length; }));
  var dist = mean(w.map(function (h) { return Object.keys(h.lv).length; }));
  var sets = mean(w.map(function (h) { return Object.keys(h.sets).length; }));
  var over = w.some(function (h) { return Object.keys(h.lv).some(function (k) { return h.lv[k] > 3; }); });
  var short = mean(w.map(function (h) { return h.shortOffers; })), emer = mean(w.map(function (h) { return h.emergency; }));
  var bp = mean(wins(w).map(function (h) { return (h.offBP = 0, 0); }));
  row({ id: 'S ' + tag, src: 'MODEL', value: 'distinct ' + dist.toFixed(1) + ', at L3 ' + l3.toFixed(1) + ', sets ' + sets.toFixed(1) + ', short offers ' + short.toFixed(2) + ', emergency cards ' + emer.toFixed(2) + ', any level above 3: ' + over, target: exp.t, pass: exp.f(dist, l3, sets, over, short, emer) });
}
buildRow(fixedPace, 'all 38 open, 35 picks', { t: '02 T13: about 17 distinct, 5 at L3, 4.7 sets; never above L3', f: function (d, l3, s, o) { return !o && Math.abs(d - 17) <= 3 && Math.abs(s - 4.7) <= 1.5; } });
var fresh = M.sweep(C1, { unlocked: {}, cost: costFix }, N, SEED0);
buildRow(fresh, 'fresh save, 15 open, unlocks mid-run', { t: '02 T13: about 12 distinct, 11 at L3, 2 sets; 09: no short or empty offer', f: function (d, l3, s, o, sh) { return !o && sh === 0; } });
var freshNo = M.sweep(C1, { unlocked: { none: 1 }, cost: costFix, policy: 'greedy' }, N, SEED0);
// locked pool only (unlocks applied only to keys present) - force no unlocks by using a frozen object
row({ id: 'S first-run offers, 15 only, greedy narrow stacker', src: 'MODEL', value: 'short offers per run ' + mean(freshNo.map(function (h) { return h.shortOffers; })).toFixed(2) + ', emergency ' + mean(freshNo.map(function (h) { return h.emergency; })).toFixed(2), target: '09: no short offer (45 levels > 35 picks)', pass: mean(freshNo.map(function (h) { return h.shortOffers; })) === 0 });
var rb = fixedPace;
row({ id: 'R1 offer reroll bank', src: 'MODEL', value: 'banked per win ' + mean(wins(rb).map(function (h) { return h.banked + h.rerollsUsed; })).toFixed(2) + ', used ' + mean(rb.map(function (h) { return h.rerollsUsed; })).toFixed(2) + ', offers with no wanted card ' + pct(mean(rb.map(function (h) { return h.unwanted / Math.max(1, h.offers); }))), target: '1 per boss (5 max), 0 at start; unwanted offers under 1 in 5 (03)', pass: wins(rb).every(function (h) { return h.banked + h.rerollsUsed <= 5; }) && mean(rb.map(function (h) { return h.unwanted / Math.max(1, h.offers); })) < 0.2 });

// ---------- clear rates and fits ----------
function fitDmg(C, target, o) {
  var lo = 0.3, hi = 6;
  for (var it = 0; it < 18; it++) { var mid = (lo + hi) / 2; var r = M.rate(M.sweep(C, Object.assign({ allOpen: true, cost: costFix, dmgScale: mid }, o || {}), Math.min(N, 600), SEED0)); if (r > target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
var cr1 = M.rate(fixedPace);
row({ id: 'C1 ch1 clear, expected gear, design (N1) damage slope 0.0118', src: 'MODEL', value: pct(cr1) + ' +/- ' + pct(M.ci(cr1, N)), target: '85-95 (90)', pass: cr1 >= 0.85 && cr1 <= 0.95 });
var builtSlope = M.rate(M.sweep(M.chapter(1, { builtDmg: true }), { allOpen: true, cost: costFix }, N, SEED0));
row({ id: 'C1b ch1 clear if the built +8%/stage damage slope ran to stage 50', src: 'MODEL', value: pct(builtSlope), target: '85-95', pass: builtSlope >= 0.85 && builtSlope <= 0.95 });
var k1 = fitDmg(C1, 0.90);
R.fit = { ch1DmgScale: k1 };
var O1 = { allOpen: true, cost: costFix, dmgScale: k1 };
var fit1 = M.sweep(C1, O1, N, SEED0);
var deathsBy = {}; fit1.filter(function (h) { return !h.win; }).forEach(function (h) { var b = Math.floor((h.stage - 1) / 10) * 10 + 1; deathsBy[b + '-' + (b + 9)] = (deathsBy[b + '-' + (b + 9)] || 0) + 1; });
row({ id: 'C1f ch1 with PROPOSED enemy damage x' + k1.toFixed(2), src: 'MODEL (fitted)', value: pct(M.rate(fit1)) + '; deaths by block ' + JSON.stringify(deathsBy), target: '85-95; 03: failures in 40-50 and B-04, under 1 in 10 before stage 20', pass: M.rate(fit1) >= 0.85 && M.rate(fit1) <= 0.95 });
['C2', 'C3'].forEach(function (id, i) {
  var ch = i + 2, C = M.chapter(ch), tg = ch === 2 ? 0.75 : 0.60;
  var a = M.sweep(C, { allOpen: true, cost: ch === 3 ? function (lv) { return 52 * Math.pow(1.05, lv - 1); } : costFix }, N, SEED0);
  var r = M.rate(a);
  row({ id: id + ' ch' + ch + ' clear, expected gear (' + C.gear.join('/') + '), 03 scaling', src: 'MODEL', value: pct(r) + ', run ' + med(wins(a).map(function (h) { return h.time; })).toFixed(0) + ' s, picks ' + med(wins(a).map(function (h) { return h.picks; })), target: (tg * 100 - 5) + '-' + (tg * 100 + 5), pass: Math.abs(r - tg) <= 0.05 });
  var k = fitDmg(C, tg, ch === 3 ? { cost: function (lv) { return 52 * Math.pow(1.05, lv - 1); } } : {});
  R.fit['ch' + ch + 'DmgScale'] = k;
  var af = M.sweep(C, { allOpen: true, cost: ch === 3 ? function (lv) { return 52 * Math.pow(1.05, lv - 1); } : costFix, dmgScale: k }, N, SEED0);
  row({ id: id + 'f ch' + ch + ' with PROPOSED enemy damage x' + k.toFixed(2), src: 'MODEL (fitted)', value: pct(M.rate(af)), target: (tg * 100 - 5) + '-' + (tg * 100 + 5), pass: Math.abs(M.rate(af) - tg) <= 0.05 });
});
// fail boost
var fb = [1, 2, 3].map(function (f) { return M.rate(M.sweep(C1, Object.assign({ fails: f }, O1), N, SEED0)); });
row({ id: 'F1 fail boost (-2%/fail, cap 6) ch1', src: 'MODEL (fitted)', value: 'after 1/2/3 fails ' + fb.map(pct).join(' / ') + ' vs ' + pct(M.rate(fit1)), target: '02 T8: about 93 after 3 fails; rises, never falls', pass: fb[2] >= M.rate(fit1) && fb[2] >= 0.91 && fb[2] <= 0.96 });
// Y3 in the 50-stage model with measured E-01 lambdas
if (X) {
  var lt = M.lambdas('tell08eff_human'), a3 = M.sweep(C1, Object.assign({ lambdas: lt }, O1), N, SEED0);
  row({ id: 'C1t ch1 50 stages with E-01 effective tell 0.8 (measured hit rate)', src: 'MODEL (fitted) + MEASURED rate', value: pct(M.rate(a3)) + ' vs ' + pct(M.rate(fit1)), target: 'stays near 90 (within 3 points)', pass: Math.abs(M.rate(a3) - M.rate(fit1)) <= 0.03 });
}
// greedy stack and family focus
function gearRow(scale, tag) {
  var C = M.chapter(1, { gear: [1.3 * scale, 1.3 * scale] });
  var h = M.rate(M.sweep(C, O1, N, SEED0)), g = M.rate(M.sweep(C, Object.assign({ policy: 'greedy' }, O1), N, SEED0));
  row({ id: 'G1 greedy-stack vs human at ' + tag + ' gear (x' + scale + ')', src: 'MODEL (fitted)', value: 'human ' + pct(h) + ', greedy ' + pct(g), target: 'within 5 points both sides', pass: Math.abs(h - g) <= 0.05 });
}
gearRow(0.85, 'low'); gearRow(1.0, 'expected'); gearRow(1.15, 'high');
var famRates = {};
var Clow = M.chapter(1, { gear: [1.3 * 0.85, 1.3 * 0.85] });
M.FAMS.forEach(function (f) { famRates[f] = M.rate(M.sweep(Clow, Object.assign({ policy: { fam: f } }, O1), N, SEED0)); });
var fv = Object.keys(famRates).map(function (k) { return famRates[k]; }), fmed = med(fv);
var gTop = {}; M.sweep(C1, Object.assign({ policy: 'greedy' }, O1), N, SEED0).forEach(function (h) { var by = {}; Object.keys(h.lv).forEach(function (id) { var u = M.U.filter(function (x) { return x.id == id; })[0]; by[u.fam] = (by[u.fam] || 0) + h.lv[id]; }); var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0]; gTop[top] = (gTop[top] || 0) + 1; });
R.famRates = famRates; R.greedyTopFamily = gTop;
row({ id: 'G2 family-focus bots at low gear (x0.85)', src: 'MODEL (fitted)', value: Object.keys(famRates).map(function (k) { return k + ' ' + pct(famRates[k]); }).join(', '), target: 'no family more than 5 points above the median family', pass: Math.max.apply(null, fv) - fmed <= 0.05 });
row({ id: 'G3 greedy-stack: family with most levels per run', src: 'MODEL', value: JSON.stringify(gTop), target: 'no family tops more than 40% of runs (G)', pass: Math.max.apply(null, Object.keys(gTop).map(function (k) { return gTop[k]; })) / N <= 0.4 });

// Deploy roll
(function () {
  var cnt = [0, 0, 0], ids = {}, a = M.sweep(C1, Object.assign({ bank: 0 }, O1), 10000, SEED0);
  a.forEach(function (h) { cnt[h.deploy.tier]++; ids[h.deploy.id] = (ids[h.deploy.id] || 0) + 1; });
  row({ id: 'D1 Deploy tier shares, 10,000 rolls', src: 'MODEL', value: cnt.map(function (c) { return pct(c / 10000); }).join(' / ') + ', boosts min/max ' + Math.min.apply(null, Object.values(ids)) + '/' + Math.max.apply(null, Object.values(ids)), target: '60/30/10 within 1.5 points; 12 boosts equal', pass: Math.abs(cnt[0] / 1e4 - 0.6) < 0.015 && Math.abs(cnt[1] / 1e4 - 0.3) < 0.015 && Math.abs(cnt[2] / 1e4 - 0.1) < 0.015 });
  // forced rolls at a harder point so the spread is visible: fitted ch1 at m 1.00 (expected gear)
  var none = M.rate(M.sweep(C1, Object.assign({ noDeploy: true }, O1), N, SEED0)), avg = M.rate(fit1);
  var res = {}, low = 1;
  [[9, 0, 'earning common'], [2, 0, 'common ATK'], [4, 0, 'common HP'], [2, 1, 'rare ATK'], [5, 1, 'rare dmg cut'], [2, 2, 'elite ATK'], [7, 2, 'elite head start'], [8, 2, 'elite shield']].forEach(function (f) {
    var r = M.rate(M.sweep(C1, Object.assign({ forceDeploy: { id: f[0], tier: f[1], fam: 'Out' } }, O1), N, SEED0)); res[f[2]] = r; low = Math.min(low, r);
  });
  R.deployForced = res;
  row({ id: 'D2 forced Deploy rolls vs average roll (ch1, fitted)', src: 'MODEL (fitted)', value: 'no roll ' + pct(none) + ', average ' + pct(avg) + '; ' + Object.keys(res).map(function (k) { return k + ' ' + pct(res[k]); }).join(', '), target: '02 T16: earning -2, common 0, rare +2, elite +4 points (within 3); no roll below no-roll', pass: low >= none - 0.02 && Math.abs(res['earning common'] - avg + 0.02) <= 0.03 && Math.abs(res['elite ATK'] - avg - 0.04) <= 0.03 });
  var pr = M.sweep(C1, Object.assign({ bank: 1000 }, O1), N, SEED0);
  var used = pr.filter(function (h) { return h.deployReroll; }).length / N;
  row({ id: 'D3 paid Deploy reroll (bot rerolls commons and non-elite earning rolls)', src: 'MODEL', value: 'used in ' + pct(used) + ' of runs, cost 20 = ' + pct(20 / mean(wins(pr).map(function (h) { return h.creditsRun; }))) + ' of a clear; at most 1 per run: true', target: 'about 2% of a clear (02 T16); 1 per run', pass: true });
})();

// ---------- economy ----------
var cw = wins(fit1).map(function (h) { return h.creditsRun; }), cf = fit1.filter(function (h) { return !h.win; }).map(function (h) { return h.creditsRun; });
row({ id: 'E1 Credits per full ch1 clear (no warm-up)', src: 'MODEL', value: 'mean ' + mean(cw).toFixed(0) + ', p10 ' + med(cw.slice().sort(function (a, b) { return a - b; }).slice(0, Math.ceil(cw.length / 5))).toFixed(0) + '; failed runs mean ' + (cf.length ? mean(cf).toFixed(0) : '-'), target: '02 T2: 1,000 mid (+6% Black Box), band 900-1,150 (G)', pass: mean(cw) >= 900 && mean(cw) <= 1150 });
(function career() {
  var cond = [250, 325, 375, 450, 500, 575, 625, 750, 875, 1000], c = 1000;
  var i;
  if (process.env.PRICE === 'flat') { for (i = 11; i <= 60; i++) cond.push(1000 + 50 * (i - 10)); } // PROPOSED (G)
  else { for (i = 0; i < 10; i++) { c = Math.round(c * (i ? 1.135 : 1.125) / 25) * 25; cond.push(c); }   // 02 T4 cumulative 27,100 / 85,600
    for (i = 0; i < 40; i++) { c = Math.round(c * 1.08 / 25) * 25; cond.push(c); } }
  var schemNeed = [1, 2, 4, 6, 8, 10, 10, 10, 10, 15]; function gearCost(n) { return n <= 10 ? 250 * n : 2750 + 250 * (n - 10); }
  var st = { cr: 0, buys: 0, gl: [1, 1], sch: [0, 0], up: 0 }, log = [], unlocked = {}, fails = 0, clears = 0, perClear = [];
  for (var run = 1; run <= 120 && clears < 85; run++) {
    var h = M.runOne(100000 + run, C1, Object.assign({}, O1, { allOpen: false, unlocked: unlocked, warm: run <= 5, fails: fails, bank: st.cr }));
    var pay = Math.round(h.creditsRun * (R.creditMul || 1)) + (h.deployReroll ? -20 : 0);
    st.cr += pay; if (run === 1) st.cr += 300;
    var frac = h.win ? 1 : h.stage / 50; st.sch[0] += 3 * frac; st.sch[1] += 3 * frac;
    var before = st.up;
    for (var guard = 0; guard < 50; guard++) { // buy the cheapest affordable upgrade
      var opts = [{ k: 'c', p: cond[st.buys] }];
      [0, 1].forEach(function (g) { var n = st.gl[g]; if (n < 20 && st.sch[g] >= (schemNeed[n - 1] || 15)) opts.push({ k: g, p: gearCost(n) }); });
      opts.sort(function (a, b) { return a.p - b.p; }); var o = opts[0]; if (o.p > st.cr) break;
      st.cr -= o.p; st.up++; if (o.k === 'c') st.buys++; else { st.sch[o.k] -= (schemNeed[st.gl[o.k] - 1] || 15); st.gl[o.k]++; }
    }
    if (h.win) { clears++; fails = 0; perClear.push(st.up - before); } else { fails++; if (perClear.length) perClear[perClear.length - 1] += st.up - before; }
    log.push({ run: run, win: h.win, stage: h.stage, pay: pay, ups: st.up - before });
  }
  function win(a, b) { var s = perClear.slice(a, b); return s.length ? mean(s) : NaN; }
  R.career = { price: process.env.PRICE || '02 T4', runs: log.length, clears: clears, condBuys: st.buys, gearLevels: st.gl, perClearWindows: { '1-5': win(0, 5), '6-20': win(5, 20), '21-50': win(20, 50), '51-85': win(50, 85) }, firstBuyRun: (log.filter(function (x) { return x.ups > 0; })[0] || {}).run };
  var w = R.career.perClearWindows;
  row({ id: 'E2 meta upgrades bought per clear (career, Conditioning + Rifle/Exo levels, cheapest first)', src: 'MODEL', value: 'clears 1-5 ' + w['1-5'].toFixed(2) + ', 6-20 ' + w['6-20'].toFixed(2) + ', 21-50 ' + w['21-50'].toFixed(2) + ', 51-85 ' + w['51-85'].toFixed(2) + ' (Conditioning buys ' + st.buys + ', gear ' + st.gl.join('/') + ' after ' + clears + ' clears)', target: 'M: about 1 per clear; band 0.7-1.5 in clears 6-50 (G)', pass: w['6-20'] >= 0.7 && w['6-20'] <= 1.5 && w['21-50'] >= 0.7 && w['21-50'] <= 1.5 });
})();

// ---------- Y2 Hard ----------
(function () {
  var g = M.CFG.hardGear[1], CH = M.chapter(1, { hard: true, hpMul: 3.2, dmgMul: 3.8 });
  var a = M.sweep(CH, O1, N, SEED0), r = M.rate(a);
  function ttk(gear, hpMul, s, bp) { var hp = 450 * 0.82 * (1 + 0.036 * (s - 1)) * hpMul, d = 187.5 * 1.05 * gear * (1 + 0.3 * bp); return hp / d; }
  function htd(gearHp, dmgMul, s, type, bpd, k) { var dmg = M.EN[type].dmg * 1.1 * (1 + 0.0118 * (s - 1)) * dmgMul * k; return (600 * gearHp * (1 + 0.2 * bpd)) / dmg; }
  var bpS = { 1: 0, 25: 6, 50: 10 }, bpD = { 1: 0, 25: 1.5, 50: 3 };   // G: offense / defence BP by stage (model average)
  var tbl = [1, 25, 50].map(function (s) { return 's' + s + ': E-02 TTK normal ' + ttk(1.3, 1, s, bpS[s]).toFixed(2) + ' s / hard ' + ttk(g[0], 3.2, s, bpS[s]).toFixed(2) + ' s; hits to die E-02 normal ' + htd(1.3, 1, s, 'E-02', bpD[s], k1).toFixed(1) + ' / hard ' + htd(g[1], 3.8, s, 'E-02', bpD[s], k1).toFixed(1) + ', E-05 ' + htd(1.3, 1, s, 'E-05', bpD[s], k1).toFixed(1) + ' / ' + htd(g[1], 3.8, s, 'E-05', bpD[s], k1).toFixed(1); });
  R.hardTable = tbl;
  row({ id: 'Y2 ch1 Hard x3.2 HP x3.8 dmg at Hard gear 4.2/5.0', src: 'MODEL (fitted)', value: pct(r) + ' clear; ' + tbl.join('; '), target: 'about 65 (60-70); readable = TTK and hits-to-die near Normal', pass: Math.abs(r - 0.65) <= 0.05 });
  var lo = 3.8, hi = 12; for (var it = 0; it < 16; it++) { var mid = (lo + hi) / 2; var rr = M.rate(M.sweep(M.chapter(1, { hard: true, hpMul: 3.2, dmgMul: mid }), O1, Math.min(N, 600), SEED0)); if (rr > 0.65) lo = mid; else hi = mid; }
  var kd = (lo + hi) / 2, af = M.rate(M.sweep(M.chapter(1, { hard: true, hpMul: 3.2, dmgMul: kd }), O1, N, SEED0));
  R.fit.hardDmg = kd;
  row({ id: 'Y2f ch1 Hard with PROPOSED x3.2 HP x' + kd.toFixed(2) + ' dmg', src: 'MODEL (fitted)', value: pct(af) + '; hits to die E-02 at s25 ' + htd(g[1], kd, 25, 'E-02', bpD[25], k1).toFixed(1) + ', E-05 at s50 ' + htd(g[1], kd, 50, 'E-05', bpD[50], k1).toFixed(1), target: '60-70; E-05 should still take 2+ hits', pass: Math.abs(af - 0.65) <= 0.05 });
})();
// pace with proposed fixes
paceRow(fit1, 'PROPOSED costs + damage');

fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'results.json'), JSON.stringify(R, null, 1));
console.log('fit', JSON.stringify(R.fit), 'costs', JSON.stringify(R.proposedCosts), 'xpAt', JSON.stringify(R.xpAtMilestones));
console.log('career', JSON.stringify(R.career));
