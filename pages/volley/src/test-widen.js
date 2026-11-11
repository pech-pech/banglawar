// Headless check for parts/widen.js (stepped rooms, pick 43 / R42, FULLSCREEN-LAYOUT section 2) and the sim at 9/11/13/15 columns.
// Usage: node src/test-widen.js   (exit code 1 on any failure)
'use strict';
var path = require('path'), fs = require('fs');
globalThis.V = globalThis.V || {};
['data-stages', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'widen', 'mods', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function (f) {
  require(path.join(__dirname, 'parts', f + '.js'));
});
var V = globalThis.V, W = V.Widen;
var fails = 0, passes = 0;
function ok(c, msg) { if (c) passes++; else { fails++; if (fails <= 60) console.log('FAIL ' + msg); } }

var CLASSES = [9, 11, 13, 15], TW = 9, TH = 15;
var BLOCK = { '#': 1, '^': 1, '~': 1 };
var ids = Object.keys(V.ROOMS), warns = [];
function cell(g, x, y) { return (y < 0 || y >= g.length || x < 0 || x >= g[0].length) ? '#' : g[y][x]; }
function find(g, ch) { for (var y = 0; y < g.length; y++) { var x = g[y].indexOf(ch); if (x >= 0) return { x: x, y: y }; } return null; }
function bfs(g, from, to, avoidSpikes) {
  var Wd = g[0].length, seen = {}, q = [[from.x, from.y]]; seen[from.x + ',' + from.y] = 1;
  while (q.length) {
    var c = q.shift(); if (c[0] === to.x && c[1] === to.y) return true;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
      var nx = c[0] + o[0], ny = c[1] + o[1], ch = cell(g, nx, ny), key = nx + ',' + ny;
      if (seen[key] || nx < 0 || ny < 0 || nx >= Wd || ny >= g.length) return;
      if (ch === '#' && !(nx === to.x && ny === to.y)) return;
      if (avoidSpikes && (ch === '^' || ch === '~')) return;
      seen[key] = 1; q.push([nx, ny]);
    });
  }
  return false;
}
// open runs bounded on both sides by a blocking cell (not the side wall): [{x, len}]
function boundedGaps(row) {
  var out = [], x = 0;
  while (x < row.length) {
    if (BLOCK[row[x]]) { x++; continue; }
    var s = x; while (x < row.length && !BLOCK[row[x]]) x++;
    if (s > 0 && x < row.length) out.push({ x: s, len: x - s });
  }
  return out;
}
function mirrored(g) { for (var y = 0; y < g.length; y++) if (g[y] !== g[y].split('').reverse().join('')) return false; return true; }
function inFloor(g, x, y) { return x > 0 && x < g[0].length && y > 1 && y < 11 && !BLOCK[cell(g, Math.floor(x), Math.floor(y))]; }

// ---- 0. column classes ----
ok(V.ROOMS.SD && !W.hasEnemies(V.ROOMS.SD) && W.room(V.ROOMS.SD, 15).fill.length === 0, 'R45 (a): SD has no enemies and no fill at 15');
ok(W.cols(9) === 9 && W.cols(11) === 11 && W.cols(13) === 13 && W.cols(15) === 15, 'cols keeps the four classes');
ok(W.cols(10) === 11 && W.cols(16) === 15 && W.cols(3) === 9 && W.cols(NaN) === 9 && W.cols(undefined) === 9, 'cols snaps to odd 9..15');

