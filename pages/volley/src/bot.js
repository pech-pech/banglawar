// Headless bot sweep for Project Volley P1 (chapter 1, stages 1-10). Usage: node bot.js [seeds=200]
// Loads the sim parts into globalThis.V in game load order and writes BOT-RESULTS.txt next to this file.
'use strict';
var path = require('path'), fs = require('fs');
globalThis.V = globalThis.V || {};
var PARTS = ['tune', 'rng', 'rooms', 'stages', 'mods', 'sim', 'ai-p0', 'ai-p1', 'boss'];
var loaded = [];
PARTS.forEach(function (f) {
  var p = path.join(__dirname, 'parts', f + '.js');
  if (fs.existsSync(p)) { require(p); loaded.push(f); }
});
var V = globalThis.V;

var SEEDS = +process.argv[2] || 200;
var MAX_STEPS = 20 * 3600;   // 20 game minutes cap per run (a run is 10 stages)
var HERO_WALL_R = 0.35, HURT = 0.28;
var DEG = Math.PI / 180;

function freshTune() { var t = {}; for (var k in V.TUNE_DEFAULTS) t[k] = V.TUNE_DEFAULTS[k]; return t; }
function grid(S) { return V.ROOMS[S.roomId].grid; }

// ---------- navigation (BFS on the tile grid; avoids spikes when it can) ----------
function bfsDir(S, gx, gy, avoidSpikes) {
  var h = S.hero, g = grid(S), W = S.room.w, H = S.room.h;
  function ok(x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return false; var c = g[y][x]; return c !== '#' && !(avoidSpikes && c === '^'); }
  var sx = Math.max(0, Math.min(W - 1, Math.floor(h.x))), sy = Math.max(0, Math.min(H - 1, Math.floor(h.y)));
  var prev = {}, q = [[gx, gy]], seen = {}, found = false; seen[gx + ',' + gy] = 1;
  while (q.length) {
    var c = q.shift();
    if (c[0] === sx && c[1] === sy) { found = true; break; }
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (o) {
      var nx = c[0] + o[0], ny = c[1] + o[1], key = nx + ',' + ny;
      if (seen[key] || !(ok(nx, ny) || (nx === sx && ny === sy))) return;
      seen[key] = 1; prev[key] = c; q.push([nx, ny]);
    });
  }
  if (!found) return null;
  var nxt = prev[sx + ',' + sy] || [gx, gy];
  var tx = nxt[0] + 0.5, ty = nxt[1] + 0.5;
  var ox = Math.abs(h.x - (sx + 0.5)), oy = Math.abs(h.y - (sy + 0.5));
  if (nxt[0] !== sx && oy > 0.2) { tx = sx + 0.5; ty = sy + 0.5; }
  if (nxt[1] !== sy && ox > 0.2) { tx = sx + 0.5; ty = sy + 0.5; }
  if (Math.abs(tx - h.x) + Math.abs(ty - h.y) < 0.05) { tx = nxt[0] + 0.5; ty = nxt[1] + 0.5; }
  return { mx: tx - h.x, my: ty - h.y };
}
function doorDir(S) {
  var h = S.hero, d = S.room.door;
  if (Math.floor(h.y) <= 1 && Math.floor(h.x) === d.x) return { mx: (d.x + 0.5 - h.x) * 2, my: -1 };
  return bfsDir(S, d.x, d.y, true) || bfsDir(S, d.x, d.y, false) || { mx: 0, my: -1 };
}
function clearInput(S) {
  // let XP orbs arrive, then go for the door
  if (S.clearT < 0.6 && S.pickups.some(function (p) { return p.kind === 'xp'; })) return { mx: 0, my: 0 };
  return doorDir(S);
}

