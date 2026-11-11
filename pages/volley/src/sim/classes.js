// F1-FS agent D: column-class bot checks (FULLSCREEN-LAYOUT section 2, slice bands). Usage: node src/sim/classes.js [seeds=200]
// Runs the human, idle and corner bots (src/bot.js) at C = 9, 11, 13, 15 and writes src/sim/out/classes.json.
// Bands (10-stage Chapter 1 slice, not the 50-stage chapter; both are GUESSES from the spec's own tolerances):
//   clear rate 90.5 % +- 4 points, median win time 117 s +- 8 %  (centres = human bot, 9 columns, 200 seeds, today's build)
//   per stage: clear rate (cleared / reached) +- 4 points and median clear time +- 8 % of the class-9 value
//   kill time (median time alive, non-boss kills) +- 15 % of class 9 (guess); picks: mean within 2 of class 9 (R39 "within 2", guess)
//   pick 45 row: human bot with inp.walk = 2 in the clear phase; median win reported next to the normal row (info, no band).
//   R46/R48: walk-2 rows use 103 s +-8 % (94.8-111.2 s); the cache room (stage 9) time band is +-12 %.
//   R47: corner-shooter bot (bottom 3x3 corner, stands where it has a line to B-01 so the rifle auto-fires) on the boss only, 50 seeds, 90 s cap (guess):
//   the miss is any run that kills B-01 completely unhurt.
//   idle and corner bots never clear more often than the human bot at the same class; corner bot takes damage on every boss seed.
'use strict';
var fs = require('fs'), path = require('path');
var bot = require(path.join(__dirname, '..', 'bot.js'));
var V = bot.V, pct = bot.pct, mean = bot.mean;
var ARGV = process.argv.slice(2).filter(function (a) { return a.slice(0, 2) !== '--'; });
var SEEDS = +ARGV[0] || 200, CLASSES = [9, 11, 13, 15], BOTS = ['human', 'idle', 'corner'];
var BAND = { clear: [90.5, 4], winMed: [117, 0.08], winMedWalk2: [103, 0.08], stageClear: 4, stageTime: 0.08, stageTimeCache: 0.12, kill: 0.15, picks: 2 };   // R46/R48: walk-2 rows 103 s +-8 %, cache room (stage 9) +-12 %
var t0 = Date.now();

function sweep(cols, kind) {
  bot.setCols(cols);
  var runs = [];
  for (var s = 1; s <= SEEDS; s++) {
    var r = bot.runOne(s, kind, bot.MAX_STEPS);
    runs.push({ seed: s, win: r.win, dead: r.dead, t: r.S.t, stage: r.stage, picks: r.picks, hash: V.Sim.hash(r.S), cols: r.cols,
      bossTime: r.S.stats.bossTime, bossDmg: r.bossDmg,
      kills: r.kills.filter(function (k) { return k.type.charAt(0) !== 'B'; }).map(function (k) { return k.life; }),
      roomTimes: r.S.stats.roomTimes.map(function (x) { return [x.stage, x.s]; }) });
  }
  return runs;
}
function summarize(runs) {
  var wins = runs.filter(function (r) { return r.win; }), wt = wins.map(function (r) { return r.t; });
  var kl = []; runs.forEach(function (r) { kl = kl.concat(r.kills); });
  var bt = wins.map(function (r) { return r.bossTime; }).filter(function (v) { return v != null; });
  var stages = V.Sim.stageList().map(function (sd) {
    var st = sd.stage, reached = runs.filter(function (r) { return r.stage >= st; }).length;
    var cl = runs.filter(function (r) { return r.stage > st || (r.stage === st && r.win); }).length, tm = [];
    runs.forEach(function (r) { r.roomTimes.forEach(function (x) { if (x[0] === st) tm.push(x[1]); }); });
    return { stage: st, kind: sd.kind, room: sd.room, reached: reached, cleared: cl, clearPct: reached ? 100 * cl / reached : null, medS: tm.length ? pct(tm, 0.5) : null };
  });
  var cs = {}; runs.forEach(function (r) { r.cols.forEach(function (c) { cs[c] = 1; }); });
  return { n: runs.length, clearPct: 100 * wins.length / runs.length, wins: wins.length,
    winMed: wt.length ? pct(wt, 0.5) : null, winP10: wt.length ? pct(wt, 0.1) : null, winP90: wt.length ? pct(wt, 0.9) : null,
    killMed: kl.length ? pct(kl, 0.5) : null, bossMed: bt.length ? pct(bt, 0.5) : null, picks: mean(runs.map(function (r) { return r.picks; })),
    widths: Object.keys(cs).map(Number), stages: stages };
}
function inBand(v, c, tol, rel) { var d = rel ? c * tol : tol; return v != null && v >= c - d - 1e-9 && v <= c + d + 1e-9; }
function f(v, d) { return v == null || isNaN(v) ? '-' : v.toFixed(d == null ? 1 : d); }
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

