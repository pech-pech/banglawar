(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Pure deterministic sim. Fixed step 1/60 s x TIME_SCALE. No DOM, no unseeded randomness, no wall clock.

var STEP = 1 / 60;
var HERO_WALL_R = 0.35, HERO_HURT_R = 0.28;
var LEVEL_COST = [0, 0, 25, 35, 50, 65, 90, 125, 175, 245, 335, 465]; // index = level reached
var LEVEL_CAP = 11;
var SHOT_R = 0.15;
var HERO_GAP = 0.1; // min gap between an enemy body and the Operator hurtbox
var RETARGET_DT = 0.1, LOCK_HYST = 1.0, LOST_LINE_T = 0.25;
var CONTACT_CD = 1.0, MAGNET_SPEED = 14;
var REPAIR_PCT = 0.2, REPAIR_BASE = 0.03, REPAIR_PITY = 0.005, REPAIR_CAP = 0.08, REPAIR_LIFE = 15;
var MULTI_GAP = 0.12;
var DIAG_ANG = [35, 55, 75];
var RICO_MAX = 3, RICO_MULT = 0.7, RICO_RANGE = 4;

// D1 4 base stats (ch1 stage 1)
var EN = {
  'E-01': { hp:300, contact:60, atk:60, speed:2.4, r:0.35, size:'small',  xp:4 },
  'E-02': { hp:450, contact:40, atk:60, speed:1.0, r:0.40, size:'medium', xp:8 },
  'E-03': { hp:600, contact:40, atk:45, speed:0,   r:0.50, size:'medium', xp:8 }
};
var E01 = { range:2.5, tell:0.5, lungeSpeed:6.0, lungeDist:3.0, cool:2.0 };
var E02 = { tell:0.6, lockLast:0.2, cool:2.2, shotSpeed:6.0, range:10, prefer:4.5 };
var E03 = { tell:0.7, cool:2.8, shotSpeed:5.0, spread:25 * Math.PI / 180, range:14 };

function cardCount(S, key){ return S.hero.mods[key] || 0; }
function hpScale(S){ var t = S.tune; return t.ENEMY_HP_GLOBAL * (1 + t.HP_SLOPE * (S.stage - 1)); }
function enemyDmg(S, base){
  var t = S.tune;
  return Math.max(1, Math.floor(base * t.ENEMY_DMG_MULT * (1 + t.DMG_SLOPE * (S.stage - 1))));
}
function ev(S, o){ S.events.push(o); return o; }

// ---------- geometry ----------
function circleRectPush(cx, cy, r, b){
  // returns [px,py] push to move the circle out, or null
  var nx = cx < b.x ? b.x : (cx > b.x + b.w ? b.x + b.w : cx);
  var ny = cy < b.y ? b.y : (cy > b.y + b.h ? b.y + b.h : cy);
  var dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) { var d = Math.sqrt(d2), k = (r - d) / d; return [dx * k, dy * k]; }
  // centre inside: push along the smallest axis
  var l = cx - b.x + r, rr = b.x + b.w - cx + r, u = cy - b.y + r, dn = b.y + b.h - cy + r;
  var m = Math.min(l, rr, u, dn);
  if (m === l) return [-l, 0]; if (m === rr) return [rr, 0]; if (m === u) return [0, -u]; return [0, dn];
}
function circleRect(cx, cy, r, b){
  var nx = cx < b.x ? b.x : (cx > b.x + b.w ? b.x + b.w : cx);
  var ny = cy < b.y ? b.y : (cy > b.y + b.h ? b.y + b.h : cy);
  var dx = cx - nx, dy = cy - ny; return dx * dx + dy * dy < r * r;
}
// segment vs AABB expanded by pad (slab test)
function segRect(x1, y1, x2, y2, b, pad){
  var minx = b.x - pad, maxx = b.x + b.w + pad, miny = b.y - pad, maxy = b.y + b.h + pad;
  var dx = x2 - x1, dy = y2 - y1, t0 = 0, t1 = 1, p, q, i, r;
  var P = [-dx, dx, -dy, dy], Q = [x1 - minx, maxx - x1, y1 - miny, maxy - y1];
  for (i = 0; i < 4; i++) {
    p = P[i]; q = Q[i];
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; }
    else { r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  }
  return true;
}
function blockers(S){
  var a = S.room.solids;
  if (!S.room.door.open) return a.concat([S.room.door]);
  return a;
}
function clearLine(S, x1, y1, x2, y2, pad){
  var a = blockers(S);
  for (var i = 0; i < a.length; i++) if (segRect(x1, y1, x2, y2, a[i], pad)) return false;
  return true;
}
function hitsSolid(S, x, y, r){
  var a = blockers(S);
  for (var i = 0; i < a.length; i++) if (circleRect(x, y, r, a[i])) return true;
  return false;
}
function outOfRoom(S, x, y, r){ return x < -r || x > S.room.w + r || y < -r || y > S.room.h + r; }
function collideBody(S, o, r){
  var a = blockers(S), i, p;
  for (var it = 0; it < 2; it++) {
    for (i = 0; i < a.length; i++) { p = circleRectPush(o.x, o.y, r, a[i]); if (p) { o.x += p[0]; o.y += p[1]; } }
  }
  if (o.x < r) o.x = r; if (o.x > S.room.w - r) o.x = S.room.w - r;
  if (o.y < r) o.y = r; if (o.y > S.room.h - r) o.y = S.room.h - r;
}

