// Schema test for the data tables (F0 #7): parts/data-stages.js (V.Data.rooms, roomOrder, stages) and parts/data-enemies.js
// (V.Data.enemies). Run: node src/test-data.js
var path = require('path');
var P = function(f){ return path.join(__dirname, 'parts', f + '.js'); };
// data parts first, then the parts that read them, in game load order (game.html)
['data-stages', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'mods', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function(f){ require(P(f)); });
var V = globalThis.V, D = V.Data, fails = 0, n = 0;
function ok(name, c, got){ n++; if (!c) { fails++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)); } }
function isNum(v){ return typeof v === 'number' && isFinite(v); }
function keys(o){ return Object.keys(o).sort().join(); }

// ---- tables are plain data (08 section 1: "No functions inside tables") ----
function plain(o, at){
  if (o === null) return null;
  var t = typeof o;
  if (t === 'function') return at;
  if (t === 'number') return isFinite(o) ? null : at;
  if (t !== 'object') return null;
  if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { var r = plain(o[i], at + '[' + i + ']'); if (r) return r; } return null; }
  if (Object.getPrototypeOf(o) !== Object.prototype) return at;
  for (var k in o) { var r2 = plain(o[k], at + '.' + k); if (r2) return r2; }
  return null;
}
ok('V.Data has rooms, roomOrder, stages, enemies', D && D.rooms && D.roomOrder && D.stages && D.enemies, D && Object.keys(D));
ok('V.Data is plain data (no functions, NaN, Infinity or class objects)', plain(D, 'V.Data') === null, plain(D, 'V.Data'));
ok('V.Data survives a JSON round trip', JSON.stringify(JSON.parse(JSON.stringify(D))) === JSON.stringify(D));

// ---- enemies ----
var ENEMY_FIELDS = { hp:1, contact:1, dmg:1, speed:1, r:1, size:1, xp:1, tell:1, cd:1 };
var FLAGS = { flyer:1, static:1, boss:1, immune:1 };
var SIZES = { small:1, medium:1, large:1 };
var E = D.enemies, ids = Object.keys(E);
ok('enemy ids are E-NN or B-NN', ids.every(function(id){ return /^[EB]-\d\d$/.test(id); }), ids);
ok('six chapter 1 rows (E-01..E-05, B-01)', keys(E) === 'B-01,E-01,E-02,E-03,E-04,E-05', keys(E));
ids.forEach(function(id){
  var r = E[id];
  for (var f in ENEMY_FIELDS) ok(id + ' has ' + f, f in r);
  for (var k in r) ok(id + ' field ' + k + ' known', (k in ENEMY_FIELDS) || (k in FLAGS));
  ok(id + ' hp > 0', isNum(r.hp) && r.hp > 0, r.hp);
  ok(id + ' contact, dmg >= 0', isNum(r.contact) && r.contact >= 0 && isNum(r.dmg) && r.dmg >= 0);
  ok(id + ' speed 0-10', isNum(r.speed) && r.speed >= 0 && r.speed <= 10, r.speed);
  ok(id + ' r 0.1-2', isNum(r.r) && r.r >= 0.1 && r.r <= 2, r.r);
  ok(id + ' size enum', r.size in SIZES, r.size);
  ok(id + ' xp >= 0 int', isNum(r.xp) && r.xp >= 0 && r.xp === Math.floor(r.xp));
  ok(id + ' tell 0.2-3 s', isNum(r.tell) && r.tell >= 0.2 && r.tell <= 3, r.tell);
  ok(id + ' cd 0.5-10 s', isNum(r.cd) && r.cd >= 0.5 && r.cd <= 10, r.cd);
  ['flyer', 'static', 'boss'].forEach(function(f){ if (f in r) ok(id + ' ' + f + ' is bool', typeof r[f] === 'boolean'); });
  ok(id + ' boss flag matches id', !!r.boss === (id[0] === 'B'));
  if (r.static) ok(id + ' static means speed 0', r.speed === 0);
  if ('immune' in r) ok(id + ' immune is a map of bools', r.immune && typeof r.immune === 'object' && Object.keys(r.immune).every(function(k){ return typeof r.immune[k] === 'boolean'; }));
});
// behaviours: one per row, literal in the AI part equal to the row, and bound to the row after create
ok('every V.AI behaviour has a data row', Object.keys(V.AI).every(function(k){ return k in E; }), Object.keys(V.AI));
ok('every data row has a V.AI behaviour', ids.every(function(k){ return !!V.AI[k]; }), ids.filter(function(k){ return !V.AI[k]; }));
ids.forEach(function(id){ ok(id + ' AI-part base literal equals its data row (no drift)', JSON.stringify(V.AI[id].base) === JSON.stringify(E[id]), [V.AI[id].base, E[id]]); });
V.Sim.create(1, V.TUNE);
ok('after Sim.create every behaviour reads its data row', ids.every(function(id){ return V.AI[id].base === E[id]; }));
ok('V.Sim.ENEMIES reports the table', JSON.stringify(V.Sim.ENEMIES) === JSON.stringify(E));