// ---- 1. every room template at every class ----
ids.forEach(function (id) {
  var T = V.ROOMS[id], tg = T.grid, boss = W.isBoss(T), tMir = mirrored(tg);
  CLASSES.forEach(function (C) {
    var tag = id + '@' + C, r = W.room(T, C), g = r.grid, k = (C - TW) / 2, mid = (C - 1) / 2;
    ok(r.w === C && r.h === TH && r.k === k, tag + ' w/h/k');
    ok(g.length === TH && g.every(function (row) { return row.length === C; }), tag + ' grid is C x 15');
    var d = find(g, 'D'), s = find(g, 'S');
    ok(d && d.x === mid && d.y === 0, tag + ' door on centre column, row 0');
    ok(s && s.x === mid && s.y === 14, tag + ' start on centre column, row 14');
    ok(g[0].split('').every(function (ch, x) { return x === mid ? ch === 'D' : ch === '#'; }), tag + ' row 0 is wall + door');
    // core preserved, shifted by k (spawn slots in template cols 1/7 may have moved outward)
    var core = true, sh = boss ? 0 : Math.floor(k / 2);
    for (var y = 0; y < TH; y++) for (var x = 0; x < TW; x++) {
      var a = tg[y][x], b = g[y][x + k];
      if (a === b) continue;
      if (a === 'e' && (x === 1 || x === 7) && b === '.' && sh > 0) continue;                  // slot moved away
      if (a === '.' && b === 'e' && sh > 0 && ((x === 1 - sh && tg[y][1] === 'e') || (x === 7 + sh && tg[y][7] === 'e'))) continue; // slot moved here
      core = false;
    }
    ok(core, tag + ' core kept whole, shifted by k');
    // slot spread: template 'e' in cols 1/7 lands floor(k/2) further out
    for (y = 1; y < TH; y++) [1, 7].forEach(function (tx) {
      if (tg[y][tx] !== 'e') return;
      var nx = tx + k + (boss ? 0 : (tx === 1 ? -1 : 1) * Math.floor(k / 2));
      ok(g[y][nx] === 'e', tag + ' slot (' + tx + ',' + y + ') moved to col ' + nx);
    });
    // side-attached cells and wall-to-wall runs extend through the added columns; nothing else there but fill posts
    for (y = 1; y < TH; y++) for (x = 0; x < k; x++) {
      var L = g[y][x], R = g[y][C - 1 - x];
      var expL = BLOCK[tg[y][0]] && !boss ? tg[y][0] : '.', expR = BLOCK[tg[y][TW - 1]] && !boss ? tg[y][TW - 1] : '.';
      var fillL = r.fill.some(function (f) { return f.x === x && y >= f.y && y < f.y + f.h; });
      var fillR = r.fill.some(function (f) { return f.x === C - 1 - x && y >= f.y && y < f.y + f.h; });
      ok(L === (fillL ? '#' : expL) || (L === 'e'), tag + ' added left cell (' + x + ',' + y + ') = ' + L);
      ok(R === (fillR ? '#' : expR) || (R === 'e'), tag + ' added right cell (' + (C - 1 - x) + ',' + y + ') = ' + R);
    }
    // gaps: every bounded gap of the template keeps its width and place
    for (y = 1; y < TH; y++) {
      var tgaps = boundedGaps(tg[y]), wgaps = boundedGaps(g[y]);
      tgaps.forEach(function (tgp) {
        ok(wgaps.some(function (w) { return w.x === tgp.x + k && w.len === tgp.len; }), tag + ' row ' + y + ' gap at ' + tgp.x + ' (' + tgp.len + ') kept');
      });
      wgaps.forEach(function (w) {
        var had = tgaps.some(function (t) { return t.len < 2 && w.x === t.x + k && w.len === t.len; });
        ok(w.len >= 2 || had, tag + ' row ' + y + ' no new gap under 2 tiles (x ' + w.x + ', ' + w.len + ')');
      });
    }
    // mirror line stays on the centre column
    if (tMir) ok(mirrored(g), tag + ' mirrored template stays mirrored');
    // fill cover: from 13 columns in rooms with cover, never in R01 or boss arenas; 1 x 2 in rows 5-6, 2 open tiles from the core cover
    var hasCover = tg.slice(1).some(function (row) { return row.indexOf('#') >= 0; });
    var wantFill = C >= 13 && hasCover && !boss && id !== 'R01' && W.hasEnemies(T); // R45 (a): SD gets none
    ok(wantFill ? r.fill.length === 2 : r.fill.length === 0, tag + ' fill posts ' + r.fill.length + (wantFill ? ' (want 2)' : ' (want 0)'));
    r.fill.forEach(function (f) {
      ok(f.w === 1 && f.h === 2 && f.y === 5, tag + ' fill post is 1 x 2 at rows 5-6');
      ok(f.x < k || f.x >= C - k, tag + ' fill post in an added band');
      for (var yy = f.y; yy < f.y + f.h; yy++) {
        var dir = f.x < mid ? 1 : -1, n = 0, xx = f.x + dir;
        while (xx >= 0 && xx < C && !BLOCK[g[yy][xx]]) { n++; xx += dir; }
        ok(n >= 2, tag + ' fill post row ' + yy + ': ' + n + ' open tiles toward the core');
      }
    });
    if (boss) {
      var extra = 0;
      for (y = 1; y < TH; y++) for (x = 0; x < C; x++) if (g[y][x] === '#' && !(x - k >= 0 && x - k < TW && tg[y][x - k] === '#')) extra++;
      ok(extra === 0 && r.fill.length === 0, tag + ' boss arena: no fill cover');
      var b = find(g, 'B'); ok(b && b.x === mid, tag + ' boss mark on centre column');
    }
    // pads, crate, pickups: none in the bottom 3 x 3 corners from 11 columns up
    if (C >= 11) {
      var bad = 0;
      for (y = TH - 3; y < TH; y++) for (x = 0; x < 3; x++) { if ('PC+'.indexOf(g[y][x]) >= 0) bad++; if ('PC+'.indexOf(g[y][C - 1 - x]) >= 0) bad++; }
      ok(bad === 0, tag + ' no pad/crate/pickup in the bottom corners');
    }
    // path from start to door (spike-free where the template has one)
    ok(bfs(g, s, d, bfs(tg, find(tg, 'S'), find(tg, 'D'), true)), tag + ' path start -> door');
    // room spawns inside the floor, not in rows 11-14
    r.spawns.forEach(function (sp) { ok(inFloor(g, sp.x, sp.y), tag + ' room spawn ' + sp.type + ' at ' + sp.x + ',' + sp.y + ' inside floor rows 1-10'); });
    // R45 (c): corridor rule (no open horizontal run over 5 tiles in rows 2-10) is a WARNING at 11+ columns, never a failure
    if (C >= 11 && W.hasEnemies(T) && !boss) for (y = 2; y <= 10; y++) {
      var run = 0, longest = 0; for (x = 0; x < C; x++) { if (BLOCK[g[y][x]]) run = 0; else { run++; if (run > longest) longest = run; } }
      if (longest > 5) warns.push(tag + ' row ' + y + ' open run ' + longest);
    }
    if (C === 9) ok(JSON.stringify(g) === JSON.stringify(tg) && JSON.stringify(r.spawns) === JSON.stringify(T.spawns || []), tag + ' identity at 9');
  });
});