var OUT = { date: new Date().toISOString(), seeds: SEEDS, widen: !!V.Widen, bands: BAND,
  bandNote: 'Slice bands are guesses: centres from the human bot at 9 columns (90.5 %, 117 s); tolerances from FULLSCREEN-LAYOUT section 2 (+-4 points, +-8 %, +-15 % kill time, picks within 2).',
  classes: {}, nineEqualsPlain: null };

// plain bot.js human run (no opts) vs class 9 (opts.cols 9): every seed must match (win, time, end hash)
var plain = sweep(null, 'human');
var raw = {};
CLASSES.forEach(function (C) {
  raw[C] = {};
  BOTS.forEach(function (k) { raw[C][k] = sweep(C, k); });
  var cl = OUT.classes[C] = {}; BOTS.forEach(function (k) { cl[k] = summarize(raw[C][k]); });
  bot.setWalk(2); raw[C].humanWalk2 = sweep(C, 'human'); bot.setWalk(null);   // pick 45: inp.walk 2 in the clear phase (info row, no band)
  cl.humanWalk2 = summarize(raw[C].humanWalk2);
  process.stderr.write('class ' + C + ' done ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s\n');
});
var mism = plain.filter(function (r, i) { var q = raw[9].human[i]; return r.win !== q.win || r.t !== q.t || r.hash !== q.hash; }).map(function (r) { return r.seed; });
OUT.nineEqualsPlain = { equal: mism.length === 0, mismatchSeeds: mism, plainClearPct: summarize(plain).clearPct, plainWinMed: summarize(plain).winMed };
var cb = {}, cs = {}; CLASSES.forEach(function (C) { bot.setCols(C); cb[C] = bot.cornerBossCheck(Math.min(SEEDS, 50)); cs[C] = bot.cornerShooterCheck(Math.min(SEEDS, 50), 90); });

// checks
var base = OUT.classes[9].human;
CLASSES.forEach(function (C) {
  var h = OUT.classes[C].human, id = OUT.classes[C].idle, co = OUT.classes[C].corner, ch = {};
  var b = cb[C].filter(function (r) { return r.boss; });
  ch.clear = { pass: inBand(h.clearPct, BAND.clear[0], BAND.clear[1]), value: h.clearPct, band: [BAND.clear[0] - BAND.clear[1], BAND.clear[0] + BAND.clear[1]] };
  ch.winMed = { pass: inBand(h.winMed, BAND.winMed[0], BAND.winMed[1], true), value: h.winMed, band: [BAND.winMed[0] * (1 - BAND.winMed[1]), BAND.winMed[0] * (1 + BAND.winMed[1])] };
  ch.kill = { pass: inBand(h.killMed, base.killMed, BAND.kill, true), value: h.killMed, band: [base.killMed * (1 - BAND.kill), base.killMed * (1 + BAND.kill)] };
  ch.picks = { pass: inBand(h.picks, base.picks, BAND.picks), value: h.picks, band: [base.picks - BAND.picks, base.picks + BAND.picks] };
  ch.idleCorner = { pass: id.clearPct <= h.clearPct && co.clearPct <= h.clearPct, idle: id.clearPct, corner: co.clearPct };
  ch.cornerBoss = { pass: b.length > 0 && b.every(function (r) { return r.dmg > 0; }), hit: b.filter(function (r) { return r.dmg > 0; }).length, of: b.length,
    dmgMed: b.length ? pct(b.map(function (r) { return r.dmg; }), 0.5) : null, died: b.filter(function (r) { return r.dead; }).length };
  ch.stages = h.stages.map(function (s, i) {
    var s9 = base.stages[i], o = { stage: s.stage, clearPct: s.clearPct, clear9: s9.clearPct, medS: s.medS, med9: s9.medS };
    o.clearPass = s.clearPct == null || s9.clearPct == null ? null : inBand(s.clearPct, s9.clearPct, BAND.stageClear);
    o.timeTol = s.kind === 'cache' ? BAND.stageTimeCache : BAND.stageTime;
    o.timePass = s.medS == null || s9.medS == null ? null : inBand(s.medS, s9.medS, o.timeTol, true);
    if (o.clearPass === false) o.clearMiss = +(s.clearPct - s9.clearPct).toFixed(1);
    if (o.timePass === false) o.timeMissPct = +(100 * (s.medS / s9.medS - 1)).toFixed(1);
    return o;
  });
  ch.stagesPass = ch.stages.every(function (o) { return o.clearPass !== false && o.timePass !== false; });
  ch.widthsOk = h.widths.indexOf(C) >= 0 && (V.Widen || C === 9);
  var w2 = OUT.classes[C].humanWalk2;
  ch.winMedWalk2 = { pass: inBand(w2.winMed, BAND.winMedWalk2[0], BAND.winMedWalk2[1], true), value: w2.winMed, band: [BAND.winMedWalk2[0] * (1 - BAND.winMedWalk2[1]), BAND.winMedWalk2[0] * (1 + BAND.winMedWalk2[1])] };
  ch.cornerFires = b.reduce(function (a, r) { return a + (r.fires || 0); }, 0);
  var sh = cs[C].filter(function (r) { return r.boss; }), sk = sh.filter(function (r) { return r.won; });
  ch.shooter = { n: sh.length, kills: sk.length, killMed: sk.length ? pct(sk.map(function (r) { return r.killT; }), 0.5) : null, died: sh.filter(function (r) { return r.dead; }).length,
    stalled: sh.filter(function (r) { return !r.won && !r.dead; }).length, firesMed: pct(sh.map(function (r) { return r.fires; }), 0.5), noFire: sh.filter(function (r) { return !r.fires; }).length,
    hurtsMed: pct(sh.map(function (r) { return r.hurts; }), 0.5), hurtsTotal: sh.reduce(function (a, r) { return a + r.hurts; }, 0), dmgMed: pct(sh.map(function (r) { return r.dmg; }), 0.5),
    unhurtKills: sk.filter(function (r) { return r.hurts === 0; }).length };
  ch.shooter.pass = ch.shooter.unhurtKills === 0;
  ch.main = ch.clear.pass && ch.winMed.pass && ch.idleCorner.pass && ch.cornerBoss.pass;
  OUT.classes[C].checks = ch;
});

