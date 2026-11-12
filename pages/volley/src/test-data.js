// Schema test for the data tables (F0 #7): parts/data-stages.js (V.Data.rooms, roomOrder, stages) and parts/data-enemies.js
// (V.Data.enemies). Run: node src/test-data.js
var path = require('path');
var P = function(f){ return path.join(__dirname, 'parts', f + '.js'); };
// data parts first, then the parts that read them, in game load order (game.html)
['data-stages', 'data-stages-gen', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'mods', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function(f){ require(P(f)); });
// step 7 (K3): the new AI parts, in game.html order. Rows that data-enemies.js already holds (TABLED) must not be repeated as literals in the part;
// rows a part defines itself ("if absent", or own-file boss rows per CONTRACT-STEP7) are checked against the table like the rest.
var TABLED = Object.keys(globalThis.V.Data.enemies), S7PARTS = ['boss-kit', 'boss-b03', 'boss-b02', 'boss-b04', 'ai-e06', 'ai-e07', 'ai-e08'].filter(function(f){ return require('fs').existsSync(P(f)); });
S7PARTS.forEach(function(f){ require(P(f)); });
var S7ROWS = { 'E-06':'ai-e06', 'E-06h':'ai-e06', 'E-07':'ai-e07', 'E-08':'ai-e08', 'B-03':'boss-b03', 'B-03V':'boss-b03', 'B-02':'boss-b02', 'B-04':'boss-b04' };
var V = globalThis.V, D = V.Data, fails = 0, n = 0;
var HASH600 = '0a3f24e4';
var ROWS10 = 'e99cd57c';   // djb2-xor of JSON.stringify(V.Data.stages.ch1.slice(0, 10)) as built (stages 1-10 frozen)
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
ok('enemy ids are E-NN or B-NN (step 7: E-06h half, B-03V variant)', ids.every(function(id){ return /^[EB]-\d\d[hV]?$/.test(id); }), ids);
ok('six chapter 1 rows (E-01..E-05, B-01) + the step-7 rows of every loaded part', keys(E) === ['B-01','E-01','E-02','E-03','E-04','E-05'].concat(Object.keys(S7ROWS).filter(function(id){ return S7PARTS.indexOf(S7ROWS[id]) >= 0; })).sort().join(), keys(E));
ok('step 7: all six new parts are present (E-06/E-07/E-08, B-02/B-03/B-04)', Object.keys(S7ROWS).every(function(id){ return id in E; }), Object.keys(S7ROWS).filter(function(id){ return !(id in E); }));
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
  if (r.boss) ok(id + ' boss is immune to instakill and freeze (step 7 contract)', id === 'B-01' || (r.immune && r.immune.instakill === true && r.immune.freeze === true), r.immune);
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
// the six built rooms, plus baked rooms c1sNNv0 (GEN-SPEC 3.3, parts/data-stages-gen.js) once they land
ok('rooms R01-R03 + SD, CA1, BA1 (+ baked c1sNNv0 rooms)', keys(R).split(',').filter(function(k){ return !/^c1s\d+v\d+$/.test(k); }).join() === 'BA1,CA1,R01,R02,R03,SD', keys(R));
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
ok('ch1 has at least the 10 built rows, numbered 1..N', Array.isArray(ch) && ch.length >= 10 && ch.every(function(s, i){ return s.stage === i + 1; }), ch && ch.length);
ok('rows 1-10 are frozen (pick 55): JSON checksum of the built rows', (function(){ var h = 5381, j = JSON.stringify(ch.slice(0, 10)); for (var i = 0; i < j.length; i++) h = ((h * 33) ^ j.charCodeAt(i)) >>> 0; return h.toString(16); })() === ROWS10, 'rows 1-10 changed');
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
    var pk = Object.keys(p).filter(function(k){ return k !== 'elite'; }).sort().join();
    ok(at + ' fields', pk === 't,type,x,y' || pk === 't,type,wave,x,y', keys(p));   // wave is optional (GEN-SPEC 3.3); elite is optional (R64)
    if ('elite' in p) ok(at + ' elite is a boolean, only on E-02..E-05, E-07, E-08 (never E-06)', typeof p.elite === 'boolean' && (!p.elite || /^E-0[2-578]$/.test(p.type)), [p.type, p.elite]);
    ok(at + ' known type', p.type in E, p.type);
    ok(at + ' t 0-30 s', isNum(p.t) && p.t >= 0 && p.t <= 30, p.t);
    ok(at + ' on floor', g && isNum(p.x) && isNum(p.y) && tile(g, p.x, p.y) !== null && tile(g, p.x, p.y) !== '#', p);
    ok(at + ' not in the safe rows 11-14', p.y < 11, p.y);
  });
});
var bossRows = ch.filter(function(s){ return s.kind === 'boss'; });
ok('the last stage is a boss row; stage 10 is the built boss B-01', ch[ch.length - 1].kind === 'boss' && ch[9].kind === 'boss' && ch[9].spawns[0].type === 'B-01' && bossRows.length >= 1);

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
var EFF = { 'E-01':0.8, 'E-02':0.6, 'E-03':0.7, 'E-04':1.0, 'E-05':0.8, 'E-06':0.6, 'E-06h':0.6, 'E-07':1.0, 'E-08':1.2 };   // step 7: E-06 aim line 0.6 (the 0.3 s seam sits inside it, M6), crack ring 1.0, aim line 1.2
for (var id in EFF) ok(id + ' effective tell ' + EFF[id] + ' s (base ' + E[id].tell + ' x ' + T0.TELL_MULT + ')', near(eff(E[id].tell), EFF[id]), eff(E[id].tell));
ok('E-01 base tell is 0.941 (R31)', E['E-01'].tell === 0.941);
var BE = E['B-01'].ai;
ok('B-01 effective tells A 1.0 / B 0.6 / C 0.8', near(eff(BE.tellA), 1.0) && near(eff(BE.tellB), 0.6) && near(eff(BE.tellC), 0.8), [eff(BE.tellA), eff(BE.tellB), eff(BE.tellC)]);
ok('B-01 row tell equals its A tell', E['B-01'].tell === BE.tellA);
ok('E-02 and E-05 lock the last 0.2 s effective', near(eff(E['E-02'].ai.lockLast), 0.2) && near(eff(E['E-05'].ai.lockLast), 0.2));
ok('E-08 hit 110 and locks the last 0.4 s effective', E['E-08'].dmg === 110 && near(eff(E['E-08'].ai.lockLast), 0.4) && E['E-08'].static === true, [E['E-08'].dmg, E['E-08'].ai && eff(E['E-08'].ai.lockLast)]);
ok('E-07 ring 8 rounds of 50, exposed 2.5 s', E['E-07'].dmg === 50 && E['E-07'].ai.ringN === 8 && E['E-07'].ai.exposed === 2.5, E['E-07'].ai);
ok('E-06 seam glows the last 0.3 s effective', near(eff(E['E-06'].ai.seam), 0.3), E['E-06'].ai && eff(E['E-06'].ai.seam));
ok('E-06 hit 50; E-06h is smaller and small-sized', E['E-06'].dmg === 50 && E['E-06h'].r < E['E-06'].r && E['E-06h'].size === 'small', [E['E-06'].dmg, E['E-06h'].r]);
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
ids.forEach(function(id){ if (E[id].ai && !(id in S7ROWS)) chkAi(id, V.AI[id], E[id].ai, ''); });   // step-7 behaviours read base.ai directly (no copied fields), so drift is impossible there
// no base literal in the AI parts: each must read V.Data.enemies, never carry a { hp: ... } object
['ai-p0', 'ai-p1', 'boss'].forEach(function(f){
  var src = fs.readFileSync(P(f), 'utf8');
  ok(f + '.js has no base row literal (base: { ... })', !/base\s*:\s*\{/.test(src));
  ok(f + '.js has no hp:/contact:/tell: literal fields', !/\b(hp|contact|xp)\s*:\s*\d/.test(src));
  ok(f + '.js has no behaviour-number literal (range, shotSpeed, tellA, ... : 1.2)', !/\\b(range|lungeSpeed|lungeDist|lockLast|shotSpeed|prefer|lead|fanN|spread|windup|ringR|dashSpeed|dashDist|stun|scatterDmg|cd2|tellA|tellB|tellC|lines1|perLine|lineN)\\s*:\\s*-?\\d/.test(src));
  ok(f + '.js reads V.Data.enemies', /V\.Data\.enemies/.test(src));
});
// step 7: a part may carry its own row only while data-enemies.js does not table it; once SIM moves the row, the part literal must go
S7PARTS.filter(function(f){ return f !== 'boss-kit'; }).forEach(function(f){
  var src = fs.readFileSync(P(f), 'utf8'), own = Object.keys(S7ROWS).filter(function(id){ return S7ROWS[id] === f; });
  ok(f + '.js reads V.Data.enemies', /V\.Data\.enemies|\bDE\s*=/.test(src));
  if (own.every(function(id){ return TABLED.indexOf(id) >= 0; })) ok(f + '.js has no hp:/contact:/xp: literal once its rows are in data-enemies.js', !/\b(hp|contact|xp)\s*:\s*\d/.test(src));
  else ok(f + '.js carries its own row(s) ' + own.join('/') + ' (not yet in data-enemies.js): each equals the live table row', own.every(function(id){ return V.AI[id] && V.AI[id].base === E[id]; }));
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


// ---- E1 (GEN-SPEC 6): chapter length follows the stage list; win after the last stage; ?chlen test cap ----
// A stub 20-stage list stands in for the baked rows 11-20 (agent C owns the real ones): rows 1-10 are the built ones, 11-19 combat in R01-R03, 20 the boss arena.
(function(){
  var real = V.STAGES.ch1, saved = V.SimOpts.chlen;
  function stub(len){
    var a = real.slice(0, 10).map(function(r){ return r; });
    for (var i = 11; i <= len; i++) {
      var last = i === len, room = last ? 'BA1' : ['R01', 'R02', 'R03'][i % 3];
      a.push({ stage:i, kind:last ? 'boss' : 'combat', room:room, note:'stub',
        spawns:last ? [{ type:'B-01', x:4.5, y:3.5, t:0 }] : R[room].spawns.map(function(p){ return { type:p.type, x:p.x, y:p.y, t:0 }; }) });
    }
    return a;
  }
  // god-mode driver: clears each room at once, takes pick 0, walks to the door. Returns the stage sequence and the final state.
  function drive(S, maxSteps){
    var seq = [S.stage + '.' + S.lap], lastKey = seq[0], laps = 0;
    for (var f = 0; f < maxSteps && S.phase !== 'results'; f++) {
      var inp = { mx:0, my:0 };
      if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
      if (S.phase === 'supply') { V.Sim.pickSupply(S, 0); continue; }
      if (S.phase === 'play') { S.enemies.length = 0; S.spawnQ.length = 0; }
      if (S.phase === 'clear' && !S.bossWin) { var d = S.room.door; S.hero.x = d.x + 0.5; if (S.hero.y > d.y + 1.6) S.hero.y = d.y + 1.6; inp = { mx:0, my:-1 }; }
      S.hero.hp = S.hero.maxHp;
      V.Sim.step(S, inp);
      var key = S.stage + '.' + S.lap; if (key !== lastKey) { seq.push(key); lastKey = key; }
    }
    return seq;
  }
  try {
    V.SimOpts.chlen = 0;
    V.STAGES.ch1 = stub(20);
    var Sa = V.Sim.create(7, V.TUNE, { cols:9 });
    ok('E1 chapter length follows the list: 20-stage list gives 20', V.Sim.stageList().length === 20, V.Sim.stageList().length);
    var seq = drive(Sa, 60 * 60 * 40);
    var want = []; for (var w = 1; w <= 20; w++) want.push(w + '.1');
    ok('E1 with 20 stages, stage 11 follows stage 10 (no lap); run runs 1..20 in order', seq.join() === want.join(), seq.join());
    ok('E1 20 stages: the stage-10 boss is not the win', seq.indexOf('11.1') > 0);
    ok('E1 20 stages: win comes after stage 20, on lap 1', Sa.phase === 'results' && Sa.result && Sa.result.win === true && Sa.result.stage === 20 && Sa.result.lap === 1, Sa.result && [Sa.result.win, Sa.result.stage, Sa.result.lap]);
    // the lap: only after the last stage, and only in ENDLESS (a win otherwise); the lap offset is the list length
    var T2 = Object.assign({}, V.TUNE, { ENDLESS:true });
    var Sc = V.Sim.create(7, T2, { cols:9 });
    var seqE = []; for (var f2 = 0, lk = ''; f2 < 60 * 60 * 60 && Sc.lap < 2; f2++) {
      var inp2 = { mx:0, my:0 };
      if (Sc.phase === 'pick') { V.Sim.pick(Sc, 0); continue; } if (Sc.phase === 'supply') { V.Sim.pickSupply(Sc, 0); continue; }
      if (Sc.phase === 'play') { Sc.enemies.length = 0; Sc.spawnQ.length = 0; }
      if (Sc.phase === 'clear') { var d2 = Sc.room.door; Sc.hero.x = d2.x + 0.5; if (Sc.hero.y > d2.y + 1.6) Sc.hero.y = d2.y + 1.6; inp2 = { mx:0, my:-1 }; }
      Sc.hero.hp = Sc.hero.maxHp; V.Sim.step(Sc, inp2);
      var k2 = Sc.stage + '.' + Sc.lap; if (k2 !== lk) { seqE.push(k2); lk = k2; }
    }
    ok('E1 ENDLESS: laps only after stage 20 (20.1 then 1.2), not after 10', seqE.indexOf('11.1') > 0 && seqE[seqE.length - 2] === '20.1' && seqE[seqE.length - 1] === '1.2', seqE.slice(-3).join());
    // lap 2 stage 1 scales as stage 21: enemy HP ratio to a fresh stage 1 is (1 + slope x 20) (the lap offset is the list length, 20)
    var S1 = V.Sim.create(7, V.TUNE, { cols:9 }); for (var z = 0; z < 120; z++) V.Sim.step(S1, { mx:0, my:0 });
    for (var z2 = 0; z2 < 120; z2++) V.Sim.step(Sc, { mx:0, my:0 });
    var h1 = S1.enemies[0] && S1.enemies[0].maxHp, h2 = Sc.enemies[0] && Sc.enemies[0].maxHp;
    ok('E1 lap 2 stage 1 scales as stage 21 (HP x ' + (1 + V.TUNE.HP_SLOPE * 20).toFixed(3) + ')', h1 > 0 && Sc.stage === 1 && Sc.lap === 2 && Math.abs(h2 / h1 - (1 + V.TUNE.HP_SLOPE * 20)) < 0.03, [h1, h2]);
    // ?chlen=10 restores the 10-stage win on the same 20-row list
    V.SimOpts.chlen = 10;
    ok('E1 chlen=10 caps the 20-row list to 10', V.Sim.stageList().length === 10 && V.Sim.stageList()[9].kind === 'boss', V.Sim.stageList().length);
    var Se = V.Sim.create(7, V.TUNE, { cols:9 });
    var seq10 = drive(Se, 60 * 60 * 20);
    ok('E1 chlen=10: win at stage 10 of 10, lap 1', Se.phase === 'results' && Se.result.win === true && Se.result.stage === 10 && Se.result.lap === 1 && seq10[seq10.length - 1] === '10.1', seq10.join());
    // per-run opts.chlen wins over V.SimOpts
    V.SimOpts.chlen = 0;
    var Sf = V.Sim.create(7, V.TUNE, { cols:9, chlen:10 });
    ok('E1 per-run opts.chlen caps without the global hook', V.Sim.stageList().length === 20 && (function(){ var q = drive(Sf, 60 * 60 * 20); return Sf.result && Sf.result.win && Sf.result.stage === 10; })());
    // chapter key: V.STAGES['ch2'] is read when a run is created for chapter 2; a chapter without a list falls back to ch1
    V.STAGES.ch2 = stub(12).slice(0, 11).concat([{ stage:12, kind:'boss', room:'BA1', note:'stub', spawns:[{ type:'B-01', x:4.5, y:3.5, t:0 }] }]);
    var Sg = V.Sim.create(7, V.TUNE, { cols:9, chapter:2 });
    var seq2 = drive(Sg, 60 * 60 * 20);
    ok('E1 chapter 2 reads V.STAGES.ch2 (12 stages, win after 12)', Sg.result && Sg.result.win && Sg.result.stage === 12 && seq2.length === 12, seq2.join());
    var Sh = V.Sim.create(7, V.TUNE, { cols:9, chapter:3 }); V.SimOpts.chlen = 10;
    ok('E1 chapter 3 with no list falls back to ch1 (here capped to 10 by chlen)', Sh.chNo === 3 && V.Sim.stageList(3).length === 10 && V.Sim.stageList(3, Sh) === V.Sim.stageList(1, Sh), V.Sim.stageList(3).length);
    V.SimOpts.chlen = 0;
  } finally { V.STAGES.ch1 = real; delete V.STAGES.ch2; V.SimOpts.chlen = saved; }
  ok('E1 stub cleaned up: the real list is back', V.Sim.stageList() === real || V.Sim.stageList().length === real.length);
})();


// ---- waves (GEN-SPEC 3.4 / 7): wave field absent = 1; wave 2 opens at alive <= 2 of wave 1, its t counts from the opening; at most 6 alive of one wave; no clear until all waves are done ----
(function(){
  var real = V.STAGES.ch1;
  function wroom(w1, w2n, w2t){
    var sp = [];
    for (var i = 0; i < w1; i++) sp.push({ type:'E-01', x:1.5 + (i % 7), y:2.5, t:0 });
    for (var j = 0; j < w2n; j++) sp.push({ type:'E-01', x:1.5 + (j % 7), y:4.5, t:w2t, wave:2 });
    return [{ stage:1, kind:'combat', room:'R01', note:'wave test', spawns:sp }].concat(real.slice(1));
  }
  function hold(S){ S.enemies.forEach(function(e){ e.hp = e.maxHp = 1e9; }); S.hero.hp = S.hero.maxHp; }   // keep machines alive under rifle fire; the test removes them by hand
  function run(S, steps){ for (var i = 0; i < steps; i++) { hold(S); V.Sim.step(S, { mx:0, my:0 }); } }
  function alive(S, w){ return S.enemies.filter(function(e){ return e.hp > 0 && (e.wave || 1) === w; }).length; }
  try {
    V.STAGES.ch1 = wroom(4, 3, 1);
    var S = V.Sim.create(3, V.TUNE, { cols:9 });
    run(S, 60 * 4);   // 4 s, nobody killed
    ok('wave 2 does not spawn while 4 wave-1 machines are alive (even past its own t)', alive(S, 1) === 4 && alive(S, 2) === 0 && S.spawnQ.length === 3, [alive(S, 1), alive(S, 2), S.spawnQ.length]);
    S.enemies.splice(0, 1); run(S, 60 * 2);
    ok('wave 2 does not spawn at 3 alive', alive(S, 2) === 0 && S.spawnQ.length === 3, [alive(S, 1), alive(S, 2)]);
    S.enemies.splice(0, 1); run(S, 20);   // 2 alive: wave opens now; its t = 1 s counts from the opening
    ok('wave 2 opens at 2 alive but waits its own t (1 s from the opening)', alive(S, 1) === 2 && alive(S, 2) === 0, [alive(S, 1), alive(S, 2)]);
    run(S, 60);
    ok('wave 2 spawns once <= 2 are alive and its t (from the opening) has passed', alive(S, 2) === 3 && S.spawnQ.length === 0, [alive(S, 2), S.spawnQ.length]);
    ok('room is not clear while machines of any wave live', S.phase === 'play');
    var D2 = V.STAGES.ch1; V.STAGES.ch1 = wroom(2, 3, 0.5);
    var S2 = V.Sim.create(3, V.TUNE, { cols:9 });
    run(S2, 60 * 3);
    ok('2 wave-1 machines alive: wave 2 opens (early trigger at alive <= 2) and spawns after its t', alive(S2, 2) === 3 && alive(S2, 1) === 2, [alive(S2, 1), alive(S2, 2)]);
    // clear only after every wave has spawned and died: kill wave 1 and the queue is not empty -> still play (queue empty here, so check the early-clear case)
    V.STAGES.ch1 = wroom(2, 2, 3);
    var S3 = V.Sim.create(3, V.TUNE, { cols:9 });
    run(S3, 60 * 2); S3.enemies.length = 0; V.Sim.step(S3, { mx:0, my:0 });
    ok('room does not clear early: wave 1 dead, wave 2 still queued -> phase stays play', S3.phase === 'play' && S3.spawnQ.length === 2 && S3.stageIdx === 0, [S3.phase, S3.spawnQ.length]);
    run(S3, 60 * 4); S3.enemies.length = 0; V.Sim.step(S3, { mx:0, my:0 }); V.Sim.step(S3, { mx:0, my:0 });
    ok('after wave 2 has spawned and died the room clears (door opens)', S3.phase === 'clear' && S3.spawnQ.length === 0, S3.phase);
    // cap: 9 wave-2 spawns at t 0 -> never more than 6 alive of the wave; the rest follow as they die
    V.STAGES.ch1 = wroom(0, 9, 0);
    var S4 = V.Sim.create(3, V.TUNE, { cols:9 }); run(S4, 90);
    ok('wave cap: 9 wave-2 spawns at once -> 6 alive, 3 queued', alive(S4, 2) === 6 && S4.spawnQ.length === 3, [alive(S4, 2), S4.spawnQ.length]);
    S4.enemies.splice(0, 2); run(S4, 5);
    ok('wave cap: two die -> two more spawn, still <= 6', alive(S4, 2) === 6 && S4.spawnQ.length === 1, [alive(S4, 2), S4.spawnQ.length]);
  } finally { V.STAGES.ch1 = real; }
})();

// ---- the real chapter end to end (no chlen), any length N from data-stages-gen.js ----
(function(){
  var saved = V.SimOpts.chlen; V.SimOpts.chlen = 0;
  var L = V.Sim.stageList();
  var N = L.length;
  ok('real ch1 list has at least 20 rows (data-stages-gen.js loaded), a multiple of 10', N >= 20 && N % 10 === 0, N);
  // step 7 (R57 re-bake): 10 B-01, 20 B-03, 30 B-02, 40 B-03V, 50 B-04; arenas BA2-BA5 kept
  var BOSS_AT = { 10:'B-01', 20:'B-03', 30:'B-02', 40:'B-03V', 50:'B-04' };
  ok('real stage 20 is B-03 in the new arena (room c1s20v0, "Boss Arena II" = BA2 layout)', L[19].kind === 'boss' && L[19].spawns.length === 1 && L[19].spawns[0].type === 'B-03' && V.ROOMS[L[19].room].name === 'Boss Arena II' && L[19].room !== 'BA1', [L[19].room, L[19].spawns[0] && L[19].spawns[0].type]);
  ok('every 10th stage is a boss room with one boss of the step-7 map (10 B-01, 20 B-03, 30 B-02, 40 B-03V, 50 B-04); last stage is the chapter boss', L.every(function(d, i){ return (i + 1) % 10 !== 0 || (d.kind === 'boss' && d.spawns.length === 1 && d.spawns[0].type === (BOSS_AT[i + 1] || d.spawns[0].type) && E[d.spawns[0].type].boss); }) && L[N - 1].kind === 'boss', L.filter(function(d){ return d.kind === 'boss'; }).map(function(d){ return d.stage + ':' + d.spawns[0].type + '@' + V.ROOMS[d.room].name; }).join(' '));
  ok('boss rooms hold no machines (step 7)', L.every(function(d){ return d.kind !== 'boss' || d.spawns.length === 1; }));
  ok('real stages 14 and 18 carry wave-2 spawns', [14, 18].every(function(n){ return L[n - 1].spawns.some(function(p){ return p.wave === 2; }); }));
  var S = V.Sim.create(11, V.TUNE, { cols:9 }), seq = [], lk = '', spawned = {}, startId = 0, f, wavesSeen = {};
  for (f = 0; f < 60 * 60 * 60 && S.phase !== 'results'; f++) {
    var inp = { mx:0, my:0 };
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, 0); continue; }
    if (S.phase === 'collect') { V.Sim.skipCollect && V.Sim.skipCollect(S); }
    if (S.phase === 'play') {   // kill everything that has spawned, but leave the queue: waves must play out by themselves
      S.enemies.forEach(function(e){ spawned[S.stage] = (spawned[S.stage] || 0) + (e._cnt ? 0 : 1); e._cnt = 1; if (e.wave === 2) wavesSeen[S.stage] = true; });
      S.enemies.length = 0;
    }
    if (S.phase === 'clear' && !S.bossWin) { var d = S.room.door; S.hero.x = d.x + 0.5; if (S.hero.y > d.y + 1.6) S.hero.y = d.y + 1.6; inp = { mx:0, my:-1 }; }
    S.hero.hp = S.hero.maxHp;
    V.Sim.step(S, inp);
    var k = S.stage + '.' + S.lap; if (k !== lk) { seq.push(k); lk = k; }
  }
  var want = []; for (var w = 1; w <= N; w++) want.push(w + '.1');
  ok('real chapter: 1..N in order, stage 11 follows 10, no lap', seq.join() === want.join(), seq.join());
  ok('real chapter: win after stage N, lap 1', S.phase === 'results' && S.result.win === true && S.result.stage === N && S.result.lap === 1, S.result && [S.result.win, S.result.stage, S.result.lap]);
  ok('real chapter: stage N was the chapter boss (' + L[N - 1].spawns[0].type + ')', S.stageDef && S.stageDef.spawns[0].type === L[N - 1].spawns[0].type && E[L[N - 1].spawns[0].type].boss && S.roomId === L[N - 1].room, S.roomId);
  ok('real chapter: wave-2 machines spawned in stages 14 and 18, and every spawn of every stage was released', wavesSeen[14] && wavesSeen[18] && L.every(function(def){ return def.kind === 'supply' || def.kind === 'boss' || spawned[def.stage] === def.spawns.length; }), [wavesSeen, L.map(function(d){ return spawned[d.stage] + '/' + d.spawns.length; }).join(' ')]);
  V.SimOpts.chlen = saved;
})();

console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