// ---------- room build ----------
function buildSolids(grid, coverKind){
  var rows = grid.length, cols = grid[0].length, runs = [], y, x, s;
  for (y = 0; y < rows; y++) {
    x = 0;
    while (x < cols) {
      if (grid[y][x] === '#') { s = x; while (x < cols && grid[y][x] === '#') x++; runs.push({ x:s, y:y, w:x - s, h:1, kind: y === 0 ? 'wall' : coverKind }); }
      else x++;
    }
  }
  // merge identical runs vertically
  var out = [];
  for (var i = 0; i < runs.length; i++) {
    var r = runs[i], merged = false;
    for (var j = 0; j < out.length; j++) {
      var o = out[j];
      if (o.x === r.x && o.w === r.w && o.kind === r.kind && o.y + o.h === r.y) { o.h++; merged = true; break; }
    }
    if (!merged) out.push({ x:r.x, y:r.y, w:r.w, h:r.h, kind:r.kind });
  }
  return out;
}
function findChar(grid, ch){
  for (var y = 0; y < grid.length; y++) { var x = grid[y].indexOf(ch); if (x >= 0) return { x:x, y:y }; }
  return null;
}

function spawnEnemy(S, type, x, y){
  var b = EN[type], hp = Math.max(1, Math.round(b.hp * hpScale(S)));
  var e = { id: ++S._nextId, type:type, x:x, y:y, r:b.r, hp:hp, maxHp:hp, ang:Math.PI / 2, st:'spawn',
    tell01:0, aimAng:Math.PI / 2, flashT:0, size:b.size,
    stT:S.tune.SPAWN_T, cd:0, contactCd:0, vx:0, vy:0, strafe: S.rng.next() < 0.5 ? -1 : 1, strafeT:S.rng.range(1.2, 2.4), lungeLeft:0 };
  // first attack delay
  if (type === 'E-02') e.cd = S.rng.range(0.6, 1.4);
  if (type === 'E-03') e.cd = S.rng.range(0.8, 1.6);
  S.enemies.push(e);
  return e;
}

function loadRoom(S, roomId){
  var R = V.ROOMS[roomId], grid = R.grid;
  var d = findChar(grid, 'D'), sp = findChar(grid, 'S');
  S.roomId = roomId;
  S.room = { w:grid[0].length, h:grid.length, solids:buildSolids(grid, R.cover || 'pillar'),
    door:{ x:d.x, y:d.y, w:1, h:1, open:false }, name:R.name };
  S.enemies = []; S.rounds = []; S.shots = []; S.pickups = [];
  var h = S.hero;
  h.x = sp.x + 0.5; h.y = sp.y + 0.5; h.ang = -Math.PI / 2;
  h.lockId = null; h.lockClear = false; h.lostT = 0; h.retargetT = 0; h.burstQ = [];
  S.phase = 'play'; S.roomT = 0; S.clearT = 0;
  for (var i = 0; i < R.spawns.length; i++) spawnEnemy(S, R.spawns[i].type, R.spawns[i].x, R.spawns[i].y);
  S.lap = Math.floor((S.stage - 1) / V.ROOM_ORDER.length) + 1;
  ev(S, { k:'room', x:h.x, y:h.y, roomId:roomId, stage:S.stage });
}

