// Headless check for parts/stages.js (node src/test-stages.js). Also prints an ASCII map per stage.
var path = require('path');
require(path.join(__dirname, 'parts/rooms.js'));
require(path.join(__dirname, 'parts/stages.js'));
require(path.join(__dirname, 'parts/widen.js')); // R42 stepped rooms: every stage is checked at 9, 11, 13 and 15 columns
var V = globalThis.V;
var fails = 0, passes = 0;
function ok(c, msg){ if (c) passes++; else { fails++; console.log('FAIL ' + msg); } }

var W = 9, H = 15; // W = column class under test (set per class below); templates stay 9 wide
var EXPECT = { // D3 2.1 rows 1-10 + DESIGN 9 (stage 4 eased, stage 6/8 swapped, stage 8 N=5), B-01 at 10
  1:{kind:'combat', room:'R01', n:{'E-01':3}},
  2:{kind:'combat', room:'R02', n:{'E-01':4}},
  3:{kind:'combat', room:'R01', n:{'E-01':1,'E-02':2}},
  4:{kind:'combat', room:'R02', n:{'E-01':1,'E-02':1,'E-03':1}},
  5:{kind:'supply', room:'SD',  n:{}},
  6:{kind:'combat', room:'R03', n:{'E-01':1,'E-02':2,'E-04':1}},
  7:{kind:'combat', room:'R02', n:{'E-01':2,'E-05':2}},
  8:{kind:'combat', room:'R02', n:{'E-01':1,'E-02':1,'E-03':1,'E-05':1}},
  9:{kind:'cache',  room:'CA1', n:{'E-01':2}},
  10:{kind:'boss',  room:'BA1', n:{'B-01':1}}
};
var FIRST = { 'E-01':1, 'E-02':3, 'E-03':4, 'E-04':6, 'E-05':7, 'B-01':10 };

