(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// B-04 Siege Walker (03-upgrades-combat section 4, stage 50: Chapter 1 final boss). Slow four-legged walker; cycles A -> B.
// A spin and rocks: plants, spins up over 1.0 s (effective) and hurls 5 LOBBED rocks at the start of the spin; each rock shows its
//   landing ring (r 1.0) for the whole tell and lands as the spin ends (over cover, like E-04). One rock on the Operator, the rest
//   on a circle round them with open gaps between the rings (step through a gap or into the pocket between rings).
// B 8-rock fan: 0.8 s (effective) tell with the lanes drawn, then 8 FLAT rocks in a fan (cover stops them). One lane is on the Operator.
// Phase 2 below 50% HP: A 7 rocks (wider circle so the gaps stay open), B 11 rocks. Attack C (summons 2 E-09) is cut (GEN-SPEC ruling 13).
// Walks slowly in the upper half during the cooldown, tracking the Operator's column; stands planted during tells and attacks.
// Free-shot window >= 1.0 s after each set (BossKit free gate). Immune to instant kill and freeze, no knockback (BossKit init flags).
// Built on V.BossKit (parts/boss-kit.js). HP: section 4 formula base x 0.72 x (1 + slope x (stage - 1)); the sim scales every row by
//   ENEMY_HP_GLOBAL (0.82, B-01's built R30 factor), so init swaps 0.82 for hpK 0.72 exactly: 14,000 x 0.72 x 2.764 = 27,861.1 -> 27,861 at stage 50
//   (the table's 27,860 is that value rounded down; see B4-REPORT-S7.md open question 1).
// DRAW FIELDS (read-only for scene / look-bosses; all world units, radians):
//   e.attack 'A'|'B'|null, e.tell01 0..1 in the tell, e.st 'cool'|'tell'|'act', e.phase 1|2 (also S.boss.attack/tell01/phase)
//   e.ang      torso / turret facing (towards the Operator; the fan centre during B)
//   e.spin     body spin angle (rad, grows during A, coasts down after), e.spin01 0..1 spin-up during the A tell (0 otherwise)
//   e.legPh    leg cycle phase (rad, advances with distance walked; 2 pi per stride of 0.9 tiles), e.walk01 0..1 walk speed now
//   e.walkAng  heading of the legs (rad)
//   e.rocks    A: [{x,y,r,t0,T}] landing rings of this cast (the S.shells entries carry src 'B-04', rock:true; the scene's shell
//              ring draws them already), cleared at cooldown
//   e.fanLines B: [{ang,x1,y1,x2,y2}] lane of each flat rock, clipped at cover (also pushed as BossKit e.kitLanes ribbons, w 0.48)
V.AI = V.AI || {};
V.Data = V.Data || {};
var DE = (V.Data && V.Data.enemies) || (typeof require === 'function' ? (require('./data-enemies.js'), V.Data.enemies) : null);
function loadKit(){
  if (V.BossKit) return V.BossKit;
  if (typeof require === 'function') { try { require('./boss-kit.js'); } catch (err) { if (!/Cannot find module/.test(err.message)) throw err; } }
  return V.BossKit || null;
}
loadKit();
function kit(){ return V.BossKit || loadKit(); }
var DEG = Math.PI / 180, TAU = Math.PI * 2;
function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

// Base row (SIM may move it into data-enemies.js; then that row wins). GUESS = not in the spec table.
// Tells are BASE (x TELL_MULT 0.85): A 1.176 -> 1.0 eff, B 0.941 -> 0.8 eff.
if (!DE['B-04']) DE['B-04'] = {
  hp:14000, contact:80, dmg:95, speed:0.55, r:1.0, size:'large', xp:0, tell:1.176, cd:1.6, boss:true,   // dmg 95 = E-04 shell (GUESS), contact 80 as B-01
  immune:{ instakill:true, freeze:true, knockback:true },
  ai:{ hpK:1.8, intro:2.5, cd2:1.2, free:1.0,   // M 2026-11-12 card 1/2 "Halfway (HP x2.5)": 0.72 x 2.5
    walk:{ speed:0.55, xPad:2.0, yMin:2.5, yMax:5.5, swayT:9, keep:3.5, stride:0.9 },
    A:{ tell:1.176, rocks1:5, rocks2:7, ringR:1.0, circ1:2.8, circ2:3.6, spinTurns:1.5 },          // circle radii keep >= 1 tile gaps between rings
    B:{ tell:0.941, n1:8, n2:11, step1Deg:11, step2Deg:9, shotSpeed:3.6, rockR:0.24, dmg:85 } } };  // B speed/dmg GUESS (85 = B-01 scatter)
var ROW = DE['B-04'], AI = ROW.ai;

// ---------------- A: rock targets ----------------
// centre on the Operator, others evenly on a circle round them; the circle turns half a step every cast (no rng)
function rockTargets(S, e, api){
  var P = AI.A, h = api.hero(S), n = e.phase > 1 ? P.rocks2 : P.rocks1, out = [], m = n - 1, R = e.phase > 1 ? P.circ2 : P.circ1;
  var a0 = ((e.castA || 0) % 2) * Math.PI / m - Math.PI / 2;
  var xl = 0.5, xr = S.room.w - 0.5, yt = 1.5, yb = S.room.h - 0.5;
  out.push({ x:clamp(h.x, xl, xr), y:clamp(h.y, yt, yb) });
  for (var i = 0; i < m; i++) {
    var a = a0 + i * TAU / m;
    out.push({ x:clamp(h.x + Math.cos(a) * R, xl, xr), y:clamp(h.y + Math.sin(a) * R, yt, yb) });
  }
  return out;
}

// ---------------- B: fan lanes ----------------
function fanAngles(S, e, api){
  var P = AI.B, n = e.phase > 1 ? P.n2 : P.n1, st = (e.phase > 1 ? P.step2Deg : P.step1Deg) * DEG, out = [];
  var c = api.angleTo(e, api.hero(S));
  // odd n: the centre lane is on the Operator; even n: shift half a step (side alternates per cast) so one lane still is
  var off = n % 2 ? 0 : e.fanSide * st / 2;
  for (var i = 0; i < n; i++) out.push(c + (i - (n - 1) / 2) * st + off);
  return { c:c, angs:out };
}

// ---------------- walk (cooldown only) ----------------
function walk(S, e, dt, api){
  var W = AI.walk, h = api.hero(S);
  e.walkT = (e.walkT || 0) + dt;
  var gx = clamp(h.x, W.xPad, S.room.w - W.xPad);
  var gy = (W.yMin + W.yMax) / 2 + (W.yMax - W.yMin) / 2 * Math.sin(TAU * e.walkT / W.swayT);
  if (h.y - gy < W.keep) gy = Math.max(W.yMin, h.y - W.keep);           // never walks onto the Operator
  var dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy), px = e.x, py = e.y;
  if (d > 0.05) {
    var sp = Math.min(W.speed, d / dt);
    e.x += dx / d * sp * dt; e.y += dy / d * sp * dt;
    api.collideBody(S, e, e.r);
    e.walkAng = Math.atan2(dy, dx);
  }
  var moved = Math.hypot(e.x - px, e.y - py);
  e.legPh = ((e.legPh || 0) + moved / W.stride * TAU) % TAU;
  e.walk01 = dt > 0 ? Math.min(1, moved / dt / W.speed) : 0;
}

