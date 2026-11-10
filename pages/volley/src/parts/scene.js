(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Scene: state S + view -> flat draw list (CSS px). Look G2: sand ground, thin dark outlines, hard low-sun shadow.

function C(r, g, b, a) { return [r / 255, g / 255, b / 255, a == null ? 1 : a]; }
var PAL = {
  ground: C(214, 190, 146), groundDot: C(186, 160, 116), groundDot2: C(228, 208, 168),
  floor: C(226, 209, 172), seam: C(196, 176, 138, 0.55),
  shadow: C(92, 64, 30, 0.30),
  ink: C(34, 30, 26), inkSoft: C(34, 30, 26, 0.85),
  wall: C(196, 188, 170), wallTop: C(218, 211, 194), wallSeam: C(150, 142, 126),
  pillar: C(184, 176, 158), pillarTop: C(206, 199, 182),
  crate: C(92, 104, 62), crateLid: C(112, 126, 76), crateBand: C(64, 72, 44),
  doorShut: C(70, 74, 80), doorOpen: C(40, 36, 30), doorLightShut: C(255, 60, 50), doorLightOpen: C(90, 240, 140),
  metal: C(62, 66, 74), metalLite: C(92, 98, 108), metalDark: C(36, 39, 45),
  sensor: C(255, 48, 48), sensorCore: C(255, 200, 190),
  heroBody: C(118, 126, 84), heroDark: C(70, 76, 50), cyan: C(64, 228, 255), cyanSoft: C(64, 228, 255, 0.35),
  amber: C(255, 176, 32),
  round: C(110, 238, 255), roundCore: C(235, 255, 255), roundTrail: C(64, 228, 255, 0.45),
  shot: C(255, 46, 140), shotCore: C(255, 220, 240), shotRim: C(110, 10, 50),
  tellYellow: C(255, 222, 40), aim: C(255, 40, 40, 0.75), aimLock: C(255, 60, 60, 1),
  glow: C(255, 120, 40), fan: C(255, 60, 40, 0.22), fanEdge: C(255, 50, 40, 0.75),
  hpBack: C(30, 26, 22, 0.85), hpFill: C(255, 70, 60), hpPip: C(30, 26, 22),
  xp: C(150, 235, 90), xpRim: C(40, 80, 20), repair: C(245, 245, 235), repairCross: C(60, 170, 80),
  white: C(255, 255, 255), spark: C(255, 214, 120), sparkHot: C(255, 250, 220), debris: C(52, 54, 58),
  hurt: C(255, 60, 60)
};
var TAU = Math.PI * 2;

// own seeded RNG (mulberry32), never touches the sim's Rng
function mkRng(seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var P = { list: [], rnd: mkRng(1), seed: null, lastFrame: -1, lastT: 0, ingested: false }; // particles (world units)
var MAXP = 400;

function spawnBurst(x, y, n, spd, life, col, size, drag) {
  for (var i = 0; i < n && P.list.length < MAXP; i++) {
    var a = P.rnd() * TAU, v = spd * (0.4 + P.rnd() * 0.8);
    P.list.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: life * (0.6 + P.rnd() * 0.6), c: col, sz: size, drag: drag || 4, k: 0 });
  }
}
function spawnRing(x, y, r0, r1, life, col) {
  if (P.list.length < MAXP) P.list.push({ x: x, y: y, t: 0, life: life, c: col, r0: r0, r1: r1, k: 1 });
}

