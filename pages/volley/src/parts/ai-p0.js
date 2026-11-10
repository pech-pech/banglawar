(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// E-01..E-03 behaviour (D1 section 4). Registry entry: { base, init(S,e,api), step(S,e,dt,api) }.
// The sim does spawn grace, hit flash, contact damage, death, XP and separation.
V.AI = V.AI || {};
var DEG = Math.PI / 180;

V.AI['E-01'] = {
  base: { hp:300, contact:60, dmg:60, speed:2.4, r:0.35, size:'small', xp:4, tell:0.5, cd:2.0, flyer:true },
  range: 2.5, lungeSpeed: 6.0, lungeDist: 3.0,
  init: function(S, e, api){ e.lungeLeft = 0; },
  step: function(S, e, dt, api){
    var A = V.AI['E-01'], b = A.base, h = api.hero(S), dist = api.dist(e, h), toH = api.angleTo(e, h);
    if (e.st === 'move' || e.st === 'cool') {
      // halt at the push-apart gap instead of sitting on the Operator
      if (dist > e.r + h.r + 0.12) api.steerTo(S, e, h.x, h.y, b.speed, dt); else e.ang = toH;
      if (e.st === 'cool') { e.cd -= dt; if (e.cd <= 0) e.st = 'move'; }
      else if (dist <= A.range && api.clearLine(S, e.x, e.y, h.x, h.y, e.r)) {
        e.st = 'tell'; e.stT = api.tellT(S, b.tell); e.tellT = e.stT; e.tell01 = 0; e.aimAng = toH;
        api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
      }
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
      e.aimAng = toH; e.ang = toH;
      if (e.stT <= 0) { e.st = 'act'; e.lungeLeft = A.lungeDist; e.vx = Math.cos(toH); e.vy = Math.sin(toH); e.tell01 = 0; }
    } else if (e.st === 'act') {
      var st = Math.min(e.lungeLeft, A.lungeSpeed * dt);
      e.x += e.vx * st; e.y += e.vy * st; e.lungeLeft -= st;
      var ox = e.x, oy = e.y;
      api.collideBody(S, e, e.r);
      if (e.lungeLeft <= 1e-6 || Math.abs(ox - e.x) + Math.abs(oy - e.y) > 1e-4) { e.st = 'cool'; e.cd = b.cd; }
    }
  }
};

V.AI['E-02'] = {
  base: { hp:450, contact:40, dmg:60, speed:1.0, r:0.40, size:'medium', xp:8, tell:0.6, cd:2.2 },
  lockLast: 0.2, shotSpeed: 6.0, range: 10, prefer: 4.5,
  init: function(S, e, api){
    var R = api.rng(S);
    e.strafe = R.next() < 0.5 ? -1 : 1; e.strafeT = R.range(1.2, 2.4); e.cd = R.range(0.6, 1.4); e.noLosT = 0;
  },
  step: function(S, e, dt, api){
    var A = V.AI['E-02'], b = A.base, h = api.hero(S), dx = h.x - e.x, dy = h.y - e.y, dist = Math.hypot(dx, dy), toH = Math.atan2(dy, dx);
    if (e.st === 'move' || e.st === 'cool') {
      e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = api.rng(S).range(1.2, 2.6); }
      var ux = dx / (dist || 1), uy = dy / (dist || 1);
      var radial = dist > A.prefer + 0.8 ? 0.7 : (dist < A.prefer - 0.8 ? -0.7 : 0);
      var vx = ux * radial - uy * e.strafe, vy = uy * radial + ux * e.strafe;
      var los = api.clearLine(S, e.x, e.y, h.x, h.y, 0.15);
      e.noLosT = los ? 0 : e.noLosT + dt;
      if (e.noLosT > 0.8) { vx = ux * 0.45 - uy * e.strafe * 0.9; vy = uy * 0.45 + ux * e.strafe * 0.9; } // walk round cover
      var vl = Math.hypot(vx, vy) || 1, px = e.x, py = e.y;
      e.x += vx / vl * b.speed * dt; e.y += vy / vl * b.speed * dt;
      api.collideBody(S, e, e.r);
      if (Math.hypot(e.x - px, e.y - py) < 0.3 * b.speed * dt) e.strafe = -e.strafe; // stuck: turn round
      e.ang = toH;
      e.cd -= dt;
      if (e.cd <= 0 && dist <= A.range && los) {
        e.st = 'tell'; e.stT = api.tellT(S, b.tell); e.tellT = e.stT; e.tell01 = 0; e.aimAng = toH;
        api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
      } else if (e.cd <= 0) e.cd = 0;
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
      if (e.stT > api.tellT(S, A.lockLast)) e.aimAng = toH; // locks for the last 0.2 s
      e.ang = e.aimAng;
      if (e.stT <= 0) { api.enemyShoot(S, e, e.aimAng, A.shotSpeed, api.enemyDmg(S, b.dmg)); e.st = 'cool'; e.cd = b.cd; e.tell01 = 0; }
    }
  }
};

V.AI['E-03'] = {
  base: { hp:600, contact:40, dmg:45, speed:0, r:0.50, size:'medium', xp:8, tell:0.7, cd:2.8, static:true },
  shotSpeed: 5.0, spread: 25 * DEG, range: 14,
  init: function(S, e, api){ e.cd = api.rng(S).range(0.8, 1.6); e.afterSpawn = 'cool'; },
  step: function(S, e, dt, api){
    var A = V.AI['E-03'], b = A.base, h = api.hero(S), dist = api.dist(e, h), toH = api.angleTo(e, h);
    if (e.st === 'cool' || e.st === 'move') {
      e.ang = toH; e.cd -= dt;
      if (e.cd <= 0 && dist <= A.range && api.clearLine(S, e.x, e.y, h.x, h.y, 0.15)) {
        e.st = 'tell'; e.stT = api.tellT(S, b.tell); e.tellT = e.stT; e.tell01 = 0; e.aimAng = toH; // fan fixed at tell start
        api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
      } else if (e.cd <= 0) e.cd = 0;
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
      e.ang = e.aimAng;
      if (e.stT <= 0) {
        var dmg = api.enemyDmg(S, b.dmg);
        for (var k = -1; k <= 1; k++) api.enemyShoot(S, e, e.aimAng + k * A.spread, A.shotSpeed, dmg);
        e.st = 'cool'; e.cd = b.cd; e.tell01 = 0;
      }
    }
  }
};
})();
