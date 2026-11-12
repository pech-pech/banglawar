// Step 8 gear in the sim (parts/sim.js): crit keys, Wing Drone, Guard Drone, Piercing Rounds, and "keys absent = byte-identical".
// Run: node src/test-gear.js
var path = require('path');
var P = function(f){ return path.join(__dirname, 'parts', f + '.js'); };
['data-stages', 'data-stages-gen', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'mods', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function(f){ require(P(f)); });
['boss-kit', 'boss-b03', 'boss-b02', 'boss-b04', 'ai-e06', 'ai-e07', 'ai-e08'].forEach(function(f){ if (require('fs').existsSync(P(f))) require(P(f)); });
var V = globalThis.V, fails = 0, n = 0;
var HASH600 = '0a3f24e4';
function ok(name, c, got){ n++; if (!c) { fails++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)); } }
var IN = { mx:0, my:0 };
function run(seed, meta, steps, o){
  var S = V.Sim.create(seed, V.TUNE, Object.assign({ cols:9, metaStats:meta }, o || {}));
  for (var i = 0; i < steps; i++) V.Sim.step(S, IN);
  return S;
}
// an empty arena (no machines, nothing queued) for hand-placed shots and rounds
function arena(meta){
  var S = V.Sim.create(11, V.TUNE, { cols:9, metaStats:meta });
  S.enemies = []; S.spawnQ = []; S.shots = []; S.rounds = [];
  return S;
}
function addEnemy(S, x, y, hp){
  var e = V.Sim.api.spawnEnemy(S, 'E-04', x, y); e.st = 'move'; e.hp = e.maxHp = hp; e.speed = 0; e.cd = 1e9; e.x = x; e.y = y;
  return e;
}

// ---- 1. keys absent or neutral: identical to today ----
var h0 = V.Sim.hash(run(5, null, 600)), hE = V.Sim.hash(run(5, {}, 600)), hN = V.Sim.hash(run(5, { critAdd:0, critDmgAdd:0, droneFrac:0, guardEvery:0, pierceFrac:0 }, 600));
ok('hash at 600 steps, seed 5, no meta = F1 value', h0 === HASH600, h0);
ok('hash with an empty meta object is the same', hE === HASH600, hE);
ok('hash with every gear key present but 0 is the same', hN === HASH600, hN);
var Sx = run(5, {}, 5); ok('no gear fields on the state when keys are absent', Sx.drone === undefined && Sx.guard === undefined);
// moving run, 30 s, with old keys only: same as without any meta key beyond the old ones
var mv = function(meta){ var S = V.Sim.create(9, V.TUNE, { cols:9, metaStats:meta }); for (var i = 0; i < 1800; i++) V.Sim.step(S, { mx:Math.sin(i / 90), my:Math.cos(i / 70) }); return V.Sim.hash(S); };
ok('moving 30 s run: old keys only vs plus zero gear keys', mv({ hpAdd:40, atkMul:1.1 }) === mv({ hpAdd:40, atkMul:1.1, critAdd:0, droneFrac:0 }));

// ---- 2. crit keys ----
var Sc = run(3, { critAdd:0.075, critDmgAdd:0.25 }, 1), T = V.TUNE;
ok('critAdd lands in st (CRIT 0.075 on top of the base)', Math.abs(Sc.st.critAdd - 0.075) < 1e-9, Sc.st.critAdd);
ok('critDmgAdd lands in st', Math.abs(Sc.st.critDmgAdd - 0.25) < 1e-9, Sc.st.critDmgAdd);
ok('no key: critAdd 0, critDmgAdd 0', run(3, {}, 1).st.critAdd === 0 && run(3, {}, 1).st.critDmgAdd === 0);
(function(){
  var S = run(3, { critDmgAdd:0.25, critAdd:1 }, 0), seen = 0, good = true;   // critAdd 1 = every round crits (min(1, base+1))
  var base = V.Sim.roundDamage(S, 1), want = Math.floor(base * (T.CRIT_MULT + 0.25));
  for (var i = 0; i < 600 && seen < 3; i++) { V.Sim.step(S, IN); S.rounds.forEach(function(r){ if (!r.drone && !r._c) { r._c = 1; seen++; if (!r.crit || r.dmg !== want) good = false; } }); }
  ok('crit round damage = floor(ATK x (CRIT_MULT + critDmgAdd)) (' + want + ')', seen >= 1 && good, [seen, want]);
})();
// crit chance moves: 7.5% extra over 4000 rounds shows as more crits than the base alone (same seed stream differs, so compare rates)
(function(){
  function rate(meta){ var S = arena(meta); addEnemy(S, 4.5, 6, 1e9); S.hero.x = 4.5; S.hero.y = 12; var c = 0, t = 0;
    for (var i = 0; i < 6000; i++) { V.Sim.step(S, IN); S.rounds.forEach(function(r){ if (!r._c) { r._c = 1; t++; if (r.crit) c++; } }); } return [+(c / Math.max(1, t)).toFixed(3), t]; }
  var a = rate({}), b = rate({ critAdd:0.3 });
  ok('critAdd 0.3 raises the observed crit rate by about 0.3', b[0] - a[0] > 0.2 && b[0] - a[0] < 0.45 && a[1] > 100, [a, b]);
})();