function eatEvents(ev, S) {
  ev = ev || [];
  for (var i = 0; i < ev.length; i++) {
    var e = ev[i], x = e.x, y = e.y;
    if (x == null || y == null) { x = S.hero.x; y = S.hero.y; }
    switch (e.k) {
      case 'hit': spawnBurst(x, y, 5, 4, 0.22, PAL.spark, 0.06); break;
      case 'crit': spawnBurst(x, y, 9, 6, 0.3, PAL.sparkHot, 0.08); spawnRing(x, y, 0.1, 0.6, 0.2, PAL.amber); break;
      case 'kill':
        spawnBurst(x, y, 12, 6, 0.4, PAL.spark, 0.08); spawnBurst(x, y, 6, 3, 0.6, PAL.debris, 0.1, 3);
        spawnRing(x, y, 0.2, 1.0, 0.3, PAL.sparkHot); break;
      case 'hurt': spawnBurst(x, y, 8, 4, 0.3, PAL.hurt, 0.07); break;
      case 'pickup': spawnRing(x, y, 0.1, 0.5, 0.25, PAL.xp); break;
      case 'levelup': spawnRing(x, y, 0.3, 1.8, 0.5, PAL.cyan); spawnBurst(x, y, 10, 4, 0.5, PAL.cyan, 0.06); break;
      case 'death': spawnBurst(x, y, 24, 7, 0.8, PAL.hurt, 0.1); spawnRing(x, y, 0.3, 2.2, 0.6, PAL.hurt); break;
      case 'fire': spawnBurst(x, y, 2, 2, 0.1, PAL.roundCore, 0.05, 8); break;
    }
  }
}

function stepParticles(dt) {
  var L = P.list, j = 0;
  for (var i = 0; i < L.length; i++) {
    var p = L[i]; p.t += dt;
    if (p.t >= p.life) continue;
    if (p.k === 0) { var f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; p.x += p.vx * dt; p.y += p.vy * dt; }
    L[j++] = p;
  }
  L.length = j;
}

// --- primitive helpers (all take world coords via the view) ---
var out, vw, sh = { x: 0, y: 0 };
function X(x) { return vw.ox + x * vw.s; }
function Y(y) { return vw.oy + y * vw.s; }
function circ(x, y, r, c) { out.push({ p: 'circle', x: x, y: y, r: r, c: c }); }
function ring(x, y, r, lw, c, a0, a1) { var o = { p: 'ring', x: x, y: y, r: r, lw: lw, c: c }; if (a0 != null) { o.a0 = a0; o.a1 = a1; } out.push(o); }
function rect(x, y, w, h, c, rot) { out.push({ p: 'rect', x: x, y: y, w: w, h: h, rot: rot || 0, c: c }); }
function line(x1, y1, x2, y2, lw, c) { out.push({ p: 'line', x1: x1, y1: y1, x2: x2, y2: y2, lw: lw, c: c }); }
function ngon(x, y, r, n, rot, c) { out.push({ p: 'ngon', x: x, y: y, r: r, n: n, rot: rot || 0, c: c }); }
function withA(c, a) { return [c[0], c[1], c[2], c[3] * a]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; }
// outlined shapes: dark shape 1 px larger, then the fill
var OL = 1.25;
function oCirc(x, y, r, c) { circ(x, y, r + OL, PAL.ink); circ(x, y, r, c); }
function oRect(x, y, w, h, c, rot) { rect(x, y, w + 2 * OL, h + 2 * OL, PAL.ink, rot); rect(x, y, w, h, c, rot); }
function oNgon(x, y, r, n, rot, c) { ngon(x, y, r + OL / Math.cos(Math.PI / n), n, rot, PAL.ink); ngon(x, y, r, n, rot, c); }

// raycast in world units against solids and room bounds (for the aim line)
function rayLen(S, x, y, ang, max) {
  var dx = Math.cos(ang), dy = Math.sin(ang), sol = S.room.solids || [], W = S.room.w || 9, H = S.room.h || 15;
  for (var d = 0.3; d < max; d += 0.08) {
    var px = x + dx * d, py = y + dy * d;
    if (px < 0 || py < 0 || px > W || py > H) return d;
    for (var i = 0; i < sol.length; i++) { var q = sol[i]; if (px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h) return d; }
  }
  return max;
}

var deco = null, decoKey = '';
function groundDeco(S) {
  var key = (S.seed | 0) + ':' + vw.w + 'x' + vw.h + ':' + vw.s.toFixed(2);
  if (key === decoKey) return deco;
  decoKey = key; deco = [];
  var r = mkRng((S.seed | 0) * 7919 + 13), n = Math.round(vw.w * vw.h / 1400);
  for (var i = 0; i < n; i++) deco.push({ x: r() * vw.w, y: r() * vw.h, r: 0.8 + r() * 1.8, light: r() < 0.35, streak: r() < 0.12, a: r() * Math.PI });
  return deco;
}

