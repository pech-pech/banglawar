// Step 7 (volley-v2-5) AI tests, K3: machines E-06 Splitter (+ E-06h halves), E-07 Burrower, E-08 Sniper; bosses B-03 (s20), B-02 (s30),
// B-03V (s40), B-04 (s50). Each: spawn, tell before damage, damage values, death (split where relevant), determinism; each boss in its
// baked arena: HP on the table target, intro 2.5 s, both attacks seen, phase / split seen, and killed by the human bot (bot.js).
// Machine sections are durable copies of the agents' scratch tests (M6 test-e06.js, M7-test-e07.js, M8 test-e08.js), trimmed.
// Run from anywhere: node src/test-ai-s7.js   (about 1 minute). Real sim only (V.Sim), no stubs. Exit 1 on any FAIL.
'use strict';
var path = require('path'), fs = require('fs');
var P = function(f){ return path.join(__dirname, 'parts', f + '.js'); };
['data-stages', 'data-stages-gen', 'data-enemies', 'tune', 'rng', 'rooms', 'stages', 'mods', 'sim', 'ai-p0', 'ai-p1', 'boss-kit', 'boss',
 'boss-b03', 'boss-b02', 'boss-b04', 'ai-e06', 'ai-e07', 'ai-e08'].forEach(function(f){ if (fs.existsSync(P(f))) require(P(f)); else console.log('MISSING part ' + f); });