function solid(g, x, y){ return x < 0 || y < 0 || x >= W || y >= H || g[y][x] === '#'; }
function blocksWalk(g, x, y){ return solid(g, x, y) || g[y][x] === '~'; }
function find(g, ch){ for (var y = 0; y < H; y++) { var x = g[y].indexOf(ch); if (x >= 0) return {x:x, y:y}; } return null; }
function flood(g, avoidSpikes){
  var seen = {}, q = [], s = find(g, 'S');
  for (var x = 0; x < W; x++) if (!blocksWalk(g, x, 14)) { q.push([x, 14]); seen[x + ',14'] = 1; } // spawn row
  while (q.length) {
    var c = q.shift(), d = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var i = 0; i < 4; i++) {
      var nx = c[0] + d[i][0], ny = c[1] + d[i][1], k = nx + ',' + ny;
      if (seen[k] || blocksWalk(g, nx, ny)) continue;
      if (avoidSpikes && g[ny][nx] === '^') continue;
      seen[k] = 1; q.push([nx, ny]);
    }
  }
  return seen;
}
// segment vs '#' cells (cover blocks the Operator's line), slab test
function segHitsBox(x1, y1, x2, y2, bx, by, bw, bh){
  var t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1, p = [-dx, dx, -dy, dy], q = [x1 - bx, bx + bw - x1, y1 - by, by + bh - y1];
  for (var i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    var r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
function clearLine(g, x1, y1, x2, y2){
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++)
    if (g[y][x] === '#' && segHitsBox(x1, y1, x2, y2, x + 0.02, y + 0.02, 0.96, 0.96)) return false;
  return true;
}

var st = V.STAGES && V.STAGES.ch1;
ok(Array.isArray(st) && st.length === 10, 'ch1 has 10 stages');
var seenType = {}, report = [], maps = [];
[9, 11, 13, 15].forEach(function(CC){ W = CC; var ref = CC === 9, mid = (W - 1) / 2;
st.forEach(function(s, i){
  var tag = 'stage ' + s.stage + (ref ? '' : ' @' + W) + ': ';
  var E = EXPECT[s.stage];
  ok(s.stage === i + 1, tag + 'stage number in order');
  ok(E && s.kind === E.kind, tag + 'kind ' + s.kind + ' expected ' + (E && E.kind));
  ok(E && s.room === E.room, tag + 'room ' + s.room + ' expected ' + (E && E.room));
  var R = V.ROOMS[s.room]; ok(!!R, tag + 'room exists');
  if (!R) return;
  var g = V.Widen.room(R, W).grid, SP = V.Widen.spawns(s.spawns, W, R); // widened room and spawns (identity at 9)
  ok(g.length === H && g.every(function(r){ return r.length === W; }), tag + 'grid is 15x' + W);
  ok(/^#+D#+$/.test(g[0]) && g[0].indexOf('D') === mid, tag + 'door top centre');
  var S = find(g, 'S'); ok(S && S.y === 14 && S.x === mid, tag + 'S at row 14 col ' + mid);
  var reach = flood(g, false), safe = flood(g, true);
  ok(reach[mid + ',1'], tag + 'door tile reachable');
  ok(safe[mid + ',1'], tag + 'door reachable without touching spikes');
  ['C','B','P'].forEach(function(ch){
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (g[y][x] === ch) ok(safe[x + ',' + y], tag + ch + ' at ' + x + ',' + y + ' reachable off spikes');
  });
  // spike gaps >= 2 tiles
  g.forEach(function(row, y){
    if (row.indexOf('^') < 0) return;
    var runs = row.split(/\^+/).filter(function(r){ return r.length; });
    ok(runs.every(function(r){ return r.length >= 2; }), tag + 'spike row ' + y + ' gaps >= 2 (' + row + ')');
  });
  if (s.kind === 'cache') { ok(!!find(g, 'C'), tag + 'chest spot C'); ok(g.join('').indexOf('^') >= 0, tag + 'cache has spikes'); }
  if (s.kind === 'boss') { var b = find(g, 'B'); ok(!!b, tag + 'boss spot B'); }
  if (s.kind === 'supply') ok(s.spawns.length === 0, tag + 'supply has no enemies');
  // counts
  var n = {}; s.spawns.forEach(function(e){ n[e.type] = (n[e.type] || 0) + 1; });
  ok(JSON.stringify(Object.keys(n).sort().map(function(k){ return k + n[k]; })) ===
     JSON.stringify(Object.keys(E.n).sort().map(function(k){ return k + E.n[k]; })), tag + 'enemy counts ' + JSON.stringify(n) + ' expected ' + JSON.stringify(E.n));
  var floorTiles = [];
  for (var y = 1; y < H; y++) for (var x = 0; x < W; x++) if (!blocksWalk(g, x, y)) floorTiles.push([x + 0.5, y + 0.5]);
  SP.forEach(function(e){
    var et = tag + e.type + '@' + e.x + ',' + e.y;
    var tx = Math.floor(e.x), ty = Math.floor(e.y);
    ok(e.x - tx === 0.5 && e.y - ty === 0.5, et + ' on tile centre');
    ok(!blocksWalk(g, tx, ty) && g[ty][tx] !== '^', et + ' on floor (not solid, not spikes)');
    ok(reach[tx + ',' + ty], et + ' reachable from spawn row');
    ok(ty >= 1 && ty <= 10, et + ' in rows 1-10');
    ok(typeof e.t === 'number' && e.t >= 0 && e.t <= 10, et + ' t in 0..10');
    var dS = Math.hypot(e.x - W / 2, e.y - 14.5);
    ok(dS >= 5, et + ' at least 5 from S (' + dS.toFixed(1) + ')');
    if (e.type === 'B-01') { var b = find(g, 'B'); ok(b && tx === b.x && ty === b.y, et + ' on B'); ok(!solid(g, tx, ty - 1) && !solid(g, tx - 1, ty) && !solid(g, tx + 1, ty) && !solid(g, tx, ty + 1), et + ' 1-tile clear ring for r~1'); }
    if (e.type === 'E-03') {
      ok(dS > 2.5, et + ' > 2.5 from S');
      ok(clearLine(g, W / 2, 14.5, e.x, e.y), et + ' clear line from S');
      var vis = floorTiles.filter(function(f){ return clearLine(g, f[0], f[1], e.x, e.y); }).length / floorTiles.length;
      ok(vis >= 0.6, et + ' clear line from ' + (vis * 100).toFixed(0) + '% of floor (need 60%)');
      report.push(et + ' visible from ' + (vis * 100).toFixed(0) + '% of floor, clear from S: ' + clearLine(g, W / 2, 14.5, e.x, e.y));
    }
    if (ref && !seenType[e.type]) seenType[e.type] = s.stage;
  });
  // first appearance readable: new type is the only thing at the earliest time, or with weak company (E-01 only)
  Object.keys(n).forEach(function(type){
    if (FIRST[type] !== s.stage || type === 'E-01') return;
    var mine = s.spawns.filter(function(e){ return e.type === type; });
    var t0 = Math.min.apply(null, mine.map(function(e){ return e.t; }));
    var company = s.spawns.filter(function(e){ return e.type !== type && e.t <= t0; });
    ok(company.every(function(e){ return e.type === 'E-01'; }) && company.length <= 1, tag + 'first ' + type + ' readable (company at t<=' + t0 + ': ' + company.map(function(e){ return e.type; }).join(',') + ')');
  });
  // ascii (reference class only)
  if (!ref) return;
  var m = g.map(function(r){ return r.split(''); }), code = { 'E-01':'1','E-02':'2','E-03':'3','E-04':'4','E-05':'5','B-01':'@' };
  s.spawns.forEach(function(e){ m[Math.floor(e.y)][Math.floor(e.x)] = code[e.type] || '?'; });
  maps.push({ head: ('S' + s.stage + ' ' + s.room + ' ' + s.kind).slice(0, 13), rows: m.map(function(r){ return r.join(''); }),
    times: s.spawns.map(function(e){ return (code[e.type]) + '@' + e.t; }).join(' ') });
});
}); // column classes
Object.keys(FIRST).forEach(function(t){ ok(seenType[t] === FIRST[t], 'first appearance of ' + t + ' at stage ' + FIRST[t] + ' (got ' + seenType[t] + ')'); });

console.log('Stage maps (1..5 = E-01..E-05, @ = B-01, ^ spikes, C chest, B boss spot, P pad, # cover):');
for (var b = 0; b < 10; b += 5) {
  var grp = maps.slice(b, b + 5), pad = function(s){ return (s + '              ').slice(0, 14); };
  console.log(grp.map(function(m){ return pad(m.head); }).join(''));
  for (var r = 0; r < 15; r++) console.log(grp.map(function(m){ return pad(m.rows[r]); }).join(''));
  grp.forEach(function(m){ console.log('  ' + m.head + ' spawn t(s): ' + (m.times || '-')); });
  console.log('');
}
report.forEach(function(l){ console.log(l); });
console.log((fails ? 'FAILED ' : 'ALL PASS ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
