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
  hurt: C(255, 60, 60),
  spikePlate: C(96, 90, 80), spike: C(170, 166, 158), spikeTip: C(235, 232, 225),
  shellBody: C(48, 50, 56), ringFill: C(255, 60, 40, 0.16), ringEdge: C(255, 50, 40, 0.9),
  lane: C(255, 40, 40, 0.28), laneEdge: C(255, 40, 40, 0.9), stun: C(255, 222, 40),
  boss2: C(96, 40, 36), boss2Vent: C(255, 110, 40), floorLine: C(255, 50, 40, 0.5),
  chest: C(120, 84, 44), chestLid: C(150, 108, 58), chestTrim: C(230, 190, 70),
  burn: C(255, 140, 30), poison: C(120, 230, 60), freeze: C(190, 240, 255), pierce: C(255, 255, 255),
  heroHp: C(95, 208, 106), heroHpLow: C(255, 80, 60), heal: C(95, 208, 106), shield: C(64, 228, 255, 0.55)
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
      case 'land': spawnRing(x, y, 0.2, (e.r || 1) * 1.1, 0.35, PAL.glow); spawnBurst(x, y, 10, 5, 0.45, PAL.debris, 0.1, 3); spawnBurst(x, y, 6, 4, 0.3, PAL.spark, 0.07); break;
      case 'dodge': spawnRing(x, y, 0.3, 0.8, 0.3, PAL.white); break;
      case 'bossphase': spawnRing(x, y, 0.5, 3.0, 0.7, PAL.boss2Vent); spawnBurst(x, y, 20, 6, 0.6, PAL.boss2Vent, 0.09); break;
      case 'chest': spawnRing(x, y, 0.2, 1.4, 0.5, PAL.chestTrim); spawnBurst(x, y, 14, 5, 0.5, PAL.cyan, 0.07); break;
      case 'win': spawnRing(x, y, 0.5, 4.0, 1.0, PAL.cyan); break;
      case 'fire': spawnBurst(x, y, 2, 2, 0.1, PAL.roundCore, 0.05, 8); break;
    }
  }
}