function drawSolidShadow(q, s) {
  rect(X(q.x + q.w / 2) + sh.x, Y(q.y + q.h / 2) + sh.y, q.w * s, q.h * s, PAL.shadow);
}
function drawSolid(q, s) {
  var cx = X(q.x + q.w / 2), cy = Y(q.y + q.h / 2), w = q.w * s, h = q.h * s;
  if (q.kind === 'block') {
    oRect(cx, cy, w - 2, h - 2, PAL.crate);
    rect(cx, cy, w - 7, h - 7, PAL.crateLid);
    // crate bands
    var nx = Math.max(1, Math.round(q.w)), ny = Math.max(1, Math.round(q.h));
    for (var i = 1; i < nx; i++) rect(X(q.x + i), cy, 2, h - 2, PAL.crateBand);
    for (var j = 1; j < ny; j++) rect(cx, Y(q.y + j), w - 2, 2, PAL.crateBand);
    rect(cx + w * 0.28, cy + h * 0.32, Math.min(10, w * 0.2), 3, PAL.wallTop);
  } else if (q.kind === 'pillar') {
    oRect(cx, cy, w - 2, h - 2, PAL.pillar);
    rect(cx - 1, cy - 1, w - 8, h - 8, PAL.pillarTop);
    line(cx - w * 0.3, cy, cx + w * 0.3, cy, 1, PAL.wallSeam);
  } else {
    oRect(cx, cy, w, h, PAL.wall);
    rect(cx - 1, cy - 1, w - 4, h - 4, PAL.wallTop);
  }
}

function drawDoor(S, s) {
  var d = S.room.door; if (!d) return;
  var cx = X(d.x + d.w / 2), cy = Y(d.y + d.h / 2), w = d.w * s, h = d.h * s;
  if (d.open) {
    rect(cx, cy, w, h, PAL.doorOpen);
    rect(cx, cy + h * 0.25, w - 4, h * 0.5, C(70, 60, 44));
    // chevrons pointing north
    for (var k = 0; k < 2; k++) {
      var yy = cy + h * 0.15 - k * 6;
      line(cx - 6, yy + 4, cx, yy - 2, 2, PAL.doorLightOpen); line(cx, yy - 2, cx + 6, yy + 4, 2, PAL.doorLightOpen);
    }
    circ(cx - w / 2 + 4, cy, 2.5, PAL.doorLightOpen); circ(cx + w / 2 - 4, cy, 2.5, PAL.doorLightOpen);
  } else {
    oRect(cx, cy, w, h, PAL.doorShut);
    var n = Math.max(2, Math.round(d.w * 3));
    for (var i = 1; i < n; i++) rect(cx - w / 2 + (w * i) / n, cy, 1.5, h - 4, PAL.metalDark);
    rect(cx, cy, w, 2, PAL.metalDark);
    circ(cx - w * 0.3, cy, 2.5, PAL.doorLightShut); circ(cx + w * 0.3, cy, 2.5, PAL.doorLightShut);
  }
}

function hpBar(x, y, rr, hp, max) {
  if (!(max > 0) || hp >= max) return;
  var w = Math.max(18, rr * 2.2), h = 4, by = y - rr - 7, f = Math.max(0, Math.min(1, hp / max));
  rect(x, by, w + 2, h + 2, PAL.hpBack);
  rect(x - w / 2 + (w * f) / 2, by, w * f, h, PAL.hpFill);
  var pips = Math.min(8, Math.max(2, Math.round(max / 150)));
  for (var i = 1; i < pips; i++) rect(x - w / 2 + (w * i) / pips, by, 1, h, PAL.hpPip);
}