// ---------- create ----------
function create(seed, tune){
  tune = tune || V.TUNE;
  seed = (seed >>> 0);
  var S = { seed:seed, frame:0, t:0, tune:tune, phase:'play', stage:1, roomId:null, lap:1,
    room:null,
    hero:{ x:4.5, y:14.5, r:HERO_HURT_R, hp:tune.HERO_HP, maxHp:tune.HERO_HP, atk:tune.HERO_ATK, ang:-Math.PI / 2,
      moving:false, braced:false, brace01:0, fireCd:0, invulnT:0, lockId:null, lockClear:false,
      level:1, xp:0, xpNext:LEVEL_COST[2], mods:{}, braceT:0, lostT:0, retargetT:0, burstQ:[] },
    enemies:[], rounds:[], shots:[], pickups:[], cards:null, events:[],
    stats:{ kills:0, dmgTaken:0, hitsBy:{ 'E-01':0, 'E-02':0, 'E-03':0 }, roomTimes:[], bracedSteps:0, playSteps:0, shots:0, picks:[],
      roomHp:[], killLog:[] },
    rng:new V.Rng(seed), _nextId:0, pendingLevels:0, pity:0, roomT:0, clearT:0 };
  S.hero.atk = roundDamage(S);
  loadRoom(S, V.ROOM_ORDER[0]);
  S.events.length = 0; // keep the room event for the first step
  ev(S, { k:'room', x:S.hero.x, y:S.hero.y, roomId:S.roomId, stage:S.stage });
  return S;
}

// ---------- hero weapon ----------
function roundDamage(S){
  var t = S.tune, h = S.hero;
  var d = t.HERO_ATK * (1 + 0.3 * cardCount(S, 'atk')) * Math.pow(0.75, cardCount(S, 'front')) * Math.pow(0.9, cardCount(S, 'multi'));
  return Math.max(1, Math.floor(d));
}
function fireInterval(S){
  var t = S.tune;
  var vps = (1 / t.FIRE_INTERVAL) * (1 + 0.25 * cardCount(S, 'rate')) * Math.pow(0.85, cardCount(S, 'multi'));
  return Math.max(t.FIRE_FLOOR, 1 / vps);
}
function spawnRound(S, x, y, ang, base){
  var t = S.tune, crit = S.rng.next() < Math.min(1, t.CRIT_CHANCE);
  S.rounds.push({ x:x, y:y, vx:Math.cos(ang) * t.ROUND_SPEED, vy:Math.sin(ang) * t.ROUND_SPEED, r:t.ROUND_R,
    dmg: crit ? Math.floor(base * t.CRIT_MULT) : base, crit:crit, bounces:0, hit:[] });
  S.stats.shots++;
}
function fireBatch(S){
  var h = S.hero, base = roundDamage(S), a = h.ang, i, nf = 1 + cardCount(S, 'front');
  var px = -Math.sin(a), py = Math.cos(a);
  var mx = h.x + Math.cos(a) * 0.3, my = h.y + Math.sin(a) * 0.3;
  for (i = 0; i < nf; i++) {
    var off = nf === 1 ? 0 : (i - (nf - 1) / 2) * 0.3;
    spawnRound(S, mx + px * off, my + py * off, a, base);
  }
  var nd = Math.min(3, cardCount(S, 'diag'));
  for (i = 0; i < nd; i++) {
    var da = DIAG_ANG[i] * Math.PI / 180;
    spawnRound(S, mx, my, a - da, base); spawnRound(S, mx, my, a + da, base);
  }
  ev(S, { k:'fire', x:mx, y:my, ang:a, n:nf + nd * 2 });
}

function findEnemy(S, id){ for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].id === id) return S.enemies[i]; return null; }
function targetable(e){ return e.st !== 'spawn' && e.hp > 0; }

function updateLock(S, dt){
  var h = S.hero, t = S.tune;
  var cur = h.lockId != null ? findEnemy(S, h.lockId) : null;
  if (cur && !targetable(cur)) cur = null;
  h.retargetT -= dt;
  if (cur && h.retargetT > 0) {
    // between evaluations keep the clear flag fresh only for the current target
    return;
  }
  h.retargetT = RETARGET_DT;
  var best = null, bestD = 1e9, near = null, nearD = 1e9, curD = 1e9, curClear = false;
  for (var i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i]; if (!targetable(e)) continue;
    var d = Math.hypot(e.x - h.x, e.y - h.y);
    var c = clearLine(S, h.x, h.y, e.x, e.y, t.ROUND_R);
    if (d < nearD) { nearD = d; near = e; }
    if (c && d < bestD) { bestD = d; best = e; }
    if (cur && e === cur) { curD = d; curClear = c; }
  }
  var next = cur;
  if (!cur) next = best || near;
  else if (curClear) { h.lostT = 0; if (best && best !== cur && bestD < curD - LOCK_HYST) next = best; }
  else {
    h.lostT += RETARGET_DT;
    if (best && h.lostT > LOST_LINE_T) next = best;
  }
  if (next !== cur) h.lostT = 0;
  var newId = next ? next.id : null;
  if (newId !== h.lockId) {
    if (newId != null) ev(S, { k:'lock', x:next.x, y:next.y, id:newId });
    else if (h.lockId != null) ev(S, { k:'unlock', x:h.x, y:h.y, id:h.lockId });
  }
  h.lockId = newId;
  h.lockClear = next ? (next === cur ? curClear : next === best) : false;
}

