// Static validation net for rooms (GEN-SPEC section 4, checks C1-C9 and X1-X4). Pure data + the REAL V.Widen; no sim, no clock, no rng.
// Usage: node src/test-gen-net.js        (from pages/volley; exit code 1 on any failure)
// Phase 1: fixtures. src/fixtures/good/*.json MUST pass; src/fixtures/bad/*.json MUST each fail exactly the named check (and reason).
// Phase 2: every stage row of V.Data.stages.ch1 and its room at 9, 11, 13, 15 columns (rows 11-20 once src/parts/data-stages-gen.js exists).
// Fixture file: { id, kind, stage, room:{name,cover,grid,spawns}, spawns:[{type,x,y,t,wave?,elite?}], expect:{check,reason} (bad only) }.
'use strict';
var path = require('path'), fs = require('fs');
globalThis.V = globalThis.V || {};
var GEN = path.join(__dirname, 'parts', 'data-stages-gen.js'), HAVE_GEN = fs.existsSync(GEN);
['data-stages'].concat(HAVE_GEN ? ['data-stages-gen'] : [], ['data-enemies', 'rooms', 'stages', 'widen']).forEach(function (f) { require(path.join(__dirname, 'parts', f + '.js')); });
// step 7 (K3, C3 patch): the new machine and boss parts define their own rows (V.Data.enemies[...]); load the ones present so the net knows E-06..E-08 and B-02..B-04
['ai-p0', 'ai-p1', 'boss-kit', 'boss', 'ai-e06', 'ai-e07', 'ai-e08', 'boss-b02', 'boss-b03', 'boss-b04'].forEach(function (f) { var p = path.join(__dirname, 'parts', f + '.js'); if (fs.existsSync(p)) require(p); });
var V = globalThis.V, W = V.Widen, ENEMIES = V.Data.enemies;
var WIDTHS = [9, 11, 13, 15], TH = 15;

// ---------------- thresholds (all [G] guesses unless noted; see D-REPORT.md) ----------------
var T = {
  minStartDist: 5, minSlotGap: 1.5, floorRows: [1, 10],
  routeWidth: 2,                       // C2: a 2 x 2 window must be able to travel start -> door
  laneMax: 5,                          // C7: bounded open run longer than this (rows 2-10); fail at 9 columns, warn at 11+
  coverMax: 0.18, hazardMax: 0.20, hazardMaxHand: 0.25, comboMax: 0.40, safeMin: 0.55, safeMinTiles9: 20,
  maxMachines: 12, maxPerWave: 6, twoWavesFrom: 8,
  cornerSniperDist: 5.0,               // C5: a long-range static machine within this distance (clear line) of a bottom corner tile
  heavyHazard: 0.15,                   // X2
  eliteHazardMax: 0.15, sameTemplateMax: 10
};
var INTRO = { 'E-01': 1, 'E-02': 3, 'E-03': 4, 'E-04': 6, 'E-05': 7, 'E-06': 11, 'E-06h': 11, 'E-08': 13, 'E-07': 16 };       // first stage (test-stages.js FIRST)
var TYPE_CAP = { 'E-02': 4, 'E-04': 2, 'E-05': 2, 'E-08': 1 };                          // CURVE caps for the built pool
var SNIPER_IDS = ['E-08'];                                                         // none in the pilot pool: "1 sniper per 6" applies once E-06+ exist
var LONG_STATIC = function (id) { var e = ENEMIES[id]; return !!(e && e.static && !e.boss && e.ai && e.ai.range >= 14); };   // E-03 turret
var FLAT = function (id) { var e = ENEMIES[id]; return !!(e && !e.boss && e.ai && e.ai.shotSpeed && !e.ai.ringR); };         // E-02, E-03 (straight shots)
var ELITE_STAGES = { 22: 1, 27: 1, 33: 1, 37: 1, 43: 2, 48: 2 };            // Ch1, R40
// Count bands (machines). Stages 1-10: built counts. 11-20: CURVE section 3. Stages beyond: no band entry yet (band check skipped, cap/wave checks still run).
var BAND = { 1: [3, 3], 2: [4, 4], 3: [3, 3], 4: [3, 3], 5: [0, 0], 6: [4, 4], 7: [4, 4], 8: [4, 4], 9: [2, 2], 10: [0, 0],
  11: [4, 6], 12: [4, 6], 13: [5, 7], 14: [6, 8], 15: [0, 0], 16: [4, 6], 17: [5, 7], 18: [7, 9], 19: [2, 2], 20: [0, 0] };

