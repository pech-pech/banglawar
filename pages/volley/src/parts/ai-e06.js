(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// E-06 Splitter and its half E-06h (step 7, M6). Section 03: debut s11, seam glows 0.3 s, hit 50, "kill away from a wall".
// Registry entry: { base, init(S,e,api), step(S,e,dt,api), onDeath(S,e,api) }. Only api.rng(S) for randomness; fixed 60 Hz dt.
//
// Attack (M6 choice): a 2-round aimed burst ("twin shot"), 50 per round, 0.15 s apart on one locked line.
//   Why: section 2 sets the aimed-round tell minimum at 0.6 s effective, and names the 0.3 s seam as NOT a damage tell.
//   So the attack keeps the E-02 aim-line language (0.6 eff, locks the last 0.2) and the seam glows in the last 0.3 s
//   of it (seam01), the brief's "seam glows 0.3 s before its attack". The second round on the locked line punishes a late
//   sidestep, so it does not copy E-02 (1 round) or overlap the E-01 / E-05 dashes. Cover stops both rounds.
// Split: on kill it spawns 2 E-06h halves at once (api.spawnEnemy in onDeath, so the room never reads clear between).
//   The halves pop 0.3 s effective (seam01 1 -> 0, no contact damage) toward the two most open directions, ray-marched
//   against walls, cover and hazards with the half's radius: they never land inside cover or walls. Killing it near a wall
//   squeezes both halves out to the open side (toward the Operator), which is the counterplay "kill away from a wall".
// Halves: smaller, weaker, single aimed round, never elite (spawned with elite false; not in ELITE_TYPES), no onDeath.
//
// Draw fields (scene / V.Look):
//   both:  e.tell01 0..1 (attack tell progress), e.aimAng (rad), e.locked (bool, last 0.2 s), e.seam01 0..1 (seam glow)
//   E-06:  e.burstLeft (rounds still to fire in the act state)
//   E-06h: e.side (-1 | 1: which half of the shell), e.splitAng (rad, pop direction), e.pop01 0..1 (pop progress),
//          e.parentId (id of the Splitter), st 'pop' while popping
// Events: {k:'tell', type, id} at tell start (audio warn_E-06 / warn_E-06h), {k:'tell', lock:true} at lock,
//         {k:'split', x, y, id, type:'E-06', halves:[id,id], angs:[a1,a2]} at the split (seam crack).
V.AI = V.AI || {};
V.Data = V.Data || {};
var DE = (V.Data && V.Data.enemies) || (typeof require === 'function' ? (require('./data-enemies.js'), V.Data.enemies) : null);
// Rows: added only if SIM has not put them in data-enemies.js yet (the same text is in M6-REPORT-S7.md "Needs from SIM").
// Tells are BASE (x TELL_MULT 0.85): tell 0.706 -> 0.6 eff, lockLast 0.235 -> 0.2, seam 0.353 -> 0.3, pop 0.353 -> 0.3. GUESS: hp, speed, cd.
if (!DE['E-06']) DE['E-06'] = {hp:400,contact:40,dmg:50,speed:1.2,r:0.45,size:'medium',xp:8,tell:0.706,cd:2.4,
  ai:{range:9,prefer:4,shotSpeed:6,lead:0.6,lockLast:0.235,seam:0.353,burstN:2,burstGap:0.15,halves:2,popDist:1.4,pop:0.353}};
if (!DE['E-06h']) DE['E-06h'] = {hp:130,contact:30,dmg:35,speed:1.8,r:0.32,size:'small',xp:3,tell:0.706,cd:2.6,
  ai:{range:8,prefer:3,shotSpeed:6,lead:0.5,lockLast:0.235,seam:0.353,burstN:1,burstGap:0.15}};

var DIRS = 16, STEP_D = 0.1;

// free distance from (x,y) along ang for a body of radius r: stops at walls, cover, hazards and the room edge
function freeLen(S, api, x, y, ang, r, max){
  var c = Math.cos(ang), s = Math.sin(ang), d = 0;
  while (d < max - 1e-9) {
    var n = Math.min(max, d + STEP_D), px = x + c * n, py = y + s * n;
    if (px < r || px > S.room.w - r || py < r || py > S.room.h - r || api.hitsSolidBody(S, px, py, r + 0.03)) break;
    d = n;
  }
  return d;
}
// the two pop directions: the pair (at least 90 deg apart) whose shorter free run is longest; ends near the Operator cost.
// No rng: a fixed scan, first best wins a tie. Returns [{ang, d}, {ang, d}].
function splitDirs(S, e, api, rh, max){
  var h = api.hero(S), f = [], end = [], i, j;
  for (i = 0; i < DIRS; i++) {
    var a = i * 2 * Math.PI / DIRS, d = freeLen(S, api, e.x, e.y, a, rh, max);
    f.push(d);
    var ex = e.x + Math.cos(a) * d, ey = e.y + Math.sin(a) * d, hd = Math.hypot(h.x - ex, h.y - ey);
    end.push(hd < 1.2 ? (1.2 - hd) : 0);   // landing on the Operator reads unfair
  }
  var best = null, bs = -1e9;
  for (i = 0; i < DIRS; i++) for (j = i + 1; j < DIRS; j++) {
    var sep = Math.min(j - i, DIRS - (j - i));
    if (sep < DIRS / 4) continue;
    var sc = Math.min(f[i], f[j]) * 2 + (f[i] + f[j]) * 0.25 - (end[i] + end[j]) * 0.8 + (sep === DIRS / 2 ? 0.05 : 0);
    if (sc > bs + 1e-9) { bs = sc; best = [i, j]; }
  }
  return [{ ang:best[0] * 2 * Math.PI / DIRS, d:f[best[0]] }, { ang:best[1] * 2 * Math.PI / DIRS, d:f[best[1]] }];
}

// shared walker + aimed burst (E-02 style movement; the half is the same machine, smaller)
function make(type){
  return {
    base: DE[type],
    init: function(S, e, api){
      var R = api.rng(S);
      e.strafe = R.next() < 0.5 ? -1 : 1; e.strafeT = R.range(1.2, 2.4); e.cd = R.range(0.8, 1.6); e.noLosT = 0;
      e.seam01 = 0; e.locked = false; e.burstLeft = 0; e.burstT = 0;
    },
    step: function(S, e, dt, api){
      var A = V.AI[type], b = A.base, ai = b.ai, h = api.hero(S), dx = h.x - e.x, dy = h.y - e.y, dist = Math.hypot(dx, dy), toH = Math.atan2(dy, dx);
      var leadA = V.AIU.leadAng(S, e, h, dt, ai.shotSpeed, ai.lead);
      if (e.st === 'pop') {   // E-06h only: slide out of the split, ease-out, no contact damage, no attack
        e.popT += dt; var u = Math.min(1, e.popT / e.popDur), p = 1 - (1 - u) * (1 - u);
        var nx = e.popX0 + Math.cos(e.splitAng) * e.popD * p, ny = e.popY0 + Math.sin(e.splitAng) * e.popD * p;
        if (!api.hitsSolidBody(S, nx, ny, e.r)) { e.x = nx; e.y = ny; }
        e.pop01 = u; e.seam01 = 1 - u; e.ang = e.splitAng;
        if (u >= 1) { e.st = 'cool'; e.noContact = false; e.seam01 = 0; }
        return;
      }
      if (e.st === 'move' || e.st === 'cool') {
        e.locked = false; e.seam01 = 0;
        e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = api.rng(S).range(1.2, 2.6); }
        var ux = dx / (dist || 1), uy = dy / (dist || 1);
        var radial = dist > ai.prefer + 0.8 ? 0.7 : (dist < ai.prefer - 0.8 ? -0.7 : 0);
        var vx = ux * radial - uy * e.strafe, vy = uy * radial + ux * e.strafe;
        var los = api.clearLine(S, e.x, e.y, h.x, h.y, 0.15);
        e.noLosT = los ? 0 : e.noLosT + dt;
        if (e.noLosT > 0.8) { vx = ux * 0.45 - uy * e.strafe * 0.9; vy = uy * 0.45 + ux * e.strafe * 0.9; }   // walk round cover
        var vl = Math.hypot(vx, vy) || 1, px = e.x, py = e.y;
        e.x += vx / vl * b.speed * dt; e.y += vy / vl * b.speed * dt;
        api.collideBody(S, e, e.r);
        if (Math.hypot(e.x - px, e.y - py) < 0.3 * b.speed * dt) e.strafe = -e.strafe;
        e.ang = toH;
        e.cd -= dt * V.AIU.zeroIn(e);
        if (e.cd <= 0 && dist <= ai.range && los) {
          e.st = 'tell'; e.stT = api.tellT(S, b.tell); e.tellT = e.stT; e.tell01 = 0; e.aimAng = leadA;
          api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
        } else if (e.cd <= 0) e.cd = 0;
      } else if (e.st === 'tell') {
        e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
        if (e.stT > api.tellT(S, ai.lockLast)) e.aimAng = leadA;
        else if (!e.locked) { e.locked = true; api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type, lock:true }); }
        var sw = api.tellT(S, ai.seam);
        e.seam01 = e.stT < sw ? Math.min(1, 1 - Math.max(0, e.stT) / sw) : 0;   // seam glows the last 0.3 s
        e.ang = e.aimAng;
        if (e.stT <= 0) { e.st = 'act'; e.tell01 = 0; e.burstLeft = ai.burstN; e.burstT = 0; }
      }
      if (e.st === 'act') {
        e.ang = e.aimAng; e.burstT -= dt;
        if (e.burstT <= 0 && e.burstLeft > 0) {
          api.enemyShoot(S, e, e.aimAng, ai.shotSpeed, api.enemyDmg(S, b.dmg));
          e.burstLeft--; e.burstT += ai.burstGap;
        }
        if (e.burstLeft <= 0) { e.st = 'cool'; e.cd = b.cd; e.locked = false; e.seam01 = 0; }
      }
    }
  };
}