// ---------- threat models ----------
function solidAt(S, x, y, r) {
  if (x < r || x > S.room.w - r || y < r || y > S.room.h - r) return true;
  var a = S.room.solids.concat(S.room.door.open ? [] : [S.room.door]);
  for (var i = 0; i < a.length; i++) {
    var b = a[i], nx = Math.max(b.x, Math.min(x, b.x + b.w)), ny = Math.max(b.y, Math.min(y, b.y + b.h));
    if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return true;
  }
  return false;
}
function onSpikes(S, x, y) {
  for (var i = 0; i < S.hazards.length; i++) {
    var b = S.hazards[i], nx = Math.max(b.x, Math.min(x, b.x + b.w)), ny = Math.max(b.y, Math.min(y, b.y + b.h));
    if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < HURT * HURT) return true;
  }
  return false;
}
// projectile list: [x,y,vx,vy,r,t0,life,stopsOnCover]; zones: [x,y,r,tLand]
function skilledThreats(S) {
  var P = [], Z = [], i, h = S.hero, t = S.tune, sm = t.ENEMY_SHOT_SPEED_MULT;
  for (i = 0; i < S.shots.length; i++) { var s = S.shots[i]; P.push([s.x, s.y, s.vx, s.vy, s.r, 0, 3, 1]); }
  for (i = 0; i < S.shells.length; i++) { var sh = S.shells[i]; Z.push([sh.tx, sh.ty, sh.r, sh.T - sh.t]); }
  for (i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i], a;
    if (e.type === 'E-02' && e.st === 'tell') P.push([e.x, e.y, Math.cos(e.aimAng) * 6 * sm, Math.sin(e.aimAng) * 6 * sm, 0.15, e.stT, 3, 1]);
    else if (e.type === 'E-03' && e.st === 'tell') for (var k = -1; k <= 1; k++) { a = e.aimAng + k * 25 * DEG; P.push([e.x, e.y, Math.cos(a) * 5 * sm, Math.sin(a) * 5 * sm, 0.15, e.stT, 3, 1]); }
    else if (e.type === 'E-01' && e.st === 'act') P.push([e.x, e.y, e.vx * 6, e.vy * 6, e.r, 0, (e.lungeLeft || 0) / 6, 1]);
    else if (e.type === 'E-01' && e.st === 'tell') { a = Math.atan2(h.y - e.y, h.x - e.x); P.push([e.x, e.y, Math.cos(a) * 6, Math.sin(a) * 6, e.r, e.stT, 0.5, 1]); }
    else if (e.type === 'E-05' && (e.st === 'tell' || e.st === 'act')) {
      a = e.aimAng; var L = e.st === 'act' ? (e.dashLeft || 0) : (e.lane || 8);
      P.push([e.x, e.y, Math.cos(a) * 9, Math.sin(a) * 9, e.r + 0.1, e.st === 'tell' ? e.stT : 0, L / 9, 1]);
    } else if (e.type === 'E-04' && e.st === 'tell') Z.push([h.x, h.y, 1.0, e.stT + 1.0]);
  }
  return { P: P, Z: Z };
}
function dangerOf(S, th, px, py, dx, dy, moveT) {
  var d = 0, sp = S.tune.MOVE_SPEED, i, tau;
  for (i = 0; i < th.P.length; i++) {
    var p = th.P[i];
    for (tau = 0; tau <= 0.9; tau += 0.05) {
      var lt = tau - p[5]; if (lt < 0) continue; if (lt > p[6]) break;
      var sx = p[0] + p[2] * lt, sy = p[1] + p[3] * lt;
      if (p[7] && lt > 0 && solidAt(S, sx, sy, 0.01) && !(sx < 0 || sx > 9 || sy < 0 || sy > 15)) break;
      var m = Math.min(tau, moveT), hx = px + dx * sp * m, hy = py + dy * sp * m;
      var rr = p[4] + HURT + 0.22;
      if ((sx - hx) * (sx - hx) + (sy - hy) * (sy - hy) < rr * rr) { d += 10 * (1.2 - tau); break; }
    }
  }
  for (i = 0; i < th.Z.length; i++) {
    var z = th.Z[i], mm = Math.min(Math.max(0, z[3]), moveT), zx = px + dx * sp * mm, zy = py + dy * sp * mm;
    var rz = z[2] + HURT + 0.2;
    if ((zx - z[0]) * (zx - z[0]) + (zy - z[1]) * (zy - z[1]) < rz * rz) d += 8 * (z[3] < 0.6 ? 1.5 : 1);
  }
  return d;
}
function planMove(S, th, enemies, opts) {
  var h = S.hero, t = S.tune, best = null, bestC = 1e9, N = 16, sp = t.MOVE_SPEED, moveT = 0.22;
  for (var i = -1; i < N; i++) {
    var dx = 0, dy = 0;
    if (i >= 0) { var a = i / N * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
    var ex = h.x + dx * sp * moveT, ey = h.y + dy * sp * moveT;
    if (i >= 0 && solidAt(S, ex, ey, HERO_WALL_R)) continue;
    var c = dangerOf(S, th, h.x, h.y, dx, dy, moveT);
    if (onSpikes(S, ex, ey)) c += 6;
    var anyLine = false;
    for (var j = 0; j < enemies.length; j++) {
      var e = enemies[j];
      var de = Math.hypot(e.x - ex, e.y - ey);
      if (e.st !== 'spawn' && V.Sim.clearLine(S, ex, ey, e.x, e.y, t.ROUND_R)) anyLine = true;
      if ((e.type === 'E-01' || e.type === 'E-05') && e.st !== 'spawn') {
        var want = e.st === 'cool' || e.st === 'stun' ? 1.3 : (e.type === 'E-05' ? 2.0 : 3.0);
        if (de < want) c += (want - de) * 2.2;
      } else if (de < (e.r || 0.4) + 1.0) c += ((e.r || 0.4) + 1.0 - de) * 2;
    }
    if (!anyLine) c += 1.5;
    if (i >= 0) c += opts.stillBias;
    var wall = Math.min(ex, 9 - ex, ey - 1, 15 - ey);
    if (wall < 0.9) c += (0.9 - wall) * 0.8;
    if (c < bestC) { bestC = c; best = { mx: dx, my: dy }; }
  }
  return best || { mx: 0, my: 0 };
}
function skilledInput(S, B) {
  if (S.phase === 'clear') return clearInput(S);
  if (B.hold > 0) { B.hold--; return B.cmd; }
  B.cmd = planMove(S, skilledThreats(S), S.enemies, { stillBias: 0.6 });
  B.hold = (B.cmd.mx || B.cmd.my) ? 5 : 2;
  return B.cmd;
}
// human-like: sees the world 0.25 s late, reads positions only (shot motion from two late frames, no aim
// lines, no lane or fan prediction), shell rings are visible markers; re-plans every 0.15 s.
function humanSnapshot(S) {
  return {
    shots: S.shots.map(function (s) { return [s.x, s.y, s.r]; }),
    shells: S.shells.map(function (s) { return [s.tx, s.ty, s.r, s.T - s.t]; }),
    enemies: S.enemies.map(function (e) { return { x: e.x, y: e.y, r: e.r, type: e.type, st: e.st }; })
  };
}
function humanInput(S, B) {
  B.hist.push(humanSnapshot(S)); if (B.hist.length > 20) B.hist.shift();
  if (S.phase === 'clear') return clearInput(S);
  if (B.hold > 0) { B.hold--; return B.cmd; }
  var late = B.hist[Math.max(0, B.hist.length - 1 - 15)], prev = B.hist[Math.max(0, B.hist.length - 1 - 18)];
  var P = [], Z = [], i;
  for (i = 0; i < late.shots.length; i++) {
    var s = late.shots[i], q = null, bd = 0.8;
    for (var j = 0; j < prev.shots.length; j++) { var o = prev.shots[j], d = Math.hypot(o[0] - s[0], o[1] - s[1]); if (d < bd) { bd = d; q = o; } }
    var vx = 0, vy = 0;
    if (q) { vx = (s[0] - q[0]) / 0.05; vy = (s[1] - q[1]) / 0.05; }
    // extrapolate from the late position to now (0.25 s later)
    P.push([s[0] + vx * 0.25, s[1] + vy * 0.25, vx, vy, s[2], 0, 3, 1]);
  }
  for (i = 0; i < late.shells.length; i++) Z.push([late.shells[i][0], late.shells[i][1], late.shells[i][2], late.shells[i][3] - 0.25]);
  B.cmd = planMove(S, { P: P, Z: Z }, late.enemies, { stillBias: 0.9 });
  B.hold = 9;
  return B.cmd;
}
function naiveInput(S, B) {
  if (S.phase === 'clear') return doorDir(S);
  if (B.hold > 0) { B.hold--; return B.cmd; }
  if (B.rng.next() < 0.55) { B.cmd = { mx: 0, my: 0 }; B.hold = Math.round(B.rng.range(0.4, 1.4) * 60); }
  else { var a = B.rng.next() * Math.PI * 2; B.cmd = { mx: Math.cos(a), my: Math.sin(a) }; B.hold = Math.round(B.rng.range(0.2, 0.8) * 60); }
  return B.cmd;
}
function idleInput(S) { return S.phase === 'clear' ? doorDir(S) : { mx: 0, my: 0 }; }

var PREF = ['rate', 'atk', 'multi', 'front', 'rico', 'pierce', 'diag', 'armor', 'crit', 'dodge', 'burn', 'poison', 'side', 'salvage', 'rear', 'rate2', 'atk2', 'crit2'];
function chooseCard(S, kind, B) {
  if (kind === 'skilled' || kind === 'human') {
    var bi = 0, br = 99;
    S.cards.forEach(function (ci, i) { var r = PREF.indexOf(V.CARDS[ci].key); if (r < 0) r = 50; if (r < br) { br = r; bi = i; } });
    return bi;
  }
  if (kind === 'naive') return B.rng.int(S.cards.length);
  return 0;
}
function chooseSupply(S, kind, B) {
  var ri = -1; S.supply.forEach(function (c, i) { if (c.kind === 'repair') ri = i; });
  if (kind === 'naive') return B.rng.int(S.supply.length);
  if (kind === 'idle') return 0;
  return (ri >= 0 && S.hero.hp < 0.6 * S.hero.maxHp) ? ri : (ri === 0 ? 1 % S.supply.length : 0);
}

// ---------- run one ----------
var INPUT = { idle: idleInput, naive: naiveInput, skilled: skilledInput, human: humanInput };
function runOne(seed, kind, maxSteps, tune, metaStats) {
  var S = metaStats ? V.Sim.create(seed, tune || freshTune(), { metaStats: metaStats }) : V.Sim.create(seed, tune || freshTune());
  var B = { rng: new V.Rng(seed * 7919 + 13), hold: 0, cmd: { mx: 0, my: 0 }, hist: [] };
  var input = INPUT[kind];
  var hits = {}, alive = {}, kills = [], steps = 0, picks = 0, stageHp = {};
  while (steps < maxSteps) {
    if (S.phase === 'results') break;
    if (S.phase === 'pick') { V.Sim.pick(S, chooseCard(S, kind, B)); picks++; continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, chooseSupply(S, kind, B)); continue; }
    var st0 = S.stage;
    V.Sim.step(S, input(S, B));
    steps++;
    for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (e.st !== 'spawn' && alive[e.id] == null) alive[e.id] = S.t; }
    for (var j = 0; j < S.events.length; j++) {
      var ev = S.events[j];
      if (ev.k === 'hit') hits[ev.id] = (hits[ev.id] || 0) + 1;
      else if (ev.k === 'kill') kills.push({ type: ev.type, stage: S.stage, hits: hits[ev.id] || 0, life: S.t - (alive[ev.id] != null ? alive[ev.id] : S.t) });
    }
    if (S.stage !== st0) stageHp[st0] = S.hero.hp; // HP on leaving the stage (after pickups)
  }
  var R = S.result;
  return { seed: seed, kind: kind, S: S, steps: steps, win: !!(R && R.win), dead: !!(R && !R.win), timeout: !R,
    stage: S.stage, cleared: S.stats.roomTimes.length, kills: kills, picks: picks, stageHp: stageHp };
}