// ---- 2. stage spawn lists at every class ----
V.Sim.stageList().forEach(function (def) {
  var T = V.ROOMS[def.room];
  CLASSES.forEach(function (C) {
    var tag = 'stage ' + def.stage + '@' + C, g = W.room(T, C).grid, k = (C - TW) / 2, sp = W.spawns(def.spawns, C, T);
    ok(sp.length === def.spawns.length, tag + ' spawn count unchanged');
    sp.forEach(function (s, i) {
      var o = def.spawns[i];
      ok(s.type === o.type && s.t === o.t && s.y === o.y, tag + ' spawn type/t/y unchanged');
      var tx = Math.floor(o.x), want = o.x + k + (W.isBoss(T) ? 0 : (tx === 1 ? -1 : tx === 7 ? 1 : 0) * Math.floor(k / 2));
      ok(s.x === want, tag + ' spawn ' + o.type + ' x ' + o.x + ' -> ' + s.x + ' (want ' + want + ')');
      ok(inFloor(g, s.x, s.y), tag + ' spawn ' + s.type + ' at ' + s.x + ',' + s.y + ' inside floor, not rows 11-14');
      if (s.type === 'B-01') ok(s.x === C / 2, tag + ' boss on the centre column');
    });
  });
});

// ---- 3. sim: S.cols, S.room.w, start tile, colsFn read at room entry only ----
CLASSES.forEach(function (C) {
  var S = V.Sim.create(5, null, { cols: C });
  ok(S.cols === C && S.room.w === C && S.room.grid[0].length === C, 'sim @' + C + ' S.cols and S.room.w');
  ok(S.hero.x === C / 2 && S.hero.y === 14.5, 'sim @' + C + ' Operator starts on the centre column');
  ok(S.room.door.x === (C - 1) / 2, 'sim @' + C + ' door on the centre column');
});
(function () {
  var cur = 11, S = V.Sim.create(3, null, { colsFn: function () { return cur; } });
  ok(S.cols === 11 && S.room.w === 11, 'colsFn read at create');
  cur = 15; for (var i = 0; i < 30; i++) V.Sim.step(S, { mx: 0, my: 0 });
  ok(S.room.w === 11 && S.cols === 11, 'colsFn change inside a room keeps C');
  S.enemies.length = 0; S.spawnQ.length = 0;
  for (i = 0; i < 2000 && S.stage === 1; i++) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    V.Sim.step(S, { mx: (S.room.door.x + 0.5 - S.hero.x) * 2, my: -1 });
  }
  ok(S.stage === 2 && S.cols === 15 && S.room.w === 15, 'colsFn read again at the next room entry (stage ' + S.stage + ', w ' + S.room.w + ')');
  var S2 = V.Sim.restart(S); ok(S2.cols === 15, 'restart keeps the opts (colsFn)');
})();

