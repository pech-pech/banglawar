// Headless bot sweep for Project Volley P0. Usage: node bot.js [seeds=200] [maxMinutes=8]
// Loads the sim parts into globalThis.V and writes BOT-RESULTS.txt next to this file.
'use strict';
var path = require('path'), fs = require('fs');
globalThis.V = globalThis.V || {};
['tune', 'rng', 'rooms', 'sim'].forEach(function (f) { require(path.join(__dirname, 'parts', f + '.js')); });
var V = globalThis.V;

var SEEDS = +process.argv[2] || 200;
var MAX_MIN = +process.argv[3] || 10;
var MAX_STEPS = Math.round(MAX_MIN * 60 * 60);
var IDLE_STEPS = 40 * 3600; // idle runs until it dies (40 game minutes cap)
var HERO_WALL_R = 0.35, HURT = 0.28;

function freshTune() { var t = {}; for (var k in V.TUNE_DEFAULTS) t[k] = V.TUNE_DEFAULTS[k]; return t; }

// ---------- navigation (BFS on the tile grid to the door) ----------
function walkable(S, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= S.room.w || cy >= S.room.h) return false;
  var g = V.ROOMS[S.roomId].grid[cy][cx];
  return g !== '#';
}
function doorDir(S) {
  var h = S.hero, d = S.room.door, gx = d.x, gy = d.y;
  var sx = Math.max(0, Math.min(S.room.w - 1, Math.floor(h.x))), sy = Math.max(0, Math.min(S.room.h - 1, Math.floor(h.y)));
  if (sy <= 1 && sx === gx) return { mx: (gx + 0.5 - h.x) * 2, my: -1 };
  var W = S.room.w, prev = {}, q = [[gx, gy]], seen = {}; seen[gx + ',' + gy] = 1;
  while (q.length) {
    var c = q.shift();
    if (c[0] === sx && c[1] === sy) break;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
      var nx = c[0] + o[0], ny = c[1] + o[1], key = nx + ',' + ny;
      if (seen[key] || !walkable(S, nx, ny)) return;
      seen[key] = 1; prev[key] = c; q.push([nx, ny]);
    });
  }
  var nxt = prev[sx + ',' + sy] || [gx, gy];
  var tx = nxt[0] + 0.5, ty = nxt[1] + 0.5;
  // aim for the centre of our own tile first if we are far off its axis, to avoid corner snags
  var ox = Math.abs(h.x - (sx + 0.5)), oy = Math.abs(h.y - (sy + 0.5));
  if (nxt[0] !== sx && oy > 0.2) { tx = sx + 0.5; ty = sy + 0.5; }
  if (nxt[1] !== sy && ox > 0.2) { tx = sx + 0.5; ty = sy + 0.5; }
  if (Math.abs(tx - h.x) + Math.abs(ty - h.y) < 0.05) { tx = nxt[0] + 0.5; ty = nxt[1] + 0.5; }
  return { mx: tx - h.x, my: ty - h.y };
}

