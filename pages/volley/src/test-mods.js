// Headless checks for parts/mods.js. Run: node test-mods.js
var path = require('path');
['tune', 'rng', 'mods'].forEach(function(f){ require(path.join(__dirname, 'parts', f + '.js')); });
var V = globalThis.V, Mods = V.Mods, D = Mods.D;
var rows = [], fails = 0;
function check(id, what, ok, got){ rows.push([id, what, ok ? 'PASS' : 'FAIL', got]); if (!ok) fails++; }
function near(a, b, eps){ return Math.abs(a - b) < (eps || 1e-9); }
function mkS(mods, seed){
  return { seed:seed || 1, stage:1, roomId:'R01', tune:V.TUNE, rng:new V.Rng(seed || 1), fx:[], events:[],
    hero:{ x:4.5, y:14, hp:600, maxHp:600, mods:mods || {} }, enemies:[] };
}
function en(id, x, y, hp){ return { id:id, x:x, y:y, r:0.35, hp:hp || 1e6, maxHp:hp || 1e6, st:'move' }; }
function M(id){ return Mods.byId(id); }
function fakeApi(log){
  return { rng:function(S){ return S.rng; },
    damageEnemy:function(S, e, d, crit, o){ e.hp -= d; log.push({ id:e.id, d:d, o:o }); if (e.hp <= 0) { e.hp = 0; return true; } return false; } };
}
function deg(a){ return Math.round(a * 180 / Math.PI); }

// ---- registry ----
var F = V.MODS.filter(function(m){ return m.pool.indexOf('F') >= 0; }).map(function(m){ return m.id; });
var SD = V.MODS.filter(function(m){ return m.pool.indexOf('SD') >= 0; }).map(function(m){ return m.id; });
check('ALL', 'field pool ids exact', ['SK-01','SK-02','SK-03','SK-04','SK-05','SK-06','SK-07','SK-09','SK-11','SK-13','SK-15','SK-16','SK-17','SK-27','SK-33'].every(function(i){ return F.indexOf(i) >= 0; }) && F.length === 15, F.length + ' (D2 lists 15 ids under "16 mods")');
check('ALL', 'SD pool = SK-10,12,14,15', SD.join() === 'SK-10,SK-12,SK-14,SK-15', SD.join());
check('ALL', 'V.CARDS === V.MODS, unique keys', V.CARDS === V.MODS && new Set(V.MODS.map(function(m){ return m.key; })).size === V.MODS.length, V.MODS.length + ' entries');
check('ALL', 'names short, desc one line', V.MODS.every(function(m){ return m.name.length <= 18 && m.desc.length <= 60 && m.desc.indexOf('\n') < 0; }), 'max desc ' + Math.max.apply(null, V.MODS.map(function(m){ return m.desc.length; })));

// ---- stats ----
function atkOf(st){ return (1 + st.atkAdd) * st.atkMul * st.primaryMul; } function rateOf(st){ return (1 + st.rateAdd) * st.rateMul; }
var st = Mods.stats(mkS({ atk:2, rate:1, multi:1 }));
check('SK-09/11/02', 'atk 1.6x0.9=1.44, rate 1.25x0.85', near(atkOf(st), 1.44) && near(rateOf(st), 1.0625), [atkOf(st).toFixed(4), rateOf(st).toFixed(4)].join(' '));
// order independence: run hooks reversed
var st2 = Mods.newStats();
['SK-02', 'SK-11', 'SK-12'].forEach(function(id){ M(id).hooks.stats(null, id === 'SK-02' ? 2 : 1, st2); });
var st3 = Mods.newStats();
['SK-12', 'SK-11', 'SK-02'].forEach(function(id){ M(id).hooks.stats(null, id === 'SK-02' ? 2 : 1, st3); });
check('SK-02/11/12', 'rate order-independent (1.375 x 0.7225)', near(rateOf(st2), rateOf(st3)) && near(rateOf(st2), 1.375 * 0.7225), rateOf(st2).toFixed(5) + ' / ' + rateOf(st3).toFixed(5));
st = Mods.stats(mkS({ multi:3, front:1 }));
check('SK-01+02', 'prim 0.75 x 0.9^3, rate 0.85^3', near(atkOf(st), 0.75 * 0.729) && near(rateOf(st), 0.614125), atkOf(st).toFixed(4) + ' ' + rateOf(st).toFixed(4));
st = Mods.stats(mkS({ atk2:4, rate2:4 }));
check('SK-10/12', 'minors x4: atk 1.6, rate 1.5', near(atkOf(st), 1.6) && near(rateOf(st), 1.5), atkOf(st) + ' ' + rateOf(st));
st = Mods.stats(mkS({ crit:2, crit2:1 }));
check('SK-13/14', 'crit +0.25, crit dmg +1.0', near(st.critAdd, 0.25) && near(st.critDmgAdd, 1.0), st.critAdd + ' ' + st.critDmgAdd);
st = Mods.stats(mkS({ armor:3 }));
check('SK-15', 'hpMaxAdd 3 x 120', st.hpMaxAdd === 360, st.hpMaxAdd);
var S = mkS({ armor:1 }); S.hero.hp = 300; M('SK-15').hooks.onPick(S, 1);
var S2 = mkS({ armor:1 }); S2.hero.hp = 600; M('SK-15').hooks.onPick(S2, 1);
check('SK-15', 'onPick heals 120, cap new max 720', S.hero.hp === 420 && S2.hero.hp === 720, S.hero.hp + ' / ' + S2.hero.hp);
st = Mods.stats(mkS({ dodge:1 })); var dd = st.dodge;
st = Mods.stats(mkS({ dodge:2 })); var dd2 = st.dodge;
st = Mods.stats(mkS({ dodge:5 }));
var dd3 = Mods.stats(mkS({ dodge:3 })).dodge;
check('SK-33', 'dodge 0.20 / 0.30 / 0.40 by level, capped 0.4 (L2 is a guess)', near(dd, 0.2) && near(dd2, 0.3) && near(dd3, 0.4) && near(st.dodge, 0.4), dd + ' ' + dd2 + ' ' + dd3 + ' ' + st.dodge);