// ---- 3b. R45 (b): repair drops leave the bottom 3 x 3 corners from 11 columns up; untouched at 9 ----
CLASSES.forEach(function (C) {
  var S = V.Sim.create(1, null, { cols: C }), w = S.room.w;
  [[0.7, 14.2], [2.9, 12.1], [w - 0.4, 13.5], [w - 2.6, 14.9]].forEach(function (p) {
    var q = V.Sim.dropSpot(S, p[0], p[1]), fx = Math.floor(q.x), fy = Math.floor(q.y);
    if (C === 9) ok(q.x === p[0] && q.y === p[1], 'drop @9 unchanged at ' + p);
    else {
      ok(!(fy >= 12 && (fx < 3 || fx >= w - 3)), 'drop @' + C + ' ' + p + ' -> ' + q.x + ',' + q.y + ' outside the corner');
      ok(S.room.grid[fy][fx] !== '#' && Math.hypot(q.x - p[0], q.y - p[1]) < 3, 'drop @' + C + ' lands on nearby floor');
    }
  });
  var m = V.Sim.dropSpot(S, w / 2, 13.5); ok(m.x === w / 2 && m.y === 13.5, 'drop @' + C + ' outside a corner is unchanged');
});

// ---- 4. sim smoke: human bot, 3 seeds through chapter 1 at each class; no NaN, everything in bounds ----
// The human bot comes from bot.js (owner D): evaluated without its report section, as src/sim/measure.js does.
// If that copy still reads the 9-column template or a 9 x 15 box, it is pointed at the widened room here, in memory only.
var botSrc = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');
var head = botSrc.slice(0, botSrc.indexOf('// ---------- report helpers')).replace(/^[\s\S]*?var V = globalThis\.V;/, '');
head = head.replace('function grid(S) { return V.ROOMS[S.roomId].grid; }', 'function grid(S) { return S.room.grid || V.ROOMS[S.roomId].grid; }')
  .replace('sx > 9 ||', 'sx > S.room.w ||').replace('Math.min(ex, 9 - ex,', 'Math.min(ex, S.room.w - ex,');
