(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// V.BossKit (step 7): shared, data-driven boss attack module. B-01 (boss.js), B-02, B-03, B-04 run on it.
// API and contract: games-proto/volley/v2/BOSSKIT-API.md. Deterministic: api.rng(S) only, fixed dt; nothing here draws rng.
// Damage passed in is the table base value; the kit scales it with api.enemyDmg unless raw is set.
var DEG = Math.PI / 180, SHOT_R = 0.15;
var K = V.BossKit = { DEG: DEG, SHOT_R: SHOT_R };

function aiu(){ return V.AIU || {}; }
function dmgOf(S, api, d, raw){ return raw ? d : api.enemyDmg(S, d); }
K.dmg = dmgOf;

// ---- geometry ----
K.rayLen = function(S, api, x, y, ang, max){
  // how far a flat round travels before cover / room edge stops it
  var c = Math.cos(ang), s = Math.sin(ang), d = 0, stp = 0.1;
  while (d < max) {
    var n = d + stp, px = x + c * n, py = y + s * n;
    if (px < SHOT_R || px > S.room.w - SHOT_R || py < SHOT_R || py > S.room.h - SHOT_R || api.hitsSolid(S, px, py, SHOT_R)) break;
    d = n;
  }
  return d;
};
K.muzzle = function(e, ang){ return { x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r }; };

// ---- shots ----
function shotOpts(o){
  if (!o || (!o.bounces && !o.r && !o.life)) return undefined;
  var p = {}; if (o.bounces) p.bounces = o.bounces; if (o.r) p.r = o.r; if (o.life) p.life = o.life; return p;
}
K.shoot = function(S, e, api, ang, speed, dmg, opts){
  return api.enemyShoot(S, e, ang, speed, dmgOf(S, api, dmg, opts && opts.raw), shotOpts(opts));
};
K.burst = function(S, e, api, o){
  var n = Math.max(1, o.n | 0), a0 = (o.aimAng || 0) + (o.offsetDeg || 0) * DEG, d = dmgOf(S, api, o.dmg, o.raw), out = [], op = shotOpts(o);
  for (var i = 0; i < n; i++) out.push(api.enemyShoot(S, e, a0 + i * 2 * Math.PI / n, o.speed, d, op));
  return out;
};
K.fan = function(S, e, api, o){
  var n = Math.max(1, o.n | 0), c = o.aimAng != null ? o.aimAng : api.angleTo(e, api.hero(S)), sp = (o.spreadDeg || 0) * DEG;
  var d = dmgOf(S, api, o.dmg, o.raw), out = [], op = shotOpts(o);
  for (var i = 0; i < n; i++) out.push(api.enemyShoot(S, e, n === 1 ? c : c - sp / 2 + sp * i / (n - 1), o.speed, d, op));
  return out;
};

// ---- ground rings and lane ribbons (draw data on the body: e.kitRings, e.kitLanes; scene draws them) ----
K.ring = function(S, e, api, o){
  if (!e.kitRings) e.kitRings = [];
  var T = api.tellT(S, o.tell || 0);
  var g = { x: o.x, y: o.y, r: o.r, t: 0, T: T, fill01: T > 0 ? 0 : 1, dmg: dmgOf(S, api, o.dmg || 0, o.raw), hit: false, done: false,
    linger: o.linger != null ? o.linger : 0.2, lt: 0, tag: o.tag || null, src: e.type };
  e.kitRings.push(g);
  api.ev(S, { k:'ring', x:g.x, y:g.y, r:g.r, id:e.id, type:e.type, tag:g.tag });
  if (T <= 0) fillRing(S, e, api, g);
  return g;
};
function fillRing(S, e, api, g){
  g.fill01 = 1; g.done = true;
  var h = api.hero(S);
  if (g.dmg > 0 && Math.hypot(h.x - g.x, h.y - g.y) < g.r) g.hit = !!api.hurtHero(S, g.dmg, e.type, g.x, g.y);
  api.ev(S, { k:'ringhit', x:g.x, y:g.y, r:g.r, id:e.id, type:e.type, tag:g.tag, hit:g.hit });
}
K.ribbon = function(S, e, api, o){
  if (!e.kitLanes) e.kitLanes = [];
  var T = api.tellT(S, o.tell || 0);
  var l = { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, w: o.w || 0.6, t: 0, T: T, fill01: 0, tag: o.tag || null };
  e.kitLanes.push(l);
  return l;
};
K.stepRings = function(S, e, dt, api){
  var i, a = e.kitRings, keep;
  if (a && a.length) {
    keep = [];
    for (i = 0; i < a.length; i++) {
      var g = a[i];
      if (!g.done) { g.t += dt; g.fill01 = g.T > 0 ? Math.min(1, g.t / g.T) : 1; if (g.t >= g.T - 1e-9) fillRing(S, e, api, g); keep.push(g); }
      else { g.lt += dt; if (g.lt < g.linger) keep.push(g); }
    }
    e.kitRings = keep;
  }
  a = e.kitLanes;
  if (a && a.length) {
    keep = [];
    for (i = 0; i < a.length; i++) { var l = a[i]; l.t += dt; l.fill01 = l.T > 0 ? Math.min(1, l.t / l.T) : 1; if (l.t < l.T) keep.push(l); }
    e.kitLanes = keep;
  }
};
K.clearTells = function(e){ e.kitRings = []; e.kitLanes = []; };

// ---- rotation helpers ----
function val(v, S, e){ return typeof v === 'function' ? v(S, e) : v; }
K.phaseOf = function(e){ return e.phase || 1; };
K.cdFor = function(S, e, def){ return (e.phase > 1 && def.cd2 != null) ? val(def.cd2, S, e) : val(def.cd, S, e); };
K.tellFor = function(S, e, def, atk){ return (e.phase > 1 && atk.tell2 != null) ? val(atk.tell2, S, e) : val(atk.tell, S, e); };
function orderOf(S, e, def){ return val(def.order, S, e); }
function thresholds(def){ return def.phaseAt == null ? [] : (Array.isArray(def.phaseAt) ? def.phaseAt : [def.phaseAt]); }

K.syncBoss = function(S, e, def){
  var name = (def && def.name) || e.name, type = (def && def.type) || e.type;
  if (!S.boss || S.boss.id !== e.id) S.boss = { id:e.id, type:type, name:name, hp:e.hp, maxHp:e.maxHp, phase:e.phase, attack:null, tell01:0 };
  var B = S.boss, bar = def && def.bar ? def.bar(S, e) : null;
  B.hp = bar ? bar.hp : e.hp; B.maxHp = bar ? bar.maxHp : e.maxHp; B.phase = e.phase; B.attack = e.attack; B.tell01 = e.tell01;
};

K.init = function(S, e, api, def){
  var base = (V.AI[e.type] && V.AI[e.type].base) || (V.Data && V.Data.enemies && V.Data.enemies[e.type]) || {};
  e.boss = true; e.immune = base.immune || { instakill:true, freeze:true, knockback:true }; e.knockback = 0;
  e.name = def.name; e.phase = 1; e.atkIdx = 0; e.attack = null; e.tell01 = 0; e.cd = def.firstCd != null ? def.firstCd : 1.5; e.afterSpawn = 'cool';
  e.q = []; e.kitRings = []; e.kitLanes = []; e.freeT = 1e9;
  S.boss = { id:e.id, type:def.type || e.type, name:def.name, hp:e.hp, maxHp:e.maxHp, phase:1, attack:null, tell01:0 };
};

K.nextAttack = function(S, e, api, def){
  var ord = orderOf(S, e, def), k = ord[e.atkIdx % ord.length], atk = def.attacks[k]; e.atkIdx++;
  e.attack = k; e.st = 'tell'; e.tell01 = 0;
  if (def.begin) def.begin(S, e, api);
  e.stT = api.tellT(S, K.tellFor(S, e, def, atk)); e.tellT = e.stT;
  if (atk.plan) atk.plan(S, e, api, atk);
  api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type, attack:k, phase:e.phase });
  return k;
};