// ---- pattern ----
var L = Mods.pattern(mkS({}));
check('base', 'no mods = 1 forward round', L.length === 1 && L[0].ang === 0, L.length);
L = Mods.pattern(mkS({ front:1 }));
check('SK-01', '2 forward rounds, off -0.15/+0.15', L.length === 2 && near(L[0].off, -0.15) && near(L[1].off, 0.15) && L[1].ang === 0, L.map(function(e){ return e.off.toFixed(2); }).join(','));
L = Mods.pattern(mkS({ diag:3 }));
check('SK-03', '3 copies: 7 rounds at 0,+-35,55,75', L.length === 7 && L.slice(1).map(function(e){ return deg(e.ang); }).join() === '-35,35,-55,55,-75,75', L.map(function(e){ return deg(e.ang); }).join(','));
L = Mods.pattern(mkS({ side:2 }));
check('SK-04', '2 copies: 4 rounds +-90, delay 0/0.12', L.length === 5 && L.slice(1).map(function(e){ return deg(e.ang) + '@' + e.delay; }).join() === '-90@0,90@0,-90@0.12,90@0.12', L.slice(1).map(function(e){ return deg(e.ang) + '@' + e.delay; }).join(','));
L = Mods.pattern(mkS({ rear:3 }));
check('SK-05', '3 copies: 3 rear, delay 0/0.12/0.24', L.length === 4 && L.slice(1).every(function(e, i){ return deg(e.ang) === 180 && near(e.delay, i * 0.12); }), L.slice(1).map(function(e){ return deg(e.ang) + '@' + e.delay.toFixed(2); }).join(','));
L = Mods.pattern(mkS({ front:1, diag:1, side:1, rear:1 }));
check('combo', 'twin+diag+side+rear = 7 rounds', L.length === 7, L.length);

// ---- round flags ----
var r = { dmg:100, hit:[] };
['SK-06', 'SK-07', 'SK-16', 'SK-17'].forEach(function(id){ M(id).hooks.round(null, 1, r); });
check('flags', 'rico=3, pierce, burn, poison', r.rico === 3 && r.pierce && r.burn && r.poison, JSON.stringify({ rico:r.rico, pierce:r.pierce, burn:r.burn, poison:r.poison }));

// ---- ricochet ----
S = mkS({ rico:1 });
var e1 = en(1, 4.5, 5), e2 = en(2, 6.5, 5), e3 = en(3, 4.5, 10.5), e4 = en(4, 3.5, 6);
e4.st = 'spawn';
S.enemies = [e1, e2, e3, e4];
r = { x:4.5, y:5.4, vx:0, vy:-14, r:0.12, dmg:100, hit:[1], keep:false }; M('SK-06').hooks.round(S, 1, r);
M('SK-06').hooks.onHit(S, 1, e1, r, null);
var ang = deg(Math.atan2(r.vy, r.vx));
check('SK-06', 'hit 1 -> jumps to nearest 2 (skips spawning, >4 tiles)', r.keep && r.rico === 2 && r.dmg === 70 && near(Math.hypot(r.vx, r.vy), 14, 1e-6) && Math.abs(ang - deg(Math.atan2(5 - 5.4, 6.5 - 4.5))) <= 1, 'dmg ' + r.dmg + ' ang ' + ang + ' left ' + r.rico);
r.hit = [1, 2]; r.keep = false; r.x = 6.5; r.y = 5;
M('SK-06').hooks.onHit(S, 1, e2, r, null);
check('SK-06', 'no 3rd target in 4 tiles -> round ends', !r.keep && r.rico === 2, 'keep ' + r.keep);
S = mkS({ rico:1 }); S.enemies = [en(1, 1, 1), en(2, 2, 1), en(3, 3, 1), en(4, 4, 1), en(5, 5, 1)];
r = { x:1, y:1, vx:14, vy:0, r:0.12, dmg:1000, hit:[], keep:false }; M('SK-06').hooks.round(S, 1, r);
var jumps = 0;
for (var k = 0; k < 5; k++) { var tgt = S.enemies[k]; r.x = tgt.x; r.y = tgt.y; r.hit.push(tgt.id); r.keep = false; M('SK-06').hooks.onHit(S, 1, tgt, r, null); if (!r.keep) break; jumps++; }
check('SK-06', 'max 3 bounces, x0.7 each (1000 -> 343)', jumps === 3 && r.dmg === 343, jumps + ' jumps, dmg ' + r.dmg);
check('SK-06', 'pushes arc fx', S.fx.filter(function(f){ return f.k === 'arc'; }).length === 3, S.fx.map(function(f){ return f.k; }).join(','));