function drawEnemy(S, e, s, t) {
  var x = X(e.x), y = Y(e.y), rr = (e.r || 0.4) * s, flash = e.flashT > 0, tell = e.st === 'tell';
  var body = PAL.metal, lite = PAL.metalLite, dark = PAL.metalDark, eye = PAL.sensor;
  if (e.st === 'spawn') { var k = Math.min(1, e.tell01 || 0.5); body = withA(body, 0.5); lite = withA(lite, 0.5); }
  if (e.type === 'E-01' && tell) {
    // yellow flash: whole body pulses toward yellow, faster as the lunge nears
    var tt = e.tell01 || 0, pulse = 0.5 + 0.5 * Math.sin(t * (18 + 30 * tt));
    var m = 0.45 + 0.55 * pulse;
    body = mix(body, PAL.tellYellow, m); lite = mix(lite, PAL.tellYellow, m);
  }
  if (flash) { body = PAL.white; lite = PAL.white; dark = PAL.white; eye = PAL.white; }
  var a = e.ang || 0, ca = Math.cos(a), sa = Math.sin(a);
  if (e.type === 'E-01') {
    // small round drone with rotor ring and four rotor pods
    for (var i = 0; i < 4; i++) {
      var ra = a + Math.PI / 4 + (i * Math.PI) / 2, px = x + Math.cos(ra) * rr * 0.92, py = y + Math.sin(ra) * rr * 0.92;
      line(x, y, px, py, 3, flash ? PAL.white : PAL.ink);
      oCirc(px, py, rr * 0.36, dark);
      ring(px, py, rr * 0.28, 1.2, flash ? PAL.white : lite);
    }
    oCirc(x, y, rr * 0.55, body);
    circ(x + ca * rr * 0.15, y + sa * rr * 0.15, rr * 0.22, eye);
    circ(x + ca * rr * 0.18, y + sa * rr * 0.18, rr * 0.08, flash ? PAL.white : PAL.sensorCore);
    if (tell) ring(x, y, rr * (1.25 + 0.25 * (e.tell01 || 0)), 2.5, PAL.tellYellow);
  } else if (e.type === 'E-02') {
    // square gun drone, one barrel along aimAng while aiming
    var ga = (tell || e.st === 'act') && e.aimAng != null ? e.aimAng : a, cg = Math.cos(ga), sg = Math.sin(ga);
    var bl = rr * 1.25;
    oRect(x + cg * bl * 0.55, y + sg * bl * 0.55, bl, rr * 0.3, dark, ga);
    oRect(x, y, rr * 1.5, rr * 1.5, body, a);
    rect(x, y, rr * 0.9, rr * 0.9, lite, a);
    circ(x, y, rr * 0.3, eye);
    circ(x, y, rr * 0.11, flash ? PAL.white : PAL.sensorCore);
  } else {
    // E-03 hexagon turret, three barrels in a fan
    var ta = e.aimAng != null ? e.aimAng : a, glow = tell ? (e.tell01 || 0) : 0;
    for (var b = -1; b <= 1; b++) {
      var ba = ta + b * (25 * Math.PI / 180), cb = Math.cos(ba), sb = Math.sin(ba);
      oRect(x + cb * rr * 0.95, y + sb * rr * 0.95, rr * 0.9, rr * 0.26, dark, ba);
      if (glow > 0) {
        var gx = x + cb * rr * 1.42, gy = y + sb * rr * 1.42;
        circ(gx, gy, 3 + 6 * glow, withA(PAL.glow, 0.35 + 0.3 * glow));
        circ(gx, gy, 2 + 3 * glow, mix(PAL.glow, PAL.sparkHot, glow));
      }
    }
    oNgon(x, y, rr, 6, Math.PI / 6, body);
    ngon(x, y, rr * 0.62, 6, Math.PI / 6, lite);
    circ(x, y, rr * 0.3, glow > 0 ? mix(eye, PAL.sparkHot, glow) : eye);
    circ(x, y, rr * 0.12, flash ? PAL.white : PAL.sensorCore);
  }
  hpBar(x, y, rr * (e.type === 'E-01' ? 1.3 : 1.05), e.hp, e.maxHp);
}

