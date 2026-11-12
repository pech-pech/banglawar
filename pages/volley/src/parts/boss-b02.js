(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// B-02 Hopper (03-upgrades-combat section 4, stage 30). Mobile boss; cycles A -> B.
// A triple hop: each hop is its own tell; it picks a landing spot on open floor near the Operator, a ground ring r 1.8 fills over 1.0 s (effective)
//   while the body is in the air, the hop lands as the ring fills (ring hit), short rest on the ground, next hop.
// B 8-way burst: 0.6 s port-flare tell, two radial volleys (second rotated half a step).
// Phase 2 below 50% HP: A 4 hops, B 12-way. Free-shot window >= 1.0 s after each set (BossKit free gate).
// Immune to instant kill and freeze, no knockback. Built on V.BossKit (parts/boss-kit.js, loaded before this part).
// HP: section 4 formula base x 0.72 x (1 + slope x (stage - 1)). The sim scales every row by ENEMY_HP_GLOBAL (0.82, B-01's built
//   factor), so init rescales by hpK / ENEMY_HP_GLOBAL = 0.72 / 0.82: 9,000 -> 13,245 at stage 30.
// DRAW FIELDS (read-only for scene / look-bosses; details in B2-REPORT-S7.md):
//   e.attack 'A' | 'B' | null, e.st 'cool' | 'tell' | 'act', e.tell01 0..1 (A: this hop's ring fill = flight progress; B: port flare)
//   e.kitRings [{x, y, r, fill01, done, hit, tag:'land'}] (kit format), e.ring = the current hop's ring object (same one)
//   e.air (true while in flight), e.hop {x0, y0, x1, y1, u 0..1, z height tiles (4 H u (1-u)), H arc height, i hop no, n hops}
//   e.hopN hops this set (3 / 4), e.ports [angles] of the next / last volley, e.burstN 8 | 12, e.aimAng volley-1 aim
//   events: tell (attack A once per hop, B once), bosshop {tx, ty, i, n}, bossland {i, n, hit}, bossburst {n, volley}, ring, ringhit
V.AI = V.AI || {};
V.Data = V.Data || {};
var DE = (V.Data && V.Data.enemies) || (typeof require === 'function' ? (require('./data-enemies.js'), V.Data.enemies) : null);
function loadKit(){
  if (V.BossKit) return V.BossKit;
  if (typeof require === 'function') { try { require('./boss-kit.js'); } catch (err) { if (!/Cannot find module/.test(err.message)) throw err; } }
  return V.BossKit || null;
}
loadKit();

// Base row (SIM may move it into data-enemies.js; then that row wins). Values marked GUESS are not in the spec table.
if (!DE['B-02']) DE['B-02'] = {
  hp:9000, contact:80, dmg:100, speed:0, r:0.9, size:'large', xp:0, tell:1.176, cd:1.6, boss:true,   // dmg 100 landing ring GUESS, contact 80 as B-01
  immune:{ instakill:true, freeze:true, knockback:true },
  ai:{ hpK:1.8, intro:2.5, cd2:1.2, free:1.0,   // M 2026-11-12 card 1/2 "Halfway (HP x2.5)": 0.72 x 2.5
    A:{ ringR:1.8, ringTell:1.176, rest:0.3, hops1:3, hops2:4, maxHop:5.5, arcH:1.6, edge:0, clear:0.05, standoff:2.5 },  // ring tell 1.0 eff per hop, rest 0.3 s
    B:{ tell:0.706, n1:8, n2:12, volleys:2, gap:0.4, shotSpeed:4, dmg:80, minDist:3.5, wait:0.5 },
    H:{ away:4.5, minD:4.0 } } };   // BAL fix: B only from >= 3.5 tiles; wait up to 0.5 s, then one hop away (H)   // B tell 0.6 eff, speed/dmg GUESS
var ROW = DE['B-02'], AI = ROW.ai;

function kit(){ return V.BossKit || loadKit(); }

// ---------------- landing spot: open floor, inside the room, any column class ----------------
function spotOk(S, api, x, y, r){
  var m = r + AI.A.edge;
  if (x < m || x > S.room.w - m || y < 1 + m || y > S.room.h - m) return false;   // row 0 is the wall row
  return !api.hitsSolidBody(S, x, y, r + AI.A.clear);                               // cover, walls and spike tiles
}
// nearest valid spot to (tx, ty): the target, then rings of 16 candidates every 0.25 tiles out to 8 (fixed order, no rng)
// minD (optional): the spot must also be >= minD from the Operator (BAL fix: no landing on top of the hero)
function findSpot(S, api, e, tx, ty, minD){
  var h = api.hero(S), md = minD || 0;
  function good(x, y){ return spotOk(S, api, x, y, e.r) && (md <= 0 || Math.hypot(x - h.x, y - h.y) >= md - 1e-9); }
  if (good(tx, ty)) return { x:tx, y:ty };
  for (var d = 0.25; d <= 8.001; d += 0.25) {
    var best = null, bd = 1e9;
    for (var i = 0; i < 16; i++) {
      var a = i * Math.PI / 8, x = tx + Math.cos(a) * d, y = ty + Math.sin(a) * d;
      if (!good(x, y)) continue;
      var de = Math.hypot(x - e.x, y - e.y);           // tie-break: the one nearer the boss (shorter hop)
      if (de < bd - 1e-9) { bd = de; best = { x:x, y:y }; }
    }
    if (best) return best;
  }
  return { x:e.x, y:e.y };
}
// one hop = one tell (audio warn_B-02A per hop; the thud lands at the tell end). Called with e.st = 'tell' and e.stT = e.tellT set.
// A hop (away false): land on the boss side of the Operator, standoff (2.5) tiles out (the set's last hop 4.5 out, >= 4);
// H hop (away true): land 4.5 out, >= 4 tiles away.
function takeoff(S, e, api, away){
  var P = AI.A, h = api.hero(S), H = e.hopS, ux = e.x - h.x, uy = e.y - h.y, ul = Math.hypot(ux, uy);
  if (ul < 1e-6) { ux = S.room.w / 2 - h.x; uy = S.room.h / 2 - h.y; ul = Math.hypot(ux, uy); if (ul < 1e-6) { ux = 0; uy = -1; ul = 1; } }
  ux /= ul; uy /= ul;                                              // unit vector Operator -> boss
  var last = !away && H.done + 1 === H.n;                         // the set's last hop lands out of B range-gate: B can follow at once
  var want = away || last ? AI.H.away : P.standoff, minD = away || last ? AI.H.minD : P.standoff;
  var tx = h.x + ux * want, ty = h.y + uy * want, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d > P.maxHop) { tx = e.x + dx / d * P.maxHop; ty = e.y + dy / d * P.maxHop; }
  var sp = findSpot(S, api, e, tx, ty, minD);
  var R = kit().ring(S, e, api, { x:sp.x, y:sp.y, r:P.ringR, tell:P.ringTell, dmg:ROW.dmg, tag:'land' });   // R.T === e.tellT
  H.ring = R;
  e.hop = { x0:e.x, y0:e.y, x1:sp.x, y1:sp.y, u:0, z:0, H:P.arcH, i:H.done + 1, n:H.n };
  e.ring = R; e.air = true; e.noContact = true; e.hopI = H.done + 1;
  e.ang = Math.atan2(sp.y - e.y, sp.x - e.x);
  api.ev(S, { k:'bosshop', x:e.x, y:e.y, tx:sp.x, ty:sp.y, id:e.id, type:e.type, i:H.done + 1, n:H.n });
}
function land(S, e, api){
  var o = e.hop, H = e.hopS;
  e.x = o.x1; e.y = o.y1; o.u = 1; o.z = 0; e.air = false; e.noContact = false;
  H.done++; H.rest = 0;
  api.ev(S, { k:'bossland', x:e.x, y:e.y, id:e.id, type:e.type, i:H.done, n:H.n, hit:!!(H.ring && H.ring.hit) });
}