// ---- rooms ----
var W = 9, H = 15, LEGEND = '#.SDe^CBP', COVERS = { pillar:1, block:1 };
var R = D.rooms, rids = Object.keys(R);
ok('rooms R01-R03 + SD, CA1, BA1', keys(R) === 'BA1,CA1,R01,R02,R03,SD', keys(R));
ok('roomOrder lists template rooms that exist', Array.isArray(D.roomOrder) && D.roomOrder.length > 0 && D.roomOrder.every(function(id){ return id in R; }), D.roomOrder);
function tile(g, x, y){ x = Math.floor(x); y = Math.floor(y); return (y >= 0 && y < H && x >= 0 && x < W) ? g[y][x] : null; }
rids.forEach(function(id){
  var r = R[id], g = r.grid;
  ok(id + ' fields', keys(r) === 'cover,grid,name,spawns', keys(r));
  ok(id + ' name is text 1-24', typeof r.name === 'string' && r.name.length >= 1 && r.name.length <= 24, r.name);
  ok(id + ' cover enum', r.cover in COVERS, r.cover);
  ok(id + ' grid ' + H + ' rows of ' + W, Array.isArray(g) && g.length === H && g.every(function(row){ return typeof row === 'string' && row.length === W; }), g && g.length);
  ok(id + ' grid legend only', g.join('').split('').every(function(c){ return LEGEND.indexOf(c) >= 0; }));
  ok(id + ' row 0 is wall with one door', g[0].replace('D', '#') === '#########' && g[0].split('D').length === 2, g[0]);
  ok(id + ' one S, on the bottom row', g.join('').split('S').length === 2 && g[H - 1].indexOf('S') >= 0);
  ok(id + ' spawns array', Array.isArray(r.spawns));
  r.spawns.forEach(function(s, i){
    ok(id + ' spawn ' + i + ' fields', keys(s) === 'type,x,y', keys(s));
    ok(id + ' spawn ' + i + ' known type', s.type in E, s.type);
    ok(id + ' spawn ' + i + ' on a tile centre, on floor', isNum(s.x) && isNum(s.y) && s.x % 1 === 0.5 && s.y % 1 === 0.5 && tile(g, s.x, s.y) !== null && tile(g, s.x, s.y) !== '#', s);
  });
});

// ---- stages ----
var KINDS = { combat:1, supply:1, cache:1, boss:1 };
var ch = D.stages.ch1;
ok('stages has only ch1 (P1)', keys(D.stages) === 'ch1');
ok('ch1 has 10 rows numbered 1..10', Array.isArray(ch) && ch.length === 10 && ch.every(function(s, i){ return s.stage === i + 1; }), ch && ch.length);
ch.forEach(function(s){
  var id = 'stage ' + s.stage, g = R[s.room] && R[s.room].grid;
  ok(id + ' fields', keys(s) === 'kind,note,room,spawns,stage', keys(s));
  ok(id + ' kind enum', s.kind in KINDS, s.kind);
  ok(id + ' room exists', !!g, s.room);
  ok(id + ' note is text', typeof s.note === 'string' && s.note.length <= 200);
  ok(id + ' spawns array', Array.isArray(s.spawns));
  if (s.kind === 'supply') ok(id + ' supply has no spawns', s.spawns.length === 0);
  else ok(id + ' has spawns', s.spawns.length > 0);
  if (s.kind === 'boss') ok(id + ' boss row spawns exactly one boss', s.spawns.length === 1 && E[s.spawns[0].type] && E[s.spawns[0].type].boss);
  else ok(id + ' non-boss row spawns no boss', s.spawns.every(function(p){ return !(E[p.type] && E[p.type].boss); }));
  s.spawns.forEach(function(p, i){
    var at = id + ' spawn ' + i;
    ok(at + ' fields', keys(p) === 't,type,x,y', keys(p));
    ok(at + ' known type', p.type in E, p.type);
    ok(at + ' t 0-30 s', isNum(p.t) && p.t >= 0 && p.t <= 30, p.t);
    ok(at + ' on floor', g && isNum(p.x) && isNum(p.y) && tile(g, p.x, p.y) !== null && tile(g, p.x, p.y) !== '#', p);
    ok(at + ' not in the safe rows 11-14', p.y < 11, p.y);
  });
});
var bossRows = ch.filter(function(s){ return s.kind === 'boss'; });
ok('one boss row, and it is the last stage', bossRows.length === 1 && ch[ch.length - 1].kind === 'boss');

// ---- the old names still point at the tables ----
ok('V.ROOMS is V.Data.rooms', V.ROOMS === D.rooms);
ok('V.ROOM_ORDER is V.Data.roomOrder', V.ROOM_ORDER === D.roomOrder);
ok('V.STAGES is V.Data.stages', V.STAGES === D.stages);

console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
