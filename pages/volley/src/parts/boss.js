(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// B-01 Volley Tower (D1 section 6). Static multi-barrel tower; cycles A -> B -> C.
// A line streams (1.0 s floor lines), B scatter barrage (0.6 s spin-up), C fan + bouncing line (0.8 s, first segment drawn).
// Phase 2 below 50% HP: A 7 lines with the centre lane open, B 20 rounds, cooldown 1.8 s (2.5 s in phase 1).
// Immune to instant kill and freeze, no knockback (flags on the enemy; mods and sim read them).
V.AI = V.AI || {};
// Step 7: runs on V.BossKit (boss-kit.js, loaded first): rotation, tell state, queue and rayLen come from the kit.
var DE = (V.Data && V.Data.enemies) || (typeof require === 'function' ? (require('./data-enemies.js'), V.Data.enemies) : null);
var K = V.BossKit || (typeof require === 'function' ? (require('./boss-kit.js'), V.BossKit) : null);
var DEG = K.DEG, SHOT_R = K.SHOT_R, rayLen = K.rayLen;
// F1: no enemy literals here; base row and behaviour numbers come from V.Data.enemies['B-01'] (data-enemies.js).
var BT = DE['B-01'].ai;

var B01 = V.AI['B-01'] = {
  base: DE['B-01'],
  name: 'Volley Tower',
  shotSpeed: BT.shotSpeed, scatterDmg: BT.scatterDmg, cd2: BT.cd2,
  tellA: BT.tellA, tellB: BT.tellB, tellC: BT.tellC,
  A: { lines1: BT.A.lines1, step1: BT.A.step1Deg * DEG, perLine: BT.A.perLine, gap: BT.A.gap,
       lines2: BT.A.lines2Deg, extra2: BT.A.extra2Deg },   // phase 2 degrees from straight down; 7th line alternates side
  B: { n1: BT.B.n1, n2: BT.B.n2, dur: BT.B.dur, arc: BT.B.arcDeg * DEG },
  C: { fan: BT.C.fanDeg * DEG, lineN: BT.C.lineN, lineGap: BT.C.lineGap, lineDelay: BT.C.lineDelay },
  order: ['A', 'B', 'C'],

  init: function(S, e, api){
    K.init(S, e, api, this.def);
    e.static = true; e.lines = []; e.segs = []; e.bouncePath = null; e.spin01 = 0; e.extraSide = 1;
  },

  syncBoss: function(S, e){ K.syncBoss(S, e, this.def); },

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
    e.aimAng = V.AIU.leadTo(S, e, h, this.shotSpeed, 0.8);
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

  startAttack: function(S, e, api){ return K.nextAttack(S, e, api, this.def); },

  // queue of timed shots for the act part: {t, ang, dmg, bounces}
  fireAttack: function(S, e, api){
    var q = [], i, j, R = api.rng(S), dA = api.enemyDmg(S, this.base.dmg);
    if (e.attack === 'A') {
      for (j = 0; j < this.A.perLine; j++) for (i = 0; i < e.lines.length; i++) q.push({ t:j * this.A.gap, ang:e.lines[i].ang, dmg:dA, raw:true });
    } else if (e.attack === 'B') {
      var n = e.phase === 1 ? this.B.n1 : this.B.n2, dB = api.enemyDmg(S, this.scatterDmg);
      var c = api.angleTo(e, api.hero(S)) + R.range(-50, 50) * DEG;  // random arc, never a full circle
      for (i = 0; i < n; i++) q.push({ t:this.B.dur * i / (n - 1), ang:c + R.range(-0.5, 0.5) * this.B.arc, dmg:dB, raw:true });
    } else {
      for (i = -1; i <= 1; i++) q.push({ t:0, ang:e.aimAng + i * this.C.fan, dmg:dA, raw:true });
      for (i = 0; i < this.C.lineN; i++) q.push({ t:this.C.lineDelay + i * this.C.lineGap, ang:e.bounceAng, dmg:dA, bounces:1, raw:true });
    }
    return q;
  },

  step: function(S, e, dt, api){
    e.x = e.x0 != null ? e.x0 : (e.x0 = e.x); e.y = e.y0 != null ? e.y0 : (e.y0 = e.y);  // never moves
    K.step(S, e, dt, api, B01.def);
  }
};

function clearGeom(e){ e.lines = []; e.segs = []; e.bouncePath = null; }
// kit data for B-01: same order, tells, cooldowns and hooks as the pre-kit boss.js (HASH600 / test counts held).
// free 0: B-01 keeps its built cooldowns (1.4 s / 1.8 s base, zero-in while the Operator stands still) exactly.
B01.def = {
  type: 'B-01', name: B01.name, order: B01.order, phaseAt: 0.5, firstCd: 1.5,
  cd: B01.base.cd, cd2: B01.cd2, free: 0, shotSpeed: B01.shotSpeed,
  begin: function(S, e){ e.spin01 = 0; clearGeom(e); },
  end: function(S, e){ clearGeom(e); },
  cool: function(S, e){ e.spin01 = 0; },
  attacks: {
    A: { tell: B01.tellA, plan: function(S, e, api){ B01.planA(S, e, api); }, fire: function(S, e, api){ return B01.fireAttack(S, e, api); } },
    B: { tell: B01.tellB, during: function(S, e){ e.spin01 = e.tell01; }, fire: function(S, e, api){ return B01.fireAttack(S, e, api); },
         act: function(S, e){ e.spin01 = 1; } },
    C: { tell: B01.tellC, plan: function(S, e, api){ B01.planC(S, e, api); }, during: function(S, e){ e.ang = e.aimAng; },
         fire: function(S, e, api){ return B01.fireAttack(S, e, api); } }
  }
};
})();