var DEF = {
  type:'B-02', name:'Hopper',
  // BAL fix: B fires only with the Operator >= minDist away. cool() holds the start while they are closer; after wait s
  // the slot becomes H (one hop away; H.plan steps atkIdx back so B is still next). Still hugged after that H: B is skipped
  // and the A set (hop rings) comes next, so hugging the boss never stalls it.
  order:function(S, e){ var o = ['A', 'B']; if (e.repo) o[1] = 'H'; return o; },
  cool:function(S, e, dt, api){
    if (e.atkIdx % 2 !== 1) { e.repo = false; e.waitB = 0; return; }
    var near = api.dist(e, api.hero(S)) < AI.B.minDist;
    if (!near) { if (e.waitB > 0) e.cd = 0; e.repo = false; e.waitB = 0; return; }   // released: B starts this frame
    var ready = e.cd - dt * V.AIU.zeroIn(e) <= 0 && e.freeT + dt >= AI.free - 1e-9;
    if (!ready) return;
    if (e.hTried) { e.hTried = false; e.waitB = 0; e.repo = false; e.atkIdx++; return; }   // hugged after an H: skip B, the A set comes next
    e.waitB = (e.waitB || 0) + dt;
    if (e.waitB >= AI.B.wait - 1e-9) { e.repo = true; return; }   // start H now
    e.cd = dt * 7;                                                   // hold one frame (zero-in ticks at most x6)
  },
  phaseAt:0.5,
  firstCd:0, cd:ROW.cd, cd2:AI.cd2, free:AI.free,
  shotSpeed:AI.B.shotSpeed,
  begin:function(S, e){ e.hop = null; e.ring = null; e.ports = null; e.air = false; e.noContact = false; },
  end:function(S, e){ e.hop = null; e.air = false; e.noContact = false; e.ports = null; },
  attacks:{
    A:{ tell:AI.A.ringTell,
      plan:function(S, e, api){ e.hopS = { n:e.phase > 1 ? AI.A.hops2 : AI.A.hops1, done:0, rest:0, ring:null }; e.hopN = e.hopS.n; takeoff(S, e, api); },
      during:function(S, e){   // airborne: the body follows the arc while the ring fills (u = tell01 = ring fill01)
        var o = e.hop; if (!o) return;
        var u = e.tell01; o.u = u; o.z = 4 * o.H * u * (1 - u);
        e.x = o.x0 + (o.x1 - o.x0) * u; e.y = o.y0 + (o.y1 - o.y0) * u;
      },
      fire:function(S, e, api){ land(S, e, api); return []; },
      act:function(S, e, dt, api){   // rest on the ground, then the next hop is a fresh tell
        var H = e.hopS; if (!H) return false;
        H.rest += dt;
        if (H.rest < AI.A.rest - 1e-9) return true;
        if (H.done >= H.n) { e.hopS = null; return false; }
        e.st = 'tell'; e.tell01 = 0; e.stT = e.tellT = api.tellT(S, AI.A.ringTell);
        takeoff(S, e, api);
        api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type, attack:'A', phase:e.phase, hop:H.done + 1 });
        return true;
      } },
    H:{ tell:AI.A.ringTell,   // BAL fix: one reposition hop away from a close Operator before B (draws as an A hop; e.attack 'H')
      plan:function(S, e, api){ e.atkIdx--; e.hopS = { n:1, done:0, rest:0, ring:null }; e.hopN = 1; e.waitB = 0; e.repo = false; e.hTried = true; takeoff(S, e, api, true); },
      during:function(S, e, dt, api){ DEF.attacks.A.during(S, e, dt, api); },
      fire:function(S, e, api){ land(S, e, api); return []; },
      act:function(S, e, dt, api){ var H = e.hopS; if (!H) return false; H.rest += dt; if (H.rest < AI.A.rest - 1e-9) return true; e.hopS = null; return false; } },
    B:{ tell:AI.B.tell,
      plan:function(S, e, api){
        e.hTried = false;
        var n = e.phase > 1 ? AI.B.n2 : AI.B.n1, a = api.angleTo(e, api.hero(S));
        e.aimAng = a; e.burstN = n; e.ports = [];
        for (var i = 0; i < n; i++) e.ports.push(a + i * 2 * Math.PI / n);
      },
      fire:function(S, e, api){
        var n = e.burstN, q = [], step = 360 / n;
        for (var v = 0; v < AI.B.volleys; v++) (function(v){
          q.push({ t:v * AI.B.gap, call:function(S, e, api){
            var off = (v % 2) * step / 2;
            kit().burst(S, e, api, { n:n, speed:AI.B.shotSpeed, dmg:AI.B.dmg, aimAng:e.aimAng, offsetDeg:off });
            e.ports = []; for (var i = 0; i < n; i++) e.ports.push(e.aimAng + (off + i * step) * Math.PI / 180);
            api.ev(S, { k:'bossburst', x:e.x, y:e.y, id:e.id, type:e.type, n:n, volley:v + 1 });
          } });
        })(v);
        return q;
      } }
  }
};

