// Volley report-only smoke (GEN-SPEC pick 61, step 5). Usage: node src/tools/smoke.js [seeds=50] [outPath] [--cols=9,13]
// Plays chapter 1 (all baked stages, no chlen cap) with the human bot from src/bot.js (required, not forked; --seek on), at 9 and 13 columns.
// Per stage it reports room id, clear time p50/p90, damage taken p50/p90 by source (spikes, each machine id, boss), deaths, machines alive at peak.
// Rows outside the bounds below go on a warn list. The list is data, never a gate: the exit code is always 0 (pick 61).
// Stats are over runs that reached the stage (a run that died earlier never sees later rooms, and HP carries over between stages).
'use strict';
var path = require('path'), fs = require('fs');
// bot.js reads its flags from process.argv when it loads: full list (chlen 0) and the stuck-behind-cover breaker, as `node bot.js bands` does.
var userArgs = process.argv.slice(2);
process.argv = process.argv.slice(0, 2).concat(['--chlen=0', '--seek']);
var bot = require(path.join(__dirname, '..', 'bot.js'));
var V = bot.V;

var NUM = userArgs.filter(function (a) { return a.slice(0, 2) !== '--'; });
var SEEDS = +NUM[0] || 50;
var OUT = NUM[1] || '/mnt/project-files/games-proto/volley/v2/smoke/SMOKE-20.md';
var colsFlag = userArgs.filter(function (a) { return /^--cols=/.test(a); })[0];
var WIDTHS = colsFlag ? colsFlag.slice(7).split(',').map(Number) : [9, 13];

// Warn bounds (guesses, report only). Chosen as "a human would likely call it a spike in difficulty":
var BOUNDS = {
  clearP90: 45,        // s: p90 clear time above this (stages are normally 10-30 s)
  dmgP90Frac: 0.35,    // p90 total damage in one room above this share of max HP
  deathShare: 0.15,    // more than this share of the runs that entered the stage died in it
  peakAlive: 8,        // machines alive at once above this at peak
  widthGap: 2.0        // p50 damage at 13 columns vs 9 (or the reverse) differs by this factor (and at least 5 hp)
};

// ---- observe the real sim through V.Sim.step so bot.js runOne is used unchanged ----
var rec = null;
var realStep = V.Sim.step;
V.Sim.step = function (S, inp) {
  var st = S.stage;
  var r = realStep.apply(this, arguments);
  if (rec) {
    var R = rec[st] || (rec[st] = { dmg: {}, peak: 0, total: 0, room: S.roomId });
    var n = 0, i;
    for (i = 0; i < S.enemies.length; i++) if (!S.enemies[i].boss) n++;   // alive machines (boss counted apart)
    if (n > R.peak) R.peak = n;
    for (i = 0; i < S.events.length; i++) {
      var ev = S.events[i];
      if (ev.k !== 'hurt') continue;
      var src = ev.src === 'spikes' ? 'spikes' : (/^B-/.test(ev.src) ? 'boss' : String(ev.src));
      R.dmg[src] = (R.dmg[src] || 0) + (ev.dmg || 0); R.total += ev.dmg || 0;
    }
  }
  return r;
};

function q(a, p) { return a.length ? bot.pct(a, p) : NaN; }
function f(v, d) { return (v == null || isNaN(v)) ? '-' : v.toFixed(d == null ? 1 : d); }
function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }

function runWidth(cols) {
  bot.setCols(cols);
  var stages = {}, runs = [], t0 = Date.now(), seed;
  for (seed = 1; seed <= SEEDS; seed++) {
    rec = {};
    var r = bot.runOne(seed, 'human', bot.MAX_STEPS, null, null);
    var S = r.S, times = {};
    S.stats.roomTimes.forEach(function (x) { times[x.stage] = x.s; });
    runs.push({ win: r.win, dead: r.dead, stage: r.stage, dmg: S.stats.dmgTaken, maxHp: S.hero.maxHp });
    Object.keys(rec).forEach(function (k) {
      var st = +k, A = stages[st] || (stages[st] = { room: rec[k].room, entered: 0, times: [], total: [], by: {}, peak: [], deaths: 0, maxHp: [] });
      A.entered++; A.peak.push(rec[k].peak); A.total.push(rec[k].total); A.maxHp.push(S.hero.maxHp);
      if (times[st] != null) A.times.push(times[st]);
      if (r.dead && r.stage === st) A.deaths++;
      Object.keys(rec[k].dmg).forEach(function (s) { (A.by[s] = A.by[s] || {})[seed] = rec[k].dmg[s]; });
    });
  }
  Object.keys(stages).forEach(function (k) {   // sources a run did not take damage from count as 0 over the runs that entered
    var A = stages[k];
    Object.keys(A.by).forEach(function (s) { var a = []; for (var sd = 1; sd <= SEEDS; sd++) if (A.by[s][sd] != null) a.push(A.by[s][sd]); A.by[s] = { vals: a, zeros: A.entered - a.length }; });
  });
  rec = null;
  return { cols: cols, stages: stages, runs: runs, secs: (Date.now() - t0) / 1000 };
}
function srcP(A, s, p) { var b = A.by[s]; if (!b) return 0; var all = b.vals.concat(new Array(b.zeros).fill(0)); return q(all, p); }