// ---- pierce ----
S = mkS({ pierce:1 }); r = { x:0, y:0, vx:0, vy:-14, dmg:300, hit:[1], keep:false }; M('SK-07').hooks.round(S, 1, r);
M('SK-07').hooks.onHit(S, 1, en(1, 0, 0), r, null);
var d1 = r.dmg; r.keep = false; M('SK-07').hooks.onHit(S, 1, en(2, 0, -1), r, null);
check('SK-07', 'pierce keeps round, 300 -> 201 -> 134', r.keep && d1 === 201 && r.dmg === 134 && r.pierced === 2, d1 + ' -> ' + r.dmg);
S = mkS({ rico:1, pierce:1 }); var a1 = en(1, 4, 5), a2 = en(2, 5, 5); S.enemies = [a1, a2];
r = { x:4, y:5, vx:0, vy:-14, dmg:100, hit:[1], keep:false }; M('SK-06').hooks.round(S, 1, r); M('SK-07').hooks.round(S, 1, r);
Mods.call(S, 'onHit', a1, r, null);
check('SK-06+07', 'ricochet first, pierce not spent', r.keep && r.dmg === 70 && !r.pierced, 'dmg ' + r.dmg + ' pierced ' + (r.pierced || 0));

// ---- burn ----
function runDot(S, secs, hitEvery, which, api){
  var dt = 1 / 60, steps = Math.round(secs * 60), next = 0;
  for (var i = 0; i < steps; i++) {
    if (hitEvery != null && i === next) { var rr = { burn:true, poison:true }; Mods.call(S, 'onHit', S.enemies[0], rr, api); next += Math.round(hitEvery * 60); if (hitEvery === 0) hitEvery = null; }
    Mods.call(S, 'tick', dt, api);
  }
}
var log = []; S = mkS({ burn:1 }); S.enemies = [en(1, 1, 1, 10000)];
runDot(S, 3, 0, 'burn', fakeApi(log));
check('SK-16', 'one hit: 7 ticks x 27 = 189 over 2 s', log.length === 7 && 10000 - S.enemies[0].hp === 189 && log.every(function(l){ return l.d === 27 && l.o.dot; }) && S.enemies[0].burnT === 0, log.length + ' ticks, ' + (10000 - S.enemies[0].hp) + ' dmg');
log = []; S = mkS({ burn:1 }); S.enemies = [en(1, 1, 1, 1e6)];
runDot(S, 3, 0.1, 'burn', fakeApi(log));
check('SK-16', 'hit every 0.1 s: still 4 ticks/s (no stack)', log.length >= 11 && log.length <= 12, log.length + ' ticks in 3 s');
var ob = en(9, 0, 0, 1e6); S.enemies = [ob]; M('SK-16').hooks.onHit(S, 1, ob, { burn:true });
check('SK-16', 'burnT > 0 after hit (render flag)', ob.burnT > 0 && near(ob.burnT, 1.75), ob.burnT);
log = []; S = mkS({ burn:1 }); S.enemies = [en(1, 1, 1, 50)];
runDot(S, 3, 0, 'burn', fakeApi(log));
check('SK-16', 'burn kill stops ticking', S.enemies[0].hp === 0 && log.length === 2, log.length + ' ticks');
S = mkS({ burn:1 }); S.enemies = [en(1, 1, 1, 100)]; runDot(S, 3, 0, 'burn', null);
check('SK-16', 'fallback (no api.damageEnemy) still damages', S.enemies[0].hp === 0, 'hp ' + S.enemies[0].hp);

// ---- poison ----
log = []; S = mkS({ poison:1 }); S.enemies = [en(1, 1, 1, 1e6)];
runDot(S, 5.01, 0, 'poison', fakeApi(log));
check('SK-17', 'one hit: 52 every 1 s, 5 ticks in 5 s', log.length === 5 && log.every(function(l){ return l.d === 52; }), log.length + ' ticks x ' + (log[0] && log[0].d));
log = []; S = mkS({ poison:1 }); S.enemies = [en(1, 1, 1, 1e6)];
runDot(S, 5.01, 0.3, 'poison', fakeApi(log));
check('SK-17', 're-hit does not reset timer or stack', log.length === 5, log.length + ' ticks');
check('SK-17', 'poisonT > 0 while alive', S.enemies[0].poisonT > 0, S.enemies[0].poisonT);