// ---------- hero ----------
function stepHero(S, inp, dt){
  var h = S.hero, t = S.tune;
  var mx = inp && +inp.mx || 0, my = inp && +inp.my || 0, len = Math.hypot(mx, my);
  if (h.invulnT > 0) h.invulnT = Math.max(0, h.invulnT - dt);
  if (h.fireCd > 0) h.fireCd = Math.max(0, h.fireCd - dt);
  if (len > 1e-6) {
    mx /= len; my /= len;
    h.x += mx * t.MOVE_SPEED * dt; h.y += my * t.MOVE_SPEED * dt;
    collideBody(S, h, HERO_WALL_R);
    h.ang = Math.atan2(my, mx);
    if (!h.moving && h.lockId != null) ev(S, { k:'unlock', x:h.x, y:h.y, id:h.lockId });
    h.moving = true; h.braced = false; h.braceT = 0; h.brace01 = 0;
    h.lockId = null; h.lockClear = false; h.lostT = 0; h.retargetT = 0; h.burstQ.length = 0;
    return;
  }
  h.moving = false;
  h.braceT += dt;
  h.brace01 = t.BRACE_DELAY > 0 ? Math.min(1, h.braceT / t.BRACE_DELAY) : 1;
  h.braced = h.braceT >= t.BRACE_DELAY - 1e-9;
  if (S.phase !== 'play') { if (h.lockId != null) { h.lockId = null; h.lockClear = false; } return; }
  updateLock(S, dt);
  var tg = h.lockId != null ? findEnemy(S, h.lockId) : null;
  if (tg) h.ang = Math.atan2(tg.y - h.y, tg.x - h.x);
  // queued extra batches (Double Volley)
  for (var i = h.burstQ.length - 1; i >= 0; i--) {
    h.burstQ[i] -= dt;
    if (h.burstQ[i] <= 0) { h.burstQ.splice(i, 1); if (tg) fireBatch(S); }
  }
  if (h.braced && tg && h.lockClear && h.fireCd <= 0) {
    fireBatch(S);
    h.fireCd = fireInterval(S);
    for (var m = 1; m <= cardCount(S, 'multi'); m++) h.burstQ.push(MULTI_GAP * m);
  }
}

function hurtHero(S, dmg, src, x, y){
  var h = S.hero;
  if (h.invulnT > 0 || S.phase === 'dead') return false;
  h.hp -= dmg; S.stats.dmgTaken += dmg;
  S.stats.hitsBy[src] = (S.stats.hitsBy[src] || 0) + 1;
  h.invulnT = S.tune.INVULN;
  ev(S, { k:'hurt', x:h.x, y:h.y, dmg:dmg, src:src });
  if (h.hp <= 0) { h.hp = 0; S.phase = 'dead'; S.cards = null; ev(S, { k:'death', x:h.x, y:h.y, stage:S.stage }); }
  return true;
}