function main() {
  var len = V.Sim.stageList().length, res = WIDTHS.map(runWidth), L = [], warns = [], i, st;
  var allSrc = {};
  res.forEach(function (R) { Object.keys(R.stages).forEach(function (k) { Object.keys(R.stages[k].by).forEach(function (s) { allSrc[s] = 1; }); }); });
  var srcs = Object.keys(allSrc).filter(function (s) { return s !== 'spikes' && s !== 'boss'; }).sort();
  var cols = ['spikes'].concat(srcs, ['boss']);

  L.push('# SMOKE-20: report-only smoke over baked Chapter 1 (pick 61)');
  L.push('');
  L.push('HEADLINE_PLACEHOLDER');
  L.push('');
  L.push('Run ' + new Date().toISOString() + '; `node src/tools/smoke.js ' + SEEDS + '`; human bot (bot.js, --seek), seeds 1..' + SEEDS + ', widths ' + WIDTHS.join(' and ') + ', stages 1-' + len + '. Report only: no pass or fail, exit code 0.');
  L.push('Stats are over runs that reached the stage (HP and upgrades carry between stages). dmg cells are p50/p90 of damage taken in that room per run (0 counted for runs not hit by that source). Peak = most machines alive at once (boss excluded).');
  L.push('');
  WIDTHS.forEach(function (w, wi) {
    var R = res[wi];
    L.push('## ' + w + ' columns (' + SEEDS + ' runs, ' + R.secs.toFixed(0) + ' s)');
    L.push('');
    L.push('| stage | room | entered | clear s p50/p90 | dmg total p50/p90 | ' + cols.join(' | ') + ' | deaths | peak p50/max |');
    L.push('|' + new Array(cols.length + 7).join('---|') + '---|');
    for (st = 1; st <= len; st++) {
      var A = R.stages[st];
      if (!A) { L.push('| ' + st + ' | - | 0 |' + new Array(cols.length + 5).join(' - |')); continue; }
      var cells = cols.map(function (s) { return A.by[s] ? f(srcP(A, s, 0.5), 0) + '/' + f(srcP(A, s, 0.9), 0) : '0'; });
      L.push('| ' + st + ' | ' + A.room + ' | ' + A.entered + ' | ' + f(q(A.times, 0.5)) + '/' + f(q(A.times, 0.9)) + ' | ' + f(q(A.total, 0.5), 0) + '/' + f(q(A.total, 0.9), 0) + ' | ' + cells.join(' | ') + ' | ' + A.deaths + ' | ' + f(q(A.peak, 0.5), 0) + '/' + Math.max.apply(null, A.peak) + ' |');
      var mhp = q(A.maxHp, 0.5), tag = w + 'c s' + st + ' ' + A.room;
      if (q(A.times, 0.9) > BOUNDS.clearP90) warns.push(tag + ': clear p90 ' + f(q(A.times, 0.9)) + ' s (bound ' + BOUNDS.clearP90 + ')');
      if (q(A.total, 0.9) > BOUNDS.dmgP90Frac * mhp) warns.push(tag + ': damage p90 ' + f(q(A.total, 0.9), 0) + ' of max HP about ' + f(mhp, 0) + ' (bound ' + (BOUNDS.dmgP90Frac * 100) + '% of max HP)');
      if (A.entered && A.deaths / A.entered > BOUNDS.deathShare && A.deaths >= 3) warns.push(tag + ': ' + A.deaths + ' deaths of ' + A.entered + ' entered (bound ' + (BOUNDS.deathShare * 100) + '%)');
      if (Math.max.apply(null, A.peak) > BOUNDS.peakAlive) warns.push(tag + ': peak ' + Math.max.apply(null, A.peak) + ' machines alive (bound ' + BOUNDS.peakAlive + ')');
    }
    L.push('');
  });
  if (WIDTHS.length >= 2) {
    var a = res[0], b = res[1];
    for (st = 1; st <= len; st++) {
      var x = a.stages[st], y = b.stages[st]; if (!x || !y) continue;
      var m1 = q(x.total, 0.5), m2 = q(y.total, 0.5), hi = Math.max(m1, m2), lo = Math.min(m1, m2);
      if (hi - lo >= 5 && hi >= BOUNDS.widthGap * Math.max(lo, 1)) warns.push('s' + st + ' ' + x.room + ': p50 damage ' + f(m1, 0) + ' at ' + a.cols + ' columns vs ' + f(m2, 0) + ' at ' + b.cols + ' (width gap bound ' + BOUNDS.widthGap + 'x)');
    }
  }
  // run-level view
  L.push('## Whole runs');
  L.push('');
  L.push('| columns | clear | died | mean damage per run (all) | p50/p90 damage (wins) | p50/p90 damage (deaths) |');
  L.push('|---|---|---|---|---|---|');
  res.forEach(function (R) {
    var w = R.runs.filter(function (r) { return r.win; }), d = R.runs.filter(function (r) { return r.dead; });
    function dd(a) { return a.length ? f(q(a.map(function (r) { return r.dmg; }), 0.5), 0) + '/' + f(q(a.map(function (r) { return r.dmg; }), 0.9), 0) : '-'; }
    L.push('| ' + R.cols + ' | ' + w.length + '/' + R.runs.length + ' | ' + d.length + ' | ' + f(sum(R.runs.map(function (r) { return r.dmg; })) / R.runs.length, 0) + ' | ' + dd(w) + ' | ' + dd(d) + ' |');
  });
  L.push('');
  L.push('## Warn list (report only; bounds are guesses: clear p90 > ' + BOUNDS.clearP90 + ' s, damage p90 > ' + (BOUNDS.dmgP90Frac * 100) + '% of max HP, deaths > ' + (BOUNDS.deathShare * 100) + '% of entrants (3 or more), peak alive > ' + BOUNDS.peakAlive + ', width gap >= ' + BOUNDS.widthGap + 'x)');
  L.push('');
  if (!warns.length) L.push('- none'); else warns.forEach(function (w) { L.push('- ' + w); });
  L.push('');
  var text = L.join('\n') + '\n';
  var head = process.env.SMOKE_HEADLINE || '(headline: see E-REPORT-S6.md; set SMOKE_HEADLINE to embed five lines here)';
  text = text.replace('HEADLINE_PLACEHOLDER', head);
  console.log(text);
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, text); } catch (e) { console.error('could not write ' + OUT + ': ' + e.message); }
  return 0;
}
try { main(); } catch (e) { console.error('smoke error: ' + (e && e.stack || e)); }
process.exitCode = 0;   // pick 61: never a gate