// ---- salvage ----
S = mkS({ salvage:1 }); S.hero.hp = 100; var healed = [];
for (k = 0; k < 20; k++) { var hp0 = S.hero.hp; Mods.call(S, 'onKill', en(k, 0, 0), null); healed.push(S.hero.hp - hp0); }
check('SK-27', '9 per kill, 120 cap per room', healed[0] === 9 && S.hero.hp === 220, 'first ' + healed[0] + ', total ' + (S.hero.hp - 100));
S.stage = 2; S.roomId = 'R02'; Mods.call(S, 'onKill', en(99, 0, 0), null);
check('SK-27', 'cap resets next room', S.hero.hp === 229, S.hero.hp);
S.hero.hp = 595; Mods.call(S, 'onKill', en(98, 0, 0), null);
check('SK-27', 'never above max HP', S.hero.hp === 600, S.hero.hp);

// ---- offer ----
var rng = new V.Rng(7), bad = 0, dup = 0, noCore = 0, wrongPool = 0, n = 0, freq = {}, capShown = 0;
for (var t = 0; t < 4000; t++) {
  var mods = {};
  V.MODS.forEach(function(m){ var c = rng.int(5); if (m.max && c > m.max) c = m.max; if (c > 3) c = 3; mods[m.key] = c; });
  S = mkS(mods, t);
  var off = Mods.offer(S, 'F', 3, rng);
  n++;
  if (off.length !== 3) bad++;
  if (new Set(off.filter(function(i){ return !Mods.isRepair(i); })).size !== off.filter(function(i){ return !Mods.isRepair(i); }).length) dup++;
  if (Mods.legalCount(S, 'F') > 0 && !off.some(function(i){ return V.MODS[i].core; }) && Mods.legalCount(S, 'F') >= 3 && V.MODS.some(function(m, ix){ return m.core && !Mods.capped(S, m); })) noCore++;
  off.forEach(function(i){ var m = V.MODS[i]; if (m.pool.indexOf('F') < 0 && !Mods.isRepair(i)) wrongPool++; if (Mods.capped(S, m)) capShown++; });
}
check('offer', '4000 random states: 3 distinct F cards', bad === 0 && dup === 0 && wrongPool === 0, 'bad ' + bad + ' dup ' + dup + ' pool ' + wrongPool);
check('offer', 'never a capped mod', capShown === 0, capShown + ' capped shown');
check('offer', 'pity A: always >= 1 core', noCore === 0, noCore + ' without core');
S = mkS({ front:1 }); var seen01 = 0;
for (t = 0; t < 2000; t++) Mods.offer(S, 'F', 3, rng).forEach(function(i){ if (V.MODS[i].id === 'SK-01') seen01++; });
check('offer', 'SK-01 still offered after 1 copy (stacking, pick 20)', seen01 > 100, seen01);
S = mkS({});
for (t = 0; t < 20000; t++) Mods.offer(S, 'F', 1, rng, { noPity:true }).forEach(function(i){ freq[V.MODS[i].id] = (freq[V.MODS[i].id] || 0) + 1; });
var wTot = V.MODS.reduce(function(a, m){ return a + (m.pool.indexOf('F') >= 0 ? m.weight : 0); }, 0);
var worst = 0; Object.keys(freq).forEach(function(id){ var exp = M(id).weight / wTot; worst = Math.max(worst, Math.abs(freq[id] / 20000 - exp) / exp); });
check('offer', 'single draw follows weight (within 10%)', worst < 0.1, 'worst rel err ' + (worst * 100).toFixed(1) + '%');
var sdBad = 0, sdSeen = {};
S = mkS({ atk2:4 });
for (t = 0; t < 2000; t++) { var so = Mods.offer(S, 'SD', 2, rng); so.forEach(function(i){ var m = V.MODS[i]; sdSeen[m.id] = 1; if (m.pool.indexOf('SD') < 0 || Mods.capped(S, m)) sdBad++; }); if (so.length !== 2 || so[0] === so[1]) sdBad++; }
check('offer', 'SD: 2 distinct minors, capped SK-10 never', sdBad === 0 && !sdSeen['SK-10'] && Object.keys(sdSeen).length === 3, Object.keys(sdSeen).sort().join(','));
var o1 = Mods.offer(mkS({}, 3), 'F', 3, new V.Rng(42)).join(), o2 = Mods.offer(mkS({}, 3), 'F', 3, new V.Rng(42)).join();
check('offer', 'deterministic for same rng seed', o1 === o2, o1);
S = mkS({}); V.MODS.forEach(function(m){ S.hero.mods[m.key] = m.max || 9; });
off = Mods.offer(S, 'F', 3, rng);
check('offer', 'all F mods at level 3: 3 Emergency repair cards, never a blank', off.length === 3 && off.every(Mods.isRepair), off.map(function(i){ return V.MODS[i].id; }).join(','));