// ---------- report helpers ----------
function pct(a, p) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; }
function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : NaN; }
function f1(v) { return (v == null || isNaN(v)) ? '-' : v.toFixed(1); }
function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
var lines = [];
function out(s) { console.log(s); lines.push(s); }

var t0 = Date.now();
out('Project Volley P1 headless bot results (chapter 1, stages 1-10)');
out('Date: 2026-11-10 (script run ' + new Date().toISOString() + ')');
out('Parts loaded: ' + loaded.join(', ') + (V.MODS ? '' : '  [mods.js missing: P0 fallback cards]') + (V.STAGES ? '' : '  [stages.js missing: fallback stages]'));
out('Seeds: ' + SEEDS + ' per bot (seeds 1..' + SEEDS + '), cap 20 game minutes per run, fixed step 1/60, default TUNE (CARDS_OFFERED ' + V.TUNE_DEFAULTS.CARDS_OFFERED + ', ENDLESS ' + V.TUNE_DEFAULTS.ENDLESS + ').');
out('Bots: idle = never moves in combat, walks to the door when clear, takes card 0 / supply choice 0;');
out('      naive = random walk with random stops, random cards; skilled = samples 16 moves + stand every 0.1 s against');
out('      predicted shots, lunges, charges, fans and shell rings, kites chasers, prefers standing still;');
out('      human = same planner but 0.25 s reaction delay, positions only (shot motion from late frames, no aim-line/fan/lane');
out('      reading, sees shell rings), re-plans every 0.15 s, stronger preference to stand still.');
out('Stage list: ' + V.Sim.stageList().map(function (s) { return s.stage + ':' + s.kind + '/' + s.room + '/' + s.spawns.map(function (x) { return x.type + '@' + x.t; }).join('+'); }).join('  '));
out('');

// 1) shots-to-kill (formula)
var T = freshTune(), EN = V.Sim.ENEMIES;
out('== Shots to kill at stage 1, fresh hero (formula, no crit) vs D1 targets ==');
var targets = { 'E-01': 2, 'E-02': 3 };
Object.keys(EN).forEach(function (k) {
  var hp = Math.round(EN[k].hp * T.ENEMY_HP_GLOBAL), sh = Math.ceil(hp / T.HERO_ATK);
  out(k + ': HP ' + hp + ' -> ' + sh + ' shots' + (targets[k] ? ' (D1 target ' + targets[k] + ': ' + (sh === targets[k] ? 'PASS' : 'FAIL') + ')' : ''));
});
out('stage 10 (scale x' + (1 + T.HP_SLOPE * 9).toFixed(3) + '): ' + Object.keys(EN).map(function (k) { var hp = Math.round(EN[k].hp * T.ENEMY_HP_GLOBAL * (1 + T.HP_SLOPE * 9)); return k + ' ' + hp + ' HP = ' + Math.ceil(hp / T.HERO_ATK); }).join('; '));
out('');

// 2) determinism
out('== Determinism (same seed twice, 3000 steps, hash after) ==');
['skilled', 'naive', 'human'].forEach(function (kind) {
  [7, 1234].forEach(function (seed) {
    var hs = [0, 1].map(function () { var r = runOne(seed, kind, 3000); return V.Sim.hash(r.S) + '@' + r.S.frame; });
    out(kind + ' seed ' + seed + ': ' + hs[0] + ' / ' + hs[1] + ' -> ' + (hs[0] === hs[1] ? 'PASS' : 'FAIL'));
  });
});
var hA = V.Sim.hash(runOne(7, 'skilled', 3000).S), hB = V.Sim.hash(runOne(8, 'skilled', 3000).S);
out('different seeds 7 vs 8 differ: ' + (hA !== hB ? 'PASS' : 'FAIL') + ' (' + hA + ' vs ' + hB + ')');
out('');