V.AI['E-06'] = make('E-06');
V.AI['E-06h'] = make('E-06h');
// behaviour params mirrored on the entry (as E-04 / E-05 do), so test-data's drift check sees row.ai[k] === V.AI[id][k]
['E-06', 'E-06h'].forEach(function(t){ var a = DE[t].ai; for (var k in a) V.AI[t][k] = a[k]; });
var halfInit = V.AI['E-06h'].init;
V.AI['E-06h'].init = function(S, e, api){
  halfInit(S, e, api);
  // a half placed without a split (test / bad data) just walks; onDeath of E-06 sets the pop
  e.side = 1; e.splitAng = 0; e.pop01 = 1; e.parentId = null;
};
V.AI['E-06'].splits = true;   // read by SIM (optional): the kill that splits is not the room's last kill
V.AI['E-06'].splitDirs = splitDirs; V.AI['E-06'].freeLen = freeLen;   // test hooks

V.AI['E-06'].onDeath = function(S, e, api){
  var HB = V.AI['E-06h'].base, ai = V.AI['E-06'].base.ai, rh = HB.r;
  var dirs = splitDirs(S, e, api, rh, ai.popDist), ids = [], angs = [], dur = api.tellT(S, ai.pop);
  for (var k = 0; k < ai.halves && k < dirs.length; k++) {
    var D = dirs[k];
    var x = e.x, y = e.y;   // the parent body was legal; a smaller half on the same spot is too
    var hlf = api.spawnEnemy(S, 'E-06h', x, y, false);
    if (!hlf) continue;
    hlf.wave = e.wave || 1;   // counts with its parent's wave (sim waves)
    hlf.st = 'pop'; hlf.spawnT = 0; hlf.noContact = true;
    hlf.popX0 = x; hlf.popY0 = y; hlf.popD = D.d; hlf.popT = 0; hlf.popDur = dur;
    hlf.side = k === 0 ? -1 : 1; hlf.splitAng = D.ang; hlf.pop01 = 0; hlf.seam01 = 1; hlf.ang = D.ang;
    hlf.parentId = e.id;
    ids.push(hlf.id); angs.push(+D.ang.toFixed(4));
  }
  // the kill event was pushed just before onDeath with last computed without the halves: correct it in place
  for (var i = S.events.length - 1; i >= 0; i--) { var v = S.events[i]; if (v.k === 'kill' && v.id === e.id) { v.last = false; v.split = true; break; } }
  api.ev(S, { k:'split', x:e.x, y:e.y, id:e.id, type:e.type, halves:ids, angs:angs });
};
})();