function spinDecay(e, dt){
  // coast the body spin back to rest (draw only)
  e.spinV = (e.spinV || 0) * Math.max(0, 1 - 2.5 * dt);
  e.spin = ((e.spin || 0) + e.spinV * dt) % TAU;
}

var DEF = {
  type:'B-04', name:'Siege Walker',
  order:['A', 'B'],
  phaseAt:0.5,
  firstCd:1.5, cd:ROW.cd, cd2:AI.cd2, free:AI.free,
  shotSpeed:AI.B.shotSpeed,
  begin:function(S, e){ e.rocks = []; e.fanLines = []; e.spin01 = 0; e.walk01 = 0; },
  end:function(S, e){ e.spin01 = 0; },
  cool:function(S, e, dt, api){
    walk(S, e, dt, api); spinDecay(e, dt);
    e.ang = api.angleTo(e, api.hero(S));
    if (e.fanLines.length) e.fanLines = [];
    if (e.rocks.length) e.rocks = [];
  },
  attacks:{
    A:{ tell:AI.A.tell,
      plan:function(S, e, api){
        var P = AI.A, dmg = api.enemyDmg(S, ROW.dmg), T = e.tellT, tg = rockTargets(S, e, api);
        e.castA = (e.castA || 0) + 1;
        for (var i = 0; i < tg.length; i++) {
          var sh = api.lob(S, e, tg[i].x, tg[i].y, T, P.ringR, dmg);
          sh.rock = true; sh.i = i;
          e.rocks.push({ x:tg[i].x, y:tg[i].y, r:P.ringR, t0:S.t, T:T });
        }
        api.ev(S, { k:'bossrocks', x:e.x, y:e.y, id:e.id, type:e.type, n:tg.length, T:T });
      },
      during:function(S, e, dt){
        e.spin01 = e.tell01; e.walk01 = 0;
        e.spinV = AI.A.spinTurns * TAU * 2 * e.tell01;                  // ramps up; integrates to ~spinTurns over the tell
        e.spin = ((e.spin || 0) + e.spinV * dt) % TAU;
      },
      fire:function(S, e){ e.spin01 = 1; return []; }                   // rocks land on their own (S.shells) as the tell ends
    },
    B:{ tell:AI.B.tell,
      plan:function(S, e, api){
        var K = kit(), F = fanAngles(S, e, api);
        e.fanSide = -e.fanSide; e.aimAng = F.c; e.ang = F.c; e.fanAngs = F.angs; e.fanLines = [];
        for (var i = 0; i < F.angs.length; i++) {
          var a = F.angs[i], m = K.muzzle(e, a), L = K.rayLen(S, api, m.x, m.y, a, 30);
          var ln = { ang:a, x1:m.x, y1:m.y, x2:m.x + Math.cos(a) * L, y2:m.y + Math.sin(a) * L };
          e.fanLines.push(ln);
          K.ribbon(S, e, api, { x1:ln.x1, y1:ln.y1, x2:ln.x2, y2:ln.y2, w:AI.B.rockR * 2, tell:AI.B.tell, tag:'rockfan' });
        }
      },
      during:function(S, e, dt){ e.ang = e.aimAng; e.walk01 = 0; spinDecay(e, dt); },
      fire:function(S, e, api){
        var q = [], P = AI.B;
        for (var i = 0; i < e.fanAngs.length; i++) q.push({ t:0, ang:e.fanAngs[i], dmg:P.dmg, speed:P.shotSpeed, r:P.rockR });
        api.ev(S, { k:'bossfan', x:e.x, y:e.y, id:e.id, type:e.type, n:q.length });
        return q;
      }
    }
  }
};

