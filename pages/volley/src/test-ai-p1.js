// Headless checks for parts/ai-p1.js (E-04, E-05) and parts/boss.js (B-01).
// node src/test-ai-p1.js          -> uses the real sim (V.Sim.api) when the P1 seams exist, else a small mock world
// node src/test-ai-p1.js --mock   -> force the mock world
'use strict';
var path = require('path'), P = function(f){ return path.join(__dirname, 'parts', f); };
['tune.js', 'rng.js', 'rooms.js', 'stages.js', 'mods.js', 'sim.js', 'ai-p0.js'].forEach(function(f){ try { require(P(f)); } catch (err) { if (!/Cannot find module/.test(err.message)) throw err; } });
require(P('ai-p1.js')); require(P('boss.js'));
var V = globalThis.V;
var REAL = !!(V.Sim && V.Sim.api) && process.argv.indexOf('--mock') < 0;
var STEP = 1 / 60;
var rows = [], fails = 0;
function ok(name, cond, info){ rows.push((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  [' + info + ']' : '')); if (!cond) fails++; }

// ---------------- mock world (used only when the sim seams are missing) ----------------
function mockWorld(seed, solids){
  var tune = Object.assign({}, V.TUNE_DEFAULTS || {}, { ENEMY_HP_GLOBAL:0.72, HP_SLOPE:0.036, DMG_SLOPE:0.012, ENEMY_DMG_MULT:1, ENEMY_SHOT_SPEED_MULT:1, TELL_MULT:1, INVULN:0.6 });
  var S = { seed:seed, frame:0, t:0, tune:tune, stage:1, phase:'play', room:{ w:9, h:15, solids:solids || [], door:{ x:4, y:0, w:1, h:1, open:false } },
    hero:{ x:4.5, y:12.5, r:0.28, hp:1e6, maxHp:1e6, invulnT:0 }, enemies:[], shots:[], shells:[], events:[], boss:null,
    rng:new V.Rng(seed), _id:0, hits:[] };
  return S;
}
function segRect(x1, y1, x2, y2, b, pad){
  var minx = b.x - pad, maxx = b.x + b.w + pad, miny = b.y - pad, maxy = b.y + b.h + pad, dx = x2 - x1, dy = y2 - y1, t0 = 0, t1 = 1;
  var Pp = [-dx, dx, -dy, dy], Q = [x1 - minx, maxx - x1, y1 - miny, maxy - y1];
  for (var i = 0; i < 4; i++) { var p = Pp[i], q = Q[i];
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; } else { var r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } }
  return true;
}
function circleRect(cx, cy, r, b){ var nx = Math.max(b.x, Math.min(cx, b.x + b.w)), ny = Math.max(b.y, Math.min(cy, b.y + b.h)); return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r; }
var mockApi = {
  ev:function(S, o){ S.events.push(o); return o; },
  rng:function(S){ return S.rng; },
  enemyDmg:function(S, b){ return Math.max(1, Math.floor(b * S.tune.ENEMY_DMG_MULT * (1 + S.tune.DMG_SLOPE * (S.stage - 1)))); },
  steerTo:function(S, e, tx, ty, sp, dt){ var dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy); if (d < 1e-6) return; e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; e.ang = Math.atan2(dy, dx); },
  enemyShoot:function(S, e, ang, sp, dmg, o){ S.shots.push({ x:e.x + Math.cos(ang) * e.r, y:e.y + Math.sin(ang) * e.r, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp, r:0.15, dmg:dmg, src:e.type, bounces:(o && o.bounces) || 0, born:S.t }); },
  lob:function(S, e, tx, ty, T, r, dmg){ S.shells.push({ x:e.x, y:e.y, tx:tx, ty:ty, t:0, T:T, r:r, dmg:dmg, src:e.type, born:S.t }); },
  hurtHero:function(S, dmg, src, x, y){ var h = S.hero; if (h.invulnT > 0) return false; h.hp -= dmg; h.invulnT = S.tune.INVULN; S.hits.push({ src:src, dmg:dmg, t:S.t }); return true; },
  clearLine:function(S, x1, y1, x2, y2, pad){ for (var i = 0; i < S.room.solids.length; i++) if (segRect(x1, y1, x2, y2, S.room.solids[i], pad)) return false; return true; },
  hitsSolid:function(S, x, y, r){ for (var i = 0; i < S.room.solids.length; i++) if (circleRect(x, y, r, S.room.solids[i])) return true; return false; },
  collideBody:function(S, o, r){ o.x = Math.max(r, Math.min(S.room.w - r, o.x)); o.y = Math.max(r, Math.min(S.room.h - r, o.y)); },
  hero:function(S){ return S.hero; }, dist:function(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }, angleTo:function(a, b){ return Math.atan2(b.y - a.y, b.x - a.x); },
  tellT:function(S, b){ return b * (S.tune.TELL_MULT > 0 ? S.tune.TELL_MULT : 1); },
  spawnEnemy:function(S, type, x, y){
    var A = V.AI[type], b = A.base, hp = Math.round(b.hp * S.tune.ENEMY_HP_GLOBAL);
    var e = { id:++S._id, type:type, x:x, y:y, r:b.r, hp:hp, maxHp:hp, ang:Math.PI / 2, st:'move', tell01:0, aimAng:Math.PI / 2, flashT:0, size:b.size, cd:0, boss:!!b.boss };
    S.enemies.push(e); A.init(S, e, mockApi); if (e.afterSpawn) e.st = e.afterSpawn; return e;
  }
};
function mockStep(S, inp){
  var dt = STEP, h = S.hero; S.events.length = 0; S.frame++; S.t += dt;
  if (h.invulnT > 0) h.invulnT -= dt;
  if (inp && (inp.mx || inp.my)) { var l = Math.hypot(inp.mx, inp.my); h.x += inp.mx / l * 4.5 * dt; h.y += inp.my / l * 4.5 * dt; mockApi.collideBody(S, h, 0.35); }
  for (var i = 0; i < S.enemies.length; i++) V.AI[S.enemies[i].type].step(S, S.enemies[i], dt, mockApi);
  var out = [];
  for (i = 0; i < S.shots.length; i++) { var s = S.shots[i]; s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.bounces > 0) { if (s.x < s.r || s.x > S.room.w - s.r) { s.vx = -s.vx; s.bounces--; s.x = Math.max(s.r, Math.min(S.room.w - s.r, s.x)); } else if (s.y < s.r || s.y > S.room.h - s.r) { s.vy = -s.vy; s.bounces--; s.y = Math.max(s.r, Math.min(S.room.h - s.r, s.y)); } }
    if (s.x < -s.r || s.x > S.room.w + s.r || s.y < -s.r || s.y > S.room.h + s.r || mockApi.hitsSolid(S, s.x, s.y, s.r)) { S.events.push({ k:'shotdie', x:s.x, y:s.y }); continue; }
    if (Math.hypot(h.x - s.x, h.y - s.y) < s.r + h.r) { mockApi.hurtHero(S, s.dmg, s.src); continue; }
    out.push(s); }
  S.shots = out; out = [];
  for (i = 0; i < S.shells.length; i++) { var sh = S.shells[i]; sh.t += dt;
    if (sh.t >= sh.T) { S.events.push({ k:'shell', x:sh.tx, y:sh.ty, t:S.t, born:sh.born, T:sh.T }); if (Math.hypot(h.x - sh.tx, h.y - sh.ty) < sh.r + h.r) mockApi.hurtHero(S, sh.dmg, sh.src); continue; }
    out.push(sh); }
  S.shells = out;
}