// ---------- skilled threat model ----------
function solidAt(S, x, y, r) {
  if (x < r || x > S.room.w - r || y < r || y > S.room.h - r) return true;
  var a = S.room.solids.concat(S.room.door.open ? [] : [S.room.door]);
  for (var i = 0; i < a.length; i++) {
    var b = a[i], nx = Math.max(b.x, Math.min(x, b.x + b.w)), ny = Math.max(b.y, Math.min(y, b.y + b.h));
    if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return true;
  }
  return false;
}
// virtual projectiles: [x,y,vx,vy,r,t0,life]
function threats(S) {
  var out = [], i, h = S.hero, t = S.tune;
  for (i = 0; i < S.shots.length; i++) { var s = S.shots[i]; out.push([s.x, s.y, s.vx, s.vy, s.r, 0, 3]); }
  for (i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i];
    if (e.type === 'E-02' && e.st === 'tell') {
      var sp = 6 * t.ENEMY_SHOT_SPEED_MULT; out.push([e.x, e.y, Math.cos(e.aimAng) * sp, Math.sin(e.aimAng) * sp, 0.15, e.stT, 3]);
    } else if (e.type === 'E-03' && e.st === 'tell') {
      var sp3 = 5 * t.ENEMY_SHOT_SPEED_MULT;
      for (var k = -1; k <= 1; k++) { var a = e.aimAng + k * 25 * Math.PI / 180; out.push([e.x, e.y, Math.cos(a) * sp3, Math.sin(a) * sp3, 0.15, e.stT, 3]); }
    } else if (e.type === 'E-01' && e.st === 'act') {
      out.push([e.x, e.y, e.vx * 6, e.vy * 6, e.r, 0, e.lungeLeft / 6]);
    } else if (e.type === 'E-01' && e.st === 'tell') {
      var a1 = Math.atan2(h.y - e.y, h.x - e.x);
      out.push([e.x, e.y, Math.cos(a1) * 6, Math.sin(a1) * 6, e.r, e.stT, 0.5]);
    }
  }
  return out;
}
function dangerOf(S, th, px, py, dx, dy, moveT) {
  var d = 0, sp = S.tune.MOVE_SPEED;
  for (var i = 0; i < th.length; i++) {
    var p = th[i];
    for (var tau = 0; tau <= 0.9; tau += 0.05) {
      var lt = tau - p[5]; if (lt < 0) continue; if (lt > p[6]) break;
      var sx = p[0] + p[2] * lt, sy = p[1] + p[3] * lt;
      if (lt > 0 && solidAt(S, sx, sy, 0.01) && !(sx < 0 || sx > 9 || sy < 0 || sy > 15)) break;
      var m = Math.min(tau, moveT), hx = px + dx * sp * m, hy = py + dy * sp * m;
      var rr = p[4] + HURT + 0.22;
      var q = (sx - hx) * (sx - hx) + (sy - hy) * (sy - hy);
      if (q < rr * rr) { d += 10 * (1.2 - tau); break; }
    }
  }
  return d;
}
function skilledInput(S, B) {
  var h = S.hero, t = S.tune;
  if (S.phase === 'clear') { return S.pickups.some(function (p) { return p.kind === 'xp'; }) && S.clearT < 0.6 ? { mx: 0, my: 0 } : doorDir(S); }
  if (B.hold > 0) { B.hold--; return B.cmd; }
  var th = threats(S), best = null, bestC = 1e9, N = 16, sp = t.MOVE_SPEED, moveT = 0.22;
  for (var i = -1; i < N; i++) {
    var dx = 0, dy = 0;
    if (i >= 0) { var a = i / N * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
    var ex = h.x + dx * sp * moveT, ey = h.y + dy * sp * moveT;
    if (i >= 0 && solidAt(S, ex, ey, HERO_WALL_R)) continue;
    var c = dangerOf(S, th, h.x, h.y, dx, dy, moveT);
    // chasers: keep distance, they lunge from 2.5
    var nearest = 1e9, anyLine = false;
    for (var j = 0; j < S.enemies.length; j++) {
      var e = S.enemies[j];
      var de = Math.hypot(e.x - ex, e.y - ey);
      if (e.st !== 'spawn' && V.Sim.clearLine(S, ex, ey, e.x, e.y, t.ROUND_R)) anyLine = true;
      if (e.type === 'E-01' && e.st !== 'spawn') {
        var want = e.st === 'cool' ? 1.3 : 3.0;
        if (de < want) c += (want - de) * 2.2;
      } else if (de < 1.4) c += (1.4 - de) * 2;
      if (de < nearest) nearest = de;
    }
    if (!anyLine) c += 1.5;
    if (i >= 0) c += 0.6; // prefer standing still (brace and shoot)
    var wall = Math.min(ex, 9 - ex, ey - 1, 15 - ey);
    if (wall < 0.9) c += (0.9 - wall) * 0.8;
    if (c < bestC) { bestC = c; best = { mx: dx, my: dy }; }
  }
  B.cmd = best || { mx: 0, my: 0 };
  B.hold = (B.cmd.mx || B.cmd.my) ? 5 : 2;
  return B.cmd;
}
function naiveInput(S, B) {
  if (S.phase === 'clear') return doorDir(S);
  if (B.hold > 0) { B.hold--; return B.cmd; }
  if (B.rng.next() < 0.55) { B.cmd = { mx: 0, my: 0 }; B.hold = Math.round(B.rng.range(0.4, 1.4) * 60); }
  else { var a = B.rng.next() * Math.PI * 2; B.cmd = { mx: Math.cos(a), my: Math.sin(a) }; B.hold = Math.round(B.rng.range(0.2, 0.8) * 60); }
  return B.cmd;
}
function idleInput(S, B) { return S.phase === 'clear' ? doorDir(S) : { mx: 0, my: 0 }; }
function standInput() { return { mx: 0, my: 0 }; }

var PREF = ['rate', 'atk', 'multi', 'front', 'rico', 'diag'];
function chooseCard(S, kind, B) {
  if (kind === 'skilled') {
    var bi = 0, br = 99;
    S.cards.forEach(function (ci, i) { var r = PREF.indexOf(V.CARDS[ci].key); if (r < br) { br = r; bi = i; } });
    return bi;
  }
  if (kind === 'naive') return B.rng.int(S.cards.length);
  return 0;
}

// ---------- run one ----------
function runOne(seed, kind, maxSteps) {
  var S = V.Sim.create(seed, freshTune());
  var B = { rng: new V.Rng(seed * 7919 + 13), hold: 0, cmd: { mx: 0, my: 0 } };
  var input = kind === 'skilled' ? skilledInput : kind === 'naive' ? naiveInput : kind === 'stand' ? standInput : idleInput;
  var hits = {}, alive = {}, kills = [], steps = 0, picks = 0, lastStage = 1, stallT = 0;
  while (steps < maxSteps) {
    if (S.phase === 'dead') break;
    if (S.phase === 'pick') { V.Sim.pick(S, chooseCard(S, kind, B)); picks++; continue; }
    V.Sim.step(S, input(S, B));
    steps++;
    for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (e.st !== 'spawn' && alive[e.id] == null) alive[e.id] = S.t; }
    for (var j = 0; j < S.events.length; j++) {
      var ev = S.events[j];
      if (ev.k === 'hit') hits[ev.id] = (hits[ev.id] || 0) + 1;
      else if (ev.k === 'kill') kills.push({ type: ev.type, stage: S.stage, hits: hits[ev.id] || 0, life: S.t - (alive[ev.id] != null ? alive[ev.id] : S.t) });
    }
  }
  return { seed: seed, kind: kind, S: S, steps: steps, dead: S.phase === 'dead', stage: S.stage,
    cleared: S.stats.roomTimes.length, kills: kills, picks: picks };
}

