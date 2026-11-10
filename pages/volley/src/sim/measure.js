// F0 agent D: MEASURED rows from the real headless sim (parts/sim.js + the bot planners in src/bot.js).
// Read-only on game parts: loads them into globalThis.V, reuses bot.js's planners by evaluating its
// bot section (lines before "// ---------- report helpers") in a sandboxed function, and never writes
// anything outside this folder. Tell changes are applied IN MEMORY to V.AI[...].base for this process only.
// Usage: node src/sim/measure.js [seeds=200]  -> prints JSON + text, writes src/sim/out/measure.json
'use strict';
var path = require('path'), fs = require('fs');
var SRC = path.join(__dirname, '..');
globalThis.V = globalThis.V || {};
['tune', 'rng', 'rooms', 'stages', 'mods', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function (f) {
  var p = path.join(SRC, 'parts', f + '.js'); if (fs.existsSync(p)) require(p);
});
var V = globalThis.V;
var botSrc = fs.readFileSync(path.join(SRC, 'bot.js'), 'utf8');
var cut = botSrc.indexOf('// ---------- report helpers');
var head = botSrc.slice(0, cut).replace(/^[\s\S]*?var V = globalThis\.V;/, ''); // drop its own loader
var BOT = new Function('V', 'process', head + '\nreturn { runOne: runOne, freshTune: freshTune };')(V, { argv: [] });

var SEEDS = +process.argv[2] || 200;
var MAX = 20 * 3600;
function pct(a, p) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; }
function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : NaN; }

function sweep(kind, label, setup) {
  var saved = {};
  Object.keys(V.AI).forEach(function (k) { saved[k] = V.AI[k].base.tell; });
  if (setup) setup();
  var runs = [];
  for (var s = 1; s <= SEEDS; s++) runs.push(BOT.runOne(s, kind, MAX));
  Object.keys(saved).forEach(function (k) { V.AI[k].base.tell = saved[k]; });
  var wins = runs.filter(function (r) { return r.win; });
  var hitsBy = {}, killsBy = {}, lifeBy = {}, hitsToKill = {};
  runs.forEach(function (r) {
    for (var k in r.S.stats.hitsBy) hitsBy[k] = (hitsBy[k] || 0) + r.S.stats.hitsBy[k];
    r.kills.forEach(function (x) { killsBy[x.type] = (killsBy[x.type] || 0) + 1; (lifeBy[x.type] = lifeBy[x.type] || []).push(x.life); (hitsToKill[x.type] = hitsToKill[x.type] || []).push(x.hits); });
  });
  var stageSec = {};
  runs.forEach(function (r) { r.S.stats.roomTimes.forEach(function (x) { (stageSec[x.stage] = stageSec[x.stage] || []).push(x.s); }); });
  var deathsBy = {}; runs.filter(function (r) { return r.dead; }).forEach(function (r) { deathsBy[r.stage] = (deathsBy[r.stage] || 0) + 1; });
  var res = {
    label: label, kind: kind, seeds: SEEDS, seedRange: '1..' + SEEDS,
    clear: wins.length / SEEDS,
    runTimeWinMedian: pct(wins.map(function (r) { return r.S.t; }), 0.5),
    runTimeWinP10: pct(wins.map(function (r) { return r.S.t; }), 0.1),
    runTimeWinP90: pct(wins.map(function (r) { return r.S.t; }), 0.9),
    killsWinMedian: pct(wins.map(function (r) { return r.S.stats.kills; }), 0.5),
    picksMean: mean(runs.map(function (r) { return r.picks; })),
    levelEndMean: mean(runs.map(function (r) { return r.S.hero.level; })),
    bossTimeMedian: pct(wins.map(function (r) { return r.S.stats.bossTime; }).filter(function (v) { return v != null; }), 0.5),
    dmgTakenMean: mean(runs.map(function (r) { return r.S.stats.dmgTaken; })),
    hpEndWinMean: mean(wins.map(function (r) { return r.S.hero.hp; })),
    deathsBy: deathsBy,
    hitsPerKill: {}, lifeMedian: {}, hitsToKillMedian: {}, hitsBy: hitsBy, killsBy: killsBy,
    stageSecMedian: {}
  };
  Object.keys(killsBy).forEach(function (k) {
    res.hitsPerKill[k] = +((hitsBy[k] || 0) / killsBy[k]).toFixed(3);
    res.lifeMedian[k] = +pct(lifeBy[k], 0.5).toFixed(2);
    res.hitsToKillMedian[k] = pct(hitsToKill[k], 0.5);
  });
  if (hitsBy['B-01']) res.hitsPerKill['B-01'] = +(hitsBy['B-01'] / SEEDS).toFixed(3) + ' per run';
  Object.keys(stageSec).forEach(function (k) { res.stageSecMedian[k] = +pct(stageSec[k], 0.5).toFixed(1); });
  return res;
}

var t0 = Date.now(), out = {};
var T = V.TUNE_DEFAULTS;
out.feel = {
  note: 'From source constants (measured by reading parts/tune.js, input.js, main.js, sim.js); not a device timing.',
  touchToMove: 'deadzone ' + T.DEADZONE_ENTER + ' px, then the next 1/60 s sim step (<= 16.7 ms + frame)',
  releaseToFirstShot_s: T.BRACE_DELAY + ' brace, then first round if fireCd <= 0 (fire interval ' + T.FIRE_INTERVAL + ' s)',
  deathToResults: 'same sim step (endRun on hp <= 0); results input armed after RESULTS_GUARD_MS 1000 ms',
  bossKillToResults_s: T.PICK_DELAY,
  resultsToPlay: 'tap after 1000 ms guard -> restart is immediate (new sim, stage 1)',
  pickDelayAfterClear_s: T.PICK_DELAY, spawnTelegraph_s: T.SPAWN_T, TELL_MULT: T.TELL_MULT,
  E01_effectiveTell_s: +(V.AI['E-01'].base.tell * T.TELL_MULT).toFixed(3)
};
out.baseline_human = sweep('human', 'today (E-01 tell base 0.5, effective 0.425)');
out.baseline_skilled = sweep('skilled', 'today, skilled bot');
out.tell08_human = sweep('human', 'E-01 base tell 0.8 (effective 0.68 with TELL_MULT 0.85)', function () { V.AI['E-01'].base.tell = 0.8; });
out.tell08eff_human = sweep('human', 'E-01 effective tell 0.8 (base 0.941)', function () { V.AI['E-01'].base.tell = 0.8 / T.TELL_MULT; });
out.naive = sweep('naive', 'naive bot');
out.idle = sweep('idle', 'idle bot');
out.elapsed_s = (Date.now() - t0) / 1000;
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'measure.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