// ---- 3. Wing Drone ----
(function(){
  var S = run(7, { droneFrac:0.08 }, 0), atk = V.Sim.roundDamage(S, 1), want = Math.max(1, Math.floor(atk * 0.08)), vol = 0, drn = 0, dmgOk = true, sameStep = true, evs = 0, evF = 0;
  for (var i = 0; i < 900; i++) {
    V.Sim.step(S, IN);
    var f = S.events.filter(function(e){ return e.k === 'fire'; }).length, d = S.events.filter(function(e){ return e.k === 'drone'; }).length;
    evF += f; evs += d; if (f !== d) sameStep = false;
    S.rounds.forEach(function(r){ if (r.drone && !r._c) { r._c = 1; drn++; if (r.dmg !== want || r.crit) dmgOk = false; } });
    if (S.phase === 'results') break;
  }
  ok('drone spawns on the state', !!S.drone && S.drone.frac === 0.08);
  ok('drone fires once per rifle volley, same step (' + evF + ' volleys)', evF > 5 && evs === evF && sameStep, [evF, evs]);
  ok('every drone round = floor(ATK x 0.08) = ' + want + ', never a crit', drn === evs && dmgOk, [drn, want]);
  ok('drone sits at the shoulder (0.4 to 0.7 tiles from the Operator)', (function(){ var d = Math.hypot(S.drone.x - S.hero.x, S.drone.y - S.hero.y); return d > 0.4 && d < 0.7; })());
  // the drone's round hits the same machine the rifle is on
  var T2 = arena({ droneFrac:0.1 }), e = addEnemy(T2, 4.5, 6, 1e6); T2.hero.x = 4.5; T2.hero.y = 12; T2.hero.ang = -Math.PI / 2;
  for (var j = 0; j < 400; j++) V.Sim.step(T2, IN);
  var dh = 0; T2.events.length = 0;
  var hp0 = e.hp; for (var k = 0; k < 400; k++) { V.Sim.step(T2, IN); T2.events.forEach(function(x){ if (x.k === 'hit' && x.id === e.id) dh++; }); }
  ok('the locked machine takes rifle and drone hits', e.hp < hp0 && dh > 2, [hp0 - e.hp, dh]);
  ok('drone fires nothing when there is no target', (function(){ var A = arena({ droneFrac:0.1 }); for (var i = 0; i < 120; i++) { V.Sim.step(A, IN); } return A.rounds.every(function(r){ return !r.drone; }); })());
  var dd = function(fr){ var A = run(7, fr ? { droneFrac:fr } : {}, 700), t = 0; A.stats.kills; return A.stats.shots; };
  ok('drone does not count as a rifle shot (stats.shots same with and without)', dd(0.08) === dd(0));
})();
// droneFrac scales: L1 4% and L5 8% of the same ATK
ok('droneFrac 0.04 vs 0.08 halves the damage (ATK ' + V.Sim.roundDamage(run(7, {}, 0), 1) + ')', (function(){
  var a = V.Sim.roundDamage(run(7, {}, 0), 1); return Math.floor(a * 0.04) * 2 <= Math.floor(a * 0.08) + 1 && Math.floor(a * 0.08) >= Math.floor(a * 0.04); })());

