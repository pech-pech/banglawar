'use strict';
// Static room checks for the bake (GEN-SPEC 4.1, 4.2), run on the REAL widen output at 9, 11, 13 and 15 columns.
// Pure functions over V.Widen; no rng, no clock. Returns fail codes like 'C3@13'.
var H = 15, WIDTHS = [9, 11, 13, 15], STEP = [[1, 0], [-1, 0], [0, 1], [0, -1]];
var FLAT = { 'E-03': 1, 'E-08': 1 };   // flat shooter = the static turrets E-03 and E-08 sniper (the built R01 stage 3 holds an E-02 with no cover, so E-02 is not "flat" here)
var SNIPER = { 'E-08': 1 }, SNIPER_CORNER = 5.0;   // C5 sniper rule (step 7): no clear sniper line to a bottom 3x3 corner tile closer than 5 tiles
var SPLIT = { 'E-06': 1 };   // step 7: the splitter needs room to split, all 4 side tiles and 3 of 4 diagonal tiles open floor (no cover, spikes or room edge)
var HERO_R = 0.35, MOVE = 4.5, TELL_MULT = 0.85;   // hero body, walk speed (tiles/s), tune.js TELL_MULT

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
      // C5 sniper (E-08): no clear line to a bottom-corner tile within 5 tiles
      SP.forEach(function (s) {
        if (!SNIPER[s.type]) return;
        for (var cy = 12; cy < H; cy++) for (var ci = 0; ci < 3; ci++) [ci, W - 1 - ci].forEach(function (cx) {
          if (Math.hypot(cx + 0.5 - s.x, cy + 0.5 - s.y) < SNIPER_CORNER && g[cy][cx] !== '#' && clearLine(g, W, cx + 0.5, cy + 0.5, s.x, s.y)) F('C5', W, s.type + '@' + Math.floor(s.x) + ',' + Math.floor(s.y) + ' sniper line to corner ' + cx + ',' + cy);
        });
      });
      // SPLIT (E-06): room to split, halves pop toward open floor
      SP.forEach(function (s) {
        if (!SPLIT[s.type]) return;
        var tx = Math.floor(s.x), ty = Math.floor(s.y), o4 = 0, o8 = 0;
        function op(x, y) { return x >= 0 && x < W && y >= 1 && y <= 13 && g[y][x] !== '#' && g[y][x] !== '^'; }
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { if (op(tx + d[0], ty + d[1])) o4++; });
        [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (d) { if (op(tx + d[0], ty + d[1])) o8++; });
        if (o4 < 4 || o8 < 3) F('SPLIT', W, s.type + '@' + tx + ',' + ty + ' no room to split (' + o4 + ' of 4 sides, ' + o8 + ' of 4 diagonals open)');
      });
      // C5: bottom 3x3 corners hold no cover or spikes (rows 12-14)
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

  // Step 7 mobile-boss arena rules [G thresholds]. Floor = rows 1-14, no cover, no spikes.
  //  B-02 (hops, landing ring r 1.8, tell 1.0): LAND share of floor tiles in rows 2-12 that are a cover-free landing centre (no cover cell within 1.8 + 0.5) >= 50; HOPSAFE: no floor tile out of reach of every landing ring;
  //        RINGOUT: from every floor tile the hero can walk out of a ring centred on it (to 1.8 + hero r) within the effective tell (1.0 x 0.85 s x 4.5 tiles/s).
  //  B-03 / B-03V (rolls toward the hero, lane-ribbon tell 0.8): LANE share of floor tiles in rows 4-14 the boss body can roll to from its start in a straight
  //        line (swept body clear of cover) >= 50 (cover may shadow at most half the floor from a roll); SIDESTEP: from every floor tile a tile out of the lane (body r + hero r + 0.15 off the line) is walkable within the tell.
  //  B-04 (walks, body r): WALK share of floor tiles in rows 1-12 the body can reach (body-sized window flood from the start) >= 85.
  function mobileChecks(g, W, type, R, bx, by, F) {
    var out = {}, x, y, fl = [], cov = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { if (g[y][x] === '#') cov.push([x, y]); else if (y >= 1 && g[y][x] !== '^') fl.push([x, y]); }
    function nearCover(px, py, r) { return cov.some(function (c) { var qx = Math.max(c[0], Math.min(px, c[0] + 1)), qy = Math.max(c[1], Math.min(py, c[1] + 1)); return Math.hypot(px - qx, py - qy) < r; }); }
    function walkOut(sx, sy, ok, budget) {   // 8-way BFS over floor tiles (diagonal costs 1.414); true when a tile with ok(x,y) is reached within budget tiles
      var best = {}, q = [[sx, sy, 0]]; best[sx + ',' + sy] = 0;
      while (q.length) {
        q.sort(function (a, b) { return a[2] - b[2]; }); var c = q.shift();
        if (ok(c[0] + 0.5, c[1] + 0.5)) return true;
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue; var nx = c[0] + dx, ny = c[1] + dy;
          if (nx < 0 || ny < 1 || nx >= W || ny >= H || g[ny][nx] === '#' || g[ny][nx] === '^') continue;
          if (dx && dy && (g[c[1]][nx] === '#' || g[ny][c[0]] === '#')) continue;
          var d = c[2] + (dx && dy ? 1.414 : 1); if (d > budget || (best[nx + ',' + ny] !== undefined && best[nx + ',' + ny] <= d)) continue;
          best[nx + ',' + ny] = d; q.push([nx, ny, d]);
        }
      }
      return false;
    }
    if (type === 'B-02') {
      var RR = 1.8, tellW = 1.0 * TELL_MULT * MOVE, lt = 0, lo = 0, badOut = 0;
      fl.forEach(function (f) { if (f[1] >= 2 && f[1] <= 12) { lt++; if (!nearCover(f[0] + 0.5, f[1] + 0.5, RR + 0.5)) lo++; } });
      fl.forEach(function (f) { var cx = f[0] + 0.5, cy = f[1] + 0.5; if (!walkOut(f[0], f[1], function (px, py) { return Math.hypot(px - cx, py - cy) >= RR + HERO_R; }, tellW)) badOut++; });
      // HOPSAFE (B2 review): a floor tile no landing ring can reach = a hop-safe pocket. B-02 lands its body (r + 0.05 clear of cover and walls,
      // boss-b02.js) anywhere on open floor; a tile is reachable when some valid body centre (0.25 grid) lies within ring r 1.8 of the tile centre.
      var cen = [], px, py, pocket = [];
      for (py = 1 + R; py <= H - R; py += 0.25) for (px = R; px <= W - R; px += 0.25) {
        var okc = !nearCover(px, py, R + 0.05);
        if (okc) for (var sy = Math.floor(py - R - 0.05); sy <= Math.floor(py + R + 0.05) && okc; sy++) for (var sx = Math.floor(px - R - 0.05); sx <= Math.floor(px + R + 0.05); sx++) if (sy >= 0 && sy < H && sx >= 0 && sx < W && g[sy][sx] === '^' && Math.hypot(px - Math.max(sx, Math.min(px, sx + 1)), py - Math.max(sy, Math.min(py, sy + 1))) < R + 0.05) { okc = false; break; }
        if (okc) cen.push([px, py]);
      }
      fl.forEach(function (f) { var cx = f[0] + 0.5, cy = f[1] + 0.5; if (!cen.some(function (c) { return Math.hypot(c[0] - cx, c[1] - cy) <= RR; })) pocket.push(f[0] + ',' + f[1]); });
      out.hopSafe = pocket.length;
      if (pocket.length) F('HOPSAFE', W, 'B-02 hop-safe pocket at ' + pocket.join(' '));
      out.land = Math.round(lo * 100 / lt); out.ringOutFail = badOut;
      if (out.land < 50) F('LAND', W, 'B-02 landing floor ' + out.land + ' percent of rows 2-12 (need 50)');   // was 60; HOPSAFE is the exact pocket rule
      if (badOut) F('RINGOUT', W, badOut + ' floor tiles cannot leave a landing ring in the tell');
    } else if (type === 'B-03' || type === 'B-03V') {
      var tellR = 0.8 * TELL_MULT * MOVE, off = R + HERO_R + 0.15, lt3 = 0, lc = 0, badSide = 0;
      fl.forEach(function (f) {
        if (f[1] < 4) return; lt3++;
        var tx = f[0] + 0.5, ty = f[1] + 0.5, len = Math.hypot(tx - bx, ty - by), ok = true;
        for (var t = 0; t <= len && ok; t += 0.1) { var px = bx + (tx - bx) * t / len, py = by + (ty - by) * t / len; if (nearCover(px, py, R - 0.05)) ok = false; }
        if (ok) lc++;
        var ux = (tx - bx) / (len || 1), uy = (ty - by) / (len || 1);
        if (!walkOut(f[0], f[1], function (px, py) { return Math.abs((px - bx) * uy - (py - by) * ux) >= off; }, tellR)) badSide++;
      });
      out.lane = Math.round(lc * 100 / lt3); out.sideFail = badSide;
      if (out.lane < 50) F('LANE', W, type + ' roll lanes reach ' + out.lane + ' percent of rows 4-14 (need 50)');
      if (badSide) F('SIDESTEP', W, badSide + ' floor tiles cannot step out of a roll lane in the tell');
    } else if (type === 'B-04') {
      var seen = {}, q = [[Math.floor(bx), Math.floor(by)]], n = 0, tot4 = 0;
      function bodyOk(cx, cy) { return cx - R >= 0 && cx + R <= W && cy - R >= 1 && cy + R <= H && !nearCover(cx, cy, R); }
      seen[q[0][0] + ',' + q[0][1]] = 1;
      while (q.length) { var c = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + ',' + ny; if (!seen[k] && nx >= 0 && nx < W && ny >= 1 && ny < H && bodyOk(nx + 0.5, ny + 0.5)) { seen[k] = 1; q.push([nx, ny]); } }); }
      fl.forEach(function (f) { if (f[1] > 12) return; tot4++; var hit = false; for (var dx = -1; dx <= 1 && !hit; dx++) for (var dy = -1; dy <= 1 && !hit; dy++) if (seen[(f[0] + dx) + ',' + (f[1] + dy)] && Math.hypot(dx, dy) <= R + 0.5) hit = true; if (hit) n++; });
      out.walk = Math.round(n * 100 / tot4);
      if (out.walk < 85) F('WALK', W, 'B-04 body reaches ' + out.walk + ' percent of rows 1-12 (need 85)');
    }
    return out;
  }

  // boss arena (data only): same shape as BA1, new cover. Static rules; the corner-shooter bot check is run separately (R49).
  function checkBoss(def, spawns, bossType, bossR) {
    bossType = bossType || 'B-01'; bossR = bossR || 1;
    var fails = [], info = {}, F = function (c, w, d) { fails.push(c + '@' + w + (d ? ' ' + d : '')); }, g0 = def.grid, x, y;
    var b = null; for (y = 0; y < H; y++) { x = g0[y].indexOf('B'); if (x >= 0) b = { x: x, y: y }; }
    if (!b) { F('BOSS', 9, 'no B'); return { fails: fails }; }
    if (spawns.length !== 1 || spawns[0].type !== bossType || Math.floor(spawns[0].x) !== b.x || Math.floor(spawns[0].y) !== b.y) F('BOSS', 9, 'spawn not on B');
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
      var mob = mobileChecks(g, W, bossType, bossR, bx, by, F);
      info[W] = { vis: Math.round(vis * 100 / tot), visBottom: Math.round(vc * 100 / vct) }; for (var mk in mob) info[W][mk] = mob[mk];
    });
    return { fails: fails, info: info };
  }
  return { checkCombat: checkCombat, checkBoss: checkBoss, clearLine: clearLine, flood: flood, route2: route2, stats: stats };
}
module.exports = { mk: mk, WIDTHS: WIDTHS, FLAT: FLAT, SNIPER: SNIPER, SPLIT: SPLIT };
