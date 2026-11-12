(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// E-07 Burrower (03 section 3, CONTRACT-STEP7 M7). Cycle: 'under' (moves underground to a surfacing spot near, not on, the
// Operator) -> 'tell' (ground crack ring at the spot, 1.0 s EFFECTIVE, still underground) -> 'act' (surfaces, fires an 8-round
// ring, hit 50 each, exposed 1.5 s: the shoot window) -> 'under' again.
// Underground ('under' and 'tell'): e.hidden = true, which the sim already honours: not targetable (auto-aim lock, rounds,
// ricochet), no contact damage, no body separation. onDamage also returns 0 while hidden (burn/poison ticks).
// While hidden e.knockback = 0 so the sim's immovable() skips collideBody: it passes under cover; the spot it surfaces on is open floor.
// Draw fields (look agent): e.under (bool), e.ringX/e.ringY/e.ringR + e.tell01 (crack ring fill 0..1, only in st 'tell'),
//   e.surf01 (0 = flush with the ground, 1 = fully up; rises over ai.riseT, sinks over ai.sinkT at the end of the window).
// Only api.rng(S) for randomness; fixed dt. Stages 1-10 never spawn E-07, so HASH600 is untouched.
V.AI = V.AI || {};
var DE = (V.Data && V.Data.enemies) || (typeof require === 'function' ? (require('./data-enemies.js'), V.Data.enemies) : null);
// Row: SIM may move this into data-enemies.js; until then this file defines it only if absent. hp 550 is a GUESS
// (weight 1.3 like E-04/E-05, but only hittable 1.5 s per cycle). tell 1.176 base x TELL_MULT 0.85 = 1.0 effective.
if (DE && !DE['E-07']) DE['E-07'] = {hp:550,contact:40,dmg:50,speed:3,r:0.45,size:'medium',xp:8,tell:1.176,cd:1.2,
  ai:{ringN:8,shotSpeed:5,exposed:1.5,riseT:0.25,sinkT:0.3,nearMin:1.8,nearMax:3.4,otherGap:1,edge:0.8,underMax:4,repick:3,repickMove:1.5}};
var DEG = Math.PI / 180;

function open(S, api, x, y, r, e, A){
  var a = A.base.ai, m = Math.max(r, a.edge);
  if (x < m || x > S.room.w - m || y < 1 + m || y > S.room.h - m) return false;   // row 0 is the wall/door row
  if (api.hitsSolidBody(S, x, y, r + 0.05)) return false;                         // cover and hazards (spikes)
  var en = api.enemies(S);
  for (var i = 0; i < en.length; i++) { var o = en[i];
    if (o === e || o.hp <= 0 || o.hidden) continue;
    if (Math.hypot(o.x - x, o.y - y) < o.r + r + a.otherGap * 0.5) return false; }
  return true;
}
// surfacing spot: open floor nearMin..nearMax from the Operator (never on the Operator). 16 rng tries, then a fixed scan.
function pickSpot(S, e, api){
  var A = V.AI['E-07'], a = A.base.ai, h = api.hero(S), R = api.rng(S), i;
  for (i = 0; i < 16; i++) {
    var ang = R.next() * Math.PI * 2, d = R.range(a.nearMin, a.nearMax), x = h.x + Math.cos(ang) * d, y = h.y + Math.sin(ang) * d;
    if (open(S, api, x, y, e.r, e, A)) return { x:x, y:y };
  }
  var best = null, bd = 1e9;   // fallback: tile centres, closest to the middle of the band
  for (var ty = 1; ty < S.room.h; ty++) for (var tx = 0; tx < S.room.w; tx++) {
    var cx = tx + 0.5, cy = ty + 0.5, dh = Math.hypot(cx - h.x, cy - h.y);
    if (dh < a.nearMin || !open(S, api, cx, cy, e.r, e, A)) continue;
    var sc = Math.abs(dh - (a.nearMin + a.nearMax) / 2);
    if (sc < bd) { bd = sc; best = { x:cx, y:cy }; }
  }
  e.noSpot = !best;               // no open tile at all: surface where it is
  return best || { x:e.x, y:e.y };
}
function goUnder(S, e, api, first){
  var A = V.AI['E-07'];
  e.st = 'under'; e.hidden = true; e.under = true; e.knockback = 0; e.surf01 = 0; e.tell01 = 0;
  e.cd = first ? api.rng(S).range(0.6, 1.2) : A.base.cd;     // minimum time underground
  e.underT = 0;
  e.repickN = -1; V.AI['E-07'].newSpot(S, e, api);
}

V.AI['E-07'] = {
  base: DE['E-07'],
  init: function(S, e, api){
    e.afterSpawn = 'under'; e.ringR = 0; e.ringX = e.x; e.ringY = e.y; e.exposedT = 0;
    goUnder(S, e, api, true);
  },
  newSpot: function(S, e, api){ var p = pickSpot(S, e, api), h = api.hero(S); e.toX = p.x; e.toY = p.y; e.pickHx = h.x; e.pickHy = h.y; e.repickN++; },
  onDamage: function(S, e, dmg){ return e.hidden ? 0 : dmg; },
  step: function(S, e, dt, api){
    var A = V.AI['E-07'], b = A.base, a = b.ai, h = api.hero(S);
    if (e.st === 'move') goUnder(S, e, api, true);           // safety: a test or the sim may force 'move'
    if (e.st === 'under') {
      e.cd -= dt; e.underT += dt;
      var dx = e.toX - e.x, dy = e.toY - e.y, d = Math.hypot(dx, dy), st = b.speed * dt;
      if (d <= st) { e.x = e.toX; e.y = e.toY; d = 0; } else { e.x += dx / d * st; e.y += dy / d * st; e.ang = Math.atan2(dy, dx); }
      // the Operator moved well away from where the spot was picked: re-pick (at most a.repick times a cycle)
      if (e.repickN < a.repick && e.underT < a.underMax && Math.hypot(h.x - e.pickHx, h.y - e.pickHy) > a.repickMove) { A.newSpot(S, e, api); return; }
      if (e.cd > 0) return;
      var dh = Math.hypot(h.x - e.x, h.y - e.y), good = dh >= a.nearMin && open(S, api, e.x, e.y, e.r, e, A);
      if (d > 0 && !(e.underT >= a.underMax && good)) return;       // keep travelling (past underMax it surfaces at any good point)
      if (!good || dh > a.nearMax + a.repickMove) {
        // arrived, but the Operator is on / too far from the spot, or something sits there: pick a new spot and go there
        A.newSpot(S, e, api); e.underT = Math.min(e.underT, a.underMax - 1);
        if (e.toX !== e.x || e.toY !== e.y) return;
        if (!good && !e.noSpot) return;                              // spot is bad but a better one exists next frame
      }
      // crack ring tell (audio: warn_E-07 on this event, surface pop when st leaves 'tell')
      e.st = 'tell'; e.stT = api.tellT(S, b.tell); e.tellT = e.stT; e.tell01 = 0;
      e.ringX = e.x; e.ringY = e.y; e.ringR = e.r + 0.35;
      api.ev(S, { k:'tell', x:e.x, y:e.y, id:e.id, type:e.type });
    } else if (e.st === 'tell') {
      e.stT -= dt; e.tell01 = e.tellT > 0 ? 1 - Math.max(0, e.stT) / e.tellT : 1;
      e.ang = api.angleTo(e, h);
      if (e.stT <= 0) {
        e.st = 'act'; e.hidden = false; e.under = false; delete e.knockback; e.tell01 = 0; e.exposedT = a.exposed; e.surf01 = 0;
        var aim = api.angleTo(e, h), dmg = api.enemyDmg(S, b.dmg);
        for (var i = 0; i < a.ringN; i++) api.enemyShoot(S, e, aim + i * 360 / a.ringN * DEG, a.shotSpeed, dmg);
        e.aimAng = aim; e.ang = aim;
        api.ev(S, { k:'surface', x:e.x, y:e.y, id:e.id, type:e.type, n:a.ringN });
      }
    } else if (e.st === 'act') {
      e.exposedT -= dt;
      var up = a.exposed - e.exposedT;
      e.surf01 = Math.max(0, Math.min(1, up / a.riseT, e.exposedT / a.sinkT));
      e.ang = api.angleTo(e, h);
      if (e.exposedT <= 1e-9) { goUnder(S, e, api, false); api.ev(S, { k:'burrow', x:e.x, y:e.y, id:e.id, type:e.type }); }
    } else if (e.st !== 'spawn') goUnder(S, e, api, false);
  }
};
})();