// 3) rule checks
out('== Rule checks ==');
var nFail = 0;
function chk(name, ok, info) { if (!ok) nFail++; out((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' (' + info + ')' : '')); }
function stepN(S, n, inp) { for (var i = 0; i < n; i++) { if (S.phase === 'pick') V.Sim.pick(S, 0); else if (S.phase === 'supply') V.Sim.pickSupply(S, 1); else V.Sim.step(S, inp || { mx: 0, my: 0 }); } }
function toStage(seed, n, tune) { // jump to stage n by force-clearing rooms and walking through the door
  var S = V.Sim.create(seed, tune || freshTune()), g = 0;
  while (S.stage < n && g++ < 20000) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, 1); continue; }
    if (S.phase === 'play') { S.enemies.length = 0; S.spawnQ.length = 0; }
    V.Sim.step(S, { mx: 0, my: 0 });
    if (S.phase === 'clear') { S.hero.x = 4.5; S.hero.y = 1.3; V.Sim.step(S, { mx: 0, my: -1 }); }
  }
  return S;
}
(function () {
  var i, f = -1;
  var S2 = V.Sim.create(5, freshTune());
  for (i = 0; i < 40; i++) V.Sim.step(S2, { mx: 1, my: 0 });
  for (i = 1; i <= 120; i++) { V.Sim.step(S2, { mx: 0, my: 0 }); if (S2.events.some(function (e) { return e.k === 'fire'; })) { f = i; break; } }
  chk('brace delay: first shot ' + f + ' frames after stopping (0.15 s = 9 frames)', f === 9 || f === 10);
  var S3 = V.Sim.create(5, freshTune()), fired = 0;
  for (i = 0; i < 300 && !fired; i++) { V.Sim.step(S3, { mx: 0, my: 0 }); if (S3.events.some(function (e) { return e.k === 'fire'; })) fired = 1; }
  var cd0 = S3.hero.fireCd; V.Sim.step(S3, { mx: -1, my: 0 }); V.Sim.step(S3, { mx: -1, my: 0 });
  chk('fire cooldown counts down while moving', S3.hero.fireCd < cd0 && !S3.hero.braced && S3.hero.lockId === null, cd0.toFixed(3) + ' -> ' + S3.hero.fireCd.toFixed(3));
  var S4 = V.Sim.create(9, freshTune()), last = -1, minGap = 1e9;
  for (i = 0; i < 600; i++) { V.Sim.step(S4, (i % 12) < 2 ? { mx: 0, my: 1 } : { mx: 0, my: 0 }); if (S4.events.some(function (e) { return e.k === 'fire'; })) { if (last >= 0) minGap = Math.min(minGap, S4.t - last); last = S4.t; } if (S4.phase !== 'play') break; }
  chk('stop/go tapping cannot beat the fire interval', minGap >= freshTune().FIRE_INTERVAL - 1e-6, 'min gap ' + minGap.toFixed(3) + ' s');
  // spawn timing: stage 1 has E-01 at t=1
  var S1 = V.Sim.create(4, freshTune()); stepN(S1, 30);
  var n30 = S1.enemies.length + S1.stats.kills; stepN(S1, 40);
  chk('stage spawn times respected (stage 1: 1 at t=0, 2 more at t=1 s)', n30 === 1 && S1.enemies.length + S1.stats.kills === 3, 'at 0.5 s ' + n30);
  // cover vs flat shots, shells over cover
  var S5 = toStage(3, 2);
  S5.enemies.length = 0; S5.spawnQ.length = 0;
  S5.enemies.push({ id: 999, type: 'E-02', x: 3, y: 1.5, r: 0.4, hp: 1e6, maxHp: 1e6, st: 'cool', cd: 99, spawnT: 0, contactCd: 0, ang: 0, size: 'medium', strafe: 1, strafeT: 99, noLosT: 0, stT: 0 });
  S5.hero.x = 3; S5.hero.y = 9; S5.room.door.open = false;
  S5.shots.push({ x: 3, y: 2.5, vx: 0, vy: 6, r: 0.15, dmg: 60, src: 'E-02', bounces: 0, life: 12 });
  S5.rounds.push({ x: 3, y: 7, vx: 0, vy: -14, r: 0.12, dmg: 150, crit: false, bounces: 0, wallBounces: 0, hit: [] });
  V.Sim.api.lob(S5, { x: 3, y: 2.5, type: 'E-04' }, 3, 9, 0.5, 1.0, 70);
  var hp0 = S5.hero.hp;
  for (i = 0; i < 20; i++) V.Sim.step(S5, { mx: 0, my: 0 });
  var afterFlat = S5.hero.hp;
  for (i = 0; i < 20; i++) V.Sim.step(S5, { mx: 0, my: 0 });
  chk('pillar stops enemy flat shot and Operator round', S5.shots.length === 0 && afterFlat === hp0 && S5.enemies[0] && S5.enemies[0].hp === 1e6);
  chk('lobbed shell lands over cover and hurts', S5.hero.hp === hp0 - 70 && S5.shells.length === 0, 'hp ' + hp0 + ' -> ' + S5.hero.hp);
  // door
  var S6 = V.Sim.create(11, freshTune());
  S6.enemies.length = 0; S6.spawnQ.length = 0; V.Sim.step(S6, { mx: 0, my: 0 });
  var opened = S6.room.door.open && S6.phase === 'clear';
  for (i = 0; i < 600 && S6.stage === 1; i++) { V.Sim.step(S6, { mx: (4.5 - S6.hero.x), my: -1 }); if (S6.phase === 'pick') V.Sim.pick(S6, 0); }
  chk('door opens on clear and walking north loads the next stage', opened && S6.stage === 2 && S6.hero.y > 14 && S6.phase === 'play');
  // level-up -> 3 distinct cards
  var S7 = V.Sim.create(2, freshTune()); S7.hero.xp = 24; S7.pickups.push({ x: S7.hero.x, y: S7.hero.y, kind: 'xp', v: 4, life: 1e9 });
  S7.enemies.length = 0; S7.spawnQ.length = 0; for (i = 0; i < 120 && S7.phase !== 'pick'; i++) V.Sim.step(S7, { mx: 0, my: 0 });
  chk('level-up -> card screen at stage clear with CARDS_OFFERED (3) distinct field cards', S7.phase === 'pick' && S7.cards.length === 3 && new Set(S7.cards).size === 3 && S7.hero.level === 2 && S7.hero.xpNext === 35 &&
    S7.cards.every(function (c) { var m = V.CARDS[c]; return !m.pool || m.pool.indexOf('F') >= 0; }));
  // capped cards
  var S8 = V.Sim.create(2, freshTune());
  V.CARDS.forEach(function (m) { if (m.max) S8.hero.mods[m.key] = m.max; });
  var capOk = true; for (i = 0; i < 50; i++) { var o = V.Sim.offer(S8, 'F', 3); if (o.some(function (c) { return V.CARDS[c].max; })) capOk = false; }
  chk('capped cards are never offered (50 offers)', capOk);
  // invuln
  var S9 = V.Sim.create(2, freshTune()); S9.enemies.length = 0; S9.spawnQ.length = 0;
  for (i = 0; i < 3; i++) S9.shots.push({ x: S9.hero.x, y: S9.hero.y - 0.5, vx: 0, vy: 6, r: 0.15, dmg: 60, src: 'E-03', bounces: 0, life: 12 });
  for (i = 0; i < 10; i++) V.Sim.step(S9, { mx: 0, my: 0 });
  chk('3 simultaneous shots hit once (invuln 0.6 s)', S9.hero.hp === S9.hero.maxHp - 60, 'hp ' + S9.hero.hp);
  // supply stage
  var S10 = toStage(6, 5);
  chk('stage 5 = Supply Drop: phase supply with a mod + repair choice, no enemies', S10.phase === 'supply' && S10.stageKind === 'supply' && S10.supply.length === 2 && S10.supply.some(function (c) { return c.kind === 'repair'; }) && S10.supply.some(function (c) { return c.kind === 'mod'; }) && S10.enemies.length === 0);
  S10.hero.hp = 100; var ri = S10.supply.findIndex(function (c) { return c.kind === 'repair'; });
  V.Sim.pickSupply(S10, ri); V.Sim.step(S10, { mx: 0, my: 0 });
  chk('supply repair heals 40% max HP and opens the door', S10.hero.hp === 100 + Math.floor(S10.hero.maxHp * 0.4) && S10.room.door.open && S10.phase === 'clear' && S10.events.some(function (e) { return e.k === 'door'; }));
  // cache stage
  var S11 = toStage(6, 9);
  var hz = S11.hazards.length, chest0 = S11.chest && !S11.chest.open;
  S11.enemies.length = 0; S11.spawnQ.length = 0; S11.hero.hp = 300;
  var sawChest = false; for (i = 0; i < 200 && S11.phase !== 'pick'; i++) { V.Sim.step(S11, { mx: 0, my: 0 }); if (S11.events.some(function (e) { return e.k === 'chest'; })) sawChest = true; }
  chk('stage 9 = Cache: spikes, chest opens after clear -> free card screen + 2 repair packs', S11.stageKind === 'cache' && hz > 0 && chest0 && sawChest && S11.phase === 'pick' && S11.cards.length === 3 &&
    S11.stats.picks.length === 0, 'hazard rects ' + hz);
  V.Sim.pick(S11, 0); for (i = 0; i < 120; i++) V.Sim.step(S11, { mx: 0, my: 0 });
  chk('cache repair packs collected', S11.hero.hp > 300, 'hp ' + S11.hero.hp);
  // spikes: 1.0 s re-hit, ignores cover
  var S12 = toStage(6, 9); S12.enemies.length = 0; S12.spawnQ.length = 0;
  var sp = S12.hazards[0]; S12.hero.x = sp.x + 0.5; S12.hero.y = sp.y + 0.5; var h0 = S12.hero.hp, hurts = 0;
  S12.chest = null;
  for (i = 0; i < 125; i++) { if (S12.phase === 'pick') V.Sim.pick(S12, 0); V.Sim.step(S12, { mx: 0, my: 0 }); S12.hero.x = sp.x + 0.5; S12.hero.y = sp.y + 0.5; hurts += S12.events.filter(function (e) { return e.k === 'hurt' && e.src === 'spikes'; }).length; }
  chk('spikes hurt 60 (scaled) with a 1.0 s re-hit gap', hurts === 3 && h0 - S12.hero.hp === 3 * V.Sim.api.enemyDmg(S12, 60), hurts + ' hits in 2.08 s');
  // boss stage -> results win
  var S13 = toStage(6, 10);
  var bossOk = S13.stageKind === 'boss' && S13.boss && S13.enemies.some(function (e) { return e.boss; });
  var be = S13.enemies.filter(function (e) { return e.boss; })[0];
  if (be) { be.hp = 1; S13.rounds.push({ x: be.x, y: be.y + 2, vx: 0, vy: -14, r: 0.12, dmg: 999, crit: false, bounces: 0, wallBounces: 0, hit: [] }); }
  var sawWin = false; for (i = 0; i < 200 && S13.phase !== 'results'; i++) { V.Sim.step(S13, { mx: 0, my: 0 }); if (S13.events.some(function (e) { return e.k === 'win'; })) sawWin = true; }
  chk('stage 10 = boss B-01 (S.boss + enemy boss:true); boss kill -> results win', bossOk && S13.phase === 'results' && S13.result && S13.result.win && sawWin && S13.result.stage === 10);
  // death -> results lose
  var S14 = V.Sim.create(3, freshTune()); S14.hero.hp = 1; S14.shots.push({ x: S14.hero.x, y: S14.hero.y - 0.4, vx: 0, vy: 6, r: 0.15, dmg: 60, src: 'E-02', bounces: 0, life: 12 });
  var sawDeath = false; for (i = 0; i < 10 && S14.phase !== 'results'; i++) { V.Sim.step(S14, { mx: 0, my: 0 }); if (S14.events.some(function (e) { return e.k === 'death'; })) sawDeath = true; }
  chk('death -> phase results, win false, death event', S14.phase === 'results' && S14.result && !S14.result.win && sawDeath);
  // separation
  var worstH = 0, worstP = 0, stepsChecked = 0;
  ['naive', 'idle'].forEach(function (kind) {
    for (var sd = 1; sd <= 30; sd++) {
      var S = V.Sim.create(sd, freshTune()), B = { rng: new V.Rng(sd), hold: 0, cmd: { mx: 0, my: 0 }, hist: [] };
      for (var n = 0; n < 3000 && S.phase !== 'results'; n++) {
        if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
        if (S.phase === 'supply') { V.Sim.pickSupply(S, 0); continue; }
        V.Sim.step(S, INPUT[kind](S, B)); stepsChecked++;
        for (var a = 0; a < S.enemies.length; a++) {
          var e = S.enemies[a];
          var charging = e.st === 'act' && ((e.lungeLeft || 0) > 0 || (e.dashLeft || 0) > 0);
          if (!charging && !e.hidden) worstH = Math.max(worstH, e.r + 0.28 + 0.1 - Math.hypot(e.x - S.hero.x, e.y - S.hero.y));
          for (var b2 = a + 1; b2 < S.enemies.length; b2++) { var ff = S.enemies[b2]; worstP = Math.max(worstP, e.r + ff.r - Math.hypot(e.x - ff.x, e.y - ff.y)); }
        }
      }
    }
  });
  chk('no enemy body overlaps the Operator hurtbox outside lunges/charges (target gap 0.1; worst intrusion into the gap < 0.1)', worstH < 0.1, 'worst ' + worstH.toFixed(3) + ' over ' + stepsChecked + ' steps');
  chk('enemy bodies do not stack (worst pair overlap <= 0.05)', worstP <= 0.05, 'worst ' + worstP.toFixed(3));
  var S15 = V.Sim.create(2, freshTune()); S15.tune.MOVE_SPEED = 9; var x0 = S15.hero.x; V.Sim.step(S15, { mx: 1, my: 0 });
  chk('tune read live from S.tune', Math.abs(S15.hero.x - x0 - 9 / 60) < 1e-9);
  var S16 = V.Sim.restart(S15); chk('restart gives seed+1, same tune object, stage 1', S16.seed === 3 && S16.tune === S15.tune && S16.stage === 1 && S16.phase === 'play');
  var src = ['tune', 'rng', 'rooms', 'sim', 'ai-p0'].map(function (f) { return fs.readFileSync(path.join(__dirname, 'parts', f + '.js'), 'utf8'); }).join('\n');
  chk('no Math.random / Date in SIM-owned parts', !/Math\.random|Date\.now|new Date/.test(src));
  var src2 = loaded.filter(function (f) { return ['stages', 'mods', 'ai-p1', 'boss'].indexOf(f) >= 0; }).map(function (f) { return fs.readFileSync(path.join(__dirname, 'parts', f + '.js'), 'utf8'); }).join('\n');
  chk('no Math.random / Date in other sim-side parts (stages, mods, ai-p1, boss)', !/Math\.random|Date\.now|new Date/.test(src2));
})();
out('');