// ---- stacking (pick 20) ----
var FM = V.MODS.filter(function(m){ return m.pool.indexOf('F') >= 0; });
check('stack', 'every F upgrade caps at level 3', FM.length === 15 && FM.every(function(m){ return m.max === 3; }), FM.map(function(m){ return m.id + ':' + m.max; }).join(' '));
check('stack', 'every F upgrade has a short level-up line (<= 34 chars)', FM.concat([M('SK-RP')]).every(function(m){ return m.up && m.up.length <= 34; }), Math.max.apply(null, FM.map(function(m){ return m.up.length; })) + ' max');
S = mkS({ atk:2 });
check('stack', 'capped() flips at level 3 only', !Mods.capped(S, M('SK-09')) && Mods.capped(mkS({ atk:3 }), M('SK-09')), 'L2 ' + Mods.capped(S, M('SK-09')));
check('stack', 'levelAfter: new = 1, repeat = held + 1', Mods.levelAfter(mkS({}), Mods.indexOf('SK-09')) === 1 && Mods.levelAfter(S, Mods.indexOf('SK-09')) === 3, Mods.levelAfter(S, Mods.indexOf('SK-09')));
var seenL3 = 0; S = mkS({ atk:3, rate:3, crit:3 });
for (t = 0; t < 1000; t++) Mods.offer(S, 'F', 3, rng).forEach(function(i){ if (['SK-09', 'SK-11', 'SK-13'].indexOf(V.MODS[i].id) >= 0) seenL3++; });
check('stack', 'a level 3 upgrade is never offered again (1000 offers)', seenL3 === 0, seenL3);
st = Mods.stats(mkS({ atk:3, rate:3, crit:3, armor:3 }));
check('stack', 'L3 values: atk +0.9, rate +0.75, crit +0.3, hp +360', near(st.atkAdd, 0.9) && near(st.rateAdd, 0.75) && near(st.critAdd, 0.3) && st.hpMaxAdd === 360, [st.atkAdd, st.rateAdd, st.critAdd, st.hpMaxAdd].join(' '));
r = { x:0, y:0, vx:0, vy:-14, dmg:300, hit:[1], keep:false };
[1, 2, 3].forEach(function(n){ var rr = { x:0, y:0 }; M('SK-06').hooks.round(mkS({}), n, rr); r['rico' + n] = rr.rico; });
check('stack', 'SK-06 jumps 3 / 4 / 5 by level (L2, L3 guesses)', r.rico1 === 3 && r.rico2 === 4 && r.rico3 === 5, r.rico1 + ' ' + r.rico2 + ' ' + r.rico3);
var pd = [1, 2, 3].map(function(n){ var rr = { x:0, y:0, vx:0, vy:-14, dmg:1000, hit:[1], keep:false, pierce:true }; M('SK-07').hooks.onHit(mkS({}), n, en(9, 0, 0), rr, fakeApi([])); return rr.dmg; });
check('stack', 'SK-07 pierce keeps 67 / 75 / 82 percent by level', pd.join() === '670,750,820', pd.join());
var bd = [1, 2, 3].map(function(n){ var e = en(7, 1, 1); M('SK-16').hooks.onHit(mkS({}), n, e, { burn:n }, fakeApi([])); return e.burnDmg; });
check('stack', 'SK-16 burn 27 / 40 / 54 by level (+50% each)', bd.join() === '27,40,54', bd.join());
var pz = [1, 2, 3].map(function(n){ var e = en(7, 1, 1); M('SK-17').hooks.onHit(mkS({}), n, e, { poison:n }, fakeApi([])); return e.poisonDmg; });
check('stack', 'SK-17 poison 52 / 78 / 105 by level', pz.join() === '52,78,105', pz.join());
var sv = [1, 2, 3].map(function(n){ var SS2 = mkS({ salvage:n }); SS2.hero.hp = 100; M('SK-27').hooks.onKill(SS2, n, en(1, 0, 0)); return SS2.hero.hp - 100; });
check('stack', 'SK-27 heals 9 / 18 / 27 per kill', sv.join() === '9,18,27', sv.join());
// pick through the same path the sim uses (hero.mods count + onPick), to level 3
S = mkS({}); for (t = 0; t < 3; t++) { S.hero.mods.armor = (S.hero.mods.armor || 0) + 1; M('SK-15').hooks.onPick(S, S.hero.mods.armor); }
check('stack', 'SK-15 picked 3 times: held 3, capped, offer drops it', S.hero.mods.armor === 3 && Mods.capped(S, M('SK-15')), S.hero.mods.armor);

// ---- Emergency repair (03 Dry pool) ----
S = mkS({}); S.hero.hp = 300; M('SK-RP').hooks.onPick(S, 1);
check('repair', 'heals 25% of max HP (150), never above max', S.hero.hp === 450, S.hero.hp);
S = mkS({}); S.hero.hp = 590; M('SK-RP').hooks.onPick(S, 1);
check('repair', 'capped at max HP', S.hero.hp === 600, S.hero.hp);
S = mkS({ front:3, multi:3, diag:3, side:3, rear:3, rico:3, pierce:3, atk:3, rate:3, crit:3, armor:3, burn:3, poison:3, salvage:0, dodge:3 });
off = Mods.offer(S, 'F', 3, rng);
check('repair', 'one legal card left (salvage): 1 real + 2 Emergency repair', off.length === 3 && off.filter(Mods.isRepair).length === 2 && V.MODS[off[0]].id === 'SK-27', off.map(function(i){ return V.MODS[i].id; }).join(','));
check('repair', 'repair is not in the F or SD pool', V.MODS.filter(function(m){ return m.id === 'SK-RP' && (m.pool.indexOf('F') >= 0 || m.pool.indexOf('SD') >= 0); }).length === 0, 'pool EM');

