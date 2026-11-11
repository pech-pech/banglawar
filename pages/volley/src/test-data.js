// Schema test for the data tables (F0 #7): parts/data-stages.js (V.Data.rooms, roomOrder, stages) and parts/data-enemies.js
// (V.Data.enemies). Run: node src/test-data.js
var path = require('path');
var P = function(f){ return path.join(__dirname, 'parts', f + '.js'); };
// data parts first, then the parts that read them, in game load order (game.html)
['data-stages', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'mods', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function(f){ require(P(f)); });
var V = globalThis.V, D = V.Data, fails = 0, n = 0;
var HASH600 = '0a3f24e4';
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
var ENEMY_FIELDS = { hp:1, contact:1, dmg:1, speed:1, r:1, size:1, xp:1, tell:1, cd:1, ai:1 };
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
ok('stages has ch1 and the debug stress room', keys(D.stages) === 'ch1,stress', keys(D.stages));
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

// ---- F1 (S): R29 slope, R31 effective tells, no literals left in the AI parts, stress room ----
var T0 = V.TUNE_DEFAULTS, fs = require('fs');
ok('R29 DMG_SLOPE is 0.0118 per stage (not the built 0.08)', T0.DMG_SLOPE === 0.0118, T0.DMG_SLOPE);
ok('R31 TELL_MULT stays 0.85', T0.TELL_MULT === 0.85, T0.TELL_MULT);
function eff(base){ return +(base * T0.TELL_MULT).toFixed(3); }
function near(a, b){ return Math.abs(a - b) <= 0.005; }
// effective seconds the player sees (section 03): base x TELL_MULT must land on these (+-0.005)
var EFF = { 'E-01':0.8, 'E-02':0.6, 'E-03':0.7, 'E-04':1.0, 'E-05':0.8 };
for (var id in EFF) ok(id + ' effective tell ' + EFF[id] + ' s (base ' + E[id].tell + ' x ' + T0.TELL_MULT + ')', near(eff(E[id].tell), EFF[id]), eff(E[id].tell));
ok('E-01 base tell is 0.941 (R31)', E['E-01'].tell === 0.941);
var BE = E['B-01'].ai;
ok('B-01 effective tells A 1.0 / B 0.6 / C 0.8', near(eff(BE.tellA), 1.0) && near(eff(BE.tellB), 0.6) && near(eff(BE.tellC), 0.8), [eff(BE.tellA), eff(BE.tellB), eff(BE.tellC)]);
ok('B-01 row tell equals its A tell', E['B-01'].tell === BE.tellA);
ok('E-02 and E-05 lock the last 0.2 s effective', near(eff(E['E-02'].ai.lockLast), 0.2) && near(eff(E['E-05'].ai.lockLast), 0.2));
// every row.ai number reaches the behaviour: the behaviour carries the same value (angles: row degrees x pi/180)
var DEGR = Math.PI / 180;
function chkAi(id, A, row, path){
  for (var k in row) {
    var v = row[k], at = id + ' ai.' + path + k;
    if (v && typeof v === 'object' && !Array.isArray(v)) { ok(at + ' is on the behaviour', A && A[k] && typeof A[k] === 'object', k); chkAi(id, A && A[k], v, path + k + '.'); continue; }
    var bk = /Deg$/.test(k) && !Array.isArray(v) ? k.replace(/Deg$/, '') : (k === 'lines2Deg' ? 'lines2' : k);
    var want = (/Deg$/.test(k) && !Array.isArray(v) && k !== 'extra2Deg') ? v * DEGR : v;   // boss.js keeps lines2 and extra2 in degrees (converted at use)
    ok(at + ' equals the behaviour value (no drift)', A && JSON.stringify(A[bk]) === JSON.stringify(want), [A && A[bk], want]);
  }
}
ids.forEach(function(id){ if (E[id].ai) chkAi(id, V.AI[id], E[id].ai, ''); });
// no base literal in the AI parts: each must read V.Data.enemies, never carry a { hp: ... } object
['ai-p0', 'ai-p1', 'boss'].forEach(function(f){
  var src = fs.readFileSync(P(f), 'utf8');
  ok(f + '.js has no base row literal (base: { ... })', !/base\s*:\s*\{/.test(src));
  ok(f + '.js has no hp:/contact:/tell: literal fields', !/\b(hp|contact|xp)\s*:\s*\d/.test(src));
  ok(f + '.js has no behaviour-number literal (range, shotSpeed, tellA, ... : 1.2)', !/\\b(range|lungeSpeed|lungeDist|lockLast|shotSpeed|prefer|lead|fanN|spread|windup|ringR|dashSpeed|dashDist|stun|scatterDmg|cd2|tellA|tellB|tellC|lines1|perLine|lineN)\\s*:\\s*-?\\d/.test(src));
  ok(f + '.js reads V.Data.enemies', /V\.Data\.enemies/.test(src));
});
// damage curve: stage 10 hit = base x ENEMY_DMG_MULT x (1 + 0.0118 x 9)
// stress room: opts.room 'stress' -> 11 machines alive together, hero takes no damage, plain runs unaffected
var Ss = V.Sim.create(5, V.TUNE, { room:'stress', cols:9 });
for (var i = 0; i < 120; i++) V.Sim.step(Ss, { mx:0, my:0 });
ok('stress room has 11 machines alive at 2 s', Ss.enemies.filter(function(e){ return e.hp > 0; }).length === 11, Ss.enemies.length);
for (var j = 0; j < 1800; j++) V.Sim.step(Ss, { mx:0, my:0 });
ok('stress room still 11 alive after 30 s of rifle fire', Ss.enemies.filter(function(e){ return e.hp > 0; }).length === 11, Ss.enemies.length);
ok('stress room Operator unhurt and run not ended', Ss.hero.hp === Ss.hero.maxHp && !Ss.result, [Ss.hero.hp, !!Ss.result]);
ok('stress room: every machine type present', ['E-01','E-02','E-03','E-04','E-05'].every(function(t){ return Ss.enemies.some(function(e){ return e.type === t; }); }));
var Sp = V.Sim.create(5, V.TUNE, { cols:9 });
ok('a plain run is not the stress room', !Sp.stress && Sp.enemies.length < 11);
// the 9-column sim hash after the fixed step count (human-free: standing still) is the F1 baseline; a change here is on purpose only (R29/R31)
for (var q = 0; q < 600; q++) V.Sim.step(Sp, { mx:0, my:0 });
ok('9-column standing-still hash at 600 steps (seed 5) is the F1 value', V.Sim.hash(Sp) === HASH600, V.Sim.hash(Sp));

console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