// HP: swap the sim's ENEMY_HP_GLOBAL for hpK exactly. The stage factor (1 + slope x (n - 1)) is recovered from the spawned HP and
// snapped to the nearest whole n, so the sim's rounding never drifts (27,861 at stage 50; the plain ratio would give 27,861.4). Stress / other factors fall back to the ratio.
function sectionHp(S, e){
  var t = S.tune, g = t.ENEMY_HP_GLOBAL > 0 ? t.ENEMY_HP_GLOBAL : 1, sl = t.HP_SLOPE || 0, b = ROW.hp;
  var k = e.maxHp / (b * g), kk = k;
  if (sl > 0) { var n = Math.round((k - 1) / sl) + 1, k2 = 1 + sl * (n - 1); if (Math.abs(k2 - k) * b * g <= 0.5 + 1e-9) kk = k2; }
  return Math.max(1, Math.round(b * AI.hpK * kk));
}

var B04 = V.AI['B-04'] = {
  base: ROW,
  name: 'Siege Walker',
  def: DEF,
  sectionHp: sectionHp,
  init: function(S, e, api){
    e.hp = e.maxHp = sectionHp(S, e);
    kit().init(S, e, api, DEF);
    // boss intro 2.5 s from spawn (hero keeps control): the spawn state takes SPAWN_T; the rest is held by the kit's free gate,
    // which counts wall seconds (e.cd would be shortened x6 by zero-in on a still Operator; K3 found 1.75 s). Same as B-02.
    e.cd = 0; e.freeT = AI.free - Math.max(0, AI.intro - (S.tune.SPAWN_T || 0));
    e.rocks = []; e.fanLines = []; e.fanAngs = []; e.fanSide = 1; e.castA = 0;
    e.spin = 0; e.spinV = 0; e.spin01 = 0; e.legPh = 0; e.walk01 = 0; e.walkAng = Math.PI / 2; e.walkT = 0;
  },
  step: function(S, e, dt, api){ kit().step(S, e, dt, api, DEF); }
};
})();