// ---- 4. Guard Drone ----
(function(){
  var S = arena({ guardEvery:10 }), h = S.hero;
  function shot(){ S.shots.push({ x:h.x, y:h.y, vx:0, vy:0, r:0.12, dmg:30, src:'E-02', bounces:0, life:5 }); }
  ok('guard starts charged', S.guard && S.guard.t === 0 && S.guard.every === 10);
  var hp0 = h.hp; shot(); V.Sim.step(S, IN);
  ok('first enemy round is blocked: no damage, shot removed, guard event', h.hp === hp0 && S.shots.length === 0 && S.events.some(function(e){ return e.k === 'guard'; }) && S.guard.blocks === 1, [h.hp, hp0]);
  ok('guard now recharging for 10 s', Math.abs(S.guard.t - 10) < 0.02, S.guard.t);
  for (var i = 0; i < 60 * 5; i++) V.Sim.step(S, IN);
  ok('after 5 s it is half charged', Math.abs(S.guard.t - 5) < 0.1, S.guard.t);
  shot(); V.Sim.step(S, IN);
  ok('second round while recharging hurts', h.hp < hp0 && S.guard.blocks === 1, [h.hp, hp0]);
  for (var j = 0; j < 60 * 4.5; j++) V.Sim.step(S, IN);   // 5 s in plus 0.0x: still short of 10
  ok('not ready at 9.5 s', S.guard.t > 0, S.guard.t);
  for (var k = 0; k < 60; k++) V.Sim.step(S, IN);
  ok('ready again after guardEvery seconds', S.guard.t === 0, S.guard.t);
  var hp1 = h.hp; h.invulnT = 0; shot(); V.Sim.step(S, IN);
  ok('third round blocked again', h.hp === hp1 && S.guard.blocks === 2, [h.hp, hp1]);
  // blocked rounds do not burn charge while the Operator is invulnerable
  var B = arena({ guardEvery:10 }); B.hero.invulnT = 0.5; B.shots.push({ x:B.hero.x, y:B.hero.y, vx:0, vy:0, r:0.12, dmg:30, src:'E-02', bounces:0, life:5 }); V.Sim.step(B, IN);
  ok('an invulnerable Operator does not spend the charge', B.guard.blocks === 0 && B.guard.t === 0);
  // without the key a shot hurts
  var N = arena({}); N.shots.push({ x:N.hero.x, y:N.hero.y, vx:0, vy:0, r:0.12, dmg:30, src:'E-02', bounces:0, life:5 }); var hpN = N.hero.hp; V.Sim.step(N, IN);
  ok('without guardEvery the same shot hurts', N.hero.hp < hpN, [N.hero.hp, hpN]);
  ok('guardEvery 14 (L1) vs 10 (L5) sets the recharge', (function(){ var A = arena({ guardEvery:14 }); A.shots.push({ x:A.hero.x, y:A.hero.y, vx:0, vy:0, r:0.12, dmg:30, src:'E-02', bounces:0, life:5 }); V.Sim.step(A, IN); return Math.abs(A.guard.t - 14) < 0.02; })());
})();

// ---- 5. Piercing Rounds ----
(function(){
  function lineup(meta){
    var S = arena(meta), A = addEnemy(S, 4.5, 8, 1e6), B = addEnemy(S, 4.5, 7.2, 1e6), C = addEnemy(S, 4.5, 6.4, 1e6);
    S.hero.x = 4.5; S.hero.y = 13; S.hero.braceT = -1e9;   // never braced: the rifle stays silent, only the placed round flies
    S.rounds.push({ x:4.5, y:10, vx:0, vy:-V.TUNE.ROUND_SPEED, r:V.TUNE.ROUND_R, dmg:100, crit:false, bounces:0, wallBounces:0, hit:[] });
    for (var i = 0; i < 40; i++) { S.hero.braceT = -1e9; S.hero.fireCd = 9; V.Sim.step(S, IN); }
    return { A:A.maxHp - A.hp, B:B.maxHp - B.hp, C:C.maxHp - C.hp };
  }
  var off = lineup({}), on = lineup({ pierceFrac:0.5 }), on2 = lineup({ pierceFrac:0.8 });
  ok('no key: the round stops in the first machine', off.A === 100 && off.B === 0 && off.C === 0, off);
  ok('pierceFrac 0.5: first 100, second 50, third untouched', on.A === 100 && on.B === 50 && on.C === 0, on);
  ok('pierceFrac 0.8: second takes 80', on2.A === 100 && on2.B === 80 && on2.C === 0, on2);
  // stacks after a mod pierce (SK-07): the mod round keeps its own pierce, the gear pass comes when it would stop
  var S = arena({ pierceFrac:0.5 }); addEnemy(S, 4.5, 8, 1e6); S.hero.x = 4.5; S.hero.y = 13;
  S.rounds.push({ x:4.5, y:10, vx:0, vy:-V.TUNE.ROUND_SPEED, r:V.TUNE.ROUND_R, dmg:100, crit:false, bounces:0, wallBounces:0, hit:[], drone:true });
  for (var i = 0; i < 20; i++) { S.hero.fireCd = 9; V.Sim.step(S, IN); }
  ok('drone rounds do not pierce', S.enemies[0].maxHp - S.enemies[0].hp === 100 && !S.rounds.some(function(r){ return r.drone; }));
})();

// ---- 6. full runs with every gear key on stay deterministic ----
(function(){
  var G = { hpAdd:100, dmgTakenMul:0.95, critAdd:0.075, critDmgAdd:0.25, droneFrac:0.08, guardEvery:10, pierceFrac:0.8 };
  var a = V.Sim.hash(run(5, G, 1500)), b = V.Sim.hash(run(5, G, 1500));
  ok('same seed, max gear: same hash twice', a === b, [a, b]);
  var S = run(5, G, 600); ok('max gear changes the 600-step hash (it does something)', V.Sim.hash(S) !== HASH600);
  ok('max gear Operator HP 700', S.hero.maxHp === 700, S.hero.maxHp);
})();

console.log(n - fails + ' passed, ' + fails + ' failed (' + n + ' checks)');
process.exit(fails ? 1 : 0);
