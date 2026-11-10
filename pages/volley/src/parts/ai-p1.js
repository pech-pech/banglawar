(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// E-04 Mortar walker, E-05 Charger bot (D1 section 4). Registry entry: { base, init(S,e,api), step(S,e,dt,api) }.
// The sim does spawn grace, hit flash, contact damage, death, XP and separation. Only api.rng(S) for randomness.
V.AI = V.AI || {};

function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

// E-04: walks, holds range, lobs a shell at the Operator's position at fire time.
// The landing ring (r 1.0) shows the whole flight (1.0 s); shells ignore cover (sim).
V.AI['E-04'] = {
  base: { hp:500, contact:40, dmg:95, speed:1.2, r:0.45, size:'medium', xp:8, tell:1.0, cd:3.0 },
  range: 8.5,          // never starts an attack while the Operator is farther than this
  prefer: 5.0,         // preferred distance while walking
  windup: 0.35,        // short squat before the lob (st 'tell'); the ring itself is the 1.0 s telegraph
  ringR: 1.0,
  init: function(S, e, api){
    var R = api.rng(S);
    e.strafe = R.next() < 0.5 ? -1 : 1; e.strafeT = R.range(1.4, 2.6); e.cd = R.range(1.0, 2.0);
  },
  step: function(S, e, dt, api){
    var A = V.AI['E-04'], b = A.base, h = api.hero(S), dx = h.x - e.x, dy = h.y - e.y, dist = Math.hypot(dx, dy), toH = Math.atan2(dy, dx);
    V.AIU.track(S, e, h, dt);
    if (e.st === 'move' || e.st === 'cool') {
      e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = api.rng(S).range(1.4, 2.8); }
      var ux = dx / (dist || 1), uy = dy / (dist || 1);
      var radial = dist > A.prefer + 1 ? 0.8 : (dist < A.prefer - 1 ? -0.8 : 0);
      var vx = ux * radial - uy * e.strafe * 0.7, vy = uy * radial + ux * e.strafe * 0.7;
      var vl = Math.hypot(vx, vy) || 1, px = e.x, py = e.y;
      e.x += vx / vl * b.speed * dt; e.y += vy / vl * b.speed * dt;
      api.collideBody(S, e, e.r);
      if (Math.hypot(e.x - px, e.y - py) < 0.3 * b.speed * dt) e.strafe = -e.strafe;
      e.ang = toH; e.aimAng = toH;
      e.cd -= dt * V.AIU.zeroIn(e);
      if (e.cd <= 0 && dist <= A.range) {   // lobbed: no line of sight needed
        e.st = 'tell'; e.stT = api.tellT(S, A.windup); e.tellT = e.stT; e.tell01 = 0; e.aimAng = toH;
        api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
      } else if (e.cd <= 0) e.cd = 0;
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
      e.aimAng = toH; e.ang = toH;
      if (e.stT <= 0) {
        // target = the Operator's position at fire time; the ring never moves
        var tx = clamp(h.x, 0.3, S.room.w - 0.3), ty = clamp(h.y, 0.3, S.room.h - 0.3);
        var mult = S.tune.ENEMY_SHOT_SPEED_MULT > 0 ? S.tune.ENEMY_SHOT_SPEED_MULT : 1;
        var T = api.tellT(S, b.tell) / Math.min(1, mult); // flight = ground telegraph; slower fire = longer flight
        api.lob(S, e, tx, ty, T, A.ringR, api.enemyDmg(S, b.dmg));
        e.lastTx = tx; e.lastTy = ty;
        e.st = 'act'; e.stT = 0.25; e.tell01 = 0;   // short recoil, stands still
      }
    } else if (e.st === 'act') {
      e.stT -= dt; e.ang = toH;
      if (e.stT <= 0) { e.st = 'cool'; e.cd = b.cd; }
    }
  }
};