// ---------------- grid helpers (on a widened grid: array of strings, C wide, 15 tall) ----------------
function cellAt(g, x, y) { return (y < 0 || y >= g.length || x < 0 || x >= g[0].length) ? '#' : g[y][x]; }
function isCover(g, x, y) { return cellAt(g, x, y) === '#'; }
function isHaz(g, x, y) { var c = cellAt(g, x, y); return c === '^' || c === '~'; }
function walk(g, x, y) { var c = cellAt(g, x, y); return c !== '#' && c !== '~'; }
function find(g, ch) { for (var y = 0; y < g.length; y++) { var x = g[y].indexOf(ch); if (x >= 0) return { x: x, y: y }; } return null; }
function bfsAll(g, from, passable) {
  var seen = {}, q = [[from.x, from.y]]; seen[from.x + ',' + from.y] = 1;
  while (q.length) { var c = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { var nx = c[0] + o[0], ny = c[1] + o[1], k = nx + ',' + ny; if (!seen[k] && passable(nx, ny)) { seen[k] = 1; q.push([nx, ny]); } }); }
  return seen;
}
// 2 x 2 window route: windows (top-left) whose four cells are walkable, spike-free and not in `block`; slide one tile at a time.
function route2(g, block) {
  var C = g[0].length, mid = (C - 1) / 2, seen = {}, q = [];
  function okw(x, y) { for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) { var cx = x + dx, cy = y + dy; if (cx < 0 || cx >= C || cy < 1 || cy > 14 || !walk(g, cx, cy) || isHaz(g, cx, cy) || (block && block[cx + ',' + cy])) return false; } return true; }
  [[mid - 1, 13], [mid, 13]].forEach(function (s) { if (okw(s[0], s[1])) { seen[s[0] + ',' + s[1]] = 1; q.push(s); } });
  while (q.length) {
    var c = q.shift(); if (c[1] === 1 && (c[0] === mid - 1 || c[0] === mid)) return true;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { var nx = c[0] + o[0], ny = c[1] + o[1], k = nx + ',' + ny; if (!seen[k] && okw(nx, ny)) { seen[k] = 1; q.push([nx, ny]); } });
  }
  return false;
}
function segHitsBox(x1, y1, x2, y2, bx, by, bw, bh) {
  var t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1, p = [-dx, dx, -dy, dy], q = [x1 - bx, bx + bw - x1, y1 - by, by + bh - y1];
  for (var i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    var r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
function coverList(g) { var out = []; for (var y = 1; y < g.length; y++) for (var x = 0; x < g[0].length; x++) if (g[y][x] === '#') out.push([x, y]); return out; }
function clearLine(cov, x1, y1, x2, y2) { for (var i = 0; i < cov.length; i++) if (segHitsBox(x1, y1, x2, y2, cov[i][0] + 0.02, cov[i][1] + 0.02, 0.96, 0.96)) return false; return true; }
function boundedGaps(row) {                       // open runs bounded on both sides by a blocking cell (not the side wall)
  var out = [], x = 0, blk = function (c) { return c === '#' || c === '^' || c === '~'; };
  while (x < row.length) { if (blk(row[x])) { x++; continue; } var s = x; while (x < row.length && !blk(row[x])) x++; if (s > 0 && x < row.length) out.push({ x: s, len: x - s }); }
  return out;
}

// ---------------- the net: returns { fails:[{check,reason,w}], warns:[...] } ----------------
function runNet(spec, widths) {
  var room = spec.room, kind = spec.kind, stage = spec.stage, spawnsT = spec.spawns || [];
  var fails = [], warns = [];
  function F(check, reason, w) { fails.push({ check: check, reason: reason, w: w }); }
  var isBossRoom = W.isBoss(room), machines = spawnsT.filter(function (s) { return !(ENEMIES[s.type] && ENEMIES[s.type].boss); });
  var hand = kind !== 'combat';
  // ----- C6 (width-free): counts, pool, caps, elites
  (function () {
    var n = machines.length, b = BAND[stage];
    if (kind === 'supply' && spawnsT.length) F('C6', 'supply room holds spawns', 0);
    if (kind === 'boss' && !(spawnsT.length === 1 && ENEMIES[spawnsT[0].type] && ENEMIES[spawnsT[0].type].boss)) F('C6', 'boss room must hold exactly one boss and no adds', 0);
    if (kind !== 'boss') spawnsT.forEach(function (s) { if (ENEMIES[s.type] && ENEMIES[s.type].boss) F('C6', 'boss machine ' + s.type + ' outside a boss room', 0); });
    if (n > T.maxMachines) F('C6', n + ' machines, cap ' + T.maxMachines, 0);
    if (b && (n < b[0] || n > b[1])) F('C6', n + ' machines outside band ' + b[0] + '-' + b[1] + ' for stage ' + stage, 0);
    var waves = {}, cnt = {};
    machines.forEach(function (s) {
      var w = s.wave || 1; waves[w] = (waves[w] || 0) + 1; cnt[s.type] = (cnt[s.type] || 0) + 1;
      if (!ENEMIES[s.type]) F('C6', 'unknown machine ' + s.type + ' (not in the pilot pool)', 0);
      else if (INTRO[s.type] === undefined || INTRO[s.type] > stage) F('C6', s.type + ' not introduced by stage ' + stage, 0);
    });
    Object.keys(waves).forEach(function (w) { if (waves[w] > T.maxPerWave) F('C6', waves[w] + ' alive in wave ' + w + ', max ' + T.maxPerWave, 0); });
    if (n >= T.twoWavesFrom && Object.keys(waves).length < 2) F('C6', n + ' machines in one wave, rooms of ' + T.twoWavesFrom + '+ need two waves', 0);
    Object.keys(TYPE_CAP).forEach(function (t) { if ((cnt[t] || 0) > TYPE_CAP[t]) F('C6', cnt[t] + ' x ' + t + ', type cap ' + TYPE_CAP[t], 0); });
    var sn = SNIPER_IDS.reduce(function (a, t) { return a + (cnt[t] || 0); }, 0); if (sn > Math.floor(n / 6) && sn > 1) F('C6', sn + ' snipers in ' + n + ' machines (max 1 per 6)', 0);
    var el = spawnsT.filter(function (s) { return s.elite; }).length;
    if (el) {
      if (kind !== 'combat') F('C6', 'elite in a ' + kind + ' room', 0);
      else if (!ELITE_STAGES[stage]) F('C6', 'elite at stage ' + stage + ' (Ch1 elite stages 22,27,33,37,43,48 only)', 0);
      else if (el > ELITE_STAGES[stage]) F('C6', el + ' elites at stage ' + stage + ', max ' + ELITE_STAGES[stage], 0);
    }
  })();
  var seenReason = {};
  widths.forEach(function (C) {
    var r = W.room(room, C), g = r.grid, mid = (C - 1) / 2, sp = W.spawns(spawnsT, C, room), S = find(g, 'S'), D = find(g, 'D');
    var cov = coverList(g), cells = 10 * C, nCover = 0, nHaz = 0;
    for (var y = 1; y <= 10; y++) for (var x = 0; x < C; x++) { if (g[y][x] === '#') nCover++; else if (g[y][x] === '^' || g[y][x] === '~') nHaz++; }
    var hasInteriorCover = cov.length > 0;
    // ----- C1 reachability
    var reach = bfsAll(g, S, function (x, y) { return x >= 0 && x < C && y >= 0 && y < TH && (walk(g, x, y)); });
    var doorOk = !!reach[D.x + ',' + D.y];
    if (!doorOk) F('C1', 'door not reachable from start', C);
    sp.forEach(function (s, i) { var tx = Math.floor(s.x), ty = Math.floor(s.y); if (walk(g, tx, ty) && !reach[tx + ',' + ty]) F('C1', 'slot ' + s.type + ' at ' + s.x + ',' + s.y + ' not reachable', C); });
    // ----- C2 two-wide route (spike-free)
    var routeOk = doorOk && route2(g, null);
    if (doorOk && !routeOk) F('C2', 'no 2-wide spike-free route start to door', C);
    // ----- C3 slot rules (after the real widen)
    var valid = [];
    sp.forEach(function (s, i) {
      var tx = Math.floor(s.x), ty = Math.floor(s.y), tag = s.type + ' (' + s.x + ',' + s.y + ')', bad = false;
      if (isCover(g, tx, ty)) { F('C3', 'slot ' + tag + ' inside cover' + (C >= 13 ? ' after widen' : ''), C); bad = true; }
      else if (isHaz(g, tx, ty)) { F('C3', 'slot ' + tag + ' on hazard', C); bad = true; }
      if (ty < T.floorRows[0] || ty > T.floorRows[1]) { F('C3', 'slot ' + tag + ' outside rows 1-10', C); bad = true; }
      if (Math.hypot(s.x - C / 2, s.y - 14.5) < T.minStartDist) F('C3', 'slot ' + tag + ' under ' + T.minStartDist + ' tiles from start', C);
      for (var j = 0; j < i; j++) if (Math.hypot(s.x - sp[j].x, s.y - sp[j].y) < T.minSlotGap) F('C3', 'slots ' + j + ' and ' + i + ' under ' + T.minSlotGap + ' tiles apart', C);
      if (!bad) valid.push(s);
    });
    var live = valid.filter(function (s) { return !(ENEMIES[s.type] && ENEMIES[s.type].boss); });   // boss arenas: only the layout checks run
    // ----- C4 shield pocket + rifle line (flat shooters)
    if (!isBossRoom) {
      var pocketTiles = [], rifleTiles = [];
      Object.keys(reach).forEach(function (k) { var p = k.split(','), x = +p[0], y = +p[1]; if (y < 1 || isCover(g, x, y) || isHaz(g, x, y)) return; pocketTiles.push([x + 0.5, y + 0.5]); if (y >= 6 && y <= 10) rifleTiles.push([x + 0.5, y + 0.5]); });
      live.forEach(function (s) {
        var tag = s.type + ' (' + s.x + ',' + s.y + ')';
        if (FLAT(s.type)) {
          if (hasInteriorCover) { if (!pocketTiles.some(function (t) { return !clearLine(cov, t[0], t[1], s.x, s.y); })) F('C4', 'no shield pocket for ' + tag, C); }
          else warns.push('C4 open room @' + C + ': no cover, no pocket possible for ' + tag);
        }
        if (ENEMIES[s.type] && !ENEMIES[s.type].static || true) { if (!rifleTiles.some(function (t) { return Math.hypot(t[0] - s.x, t[1] - s.y) > 0.6 && clearLine(cov, t[0], t[1], s.x, s.y); })) F('C4', 'no rifle line in rows 6-10 to ' + tag, C); }
      });
      // ----- C5 corner rule (sniper): long-range static machine with a clear line to a bottom-corner tile closer than cornerSniperDist
      live.forEach(function (s) {
        if (!LONG_STATIC(s.type)) return;
        for (var cy = TH - 3; cy < TH; cy++) for (var ci = 0; ci < 3; ci++) [ci, C - 1 - ci].forEach(function (cx) {
          var d = Math.hypot(cx + 0.5 - s.x, cy + 0.5 - s.y);
          if (d < T.cornerSniperDist && !isCover(g, cx, cy) && clearLine(cov, cx + 0.5, cy + 0.5, s.x, s.y)) { var k = 'C5' + s.x + s.y + C; if (!seenReason[k]) { seenReason[k] = 1; F('C5', 'sniper ' + s.type + ' (' + s.x + ',' + s.y + ') has a line to corner tile ' + cx + ',' + cy + ' (' + d.toFixed(1) + ' tiles)', C); } }
        });
      });
    }
    // ----- C7 lane rule: bounded open run in rows 2-10 (fail at 9, warn at 11+); not for boss arenas or rooms without enemies
    if (!isBossRoom && W.hasEnemies(room)) for (var yy = 2; yy <= 10; yy++) boundedGaps(g[yy]).forEach(function (gp) {
      if (gp.len > T.laneMax) { if (C === 9) F('C7', 'row ' + yy + ' bounded open run of ' + gp.len + ' (max ' + T.laneMax + ')', C); else warns.push('C7 @' + C + ' row ' + yy + ' bounded open run ' + gp.len); }
    });
    // ----- C8 safe floor
    var capH = hand ? T.hazardMaxHand : T.hazardMax, safe = cells - nCover - nHaz;
    if (nCover / cells > T.coverMax) F('C8', 'cover ' + (100 * nCover / cells).toFixed(1) + '% over ' + 100 * T.coverMax + '%', C);
    if (nHaz / cells > capH + 1e-9) F('C8', 'hazard ' + (100 * nHaz / cells).toFixed(1) + '% over ' + 100 * capH + '%', C);
    if ((nCover + nHaz) / cells > T.comboMax) F('C8', 'cover + hazard ' + (100 * (nCover + nHaz) / cells).toFixed(1) + '% over ' + 100 * T.comboMax + '%', C);
    if (safe / cells < T.safeMin) F('C8', 'safe floor ' + (100 * safe / cells).toFixed(1) + '% under ' + 100 * T.safeMin + '%', C);
    if (C === 9 && safe < T.safeMinTiles9) F('C8', 'only ' + safe + ' safe tiles at 9 columns (min ' + T.safeMinTiles9 + ')', C);
    if (kind === 'combat' && spawnsT.some(function (s) { return s.elite; }) && nHaz / cells > T.eliteHazardMax) F('C8', 'elite room hazard ' + (100 * nHaz / cells).toFixed(1) + '% over ' + 100 * T.eliteHazardMax + '%', C);
    // ----- X1-X4 (combat rooms with a clean 2-wide route)
    if (!isBossRoom && routeOk) {
      live.forEach(function (s) {          // X1, per spawn: blocking that one tile must leave a 2-wide route (the union fails built stages 2, 4, 6, 7, 8, 9)
        var b = {}; b[Math.floor(s.x) + ',' + Math.floor(s.y)] = 1;
        if (!route2(g, b)) F('X1', 'spawn ' + s.type + ' at column ' + Math.floor(s.x) + ' sits on the only 2-wide start-to-door route', C);
      });
      live.forEach(function (s) {
        var tx = Math.floor(s.x), ty = Math.floor(s.y), e = ENEMIES[s.type];
        if (s.type === 'E-05') {            // X3: charger dash lane (vertical, along the route axis) must leave a 2-wide route
          var lane = {}, len = (e.ai && e.ai.dashDist) || 8;
          [-1, 1].forEach(function (d) { for (var i = 1; i <= len; i++) { var ly = ty + d * i; if (!walk(g, tx, ly) || ly > 12) break; if (ly >= 3) lane[tx + ',' + ly] = 1; } });
          if (!route2(g, lane)) F('X3', 'charger lane at column ' + tx + ' covers the only 2-wide route', C);
        }
        if (s.type === 'E-01') {            // X4: chaser slot in a bounded gap of 2 or less = no side exit
          boundedGaps(g[ty]).forEach(function (gp) { if (tx >= gp.x && tx < gp.x + gp.len && gp.len <= 2) F('X4', 'E-01 at ' + s.x + ',' + s.y + ' in a ' + gp.len + '-wide gap with no side exit', C); });
        }
      });
      if (machines.some(function (s) { return s.type === 'E-04'; }) && nHaz / cells >= T.heavyHazard && live.filter(function (s) { return FLAT(s.type); }).length >= 2) F('X2', 'E-04 ring in a heavy-hazard room (' + (100 * nHaz / cells).toFixed(0) + '%) with 2+ flat shooters', C);
    }
  });
  return { fails: fails, warns: warns };
}

// ---------------- reporting helpers ----------------
function group(fails) {       // collapse the per-width repeats: "C3 slot ... inside cover after widen [13,15]"
  var m = {}, order = [];
  fails.forEach(function (f) { var k = f.check + '|' + f.reason; if (!m[k]) { m[k] = { check: f.check, reason: f.reason, ws: [] }; order.push(k); } if (f.w && m[k].ws.indexOf(f.w) < 0) m[k].ws.push(f.w); });
  return order.map(function (k) { return m[k]; });
}
function line(g) { return g.check + ' ' + g.reason + (g.ws.length ? ' [' + g.ws.join(',') + ']' : ''); }
function loadDir(d) { var p = path.join(__dirname, 'fixtures', d); return fs.existsSync(p) ? fs.readdirSync(p).filter(function (f) { return /\.json$/.test(f); }).sort().map(function (f) { var j = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')); j._file = d + '/' + f; return j; }) : []; }

var t0 = Date.now(), failCount = 0, rows = [], out = [];
function bad(msg) { failCount++; out.push('FAIL ' + msg); }

var good = loadDir('good'), badFx = loadDir('bad');
if (good.length !== 3) bad('fixtures/good must hold exactly the 3 built combat rooms (found ' + good.length + ')');
if (badFx.length < 10) bad('fixtures/bad must hold at least the 10 planted rooms (found ' + badFx.length + ')');
good.forEach(function (fx) {
  var res = runNet(fx, WIDTHS), gs = group(res.fails);
  rows.push(['good', fx._file, 'pass', gs.length ? 'FAIL: ' + gs.map(line).join('; ') : 'pass (0 fails, ' + res.warns.length + ' warns)']);
  if (gs.length) bad(fx._file + ' should pass but fails: ' + gs.map(line).join('; '));
});
badFx.forEach(function (fx) {
  var res = runNet(fx, WIDTHS), gs = group(res.fails), checks = {}; gs.forEach(function (g) { checks[g.check] = 1; });
  var ids = Object.keys(checks), want = fx.expect, hit = gs.filter(function (g) { return g.check === want.check && g.reason.toLowerCase().indexOf(want.reason.toLowerCase()) >= 0; });
  var okFx = ids.length === 1 && ids[0] === want.check && hit.length > 0;
  rows.push(['bad', fx._file, want.check + ' (' + want.reason + ')', okFx ? 'rejected: ' + hit.map(line)[0] : 'WRONG: failed ' + (gs.map(line).join('; ') || 'nothing')]);
  if (!okFx) bad(fx._file + ' expected exactly ' + want.check + ' "' + want.reason + '", got ' + (gs.map(line).join('; ') || 'no failure'));
});

// ---------------- every stage row and room in V.Data.stages.ch1 ----------------
var st = V.Data.stages.ch1, KINDS = { combat: 1, supply: 1, cache: 1, boss: 1 }, stageWarns = [], nRooms = 0, mixes = [], usesByRoom = {};
st.forEach(function (row, i) {
  var tag = 'stage ' + row.stage;
  if (row.stage !== i + 1) bad(tag + ': stage number out of order (expected ' + (i + 1) + ')');
  if (!KINDS[row.kind]) bad(tag + ': unknown kind ' + row.kind);
  var R = V.ROOMS[row.room];
  if (!R) { bad(tag + ': room ' + row.room + ' missing'); return; }
  nRooms++;
  var res = runNet({ kind: row.kind, stage: row.stage, room: R, spawns: row.spawns || [] }, WIDTHS);
  group(res.fails).forEach(function (g) { bad(tag + ' room ' + row.room + ': ' + line(g)); });
  res.warns.forEach(function (w) { stageWarns.push(tag + ' ' + w); });
  var mix = (row.spawns || []).map(function (s) { return s.type; }).sort().join(','); mixes.push(row.room + '|' + mix); usesByRoom[row.room] = (usesByRoom[row.room] || 0) + 1;
});
// ----- C9 sameness report (warn list, never a failure). Uses src/bake-meta.json templateId/shift/swap when present, else the room id.
var meta = null; try { meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'bake-meta.json'), 'utf8')); } catch (e) {}
var c9 = [], distinct = {}; mixes.forEach(function (m) { distinct[m] = 1; });
Object.keys(usesByRoom).forEach(function (r) { if (usesByRoom[r] > T.sameTemplateMax) c9.push('C9 room ' + r + ' used ' + usesByRoom[r] + ' times (over ' + T.sameTemplateMax + ')'); });
for (var i = 1; i < mixes.length; i++) if (mixes[i] === mixes[i - 1] && !/\|$/.test(mixes[i])) c9.push('C9 stages ' + i + ' and ' + (i + 1) + ' equal (room and machine mix)');
if (meta) c9.push('C9 note: bake-meta.json present (' + (Array.isArray(meta) ? meta.length : Object.keys(meta).length) + ' entries); template/shift/swap sameness is read from room id only for now');
c9.unshift('C9 distinct (room, machine mix) pairs: ' + Object.keys(distinct).length + ' over ' + st.length + ' stages');

// ---------------- output ----------------
console.log('Static net: ' + good.length + ' good + ' + badFx.length + ' bad fixtures; ' + st.length + ' stage rows (' + nRooms + ' rooms) at widths ' + WIDTHS.join('/') + '; data-stages-gen.js ' + (HAVE_GEN ? 'LOADED' : 'ABSENT (rows 1-' + st.length + ' only)'));
console.log('Fixtures:');
rows.forEach(function (r) { console.log('  ' + (r[0] + '    ').slice(0, 5) + (r[1] + '                                  ').slice(0, 34) + (r[2] + '                                 ').slice(0, 34) + ' ' + r[3]); });
console.log('Warnings (C7 at 11+, C4 open rooms, C9): ' + (stageWarns.length + c9.length));
c9.forEach(function (w) { console.log('  ' + w); });
var shown = {}, n = 0; stageWarns.forEach(function (w) { var k = w.replace(/@\d+/, '@*'); if (!shown[k] && n < 12) { shown[k] = 1; n++; console.log('  ' + w); } });
if (stageWarns.length > n) console.log('  ... ' + (stageWarns.length - n) + ' more stage warnings');
out.forEach(function (l) { console.log(l); });
console.log((failCount ? 'FAILED ' : 'ALL PASS ') + failCount + ' fail(s); ' + (Date.now() - t0) + ' ms');
process.exit(failCount ? 1 : 0);