var V = globalThis.V, api = V.Sim.api, STEP = 1 / 60, fails = 0, n = 0, skips = 0;
var QUICK = process.argv.indexOf('--quick') >= 0;   // fewer seeds for the boss fights
function ok(name, c, info){ n++; if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + (typeof info === 'string' ? info : JSON.stringify(info)) + ']' : '')); }
function info(s){ console.log('INFO ' + s); }
function fnv(s){ var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
function tune(extra){ return Object.assign({}, V.TUNE_DEFAULTS, extra || {}); }
function has(t){ return !!(V.AI[t] && V.Data.enemies[t]); }
function section(t, fn){ if (!has(t)) { skips++; console.log('SKIP ' + t + ': part not loaded'); return; } try { fn(); } catch (err) { ok(t + ' section ran without throwing', false, err.stack.split('\n').slice(0, 3).join(' | ')); } }
// a clean open room at a given stage: no spawns, hero parked with huge HP, no auto-fire unless the test lets it
function world(seed, stage, solids, hx, hy, tn){
  var S = V.Sim.create(seed, tune(tn), { cols:9 });
  S.enemies.length = 0; S.shots.length = 0; if (S.shells) S.shells.length = 0; if (S.spawnQ) S.spawnQ.length = 0; if (S.pending) S.pending.length = 0;
  S.room.solids = (solids || []).slice(); S.hazards = []; S.phase = 'play';
  S.hero.hp = S.hero.maxHp = 1e6; S.hero.x = hx; S.hero.y = hy; S.stage = stage; return S;
}
var CH1 = V.STAGES.ch1;

// =====================================================================================================================================
// E-06 Splitter (M6): 0.6 s aim-line tell with the 0.3 s seam inside it, 2-round burst of 50; kill -> 2 E-06h halves (never elite, no
// further split) that pop onto open floor; kill event last=false while halves live; room clears after the last half.
section('E-06', function(){
  var def11 = CH1[10];
  function w6(seed, heroXY, spawns){   // stage 11's baked room with no spawns, S.stage 11 for scaling (M6 harness)
    V.STAGES.ch1 = [{ stage:1, kind:'combat', room:def11.room, note:'k3', spawns:[] }].concat(CH1.slice(1));
    var S; try { S = V.Sim.create(seed, tune(), { cols:9 }); } finally { V.STAGES.ch1 = CH1; }
    S.stage = 11; S.hero.hp = S.hero.maxHp = 1e6; S.hero.x = heroXY[0]; S.hero.y = heroXY[1];
    (spawns || []).forEach(function(s){ var e = api.spawnEnemy(S, s[0], s[1], s[2], s[3]); e.st = 'move'; });
    return S;
  }
  function solidAt(S, e){ return api.hitsSolidBody(S, e.x, e.y, e.r - 0.01) || e.x < e.r - 1e-6 || e.x > S.room.w - e.r + 1e-6 || e.y < e.r - 1e-6 || e.y > S.room.h - e.r + 1e-6; }
  ok('E-06 spawn: rows present, behaviour bound to its row', V.AI['E-06'].base === V.Data.enemies['E-06'] && V.AI['E-06h'].base === V.Data.enemies['E-06h']);
  ok('E-06 / E-06h never elite (even when asked)', !api.spawnEnemy(w6(1, [4.5, 12.5]), 'E-06', 4.5, 9.5, true).elite && !api.spawnEnemy(w6(1, [4.5, 12.5]), 'E-06h', 4.5, 9.5, true).elite);
  function runAttack(seed, still){
    var S = w6(seed, [4.5, 12.5], [['E-06', 4.5, 4.5]]), e = S.enemies[0], prev = e.st, tellStart = null, seamStart = null, lockAt = null, shots = [], hurts = [], tells = 0, log = [], nan = 0;
    for (var f = 0; f < 900; f++) {
      S.hero.fireCd = 1e9; S.hero.hp = 1e6;
      V.Sim.step(S, still ? { mx:0, my:0 } : { mx:Math.cos(f * 0.021), my:Math.sin(f * 0.034) * 0.5 });
      if (e.st === 'tell' && prev !== 'tell') { tellStart = S.t; seamStart = null; lockAt = null; tells++; }
      if (e.st === 'tell' && e.seam01 > 0 && seamStart == null) seamStart = S.t - STEP;
      if (e.st === 'tell' && e.locked && lockAt == null) lockAt = S.t;
      S.shots.forEach(function(s){ if (!s._k3) { s._k3 = 1; shots.push({ t:S.t, dmg:s.dmg, tell:tellStart, seam:seamStart, lock:lockAt }); } });
      S.events.forEach(function(v){ if (v.k === 'hurt' && v.src === 'E-06') hurts.push(S.t); });
      ['x', 'y', 'tell01', 'seam01', 'aimAng'].forEach(function(p){ if (typeof e[p] === 'number' && !isFinite(e[p])) nan++; });
      prev = e.st; log.push(e.x.toFixed(4) + e.y.toFixed(4) + e.st + S.shots.length);
    }
    return { S:S, shots:shots, hurts:hurts, tells:tells, nan:nan, hash:fnv(log.join('|')) };
  }
  var r = runAttack(5, true), firsts = r.shots.filter(function(s, i, a){ return i === 0 || a[i - 1].tell !== s.tell; });
  ok('E-06 tell: fires in 15 s (2-round bursts)', r.shots.length >= 4 && r.tells >= 2, r.shots.length + ' rounds, ' + r.tells + ' tells');
  ok('E-06 tell: first round of a burst >= 0.6 s after tell start', firsts.every(function(s){ return s.tell != null && s.t - s.tell >= 0.6 - STEP; }), firsts.map(function(s){ return (s.t - s.tell).toFixed(3); }).join(' '));
  ok('E-06 tell: seam glows the last 0.3 s', firsts.every(function(s){ return s.seam != null && Math.abs(s.t - s.seam - 0.3) <= 2 * STEP; }), firsts.map(function(s){ return s.seam != null ? (s.t - s.seam).toFixed(3) : '-'; }).join(' '));
  ok('E-06 tell: aim locks the last 0.2 s', firsts.every(function(s){ return s.lock != null && Math.abs(s.t - s.lock - 0.2) <= 2 * STEP; }));
  ok('E-06 damage: round = enemyDmg(50) at s11 (' + api.enemyDmg(r.S, 50) + ')', r.shots.every(function(s){ return s.dmg === api.enemyDmg(r.S, 50); }));
  ok('E-06 tell before damage: hurts only after a tell started', r.hurts.length > 0 && r.hurts.every(function(t){ return r.shots.some(function(s){ return s.tell != null && s.tell < t; }); }), r.hurts.length + ' hurts');
  ok('E-06 no NaN', r.nan === 0);
  ok('E-06 deterministic (still and moving)', runAttack(5, true).hash === r.hash && runAttack(5, false).hash === runAttack(5, false).hash, r.hash);
  // death -> split
  function killAt(seed, x, y, heroXY){ var S = w6(seed, heroXY || [4.5, 12.5], [['E-06', x, y]]), e = S.enemies[0]; e.x = x; e.y = y; api.damageEnemy(S, e, e.hp + 10, false); return { S:S, e:e, evs:S.events.slice() }; }
  var K = killAt(3, 4.5, 9.5), halves = K.S.enemies.filter(function(o){ return o.type === 'E-06h'; });
  ok('E-06 death: 2 halves spawn', halves.length === 2, halves.length);
  ok('E-06 death: kill event last=false, split=true while halves live', K.evs.some(function(v){ return v.k === 'kill' && v.type === 'E-06' && v.last === false && v.split; }));
  ok('E-06 death: split event names both halves', K.evs.some(function(v){ return v.k === 'split' && v.halves && v.halves.length === 2; }));
  ok('E-06h: smaller, weaker, not elite, no onDeath (never splits again)', halves.every(function(h){ return h.r < K.e.r && h.maxHp < K.e.maxHp && !h.elite && !V.AI['E-06h'].onDeath; }));
  var kh = halves[0]; if (kh) { var before = K.S.enemies.filter(function(o){ return o.hp > 0; }).length; api.damageEnemy(K.S, kh, kh.hp + 10, false); ok('E-06h death spawns nothing', K.S.enemies.filter(function(o){ return o.hp > 0; }).length === before - 1); }
  // kill next to walls and corners all over the room: halves land on open floor (kill away from a wall)
  var g = V.Data.rooms[def11.room].grid, cells = 0, bad = 0;
  for (var y = 1; y < 11; y++) for (var x = 0; x < 9; x++) { if (g[y][x] === '#' || g[y][x] === '^') continue;
    var k = killAt(10 + x, x + 0.5, y + 0.5);
    for (var f = 0; f < 30; f++) { k.S.hero.fireCd = 1e9; V.Sim.step(k.S, { mx:0, my:0 }); }
    cells++; k.S.enemies.forEach(function(o){ if (o.type === 'E-06h' && solidAt(k.S, o)) bad++; }); }
  ok('E-06 split sweep (' + cells + ' kill spots in ' + def11.room + '): halves never end in cover / walls / room edge', cells > 40 && bad === 0, bad);
  // full flow with auto fire: Splitter then both halves die, room clears after the last half
  function clearRun(seed){ var S = w6(seed, [4.5, 13.5], [['E-06', 4.5, 8.5]]), log = [];
    for (var f = 0; f < 3000 && S.phase === 'play'; f++) { S.hero.hp = 1e6; V.Sim.step(S, { mx:0, my:0 }); S.events.forEach(function(v){ if (v.k === 'kill') log.push(v.type + (v.last ? 'L' : '')); }); }
    return { S:S, log:log }; }
  var cr = clearRun(4);
  ok('E-06 room clears only after the last half dies', cr.S.phase === 'clear' && cr.log.join() === 'E-06,E-06h,E-06hL', cr.log.join() + ' ' + cr.S.phase);
  ok('E-06 clear flow deterministic', clearRun(4).log.join() === cr.log.join());
});

// =====================================================================================================================================
// E-07 Burrower (M7): under (untargetable) -> crack ring tell 1.0 s -> surface, 8-round ring of 50 -> exposed 2.5 s (M 2026-11-12) -> burrow.
section('E-07', function(){
  function run(seed, opt){
    opt = opt || {};
    var S = world(seed, 16, opt.solids || [{ x:3, y:7, w:3, h:1, kind:'block' }], 4.5, 11);
    var e = api.spawnEnemy(S, 'E-07', 4.5, 3.5, !!opt.elite), prev = e.st, log = [], cur = null, hs = [], badT = 0, lockUnder = 0, hitsUnder = 0, contactUnder = 0, nan = 0, inSolid = 0, hurtNoTell = 0, tells = 0;
    for (var f = 0; f < (opt.frames || 1500); f++) {
      var mv = opt.move ? { mx:Math.cos(f * 0.021), my:Math.sin(f * 0.034) } : { mx:0, my:0 };
      S.hero.hp = 1e6; if (opt.fire) S.hero.fireCd = Math.min(S.hero.fireCd, 0.2); else S.hero.fireCd = 1e9;
      var hp0 = e.hp, shots0 = S.shots.length;
      V.Sim.step(S, mv);
      if (S.enemies.indexOf(e) < 0) break;
      if (e.hidden && e.hp < hp0) hitsUnder++;
      if (e.hidden && api.targetable(e)) badT++;
      if (e.hidden && S.hero.lockId === e.id) lockUnder++;
      S.events.forEach(function(v){ if (v.k === 'hurt' && v.src === 'E-07') { if (e.hidden) contactUnder++; if (!tells) hurtNoTell++; } if (v.k === 'tell' && v.type === 'E-07') tells++; });
      if (e.st === 'tell' && prev !== 'tell') { cur = { tell:S.t, x:e.x, y:e.y, dh:Math.hypot(S.hero.x - e.x, S.hero.y - e.y) }; if (api.hitsSolidBody(S, e.x, e.y, e.r)) inSolid++; }
      if (e.st === 'act' && prev === 'tell' && cur) { cur.surf = S.t; cur.shots = S.shots.length - shots0; cur.dmg = S.shots.slice(shots0).map(function(s){ return s.dmg; }); cur.xok = Math.abs(e.x - cur.x) < 1e-9 && Math.abs(e.y - cur.y) < 1e-9; }
      if (e.st === 'under' && prev === 'act' && cur) { cur.down = S.t; log.push(cur); cur = null; }
      ['x', 'y', 'tell01', 'surf01'].forEach(function(p){ if (typeof e[p] === 'number' && !isFinite(e[p])) nan++; });
      hs.push([S.frame, e.x.toFixed(4), e.y.toFixed(4), e.st, e.hp, (e.tell01 || 0).toFixed(3), (e.surf01 || 0).toFixed(3), S.shots.length].join(','));
      prev = e.st;
    }
    return { S:S, e:e, log:log, hash:fnv(hs.join('|')), badT:badT, lockUnder:lockUnder, hitsUnder:hitsUnder, contactUnder:contactUnder, nan:nan, inSolid:inSolid, hurtNoTell:hurtNoTell };
  }
  var s0 = world(1, 16, [], 4.5, 11), e0 = api.spawnEnemy(s0, 'E-07', 4.5, 3.5);
  ok('E-07 spawn: starts hidden (not targetable)', !api.targetable(e0) && e0.hp > 0 && e0.maxHp === e0.hp, [e0.st, e0.hp]);
  [false, true].forEach(function(mv){
    var r = run(7, { move:mv }), tag = 'E-07 ' + (mv ? 'moving' : 'still') + ': ', d50 = api.enemyDmg(r.S, 50);
    ok(tag + 'at least 3 full cycles in 25 s', r.log.length >= 3, r.log.length);
    ok(tag + 'tell (crack ring) 1.0 s effective before surfacing', r.log.every(function(c){ return Math.abs(c.surf - c.tell - 1.0) <= STEP * 1.5; }), r.log.map(function(c){ return (c.surf - c.tell).toFixed(3); }).join(' '));
    ok(tag + '8-round ring of enemyDmg(50) = ' + d50 + ' at s16', r.log.every(function(c){ return c.shots === 8 && c.dmg.every(function(d){ return d === d50; }); }), r.log.map(function(c){ return c.shots; }).join(' '));
    ok(tag + 'exposed 2.5 s, then burrows', r.log.every(function(c){ return Math.abs(c.down - c.surf - 2.5) <= STEP * 1.5; }));
    ok(tag + 'surfaces on the ring; spot >= 1.8 from the Operator, on open floor', r.log.every(function(c){ return c.xok && c.dh >= 1.8 - 1e-6; }) && r.inSolid === 0);
    ok(tag + 'never targetable while under; no NaN; no hurt before the first tell', r.badT === 0 && r.nan === 0 && r.hurtNoTell === 0);
    ok(tag + 'deterministic', run(7, { move:mv }).hash === r.hash, r.hash);
  });
  var rf = run(3, { fire:true, frames:4000, solids:[] });
  ok('E-07 under fire: no damage and no auto-aim lock while under', rf.hitsUnder === 0 && rf.lockUnder === 0);
  ok('E-07 death: killed by the rifle in its exposed windows', rf.S.enemies.indexOf(rf.e) < 0, 'after ' + rf.log.length + ' cycles');
  ok('E-07: no contact damage while underground', run(5, { frames:900 }).contactUnder === 0);
  (function(){ var S = world(9, 16, [], 4.5, 11), e = api.spawnEnemy(S, 'E-07', 4.5, 3.5); e.st = 'under'; e.under = e.hidden = true; var hp = e.hp; api.damageEnemy(S, e, 100, false, { dot:true }); ok('E-07: DoT blocked while hidden', e.hp === hp); })();
  (function(){ var S = world(9, 16, [], 4.5, 11), a = api.spawnEnemy(S, 'E-07', 4.5, 3.5), el = api.spawnEnemy(S, 'E-07', 2, 3, true); ok('E-07 elite: HP x1.5', el.elite && Math.abs(el.maxHp - a.maxHp * 1.5) <= 1, [a.maxHp, el.maxHp]); })();
});

// =====================================================================================================================================
// E-08 Sniper (M8): static; tell 1.2 s with the last 0.4 s locked; one fast round of 110; cover at fire time blocks it; no LOS = no tell.
section('E-08', function(){
  function run(seed, solids, hero, frames, inp, hook, tn){
    var S = world(seed, 1, solids, hero[0], hero[1], tn), e = api.spawnEnemy(S, 'E-08', 4.5, 2.5); e.st = e.afterSpawn || e.st; e.stT = 0;
    var R = { S:S, e:e, tells:[], hurts:[], blocks:[], snipes:[], hs:[], nan:0 }, cur = null, prev = e.st;
    for (var f = 0; f < frames; f++) {
      if (hook) hook(S, e, f);
      S.hero.fireCd = 1e9; S.hero.hp = 1e6;
      V.Sim.step(S, inp ? inp(f) : { mx:0, my:0 });
      S.events.forEach(function(v){
        if (v.k === 'hurt') R.hurts.push({ dmg:v.dmg, src:v.src, t:S.t });
        if (v.k === 'block' && v.src === 'E-08') R.blocks.push({ x:v.x, y:v.y, t:S.t });
        if (v.k === 'snipe') R.snipes.push(Object.assign({ t:S.t }, v));
        if (v.k === 'tell' && v.type === 'E-08') { if (v.lock) { if (cur) cur.lock = S.t; } else { cur = { start:S.t, angs:[] }; R.tells.push(cur); } }
      });
      if (e.st === 'tell' && cur) cur.angs.push({ t:S.t, a:e.aimAng, locked:e.locked, lock01:e.lock01, y2:e.aimY2, blocked:e.aimBlocked });
      if (prev === 'tell' && e.st !== 'tell' && cur) cur.end = S.t;
      prev = e.st;
      [e.aimAng, e.tell01, e.lock01, e.cd, e.aimX2, e.aimY2].forEach(function(x){ if (typeof x === 'number' && !isFinite(x)) R.nan++; });
      R.hs.push([S.frame, S.hero.x.toFixed(4), S.hero.y.toFixed(4), S.shots.length, e.st, (e.tell01 || 0).toFixed(3), (e.aimAng || 0).toFixed(4), (+e.cd || 0).toFixed(4)].join(','));
    }
    R.hash = fnv(R.hs.join('|')); return R;
  }
  var D1 = { ENEMY_DMG_MULT:1 }, done = function(t){ return t.end; };
  var r = run(5, [], [4.5, 12.5], 720, null, null, D1), hits = r.hurts.filter(function(h){ return h.src === 'E-08'; });
  ok('E-08 spawn: static, row hit 110, tell 1.412 base, lockLast 0.471 base', V.AI['E-08'].base.static && V.AI['E-08'].base.dmg === 110 && V.AI['E-08'].base.tell === 1.412 && V.AI['E-08'].base.ai.lockLast === 0.471);
  ok('E-08 tell: >= 2 shots in 12 s on a still Operator', r.snipes.length >= 2, r.snipes.length);
  ok('E-08 tell: 1.2 s effective on every shot', r.tells.filter(done).every(function(t){ return Math.abs(t.end - t.start - 1.2) <= 1e-6; }), r.tells.map(function(t){ return t.end && +(t.end - t.start).toFixed(4); }));
  ok('E-08 tell: lock event 0.4 s before fire', r.tells.filter(done).every(function(t){ return t.lock && Math.abs(t.end - t.lock - 0.4) <= 1e-6; }));
  ok('E-08 damage: hit 110 at base (stage 1, ENEMY_DMG_MULT 1), only after a tell', hits.length >= 2 && hits.every(function(h){ return h.dmg === 110 && r.tells.some(function(t){ return t.start < h.t; }); }), hits.map(function(h){ return h.dmg; }));
  ok('E-08: never moves, no NaN', r.e.x === 4.5 && r.e.y === 2.5 && r.nan === 0);
  function mov(f){ return { mx:Math.cos(f * 0.05), my:Math.sin(f * 0.031) * 0.3 }; }
  var m = run(7, [], [4.5, 11], 720, mov, null, D1), trackOk = m.tells.filter(done).length >= 2, lockOk = true;
  m.tells.filter(done).forEach(function(t){ var pre = t.angs.filter(function(a){ return !a.locked; }), post = t.angs.filter(function(a){ return a.locked; });
    if (!pre.some(function(a){ return Math.abs(a.a - pre[0].a) > 0.02; })) trackOk = false;
    if (post.some(function(a){ return a.a !== post[0].a; }) || pre.some(function(a){ return a.lock01 !== 0; })) lockOk = false; });
  ok('E-08 moving: aim tracks before the lock, frozen during it', trackOk && lockOk);
  ok('E-08 deterministic (still and moving)', run(5, [], [4.5, 12.5], 720, null, null, D1).hash === r.hash && run(7, [], [4.5, 11], 720, mov, null, D1).hash === m.hash, [r.hash, m.hash]);
  var WALL = { x:3, y:7, w:3, h:1, kind:'block' };
  var c = run(9, [], [4.5, 12.5], 720, null, function(S, e){
    if (e.st === 'tell' && e.locked && S.room.solids.indexOf(WALL) < 0) S.room.solids.push(WALL);
    if (e.st !== 'tell' && S.room.solids.indexOf(WALL) >= 0 && S.shots.length === 0) S.room.solids.splice(S.room.solids.indexOf(WALL), 1);
  }, D1);
  ok('E-08 cover at fire time: every shot blocked on the wall, 0 hits', c.snipes.length >= 2 && c.hurts.filter(function(h){ return h.src === 'E-08'; }).length === 0 && c.blocks.length === c.snipes.length && c.blocks.every(function(b){ return b.y > 6.7 && b.y < 8.3; }), [c.snipes.length, c.blocks.length]);
  var hid = run(3, [WALL], [4.5, 12.5], 600, null, null, D1);
  ok('E-08 no line of sight: no tell, no shot', hid.tells.length === 0 && hid.snipes.length === 0);
  (function(){ var S = world(1, 13, [], 4.5, 12.5), a = api.spawnEnemy(S, 'E-08', 4.5, 2.5), el = api.spawnEnemy(S, 'E-08', 2.5, 2.5, true); ok('E-08 elite: HP x1.5', el.elite && Math.abs(el.maxHp - a.maxHp * 1.5) <= 1, [a.maxHp, el.maxHp]); })();
  (function(){ var S = world(2, 13, [], 4.5, 12.5), e = api.spawnEnemy(S, 'E-08', 4.5, 2.5), kills = 0;
    for (var f = 0; f < 60 * 30 && S.enemies.indexOf(e) >= 0; f++) { S.hero.hp = 1e6; V.Sim.step(S, { mx:0, my:0 }); S.events.forEach(function(v){ if (v.k === 'kill' && v.type === 'E-08') kills++; }); }
    ok('E-08 death: the rifle kills it within 30 s at s13', kills === 1 && S.enemies.indexOf(e) < 0, S.t.toFixed(1) + ' s'); })();
});

// =====================================================================================================================================
// Bosses: each in its baked arena (stage 20 / 30 / 40 / 50 of the real list), reached by force-clearing the rooms before it.
var BOSSES = [
  // HP x2.5 over the section 4 table (M 2026-11-12 card 1/2 "Halfway (HP x2.5)")
  { stage:20, type:'B-03',  hp:30312, split:[0.5, 0.25] },
  { stage:30, type:'B-02',  hp:33113, phase2:true },
  { stage:40, type:'B-03V', hp:43272, split:[0.66, 0.33] },
  { stage:50, type:'B-04',  hp:69653, phase2:true }
];
var BOT = null;
(function(){ var saved = process.argv.slice(); process.argv.push('--seek'); try { BOT = require('./bot.js'); } finally { process.argv.length = 0; Array.prototype.push.apply(process.argv, saved); } })();
V.SimOpts.chlen = 0;   // bot.js caps the chapter to 10 for its baselines; these tests need the full list
var LIST = V.Sim.stageList();
function toStage(seed, n){
  var S = V.Sim.create(seed, tune(), { cols:9 }), g = 0;
  while (S.stage < n && g++ < 60000) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, 1); continue; }
    if (S.phase === 'collect' && V.Sim.skipCollect) V.Sim.skipCollect(S);
    if (S.phase === 'play') { S.enemies.length = 0; S.spawnQ.length = 0; }
    V.Sim.step(S, { mx:0, my:0 });
    if (S.phase === 'clear') { S.hero.x = S.room.door.x + 0.5; S.hero.y = 1.3; V.Sim.step(S, { mx:0, my:-1 }); }
  }
  return S;
}
function bossesOf(S){ return S.enemies.filter(function(e){ return e.boss && e.hp > 0; }); }
// fight: kind 'human' (bot.js human bot) | 'still' | 'walk' (intro control probe); god refills hero HP every frame
function fight(seed, B0, opt){
  var S = toStage(seed, B0.stage), B = { rng:new V.Rng(seed * 7919 + 13), hold:0, cmd:{ mx:0, my:0 }, hist:[], side:seed % 2 ? -1 : 1 };
  var R = { S:S, at:S.stage, room:S.roomId, kind:S.stageKind, tells:[], letters:{}, phases:[], hurts:[], firstTell:null, maxBodies:0, barBad:0, maxHp0:null,
    killT:null, won:false, dead:false, hs:[], nan:0, hurtBeforeTell:0, machines:0, x0:S.hero.x, moved:false, splitsAt:[] };
  var frames = (opt.secs || 240) * 60, prevN = 0;
  for (var f = 0; f < frames; f++) {
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'clear' || S.phase === 'results') break;
    if (opt.god) S.hero.hp = S.hero.maxHp;
    var inp = opt.kind === 'human' ? BOT.INPUT.human(S, B) : (opt.kind === 'walk' ? { mx:f < 60 ? 1 : -1, my:0 } : { mx:0, my:0 });
    if (opt.noFire) S.hero.fireCd = 1e9;
    V.Sim.step(S, inp);
    var bs = bossesOf(S), sum = 0; bs.forEach(function(e){ sum += e.hp; ['x', 'y', 'hp', 'tell01'].forEach(function(p){ if (typeof e[p] === 'number' && !isFinite(e[p])) R.nan++; }); });
    if (bs.length > R.maxBodies) R.maxBodies = bs.length;
    if (bs.length > prevN && prevN > 0 && S.boss) R.splitsAt.push(+(sum / (S.boss.maxHp || 1)).toFixed(3));
    prevN = bs.length;
    R.machines = Math.max(R.machines, S.enemies.filter(function(e){ return !e.boss && e.hp > 0; }).length);
    if (S.boss && R.maxHp0 == null) R.maxHp0 = S.boss.maxHp;
    if (S.boss && bs.length && Math.abs(S.boss.hp - sum) > 1) R.barBad++;
    if (opt.kind === 'walk' && S.roomT < 2.4 && Math.abs(S.hero.x - R.x0) > 0.5) R.moved = true;
    for (var j = 0; j < S.events.length; j++) { var v = S.events[j];
      if (v.k === 'tell' && v.type === B0.type) { R.tells.push({ t:S.roomT, a:v.attack, ph:v.phase }); if (v.attack) R.letters[v.attack] = 1; if (R.firstTell == null) R.firstTell = S.roomT; }
      else if (v.k === 'bossphase') R.phases.push(S.roomT);
      else if (v.k === 'hurt') { R.hurts.push({ t:S.roomT, src:v.src, dmg:v.dmg }); if (R.firstTell == null && /^B-0/.test(v.src || '')) R.hurtBeforeTell++; }
      else if (v.k === 'kill' && v.boss && R.killT == null) R.killT = S.roomT;
    }
    if (f % 6 === 0) R.hs.push([S.frame, S.hero.x.toFixed(3), S.hero.y.toFixed(3), bs.map(function(e){ return e.x.toFixed(3) + ':' + e.y.toFixed(3) + ':' + e.hp + ':' + e.st; }).join(';')].join(','));
  }
  R.won = R.killT != null && bossesOf(S).length === 0 && (S.phase === 'clear' || !!(S.result && S.result.win) || !!S.bossWin);
  R.dead = !!(S.result && !S.result.win); R.t = S.roomT; R.hash = fnv(R.hs.join('|'));
  return R;
}
BOSSES.forEach(function(B0){
  section(B0.type, function(){
    var tag = B0.type + ' (s' + B0.stage + '): ', def = LIST[B0.stage - 1];
    ok(tag + 'baked row is a boss room with one ' + B0.type, def && def.kind === 'boss' && def.spawns.length === 1 && def.spawns[0].type === B0.type, def && def.spawns.map(function(p){ return p.type; }));
    if (!def || def.spawns[0].type !== B0.type) return;
    var g = fight(3, B0, { kind:'human', god:true, secs:900 });
    ok(tag + 'reached the boss stage in its arena', g.at === B0.stage && g.kind === 'boss' && g.room === def.room, [g.at, g.room]);
    ok(tag + 'spawn: boss bar max HP on the table target ' + B0.hp + ' (+-1%)', g.maxHp0 != null && Math.abs(g.maxHp0 - B0.hp) / B0.hp <= 0.01, g.maxHp0);
    ok(tag + 'boss room holds no machines', g.machines === 0, g.machines);
    ok(tag + 'intro: first tell >= 2.5 s after the room opens', g.firstTell != null && g.firstTell >= 2.5 - STEP, g.firstTell);
    ok(tag + 'tell before damage: no boss damage before the first tell', g.hurtBeforeTell === 0);
    ok(tag + 'both attacks A and B tell (with their letter)', g.letters.A && g.letters.B, Object.keys(g.letters).join(''));
    if (B0.phase2) ok(tag + 'phase 2 reached (bossphase event)', g.phases.length >= 1, g.phases.length);
    if (B0.split) {
      ok(tag + 'splits: up to 4 bodies, all boss bodies on one bar (bar HP = summed HP every frame)', g.maxBodies >= 3 && g.maxBodies <= 4 && g.barBad === 0, [g.maxBodies, g.barBad]);
      ok(tag + 'splits land on the thresholds ' + B0.split.join('/') + ' of the bar', g.splitsAt.length >= 2 && Math.abs(g.splitsAt[0] - B0.split[0]) <= 0.02 && g.splitsAt.some(function(x){ return Math.abs(x - B0.split[1]) <= 0.02; }), g.splitsAt.join(' '));
    }
    ok(tag + 'death: the human bot (HP refilled) kills every body and the room clears', g.won, g.killT != null ? 'kill at ' + g.killT.toFixed(1) + ' s' : 'no kill in ' + g.t.toFixed(0) + ' s');
    ok(tag + 'no NaN in boss state', g.nan === 0);
    info(tag + 'god-mode human kill ' + (g.killT != null ? g.killT.toFixed(1) + ' s' : '-') + ', tells ' + g.tells.length + ' (' + g.tells.map(function(t){ return t.a; }).join('') + '), hurts ' + g.hurts.length + ', dmg ' + g.hurts.reduce(function(s, h){ return s + h.dmg; }, 0) + (B0.split ? ', bodies ' + g.maxBodies + ', splits at ' + g.splitsAt.join('/') : ''));
    var g2 = fight(3, B0, { kind:'human', god:true, secs:60 }), g3 = fight(3, B0, { kind:'human', god:true, secs:60 });
    ok(tag + 'deterministic: same seed, same 60 s fight', g2.hash === g3.hash && g2.tells.length === g3.tells.length, g2.hash);
    var w = fight(4, B0, { kind:'walk', god:true, secs:3, noFire:true });
    ok(tag + 'hero keeps control in the intro', w.moved);
    var ims = (function(){ var S = toStage(5, B0.stage), out = []; for (var i = 0; i < 60; i++) V.Sim.step(S, { mx:0, my:0 }); var e = bossesOf(S)[0]; return e && e.immune && e.immune.instakill && e.immune.freeze && (e.knockback === 0 || e.immune.knockback); })();
    ok(tag + 'immune to instakill and freeze, no knockback', !!ims);
    // real HP: data, not a gate
    var ns = QUICK ? 3 : 8, wins = 0, deaths = 0, times = [];
    for (var sd = 1; sd <= ns; sd++) { var q = fight(100 + sd, B0, { kind:'human', god:false, secs:300 }); if (q.won) { wins++; times.push(q.killT); } else if (q.dead) deaths++; }
    info(tag + 'real-HP human bot after a force-clear jump (pick 0 cards): ' + wins + '/' + ns + ' kills, ' + deaths + ' deaths' + (times.length ? ', kill s ' + times.map(function(t){ return t.toFixed(0); }).join(' ') : ''));
  });
});

console.log((fails ? 'FAILS ' + fails : 'ALL PASS') + ' (' + n + ' checks' + (skips ? ', ' + skips + ' sections skipped' : '') + ')');
process.exit(fails ? 1 : 0);