// 4) sweeps
var summary = [], skilledWorst = null;
['idle', 'naive', 'human', 'skilled'].forEach(function (kind) {
  var runs = [];
  for (var s = 1; s <= SEEDS; s++) runs.push(runOne(s, kind, MAX_STEPS));
  var wins = runs.filter(function (r) { return r.win; }), deaths = runs.filter(function (r) { return r.dead; }), tos = runs.filter(function (r) { return r.timeout; });
  var braced = runs.map(function (r) { return r.S.stats.playSteps ? 100 * r.S.stats.bracedSteps / r.S.stats.playSteps : 0; });
  var hitsBy = {}, dmg = 0;
  runs.forEach(function (r) { for (var k in r.S.stats.hitsBy) hitsBy[k] = (hitsBy[k] || 0) + r.S.stats.hitsBy[k]; dmg += r.S.stats.dmgTaken; });
  if (kind === 'skilled') { // fairness gate: a bot that reads the tells must never be hit 5+ times by one enemy type in one run
    var worst = {}; runs.forEach(function (r) { for (var k in r.S.stats.hitsBy) worst[k] = Math.max(worst[k] || 0, r.S.stats.hitsBy[k]); });
    skilledWorst = worst;
  }
  out('== Bot: ' + kind + ' (' + SEEDS + ' seeds) ==');
  out('chapter clear (boss killed): ' + wins.length + '/' + SEEDS + ' (' + (100 * wins.length / SEEDS).toFixed(1) + '%); died ' + deaths.length + '; timed out ' + tos.length);
  out('death stage: ' + (deaths.length ? 'median ' + pct(deaths.map(function (r) { return r.stage; }), 0.5) + ', p10 ' + pct(deaths.map(function (r) { return r.stage; }), 0.1) + ', p90 ' + pct(deaths.map(function (r) { return r.stage; }), 0.9) : '-') +
    '; deaths by stage: ' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (st) { return st + ':' + deaths.filter(function (r) { return r.stage === st; }).length; }).join(' '));
  var bt = wins.map(function (r) { return r.S.stats.bossTime; }).filter(function (v) { return v != null; });
  out('boss kill time (room start to kill): ' + (bt.length ? 'median ' + pct(bt, 0.5).toFixed(1) + ' s, p10 ' + pct(bt, 0.1).toFixed(1) + ', p90 ' + pct(bt, 0.9).toFixed(1) : '-') +
    '; run time to win median ' + (wins.length ? pct(wins.map(function (r) { return r.S.t; }), 0.5).toFixed(0) + ' s' : '-'));
  out('braced uptime: mean ' + f1(mean(braced)) + '%; mean level at end ' + f1(mean(runs.map(function (r) { return r.S.hero.level; }))) + ', mean cards ' + f1(mean(runs.map(function (r) { return r.picks; }))));
  out('hits taken by source (all runs): ' + Object.keys(hitsBy).sort().map(function (k) { return k + ' ' + hitsBy[k]; }).join(', ') + '; mean damage taken per run ' + f1(dmg / SEEDS));
  Object.keys(EN).forEach(function (ty) {
    var ka = [], la = [];
    runs.forEach(function (r) { r.kills.forEach(function (k) { if (k.type === ty) { ka.push(k.hits); la.push(k.life); } }); });
    if (ka.length) out('  ' + ty + ' kills ' + ka.length + ': hits to kill median ' + pct(ka, 0.5) + ' (mean ' + f1(mean(ka)) + '), time alive median ' + pct(la, 0.5).toFixed(2) + ' s, p90 ' + pct(la, 0.9).toFixed(2) + ' s');
  });
  out('  stage kind/room   | reached cleared died | HP at clear mean / p10 | HP leaving mean | clear time median s');
  V.Sim.stageList().forEach(function (sd) {
    var st = sd.stage;
    var reached = runs.filter(function (r) { return r.stage >= st; }).length;
    var cl = runs.filter(function (r) { return r.stage > st || (r.stage === st && r.win); }).length;
    var died = deaths.filter(function (r) { return r.stage === st; }).length;
    var hp = [], tm = [], hl = [];
    runs.forEach(function (r) {
      r.S.stats.roomHp.forEach(function (x) { if (x.stage === st && (!x.lap || x.lap === 1)) hp.push(x.hp); });
      r.S.stats.roomTimes.forEach(function (x) { if (x.stage === st) tm.push(x.s); });
      if (r.stageHp[st] != null) hl.push(r.stageHp[st]);
    });
    out('  ' + pad(st, 2) + ' ' + (sd.kind + '/' + sd.room + '          ').slice(0, 14) + ' | ' + pad(reached, 4) + ' ' + pad(cl, 4) + ' ' + pad(died, 4) + ' | ' + pad(f1(mean(hp)), 6) + ' / ' + pad(hp.length ? pct(hp, 0.1) : '-', 4) + ' | ' + pad(f1(mean(hl)), 6) + ' | ' + pad(tm.length ? pct(tm, 0.5).toFixed(1) : '-', 5));
  });
  out('');
  summary.push(kind + ': clear ' + wins.length + '/' + SEEDS + ', died ' + deaths.length + (deaths.length ? ' (median stage ' + pct(deaths.map(function (r) { return r.stage; }), 0.5) + ')' : '') +
    ', boss time median ' + (bt.length ? pct(bt, 0.5).toFixed(1) + ' s' : '-') + ', braced ' + f1(mean(braced)) + '%');
});
(function(){ var bad = [], w = skilledWorst || {}; for (var k in w) if (w[k] >= 5) bad.push(k + ' ' + w[k]);
  chk('fairness gate: skilled bot takes < 5 hits from any one enemy type in any single run', skilledWorst && !bad.length, 'worst per run ' + JSON.stringify(w)); })();
