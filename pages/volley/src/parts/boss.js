(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// B-01 Volley Tower (D1 section 6). Static multi-barrel tower; cycles A -> B -> C.
// A line streams (1.0 s floor lines), B scatter barrage (0.6 s spin-up), C fan + bouncing line (0.8 s, first segment drawn).
// Phase 2 below 50% HP: A 7 lines with the centre lane open, B 20 rounds, cooldown 1.8 s (2.5 s in phase 1).
// Immune to instant kill and freeze, no knockback (flags on the enemy; mods and sim read them).
V.AI = V.AI || {};
var DEG = Math.PI / 180, SHOT_R = 0.15;

function rayLen(S, api, x, y, ang, max){
  // how far a flat round travels before cover / room edge stops it
  var c = Math.cos(ang), s = Math.sin(ang), d = 0, stp = 0.1;
  while (d < max) {
    var n = d + stp, px = x + c * n, py = y + s * n;
    if (px < SHOT_R || px > S.room.w - SHOT_R || py < SHOT_R || py > S.room.h - SHOT_R || api.hitsSolid(S, px, py, SHOT_R)) break;
    d = n;
  }
  return d;
}

var B01 = V.AI['B-01'] = {
  base: { hp:8000, contact:80, dmg:70, speed:0, r:1.0, size:'large', xp:0, tell:1.0, cd:2.5,
    static:true, boss:true, immune:{ instakill:true, freeze:true, knockback:true } },
  name: 'Volley Tower',
  shotSpeed: 5.0, scatterDmg: 55, cd2: 1.8,
  tellA: 1.0, tellB: 0.6, tellC: 0.8,
  A: { lines1: 5, step1: 30 * DEG, perLine: 6, gap: 0.2,
       lines2: [-24, 24, -36, 36, -48, 48], extra2: 60 },   // phase 2 degrees from straight down; 7th line alternates side
  B: { n1: 14, n2: 20, dur: 1.5, arc: 220 * DEG },
  C: { fan: 20 * DEG, lineN: 5, lineGap: 0.12, lineDelay: 0.3 },
  order: ['A', 'B', 'C'],

  init: function(S, e, api){
    e.boss = true; e.static = true; e.immune = this.base.immune; e.knockback = 0;
    e.name = this.name; e.phase = 1; e.atkIdx = 0; e.attack = null; e.cd = 1.5; e.afterSpawn = 'cool';
    e.lines = []; e.segs = []; e.bouncePath = null; e.spin01 = 0; e.q = []; e.extraSide = 1;
    S.boss = { id:e.id, type:'B-01', name:this.name, hp:e.hp, maxHp:e.maxHp, phase:1, attack:null, tell01:0 };
  },

  syncBoss: function(S, e){
    if (!S.boss || S.boss.id !== e.id) S.boss = { id:e.id, type:'B-01', name:this.name, hp:e.hp, maxHp:e.maxHp, phase:e.phase, attack:null, tell01:0 };
    var B = S.boss; B.hp = e.hp; B.maxHp = e.maxHp; B.phase = e.phase; B.attack = e.attack; B.tell01 = e.tell01;
  },

  down: function(S, e){ return Math.atan2(S.room.h - e.y, S.room.w / 2 - e.x); },

  // ---- attack set-up at tell start (telegraph geometry is fixed for the whole tell) ----
  planA: function(S, e, api){
    var a = [], i, P = this.A, h = api.hero(S);
    if (e.phase === 1) {
      var c = api.angleTo(e, h);                 // fan centred on the Operator: step into a lane
      for (i = 0; i < P.lines1; i++) a.push(c + (i - (P.lines1 - 1) / 2) * P.step1);
    } else {
      var d = this.down(S, e);
      for (i = 0; i < P.lines2.length; i++) a.push(d + P.lines2[i] * DEG);
      a.push(d + e.extraSide * P.extra2 * DEG); e.extraSide = -e.extraSide;
    }
    e.lines = [];
    for (i = 0; i < a.length; i++) {
      var x1 = e.x + Math.cos(a[i]) * e.r, y1 = e.y + Math.sin(a[i]) * e.r, L = rayLen(S, api, x1, y1, a[i], 30);
      e.lines.push({ ang:a[i], x1:x1, y1:y1, x2:x1 + Math.cos(a[i]) * L, y2:y1 + Math.sin(a[i]) * L });
    }
  },
  planC: function(S, e, api){
    var h = api.hero(S);
    e.aimAng = api.angleTo(e, h);
    // bounce line: aim at the Operator's mirror image across a side wall, so the reflected leg crosses them
    var side = api.rng(S).next() < 0.5 ? -1 : 1;
    var wx = side < 0 ? SHOT_R : S.room.w - SHOT_R, mx = 2 * wx - h.x, my = h.y;
    var ang = Math.atan2(my - e.y, mx - e.x);
    var x0 = e.x + Math.cos(ang) * e.r, y0 = e.y + Math.sin(ang) * e.r;
    var L1 = rayLen(S, api, x0, y0, ang, 30);
    var bx = x0 + Math.cos(ang) * L1, by = y0 + Math.sin(ang) * L1;
    var hitSide = bx <= SHOT_R + 0.11 || bx >= S.room.w - SHOT_R - 0.11;
    var ang2 = hitSide ? Math.PI - ang : -ang;
    var L2 = rayLen(S, api, bx, by, ang2, 30);
    e.bounceAng = ang;
    e.segs = [{ x1:x0, y1:y0, x2:bx, y2:by }];                       // drawn during the tell
    e.bouncePath = [{ x:x0, y:y0 }, { x:bx, y:by }, { x:bx + Math.cos(ang2) * L2, y:by + Math.sin(ang2) * L2 }];
  },

  startAttack: function(S, e, api){
    var k = this.order[e.atkIdx % 3]; e.atkIdx++;
    e.attack = k; e.st = 'tell'; e.tell01 = 0; e.spin01 = 0;
    e.lines = []; e.segs = []; e.bouncePath = null;
    e.stT = api.tellT(S, k === 'A' ? this.tellA : (k === 'B' ? this.tellB : this.tellC)); e.tellT = e.stT;
    if (k === 'A') this.planA(S, e, api);
    if (k === 'C') this.planC(S, e, api);
    api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type, attack:k, phase:e.phase });
  },

  // queue of timed shots for the act part: {t, ang, dmg, bounces}
  fireAttack: function(S, e, api){
    var q = e.q = [], i, j, R = api.rng(S), dA = api.enemyDmg(S, this.base.dmg);
    if (e.attack === 'A') {
      for (j = 0; j < this.A.perLine; j++) for (i = 0; i < e.lines.length; i++) q.push({ t:j * this.A.gap, ang:e.lines[i].ang, dmg:dA });
    } else if (e.attack === 'B') {
      var n = e.phase === 1 ? this.B.n1 : this.B.n2, dB = api.enemyDmg(S, this.scatterDmg);
      var c = api.angleTo(e, api.hero(S)) + R.range(-50, 50) * DEG;  // random arc, never a full circle
      for (i = 0; i < n; i++) q.push({ t:this.B.dur * i / (n - 1), ang:c + R.range(-0.5, 0.5) * this.B.arc, dmg:dB });
    } else {
      for (i = -1; i <= 1; i++) q.push({ t:0, ang:e.aimAng + i * this.C.fan, dmg:dA });
      for (i = 0; i < this.C.lineN; i++) q.push({ t:this.C.lineDelay + i * this.C.lineGap, ang:e.bounceAng, dmg:dA, bounces:1 });
    }
    e.actT = 0;
  },

  step: function(S, e, dt, api){
    var A = B01;
    e.x = e.x0 != null ? e.x0 : (e.x0 = e.x); e.y = e.y0 != null ? e.y0 : (e.y0 = e.y);  // never moves
    if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
      e.phase = 2; api.ev(S, { k:'bossphase', x:e.x, y:e.y, id:e.id, phase:2 });
    }
    var h = api.hero(S);
    if (e.st === 'move' || e.st === 'cool') {
      e.ang = api.angleTo(e, h); e.tell01 = 0; e.spin01 = 0; e.attack = null;
      e.cd -= dt;
      if (e.cd <= 0) A.startAttack(S, e, api);
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
      if (e.attack === 'B') e.spin01 = e.tell01;
      if (e.attack === 'C') e.ang = e.aimAng;
      if (e.stT <= 0) { e.st = 'act'; e.tell01 = 1; A.fireAttack(S, e, api); }
    } else if (e.st === 'act') {
      e.actT += dt;
      var keep = [];
      for (var i = 0; i < e.q.length; i++) {
        var s = e.q[i];
        if (s.t <= e.actT + 1e-9) api.enemyShoot(S, e, s.ang, A.shotSpeed, s.dmg, s.bounces ? { bounces:s.bounces } : undefined);
        else keep.push(s);
      }
      e.q = keep;
      if (e.attack === 'B') e.spin01 = 1;
      if (!e.q.length) {
        e.st = 'cool'; e.cd = e.phase === 1 ? A.base.cd : A.cd2; e.tell01 = 0;
        e.lines = []; e.segs = []; e.bouncePath = null; e.attack = null;
      }
    }
    A.syncBoss(S, e);
  }
};
})();
