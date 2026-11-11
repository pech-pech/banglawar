// Headless bot sweep for Project Volley P1 (chapter 1, stages 1-10). Usage: node bot.js [seeds=200] [careerCap=400] [--cols=9|11|13|15]
// --walk=2 sends inp.walk = 2 during the clear phase (pick 45 door auto-walk). --cols=N (or env VOLLEY_COLS=N) passes opts.cols to every V.Sim.create in the base sweeps (R42 column classes), adds the
// corner bot and a per-stage class table, and writes BOT-RESULTS-C<N>.txt instead of BOT-RESULTS.txt. Without it the output is unchanged.
// require('./bot.js') does not run the sweep: it exports runOne and the bots (src/sim/classes.js uses them).
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
// R42 column classes: parts/widen.js (sim.js also pulls it in under Node). Kept out of `loaded` so the default output stays as it was.
(function () { var p = path.join(__dirname, 'parts', 'widen.js'); if (!globalThis.V.Widen && fs.existsSync(p)) require(p); })();
var V = globalThis.V;

var ARGV = process.argv.slice(2).filter(function (a) { return a.slice(0, 2) !== '--'; });
var FLAGS = {}; process.argv.slice(2).forEach(function (a) { var m = /^--([^=]+)(?:=(.*))?$/.exec(a); if (m) FLAGS[m[1]] = m[2] == null ? true : m[2]; });
var COLS = FLAGS.cols != null ? +FLAGS.cols : (process.env.VOLLEY_COLS ? +process.env.VOLLEY_COLS : null);   // null = old behaviour (no opts passed)
function setCols(c) { COLS = c == null ? null : +c; }
var WALK = FLAGS.walk != null ? +FLAGS.walk : null;   // pick 45: inp.walk during the clear phase (main.js sends 2); null = not sent
function setWalk(w) { WALK = w == null ? null : +w; }
var SEEDS = +ARGV[0] || 200;
var MAX_STEPS = 20 * 3600;   // 20 game minutes cap per run (a run is 10 stages)
var HERO_WALL_R = 0.35, HURT = 0.28;
var DEG = Math.PI / 180;

function freshTune() { var t = {}; for (var k in V.TUNE_DEFAULTS) t[k] = V.TUNE_DEFAULTS[k]; return t; }
function grid(S) { return (S.room && S.room.grid) || V.ROOMS[S.roomId].grid; }

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
      if (p[7] && lt > 0 && solidAt(S, sx, sy, 0.01) && !(sx < 0 || sx > S.room.w || sy < 0 || sy > S.room.h)) break;
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
    var wall = Math.min(ex, S.room.w - ex, ey - 1, S.room.h - ey);
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
// corner: in combat walks to a bottom corner (left on odd seeds, right on even) and camps there; walks to the door when clear.
function cornerInput(S, B) {
  if (S.phase === 'clear') return doorDir(S);
  var h = S.hero, W = S.room.w, H = S.room.h, gx = B.side < 0 ? 0 : W - 1, gy = H - 1;
  var tx = B.side < 0 ? 0.4 : W - 0.4, ty = H - 0.4;
  if (Math.floor(h.x) === gx && Math.floor(h.y) === gy) { var dx = tx - h.x, dy = ty - h.y; return Math.abs(dx) + Math.abs(dy) < 0.03 ? { mx: 0, my: 0 } : { mx: dx, my: dy }; }
  return bfsDir(S, gx, gy, true) || bfsDir(S, gx, gy, false) || { mx: tx - h.x, my: ty - h.y };
}

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
  if (kind === 'idle' || kind === 'corner') return 0;
  return (ri >= 0 && S.hero.hp < 0.6 * S.hero.maxHp) ? ri : (ri === 0 ? 1 % S.supply.length : 0);
}