// ---------- sweep ----------
function pct(a, p) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; }
function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : NaN; }
function f1(v) { return isNaN(v) ? '-' : v.toFixed(1); }
function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

var lines = [];
function out(s) { console.log(s); lines.push(s); }

var t0 = Date.now();
out('Project Volley P0 headless bot results');
out('Date: 2026-11-10 (script run ' + new Date().toISOString() + ')');
out('Seeds: ' + SEEDS + ' per bot (seeds 1..' + SEEDS + '), cap ' + MAX_MIN + ' game minutes per run (idle 40, stand 2), fixed step 1/60, default TUNE.');
out('Bots: stand = never moves at all (stays at spawn, never opens a door); idle = never moves in combat, walks to the door when clear, takes card 0;');
out('      naive = random walk / random stops, random card; skilled = samples 16 moves + stand every 0.1 s against predicted shots, lunges and tells, kites chasers, prefers standing still.');
out('');

// 1) shots-to-kill check (formula)
var T = freshTune(), EN = V.Sim.ENEMIES;
out('== Shots to kill at stage 1, fresh hero (formula, no crit) vs D1 targets ==');
var targets = { 'E-01': 2, 'E-02': 3, 'E-03': null };
Object.keys(EN).forEach(function (k) {
  var hp = Math.round(EN[k].hp * T.ENEMY_HP_GLOBAL), sh = Math.ceil(hp / T.HERO_ATK);
  out(k + ': HP ' + hp + ', ATK ' + T.HERO_ATK + ' -> ' + sh + ' shots' + (targets[k] ? ' (D1 target ' + targets[k] + ': ' + (sh === targets[k] ? 'PASS' : 'FAIL') + ')' : ' (no D1 target)'));
});
[4, 10, 20].forEach(function (st) {
  var row = 'stage ' + st + ':';
  Object.keys(EN).forEach(function (k) { var hp = Math.round(EN[k].hp * T.ENEMY_HP_GLOBAL * (1 + T.HP_SLOPE * (st - 1))); row += ' ' + k + ' HP ' + hp + ' = ' + Math.ceil(hp / T.HERO_ATK) + ' shots;'; });
  out(row + ' (fresh ATK, no cards)');
});
out('');