// ---- reroll bank (pick 21) ----
S = mkS({}); S.phase = 'pick'; S.cards = Mods.offer(S, 'F', 3, S.rng); S.stats = {};
check('reroll', 'empty at run start; canReroll false with none banked', Mods.rerolls(S) === 0 && !Mods.canReroll(S) && !Mods.reroll(S), Mods.rerolls(S));
var cards0 = S.cards.slice();
check('reroll', 'a reroll with none banked leaves the cards alone', S.cards.join() === cards0.join(), S.cards.join());
Mods.bankReroll(S); Mods.bankReroll(S);
check('reroll', 'boss kill banks one each: 2 banked', Mods.rerolls(S) === 2, Mods.rerolls(S));
var okR = Mods.reroll(S);
check('reroll', 'spend: 1 left, 3 cards, none repeated, none duplicated', okR && Mods.rerolls(S) === 1 && S.cards.length === 3 && S.cards.every(function(c){ return cards0.indexOf(c) < 0; }) && new Set(S.cards).size === 3, cards0.join() + ' -> ' + S.cards.join());
check('reroll', 'stats.rerollsUsed counts spends', S.stats.rerollsUsed === 1, S.stats.rerollsUsed);
S.phase = 'play';
check('reroll', 'cannot reroll outside a pick', !Mods.canReroll(S) && !Mods.reroll(S) && Mods.rerolls(S) === 1, 'phase play');
var ra = mkS({}, 77), rb = mkS({}, 77); [ra, rb].forEach(function(x){ x.phase = 'pick'; x.stats = {}; x.cards = Mods.offer(x, 'F', 3, x.rng); x.rerolls = 2; Mods.reroll(x); Mods.reroll(x); });
check('reroll', 'deterministic by seed: two rerolls match', ra.cards.join() === rb.cards.join() && ra.rerolls === 0, ra.cards.join() + ' / ' + rb.cards.join());
S = mkS({ front:3, multi:3, diag:3, side:3, rear:3, rico:3, pierce:3, atk:3, rate:3, crit:3, armor:3, burn:3, poison:3, salvage:3 }); S.phase = 'pick'; S.rerolls = 1; S.stats = {};
S.cards = Mods.offer(S, 'F', 3, S.rng);
check('reroll', 'nothing legal left to roll: button off, bank kept (03 Dry pool)', !Mods.canReroll(S) && !Mods.reroll(S) && S.rerolls === 1, 'cards ' + S.cards.join());
S = mkS({}); S.phase = 'pick'; S.rerolls = 1; S.stats = {}; S.cards = Mods.offer(S, 'F', 3, S.rng); Mods.reroll(S);
check('reroll', 'reroll queues a reroll event with the count left', S.events.some(function(e){ return e.k === 'reroll' && e.left === 0; }), JSON.stringify(S.events));
// no repeats across 500 random states
var rep500 = 0;
for (t = 0; t < 500; t++) { S = mkS({ atk:rng.int(4), crit:rng.int(4), front:rng.int(4) }, t); S.phase = 'pick'; S.rerolls = 1; S.stats = {}; S.cards = Mods.offer(S, 'F', 3, S.rng); var old = S.cards.filter(function(c){ return !Mods.isRepair(c); }); if (Mods.reroll(S)) S.cards.forEach(function(c){ if (!Mods.isRepair(c) && old.indexOf(c) >= 0) rep500++; }); }
check('reroll', '500 random offers: a reroll never repeats a shown card', rep500 === 0, rep500);