// ---------- run one ----------
var INPUT = { idle: idleInput, naive: naiveInput, skilled: skilledInput, human: humanInput, corner: cornerInput };
function simOpts(metaStats) { var o = null; if (metaStats) o = { metaStats: metaStats }; if (COLS != null) { o = o || {}; o.cols = COLS; } return o; }
function runOne(seed, kind, maxSteps, tune, metaStats) {
  var o = simOpts(metaStats);
  var S = o ? V.Sim.create(seed, tune || freshTune(), o) : V.Sim.create(seed, tune || freshTune());
  var B = { rng: new V.Rng(seed * 7919 + 13), hold: 0, cmd: { mx: 0, my: 0 }, hist: [], side: seed % 2 ? -1 : 1 };
  var input = INPUT[kind];
  var hits = {}, alive = {}, kills = [], steps = 0, picks = 0, stageHp = {}, bossDmg = 0, colsSeen = {};
  while (steps < maxSteps) {
    if (S.phase === 'results') break;
    if (S.phase === 'pick') { V.Sim.pick(S, chooseCard(S, kind, B)); picks++; continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, chooseSupply(S, kind, B)); continue; }
    var st0 = S.stage;
    var inp = input(S, B);
    if (WALK != null && S.phase === 'clear') inp = { mx: inp.mx, my: inp.my, walk: WALK };
    V.Sim.step(S, inp);
    steps++;
    for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (e.st !== 'spawn' && alive[e.id] == null) alive[e.id] = S.t; }
    for (var j = 0; j < S.events.length; j++) {
      var ev = S.events[j];
      if (ev.k === 'hit') hits[ev.id] = (hits[ev.id] || 0) + 1;
      else if (ev.k === 'kill') kills.push({ type: ev.type, stage: S.stage, hits: hits[ev.id] || 0, life: S.t - (alive[ev.id] != null ? alive[ev.id] : S.t) });
      else if (ev.k === 'hurt' && S.stageKind === 'boss') bossDmg += ev.dmg || 0;
    }
    colsSeen[S.room.w] = 1;
    if (S.stage !== st0) stageHp[st0] = S.hero.hp; // HP on leaving the stage (after pickups)
  }
  var R = S.result;
  return { seed: seed, kind: kind, S: S, steps: steps, win: !!(R && R.win), dead: !!(R && !R.win), timeout: !R,
    stage: S.stage, cleared: S.stats.roomTimes.length, kills: kills, picks: picks, stageHp: stageHp, bossDmg: bossDmg,
    cols: Object.keys(colsSeen).map(Number) };
}

// ---------- report helpers ----------
function pct(a, p) { if (!a.length) return NaN; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; }
function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : NaN; }
function f1(v) { return (v == null || isNaN(v)) ? '-' : v.toFixed(1); }
function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }
var lines = [];
function out(s) { console.log(s); lines.push(s); }