K.step = function(S, e, dt, api, def){
  var th = thresholds(def);
  while (e.phase - 1 < th.length && e.hp <= e.maxHp * th[e.phase - 1]) {
    e.phase++; api.ev(S, { k:'bossphase', x:e.x, y:e.y, id:e.id, phase:e.phase });
  }
  var h = api.hero(S), U = aiu();
  if (def.track !== false && U.track) U.track(S, e, h, dt);
  if (e.kitRings || e.kitLanes) K.stepRings(S, e, dt, api);
  var free = def.free != null ? def.free : 1.0;
  if (e.st === 'move' || e.st === 'cool') {
    if (def.face !== false) e.ang = api.angleTo(e, h);
    e.tell01 = 0; e.attack = null;
    if (def.cool) def.cool(S, e, dt, api);
    e.cd -= dt * (def.zeroIn !== false && U.zeroIn ? U.zeroIn(e) : 1);
    e.freeT = (e.freeT || 0) + dt;
    if (e.cd <= 0 && e.freeT >= free - 1e-9) K.nextAttack(S, e, api, def);
  } else if (e.st === 'tell') {
    var a = def.attacks[e.attack];
    e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
    if (a.during) a.during(S, e, dt, api, a);
    if (e.stT <= 0) { e.st = 'act'; e.tell01 = 1; e.q = (a.fire && a.fire(S, e, api, a)) || []; e.actT = 0; }
  } else if (e.st === 'act') {
    var b = def.attacks[e.attack];
    e.actT += dt;
    var keep = [], q = e.q || [];
    for (var i = 0; i < q.length; i++) {
      var s = q[i];
      if (s.t <= e.actT + 1e-9) {
        if (s.call) s.call(S, e, api);
        else api.enemyShoot(S, e, s.ang, s.speed != null ? s.speed : def.shotSpeed, dmgOf(S, api, s.dmg, s.raw), shotOpts(s));
      } else keep.push(s);
    }
    e.q = keep;
    var busy = b.act ? b.act(S, e, dt, api, b) === true : false;
    if (!e.q.length && !busy) {
      if (def.end) def.end(S, e, api);
      e.st = 'cool'; e.cd = K.cdFor(S, e, def); e.freeT = 0; e.tell01 = 0; e.attack = null;
    }
  }
  K.syncBoss(S, e, def);
};
})();
