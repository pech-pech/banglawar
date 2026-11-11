'use strict';
// Static room checks for the bake (GEN-SPEC 4.1, 4.2), run on the REAL widen output at 9, 11, 13 and 15 columns.
// Pure functions over V.Widen; no rng, no clock. Returns fail codes like 'C3@13'.
var H = 15, WIDTHS = [9, 11, 13, 15], STEP = [[1, 0], [-1, 0], [0, 1], [0, -1]];
var FLAT = { 'E-03': 1 };   // flat shooter = the static turret (the built R01 stage 3 holds an E-02 with no cover, so E-02 is not "flat" here)

var BOSSVIS_MIN = 70;   // percent, [G]
function k0(W) { return (W - 9) / 2; }
function mk(V) {
  function solid(g, W, x, y) { return x < 0 || y < 0 || x >= W || y >= H || g[y][x] === '#'; }
  function flood(g, W, avoidSpikes, blocked) {
    var seen = {}, q = [], x;
    for (x = 0; x < W; x++) if (!solid(g, W, x, 14)) { q.push([x, 14]); seen[x + ',14'] = 1; }
    while (q.length) {
      var c = q.shift();
      for (var i = 0; i < 4; i++) {
        var nx = c[0] + STEP[i][0], ny = c[1] + STEP[i][1], k = nx + ',' + ny;
        if (seen[k] || solid(g, W, nx, ny)) continue;
        if (avoidSpikes && g[ny][nx] === '^') continue;
        if (blocked && blocked[k]) continue;
        seen[k] = 1; q.push([nx, ny]);
      }
    }
    return seen;
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
  function clearLine(g, W, x1, y1, x2, y2) {
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++)
      if (g[y][x] === '#' && segHitsBox(x1, y1, x2, y2, x + 0.02, y + 0.02, 0.96, 0.96)) return false;
    return true;
  }
  // a walkable route start to door that is 2 tiles wide: slide a free 2x2 window from the start rows to the door rows
  function route2(g, W, blocked, near) {   // near: X1 mode, the goal is any window in rows 1-2 within one column of the centre
    var mid = (W - 1) / 2;
    function free(x, y) { return !solid(g, W, x, y) && g[y][x] !== '^' && !(blocked && blocked[x + ',' + y]); }
    function win(x, y) { return x >= 0 && y >= 1 && x + 1 < W && y + 1 < H && free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1); }
    var q = [], seen = {}, i;
    [mid - 1, mid].forEach(function (x) { if (win(x, 13)) { q.push([x, 13]); seen[x + ',13'] = 1; } });
    while (q.length) {
      var c = q.shift();
      if (near ? (c[1] <= 2 && c[0] >= mid - 2 && c[0] <= mid + 1) : (c[1] === 1 && (c[0] === mid - 1 || c[0] === mid))) return true;
      for (i = 0; i < 4; i++) {
        var nx = c[0] + STEP[i][0], ny = c[1] + STEP[i][1], k = nx + ',' + ny;
        if (!seen[k] && win(nx, ny)) { seen[k] = 1; q.push([nx, ny]); }
      }
    }
    return false;
  }
  function longestRun(g, W) {   // longest open straight run (tiles) in rows 2-10, horizontal or vertical. Info only (C7 threshold is open).
    var best = 0, x, y, n;
    for (y = 2; y <= 10; y++) { n = 0; for (x = 0; x < W; x++) { n = (g[y][x] === '#' || g[y][x] === '^') ? 0 : n + 1; if (n > best) best = n; } }
    for (x = 0; x < W; x++) { n = 0; for (y = 2; y <= 10; y++) { n = (g[y][x] === '#' || g[y][x] === '^') ? 0 : n + 1; if (n > best) best = n; } }
    return best;
  }
  function stats(g, W) {
    var floor = 0, cover = 0, haz = 0, x, y;
    for (y = 1; y <= 10; y++) for (x = 0; x < W; x++) { floor++; if (g[y][x] === '#') cover++; else if (g[y][x] === '^') haz++; }
    return { floor: floor, cover: cover, haz: haz, safe: floor - cover - haz };
  }

  // def = built room shape {name,cover,grid,spawns}; spawns = stage spawn list [{type,x,y,t,wave?}]; info = { n, haz (0 or 1) }
  function checkCombat(def, spawns, info) {
    var fails = [], F = function (c, w, d) { fails.push(c + '@' + w + (d ? ' ' + d : '')); }, runInfo = {};
    var types = {}; spawns.forEach(function (s) { types[s.type] = (types[s.type] || 0) + 1; });
    WIDTHS.forEach(function (W) {
      var r = V.Widen.room(def, W), g = r.grid, mid = (W - 1) / 2, SP = V.Widen.spawns(spawns, W, def), i, j, x, y;
      if (g.length !== H || !g.every(function (row) { return row.length === W; })) { F('GRID', W); return; }
      if (g[14][mid] !== 'S' || g[0][mid] !== 'D') F('GRID', W, 'door or start misplaced');
      var reach = flood(g, W, false), safe = flood(g, W, true);
      // C1
      if (!safe[mid + ',1']) F('C1', W, 'door not reachable off spikes');
      SP.forEach(function (s) { var tx = Math.floor(s.x), ty = Math.floor(s.y); if (!reach[tx + ',' + ty]) F('C1', W, 'slot ' + tx + ',' + ty + ' unreachable'); });
      // C2
      if (!route2(g, W)) F('C2', W, 'no 2-wide route');
      // C3
      SP.forEach(function (s, a) {
        var tx = Math.floor(s.x), ty = Math.floor(s.y), tag = s.type + '@' + tx + ',' + ty;
        if (solid(g, W, tx, ty)) F('C3', W, tag + ' inside cover');
        else if (g[ty][tx] === '^') F('C3', W, tag + ' on spikes');
        if (ty < 1 || ty > 10) F('C3', W, tag + ' outside rows 1-10');
        if (Math.hypot(s.x - W / 2, s.y - 14.5) < 5) F('C3', W, tag + ' under 5 tiles from start');
        // D4 (QA): a spawn must not hug cover; at least 3 of its 4 side neighbours are open floor (grid edge counts as closed)
        var openN = 0; for (i = 0; i < 4; i++) { var qx = tx + STEP[i][0], qy = ty + STEP[i][1]; if (qx >= 0 && qx < W && qy >= 1 && qy < H && g[qy][qx] !== '#') openN++; }
        if (openN < 3) F('C3', W, tag + ' hugs cover (' + openN + ' of 4 sides open)');
        if (!(s.t >= 0 && s.t <= 10)) F('C3', W, tag + ' t outside 0..10');
        for (j = a + 1; j < SP.length; j++) if (Math.hypot(s.x - SP[j].x, s.y - SP[j].y) < 1.5) F('C3', W, tag + ' under 1.5 from ' + SP[j].type + '@' + Math.floor(SP[j].x) + ',' + Math.floor(SP[j].y));
      });
      // floor tiles for pocket and visibility tests
      var floorT = [];
      for (y = 1; y < H; y++) for (x = 0; x < W; x++) if (!solid(g, W, x, y) && g[y][x] !== '^' && reach[x + ',' + y]) floorT.push([x + 0.5, y + 0.5]);
      SP.forEach(function (s) {
        var tag = s.type + '@' + Math.floor(s.x) + ',' + Math.floor(s.y);
        // C4: pocket per flat shooter; rifle line from each slot (a tile in rows 6-10 that sees it)
        if (FLAT[s.type]) {
          var pocket = floorT.some(function (f) { return !clearLine(g, W, f[0], f[1], s.x, s.y); });
          if (!pocket) F('C4', W, tag + ' no shield pocket');
          // built-room rules for the turret (test-stages.js): clear line from start, seen from 60 percent of the floor
          if (Math.hypot(s.x - W / 2, s.y - 14.5) <= 2.5) F('C4', W, tag + ' within 2.5 of start');
          if (!clearLine(g, W, W / 2, 14.5, s.x, s.y)) F('C4', W, tag + ' no clear line from start');
          var vis = floorT.filter(function (f) { return clearLine(g, W, f[0], f[1], s.x, s.y); }).length / floorT.length;
          if (vis < 0.6) F('C4', W, tag + ' seen from ' + Math.round(vis * 100) + ' percent of floor');
        }
        var rifle = floorT.some(function (f) { return f[1] >= 6 && f[1] <= 11 && clearLine(g, W, f[0], f[1], s.x, s.y); });
        if (!rifle) F('C4', W, tag + ' no rifle line from rows 6-10');
      });
      // C5: bottom 3x3 corners hold no cover or spikes (rows 12-14); no turret line to a corner tile is a sniper rule, no sniper in the pool
      for (y = 12; y < H; y++) for (x = 0; x < 3; x++) {
        [x, W - 1 - x].forEach(function (cx) { if (g[y][cx] === '#' || g[y][cx] === '^') F('C5', W, 'cover or spikes in corner ' + cx + ',' + y); });
      }
      // C8
      var st = stats(g, W), cp = st.cover * 100 / st.floor, hp = st.haz * 100 / st.floor;
      if (cp > 18) F('C8', W, 'cover ' + cp.toFixed(1) + ' percent');
      if (hp > 20) F('C8', W, 'hazard ' + hp.toFixed(1) + ' percent');
      if (info.elite && hp > 15) F('C8', W, 'elite room hazard over 15 percent');
      if (cp + hp > 40) F('C8', W, 'combined over 40 percent');
      if (st.safe * 100 / st.floor < 55) F('C8', W, 'safe floor under 55 percent');
      if (W === 9 && st.safe < 20) F('C8', W, 'fewer than 20 safe tiles');
      if (info.haz === 0 && st.haz > 0) F('HAZ', W, 'hazard in a H0 room');
      if (info.haz > 0 && st.haz === 0) F('HAZ', W, 'H1 room has no spikes');
      if (info.haz > 0 && hp > 15) F('HAZ', W, 'H1 over 15 percent');
      // spike gaps (built rule, test-stages.js)
      g.forEach(function (row, yy) { if (row.indexOf('^') < 0) return; var runs = row.split(/\^+/).filter(function (q) { return q.length; }); if (!runs.every(function (q) { return q.length >= 2; })) F('C8', W, 'spike gap under 2 in row ' + yy); });
      // X1 (my reading, the built R01/R02 rooms put spawns on the centre column and on the side corridors, so a strict "on the 2-wide route"
      // test fails them): spawn tiles taken as walls must still leave a walkable route start to door, and no spawn on the door approach.
      var blk = {}; SP.forEach(function (s) { blk[Math.floor(s.x) + ',' + Math.floor(s.y)] = 1; });
      if (!flood(g, W, true, blk)[mid + ',1']) F('X1', W, 'spawns seal the route to the door');
      SP.forEach(function (s) { if (Math.floor(s.y) <= 1 && Math.abs(Math.floor(s.x) - mid) <= 1) F('X1', W, 'spawn on the door approach'); });
      // X2 / X3 / X4
      if (types['E-04'] && hp > 10 && (types['E-03'] || 0) >= 2) F('X2', W, 'E-04 ring with heavy hazard and 2+ flat shooters');
      SP.forEach(function (s) {
        var tx = Math.floor(s.x), ty = Math.floor(s.y), tag = s.type + '@' + tx + ',' + ty;
        if (s.type === 'E-05' && Math.abs(tx - mid) <= 1) F('X3', W, tag + ' charger lane on the centre route');
        if (s.type === 'E-01') {
          var open = 0; for (i = 0; i < 4; i++) { var nx = tx + STEP[i][0], ny = ty + STEP[i][1]; if (!solid(g, W, nx, ny) && ny >= 1 && g[ny][nx] !== '^') open++; }
          if (open < 2) F('X4', W, tag + ' no side exit');
        }
      });
      runInfo[W] = { run: longestRun(g, W), cover: +cp.toFixed(1), haz: +hp.toFixed(1) };
    });
    return { fails: fails, info: runInfo };
  }

  // boss arena (data only): same shape as BA1, new cover. Static rules; the corner-shooter bot check is run separately (R49).
  function checkBoss(def, spawns) {
    var fails = [], F = function (c, w, d) { fails.push(c + '@' + w + (d ? ' ' + d : '')); }, g0 = def.grid, x, y;
    var b = null; for (y = 0; y < H; y++) { x = g0[y].indexOf('B'); if (x >= 0) b = { x: x, y: y }; }
    if (!b) { F('BOSS', 9, 'no B'); return { fails: fails }; }
    if (spawns.length !== 1 || spawns[0].type !== 'B-01' || Math.floor(spawns[0].x) !== b.x || Math.floor(spawns[0].y) !== b.y) F('BOSS', 9, 'spawn not on B');
    for (y = 0; y < H; y++) for (x = 0; x < 9; x++) {
      if (g0[y][x] === '#' && y > 0 && (y > 10 || y < 1)) F('BOSS', 9, 'cover outside rows 1-10');
      if (g0[y][x] === '#' && y > 0 && Math.abs(x - b.x) <= 1 && Math.abs(y - b.y) <= 1) F('BOSS', 9, 'cover in the 1-tile ring round B');
    }
    for (y = 0; y < H; y++) if (g0[y] !== g0[y].split('').reverse().join('')) F('BOSS', 9, 'row ' + y + ' not mirrored');
    WIDTHS.forEach(function (W) {
      var r = V.Widen.room(def, W), g = r.grid, mid = (W - 1) / 2;
      if (!route2(g, W)) F('C2', W, 'no 2-wide route');
      var safe = flood(g, W, true); if (!safe[mid + ',1']) F('C1', W, 'door not reachable');
      var st = stats(g, W); if (st.cover * 100 / st.floor > 18) F('C8', W, 'cover over 18 percent');
      for (y = 11; y < H; y++) for (x = 0; x < W; x++) if (g[y][x] === '#' || g[y][x] === '^') F('C5', W, 'cover in rows 11-14');
      // BOSSVIS: the boss must be shootable. Share of safe floor tiles (rows 4-14, no cover, no spikes) with a clear line to the boss (it never moves).
      var bx = b.x + k0(W) + 0.5, by = b.y + 0.5, tot = 0, vis = 0, vc = 0, vct = 0;
      for (y = 4; y < H; y++) for (x = 0; x < W; x++) {
        if (g[y][x] === '#' || g[y][x] === '^') continue;
        tot++; var cl = clearLine(g, W, x + 0.5, y + 0.5, bx, by); if (cl) vis++;
        if (y >= 11) { vct++; if (cl) vc++; }
      }
      if (vis * 100 / tot < BOSSVIS_MIN) F('BOSSVIS', W, 'boss seen from ' + Math.round(vis * 100 / tot) + ' percent of safe floor (need ' + BOSSVIS_MIN + ')');
      if (vc * 100 / vct < BOSSVIS_MIN) F('BOSSVIS', W, 'boss seen from ' + Math.round(vc * 100 / vct) + ' percent of rows 11-14 (need ' + BOSSVIS_MIN + ')');
      if (!clearLine(g, W, (W) / 2, 14.5, bx, by)) F('BOSSVIS', W, 'no clear line from the start tile');
    });
    return { fails: fails };
  }
  return { checkCombat: checkCombat, checkBoss: checkBoss, clearLine: clearLine, flood: flood, route2: route2, stats: stats };
}
module.exports = { mk: mk, WIDTHS: WIDTHS };