function drawEnemyTellGround(S, e, s) {
  if (e.type !== 'E-03' || e.st !== 'tell') return;
  var x = X(e.x), y = Y(e.y), R = 5.0 * s, ta = e.aimAng != null ? e.aimAng : e.ang || 0, t = e.tell01 || 0;
  var half = 25 * Math.PI / 180 + 0.12;
  // wedge = thick arc; fill grows outward with the tell
  ring(x, y, R / 2, R, withA(PAL.fan, 0.6 + 0.6 * t), ta - half, ta + half);
  ring(x, y, (R * t) / 2, R * t, withA(PAL.fan, 0.9), ta - half, ta + half);
  for (var b = -1; b <= 1; b++) {
    var ba = ta + b * (25 * Math.PI / 180);
    line(x, y, x + Math.cos(ba) * R, y + Math.sin(ba) * R, 1.5, PAL.fanEdge);
  }
}

function drawEnemyAim(S, e, s) {
  if (e.type !== 'E-02' || e.st !== 'tell' || e.aimAng == null) return;
  var t = e.tell01 || 0, locked = t > 0.66, L = rayLen(S, e.x, e.y, e.aimAng, 20);
  var x = X(e.x), y = Y(e.y), ex = X(e.x + Math.cos(e.aimAng) * L), ey = Y(e.y + Math.sin(e.aimAng) * L);
  line(x, y, ex, ey, locked ? 2.2 : 1.2, locked ? PAL.aimLock : PAL.aim);
  if (locked) circ(ex, ey, 2.5, PAL.aimLock);
}

function drawHero(S, s, t) {
  var h = S.hero, x = X(h.x), y = Y(h.y), rr = (h.r || 0.28) * s;
  if (h.invulnT > 0 && Math.floor(t * 12) % 2 === 1) return; // blink
  var a = h.ang || 0, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
  // rifle
  oRect(x + ca * rr * 1.15 + px * rr * 0.35, y + sa * rr * 1.15 + py * rr * 0.35, rr * 1.5, rr * 0.32, PAL.metalDark, a);
  circ(x + ca * rr * 1.85 + px * rr * 0.35, y + sa * rr * 1.85 + py * rr * 0.35, rr * 0.13, PAL.cyan);
  // pack, body, helmet
  oRect(x - ca * rr * 0.55, y - sa * rr * 0.55, rr * 0.7, rr * 1.4, PAL.heroDark, a);
  oCirc(x, y, rr, PAL.heroBody);
  ring(x, y, rr * 0.82, 1.6, PAL.cyan);
  circ(x - ca * rr * 0.1, y - sa * rr * 0.1, rr * 0.5, PAL.heroDark);
  rect(x + ca * rr * 0.32, y + sa * rr * 0.32, rr * 0.22, rr * 0.75, PAL.cyan, a); // visor
}

function drawBrace(S, s) {
  var h = S.hero, x = X(h.x), y = Y(h.y), R = (h.r || 0.28) * s + 7;
  if (h.moving || S.phase === 'dead') return;
  var b = h.braced ? 1 : Math.max(0, Math.min(1, h.brace01 || 0));
  if (b <= 0) return;
  ring(x, y, R, 1, PAL.cyanSoft);
  if (b >= 1) { ring(x, y, R, 2, PAL.cyan); return; }
  ring(x, y, R, 2.5, PAL.cyan, -Math.PI / 2, -Math.PI / 2 + TAU * b);
}

function drawLock(S, s, t) {
  var h = S.hero; if (h.lockId == null) return;
  var e = null; for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].id === h.lockId) { e = S.enemies[i]; break; }
  if (!e) return;
  var x = X(e.x), y = Y(e.y), R = (e.r || 0.4) * s * (e.type === 'E-01' ? 1.35 : 1.25) + 5, c = h.lockClear ? PAL.cyan : PAL.amber;
  var rot = t * 1.5, seg = 0.55;
  for (var k = 0; k < 4; k++) {
    var m = rot + (k * Math.PI) / 2;
    ring(x, y, R + 1, 4.5, PAL.ink, m - seg / 2 - 0.06, m + seg / 2 + 0.06);
    ring(x, y, R + 1, 2.5, c, m - seg / 2, m + seg / 2);
  }
}