// 2) determinism
out('== Determinism (same seed twice, 3000 steps, hash after) ==');
['skilled', 'naive'].forEach(function (kind) {
  [7, 1234].forEach(function (seed) {
    var hs = [0, 1].map(function () { var r = runOne(seed, kind, 3000); return V.Sim.hash(r.S) + '@' + r.S.frame; });
    out(kind + ' seed ' + seed + ': ' + hs[0] + ' / ' + hs[1] + ' -> ' + (hs[0] === hs[1] ? 'PASS' : 'FAIL'));
  });
});
var hA = V.Sim.hash(runOne(7, 'skilled', 3000).S), hB = V.Sim.hash(runOne(8, 'skilled', 3000).S);
out('different seeds 7 vs 8 differ: ' + (hA !== hB ? 'PASS' : 'FAIL') + ' (' + hA + ' vs ' + hB + ')');
out('');

// 2b) rule checks (scripted)
out('== Rule checks ==');
function chk(name, ok, info) { out((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' (' + info + ')' : '')); }
(function () {
  // brace delay: move 30 frames, stop, count frames to first fire
  var S = V.Sim.create(5, freshTune()), i, f = -1;
  for (i = 0; i < 60; i++) V.Sim.step(S, { mx: 0, my: 0 }); // spawn wait, shots happen
  var S2 = V.Sim.create(5, freshTune());
  for (i = 0; i < 40; i++) V.Sim.step(S2, { mx: 1, my: 0 });
  for (i = 1; i <= 120; i++) { V.Sim.step(S2, { mx: 0, my: 0 }); if (S2.events.some(function (e) { return e.k === 'fire'; })) { f = i; break; } }
  chk('brace delay: first shot ' + f + ' frames after stopping (0.15 s = 9 frames)', f === 9 || f === 10, 'cooldown was ready');
  // fire cooldown keeps ticking while moving
  var S3 = V.Sim.create(5, freshTune()), fired = 0;
  for (i = 0; i < 300 && !fired; i++) { V.Sim.step(S3, { mx: 0, my: 0 }); if (S3.events.some(function (e) { return e.k === 'fire'; })) fired = 1; }
  var cd0 = S3.hero.fireCd; V.Sim.step(S3, { mx: -1, my: 0 }); V.Sim.step(S3, { mx: -1, my: 0 });
  chk('fire cooldown counts down while moving', S3.hero.fireCd < cd0 && S3.hero.braced === false && S3.hero.lockId === null, cd0.toFixed(3) + ' -> ' + S3.hero.fireCd.toFixed(3));
  // minimum gap between volleys = fire interval even with stop/go tapping
  var S4 = V.Sim.create(9, freshTune()), last = -1, minGap = 1e9;
  for (i = 0; i < 600; i++) { V.Sim.step(S4, (i % 12) < 2 ? { mx: 0, my: 1 } : { mx: 0, my: 0 }); if (S4.events.some(function (e) { return e.k === 'fire'; })) { if (last >= 0) minGap = Math.min(minGap, S4.t - last); last = S4.t; } if (S4.phase !== 'play') break; }
  chk('stop/go tapping cannot beat the fire interval', minGap >= freshTune().FIRE_INTERVAL - 1e-6, 'min gap ' + minGap.toFixed(3) + ' s');
  // cover stops enemy shots and Operator rounds
  var S5 = V.Sim.create(3, freshTune());
  while (S5.roomId !== 'R02') { S5.enemies.length = 0; V.Sim.step(S5, { mx: 0, my: 0 }); if (S5.phase === 'pick') V.Sim.pick(S5, 0); S5.hero.x = 4.5; S5.hero.y = 1.2; V.Sim.step(S5, { mx: 0, my: -1 }); if (S5.phase === 'pick') V.Sim.pick(S5, 0); }
  S5.shots.push({ x: 3, y: 2.5, vx: 0, vy: 6, r: 0.15, dmg: 60, src: 'E-02' });
  S5.rounds.push({ x: 3, y: 7, vx: 0, vy: -14, r: 0.12, dmg: 150, crit: false, bounces: 0, hit: [] });
  for (i = 0; i < 60; i++) V.Sim.step(S5, { mx: 0, my: 0 });
  chk('pillar stops enemy flat shot and Operator round', S5.shots.length === 0 && S5.rounds.filter(function (r) { return r.x === 3; }).length === 0 && S5.hero.hp === S5.hero.maxHp);
  chk('lock line blocked by pillar', !V.Sim.clearLine(S5, 3, 7, 3, 2.5, 0.12) && V.Sim.clearLine(S5, 4.5, 7, 4.5, 2.5, 0.12));
  // door: clear opens it, walking in loads the next room
  var S6 = V.Sim.create(11, freshTune());
  S6.enemies.length = 0; V.Sim.step(S6, { mx: 0, my: 0 });
  var opened = S6.room.door.open && S6.phase === 'clear';
  for (i = 0; i < 600 && S6.stage === 1; i++) { V.Sim.step(S6, { mx: (4.5 - S6.hero.x), my: -1 }); if (S6.phase === 'pick') V.Sim.pick(S6, 0); }
  chk('door opens on clear and walking north loads the next room', opened && S6.stage === 2 && S6.roomId === 'R02' && S6.hero.y > 14 && S6.phase === 'play');
  // xp curve and pick screen count
  var T2 = freshTune(); T2.CARDS_OFFERED = 3;
  var S7 = V.Sim.create(2, T2); S7.hero.xp = 24; S7.pickups.push({ x: S7.hero.x, y: S7.hero.y, kind: 'xp', v: 4, life: 1e9 });
  S7.enemies.length = 0; for (i = 0; i < 120 && S7.phase !== 'pick'; i++) V.Sim.step(S7, { mx: 0, my: 0 });
  chk('level-up pending -> pick screen at stage clear with CARDS_OFFERED distinct cards', S7.phase === 'pick' && S7.cards.length === 3 && new Set(S7.cards).size === 3 && S7.hero.level === 2 && S7.hero.xpNext === 35);
  // capped cards leave the pool
  var S8 = V.Sim.create(2, T2); S8.hero.mods.front = 1; S8.hero.mods.rico = 1; S8.hero.mods.multi = 3; S8.hero.mods.diag = 3; S8.pendingLevels = 1; S8.enemies.length = 0;
  for (i = 0; i < 120 && S8.phase !== 'pick'; i++) V.Sim.step(S8, { mx: 0, my: 0 });
  chk('capped cards are not offered', S8.cards.length === 2 && S8.cards.every(function (c) { return ['atk', 'rate'].indexOf(V.CARDS[c].key) >= 0; }));
  // invulnerability
  var S9 = V.Sim.create(2, freshTune()); S9.enemies.length = 0;
  for (i = 0; i < 3; i++) S9.shots.push({ x: S9.hero.x, y: S9.hero.y - 0.5, vx: 0, vy: 6, r: 0.15, dmg: 60, src: 'E-03' });
  for (i = 0; i < 10; i++) V.Sim.step(S9, { mx: 0, my: 0 });
  chk('3 simultaneous shots hit once (invuln 0.6 s)', S9.hero.hp === S9.hero.maxHp - 60, 'hp ' + S9.hero.hp);
  // tune is read live
  var S10 = V.Sim.create(2, freshTune()); S10.tune.MOVE_SPEED = 9; var x0 = S10.hero.x; V.Sim.step(S10, { mx: 1, my: 0 });
  chk('tune read live from S.tune', Math.abs(S10.hero.x - x0 - 9 / 60) < 1e-9);
  // restart
  var S11 = V.Sim.restart(S10); chk('restart gives seed+1, same tune object', S11.seed === 3 && S11.tune === S10.tune && S11.stage === 1);
  // separation: no enemy body on the Operator (outside lunges), no stacked enemies
  var worstH = 0, worstP = 0, stepsChecked = 0;
  ['naive', 'idle'].forEach(function (kind) {
    for (var sd = 1; sd <= 30; sd++) {
      var S = V.Sim.create(sd, freshTune()), B = { rng: new V.Rng(sd), hold: 0, cmd: { mx: 0, my: 0 } };
      for (var n = 0; n < 3000 && S.phase !== 'dead'; n++) {
        if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
        V.Sim.step(S, kind === 'naive' ? naiveInput(S, B) : idleInput(S, B)); stepsChecked++;
        for (var a = 0; a < S.enemies.length; a++) {
          var e = S.enemies[a];
          if (e.st !== 'act') worstH = Math.max(worstH, e.r + 0.28 + 0.1 - Math.hypot(e.x - S.hero.x, e.y - S.hero.y));
          for (var b2 = a + 1; b2 < S.enemies.length; b2++) { var f = S.enemies[b2]; worstP = Math.max(worstP, e.r + f.r - Math.hypot(e.x - f.x, e.y - f.y)); }
        }
      }
    }
  });
  chk('enemies keep a 0.1 gap from the Operator outside lunges (worst intrusion into the gap <= 0.05)', worstH <= 0.05, 'worst ' + worstH.toFixed(3) + ' over ' + stepsChecked + ' steps');
  chk('enemy bodies do not stack (worst pair overlap <= 0.05)', worstP <= 0.05, 'worst ' + worstP.toFixed(3));
  // no Math.random / Date in the sim parts
  var src = ['tune', 'rng', 'rooms', 'sim'].map(function (f) { return fs.readFileSync(path.join(__dirname, 'parts', f + '.js'), 'utf8'); }).join('\n');
  chk('no Math.random / Date in sim parts', !/Math\.random|Date\.now|new Date/.test(src));
})();
out('');