// ---------- enemies ----------
function steerTo(S, e, tx, ty, speed, dt){
  var dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  dx /= d; dy /= d;
  if (!clearLine(S, e.x, e.y, tx, ty, e.r * 0.8)) { // slide round cover
    var sx = -dy * e.strafe, sy = dx * e.strafe;
    dx = dx * 0.35 + sx * 0.94; dy = dy * 0.35 + sy * 0.94;
  }
  e.x += dx * speed * dt; e.y += dy * speed * dt;
  e.ang = Math.atan2(dy, dx);
}
function enemyShoot(S, e, ang, speed, dmg){
  var sp = speed * S.tune.ENEMY_SHOT_SPEED_MULT;
  S.shots.push({ x:e.x + Math.cos(ang) * e.r, y:e.y + Math.sin(ang) * e.r, vx:Math.cos(ang) * sp, vy:Math.sin(ang) * sp,
    r:SHOT_R, dmg:dmg, src:e.type });
}
function stepEnemy(S, e, dt){
  var h = S.hero, t = S.tune, b = EN[e.type];
  if (e.flashT > 0) e.flashT = Math.max(0, e.flashT - dt);
  if (e.contactCd > 0) e.contactCd -= dt;
  if (e.st === 'spawn') { e.stT -= dt; if (e.stT <= 0) { e.st = e.type === 'E-03' ? 'cool' : 'move'; } return; }
  var dx = h.x - e.x, dy = h.y - e.y, dist = Math.hypot(dx, dy), toH = Math.atan2(dy, dx);
  var tellT, los;
  if (e.type === 'E-01') {
    tellT = E01.tell * t.TELL_MULT;
    if (e.st === 'move' || e.st === 'cool') {
      steerTo(S, e, h.x, h.y, b.speed, dt);
      if (e.st === 'cool') { e.cd -= dt; if (e.cd <= 0) e.st = 'move'; }
      else if (dist <= E01.range && clearLine(S, e.x, e.y, h.x, h.y, e.r)) {
        e.st = 'tell'; e.stT = tellT; e.tell01 = 0; e.aimAng = toH;
        ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
      }
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = tellT > 0 ? 1 - Math.max(0, e.stT) / tellT : 1;
      e.aimAng = toH; e.ang = toH;
      if (e.stT <= 0) { e.st = 'act'; e.lungeLeft = E01.lungeDist; e.vx = Math.cos(toH); e.vy = Math.sin(toH); e.tell01 = 0; }
    } else if (e.st === 'act') {
      var step = Math.min(e.lungeLeft, E01.lungeSpeed * dt);
      e.x += e.vx * step; e.y += e.vy * step; e.lungeLeft -= step;
      var ox = e.x, oy = e.y;
      collideBody(S, e, e.r);
      if (e.lungeLeft <= 1e-6 || Math.abs(ox - e.x) + Math.abs(oy - e.y) > 1e-4) { e.st = 'cool'; e.cd = E01.cool; }
    }
  } else if (e.type === 'E-02') {
    tellT = E02.tell * t.TELL_MULT;
    if (e.st === 'move' || e.st === 'cool') {
      // strafe around the Operator, hold a preferred range
      e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = S.rng.range(1.2, 2.6); }
      var ux = dx / (dist || 1), uy = dy / (dist || 1);
      var radial = dist > E02.prefer + 0.8 ? 0.7 : (dist < E02.prefer - 0.8 ? -0.7 : 0);
      var vx = ux * radial - uy * e.strafe, vy = uy * radial + ux * e.strafe, vl = Math.hypot(vx, vy) || 1;
      var px = e.x, py = e.y;
      // no line to the Operator for a while: walk round the cover to find one
      if (!clearLine(S, e.x, e.y, h.x, h.y, SHOT_R)) e.noLosT = (e.noLosT || 0) + dt; else e.noLosT = 0;
      if (e.noLosT > 0.8) { vx = ux * 0.45 - uy * e.strafe * 0.9; vy = uy * 0.45 + ux * e.strafe * 0.9; vl = Math.hypot(vx, vy) || 1; }
      e.x += vx / vl * b.speed * dt; e.y += vy / vl * b.speed * dt;
      collideBody(S, e, e.r);
      if (Math.hypot(e.x - px, e.y - py) < 0.3 * b.speed * dt) e.strafe = -e.strafe; // stuck: turn round
      e.ang = toH;
      e.cd -= dt;
      if (e.cd <= 0 && dist <= E02.range && clearLine(S, e.x, e.y, h.x, h.y, SHOT_R)) {
        e.st = 'tell'; e.stT = tellT; e.tell01 = 0; e.aimAng = toH;
        ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
      } else if (e.cd <= 0) e.cd = 0;
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = tellT > 0 ? 1 - Math.max(0, e.stT) / tellT : 1;
      if (e.stT > E02.lockLast * t.TELL_MULT) e.aimAng = toH; // locks for the last 0.2 s
      e.ang = e.aimAng;
      if (e.stT <= 0) {
        enemyShoot(S, e, e.aimAng, E02.shotSpeed, enemyDmg(S, b.atk));
        e.st = 'cool'; e.cd = E02.cool; e.tell01 = 0;
      }
    }
  } else if (e.type === 'E-03') {
    tellT = E03.tell * t.TELL_MULT;
    if (e.st === 'cool' || e.st === 'move') {
      e.ang = toH; e.cd -= dt;
      if (e.cd <= 0 && dist <= E03.range && clearLine(S, e.x, e.y, h.x, h.y, SHOT_R)) {
        e.st = 'tell'; e.stT = tellT; e.tell01 = 0; e.aimAng = toH; // fan direction fixed at tell start
        ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
      } else if (e.cd <= 0) e.cd = 0;
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = tellT > 0 ? 1 - Math.max(0, e.stT) / tellT : 1;
      e.ang = e.aimAng;
      if (e.stT <= 0) {
        var dmg = enemyDmg(S, b.atk);
        for (var k = -1; k <= 1; k++) enemyShoot(S, e, e.aimAng + k * E03.spread, E03.shotSpeed, dmg);
        e.st = 'cool'; e.cd = E03.cool; e.tell01 = 0;
      }
    }
  }
  if (e.type !== 'E-03') collideBody(S, e, e.r);
  // contact
  // bodies are kept HERO_GAP apart (separate()), so touching = within the gap; a lunge hits on overlap
  if (e.contactCd <= 0 && Math.hypot(h.x - e.x, h.y - e.y) < e.r + HERO_HURT_R + (e.st === 'act' ? 0 : HERO_GAP + 0.02)) {
    if (hurtHero(S, enemyDmg(S, b.contact), e.type, e.x, e.y)) e.contactCd = CONTACT_CD;
  }
}
function separate(S){
  // enemies never stack on each other and never sit on the Operator (M, P0 fix)
  var a = S.enemies, h = S.hero, it, i, j;
  for (it = 0; it < 3; it++) {
    for (i = 0; i < a.length; i++) for (j = i + 1; j < a.length; j++) {
      var p = a[i], q = a[j];
      var dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy), m = p.r + q.r + 0.04;
      if (d >= m) continue;
      if (d < 1e-6) { dx = (p.id < q.id ? 1e-6 : -1e-6); dy = 0; d = 1e-6; }
      var pm = p.type === 'E-03' ? 0 : 1, qm = q.type === 'E-03' ? 0 : 1, sm = pm + qm;
      if (!sm) continue;
      var k = (m - d) / d;
      p.x -= dx * k * pm / sm; p.y -= dy * k * pm / sm; q.x += dx * k * qm / sm; q.y += dy * k * qm / sm;
    }
    for (i = 0; i < a.length; i++) {
      var e = a[i];
      if (e.st === 'act') continue; // a lunge may pass through to hit
      var gx = e.x - h.x, gy = e.y - h.y, gd = Math.hypot(gx, gy), gap = e.r + HERO_HURT_R + HERO_GAP;
      if (gd >= gap) continue;
      if (gd < 1e-6) { gx = 0; gy = (h.y > S.room.h / 2 ? -1e-6 : 1e-6); gd = 1e-6; } // pinned: push toward room centre
      var kk = (gap - gd) / gd;
      if (e.type === 'E-03') { h.x -= gx * kk; h.y -= gy * kk; collideBody(S, h, HERO_WALL_R); } // static turret acts as a post
      else { e.x += gx * kk; e.y += gy * kk; }
    }
    for (i = 0; i < a.length; i++) if (a[i].type !== 'E-03') collideBody(S, a[i], a[i].r);
  }
}