function drawPickup(pk, s, t) {
  var x = X(pk.x), y = Y(pk.y) + Math.sin(t * 4 + pk.x * 3) * 1.5;
  if (pk.kind === 'repair') {
    oRect(x, y, 13, 11, PAL.repair);
    rect(x, y, 3, 7, PAL.repairCross); rect(x, y, 7, 3, PAL.repairCross);
  } else {
    var r = pk.v >= 8 ? 6.5 : 5;
    oNgon(x, y, r, 4, t * 2 + pk.y, PAL.xp);
    circ(x - 1, y - 1, r * 0.3, PAL.white);
  }
}

function drawParticles(s) {
  for (var i = 0; i < P.list.length; i++) {
    var p = P.list[i], u = p.t / p.life, al = 1 - u;
    if (p.k === 1) {
      var r = (p.r0 + (p.r1 - p.r0) * u) * s;
      ring(X(p.x), Y(p.y), r, 2.5 * al + 0.5, withA(p.c, al));
    } else {
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy), sz = Math.max(1.2, p.sz * s * (1 - u * 0.5));
      if (sp > 1.5) {
        var k = Math.min(0.05, 0.6 / sp);
        line(X(p.x - p.vx * k), Y(p.y - p.vy * k), X(p.x), Y(p.y), sz, withA(p.c, al));
      } else circ(X(p.x), Y(p.y), sz * 0.6, withA(p.c, al));
    }
  }
}

function drawStress(n, t) {
  var W = vw.w, H = vw.h, cols = [PAL.cyan, PAL.shot, PAL.xp, PAL.amber, PAL.metal];
  for (var i = 0; i < n; i++) {
    var fx = ((i * 0.6180339887) % 1), fy = ((i * 0.7548776662) % 1), ph = i * 1.37;
    var x = (fx * W + Math.sin(t * 0.9 + ph) * 30 + W) % W, y = (fy * H + t * (20 + (i % 7) * 9)) % H;
    var c = withA(cols[i % 5], 0.8), k = i % 5, r = 3 + (i % 4);
    if (k === 0) circ(x, y, r, c);
    else if (k === 1) ring(x, y, r + 2, 1.5, c, t + ph, t + ph + 3.5);
    else if (k === 2) rect(x, y, r * 2, r, c, t + ph);
    else if (k === 3) line(x - r, y, x + r, y + r, 1.5, c);
    else ngon(x, y, r + 1, 3 + (i % 4), t + ph, c);
  }
}

function resetIfNew(S) {
  var t = S.t || 0;
  if (P.seed !== S.seed || t < P.lastT) { P.list.length = 0; P.rnd = mkRng(((S.seed | 0) ^ 0x5eed) + 1); P.seed = S.seed; P.lastFrame = -1; P.lastT = t; }
}