var B02 = V.AI['B-02'] = {
  base: ROW,
  name: 'Hopper',
  def: DEF,
  init: function(S, e, api){
    // section 4 HP: the sim already applied ENEMY_HP_GLOBAL; swap it for hpK (also carries lap / stress / elite factors)
    var g = S.tune.ENEMY_HP_GLOBAL > 0 ? S.tune.ENEMY_HP_GLOBAL : 1;
    e.hp = e.maxHp = Math.max(1, Math.round(e.hp * AI.hpK / g));
    kit().init(S, e, api, DEF);
    // boss intro 2.5 s from spawn (hero keeps control): the spawn state takes SPAWN_T; the kit's free gate (wall seconds, no
    // zero-in speed-up) holds the rest, so the first tell starts exactly 2.5 s after spawn
    e.cd = 0; e.freeT = AI.free - Math.max(0, AI.intro - (S.tune.SPAWN_T || 0));
    e.hop = null; e.ring = null; e.ports = null; e.air = false; e.noContact = false; e.hopS = null; e.burstN = 0; e.hopN = 0; e.repo = false; e.waitB = 0; e.hTried = false;
  },
  step: function(S, e, dt, api){
    kit().step(S, e, dt, api, DEF);
  }
};
B02.spotOk = spotOk; B02.findSpot = findSpot;   // for tests
})();