var BOT = new Function('V', 'process', head + '\nreturn { runOne: runOne, freshTune: freshTune };')(V, { argv: [], env: {} });
var origCreate = V.Sim.create, origStep = V.Sim.step, COLS = 9, bad = [], seenStage = {};
V.Sim.create = function (s, t, o) { var p = {}; for (var key in (o || {})) p[key] = o[key]; p.cols = COLS; return origCreate(s, t, p); };
function fin(v) { return typeof v === 'number' && isFinite(v); }
V.Sim.step = function (S, inp) {
  var r = origStep(S, inp), w = S.room.w, h = S.room.h, e, i;
  seenStage[COLS + ':' + S.stage] = 1;
  if (S.room.w !== COLS || S.cols !== COLS) bad.push('cols ' + S.cols + '/' + S.room.w);
  if (!fin(S.hero.x) || !fin(S.hero.y) || !fin(S.hero.hp)) bad.push('hero NaN');
  if (S.hero.x < 0 || S.hero.x > w || S.hero.y < 0 || S.hero.y > h) bad.push('hero out ' + S.hero.x.toFixed(2) + ',' + S.hero.y.toFixed(2));
  for (i = 0; i < S.enemies.length; i++) {
    e = S.enemies[i];
    if (!fin(e.x) || !fin(e.y) || !fin(e.hp)) bad.push(e.type + ' NaN');
    else if (e.x < -0.01 || e.x > w + 0.01 || e.y < -0.01 || e.y > h + 0.01) bad.push(e.type + ' out ' + e.x.toFixed(2) + ',' + e.y.toFixed(2));
    if (e.boss && Math.abs(e.x - w / 2) > 1e-9) bad.push('boss off centre ' + e.x);
  }
  var lists = [S.rounds, S.shots, S.pickups];
  for (var L = 0; L < lists.length; L++) for (i = 0; i < lists[L].length; i++) { e = lists[L][i]; if (!fin(e.x) || !fin(e.y)) bad.push('projectile/pickup NaN'); }
  return r;
};
var summary = [];
CLASSES.forEach(function (C) {
  COLS = C; bad = [];
  var res = [1, 2, 3].map(function (seed) { return BOT.runOne(seed, 'human', 20 * 3600); });
  // a tough hero (meta HP) so every class is driven through all 10 stages even if a default run dies early
  res.push(BOT.runOne(4, 'human', 20 * 3600, null, { hpAdd: 20000 }));
  var all10 = true; for (var st = 1; st <= 10; st++) if (!seenStage[C + ':' + st]) all10 = false;
  ok(bad.length === 0, 'smoke @' + C + ': ' + (bad.length ? bad.slice(0, 4).join('; ') + ' (' + bad.length + ')' : 'clean'));
  ok(all10, 'smoke @' + C + ': all 10 stages visited');
  summary.push('C' + C + ': ' + res.map(function (r) { return 'seed ' + r.seed + (r.win ? ' win' : r.dead ? ' died st' + r.stage : ' timeout st' + r.stage) + ' ' + (r.S.t).toFixed(0) + 's'; }).join(', '));
});
V.Sim.create = origCreate; V.Sim.step = origStep;

// ---- 5. ASCII maps at 15 columns (eyeball) ----
if (process.argv.indexOf('--maps') >= 0) ids.forEach(function (id) { console.log(id + ' @15'); console.log(W.room(V.ROOMS[id], 15).grid.join('\n')); });

warns.forEach(function (w) { console.log('WARNING corridor (R45 c, not a failure): ' + w); });
console.log(summary.join('\n'));
console.log('test-widen: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