function eatFx(fx) {
  if (!fx) return;
  for (var i = 0; i < fx.length; i++) {
    var f = fx[i];
    switch (f.k) {
      case 'arc': if (P.list.length < MAXP) P.list.push({ k: 2, x: f.x1 != null ? f.x1 : f.x, y: f.y1 != null ? f.y1 : f.y, x2: f.x2 != null ? f.x2 : f.x, y2: f.y2 != null ? f.y2 : f.y, t: 0, life: 0.15, c: PAL.freeze }); break;
      case 'strike': case 'blast': spawnRing(f.x, f.y, 0.1, f.r || 1.2, 0.3, PAL.burn); spawnBurst(f.x, f.y, 8, 5, 0.3, PAL.sparkHot, 0.07); break;
      case 'heal': spawnRing(f.x, f.y, 0.2, 0.8, 0.35, PAL.heal); break;
      case 'dodge': spawnRing(f.x, f.y, 0.3, 0.7, 0.25, PAL.white); break;
      case 'orb': case 'shield': break; // persistent, drawn from S.fx each frame
      default: if (f.x != null) spawnRing(f.x, f.y, 0.1, 0.5, 0.2, PAL.cyan);
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
  var C2 = { body: body, lite: lite, dark: dark, eye: eye, core: flash ? PAL.white : PAL.sensorCore };
  if (e.type === 'E-04') drawE04(e, x, y, rr, t, C2);
  else if (e.type === 'E-05') drawE05(e, x, y, rr, t, C2);
  else if (e.boss || e.type === 'B-01') drawB01(S, e, x, y, rr, t, C2);
  else if (e.type === 'E-01') {
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
  } else if (e.type === 'E-03') {
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
  drawStatus(e, x, y, rr, t);
  if (!e.boss) hpBar(x, y, rr * (e.type === 'E-01' ? 1.3 : 1.05), e.hp, e.maxHp);
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
  var blink = h.invulnT > 0 && Math.floor(t * 12) % 2 === 1, n0 = out.length; // blink to 35%, never hidden (M 2026-11-10)
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
  if (blink) for (var i = n0; i < out.length; i++) { var c = out[i].c; out[i].c = [c[0], c[1], c[2], c[3] * 0.35]; }
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
    if (p.k === 2) { line(X(p.x), Y(p.y), X(p.x2), Y(p.y2), 2, withA(p.c, al)); continue; }
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

// ---------- P1 ----------
function drawHazards(S, s, t) {
  var hz = S.hazards || [];
  for (var i = 0; i < hz.length; i++) {
    var q = hz[i], cx = X(q.x + q.w / 2), cy = Y(q.y + q.h / 2);
    rect(cx, cy, q.w * s - 2, q.h * s - 2, PAL.spikePlate);
    var nx = Math.max(1, Math.round(q.w * 2)), ny = Math.max(1, Math.round(q.h * 2)), up = q.on == null || q.on;
    for (var a = 0; a < nx; a++) for (var b = 0; b < ny; b++) {
      var px = X(q.x + (a + 0.5) * q.w / nx), py = Y(q.y + (b + 0.5) * q.h / ny), r = s * 0.17;
      if (up) { ngon(px + 1.5, py + 2, r, 3, -Math.PI / 2, PAL.shadow); ngon(px, py, r + 1, 3, -Math.PI / 2, PAL.ink); ngon(px, py, r, 3, -Math.PI / 2, PAL.spike); circ(px, py - r * 0.6, 1.2, PAL.spikeTip); }
      else circ(px, py, 2, PAL.ink);
    }
  }
}

function shellGround(sh0) {
  var u = sh0.T > 0 ? Math.max(0, Math.min(1, sh0.t / sh0.T)) : 1;
  if (sh0.moving || sh0.sx != null) return { x: sh0.x, y: sh0.y, u: u };
  var x0 = sh0.x0 != null ? sh0.x0 : sh0.x, y0 = sh0.y0 != null ? sh0.y0 : sh0.y;
  return { x: x0 + (sh0.tx - x0) * u, y: y0 + (sh0.ty - y0) * u, u: u };
}
function drawShellRings(S, s, t) {
  var L = S.shells || [];
  for (var i = 0; i < L.length; i++) {
    var q = L[i], u = shellGround(q).u, R = (q.r || 1.0) * s, x = X(q.tx), y = Y(q.ty);
    circ(x, y, R, PAL.ringFill);
    circ(x, y, R * u, withA(PAL.ringFill, 1.6));
    ring(x, y, R - 1, 2 + (u > 0.75 ? 1.5 * Math.abs(Math.sin(t * 20)) : 0), PAL.ringEdge);
    line(x - 5, y, x + 5, y, 1.5, PAL.ringEdge); line(x, y - 5, x, y + 5, 1.5, PAL.ringEdge);
  }
}
function drawShells(S, s) {
  var L = S.shells || [];
  for (var i = 0; i < L.length; i++) {
    var q = L[i], g = shellGround(q), hgt = Math.sin(Math.PI * g.u) * 2.2 * s, x = X(g.x), y = Y(g.y);
    circ(x + sh.x * (1 + hgt / s), y + sh.y * (1 + hgt / s) * 0.5, 4, PAL.shadow);
    circ(x, y - hgt, 6.5, PAL.ink); circ(x, y - hgt, 5, PAL.shellBody); circ(x - 1.5, y - hgt - 1.5, 1.8, PAL.sensor);
  }
}

function drawLaneTell(S, e, s) {
  if (e.type !== 'E-05' || e.st !== 'tell') return;
  var a = e.aimAng != null ? e.aimAng : e.ang || 0, L = Math.min(e.lane || 8, rayLen(S, e.x, e.y, a, e.lane || 8));
  var locked = e.locked || (e.tell01 || 0) >= 0.75, w = (e.r || 0.5) * 2 * s;
  var x = X(e.x), y = Y(e.y), ex = X(e.x + Math.cos(a) * L), ey = Y(e.y + Math.sin(a) * L);
  var mx = (x + ex) / 2, my = (y + ey) / 2, len = Math.hypot(ex - x, ey - y);
  rect(mx, my, len, w, withA(PAL.lane, locked ? 1.5 : 0.8), a);
  var px = -Math.sin(a) * w / 2, py = Math.cos(a) * w / 2;
  line(x + px, y + py, ex + px, ey + py, locked ? 2 : 1, PAL.laneEdge); line(x - px, y - py, ex - px, ey - py, locked ? 2 : 1, PAL.laneEdge);
  if (locked) rect(ex, ey, 4, w, PAL.laneEdge, a);
}

function bossAttack(S, e) { return S.boss && S.boss.id === e.id ? S.boss : (e.boss ? { attack: e.attack, tell01: e.tell01, phase: e.phase } : null); }
function drawBossGround(S, e, s, t) {
  if (!e.boss) return;
  var B = bossAttack(S, e); if (!B || !B.attack || e.st === 'act') return;
  var tt = B.tell01 != null ? B.tell01 : (e.tell01 || 0), a0 = e.aimAng != null ? e.aimAng : Math.PI / 2;
  if (B.attack === 'A') {
    var lines = e.lines, n = (B.phase === 2 ? 7 : 5);
    if (!lines || !lines.length) { lines = []; for (var k = 0; k < n; k++) lines.push({ ang: a0 + (k / (n - 1) - 0.5) * (140 * Math.PI / 180) }); }
    for (var j = 0; j < lines.length; j++) {
      var q = lines[j], x1, y1, x2, y2;
      if (q.x2 == null) { var Lr = rayLen(S, e.x, e.y, q.ang, 20); x1 = e.x; y1 = e.y; x2 = e.x + Math.cos(q.ang) * Lr; y2 = e.y + Math.sin(q.ang) * Lr; }
      else { x1 = q.x1; y1 = q.y1; x2 = q.x2; y2 = q.y2; }
      line(X(x1), Y(y1), X(x2), Y(y2), 0.3 * s * (0.4 + 0.6 * tt), withA(PAL.floorLine, 0.6 + 0.8 * tt));
      line(X(x1), Y(y1), X(x2), Y(y2), 1.5, PAL.laneEdge);
    }
  } else if (B.attack === 'C') {
    for (var b = -1; b <= 1; b++) {
      var ba = a0 + b * (25 * Math.PI / 180), R = 4 * s;
      line(X(e.x), Y(e.y), X(e.x) + Math.cos(ba) * R, Y(e.y) + Math.sin(ba) * R, 1.5, PAL.fanEdge);
    }
    var segs = e.segs;
    if (!segs || !segs.length) { var Lc = rayLen(S, e.x, e.y, a0, 20); segs = [{ x1: e.x, y1: e.y, x2: e.x + Math.cos(a0) * Lc, y2: e.y + Math.sin(a0) * Lc }]; }
    for (var m = 0; m < segs.length; m++) {
      var g = segs[m];
      line(X(g.x1), Y(g.y1), X(g.x2), Y(g.y2), 2.5 + 2 * tt, withA(PAL.aimLock, 0.5 + 0.5 * tt));
      circ(X(g.x2), Y(g.y2), 3.5, PAL.aimLock);
    }
  }
}

function drawStatus(e, x, y, rr, t) {
  if (e.frozenT > 0) { ring(x, y, rr * 1.05, 3, withA(PAL.freeze, 0.9)); circ(x, y, rr * 0.9, withA(PAL.freeze, 0.35)); }
  var k = 0;
  if (e.burnT > 0 || e.burn) { for (k = 0; k < 3; k++) { var u = (t * 2 + k / 3) % 1; circ(x + (k - 1) * rr * 0.45, y - rr * 0.3 - u * rr * 0.9, 3 * (1 - u) + 1, withA(PAL.burn, 1 - u)); } }
  if (e.poisonT > 0 || e.poison) { for (k = 0; k < 2; k++) { var v = (t * 1.3 + k / 2) % 1; circ(x + (k ? 1 : -1) * rr * 0.55, y + rr * 0.2 - v * rr * 0.8, 2.5, withA(PAL.poison, 1 - v * 0.7)); } }
}

function drawE04(e, x, y, rr, t, C2) {
  var a = e.ang || 0, walk = e.st === 'move' ? Math.sin(t * 9 + e.id) : 0;
  for (var k = 0; k < 4; k++) {
    var la = a + Math.PI / 4 + k * Math.PI / 2, sw = (k % 2 ? 1 : -1) * walk * 0.25;
    var fx = x + Math.cos(la + sw) * rr * 1.05, fy = y + Math.sin(la + sw) * rr * 1.05;
    line(x, y, fx, fy, 3.5, PAL.ink); line(x, y, fx, fy, 2, C2.dark); circ(fx, fy, 2.5, PAL.ink);
  }
  oRect(x, y, rr * 1.5, rr * 1.15, C2.body, a);
  rect(x + Math.cos(a) * rr * 0.12, y + Math.sin(a) * rr * 0.12, rr * 0.95, rr * 0.75, C2.lite, a); // trapezoid top
  var tell = e.st === 'tell', g = tell ? (e.tell01 || 0) : 0;
  oCirc(x, y, rr * 0.38, C2.dark);
  circ(x, y, rr * 0.26, g > 0 ? mix(PAL.ink, PAL.glow, g) : PAL.ink); // mortar tube mouth
  if (g > 0) ring(x, y, rr * 0.38 + 3, 2, withA(PAL.glow, 0.5 + 0.5 * g));
  circ(x + Math.cos(a) * rr * 0.62, y + Math.sin(a) * rr * 0.62, rr * 0.14, C2.eye);
}

function drawE05(e, x, y, rr, t, C2) {
  var a = e.aimAng != null && (e.st === 'tell' || e.st === 'act') ? e.aimAng : e.ang || 0;
  var kneel = e.st === 'tell', stun = e.st === 'stun' || e.stunT > 0, k = kneel ? 0.86 : 1;
  if (stun) a += Math.sin(t * 14) * 0.12;
  var ca = Math.cos(a), sa = Math.sin(a);
  oNgon(x - ca * rr * 0.1, y - sa * rr * 0.1, rr * 1.0 * k, 3, a, stun ? mix(C2.body, PAL.metalLite, 0.4) : C2.body);
  ngon(x - ca * rr * 0.15, y - sa * rr * 0.15, rr * 0.55 * k, 3, a, C2.lite);
  oRect(x + ca * rr * 0.62 * k, y + sa * rr * 0.62 * k, rr * 0.3, rr * 1.35 * k, kneel ? mix(C2.dark, PAL.sensor, 0.35) : C2.dark, a); // ram plate
  circ(x + ca * rr * 0.2, y + sa * rr * 0.2, rr * (kneel ? 0.24 : 0.18), stun ? PAL.metalLite : C2.eye);
  if (stun) for (var i = 0; i < 3; i++) { var sa2 = t * 5 + i * TAU / 3; ngon(x + Math.cos(sa2) * rr * 0.9, y - rr * 0.9 + Math.sin(sa2) * rr * 0.3, 3.2, 4, t * 4, PAL.stun); }
}

function drawB01(S, e, x, y, rr, t, C2) {
  var B = bossAttack(S, e) || {}, ph2 = (B.phase || e.phase) === 2, tell = !!B.attack && e.st !== 'act', tt = tell ? (B.tell01 != null ? B.tell01 : e.tell01 || 0) : 0;
  var body = ph2 ? mix(C2.body, PAL.boss2, 0.75) : C2.body, a0 = e.aimAng != null ? e.aimAng : Math.PI / 2;
  var spin = B.attack === 'B' && tell ? t * (2 + 22 * tt) : (e.ang || 0) * 0 + t * 0.4;
  oNgon(x, y, rr * 1.08, 8, Math.PI / 8, PAL.metalDark); // base
  var nb = 8;
  for (var k = 0; k < nb; k++) {
    var ba = spin + k * TAU / nb, cb = Math.cos(ba), sb = Math.sin(ba);
    oRect(x + cb * rr * 0.98, y + sb * rr * 0.98, rr * 0.5, rr * 0.2, C2.dark, ba);
    if (B.attack === 'B' && tell) circ(x + cb * rr * 1.25, y + sb * rr * 1.25, 2 + 3 * tt, mix(PAL.glow, PAL.sparkHot, tt));
  }
  oCirc(x, y, rr * 0.78, body);
  ring(x, y, rr * 0.6, 2, ph2 ? PAL.boss2Vent : C2.lite);
  if (ph2) for (var v = 0; v < 4; v++) { var va = v * Math.PI / 2 + Math.PI / 4; circ(x + Math.cos(va) * rr * 0.45, y + Math.sin(va) * rr * 0.45, 3 + Math.sin(t * 8 + v) * 1, PAL.boss2Vent); }
  // main gun toward aim
  oRect(x + Math.cos(a0) * rr * 0.55, y + Math.sin(a0) * rr * 0.55, rr * 0.7, rr * 0.3, C2.dark, a0);
  circ(x, y, rr * (0.3 + 0.08 * tt), tell ? mix(C2.eye, PAL.sparkHot, tt) : C2.eye);
  circ(x, y, rr * 0.12, C2.core);
  if (tell && B.attack === 'A') ring(x, y, rr * 1.3, 2.5, withA(PAL.laneEdge, 0.4 + 0.6 * tt), -Math.PI / 2, -Math.PI / 2 + TAU * tt);
}

function drawChest(S, s, t) {
  var c = S.chest; if (!c) return;
  var x = X(c.x), y = Y(c.y), w = 0.9 * s, h = 0.6 * s;
  rect(x + sh.x, y + sh.y, w, h, PAL.shadow);
  oRect(x, y, w, h, PAL.chest);
  rect(x, y, w, 2.5, PAL.chestTrim); rect(x - w * 0.3, y, 2.5, h, PAL.chestTrim); rect(x + w * 0.3, y, 2.5, h, PAL.chestTrim);
  if (c.open) {
    oRect(x, y - h * 0.75, w, h * 0.35, PAL.chestLid);
    circ(x, y - 2, h * 0.3, withA(PAL.cyan, 0.5 + 0.3 * Math.sin(t * 6)));
  } else {
    rect(x, y - h * 0.32, w, h * 0.36, PAL.chestLid);
    oRect(x, y, 6, 7, PAL.chestTrim);
    ring(x, y, w * 0.75 + 2 * Math.sin(t * 4), 1.5, withA(PAL.chestTrim, 0.6));
  }
}

function drawSupply(S, s, t) {
  if (S.stageKind !== 'supply') return;
  var p = S.supplyPos || { x: (S.room && S.room.w || 9) / 2, y: (S.room && S.room.h || 15) / 2 }, x = X(p.x), y = Y(p.y), w = 1.1 * s;
  rect(x + sh.x * 1.3, y + sh.y * 1.3, w, w, PAL.shadow);
  oRect(x, y, w, w, PAL.crate);
  rect(x, y, w - 6, w - 6, PAL.crateLid);
  line(x - w / 2 + 3, y - w / 2 + 3, x + w / 2 - 3, y + w / 2 - 3, 3, PAL.crateBand); line(x + w / 2 - 3, y - w / 2 + 3, x - w / 2 + 3, y + w / 2 - 3, 3, PAL.crateBand);
  oRect(x, y, w * 0.42, w * 0.42, PAL.repair); rect(x, y, 4, w * 0.3, PAL.cyan); rect(x, y, w * 0.3, 4, PAL.cyan);
  circ(x + w / 2 - 4, y - w / 2 + 4, 3, Math.sin(t * 6) > 0 ? PAL.cyan : PAL.metalDark);
  ring(x, y, w * 0.85 + 4 * ((t * 0.8) % 1), 2, withA(PAL.cyan, 1 - ((t * 0.8) % 1)));
}

function drawFx(S, s, t) {
  var fx = S.fx || [];
  for (var i = 0; i < fx.length; i++) {
    var f = fx[i];
    if (f.k === 'orb') { var r = (f.r || 0.18) * s; circ(X(f.x), Y(f.y), r + 3, withA(PAL.cyan, 0.3)); oCirc(X(f.x), Y(f.y), r, PAL.round); circ(X(f.x), Y(f.y), r * 0.45, PAL.roundCore); }
    else if (f.k === 'shield') { var r2 = (f.r || 0.25) * s; ring(X(f.x), Y(f.y), r2, 3, f.off ? withA(PAL.shield, 0.3) : PAL.shield); }
  }
}

function drawHeroHp(S, s) {
  var h = S.hero; if (!(h.maxHp > 0)) return;
  var x = X(h.x), y = Y(h.y) - (h.r || 0.28) * s - 13, w = 28, f = Math.max(0, Math.min(1, h.hp / h.maxHp));
  rect(x, y, w + 2, 5, PAL.hpBack);
  rect(x - w / 2 + (w * f) / 2, y, w * f, 3, f < 0.3 ? PAL.heroHpLow : PAL.heroHp);
}

// particle clock = S.t (hit-stop and pause freeze sparks); stepped from both ingest and build
function advance(S) {
  var t = S.t || 0, dt = Math.max(0, Math.min(0.1, t - P.lastT)); P.lastT = t;
  if (dt > 0) stepParticles(dt);
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
    advance(S);
    eatEvents(events, S);
    eatFx(S.fx);
  },
  PAL: PAL,
  particles: P.list,
  build: function (S, view, outArr) {
    out = outArr; vw = view; out.length = 0;
    var s = view.s, t = S.t || 0;
    // particle bookkeeping (own clock = S.t, so hit-stop and pause freeze sparks too)
    resetIfNew(S);
    advance(S);
    if (!P.ingested && S.frame !== P.lastFrame) { P.lastFrame = S.frame; eatEvents(S.events, S); eatFx(S.fx); }
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
    // room floor = same sand as the ground below (M 2026-11-10: one continuous yard, no panel)

    var E = S.enemies || [], sol = (R && R.solids) || [];
    drawHazards(S, s, t);
    for (i = 0; i < E.length; i++) { drawEnemyTellGround(S, E[i], s); drawLaneTell(S, E[i], s); drawBossGround(S, E[i], s, t); }
    drawShellRings(S, s, t);

    // shadows (hard, low sun from the upper left)
    for (i = 0; i < sol.length; i++) drawSolidShadow(sol[i], s);
    var pk = S.pickups || [];
    for (i = 0; i < pk.length; i++) circ(X(pk[i].x) + sh.x * 0.4, Y(pk[i].y) + sh.y * 0.4, 4, PAL.shadow);
    for (i = 0; i < E.length; i++) {
      var e = E[i], er = (e.r || 0.4) * s, fly = e.type === 'E-01' ? 1.6 : 1;
      if (e.type === 'E-02') rect(X(e.x) + sh.x * fly, Y(e.y) + sh.y * fly, er * 1.5, er * 1.5, PAL.shadow, e.ang || 0);
      else if (e.type === 'E-03') ngon(X(e.x) + sh.x, Y(e.y) + sh.y, er, 6, Math.PI / 6, PAL.shadow);
      else if (e.boss || e.type === 'B-01') ngon(X(e.x) + sh.x * 1.6, Y(e.y) + sh.y * 1.6, er * 1.08, 8, Math.PI / 8, PAL.shadow);
      else if (e.type === 'E-04') rect(X(e.x) + sh.x, Y(e.y) + sh.y, er * 1.5, er * 1.15, PAL.shadow, e.ang || 0);
      else if (e.type === 'E-05') ngon(X(e.x) + sh.x, Y(e.y) + sh.y, er, 3, e.ang || 0, PAL.shadow);
      else circ(X(e.x) + sh.x * fly, Y(e.y) + sh.y * fly, er * 0.9, PAL.shadow);
    }
    var H = S.hero, heroOn = H && S.phase !== 'dead' && !(S.phase === 'results' && S.result && !S.result.win);
    if (heroOn) circ(X(H.x) + sh.x * 0.7, Y(H.y) + sh.y * 0.7, (H.r || 0.28) * s, PAL.shadow);

    for (i = 0; i < sol.length; i++) drawSolid(sol[i], s);
    drawDoor(S, s);
    drawSupply(S, s, t);
    drawChest(S, s, t);
    for (i = 0; i < pk.length; i++) drawPickup(pk[i], s, t);
    for (i = 0; i < E.length; i++) drawEnemyAim(S, E[i], s);
    for (i = 0; i < E.length; i++) drawEnemy(S, E[i], s, t);
    drawFx(S, s, t);
    if (heroOn) { drawBrace(S, s); drawHero(S, s, t); drawHeroHp(S, s); }

    var rd = S.rounds || [];
    for (i = 0; i < rd.length; i++) {
      var q = rd[i], rr = Math.max(2.5, (q.r || 0.12) * s), sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy) || 1;
      var tl = 0.45 / sp * 1;
      var core = q.burn ? PAL.burn : q.poison ? PAL.poison : q.freeze ? PAL.freeze : PAL.roundCore;
      var trail = q.burn ? withA(PAL.burn, 0.5) : q.poison ? withA(PAL.poison, 0.5) : PAL.roundTrail;
      line(X(q.x - q.vx * tl * (q.pierce ? 1 : 0.5)), Y(q.y - q.vy * tl * (q.pierce ? 1 : 0.5)), X(q.x), Y(q.y), rr * 1.4, trail);
      if (q.pierce) rect(X(q.x), Y(q.y), rr * 3.2, rr * 1.3, PAL.pierce, Math.atan2(q.vy, q.vx));
      circ(X(q.x), Y(q.y), rr, PAL.round); circ(X(q.x), Y(q.y), rr * 0.55, core);
      if (q.rico) ring(X(q.x), Y(q.y), rr + 2.5, 1.2, PAL.cyan);
      if (q.bounceWall) ring(X(q.x), Y(q.y), rr + 1, 1, PAL.ink);
    }
    var sv = S.shots || [];
    for (i = 0; i < sv.length; i++) {
      var o = sv[i], r2 = Math.max(4, (o.r || 0.12) * 2 * s);
      circ(X(o.x), Y(o.y), r2 + 2.5, withA(PAL.shot, 0.28));
      circ(X(o.x), Y(o.y), r2 + 1, PAL.shotRim);
      circ(X(o.x), Y(o.y), r2, PAL.shot); circ(X(o.x), Y(o.y), r2 * 0.45, PAL.shotCore);
    }
    drawShells(S, s);
    drawLock(S, s, t);
    drawParticles(s);
    if (V.Scene.stress > 0) drawStress(V.Scene.stress | 0, t);
    return out;
  }
};
})();