// print
var L = [];
function out(s) { console.log(s); L.push(s); }
out('Column classes, ' + SEEDS + ' seeds per bot per class (human / idle / corner), parts/widen.js ' + (V.Widen ? 'loaded' : 'MISSING (every class runs at 9)'));
out('Bands (guesses): clear 86.5-94.5 %, median win 107.6-126.4 s; kill time +-15 % of class 9; picks within 2 of class 9; idle/corner <= human; corner hurt on every boss seed.');
out('Class 9 vs plain bot.js human run (no opts): ' + (OUT.nineEqualsPlain.equal ? 'EQUAL on all ' + SEEDS + ' seeds (win, time, end hash)' : 'DIFFERENT on seeds ' + mism.join(',')));
out('');
out('class | widths | clear % | med win s | p10/p90 s   | kill s | boss s | picks | idle % | corner % | corner boss hit | clear | time | kill | picks | idle/corner | stages | MAIN');
CLASSES.forEach(function (C) {
  var c = OUT.classes[C], h = c.human, k = c.checks, P = function (b) { return b ? 'pass' : 'FAIL'; };
  out(pad(C, 5) + ' | ' + pad(h.widths.join('/'), 6) + ' | ' + pad(f(h.clearPct), 7) + ' | ' + pad(f(h.winMed, 0), 9) + ' | ' + pad(f(h.winP10, 0) + '/' + f(h.winP90, 0), 11) + ' | ' + pad(f(h.killMed, 2), 6) + ' | ' + pad(f(h.bossMed), 6) + ' | ' + pad(f(h.picks, 2), 5) +
    ' | ' + pad(f(c.idle.clearPct), 6) + ' | ' + pad(f(c.corner.clearPct), 8) + ' | ' + pad(k.cornerBoss.hit + '/' + k.cornerBoss.of + ' (med ' + f(k.cornerBoss.dmgMed, 0) + ')', 15) +
    ' | ' + pad(P(k.clear.pass), 5) + ' | ' + pad(P(k.winMed.pass), 4) + ' | ' + pad(P(k.kill.pass), 4) + ' | ' + pad(P(k.picks.pass), 5) + ' | ' + pad(P(k.idleCorner.pass), 11) + ' | ' + pad(P(k.stagesPass), 6) + ' | ' + P(k.main));
});
out('');
out('Pick 45 (human bot, inp.walk 2 during the clear phase); band 103 s +-8 % = 94.8-111.2 s (R46/R48, guess):');
out('class | clear % | med win s (walk 1 -> walk 2) | p10/p90 s walk 2 | delta s | walk-2 band');
CLASSES.forEach(function (C) {
  var a = OUT.classes[C].human, w = OUT.classes[C].humanWalk2;
  out(pad(C, 5) + ' | ' + pad(f(w.clearPct), 7) + ' | ' + pad(f(a.winMed, 1) + ' -> ' + f(w.winMed, 1), 28) + ' | ' + pad(f(w.winP10, 0) + '/' + f(w.winP90, 0), 16) + ' | ' + pad(f(w.winMed - a.winMed, 1), 7) + ' | ' + (OUT.classes[C].checks.winMedWalk2.pass ? 'pass' : 'FAIL'));
});
out('');
out('R47 boss only (force-cleared to stage 10, fresh hero, 50 seeds). corner = camps, corner-shooter = camps in the bottom 3x3 where it has a line to B-01 (90 s cap)');
out('class | corner shots | shooter kills | med kill s | died | stalled | no-fire runs | shots med | hits taken med/total | dmg med | unhurt kills (miss if > 0)');
CLASSES.forEach(function (C) {
  var k = OUT.classes[C].checks, q = k.shooter;
  out(pad(C, 5) + ' | ' + pad(k.cornerFires, 12) + ' | ' + pad(q.kills + '/' + q.n, 13) + ' | ' + pad(f(q.killMed), 10) + ' | ' + pad(q.died, 4) + ' | ' + pad(q.stalled, 7) + ' | ' + pad(q.noFire, 12) + ' | ' + pad(q.firesMed, 9) + ' | ' + pad(q.hurtsMed + '/' + q.hurtsTotal, 20) + ' | ' + pad(f(q.dmgMed, 0), 7) + ' | ' + q.unhurtKills + (q.pass ? ' pass' : ' FAIL'));
});
out('');
out('Per stage, human bot: clear % (cleared / reached) and median clear s; band = class 9 +-4 points / +-8 % (cache room +-12 %, R46/R48)');
out('stage       | ' + CLASSES.map(function (C) { return pad('C' + C, 15); }).join(' | '));
V.Sim.stageList().forEach(function (sd, i) {
  out(pad(sd.stage + ' ' + sd.kind + '/' + sd.room, 11) + ' | ' + CLASSES.map(function (C) {
    var o = OUT.classes[C].checks.stages[i], m = (o.clearPass === false ? '!' : '') + (o.timePass === false ? '*' : '');
    return pad(f(o.clearPct) + '/' + f(o.medS) + m, 15);
  }).join(' | '));
});
out('(! = clear-rate band missed, * = time band missed)');
var misses = [];
CLASSES.forEach(function (C) {
  var k = OUT.classes[C].checks;
  if (!k.clear.pass) misses.push('C' + C + ' clear ' + f(k.clear.value) + ' % vs 86.5-94.5 (' + (k.clear.value < 86.5 ? f(k.clear.value - 86.5) : '+' + f(k.clear.value - 94.5)) + ' points)');
  if (!k.winMed.pass) misses.push('C' + C + ' median win ' + f(k.winMed.value, 1) + ' s vs 107.6-126.4 (' + f(100 * (k.winMed.value / 117 - 1)) + ' % from 117)');
  if (!k.kill.pass) misses.push('C' + C + ' kill time ' + f(k.kill.value, 2) + ' s vs ' + f(k.kill.band[0], 2) + '-' + f(k.kill.band[1], 2));
  if (!k.winMedWalk2.pass) misses.push('C' + C + ' walk-2 median win ' + f(k.winMedWalk2.value, 1) + ' s vs 94.8-111.2');
  if (!k.shooter.pass) misses.push('C' + C + ' corner-shooter killed B-01 unhurt on ' + k.shooter.unhurtKills + '/' + k.shooter.n + ' seeds');
  if (!k.picks.pass) misses.push('C' + C + ' picks ' + f(k.picks.value, 2) + ' vs ' + f(k.picks.band[0], 2) + '-' + f(k.picks.band[1], 2));
  if (!k.idleCorner.pass) misses.push('C' + C + ' idle ' + f(k.idleCorner.idle) + ' % / corner ' + f(k.idleCorner.corner) + ' % above human');
  if (!k.cornerBoss.pass) misses.push('C' + C + ' corner bot unhurt on ' + (k.cornerBoss.of - k.cornerBoss.hit) + '/' + k.cornerBoss.of + ' boss seeds');
  k.stages.forEach(function (o) {
    if (o.clearPass === false) misses.push('C' + C + ' stage ' + o.stage + ' clear ' + f(o.clearPct) + ' % vs ' + f(o.clear9) + ' +-4 (' + (o.clearMiss > 0 ? '+' : '') + o.clearMiss + ' points)');
    if (o.timePass === false) misses.push('C' + C + ' stage ' + o.stage + ' median ' + f(o.medS) + ' s vs ' + f(o.med9) + ' +-' + Math.round(100 * o.timeTol) + ' % (' + (o.timeMissPct > 0 ? '+' : '') + o.timeMissPct + ' %)');
  });
});
OUT.misses = misses;
out('Misses: ' + (misses.length ? '\n  ' + misses.join('\n  ') : 'none'));
out('Run time ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
var od = path.join(__dirname, 'out'); if (!fs.existsSync(od)) fs.mkdirSync(od);
fs.writeFileSync(path.join(od, 'classes.json'), JSON.stringify(OUT, null, 1));
fs.writeFileSync(path.join(od, 'classes.txt'), L.join('\n') + '\n');