// E-05: approaches; kneels 0.8 s facing the Operator with a red lane (locks the last 0.2 s),
// dashes straight up to 8 units at 9.0; stops at walls/cover with a 1.0 s stun; cooldown 2.5 s.
V.AI['E-05'] = {
  base: { hp:650, contact:60, dmg:130, speed:1.6, r:0.50, size:'medium', xp:8, tell:0.8, cd:2.5 },
  range: 7.0, lockLast: 0.2, dashSpeed: 9.0, dashDist: 8.0, stun: 1.0,
  init: function(S, e, api){
    e.cd = api.rng(S).range(0.8, 1.6); e.lane = this.dashDist; e.locked = false; e.stunT = 0;
    e.dashLeft = 0; e.dashHit = false; e.strafe = api.rng(S).next() < 0.5 ? -1 : 1;
  },
  // lane length from (x,y) along ang until the body would touch cover/walls/room edge, capped at dashDist
  laneLen: function(S, e, ang, api){
    var c = Math.cos(ang), s = Math.sin(ang), d = 0, stp = 0.1, max = this.dashDist;
    while (d < max) {
      var n = Math.min(max, d + stp), x = e.x + c * n, y = e.y + s * n;
      if (x < e.r || x > S.room.w - e.r || y < e.r || y > S.room.h - e.r || api.hitsSolid(S, x, y, e.r)) break;
      d = n;
    }
    return d;
  },
  setLane: function(S, e, api){
    e.lane = this.laneLen(S, e, e.aimAng, api);
    e.laneX0 = e.x; e.laneY0 = e.y;
    e.laneX = e.x + Math.cos(e.aimAng) * e.lane; e.laneY = e.y + Math.sin(e.aimAng) * e.lane;
  },
  step: function(S, e, dt, api){
    var A = V.AI['E-05'], b = A.base, h = api.hero(S), dist = api.dist(e, h), toH = api.angleTo(e, h);
    V.AIU.track(S, e, h, dt);
    if (e.st === 'stun') {
      e.stunT -= dt;
      if (e.stunT <= 0) { e.stunT = 0; e.st = 'cool'; e.cd = b.cd; }
      return;
    }
    if (e.st === 'move' || e.st === 'cool') {
      e.locked = false;
      if (dist > e.r + h.r + 0.15) api.steerTo(S, e, h.x, h.y, b.speed, dt); else e.ang = toH;
      api.collideBody(S, e, e.r);
      e.aimAng = toH;
      e.cd -= dt * V.AIU.zeroIn(e);
      if (e.cd <= 0 && dist <= A.range && api.clearLine(S, e.x, e.y, h.x, h.y, e.r * 0.6)) {
        e.st = 'tell'; e.stT = api.tellT(S, b.tell); e.tellT = e.stT; e.tell01 = 0; e.aimAng = toH; e.ang = toH;
        A.setLane(S, e, api);
        api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
      } else if (e.cd <= 0) e.cd = 0;
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
      if (e.stT > api.tellT(S, A.lockLast)) { e.aimAng = toH; e.locked = false; }  // tracks, then locks for the last 0.2 s
      else if (!e.locked) { e.locked = true; e.lockT = S.t; api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type, lock:true }); }
      e.ang = e.aimAng;
      A.setLane(S, e, api);
      if (e.stT <= 0) {
        e.st = 'act'; e.tell01 = 0; e.dashLeft = A.dashDist; e.dashHit = false; e.dashT = S.t;
        e.vx = Math.cos(e.aimAng); e.vy = Math.sin(e.aimAng);
      }
    } else if (e.st === 'act') {
      var st = Math.min(e.dashLeft, A.dashSpeed * dt), wall = false;
      var nx = e.x + e.vx * st, ny = e.y + e.vy * st;
      if (nx < e.r || nx > S.room.w - e.r || ny < e.r || ny > S.room.h - e.r || api.hitsSolid(S, nx, ny, e.r)) {
        // slide up to the wall in small steps, then stop
        var k = 0;
        while (k < 10) { var sx = e.x + e.vx * st * 0.1, sy = e.y + e.vy * st * 0.1;
          if (sx < e.r || sx > S.room.w - e.r || sy < e.r || sy > S.room.h - e.r || api.hitsSolid(S, sx, sy, e.r)) break;
          e.x = sx; e.y = sy; k++; }
        wall = true;
      } else { e.x = nx; e.y = ny; e.dashLeft -= st; }
      if (!e.dashHit && Math.hypot(h.x - e.x, h.y - e.y) < e.r + h.r) {
        e.dashHit = true; api.hurtHero(S, api.enemyDmg(S, b.dmg), e.type, e.x, e.y);
      }
      if (wall) {
        e.st = 'stun'; e.stunT = A.stun; e.locked = false; e.dashLeft = 0;
        api.ev(S, { k:'stun', x:e.x, y:e.y, id:e.id, type:e.type });
      } else if (e.dashLeft <= 1e-6) { e.st = 'cool'; e.cd = b.cd; e.locked = false; }
    }
  }
};
})();
