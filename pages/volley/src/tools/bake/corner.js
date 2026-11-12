'use strict';
// Corner-shooter check per (boss, arena) (CURVE 4b, R49; report, not a gate). Usage, from pages/volley:
//   node src/tools/bake/corner.js [seeds=50] [secs=90] [stages=20,30,40,50]
// Uses the real bot.js cornerShooterInput and the real sim with the step-7 boss parts. For each boss stage and width 9/11/13/15 it jumps a run
// to that stage (force-clearing the rooms before it, as bot.js toStageC does), then lets the corner shooter camp a bottom corner for `secs`.
// A run is "won" when the boss room clears (all boss bodies dead: B-03 splits share one bar). Expect: hurt in every run, unhurt wins 0.
var path = require('path'), fs = require('fs');
var SRC = path.join(__dirname, '..', '..');
globalThis.V = globalThis.V || {};
['tune', 'rng', 'data-stages', 'data-enemies', 'boss-kit'].forEach(function (f) { var p = path.join(SRC, 'parts', f + '.js'); if (fs.existsSync(p)) require(p); });
var BOT = require(path.join(SRC, 'bot.js'));
var LOADED = [];
['ai-e06', 'ai-e07', 'ai-e08', 'boss-b02', 'boss-b03', 'boss-b04'].forEach(function (f) { var p = path.join(SRC, 'parts', f + '.js'); if (fs.existsSync(p)) { require(p); LOADED.push(f); } });
var V = globalThis.V;
if (V.SimOpts) V.SimOpts.chlen = 0;   // the whole baked list (bot.js pins 10 for its built baselines)
var SEEDS = +process.argv[2] || 50, SECS = +process.argv[3] || 90;
var STAGES = (process.argv[4] || '20,30,40,50').split(',').map(Number), WIDTHS = [9, 11, 13, 15];

function freshTune() { var t = {}; for (var k in V.TUNE_DEFAULTS) t[k] = V.TUNE_DEFAULTS[k]; return t; }
function toStage(seed, n, cols) {
  var S = V.Sim.create(seed, freshTune(), { cols: cols }), g = 0;
  while (S.stage < n && g++ < 40000) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, 1); continue; }
    if (S.phase === 'collect' && V.Sim.skipCollect) V.Sim.skipCollect(S);
    if (S.phase === 'play') { S.enemies.length = 0; S.spawnQ.length = 0; }
    S.hero.hp = S.hero.maxHp;
    V.Sim.step(S, { mx: 0, my: 0 });
    if (S.phase === 'clear') { S.hero.x = S.room.door.x + 0.5; S.hero.y = 1.3; V.Sim.step(S, { mx: 0, my: -1 }); }
  }
  return S;
}
function run(stage, cols, seed) {
  var S = toStage(seed, stage, cols), B = { side: seed % 2 ? -1 : 1 }, dmg = 0, hurts = 0, bossHits = 0, errs = 0, i, type = null;
  if (S.stage !== stage || S.stageKind !== 'boss') return { skip: true, stage: S.stage, kind: S.stageKind };
  for (i = 0; i < SECS * 60 && S.phase !== 'results'; i++) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'clear') break;
    V.Sim.step(S, BOT.cornerShooterInput(S, B));
    for (var q = 0; q < S.enemies.length; q++) if (S.enemies[q].boss) { type = type || S.enemies[q].type; }
    for (var j = 0; j < S.events.length; j++) {
      var e = S.events[j];
      if (e.k === 'hurt') { dmg += e.dmg || 0; hurts++; }
      else if (e.k === 'hit') { for (var r = 0; r < S.enemies.length; r++) if (S.enemies[r].id === e.id && S.enemies[r].boss) { bossHits++; break; } }
      else if (e.k === 'error') errs++;
    }
  }
  var won = S.phase === 'clear' || !!(S.result && S.result.win);
  var hpLeft = 0, hpMax = 0; S.enemies.forEach(function (e) { if (e.boss) { hpLeft += e.hp; hpMax += e.maxHp; } });
  return { type: type, won: won, dead: S.phase === 'results' && !won, dmg: dmg, hurts: hurts, bossHits: bossHits, errs: errs, t: +S.roomT.toFixed(1), bossLeft: hpMax ? hpLeft / hpMax : 0 };
}
var t0 = Date.now(), out = [];
out.push('corner-shooter check: ' + SEEDS + ' seeds, ' + SECS + ' s cap, parts [' + LOADED.join(',') + ']');
out.push('| stage | boss | arena room | width | hurt | unhurt wins | wins | deaths | boss hits (mean) | boss HP left (mean) | errors |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|');
var bad = 0;
STAGES.forEach(function (st) {
  WIDTHS.forEach(function (W) {
    var rs = [], k;
    for (k = 1; k <= SEEDS; k++) rs.push(run(st, W, k));
    var ok = rs.filter(function (r) { return !r.skip; });
    var hurt = ok.filter(function (r) { return r.hurts > 0; }).length, uw = ok.filter(function (r) { return r.won && !r.hurts; }).length;
    var wins = ok.filter(function (r) { return r.won; }).length, deaths = ok.filter(function (r) { return r.dead; }).length, errs = ok.reduce(function (a, r) { return a + r.errs; }, 0);
    var mh = ok.reduce(function (a, r) { return a + r.bossHits; }, 0) / (ok.length || 1), ml = ok.reduce(function (a, r) { return a + r.bossLeft; }, 0) / (ok.length || 1);
    if (uw || ok.length !== SEEDS) bad++;
    var L = V.Sim.stageList ? V.Sim.stageList() : V.STAGES.ch1;
    out.push('| ' + st + ' | ' + ((ok[0] && ok[0].type) || '?') + ' | ' + L[st - 1].room + ' ' + V.ROOMS[L[st - 1].room].name + ' | ' + W + ' | ' + hurt + '/' + ok.length + ' | ' + uw + ' | ' + wins + ' | ' + deaths + ' | ' + mh.toFixed(1) + ' | ' + (ml * 100).toFixed(0) + '% | ' + errs + (ok.length !== SEEDS ? ' (' + (SEEDS - ok.length) + ' runs never reached the stage)' : '') + ' |');
  });
});
out.push((bad ? 'SUSPECT ' + bad + ' (boss, width) cells' : 'OK: no unhurt corner-shooter win') + '; ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
console.log(out.join('\n'));