// ---- Deploy roll (picks 25-27) ----
var DP = Mods.Deploy;
check('deploy', '12 boosts in the table, 3 tiers; open ones are D2-D9 (slice)', DP.BOOSTS.length === 12 && DP.TIER.length === 3 && DP.open().map(function(b){ return b.id; }).join() === 'D2,D3,D4,D5,D6,D7,D8,D9', DP.open().length + ' open');
var s1 = DP.make(12345), s2 = DP.make(12345), s3 = DP.make(12346);
check('deploy', 'same seed = same roll; seed changes the roll', JSON.stringify(s1.boost) === JSON.stringify(s2.boost) && JSON.stringify(DP.roll(12345, 0)) === JSON.stringify(s1.boost), JSON.stringify(s1.boost) + ' / ' + JSON.stringify(s3.boost));
var cnt = {}, tiers = [0, 0, 0], N = 30000;
for (t = 0; t < N; t++) { var bo = DP.roll(t * 2654435761 % 4294967296, 0); cnt[bo.id] = (cnt[bo.id] || 0) + 1; tiers[bo.tier]++; }
var wrongB = Object.keys(cnt).filter(function(k){ return !DP.BOOSTS.filter(function(b){ return b.id === k; })[0].open; }).length, minB = Math.min.apply(null, Object.keys(cnt).map(function(k){ return cnt[k]; })), maxB = Math.max.apply(null, Object.keys(cnt).map(function(k){ return cnt[k]; }));
check('deploy', '30000 seeds: only open boosts, each about 1/8 (within 10%)', wrongB === 0 && Object.keys(cnt).length === 8 && minB / (N / 8) > 0.9 && maxB / (N / 8) < 1.1, 'min ' + minB + ' max ' + maxB);
check('deploy', 'tiers about 60 / 30 / 10 percent (within 2 points)', Math.abs(tiers[0] / N - 0.6) < 0.02 && Math.abs(tiers[1] / N - 0.3) < 0.02 && Math.abs(tiers[2] / N - 0.1) < 0.02, tiers.map(function(x){ return (x / N * 100).toFixed(1); }).join(' / '));
var sr = DP.make(999), first = JSON.stringify(sr.boost), second = DP.reroll(sr), again = DP.reroll(sr);
check('deploy', 'one reroll per run: replaces the roll once, then refuses', second && again === null && sr.used && JSON.stringify(sr.boost) === JSON.stringify(DP.roll(999, 1)), first + ' -> ' + JSON.stringify(sr.boost));
var dr = DP.make(999); DP.reroll(dr);
check('deploy', 'reroll deterministic by seed (same two results every time)', JSON.stringify(dr.boost) === JSON.stringify(sr.boost), JSON.stringify(dr.boost));
check('deploy', 'reroll cost 20 / 25 / 30 by chapter, Hard x1.5, Roll Discount halves', DP.rerollCost(1) === 20 && DP.rerollCost(2) === 25 && DP.rerollCost(3) === 30 && DP.rerollCost(1, { hard:true }) === 30 && DP.rerollCost(1, { discount:true }) === 10, [DP.rerollCost(1), DP.rerollCost(2), DP.rerollCost(3), DP.rerollCost(1, { hard:true }), DP.rerollCost(1, { discount:true })].join());
check('deploy', 'every outcome is a boost: no effect is negative', DP.open().every(function(b){ return [0, 1, 2].every(function(ti){ var e = DP.effects({ id:b.id, tier:ti }); return Object.keys(e).every(function(k){ return e[k] >= 0; }); }); }), 'all >= 0');
check('deploy', 'tier values rise: D2 +5/+10/+17, D4 6/12/21, D5 -4/-8/-14, D9 10/20/35', [0, 1, 2].map(function(ti){ return DP.effects({ id:'D2', tier:ti }).atk; }).join() === '0.05,0.1,0.17' && DP.effects({ id:'D4', tier:2 }).hp === 0.21 && DP.effects({ id:'D5', tier:1 }).dmgCut === 0.08 && DP.effects({ id:'D9', tier:0 }).credits === 0.1, 'ok');
check('deploy', 'D7 opening pick: 1 / 1 (level 2) / 2 (level 2)', JSON.stringify([0, 1, 2].map(function(ti){ var e = DP.effects({ id:'D7', tier:ti }); return [e.picks, e.pickLv2]; })) === '[[1,0],[1,1],[2,2]]', 'ok');
check('deploy', 'card text names the exact effect', DP.text({ id:'D9', tier:2 }) === 'Credits +35% this run' && DP.info({ id:'D7', tier:0 }).text.indexOf('Head start') === 0 && DP.info({ id:'D2', tier:2 }).pips === 3, DP.text({ id:'D9', tier:2 }));
// stats application
S = mkS({}); S.deploy = { id:'D2', tier:1 }; st = DP.applyStats(S, Mods.newStats());
var S5 = mkS({}); S5.deploy = { id:'D5', tier:2 }; var st5 = DP.applyStats(S5, Mods.newStats());
var S6 = mkS({}); S6.deploy = { id:'D6', tier:1 }; var st6 = DP.applyStats(S6, Mods.newStats());
var S4b = mkS({}); S4b.deploy = { id:'D4', tier:1 }; var st4 = DP.applyStats(S4b, Mods.newStats());
check('deploy', 'applyStats: atk x1.10, dmg taken x0.86, crit +0.08, hp +72', near(st.atkMul, 1.1) && near(st5.dmgTakenMul, 0.86) && near(st6.critAdd, 0.08) && st4.hpMaxAdd === 72, [st.atkMul, st5.dmgTakenMul, st6.critAdd, st4.hpMaxAdd].join(' '));
var sc = mkS({}); sc.deploy = { id:'D5', tier:2 }; var stc = Mods.newStats(); stc.dmgTakenMul = 0.55; DP.applyStats(sc, stc);
check('deploy', 'damage taken stays at or above the 50 percent cap', near(stc.dmgTakenMul, 0.5), stc.dmgTakenMul);
S = mkS({}); S.deploy = { id:'D8', tier:1 }; DP.runStart(S); var left = DP.absorb(S, 50), left2 = DP.absorb(S, 100), left3 = DP.absorb(S, 40);
check('deploy', 'D8 shield 20% of 600 = 120: absorbs 50, then 70 of 100, then nothing', S.deployShield === 0 && left === 0 && left2 === 30 && left3 === 40, [left, left2, left3].join());
S = mkS({}); S.deploy = { id:'D7', tier:2 }; DP.runStart(S); DP.runStart(S);
check('deploy', 'D7 elite: 2 opening picks, runStart is once only, both enter at level 2', S.freePicks === 2 && DP.pickBonus(S) && DP.pickBonus(S) && !DP.pickBonus(S), S.freePicks);
check('deploy', 'creditMul: no boost 1.0, D9 elite 1.35', DP.creditMul(mkS({})) === 1 && near(DP.creditMul({ deploy:{ id:'D9', tier:2 } }), 1.35), DP.creditMul({ deploy:{ id:'D9', tier:2 } }));
var enc = DP.encode(DP.make(4242)), dec = DP.decode(enc), usedS = DP.make(4242); DP.reroll(usedS);
var dec2 = DP.decode(DP.encode(usedS));
check('deploy', 'save round trip keeps seed, boost and reroll state (no free new roll)', dec && JSON.stringify(dec.boost) === JSON.stringify(DP.roll(4242, 0)) && dec2.used && JSON.stringify(dec2.boost) === JSON.stringify(usedS.boost), enc);
check('deploy', 'bad save text is rejected, never thrown', ['', 'x', '{}', '{"v":1,"seed":-1,"used":false}', '{"v":1,"seed":1.5,"used":false}', '{"v":2,"seed":1,"used":false}', '{"v":1,"seed":1,"used":"no"}'].every(function(x){ return DP.decode(x) === null; }), 'all null');
var q = DP.make(5); q.started = true;
check('deploy', 'quit before stage 3 keeps the roll; stage 3+ spends it', DP.afterRun(q, 2) === q && q.started === false && DP.afterRun(Object.assign(DP.make(5), { started:true }), 3) === null, 'ok');