// ---------- damage to enemies ----------
function killEnemy(S, e){
  var b = EN[e.type];
  S.stats.kills++;
  S.stats.killLog.push({ type:e.type, stage:S.stage, t:+(S.roomT).toFixed(3) });
  ev(S, { k:'kill', x:e.x, y:e.y, id:e.id, type:e.type });
  S.pickups.push({ x:e.x, y:e.y, kind:'xp', v:b.xp, life:1e9 });
  var p = Math.min(REPAIR_CAP, REPAIR_BASE + S.pity);
  if (S.rng.next() < p) { S.pickups.push({ x:e.x + 0.2, y:e.y, kind:'repair', v:0, life:REPAIR_LIFE }); S.pity = 0; }
  else S.pity += b.size === 'small' ? REPAIR_PITY * 0.5 : REPAIR_PITY;
}
function damageEnemy(S, e, dmg, crit){
  e.hp -= dmg; e.flashT = 0.1;
  ev(S, { k:'hit', x:e.x, y:e.y, id:e.id, dmg:dmg, crit:crit });
  if (crit) ev(S, { k:'crit', x:e.x, y:e.y, id:e.id, dmg:dmg });
  if (e.hp <= 0) { e.hp = 0; killEnemy(S, e); return true; }
  return false;
}

function stepRounds(S, dt){
  var a = S.rounds, out = [];
  for (var i = 0; i < a.length; i++) {
    var r = a[i], alive = true;
    r.x += r.vx * dt; r.y += r.vy * dt;
    if (outOfRoom(S, r.x, r.y, r.r) || hitsSolid(S, r.x, r.y, r.r)) continue;
    for (var j = 0; j < S.enemies.length; j++) {
      var e = S.enemies[j];
      if (!targetable(e) || r.hit.indexOf(e.id) >= 0) continue;
      if (Math.hypot(e.x - r.x, e.y - r.y) < e.r + r.r) {
        damageEnemy(S, e, r.dmg, r.crit);
        r.hit.push(e.id);
        alive = false;
        if (cardCount(S, 'rico') > 0 && r.bounces < RICO_MAX) {
          var best = null, bd = RICO_RANGE;
          for (var k = 0; k < S.enemies.length; k++) {
            var o = S.enemies[k];
            if (!targetable(o) || r.hit.indexOf(o.id) >= 0) continue;
            var d = Math.hypot(o.x - r.x, o.y - r.y);
            if (d < bd && clearLine(S, r.x, r.y, o.x, o.y, r.r)) { bd = d; best = o; }
          }
          if (best) {
            var ang = Math.atan2(best.y - r.y, best.x - r.x), sp = Math.hypot(r.vx, r.vy);
            r.vx = Math.cos(ang) * sp; r.vy = Math.sin(ang) * sp;
            r.dmg = Math.max(1, Math.floor(r.dmg * RICO_MULT)); r.bounces++;
            alive = true;
          }
        }
        break;
      }
    }
    if (alive) out.push(r);
  }
  S.rounds = out;
  // remove dead enemies
  var en = [];
  for (var q = 0; q < S.enemies.length; q++) if (S.enemies[q].hp > 0) en.push(S.enemies[q]);
  S.enemies = en;
}
function stepShots(S, dt){
  var a = S.shots, out = [], h = S.hero;
  for (var i = 0; i < a.length; i++) {
    var s = a[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (outOfRoom(S, s.x, s.y, s.r) || hitsSolid(S, s.x, s.y, s.r)) continue; // cover stops enemy rounds (M)
    if (S.phase !== 'dead' && Math.hypot(h.x - s.x, h.y - s.y) < s.r + HERO_HURT_R) { hurtHero(S, s.dmg, s.src, s.x, s.y); continue; }
    out.push(s);
  }
  S.shots = out;
}

// ---------- pickups / xp ----------
function addXp(S, v){
  var h = S.hero;
  if (h.level >= LEVEL_CAP) return;
  h.xp += v;
  while (h.level < LEVEL_CAP && h.xp >= h.xpNext) {
    h.xp -= h.xpNext; h.level++; S.pendingLevels++;
    ev(S, { k:'levelup', x:h.x, y:h.y, level:h.level });
    h.xpNext = h.level < LEVEL_CAP ? LEVEL_COST[h.level + 1] : LEVEL_COST[LEVEL_CAP];
  }
  if (h.level >= LEVEL_CAP) h.xp = 0;
}
function collect(S, p){
  var h = S.hero;
  if (p.kind === 'xp') addXp(S, p.v);
  else {
    var heal = Math.floor(h.maxHp * REPAIR_PCT);
    p.v = Math.min(heal, h.maxHp - h.hp); h.hp = Math.min(h.maxHp, h.hp + heal);
  }
  ev(S, { k:'pickup', x:p.x, y:p.y, kind:p.kind, v:p.v });
}
function stepPickups(S, dt){
  var h = S.hero, out = [], magnet = S.phase !== 'play';
  for (var i = 0; i < S.pickups.length; i++) {
    var p = S.pickups[i];
    var full = p.kind === 'repair' && h.hp >= h.maxHp;
    if (p.kind === 'repair') { p.life -= dt; if (p.life <= 0) continue; }
    var dx = h.x - p.x, dy = h.y - p.y, d = Math.hypot(dx, dy);
    if (magnet && !full && d > 1e-6) { var st = Math.min(d, MAGNET_SPEED * dt); p.x += dx / d * st; p.y += dy / d * st; d -= st; }
    if (!full && d < S.tune.PICKUP_R) { collect(S, p); continue; }
    out.push(p);
  }
  S.pickups = out;
}

// ---------- cards ----------
function offerCards(S){
  var avail = [], i;
  for (i = 0; i < V.CARDS.length; i++) { var c = V.CARDS[i]; if (!c.max || cardCount(S, c.key) < c.max) avail.push(i); }
  var n = Math.max(1, Math.min(Math.round(S.tune.CARDS_OFFERED) || 2, avail.length)), out = [];
  for (i = 0; i < n; i++) { var j = S.rng.int(avail.length); out.push(avail[j]); avail.splice(j, 1); }
  return out;
}
function pick(S, index){
  if (S.phase !== 'pick' || !S.cards) return false;
  var ci = S.cards[index]; if (ci == null) return false;
  var c = V.CARDS[ci];
  S.hero.mods[c.key] = (S.hero.mods[c.key] || 0) + 1;
  S.hero.atk = roundDamage(S);
  S.stats.picks.push(c.id);
  S.pendingLevels = Math.max(0, S.pendingLevels - 1);
  S.cards = null; S.phase = 'clear';
  ev(S, { k:'pick', x:S.hero.x, y:S.hero.y, id:c.id, key:c.key });
  return true;
}

function nextRoom(S){
  // bank anything still flying
  for (var i = 0; i < S.pickups.length; i++) if (S.pickups[i].kind === 'xp') addXp(S, S.pickups[i].v);
  S.stage++;
  var idx = (V.ROOM_ORDER.indexOf(S.roomId) + 1) % V.ROOM_ORDER.length;
  loadRoom(S, V.ROOM_ORDER[idx]);
}

// ---------- step ----------
function step(S, inp){
  S.events.length = 0;
  if (S.phase === 'pick' || S.phase === 'dead') return S;
  var t = S.tune, dt = STEP * (t.TIME_SCALE > 0 ? t.TIME_SCALE : 1);
  S.frame++; S.t += dt; S.roomT += dt;
  if (S.phase === 'play') S.stats.playSteps++;
  stepHero(S, inp, dt);
  if (S.phase === 'play' && S.hero.braced) S.stats.bracedSteps++;
  for (var i = 0; i < S.enemies.length && S.phase !== 'dead'; i++) stepEnemy(S, S.enemies[i], dt);
  separate(S);
  stepRounds(S, dt);
  stepShots(S, dt);
  if (S.phase === 'dead') return S;
  if (S.phase === 'play' && S.enemies.length === 0) {
    S.phase = 'clear'; S.clearT = 0; S.room.door.open = true;
    S.shots.length = 0;
    S.stats.roomTimes.push({ stage:S.stage, roomId:S.roomId, s:+S.roomT.toFixed(2) });
    S.stats.roomHp.push({ stage:S.stage, roomId:S.roomId, hp:S.hero.hp });
    if (S.hero.lockId != null) { ev(S, { k:'unlock', x:S.hero.x, y:S.hero.y, id:S.hero.lockId }); S.hero.lockId = null; S.hero.lockClear = false; }
    ev(S, { k:'door', x:S.room.door.x + 0.5, y:S.room.door.y + 0.5, open:true });
  }
  stepPickups(S, dt);
  if (S.phase === 'clear') {
    S.clearT += dt;
    var h = S.hero, d = S.room.door;
    var atDoor = circleRect(h.x, h.y, HERO_WALL_R + 0.02, d);
    if (S.pendingLevels > 0 && (S.clearT >= t.PICK_DELAY || atDoor)) { S.phase = 'pick'; S.cards = offerCards(S); }
    else if (atDoor) nextRoom(S);
  }
  return S;
}

function restart(S){ return create(((S.seed + 1) >>> 0), S.tune); }

// FNV-1a over the main state, for determinism checks
function hash(S){
  var h = 2166136261 >>> 0;
  function mix(v){ var s = String(v); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 124; h = Math.imul(h, 16777619) >>> 0; }
  mix(S.frame); mix(S.phase); mix(S.stage); mix(S.rng.s);
  var H = S.hero; mix(H.x.toFixed(5)); mix(H.y.toFixed(5)); mix(H.hp); mix(H.xp); mix(H.level); mix(H.lockId);
  for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; mix(e.id); mix(e.x.toFixed(5)); mix(e.y.toFixed(5)); mix(e.hp); mix(e.st); }
  mix(S.rounds.length); mix(S.shots.length); mix(S.pickups.length); mix(S.stats.kills);
  return ('00000000' + h.toString(16)).slice(-8);
}

V.Sim = { create:create, step:step, pick:pick, restart:restart, hash:hash,
  STEP:STEP, LEVEL_COST:LEVEL_COST, ENEMIES:EN, roundDamage:roundDamage, fireInterval:fireInterval, clearLine:clearLine };
})();