out('== Summary ==');
summary.forEach(out);
out('Rule checks failed: ' + nFail);
// 5) economy career (added 2026-11-10, P-PV-I): human bot plays a career of runs, banks credits, greedy spend, stats feed the next run.
// Runs LAST so the base sweeps above stay meta-neutral (meta.js is only loaded here; every career run passes metaStats explicitly).
// Deterministic: career c (1..CAREERS), run r uses seed 1000*c + r. No Math.random / Date (V.Meta.buy picks the random stat from the save itself).
(function economy() {
  var CAREERS = Math.min(SEEDS, 50), SHOW = 30, CAP = +process.argv[3] || 400, LONG = Math.min(CAREERS, 10);   // SHOW = runs in the main tables; the first LONG careers play on up to CAP runs (until maxed) for the time-to-max rows
  var mp = path.join(__dirname, 'parts', 'meta.js');
  if (!fs.existsSync(mp)) { out('== Economy (human bot career) == skipped: parts/meta.js missing'); return; }
  require(mp);
  var M = V.Meta, T = M.TUNING;
  function mock() { var d = {}; return { getItem: function (k) { return d[k] == null ? null : d[k]; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; }
  function statsCopy() { var x = M.stats(), o = {}; for (var k in x) o[k] = x[k]; return o; }
  function upgrades() { return (M.state.rifle.lvl - 1) + M.state.buys; }
  function maxed() { return M.state.rifle.lvl >= T.RIFLE_MAX && M.state.cond.hp >= T.COND_MAX && M.state.cond.atk >= T.COND_MAX && M.state.cond.rate >= T.COND_MAX; }
  function spendGreedy() { // cheapest of rifle / Conditioning first; if it cannot be afforded yet, save up (never skip to a dearer item)
    var n = 0;
    for (;;) {
      var cr = M.cost('rifle', 'rifle'), cc = M.cost('cond', 'rand');
      if (!cr && !cc) break;
      var kind = (cr && (!cc || cr.credits <= cc.credits)) ? 'rifle' : 'cond', c = kind === 'rifle' ? cr : cc;
      if (M.state.credits < c.credits) break;
      if (!(kind === 'rifle' ? M.buy('rifle', 'rifle') : M.buy('cond', 'rand'))) break;
      n++;
    }
    return n;
  }
  var recs = [], careers = [], timeouts = 0;
  for (var c = 1; c <= CAREERS; c++) {
    M.setStorage(mock()); M.load({ storage: mock(), fresh: true });
    var cr = { long: c <= LONG, runs: [], upAt: {}, maxAt: null, rifle10At: null, cond10At: null, power: {} };
    for (var r = 1; r <= (c <= LONG ? CAP : SHOW); r++) {
      var tot = M.totals();
      if (r <= SHOW || r % 10 === 0) cr.power[r] = { atk: tot.atk, hp: tot.maxHp, rate: tot.rate, ups: upgrades(), rifle: M.state.rifle.lvl };
      var res = runOne(1000 * c + r, 'human', MAX_STEPS, null, statsCopy());
      var cred = res.S.credits, st = res.stage;
      if (res.timeout) timeouts++;
      var rec = { c: c, r: r, win: res.win, stage: st, credits: cred, dead: res.dead };
      if (r <= SHOW) recs.push(rec);
      cr.runs.push(rec);
      M.state.credits += cred;   // bank (the sim's own award() is not used: it stamps Date.now into the run log)
      spendGreedy();
      var u = upgrades();
      [1, 5, 10].forEach(function (k) { if (u >= k && cr.upAt[k] == null) cr.upAt[k] = r; });
      if (cr.rifle10At == null && M.state.rifle.lvl >= T.RIFLE_MAX) cr.rifle10At = r;
      if (cr.cond10At == null && M.state.cond.hp >= T.COND_MAX && M.state.cond.atk >= T.COND_MAX && M.state.cond.rate >= T.COND_MAX) cr.cond10At = r;
      if (maxed()) { cr.maxAt = r; if (r >= SHOW) break; }
    }
    careers.push(cr);
  }
  function q(a) { return a.length ? 'median ' + pct(a, 0.5) + ', p10 ' + pct(a, 0.1) + ', p90 ' + pct(a, 0.9) : '-'; }
  function qa(a) { return a.length ? pct(a, 0.5) + ' / ' + pct(a, 0.1) + ' / ' + pct(a, 0.9) : '-'; }
  out('');
  out('== Economy: human bot career (' + CAREERS + ' careers, runs 1..' + SHOW + ' in the tables, seed = 1000*career + run) ==');
  out('Policy: after each run bank its credits, then buy greedily: the cheaper of rifle / Conditioning (random stat) first; if it cannot be afforded, save up.');
  out('Prices: rifle L(n)->L(n+1) = 250*n (n 1..9, total ' + (function () { var t = 0; for (var n = 1; n < T.RIFLE_MAX; n++) t += Math.round(T.RIFLE_REF_STEP * n * T.GEAR_MULT / 25) * 25; return t; })() + '); Conditioning ladder first 5 = ' +
    [0, 1, 2, 3, 4].map(function (i) { return Math.round(T.COND_REF[i] * T.COND_MULT / 25) * 25; }).join('/') + ', 30 buys total ' + T.COND_REF.reduce(function (s, v) { return s + Math.round(v * T.COND_MULT / 25) * 25; }, 0) + '. Income: combat 24, cache 95, boss 24 + 47.');
  out('Per upgrade: rifle +' + T.RIFLE_ATK_PER_LVL + ' ATK (x' + (1 + T.RIFLE_ATK_PER_LVL / T.HERO_ATK).toFixed(3) + ' at L2), Conditioning +' + T.COND_HP_PER_LVL + ' HP or +' + (100 * T.COND_ATK_PER_LVL) + '% ATK or +' + (100 * T.COND_RATE_PER_LVL) + '% fire rate. Timed-out runs (cap 20 min) in career: ' + timeouts + '.');
  out('');
  out('-- Credits per run (median / p10 / p90), career runs 1..' + SHOW + ' pooled, ' + recs.length + ' runs --');
  out('all runs: ' + qa(recs.map(function (x) { return x.credits; })));
  var W = recs.filter(function (x) { return x.win; }), L = recs.filter(function (x) { return !x.win; });
  out('wins   (n ' + W.length + '): ' + qa(W.map(function (x) { return x.credits; })));
  out('losses (n ' + L.length + '): ' + qa(L.map(function (x) { return x.credits; })));
  for (var st = 1; st <= 10; st++) {
    var D = L.filter(function (x) { return x.stage === st; });
    if (D.length) out('  died at stage ' + pad(st, 2) + ' (n ' + pad(D.length, 4) + '): ' + qa(D.map(function (x) { return x.credits; })));
  }
  out('');
  out('-- Runs until upgrade k (runs played incl. the run that earned it), per career: median / p10 / p90 [careers reaching it] --');
  [1, 5, 10].forEach(function (k) {
    var a = careers.filter(function (x) { return x.upAt[k] != null; }).map(function (x) { return x.upAt[k]; });
    out('upgrade ' + pad(k, 2) + ': ' + qa(a) + ' [' + a.length + '/' + careers.length + ']');
  });
  out('');
  out('-- Clear rate over the career, by run number (human bot, meta-powered) --');
  out('runs     | clear % | mean death stage | credits median/p10/p90 | mean upgrades at start');
  for (var b0 = 1; b0 <= SHOW; b0 += 5) {
    var blk = recs.filter(function (x) { return x.r >= b0 && x.r < b0 + 5; }), bw = blk.filter(function (x) { return x.win; }), bd = blk.filter(function (x) { return x.dead; });
    var ups = careers.map(function (x) { return x.power[b0] ? x.power[b0].ups : 0; });
    out(pad(b0, 2) + '-' + pad(Math.min(SHOW, b0 + 4), 2) + '    | ' + pad((100 * bw.length / blk.length).toFixed(1), 6) + '  | ' + pad(f1(mean(bd.map(function (x) { return x.stage; }))), 6) + '           | ' + pad(qa(blk.map(function (x) { return x.credits; })), 16) + '       | ' + f1(mean(ups)));
  }
  out('');
  out('-- Power growth (mean over careers, at the START of run n; base ATK ' + T.HERO_ATK + ', HP ' + T.HERO_HP + ', fire 1.00x) --');
  out('run | upgrades | rifle lvl | ATK  (x base) | max HP | fire rate');
  [1, 2, 3, 5, 8, 10, 15, 20, 25, 30].filter(function (n) { return n <= SHOW; }).forEach(function (n) {
    var P = careers.map(function (x) { return x.power[n]; }).filter(Boolean);
    out(pad(n, 3) + ' | ' + pad(f1(mean(P.map(function (x) { return x.ups; }))), 9) + ' | ' + pad(f1(mean(P.map(function (x) { return x.rifle; }))), 9) + ' | ' + pad(f1(mean(P.map(function (x) { return x.atk; }))), 5) + ' (x' + (mean(P.map(function (x) { return x.atk; })) / T.HERO_ATK).toFixed(2) + ') | ' + pad(f1(mean(P.map(function (x) { return x.hp; }))), 6) + ' | ' + mean(P.map(function (x) { return x.rate; })).toFixed(2) + 'x');
  });
  var fin = M.totals();
  out('fully maxed (rifle 10, all stats 10): ATK ' + Math.floor(T.HERO_ATK * (1 + 9 * T.RIFLE_ATK_PER_LVL / T.HERO_ATK) * (1 + 10 * T.COND_ATK_PER_LVL)) + ' (x' + ((1 + 9 * T.RIFLE_ATK_PER_LVL / T.HERO_ATK) * (1 + 10 * T.COND_ATK_PER_LVL)).toFixed(2) + '), max HP ' + (T.HERO_HP + 10 * T.COND_HP_PER_LVL) + ', fire ' + (1 + 10 * T.COND_RATE_PER_LVL).toFixed(2) + 'x (HP of the last career run now: ' + fin.maxHp + ').');
  out('');
  out('-- Time to max (runs played; first ' + LONG + ' careers only, cap ' + CAP + ' runs per career) --');
  [['rifle 10', 'rifle10At'], ['all Conditioning 10', 'cond10At'], ['everything maxed', 'maxAt']].forEach(function (p) {
    var a = careers.filter(function (x) { return x[p[1]] != null; }).map(function (x) { return x[p[1]]; });
    out(p[0] + ': ' + (a.length ? qa(a) + ' (median / p10 / p90)' : 'none') + ' [' + a.length + '/' + LONG + ' long careers reached it]');
  });
  var lateClear = []; careers.forEach(function (x) { x.runs.forEach(function (rr) { if (rr.r > SHOW) lateClear.push(rr.win ? 1 : 0); }); });
  out('clear rate in runs ' + (SHOW + 1) + '+ (up to maxed): ' + (lateClear.length ? (100 * mean(lateClear)).toFixed(1) + '% over ' + lateClear.length + ' runs' : 'n/a'));
})();
out('Run time ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
fs.writeFileSync(path.join(__dirname, 'BOT-RESULTS.txt'), lines.join('\n') + '\n');