S = mkS({}); S.deploy = { id:'D4', tier:1 }; S.hero.hp = 600; S.hero.maxHp = 672; DP.runStart(S);
check('deploy', 'runStart heals to full (D4 max HP boost starts at max)', S.hero.hp === 672, S.hero.hp);

// ---- optional integration with the sim, if its hooks are there ----
try {
  ['rooms', 'stages', 'sim', 'ai-p0', 'ai-p1', 'boss'].forEach(function(f){ try { require(path.join(__dirname, 'parts', f + '.js')); } catch (e) { if (f === 'sim') throw e; } });
  if (V.Sim && V.Sim.api) {
    var SS = V.Sim.create(5, V.TUNE);
    var ok = true, err = '';
    V.MODS.forEach(function(m){ if (m.pool.indexOf('F') >= 0 || m.pool.indexOf('SD') >= 0) SS.hero.mods[m.key] = 1; });
    try { for (k = 0; k < 1800; k++) V.Sim.step(SS, { mx:0, my:0 }); } catch (e) { ok = false; err = e.message; }
    check('sim', 'every mod held x1, 30 s of sim steps run', ok, ok ? ('kills ' + SS.stats.kills + ', phase ' + SS.phase) : err);
    var S3 = V.Sim.create(9, V.TUNE); S3.hero.mods = { atk:1, front:1, multi:1 }; S3.st = V.Sim.stats(S3);
    var rd = V.Sim.roundDamage(S3, 1), exp = Math.floor(150 * 1.3 * 0.75 * 0.9);
    check('sim', 'real roundDamage: atk+twin+volley = ' + exp, rd === exp, rd);
    var S4 = V.Sim.create(11, V.TUNE); S4.hero.mods = { burn:1, poison:1 }; S4.st = V.Sim.stats(S4);
    var tgt4 = S4.enemies[0], hp4;
    if (tgt4) {
      tgt4.hp = tgt4.maxHp = 1e6; hp4 = tgt4.hp; tgt4.st = 'move';
      Mods.call(S4, 'onHit', tgt4, { burn:true, poison:true, hit:[] }, V.Sim.api);
      var dots = 0; for (k = 0; k < 60 * 2.05; k++) { Mods.call(S4, 'tick', 1 / 60, V.Sim.api); dots += S4.events.filter(function(o){ return o.k === 'dot'; }).length; S4.events.length = 0; }
      check('sim', 'real api: 2 s of burn+poison = 7x27 + 2x52, dot events', hp4 - tgt4.hp === 7 * 27 + 2 * 52 && dots === 9, (hp4 - tgt4.hp) + ' dmg, ' + dots + ' dot events');
    }
  } else check('sim', 'integration (V.Sim.api not present yet)', true, 'skipped');
} catch (e) { check('sim', 'integration load', false, e.message); }

// ---- table ----
var w = [0, 0, 0, 0];
rows.forEach(function(r){ for (var i = 0; i < 4; i++) w[i] = Math.max(w[i], String(r[i]).length); });
function pad(s, n){ s = String(s); while (s.length < n) s += ' '; return s; }
console.log(pad('mod', w[0]) + ' | ' + pad('check', w[1]) + ' | ' + pad('res', 4) + ' | got');
rows.forEach(function(r){ console.log(pad(r[0], w[0]) + ' | ' + pad(r[1], w[1]) + ' | ' + pad(r[2], 4) + ' | ' + r[3]); });
console.log((rows.length - fails) + '/' + rows.length + ' pass');
process.exitCode = fails ? 1 : 0;