// 3) sweeps
var summary = [];
['stand', 'idle', 'naive', 'skilled'].forEach(function (kind) {
  var runs = [];
  var cap = kind === 'idle' ? IDLE_STEPS : kind === 'stand' ? 2 * 3600 : MAX_STEPS;
  for (var s = 1; s <= SEEDS; s++) runs.push(runOne(s, kind, cap));
  var deaths = runs.filter(function (r) { return r.dead; });
  var cleared = runs.map(function (r) { return r.cleared; });
  var braced = runs.map(function (r) { return r.S.stats.playSteps ? 100 * r.S.stats.bracedSteps / r.S.stats.playSteps : 0; });
  var hitsBy = { 'E-01': 0, 'E-02': 0, 'E-03': 0 }, dmg = 0;
  runs.forEach(function (r) { for (var k in r.S.stats.hitsBy) hitsBy[k] += r.S.stats.hitsBy[k]; dmg += r.S.stats.dmgTaken; });
  out('== Bot: ' + kind + ' (' + SEEDS + ' seeds) ==');
  out('died: ' + deaths.length + '/' + SEEDS + ' (' + (100 * deaths.length / SEEDS).toFixed(1) + '%); timed out alive: ' + (SEEDS - deaths.length));
  out('rooms cleared: mean ' + f1(mean(cleared)) + ', p10 ' + pct(cleared, 0.1) + ', median ' + pct(cleared, 0.5) + ', p90 ' + pct(cleared, 0.9) + ', max ' + Math.max.apply(null, cleared) +
    '  (loops of 3 rooms, median: ' + f1(pct(cleared, 0.5) / 3) + ')');
  out('death stage: median ' + (deaths.length ? pct(deaths.map(function (r) { return r.stage; }), 0.5) : '-') + ', p10 ' + (deaths.length ? pct(deaths.map(function (r) { return r.stage; }), 0.1) : '-') +
    ', p90 ' + (deaths.length ? pct(deaths.map(function (r) { return r.stage; }), 0.9) : '-'));
  out('braced uptime (braced steps / play steps): mean ' + f1(mean(braced)) + '%');
  out('hits taken by source (all runs): E-01 ' + hitsBy['E-01'] + ', E-02 ' + hitsBy['E-02'] + ', E-03 ' + hitsBy['E-03'] + '; mean damage taken per run ' + f1(dmg / SEEDS));
  out('mean level reached: ' + f1(mean(runs.map(function (r) { return r.S.hero.level; }))) + ', mean cards picked ' + f1(mean(runs.map(function (r) { return r.picks; }))));
  // kills per type at stage 1 (and all)
  ['E-01', 'E-02', 'E-03'].forEach(function (ty) {
    var k1 = [], ka = [], l1 = [];
    runs.forEach(function (r) { r.kills.forEach(function (k) { if (k.type !== ty) return; ka.push(k.hits); if (k.stage <= 3) { k1.push(k.hits); l1.push(k.life); } }); });
    out('  ' + ty + ' kills: ' + ka.length + '; first loop (stages 1-3): hits to kill mean ' + f1(mean(k1)) + ' median ' + (k1.length ? pct(k1, 0.5) : '-') +
      ', time alive (targetable to kill) median ' + (l1.length ? pct(l1, 0.5).toFixed(2) : '-') + ' s, p90 ' + (l1.length ? pct(l1, 0.9).toFixed(2) : '-') + ' s');
  });
  // per stage table
  var maxSt = Math.max.apply(null, runs.map(function (r) { return r.stage; }));
  out('  per stage: stage room | reached cleared died | HP at clear mean/p10 | clear time median s');
  for (var st = 1; st <= Math.min(maxSt, 40); st++) {
    var reached = runs.filter(function (r) { return r.stage >= st; }).length;
    var cl = runs.filter(function (r) { return r.cleared >= st; });
    var died = runs.filter(function (r) { return r.dead && r.stage === st; }).length;
    var hp = [], tm = [];
    runs.forEach(function (r) { r.S.stats.roomHp.forEach(function (x) { if (x.stage === st) hp.push(x.hp); }); r.S.stats.roomTimes.forEach(function (x) { if (x.stage === st) tm.push(x.s); }); });
    out('  ' + pad(st, 3) + ' ' + V.ROOM_ORDER[(st - 1) % 3] + ' | ' + pad(reached, 4) + ' ' + pad(cl.length, 4) + ' ' + pad(died, 4) + ' | ' + pad(f1(mean(hp)), 6) + ' / ' + pad(hp.length ? pct(hp, 0.1) : '-', 4) + ' | ' + pad(tm.length ? pct(tm, 0.5).toFixed(1) : '-', 5));
  }
  if (maxSt > 40) out('  (stages above 40 omitted from the table; max stage ' + maxSt + ')');
  out('');
  summary.push(kind + ': died ' + deaths.length + '/' + SEEDS + ', median rooms cleared ' + pct(cleared, 0.5) + ', braced ' + f1(mean(braced)) + '%');
});

out('== Summary ==');
summary.forEach(out);
var idleLine = summary[1];
out('Idle must die: ' + (/died (\d+)\//.exec(idleLine)[1] === String(SEEDS) ? 'PASS (all idle runs die)' : 'CHECK: ' + idleLine));
out('Run time ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
fs.writeFileSync(path.join(__dirname, 'BOT-RESULTS.txt'), lines.join('\n') + '\n');