// ---------------- world adapter ----------------
var api = REAL ? V.Sim.api : mockApi;
function makeWorld(seed, solids, heroXY){
  var S;
  if (REAL) {
    S = V.Sim.create(seed, Object.assign({}, V.TUNE_DEFAULTS));
    S.enemies.length = 0; S.shots.length = 0; if (S.shells) S.shells.length = 0;
    S.room.solids = (solids || []).slice(); S.phase = 'play'; if (S.spawnQ) S.spawnQ.length = 0; if (S.pending) S.pending.length = 0;
    S.hero.hp = S.hero.maxHp = 1e6;
  } else S = mockWorld(seed, solids);
  if (heroXY) { S.hero.x = heroXY[0]; S.hero.y = heroXY[1]; }
  S._hits = [];
  return S;
}
function stepWorld(S, inp){
  if (REAL) {
    S.hero.fireCd = 1e9; S.hero.hp = 1e6; V.Sim.step(S, inp); if (S.phase !== 'play') S._phaseLeft = S.phase;
    for (var i = 0; i < S.events.length; i++) if (S.events[i].k === 'hurt') S._hits.push({ src:S.events[i].src, dmg:S.events[i].dmg, t:S.t, x:S.hero.x, y:S.hero.y });
  } else { var n0 = S.hits.length; mockStep(S, inp); for (var j = n0; j < S.hits.length; j++) S._hits.push(S.hits[j]); }
}
function spawn(S, type, x, y){ var e = api.spawnEnemy(S, type, x, y); if (REAL && e) { e.st = e.afterSpawn || 'move'; e.stT = 0; } return e; }
function finite(S){
  var bad = 0, i, e;
  function c(v){ if (typeof v === 'number' && !isFinite(v)) bad++; }
  c(S.hero.x); c(S.hero.y);
  for (i = 0; i < S.enemies.length; i++) { e = S.enemies[i]; c(e.x); c(e.y); c(e.ang); c(e.aimAng); c(e.tell01); c(e.cd); }
  for (i = 0; i < S.shots.length; i++) { c(S.shots[i].x); c(S.shots[i].y); }
  for (i = 0; i < (S.shells || []).length; i++) { c(S.shells[i].tx); c(S.shells[i].ty); }
  return bad;
}
function fnv(str){ var h = 2166136261 >>> 0; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
function snap(S){ var a = [S.frame, S.hero.x.toFixed(4), S.hero.y.toFixed(4), S.shots.length, (S.shells || []).length];
  S.enemies.forEach(function(e){ a.push(e.id, e.x.toFixed(4), e.y.toFixed(4), e.st, e.hp, (e.tell01 || 0).toFixed(3)); }); return a.join(','); }
// moving hero: figure-of-eight walk in the lower half
function moving(f){ return { mx:Math.cos(f * 0.021), my:Math.sin(f * 0.034) }; }
var STILL = { mx:0, my:0 };
var PILLAR = { x:3, y:7, w:3, h:1, kind:'block' }; // cover between the enemy row and the hero

// ---------------- E-04 ----------------
function runE04(seed, mover){
  var S = makeWorld(seed, [PILLAR], [4.5, 12.5]); var e = spawn(S, 'E-04', 4.5, 3.5);
  var lobs = [], lands = [], nan = 0, hs = [];
  for (var f = 0; f < 600; f++) {
    var before = (S.shells || []).slice();
    stepWorld(S, mover ? moving(f) : STILL);
    (S.shells || []).forEach(function(s){ if (before.indexOf(s) < 0) lobs.push({ s:s, tx:s.tx, ty:s.ty, T:s.T, t0:S.t, hx:S.hero.x, hy:S.hero.y }); });
    before.forEach(function(s){ if ((S.shells || []).indexOf(s) < 0) lands.push({ s:s, t:S.t }); });
    nan += finite(S); hs.push(snap(S));
  }
  return { S:S, e:e, lobs:lobs, lands:lands, nan:nan, hash:fnv(hs.join('|')) };
}
[false, true].forEach(function(mv){
  var r = runE04(11, mv), tag = 'E-04 ' + (mv ? 'moving' : 'still') + ': ';
  ok(tag + 'lobs at least 2 shells in 10 s', r.lobs.length >= 2, r.lobs.length + ' lobs');
  var targetOk = r.lobs.every(function(l){ return Math.hypot(l.tx - l.hx, l.ty - l.hy) < 0.35; });
  ok(tag + 'target = Operator position at fire time', targetOk);
  var fixed = r.lobs.every(function(l){ return l.s.tx === l.tx && l.s.ty === l.ty; });
  ok(tag + 'landing ring never moves', fixed);
  var flight = r.lands.length > 0 && r.lands.every(function(L){ var lo = r.lobs.filter(function(l){ return l.s === L.s; })[0]; return lo && Math.abs(L.t - lo.t0 - lo.T) <= STEP * 1.5 && Math.abs(lo.T - 1.0) < 0.005; });
  ok(tag + 'lands after 1.0 s EFFECTIVE flight (R31: base 1.176 x TELL_MULT 0.85)', flight, r.lands.length + ' landed');
  ok(tag + 'ring radius 1.0', r.lobs.every(function(l){ return l.s.r === 1.0; }));
  if (!mv) ok(tag + 'shell hits a still Operator behind cover (ignores cover)', r.S._hits.some(function(h){ return h.src === 'E-04'; }), r.S._hits.length + ' hits');
  if (!mv) ok(tag + 'line to Operator really is blocked by cover', !api.clearLine(r.S, 4.5, 3.5, 4.5, 12.5, 0.15));
  ok(tag + 'no NaN', r.nan === 0);
  ok(tag + 'deterministic', runE04(11, mv).hash === r.hash, r.hash);
});

// ---------------- E-05 ----------------
function runE05(seed, mover, heroXY, solids){
  var S = makeWorld(seed, solids || [], heroXY || [4.5, 11]); var e = spawn(S, 'E-05', 4.5, 4.5);
  var nan = 0, hs = [], prev = e.st, tellStart = null, lockAt = null, dashes = [], stuns = [], laneOk = true, cur = null;
  for (var f = 0; f < 600; f++) {
    stepWorld(S, mover ? moving(f) : STILL);
    if (e.st === 'tell' && prev !== 'tell') { tellStart = S.t; lockAt = null; cur = { tell:S.t }; }
    if (e.st === 'tell' && e.locked && lockAt == null) { lockAt = S.t; cur.lock = S.t; cur.ang = e.aimAng; }
    if (e.st === 'tell' && e.locked && cur && Math.abs(e.aimAng - cur.ang) > 1e-9) laneOk = false; // lane stays locked
    if (e.st === 'act' && prev === 'tell') { cur.dash = S.t; cur.dashAng = Math.atan2(e.vy, e.vx); cur.x0 = e.x; cur.y0 = e.y; dashes.push(cur); }
    if (e.st === 'stun' && prev !== 'stun') stuns.push({ t:S.t, x:e.x, y:e.y });
    if (e.st !== 'stun' && prev === 'stun') stuns[stuns.length - 1].end = S.t;
    if (cur && e.st !== 'act' && prev === 'act') { cur.endX = e.x; cur.endY = e.y; }
    if (!isFinite(e.lane)) nan++;
    prev = e.st; nan += finite(S); hs.push(snap(S));
  }
  return { S:S, e:e, dashes:dashes, stuns:stuns, laneOk:laneOk, nan:nan, hash:fnv(hs.join('|')) };
}
[false, true].forEach(function(mv){
  var r = runE05(5, mv), tag = 'E-05 ' + (mv ? 'moving' : 'still') + ': ';
  ok(tag + 'dashes at least twice', r.dashes.length >= 2, r.dashes.length + ' dashes');
  var lk = r.dashes.every(function(d){ return d.lock != null && Math.abs((d.dash - d.lock) - 0.2) <= STEP * 1.5 + 0.005 && Math.abs((d.dash - d.tell) - 0.8) <= STEP * 1.5 + 0.005; });
  ok(tag + 'effective tell 0.8 s (R31), lane locks 0.2 s before dash', lk, r.dashes.map(function(d){ return (d.dash - d.tell).toFixed(3) + '/' + (d.dash - (d.lock || 0)).toFixed(3); }).join(' '));
  ok(tag + 'locked lane does not turn', r.laneOk && r.dashes.every(function(d){ return Math.abs(d.dashAng - d.ang) < 1e-9; }));
  ok(tag + 'dash <= 8 units', r.dashes.every(function(d){ return d.endX == null || Math.hypot(d.endX - d.x0, d.endY - d.y0) <= 8.01; }));
  ok(tag + 'no NaN', r.nan === 0);
  ok(tag + 'deterministic', runE05(5, mv).hash === r.hash, r.hash);
  if (!mv) ok(tag + 'dash hits a still Operator for 130 x ENEMY_DMG_MULT x stage-1 slope', r.S._hits.some(function(h){ return h.src === 'E-05' && h.dmg === Math.floor(130 * V.TUNE_DEFAULTS.ENEMY_DMG_MULT); }), r.S._hits.map(function(h){ return h.dmg; }).join(','));
});
// wall stop + stun: Operator against the south wall, charger 6 units north; dash runs into the wall
(function(){
  var r = runE05(7, false, [4.5, 14.6]);
  ok('E-05 wall: stops at the wall and is stunned', r.stuns.length >= 1, r.stuns.length + ' stuns');
  ok('E-05 wall: stun lasts 1.0 s', r.stuns.filter(function(s){ return s.end; }).every(function(s){ return Math.abs(s.end - s.t - 1.0) <= STEP * 1.5; }) && r.stuns.some(function(s){ return s.end; }),
    r.stuns.map(function(s){ return s.end ? (s.end - s.t).toFixed(3) : '-'; }).join(' '));
  ok('E-05 wall: body inside the room at stun', r.stuns.every(function(s){ return s.y <= 15 - 0.5 + 1e-6 && s.x >= 0.5 - 1e-6 && s.x <= 8.5 + 1e-6; }));
  // cover in the lane stops the dash too
  var r2 = runE05(7, false, [4.5, 10.2], [{ x:3, y:8.2, w:3, h:1, kind:'block' }]);
  ok('E-05 cover: no dash through cover (no clear line, waits)', r2.dashes.length === 0 || r2.stuns.length >= 1, r2.dashes.length + ' dashes ' + r2.stuns.length + ' stuns');
})();

// ---------------- B-01 ----------------
function runBoss(seed, mover, frames, dmgAt){
  var S = makeWorld(seed, [], [4.5, 12.5]); S.stage = 10;
  var e = spawn(S, 'B-01', 4.5, 3.5);
  var nan = 0, hs = [], prevAtk = null, seq = [], phase2At = null, linesA = [], tellsC = [];
  for (var f = 0; f < frames; f++) {
    if (dmgAt && f === dmgAt) { e.hp = Math.floor(e.maxHp * 0.49); }
    stepWorld(S, mover ? moving(f) : STILL);
    if (e.st === 'tell' && e.attack !== prevAtk) { seq.push(e.attack + e.phase);
      if (e.attack === 'A') linesA.push({ phase:e.phase, lines:e.lines.map(function(l){ return Object.assign({}, l); }), hx:S.hero.x, hy:S.hero.y });
      if (e.attack === 'C') tellsC.push({ segs:e.segs.slice(), path:e.bouncePath }); }
    prevAtk = e.st === 'tell' ? e.attack : (e.st === 'cool' ? null : prevAtk);
    if (e.phase === 2 && phase2At == null) phase2At = f;
    nan += finite(S); hs.push(snap(S) + ',' + (S.boss ? S.boss.attack + S.boss.phase : '-'));
  }
  return { S:S, e:e, seq:seq, phase2At:phase2At, linesA:linesA, tellsC:tellsC, nan:nan, hash:fnv(hs.join('|')) };
}
// widest gap between adjacent A lines, measured at distance d from the tower (perpendicular lane width minus round size)
function laneWidths(lines, cx, cy, d){
  var a = lines.map(function(l){ return l.ang; }).sort(function(p, q){ return p - q; }), w = [];
  for (var i = 0; i + 1 < a.length; i++) w.push(2 * d * Math.sin((a[i + 1] - a[i]) / 2) - 0.3);
  return w;
}
[false, true].forEach(function(mv){
  var r = runBoss(3, mv, 2600, 1300), tag = 'B-01 ' + (mv ? 'moving' : 'still') + ': ';
  ok(tag + 'boss flags (boss, static, immune instakill/freeze)', r.e.boss === true && r.e.static === true && r.e.immune.instakill && r.e.immune.freeze);
  ok(tag + 'S.boss name/phase/attack', r.S.boss && r.S.boss.name === 'Volley Tower' && r.S.boss.type === 'B-01' && 'phase' in r.S.boss && 'attack' in r.S.boss && 'tell01' in r.S.boss);
  ok(tag + 'HP 11000 x ENEMY_HP_GLOBAL x stage scale', r.e.maxHp === Math.round(11000 * V.TUNE_DEFAULTS.ENEMY_HP_GLOBAL * (1 + 0.036 * 9)) || (!REAL && r.e.maxHp === Math.round(11000 * V.TUNE_DEFAULTS.ENEMY_HP_GLOBAL)), 'maxHp ' + r.e.maxHp);
  var cyc = r.seq.map(function(s){ return s[0]; }).join('');
  ok(tag + 'cycles A B C', /^(ABC)+A?B?$/.test(cyc) && cyc.length >= 6, r.seq.join(' '));
  ok(tag + 'phase 2 at 50% HP', r.phase2At != null && r.phase2At >= 1300 && r.phase2At <= 1301 && r.S.boss.phase === 2);
  var p1 = r.linesA.filter(function(a){ return a.phase === 1; }), p2 = r.linesA.filter(function(a){ return a.phase === 2; });
  ok(tag + 'A phase 1: 5 lines, lanes >= 2.0 at the Operator distance', p1.length > 0 && p1.every(function(a){ var d = Math.hypot(a.hx - 4.5, a.hy - 3.5) - 0.5;
    return a.lines.length === 5 && Math.min.apply(null, laneWidths(a.lines, 4.5, 3.5, d)) >= 2.0; }), p1.map(function(a){ return laneWidths(a.lines, 4.5, 3.5, Math.hypot(a.hx - 4.5, a.hy - 3.5) - 0.5).map(function(x){ return x.toFixed(1); }).join('/'); }).join(' '));
  ok(tag + 'A phase 2: 7 lines, centre lane open and >= 2.0 wide 3 units out', p2.length > 0 && p2.every(function(a){
    var down = Math.atan2(15 - 3.5, 0), angs = a.lines.map(function(l){ return l.ang - down; });
    var lo = Math.max.apply(null, angs.filter(function(x){ return x < 0; })), hi = Math.min.apply(null, angs.filter(function(x){ return x > 0; }));
    return a.lines.length === 7 && 2 * 3 * Math.sin((hi - lo) / 2) - 0.3 >= 2.0; }), p2.length + ' casts');
  ok(tag + 'A lines carry x1,y1,x2,y2,ang', r.linesA.every(function(a){ return a.lines.every(function(l){ return isFinite(l.x1 + l.y1 + l.x2 + l.y2 + l.ang); }); }));
  ok(tag + 'C first segment + bounce path drawn', r.tellsC.length > 0 && r.tellsC.every(function(c){ return c.segs.length === 1 && c.path && c.path.length === 3; }));
  ok(tag + 'tower never moves', Math.abs(r.e.x - 4.5) < 1e-9 && Math.abs(r.e.y - 3.5) < 1e-9);
  ok(tag + 'no NaN', r.nan === 0);
  ok(tag + 'deterministic', runBoss(3, mv, 2600, 1300).hash === r.hash, r.hash);
});
// B-01 shot counts: A 5x6, B 24 (phase 1) and 7x6, 32 (phase 2)
(function(){
  [1, 2].forEach(function(ph){
    var S = makeWorld(9, [], [4.5, 12.5]), e = spawn(S, 'B-01', 4.5, 3.5);
    if (ph === 2) e.hp = Math.floor(e.maxHp * 0.4);
    var counts = {}, cur = null, seen = {};
    for (var f = 0; f < 900; f++) {
      var n0 = S.shots.length, ids = new Set(S.shots); stepWorld(S, STILL);
      if (e.st === 'tell' && cur !== e.attack) { cur = e.attack; seen[cur] = (seen[cur] || 0) + 1; }
      var added = S.shots.filter(function(s){ return !ids.has(s); }).length;
      if (added && cur && seen[cur] === 1) counts[cur] = (counts[cur] || 0) + added;
    }
    var expA = ph === 1 ? 30 : 42, expB = ph === 1 ? 24 : 32;
    ok('B-01 phase ' + ph + ': A fires ' + expA + ', B ' + expB + ', C 3+5', counts.A === expA && counts.B === expB && counts.C === 8, JSON.stringify(counts));
  });
})();


// B-01 in BA1's pillar layout: no NaN, lines/paths stop at cover, still cycles
(function(){
  var BA1 = [{ x:1, y:5, w:1, h:1 }, { x:7, y:5, w:1, h:1 }, { x:1, y:9, w:1, h:1 }, { x:7, y:9, w:1, h:1 }];
  var S = makeWorld(21, BA1, [4.5, 12.5]); S.stage = 10; var e = spawn(S, 'B-01', 4.5, 3.5), nan = 0, seq = '', prev = null, endsOk = true;
  for (var f = 0; f < 1500; f++) {
    if (f === 700) e.hp = Math.floor(e.maxHp * 0.45);
    stepWorld(S, moving(f));
    if (e.st === 'tell' && e.attack !== prev) { seq += e.attack;
      (e.lines || []).forEach(function(l){ if (api.hitsSolid(S, (l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2, 0.05) || api.hitsSolid(S, l.x2, l.y2, 0.1)) endsOk = false; }); }
    prev = e.st === 'tell' ? e.attack : (e.st === 'cool' ? null : prev);
    nan += finite(S);
  }
  ok('B-01 BA1 cover: cycles, floor lines end at cover (not through it), no NaN', /^(ABC)+/.test(seq) && seq.length >= 5 && endsOk && nan === 0, seq);
})();

// full real flow: stages 1..10 (enemies killed by the test), E-04/E-05 appear in their stages, boss in BA1, phase 2, kill -> results win
if (REAL) (function(){
  var S = V.Sim.create(77, Object.assign({}, V.TUNE_DEFAULTS)), seen = {}, nan = 0, bossFrames = 0, phase2 = false, atk = '';
  for (var f = 0; f < 60 * 60 * 6 && S.phase !== 'results'; f++) {
    S.hero.hp = 1e6;
    var inp = STILL;
    if (S.phase === 'pick') { V.Sim.pick(S, 0); continue; }
    if (S.phase === 'supply') { V.Sim.pickSupply(S, 0); continue; }
    if (S.phase === 'clear') { var d = S.room.door; S.hero.x = d.x + 0.5; if (S.hero.y > d.y + 1.6) S.hero.y = d.y + 1.6; inp = { mx:0, my:-1 }; } // test shortcut to the door
    S.enemies.forEach(function(e){ seen[e.type] = true;
      if (!e.boss && e.st !== 'spawn' && S.roomT > 4) api.damageEnemy(S, e, 1e7); });
    var b = S.enemies.filter(function(e){ return e.boss; })[0];
    if (b) { bossFrames++;
      if (bossFrames === 900) api.damageEnemy(S, b, Math.ceil(b.hp - b.maxHp * 0.48));
      if (bossFrames === 1800) api.damageEnemy(S, b, 1e9); }
    V.Sim.step(S, inp);
    if (S.boss && S.boss.phase === 2) phase2 = true;
    if (S.boss && S.boss.attack && atk.slice(-1) !== S.boss.attack) atk += S.boss.attack;
    nan += finite(S);
  }
  ok('full flow: E-04, E-05, B-01 spawn from V.STAGES', seen['E-04'] && seen['E-05'] && seen['B-01'], Object.keys(seen).join(','));
  ok('full flow: boss attacks via S.boss, phase 2 reached, kill -> results win', phase2 && /ABC/.test(atk) && S.phase === 'results' && S.result && S.result.win, 'attacks ' + atk + ' phase ' + S.phase + ' stage ' + S.stage);
  ok('full flow: no NaN', nan === 0);
})();

var out = 'test-ai-p1 ' + new Date().toISOString().slice(0, 10) + ' mode=' + (REAL ? 'real sim (V.Sim.api)' : 'mock world') + '\n' + rows.join('\n') + '\n' + (fails ? fails + ' FAIL' : 'ALL PASS') + '\n';
process.stdout.write(out);
process.exit(fails ? 1 : 0);