V.Scene = {
  stress: 0,
  // main.js calls this after EVERY sim step; once used, build() stops reading S.events itself (no doubles)
  ingest: function (events, S) {
    if (!S) return;
    P.ingested = true;
    resetIfNew(S);
    eatEvents(events, S);
  },
  PAL: PAL,
  particles: P.list,
  build: function (S, view, outArr) {
    out = outArr; vw = view; out.length = 0;
    var s = view.s, t = S.t || 0;
    // particle bookkeeping (own clock = S.t, so hit-stop and pause freeze sparks too)
    resetIfNew(S);
    var dt = Math.max(0, Math.min(0.1, t - P.lastT)); P.lastT = t;
    if (S.frame !== P.lastFrame) { P.lastFrame = S.frame; stepParticles(dt); if (!P.ingested) eatEvents(S.events, S); }
    sh.x = Math.max(2, s * 0.14); sh.y = Math.max(3, s * 0.2);

    // ground: whole screen, continues below the room
    rect(view.w / 2, view.h / 2, view.w + 2, view.h + 2, PAL.ground);
    var dc = groundDeco(S);
    for (var i = 0; i < dc.length; i++) {
      var d = dc[i];
      if (d.streak) line(d.x - 6 * Math.cos(d.a), d.y - 2, d.x + 6 * Math.cos(d.a), d.y + 2, 1, PAL.groundDot);
      else circ(d.x, d.y, d.r, d.light ? PAL.groundDot2 : PAL.groundDot);
    }
    var R = S.room, RW = (R && R.w) || 9, RH = (R && R.h) || 15;
    rect(X(RW / 2), Y(RH / 2), RW * s, RH * s, PAL.floor);
    // floor seams every 3 tiles, faint
    for (var gx = 3; gx < RW; gx += 3) line(X(gx), Y(0), X(gx), Y(RH), 1, PAL.seam);
    for (var gy = 3; gy < RH; gy += 3) line(X(0), Y(gy), X(RW), Y(gy), 1, PAL.seam);

    var E = S.enemies || [], sol = (R && R.solids) || [];
    for (i = 0; i < E.length; i++) drawEnemyTellGround(S, E[i], s);

    // shadows (hard, low sun from the upper left)
    for (i = 0; i < sol.length; i++) drawSolidShadow(sol[i], s);
    var pk = S.pickups || [];
    for (i = 0; i < pk.length; i++) circ(X(pk[i].x) + sh.x * 0.4, Y(pk[i].y) + sh.y * 0.4, 4, PAL.shadow);
    for (i = 0; i < E.length; i++) {
      var e = E[i], er = (e.r || 0.4) * s, fly = e.type === 'E-01' ? 1.6 : 1;
      if (e.type === 'E-02') rect(X(e.x) + sh.x * fly, Y(e.y) + sh.y * fly, er * 1.5, er * 1.5, PAL.shadow, e.ang || 0);
      else if (e.type === 'E-03') ngon(X(e.x) + sh.x, Y(e.y) + sh.y, er, 6, Math.PI / 6, PAL.shadow);
      else circ(X(e.x) + sh.x * fly, Y(e.y) + sh.y * fly, er * 0.9, PAL.shadow);
    }
    var H = S.hero;
    if (H && S.phase !== 'dead') circ(X(H.x) + sh.x * 0.7, Y(H.y) + sh.y * 0.7, (H.r || 0.28) * s, PAL.shadow);

    for (i = 0; i < sol.length; i++) drawSolid(sol[i], s);
    drawDoor(S, s);
    for (i = 0; i < pk.length; i++) drawPickup(pk[i], s, t);
    for (i = 0; i < E.length; i++) drawEnemyAim(S, E[i], s);
    for (i = 0; i < E.length; i++) drawEnemy(S, E[i], s, t);
    if (H && S.phase !== 'dead') { drawBrace(S, s); drawHero(S, s, t); }

    var rd = S.rounds || [];
    for (i = 0; i < rd.length; i++) {
      var q = rd[i], rr = Math.max(2.5, (q.r || 0.12) * s), sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy) || 1;
      var tl = 0.45 / sp * 1;
      line(X(q.x - q.vx * tl * 0.5), Y(q.y - q.vy * tl * 0.5), X(q.x), Y(q.y), rr * 1.4, PAL.roundTrail);
      circ(X(q.x), Y(q.y), rr, PAL.round); circ(X(q.x), Y(q.y), rr * 0.5, PAL.roundCore);
    }
    var sv = S.shots || [];
    for (i = 0; i < sv.length; i++) {
      var o = sv[i], r2 = Math.max(4, (o.r || 0.12) * 2 * s);
      circ(X(o.x), Y(o.y), r2 + 2.5, withA(PAL.shot, 0.28));
      circ(X(o.x), Y(o.y), r2 + 1, PAL.shotRim);
      circ(X(o.x), Y(o.y), r2, PAL.shot); circ(X(o.x), Y(o.y), r2 * 0.45, PAL.shotCore);
    }
    drawLock(S, s, t);
    drawParticles(s);
    if (V.Scene.stress > 0) drawStress(V.Scene.stress | 0, t);
    return out;
  }
};
})();