// corner bot on the boss alone: jump to stage 10 (force-clear, walk through the door), camp the corner until the run ends or CB_SECS (60 s, guess).
function toStageC(seed, n) {
  var o = simOpts(null), S = o ? V.Sim.create(seed, freshTune(), o) : V.Sim.create(seed, freshTune()), g = 0;
  while (S.stage < n && g++ < 20000) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, 1); continue; }
    if (S.phase === 'play') { S.enemies.length = 0; S.spawnQ.length = 0; }
    V.Sim.step(S, { mx: 0, my: 0 });
    if (S.phase === 'clear') { S.hero.x = S.room.door.x + 0.5; S.hero.y = 1.3; V.Sim.step(S, { mx: 0, my: -1 }); }
  }
  return S;
}
var CB_SECS = 60; // guess: long enough for the corner bot to kill the boss or be killed on most seeds
// corner-shooter (R47): camps in the bottom 3x3 corner like the corner bot, but every 0.5 s picks the tile in that corner block
// (closest to the very corner first) that has a clear line to B-01 and stands on it, so the rifle auto-fires (same as the human bot,
// which fires by standing still). With no clear tile it keeps the very corner.
function cornerShooterInput(S, B) {
  if (S.phase === 'clear') return doorDir(S);
  var h = S.hero, W = S.room.w, H = S.room.h, boss = null, i;
  for (i = 0; i < S.enemies.length; i++) if (S.enemies[i].boss) { boss = S.enemies[i]; break; }
  if (!B.tgt || (B.replan = (B.replan || 0) - 1) <= 0) {
    B.replan = 30; var best = null, bd = 1e9, cx = B.side < 0 ? 0 : W - 1;
    for (var gy = H - 3; gy < H; gy++) for (var gx = 0; gx < 3; gx++) {
      var tx = B.side < 0 ? gx : W - 1 - gx, c = grid(S)[gy][tx];
      if (c === '#' || c === '^') continue;
      var px = tx + 0.5, py = gy + 0.5, d = Math.abs(tx - cx) + (H - 1 - gy);
      if (boss && boss.st !== 'spawn' && !V.Sim.clearLine(S, px, py, boss.x, boss.y, S.tune.ROUND_R)) d += 100;
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    if (!B.tgt || !best || Math.hypot(best.x - B.tgt.x, best.y - B.tgt.y) > 0.01) B.tgt = best || { x: B.side < 0 ? 0.5 : W - 0.5, y: H - 0.5 };
  }
  var dx = B.tgt.x - h.x, dy = B.tgt.y - h.y;
  return Math.abs(dx) + Math.abs(dy) < 0.06 ? { mx: 0, my: 0 } : { mx: dx, my: dy };
}
function bossBotCheck(nSeeds, inputFn, secs) {
  var res = [];
  for (var sd = 1; sd <= nSeeds; sd++) {
    var S = toStageC(sd, 10), B = { side: sd % 2 ? -1 : 1 }, dmg = 0, hurts = 0, fires = 0, bossHits = 0, i, bid = null, killT = null;
    if (S.stageKind !== 'boss') { res.push({ seed: sd, boss: false, dmg: 0 }); continue; }
    for (i = 0; i < secs * 60 && S.phase !== 'results'; i++) {
      if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
      if (S.phase === 'clear') break;
      V.Sim.step(S, inputFn(S, B));
      if (bid == null) for (var q = 0; q < S.enemies.length; q++) if (S.enemies[q].boss) bid = S.enemies[q].id;
      for (var j = 0; j < S.events.length; j++) {
        var e = S.events[j];
        if (e.k === 'hurt') { dmg += e.dmg || 0; hurts++; }
        else if (e.k === 'fire') fires++;
        else if (e.k === 'hit' && e.id === bid) bossHits++;
        else if (e.k === 'kill' && e.id === bid && killT == null) killT = S.roomT;
      }
    }
    var won = killT != null || !!(S.result && S.result.win);
    res.push({ seed: sd, boss: true, dmg: dmg, hurts: hurts, fires: fires, bossHits: bossHits, dead: S.phase === 'results' && !won, won: won, killT: killT,
      t: +S.roomT.toFixed(2), x: S.hero.x, y: S.hero.y, w: S.room.w });
  }
  return res;
}
function cornerBossCheck(nSeeds) { return bossBotCheck(nSeeds, cornerInput, CB_SECS); }
function cornerShooterCheck(nSeeds, secs) { return bossBotCheck(nSeeds, cornerShooterInput, secs || 90); }

// ================= K: Supply Drop catch-room bots (agent K; NEW functions only; parts/catch.js is loaded on demand) =================
// catchRoom(seed, cols, hpFrac) -> a sim standing in the catch room (stage 5, phase 'collect').
// catchBotInput(S, B, kind) kinds: 'lazy' | 'human' | 'perfect' (SPEC 9: about 20 / 55 / 95 percent caught).  playCatch(S, kind, seed) runs the room to the sheet.
// catchRows(nSeeds, outPath) = the four-width sweep (9 / 11 / 13 / 15 columns); sdChoice(nSeeds, outPath) = SD-CHOICE (three pad policies, 25/50/25 lazy/human/perfect mix).
// Neither writes BOT-RESULTS.txt. CLI: node bot.js catch [seeds] [outPath]  (handled in the tiny dispatcher at the end of this file).
function ensureCatch() { if (!V.Catch) require(path.join(__dirname, 'parts', 'catch.js')); return V.Catch; }
function catchRoom(seed, cols, hpFrac, tune) {
  ensureCatch();
  var S = V.Sim.create(seed, tune || freshTune(), { cols: cols }), g = 0;
  while (S.stage < 5 && g++ < 20000) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, 0); continue; }
    if (S.phase === 'play') { S.enemies.length = 0; S.spawnQ.length = 0; }
    V.Sim.step(S, { mx: 0, my: 0 });
    if (S.phase === 'clear') { S.hero.x = S.room.door.x + 0.5; S.hero.y = 1.3; V.Sim.step(S, { mx: 0, my: -1 }); }
  }
  if (hpFrac != null) S.hero.hp = Math.max(1, Math.round(S.hero.maxHp * hpFrac));
  return S;
}
function cClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function cToward(S, tx, ty) { var h = S.hero, dx = tx - h.x, dy = ty - h.y; return (Math.hypot(dx, dy) < 0.06) ? { mx: 0, my: 0 } : { mx: dx, my: dy }; }
function cSpeed(S) { var m = S.mini; return S.tune.MOVE_SPEED * (m.t < m.slowUntil ? 0.5 : 1); }
// lazy centre bot: stands on the centre column and slides sideways only for a crate that is already within LZ.range tiles (0 = never moves, the plain "idle centre" bot).
// Lane 4 is pinned to the centre column at every width (R51), so with range 0 the lazy row is identical across widths by construction.
function lazyCatch(S, B) {
  var m = S.mini, h = S.hero, K = V.Catch.C, t = m.t, best = null, bd = 1e9;
  if (m.phase !== 'play' || LZ.range <= 0) return cToward(S, m.cols / 2, K.HY_MAX);
  m.crates.forEach(function (c) { if (c.st !== 'air' || t - c.t0 < LZ.react) return; var d = Math.abs(c.x - h.x); if (d <= LZ.range && d < bd) { bd = d; best = c; } });
  if (!best) return cToward(S, m.cols / 2, K.HY_MAX);
  return cToward(S, best.x, K.HY_MAX);
}
// human-like: a casual player who keeps the Operator low (thumb band) and slides sideways. It sees a crate HU.react s after it spawns, re-picks every
// HU.hold s the crate that lands soonest among those it can still reach on the row-10 line (HU.misj x the true time needed), with HU.noise s of
// jitter in the choice, and slides at full speed except for HU.idleP of the steps (thumb lag). It does not climb for crates and half-notices duds.
function humanCatch(S, B) {
  var m = S.mini, h = S.hero, K = V.Catch.C, t = m.t, sp = cSpeed(S);
  if (m.phase !== 'play') return cToward(S, m.cols / 2, K.HY_MAX);
  B.hold -= 1 / 60;
  if (B.hold <= 0 || !B.tc || B.tc.st !== 'air') {
    B.hold = HU.holdLo + B.rng.next() * (HU.holdHi - HU.holdLo);
    var best = null, bk = 1e9;
    m.crates.forEach(function (c) {
      if (c.st !== 'air' || t - c.t0 < HU.react) return;
      var left = c.t0 + c.fall - t, need = Math.max(0, Math.abs(c.x - h.x) - 0.7) / sp;
      if (need * HU.misj > left) return;
      var key = left + (B.rng.next() - 0.5) * HU.noise;
      if (key < bk) { bk = key; best = c; }
    });
    B.tc = best;
  }
  if (HU.idleP > 0 && B.rng.next() < HU.idleP) return { mx: 0, my: 0 };
  if (!B.tc) return cToward(S, m.cols / 2, K.HY_MAX);
  var tx = B.tc.x;
  if (B.noticeDud == null) B.noticeDud = B.rng.next() < 0.5;
  if (B.noticeDud) m.duds.forEach(function (u) {
    if (u.st !== 'air' || u.y < 8) return;
    var d = Math.abs(h.x - u.x); if (d < 1.2 && Math.sign(tx - h.x) === Math.sign(u.x - h.x)) tx = h.x;   // does not walk into a dud that is about to land on its path
  });
  return cToward(S, tx, K.HY_MAX);
}
// perfect-path: knows the whole script. Plans catches in time order (greedy earliest-catch, two orderings, keeps the better), every leg checked against the duds.
function planPerfect(S) { return planFor(S.mini.script, S.mini.cols, S.hero.x, S.hero.y, S.tune.MOVE_SPEED); }
function planFor(sc, cols, hx, hy, sp) {
  var C = V.Catch, K = C.C;
  var cr = sc.crates.map(function (c) { return { c: c, x: C.laneX(c.lane, cols), o: c.t0 + c.fall * K.MARGIN_OPEN, l: c.t0 + c.fall }; });
  var du = sc.duds.map(function (d) { return { d: d, x: C.laneX(d.lane, cols) }; });
  function legOk(p0, p1, t0, t1) {
    for (var i = 0; i <= 6; i++) {
      var f = i / 6, t = t0 + (t1 - t0) * f, x = p0.x + (p1.x - p0.x) * f, y = p0.y + (p1.y - p0.y) * f;
      for (var j = 0; j < du.length; j++) { var u = du[j]; if (t >= u.d.t0 - 0.05 && t <= u.d.t0 + u.d.fall + 0.05 && Math.hypot(x - u.x, y - C.crateY(u.d, t)) < K.DUD_R + 0.45) return false; }
    }
    return true;
  }
  function earliest(c, from) {
    for (var tau = Math.max(c.o, from.t); tau <= c.l + 1e-9; tau += 0.02) {
      var cy = C.crateY(c.c, tau), ty = cClamp(cy, K.HY_MIN, K.HY_MAX);
      if (Math.abs(ty - cy) > 0.55) continue;
      var tgt = { x: c.x, y: ty }, d = Math.hypot(tgt.x - from.x, tgt.y - from.y);
      if (d / sp <= tau - from.t + 1e-9 && legOk(from, tgt, from.t, tau)) return { t: tau, x: tgt.x, y: tgt.y };
    }
    return null;
  }
  // beam search over catch sequences in deadline order: each crate is caught at its earliest feasible time or skipped; keep the best 40 states
  var order = cr.slice().sort(function (a, b) { return a.l - b.l || a.c.id - b.c.id; });
  var beam = [{ from: { x: hx, y: hy, t: 0 }, n: 0, plan: [] }];
  order.forEach(function (c) {
    var nb = [];
    beam.forEach(function (st) {
      nb.push(st);
      var e = earliest(c, st.from);
      if (e) nb.push({ from: e, n: st.n + 1, plan: st.plan.concat([e]) });
    });
    nb.sort(function (a, b) { return b.n - a.n || a.from.t - b.from.t; });
    beam = nb.slice(0, 40);
  });
  var best = beam[0].plan.slice().sort(function (a, b) { return a.t - b.t; });
  return best;
}
function perfectCatch(S, B) {
  var m = S.mini, K = V.Catch.C;
  if (m.phase !== 'play') {
    if (m.phase === 'countin') { var pl = B.plan || (B.plan = planPerfect(S)); if (pl.length) return cToward(S, pl[0].x, pl[0].y); }
    return cToward(S, m.cols / 2, K.HY_MAX);
  }
  if (!B.plan) B.plan = planPerfect(S);
  var p = B.plan, i = 0; while (i < p.length && p[i].t < m.t - 0.03) i++;
  if (i >= p.length) return { mx: 0, my: 0 };
  return cToward(S, p[i].x, p[i].y);
}
function catchBotInput(S, B, kind) { return kind === 'lazy' ? lazyCatch(S, B) : (kind === 'perfect' ? perfectCatch(S, B) : humanCatch(S, B)); }
// Runs the room from where catchRoom left it until the sheet opens (phase 'supply') or the run ends. Returns the room numbers.
function playCatch(S, kind, seed) {
  var B = { rng: new V.Rng((seed || S.seed) * 31 + 5), hold: 0, plan: null, tc: null }, n = 0;
  while (S.phase === 'collect' && n++ < 3000) V.Sim.step(S, catchBotInput(S, B, kind));
  var m = S.mini;
  return { net: m.net, caught: m.caught, dudHits: m.dudHits, tier: m.tier, steps: n, early: !!m.early };
}
// bot knobs (K, guesses tuned so the 9-column rows land near SPEC's 20 / 55 percent): lazy reacts after LZ.react s to crates within LZ.range tiles; human after HU.react s, re-picks every HU.hold s, gives up on crates it judges more than HU.misj x too far
var LZ = { react: 0.6, range: 0 }, HU = { react: 0.6, holdLo: 0.3, holdHi: 0.6, misj: 1.0, noise: 0.5, idleP: 0.88 };
var CATCH_WIDTHS = [9, 11, 13, 15], CATCH_KINDS = ['lazy', 'human', 'perfect'], TIERN = ['Basic', 'Good', 'Great', 'Perfect'];
var CATCH_KNOBS = { LZ: LZ, HU: HU };
function catchRows(nSeeds, outPath) {
  nSeeds = nSeeds || 200; ensureCatch();
  var L = [], res = {}, t0 = Date.now();
  function o(s) { L.push(s); if (!outPath) console.log(s); }
  o('Supply Drop catch room: four-width bot rows (R51, SPEC 9). ' + nSeeds + ' seeds (1..' + nSeeds + ') per row, stage 5, fixed step 1/60, 20 crates, GAP_FACTOR ' + JSON.stringify(V.Catch.GAP_FACTOR));
  o('Targets (SPEC 9, guesses): lazy about 20 percent caught, human-like about 55, perfect-path about 95; pass = tier shares agree across widths within 10 points.');
  CATCH_KINDS.forEach(function (kind) {
    o('== ' + kind + ' ==');
    o('cols | mean net/20 | mean caught | mean duds hit | Basic % | Good % | Great % | Perfect % | early-perfect %');
    res[kind] = {};
    CATCH_WIDTHS.forEach(function (C) {
      var nets = [], cau = [], dh = [], tc = [0, 0, 0, 0], early = 0;
      for (var sd = 1; sd <= nSeeds; sd++) { var S = catchRoom(sd, C), r = playCatch(S, kind, sd); nets.push(r.net); cau.push(r.caught); dh.push(r.dudHits); tc[r.tier]++; if (r.early) early++; }
      var sh = tc.map(function (v) { return 100 * v / nSeeds; });
      res[kind][C] = { net: mean(nets), shares: sh };
      o(pad(C, 4) + ' | ' + pad((mean(nets) * 5).toFixed(1) + '%', 11) + ' | ' + pad(f1(mean(cau)), 11) + ' | ' + pad(mean(dh).toFixed(2), 13) + ' | ' + sh.map(function (v) { return pad(v.toFixed(1), 7); }).join(' | ') + ' | ' + pad((100 * early / nSeeds).toFixed(1), 8));
    });
    var worst = 0, worstNet = 0;
    for (var ti = 0; ti < 4; ti++) { var vs = CATCH_WIDTHS.map(function (C) { return res[kind][C].shares[ti]; }); worst = Math.max(worst, Math.max.apply(null, vs) - Math.min.apply(null, vs)); }
    var nv = CATCH_WIDTHS.map(function (C) { return res[kind][C].net * 5; }); worstNet = Math.max.apply(null, nv) - Math.min.apply(null, nv);
    o('widest tier-share spread across widths: ' + worst.toFixed(1) + ' points (band 10): ' + (worst <= 10 ? 'PASS' : 'FAIL') + '; caught-share spread ' + worstNet.toFixed(1) + ' points');
    res[kind].spread = worst;
  });
  o('Run time ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  if (outPath) fs.writeFileSync(outPath, L.join('\n') + '\n');
  return { rows: res, lines: L };
}
// SD-CHOICE: one full slice run (stages 1-10) per seed with the human fight bot, one catch profile (seed % 4: 0 lazy, 1-2 human, 3 perfect = 25/50/25),
// and a pad policy at the sheet. policy: 'repair-first' (the preselected defaults), 'never-repair', 'random' (one random pad at Basic, two at Good).
function sdPolicyPick(S, policy, B) {
  var m = S.mini, ids = ['repair', 'credits', 'schematics'], live = m.pads.filter(function (p) { return p.live; }).map(function (p) { return p.id; });
  if (m.pay.all) return null;                       // Great and Perfect: every live pad is taken, the player cannot opt out
  if (policy === 'repair-first') return null;       // defaults
  if (policy === 'never-repair') return live.filter(function (i) { return i !== 'repair'; }).slice(0, m.pay.picks);
  var pool = live.slice(), out = [];                // random
  while (out.length < m.pay.picks && pool.length) out.push(pool.splice(B.rng.int(pool.length), 1)[0]);
  return out;
}
function runSdChoice(seed, policy, cols, tune) {
  ensureCatch();
  var o = { cols: cols || 9 }, S = V.Sim.create(seed, tune || freshTune(), o);
  var B = { rng: new V.Rng(seed * 7919 + 13), hold: 0, cmd: { mx: 0, my: 0 }, hist: [], side: seed % 2 ? -1 : 1 }, CB = { rng: new V.Rng(seed * 31 + 5), hold: 0, plan: null, tc: null };
  var prof = [null, 'lazy', 'human', 'human', 'perfect'][1 + (seed % 4)];   // seed%4: 0 lazy, 1 human, 2 human, 3 perfect
  prof = ['lazy', 'human', 'human', 'perfect'][seed % 4];
  var steps = 0, info = null, creditsAtTake = 0;
  while (steps < MAX_STEPS) {
    if (S.phase === 'results') break;
    if (S.phase === 'pick') { V.Sim.pick(S, chooseCard(S, 'human', B)); continue; }
    if (S.phase === 'supply') {
      var h = S.hero, miss = (h.maxHp - h.hp) / h.maxHp, tier = S.mini.tier, sel = sdPolicyPick(S, policy, B), c0 = S.credits, hp0 = h.hp;
      V.Sim.pickSupply(S, sel);
      info = { miss: miss, tier: tier, credits: S.credits - c0, schem: S.schematics | 0, heal: S.hero.hp - hp0, roomS: (S.t - S.mini.startT) + 2.4 };   // + 2.4 s of sheet time = about 14 s (R54, guess)
      continue;
    }
    var inp = S.phase === 'collect' ? catchBotInput(S, CB, prof) : INPUT.human(S, B);
    if (S.phase === 'clear') inp = { mx: inp.mx, my: inp.my, walk: 2 };
    V.Sim.step(S, inp); steps++;
  }
  var R = S.result;
  return { seed: seed, prof: prof, win: !!(R && R.win), dead: !!(R && !R.win), stage: S.stage, info: info, credits: S.credits, schem: S.schematics | 0 };
}
function sdChoice(nSeeds, outPath, cols) {
  nSeeds = nSeeds || 200; ensureCatch();
  var L = [], t0 = Date.now(), POL = ['repair-first', 'never-repair', 'random'], CAP = 1139;
  function o(s) { L.push(s); if (!outPath) console.log(s); }
  o('SD-CHOICE (SPEC 9): ' + nSeeds + ' seeds, slice stages 1-10 (one Supply Drop at stage 5), human fight bot, catch profile seed%4 = lazy / human / human / perfect (25/50/25), ' + (cols || 9) + ' columns, walk 2x.');
  o('Room time column = sim seconds from room entry to Take + 2.4 s sheet time (about 14 s, R54). The slice has ONE drop, so the 50-stage figures are arithmetic: x5 drops against the 1,139 clear (guess).');
  o('policy        | clear % | credits/drop | Credits swing vs repair-first (x5 drops / 1,139) | schem/run | missing HP on arrival | arrivals <5% missing | HP healed/drop | room s');
  var base = null;
  POL.forEach(function (pol) {
    var rs = []; for (var sd = 1; sd <= nSeeds; sd++) rs.push(runSdChoice(sd, pol, cols));
    var inf = rs.map(function (r) { return r.info; }).filter(Boolean);
    var clear = 100 * rs.filter(function (r) { return r.win; }).length / nSeeds;
    var cr = mean(inf.map(function (i) { return i.credits; })), sc = mean(rs.map(function (r) { return r.schem; })), ms = mean(inf.map(function (i) { return 100 * i.miss; }));
    var lowShare = 100 * inf.filter(function (i) { return i.miss < 0.05; }).length / Math.max(1, inf.length), heal = mean(inf.map(function (i) { return i.heal; })), rt = mean(inf.map(function (i) { return i.roomS; }));
    if (!base) base = cr;
    var swing = (cr - base) * 5 / CAP * 100;
    o(pol + new Array(Math.max(1, 14 - pol.length)).join(' ') + '| ' + pad(clear.toFixed(1), 7) + ' | ' + pad(cr.toFixed(1), 12) + ' | ' + pad((swing >= 0 ? '+' : '') + swing.toFixed(1) + '%', 48) + ' | ' + pad(sc.toFixed(2), 9) + ' | ' + pad(ms.toFixed(1) + '%', 21) + ' | ' + pad(lowShare.toFixed(1) + '%', 20) + ' | ' + pad(heal.toFixed(1), 14) + ' | ' + rt.toFixed(1));
    var byProf = {}; rs.forEach(function (r) { (byProf[r.prof] = byProf[r.prof] || []).push(r.win ? 1 : 0); });
    o('   clear by catch profile: ' + Object.keys(byProf).sort().map(function (k) { return k + ' ' + (100 * mean(byProf[k])).toFixed(1) + '% (n ' + byProf[k].length + ')'; }).join(', '));
  });
  o('Never-repair is the exposure, not a pass test (Great and Perfect still take Repair: every live pad is taken at those tiers). Random: one random pad at Basic, two at Good.');
  o('Run time ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  if (outPath) fs.writeFileSync(outPath, L.join('\n') + '\n');
  return L;
}
// =============================================================================================================================
function main() {
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
if (COLS != null) {
  out('Column class: --cols=' + COLS + ' (opts.cols on every base-sweep V.Sim.create; parts/widen.js ' + (V.Widen ? 'loaded' : 'MISSING: sim stays at 9') + ')');
  out('      corner = walks to a bottom corner (left on odd seeds, right on even) and camps; door when clear; card 0 / supply 0.');
}
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
(COLS != null ? ['idle', 'corner', 'naive', 'human', 'skilled'] : ['idle', 'naive', 'human', 'skilled']).forEach(function (kind) {
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
  var psLine = [];
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
    if (COLS != null) psLine.push(st + ':' + (reached ? (100 * cl / reached).toFixed(1) : '-') + '%/' + (tm.length ? pct(tm, 0.5).toFixed(1) : '-') + 's');
  });
  if (COLS != null) {
    out('  per stage (cleared / reached, median clear s): ' + psLine.join(' '));
    var cs = {}; runs.forEach(function (r) { r.cols.forEach(function (c) { cs[c] = 1; }); });
    out('  room widths seen: ' + Object.keys(cs).join(', ') + (kind === 'corner' ? '; boss damage taken (runs that reached it): ' + runs.filter(function (r) { return r.stage === 10; }).map(function (r) { return r.bossDmg; }).join(',') : ''));
  }
  out('');
  summary.push(kind + ': clear ' + wins.length + '/' + SEEDS + ', died ' + deaths.length + (deaths.length ? ' (median stage ' + pct(deaths.map(function (r) { return r.stage; }), 0.5) + ')' : '') +
    ', boss time median ' + (bt.length ? pct(bt, 0.5).toFixed(1) + ' s' : '-') + ', braced ' + f1(mean(braced)) + '%');
});
(function(){ var bad = [], w = skilledWorst || {}; for (var k in w) if (w[k] >= 5) bad.push(k + ' ' + w[k]);
  chk('fairness gate: skilled bot takes < 5 hits from any one enemy type in any single run', skilledWorst && !bad.length, 'worst per run ' + JSON.stringify(w)); })();
if (COLS != null) {
  var cb = cornerBossCheck(Math.min(SEEDS, 50)), cbB = cb.filter(function (r) { return r.boss; }), cbH = cbB.filter(function (r) { return r.dmg > 0; });
  chk('corner bot camping on the boss (stage 10 reached by force-clear, 60 s or run end) takes damage on every seed', cbB.length > 0 && cbH.length === cbB.length,
    cbH.length + '/' + cbB.length + ' seeds hit, damage median ' + (cbB.length ? pct(cbB.map(function (r) { return r.dmg; }), 0.5) : '-') + ', died ' + cbB.filter(function (r) { return r.dead; }).length);
}
out('== Summary ==');
summary.forEach(out);
out('Rule checks failed: ' + nFail);
// 5) economy career (added 2026-11-10, P-PV-I): human bot plays a career of runs, banks credits, greedy spend, stats feed the next run.
// Runs LAST so the base sweeps above stay meta-neutral (meta.js is only loaded here; every career run passes metaStats explicitly).
// Deterministic: career c (1..CAREERS), run r uses seed 1000*c + r. No Math.random / Date (V.Meta.buy picks the random stat from the save itself).
(function economy() {
  var CAREERS = Math.min(SEEDS, 50), SHOW = 30, CAP = +ARGV[1] || 400, LONG = Math.min(CAREERS, 10);   // SHOW = runs in the main tables; the first LONG careers play on up to CAP runs (until maxed) for the time-to-max rows
  var mp = path.join(__dirname, 'parts', 'meta.js');
  if (!fs.existsSync(mp)) { out('== Economy (human bot career) == skipped: parts/meta.js missing'); return; }
  require(mp);
  var M = V.Meta, T = M.TUNING;
  function mock() { var d = {}; return { getItem: function (k) { return d[k] == null ? null : d[k]; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; }
  function statsCopy() { var x = M.stats(), o = {}; for (var k in x) o[k] = x[k]; return o; }
  function upgrades() { return (M.state.rifle.lvl - 1) + M.state.buys; }
  function maxed() { return M.state.rifle.lvl >= T.RIFLE_MAX && M.state.cond.hp >= T.COND_CAPS.hp && M.state.cond.atk >= T.COND_CAPS.atk && M.state.cond.rate >= T.COND_CAPS.rate; }
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
      M.resetVisit(); spendGreedy();
      var u = upgrades();
      [1, 5, 10].forEach(function (k) { if (u >= k && cr.upAt[k] == null) cr.upAt[k] = r; });
      if (cr.rifle10At == null && M.state.rifle.lvl >= T.RIFLE_MAX) cr.rifle10At = r;
      if (cr.cond10At == null && M.state.cond.hp >= T.COND_CAPS.hp && M.state.cond.atk >= T.COND_CAPS.atk && M.state.cond.rate >= T.COND_CAPS.rate) cr.cond10At = r;
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
  out('fully maxed (rifle 10, all stats 10): ATK ' + Math.floor(T.HERO_ATK * (1 + 9 * T.RIFLE_ATK_PER_LVL / T.HERO_ATK) * (1 + T.COND_CAPS.atk * T.COND_ATK_PER_LVL)) + ' (x' + ((1 + 9 * T.RIFLE_ATK_PER_LVL / T.HERO_ATK) * (1 + T.COND_CAPS.atk * T.COND_ATK_PER_LVL)).toFixed(2) + '), max HP ' + (T.HERO_HP + M.hpAddAt(10)) + ', fire ' + (1 + T.COND_CAPS.rate * T.COND_RATE_PER_LVL).toFixed(2) + 'x (HP of the last career run now: ' + fin.maxHp + ').');
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
fs.writeFileSync(COLS != null ? path.join(__dirname, 'sim', 'out', 'bot-C' + COLS + '.txt') : path.join(__dirname, 'BOT-RESULTS.txt'), lines.join('\n') + '\n');
}
if (require.main === module) {   // K: `node bot.js catch [seeds] [outPath]` runs only the catch-room rows and SD-CHOICE (never BOT-RESULTS.txt)
  if (process.argv[2] === 'catch') { var ns = +process.argv[3] || 200, op = process.argv[4] || null; catchRows(ns, op); sdChoice(Math.min(ns, 200), op ? op.replace(/\.txt$/, '') + '-sdchoice.txt' : null); }
  else main();
}
module.exports = { V: V, runOne: runOne, setCols: setCols, setWalk: setWalk, cornerBossCheck: cornerBossCheck, cornerShooterCheck: cornerShooterCheck, bossBotCheck: bossBotCheck, cornerShooterInput: cornerShooterInput, pct: pct, mean: mean, MAX_STEPS: MAX_STEPS, INPUT: INPUT };
Object.assign(module.exports, { catchRoom: catchRoom, CATCH_KNOBS: CATCH_KNOBS, catchBotInput: catchBotInput, playCatch: playCatch, planFor: planFor, catchRows: catchRows, sdChoice: sdChoice, runSdChoice: runSdChoice });   // K
