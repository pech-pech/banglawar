(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// E-08 Sniper turret (section 03 machines table: intro s13, tell 1.2 s effective, last 0.4 s locked solid, hit 110,
// counterplay "break line of sight", cue rising hum + ping). Registry entry: { base, init(S,e,api), step(S,e,dt,api) }.
// Static. Starts a tell only with a clear line to the Operator. The aim line tracks the Operator, then locks for the last 0.4 s
// (effective) and fires ONE fast flat round along the locked line. The round is an ordinary enemy shot, so cover between the
// sniper and the Operator at fire time stops it (sim stepShots: 'block' event). Only api.rng(S) (init) for randomness.
// Loaded after boss.js, before scene.js. Works under node (require) like the other AI parts.
V.AI = V.AI || {};
var D = V.Data = V.Data || {};
if (!V.Data.enemies && typeof require === 'function') { try { require('./data-enemies.js'); } catch (err) {} }
var DE = V.Data.enemies = V.Data.enemies || {};
// Row (only if absent: SIM may move it into data-enemies.js). R31: tell and lockLast are BASE times (x TELL_MULT 0.85 = effective).
//   tell 1.412 -> 1.2 effective; lockLast 0.471 -> 0.4 effective. shotSpeed 9 x ENEMY_SHOT_SPEED_MULT 2 = 18 tiles/s (E-02: 12).
//   stillReload 2: cooldown runs x2 while the Operator stands still (shared zero-in is x6).
//   hp 500, contact 40, r 0.45, xp 8, cd 4.0 (E-03 2.8): GUESS, no table value. lead 0: the line points at the Operator, no lead.
if (!DE['E-08']) DE['E-08'] = {hp:500,contact:40,dmg:110,speed:0,r:0.45,size:'medium',xp:8,tell:1.412,cd:4,static:true,
  ai:{lockLast:0.471,shotSpeed:9,range:16,lead:0,stillReload:2,firstCd:[1.2,2.2],rayMax:30}};
var ROW = DE['E-08'], SHOT_R = 0.15, EPS = 1e-3; // EPS: base 1.412 x 0.85 = 1.2002 (3-place base) plus float dust; fire on frame 72 (1.2 s), not 73

// how far the aim line runs from (x, y) along ang before cover, a closed door or the room edge stops it (same test as boss.js rayLen)
function rayLen(S, api, x, y, ang, max){
  var c = Math.cos(ang), s = Math.sin(ang), d = 0, stp = 0.1;
  while (d < max) {
    var n = d + stp, px = x + c * n, py = y + s * n;
    if (px < SHOT_R || px > S.room.w - SHOT_R || py < SHOT_R || py > S.room.h - SHOT_R || api.hitsSolid(S, px, py, SHOT_R)) break;
    d = n;
  }
  return d;
}
// draw fields for scene.js (valid while st === 'tell'): aimX1/aimY1 muzzle, aimX2/aimY2 line end clipped at cover / wall,
// aimBlocked (cover between muzzle and Operator), locked, lock01 (0..1 across the last 0.4 s), tell01 (0..1 across the whole tell)
function aimLine(S, e, api){
  var A = V.AI['E-08'], h = api.hero(S), c = Math.cos(e.aimAng), s = Math.sin(e.aimAng);
  var x1 = e.x + c * e.r, y1 = e.y + s * e.r, L = rayLen(S, api, x1, y1, e.aimAng, A.rayMax);
  e.aimX1 = x1; e.aimY1 = y1; e.aimX2 = x1 + c * L; e.aimY2 = y1 + s * L; e.aimLen = L;
  e.aimBlocked = !api.clearLine(S, x1, y1, h.x, h.y, SHOT_R);
}
function clearAim(e){ e.tell01 = 0; e.locked = false; e.lock01 = 0; e.aimBlocked = false; e.aimLen = 0; }

V.AI['E-08'] = {
  base: ROW,
  lockLast: ROW.ai.lockLast, shotSpeed: ROW.ai.shotSpeed, range: ROW.ai.range, lead: ROW.ai.lead, rayMax: ROW.ai.rayMax, stillReload: ROW.ai.stillReload, firstCd: ROW.ai.firstCd,
  rayLen: rayLen,
  init: function(S, e, api){
    var R = api.rng(S), fc = V.AI['E-08'].firstCd;
    e.cd = R.range(fc[0], fc[1]); e.afterSpawn = 'cool'; clearAim(e);
  },
  step: function(S, e, dt, api){
    var A = V.AI['E-08'], b = A.base, h = api.hero(S), dist = api.dist(e, h), toH = api.angleTo(e, h);
    var aimA = V.AIU && V.AIU.leadAng ? V.AIU.leadAng(S, e, h, dt, A.shotSpeed, A.lead) : toH;
    if (e.st === 'cool' || e.st === 'move') {
      e.ang = toH; e.aimAng = toH;
      // zero-in (standing still has to lose) at a gentler x2, not the shared x6: a 110 hit every 1.9 s on a still Operator was oppressive
      e.cd -= dt * (V.AIU && V.AIU.zeroIn && V.AIU.zeroIn(e) > 1 ? A.stillReload : 1);
      if (e.cd <= 0 && dist <= A.range && api.clearLine(S, e.x, e.y, h.x, h.y, SHOT_R)) {
        e.st = 'tell'; e.stT = api.tellT(S, b.tell); e.tellT = e.stT; e.lockT = api.tellT(S, A.lockLast);
        clearAim(e); e.aimAng = aimA; aimLine(S, e, api);
        api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });               // warn_E-08: rising hum, d = tellT
      } else if (e.cd <= 0) e.cd = 0;
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
      if (e.stT > e.lockT + EPS) e.aimAng = aimA;                                         // tracks the Operator...
      else if (!e.locked) { e.locked = true; api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type, lock:true }); } // ...then locks solid
      e.lock01 = e.locked && e.lockT > 0 ? Math.min(1, 1 - Math.max(0, e.stT) / e.lockT) : 0;
      e.ang = e.aimAng; aimLine(S, e, api);
      if (e.stT <= EPS) {
        api.enemyShoot(S, e, e.aimAng, A.shotSpeed, api.enemyDmg(S, b.dmg));
        api.ev(S, { k:'snipe', x:e.x, y:e.y, id:e.id, type:e.type, ang:e.aimAng, x2:e.aimX2, y2:e.aimY2, blocked:e.aimBlocked }); // ping / crack
        e.shotT = S.t; e.st = 'cool'; e.cd = b.cd; clearAim(e);
      }
    }
  }
};
})();
