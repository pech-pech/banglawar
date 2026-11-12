(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Step 7 boss looks (LB): B-03 Ram Core "Ball" (+ split bodies), B-03V (angry variant), B-02 Hopper "Frog", B-04 Siege Walker "Colossus".
// Draw-only: reads e / S.boss, never writes sim state, never draws rng. Registered as V.Look[type] (hook: LOOK-HOOK.md, scene.js).
// Silhouettes at 9 columns (B-01 = octagon pinwheel of 8 barrels):
//   B-03  a smooth ball in a rolling three-band cage, eye pushed toward travel; kids drop bands / studs
//   B-03V the same ball with 8 spikes on the rim and a red-hot cage (an angrier, spikier circle)
//   B-02  a box hull on four splayed legs with square feet (a frog / table seen from above); hops up, shadow grows before landing
//   B-04  a wide T: two separate foot pads, a broad torso with shoulder plates, a turret drum with rock tubes (biggest object)
V.Look = V.Look || {};
var TAU = Math.PI * 2, DEG = Math.PI / 180;
function cl(v, a, b){ return v < a ? a : v > b ? b : v; }
function num(v, d){ return typeof v === 'number' && isFinite(v) ? v : d; }

// shared boss state read (tolerant of field names until every boss part lands)
function bossOf(S, e){
  var B = S && S.boss && S.boss.id === e.id ? S.boss : null;
  var attack = B ? B.attack : e.attack, tell01 = B && B.tell01 != null ? B.tell01 : (e.tell01 || 0), phase = (B && B.phase) || e.phase || 1;
  var tell = !!attack && e.st === 'tell';
  return { attack: attack, tell: tell, tt: tell ? cl(tell01, 0, 1) : 0, phase: phase, act: e.st === 'act', dead: (e.dead || 0) > 0 };
}
// unit plate (boss grammar): dark plate with n light bars, rotated with the hull
function plate(k, x, y, a, s, n){
  var ca = Math.cos(a), sa = Math.sin(a), w = s * (0.18 + 0.16 * n), h = s * 0.2;
  k.rect(x, y, w + 2, h + 2, k.PAL.ink, a + Math.PI / 2);
  k.rect(x, y, w, h, k.PAL.metalDark, a + Math.PI / 2);
  for (var i = 0; i < n; i++) {
    var o = (i - (n - 1) / 2) * s * 0.16;
    k.rect(x - sa * o, y + ca * o, s * 0.08, s * 0.12, BAR, a + Math.PI / 2);
  }
}
// triple sensor (boss grammar): three red lights in a row across the facing, centre larger
function triple(k, x, y, a, s, hot, C2){
  var nx = -Math.sin(a), ny = Math.cos(a), P = k.PAL, eye = C2.eye, core = C2.core;
  var e2 = hot > 0 ? k.mix(eye, P.sparkHot, 0.6 * hot) : eye;
  for (var i = -1; i <= 1; i++) {
    var r = i ? s * 0.07 : s * 0.1, px = x + nx * i * s * 0.22, py = y + ny * i * s * 0.22;
    k.circ(px, py, r + 1.4, P.ink); k.circ(px, py, r, e2);
    if (!i) k.circ(px, py, r * 0.42, core);
  }
}
var BAR = [228 / 255, 223 / 255, 210 / 255, 1];   // --pv-barrier-hi #e4dfd2 (unit plate bars)
var HOT = [1, 106 / 255, 48 / 255, 1];
var DAZE = [1, 233 / 255, 160 / 255, 1];          // --pv-tell-flash #ffe9a0: dazed arcs in the safe window (QA D10: not hazard yellow)           // TELL #ff6a30 (seams, hatches)
function heatSparks(k, x, y, rr, t, n){
  var P = k.PAL;
  for (var hs = 0; hs < n; hs++) {
    var hu = (t * 0.9 + hs / n) % 1, hx = x + (hs - (n - 1) / 2) * rr * 0.36 + Math.sin(t * 3 + hs * 1.7) * rr * 0.08;
    k.circ(hx, y - rr * 0.6 - hu * rr * 1.0, 1.5 + 3 * (1 - hu), k.withA(k.mix(P.boss2Hot, P.sparkHot, 1 - hu), 1 - hu * 0.8));
  }
}
function hitTint(k, c, C2){ return C2.hit > 0 ? k.mix(c, k.PAL.white, 0.35 * C2.hit) : c; }

// ======================= B-03 Ram Core =======================
// generation: 0 parent, 1 child, 2 grandchild. Field names tolerated: e.gen / e.split / e.splitLvl, else from radius vs the parent row.
function genOf(e){
  var g = e.gen != null ? e.gen : e.split != null ? e.split : e.splitLvl != null ? e.splitLvl : e.lvl;
  if (typeof g === 'number') return cl(g | 0, 0, 2);
  var D = V.Data && V.Data.enemies, base = D && D[e.type] && D[e.type].r;
  if (!base) return 0;
  var q = (e.r || base) / base;
  return q > 0.85 ? 0 : q > 0.6 ? 1 : 2;
}
// roll phase: distance travelled / radius. Draw-only memory per body (keyed by id), never on e.
var ROLL = {};
function rollOf(e, t){
  var m = ROLL[e.id];
  if (!m || m.t > t + 0.5) m = ROLL[e.id] = { x: e.x, y: e.y, d: 0, t: t, ang: e.ang || 0 };
  var dx = e.x - m.x, dy = e.y - m.y, dd = Math.sqrt(dx * dx + dy * dy);
  if (dd > 1e-4 && dd < 3) { m.d += dd; m.ang = Math.atan2(dy, dx); }
  m.x = e.x; m.y = e.y; m.t = t;
  return m;
}
function drawRamCore(k, S, e, x, y, rr, t, C2, angry){
  if (!k) return; var P = k.PAL;
  var B = bossOf(S, e), gen = genOf(e), m = rollOf(e, t);
  var ph2 = B.phase >= 2 || gen > 0, dk = e.dead || 0;
  var mv = e.vx != null || e.vy != null ? Math.atan2(e.vy || 0, e.vx || 0) : null;
  var dir = B.tell && e.aimAng != null ? e.aimAng : (mv != null && ((e.vx || 0) * (e.vx || 0) + (e.vy || 0) * (e.vy || 0) > 1e-4) ? mv : m.ang);
  var cd = Math.cos(dir), sd = Math.sin(dir);
  var rolling = e.st === 'act';
  var pause = e.st === 'pause';   // B speed roll: 1.2 s dazed pause = the free-shot window (boss-b03.js)
  // wind-up: bands spin faster with the tell, body coils back opposite travel
  var spinUp = B.tell ? B.tt * B.tt * (B.attack === 'B' ? 3.2 : 2.2) : 0;
  var roll = (e.spin != null ? e.spin : m.d / Math.max(0.2, e.r || 1)) + spinUp * TAU + (dk > 0 ? 0 : t * 0.25);
  if (pause) roll -= t * 0.25 - (e.pauseT || 0) * 2.5;   // spin decays over the pause
  if (B.tell) { var coil = rr * 0.12 * Math.min(1, B.tt / 0.75); x -= cd * coil; y -= sd * coil; }
  // hull colours: the variant is always hot-rimmed and darker red-brown; phase 2 / split bodies go toward boss2
  var body = C2.body, lite = C2.lite, dark = C2.dark;
  if (angry) { body = k.mix(body, P.boss2, 0.55); lite = k.mix(lite, P.boss2, 0.4); }
  if (ph2) { body = k.mix(body, P.boss2, angry ? 0.35 : 0.55); }
  body = hitTint(k, body, C2);
  var band = angry ? k.mix(P.boss2, P.boss2Hot, 0.35) : P.metalLite, bandHot = ph2 || angry;
  // contact ring while it rolls (dashed, pulsing)
  if (rolling && dk === 0) {
    var pr = rr * (1.12 + 0.04 * Math.sin(t * 12)), nd = 12;
    for (var j = 0; j < nd; j++) { var q0 = j * TAU / nd + t * 1.5; k.ring(x, y, pr, 2, k.withA(P.ringEdge, 0.85), q0, q0 + TAU / nd * 0.55); }
  }
  // B-03V spikes (silhouette): 8 triangles on the rim, outlined, turning with the roll
  var nSpk = angry ? (gen === 2 ? 4 : gen === 1 ? 6 : 8) : 0, spkR = rr * (gen === 2 ? 0.3 : 0.36);
  var rimA = roll * 0.35;
  for (var sp = 0; sp < nSpk; sp++) {
    var sa = rimA + sp * TAU / nSpk, px = x + Math.cos(sa) * rr * 1.0, py = y + Math.sin(sa) * rr * 1.0;
    k.ngon(px, py, spkR + 2.6, 3, sa, P.ink);
    k.ngon(px, py, spkR, 3, sa, bandHot ? k.mix(P.metalDark, P.boss2Hot, 0.25) : P.metalDark);
  }
  // phase 2 / variant hot rim
  if (ph2 || angry) k.ring(x, y, rr + 3.2, 3, k.withA(P.boss2Rim, ph2 ? 0.75 + 0.25 * Math.sin(t * 6) : 0.55));
  // sphere: ink, then radial shade from the sun side (upper left)
  k.circ(x, y, rr + 2.4, P.ink);
  k.circ(x, y, rr, k.mix(body, dark, 0.35));
  k.circ(x - rr * 0.08, y - rr * 0.08, rr * 0.86, body);
  k.rgrad(x - rr * 0.3, y - rr * 0.3, rr * 0.62, k.withA(k.mix(lite, P.white, 0.3), 0.85), k.withA(lite, 0));   // sun-side sheen, stays inside the ball
  // cage bands: meridians through the roll axis (perpendicular to travel), upper hemisphere only, rotating with distance
  var nb = gen === 0 ? 3 : gen === 1 ? 2 : 1, ax = -sd, ay = cd, seam = B.phase >= 2 && B.tell ? 0 : 0;
  var spread = pause ? 30 * DEG : 0;
  for (var b = 0; b < nb; b++) {
    var phi = roll + b * Math.PI / nb + (b ? spread : -spread * 0.5), sp2 = Math.sin(phi), cp = Math.cos(phi);
    var u0 = sp2 >= 0 ? 0 : Math.PI, N = 10, pts = [];
    for (var u = 0; u <= N; u++) {
      var uu = u0 + Math.PI * u / N, cu = Math.cos(uu), su = Math.sin(uu);
      pts.push([x + (ax * cu + cd * cp * su) * rr * 0.96, y + (ay * cu + sd * cp * su) * rr * 0.96]);
    }
    var bw = Math.max(2.5, rr * 0.11);
    for (var pi = 0; pi < N; pi++) k.line(pts[pi][0], pts[pi][1], pts[pi + 1][0], pts[pi + 1][1], bw + 3, P.ink);
    for (pi = 0; pi <= N; pi++) k.circ(pts[pi][0], pts[pi][1], (bw + 3) / 2, P.ink);
    var bc = bandHot ? k.mix(band, P.boss2Hot, 0.25 + 0.2 * Math.sin(t * 5 + b)) : band;
    if (B.tell) bc = k.mix(bc, P.glow, 0.5 * B.tt);
    for (pi = 0; pi < N; pi++) k.line(pts[pi][0], pts[pi][1], pts[pi + 1][0], pts[pi + 1][1], bw, bc);
    for (pi = 1; pi < N; pi++) k.circ(pts[pi][0], pts[pi][1], bw / 2, bc);
  }
  // studs on the rim (parent and child only; the variant uses spikes instead)
  if (!angry && gen < 2) {
    var ns = gen === 0 ? 8 : 6;
    for (var st = 0; st < ns; st++) { var qa = rimA + st * TAU / ns; k.circ(x + Math.cos(qa) * rr * 0.86, y + Math.sin(qa) * rr * 0.86, rr * 0.075 + 1.3, P.ink); k.circ(x + Math.cos(qa) * rr * 0.86, y + Math.sin(qa) * rr * 0.86, rr * 0.075, BAR); }
  }
  // unit plate: 3 bars (parent only), on the back half
  if (gen === 0) plate(k, x - cd * rr * 0.5, y - sd * rr * 0.5, dir, rr, 3);
  // core eye, pushed toward travel; hot with the tell; brighter in the free-shot pause
  var ex = x + cd * rr * 0.34, ey = y + sd * rr * 0.34, er = rr * (gen === 2 ? 0.28 : 0.24);
  var hot = B.tell ? B.tt : pause ? 0.7 : (angry ? 0.35 : 0);
  k.circ(ex, ey, er + 2.2, P.ink);
  if (pause) {
    // QA Q6: the free-shot weak point: the core goes hot orange #ff6a30 to pale #ffd0c0 and pulses (no longer a plain red eye)
    var pu = 0.5 + 0.5 * Math.sin(t * 7);
    k.circ(ex, ey, er * 1.12, HOT);
    k.circ(ex, ey, er * 0.82, k.mix(HOT, P.sensorCore, 0.45 + 0.55 * pu));
  } else {
    k.circ(ex, ey, er, k.mix(P.metalDark, HOT, 0.25 + 0.6 * hot));
    k.circ(ex, ey, er * 0.55, hot > 0 ? k.mix(C2.eye, P.sparkHot, hot) : C2.eye);
  }
  k.circ(ex, ey, er * 0.22, C2.core);
  if (gen === 0) triple(k, x + cd * rr * 0.68, y + sd * rr * 0.68, dir, rr * 0.75, hot, C2);
  if (dk === 0) k.glow(ex, ey, rr * (0.55 + 0.35 * hot), pause ? HOT : P.sensor, pause ? 0.5 : 0.18 + 0.25 * hot, 2);
  // split seam glow (phase change): a hot line across the ball for the 0.3 s before the split
  var sg = e.st === 'split' && e.splitT > 0 ? cl(e.splitT / 0.6, 0, 1) : -1;   // just split: the cut face glows and cools over 0.6 s
  if (sg >= 0 && sg <= 1) { k.line(x + ax * rr, y + ay * rr, x - ax * rr, y - ay * rr, 4, k.withA(HOT, 0.4 + 0.6 * sg)); k.glow(x, y, rr * 0.9, HOT, 0.3 * sg, 3); }
  if (ph2 && dk === 0 && gen === 0) heatSparks(k, x, y, rr, t, 4);
  // dazed (st 'pause', the B free-shot window): three stun arcs orbit the ball, a slow wobble of yellow sparks, steam puffs
  if (pause && dk === 0) {
    var R5 = rr * 1.3, sp5 = t * 4;
    for (var j5 = 0; j5 < 3; j5++) { var a5 = sp5 + j5 * TAU / 3; k.ring(x, y, R5, 4.5, P.ink, a5 - 0.05, a5 + 1.0); k.ring(x, y, R5, 2.5, DAZE, a5, a5 + 0.95); }
    for (var i5 = 0; i5 < 3; i5++) { var b5 = -sp5 * 1.3 + i5 * TAU / 3; k.ngon(x + Math.cos(b5) * R5, y + Math.sin(b5) * R5, 5.5, 4, t * 6, P.ink); k.ngon(x + Math.cos(b5) * R5, y + Math.sin(b5) * R5, 3.8, 4, t * 6, i5 % 2 ? P.white : DAZE); }
  }
  // split pose (st 'split'): the new halves sit squat with the cut face hot; a ring of hot shards around the body
  if (sg >= 0 && dk === 0) {
    for (var q6 = 0; q6 < 6; q6++) { var a6 = q6 * TAU / 6 + dir, r6 = rr * (1.05 + 0.35 * (1 - sg)); k.circ(x + Math.cos(a6) * r6, y + Math.sin(a6) * r6, 1.5 + 2.5 * sg, k.withA(HOT, sg)); }
  }
  if (B.tell && dk === 0) k.ring(x, y, rr * 1.28, 2.5, k.withA(P.laneEdge, 0.4 + 0.6 * B.tt), -Math.PI / 2, -Math.PI / 2 + TAU * B.tt);
}

// ======================= B-02 Hopper =======================
// Airborne height 0..1 (tolerant: e.z / e.air / e.hop01 / e.h). Landing marker ring comes from e.kitRings (LM draws it).
function airOf(e){   // boss-b02.js: e.hop = { x0, y0, x1, y1, u, z, H } while e.air; z peaks at H (1.6 tiles)
  var o = e.hop; if (!e.air || !o) return 0;
  return cl((o.z || 0) / (o.H || 1.6), 0, 1);
}
function hopU(e){ var o = e.hop; return e.air && o ? cl(o.u || 0, 0, 1) : -1; }
// landing in the last 0.15 s after touchdown (squash), from a draw-side memory of air
var AIR = {};
function landOf(e, t, z){
  var m = AIR[e.id]; if (!m || m.t > t + 0.5) m = AIR[e.id] = { z: z, t: t, land: -9 };
  if (m.z > 0.02 && z <= 0.02) m.land = t;
  m.z = z; m.t = t;
  var u = (t - m.land) / 0.26; return u >= 0 && u < 1 ? u : -1;
}
function drawHopper(k, S, e, x, y, rr, t, C2){
  if (!k) return; var P = k.PAL;
  var B = bossOf(S, e), ph2 = B.phase >= 2, z = airOf(e), land = landOf(e, t, z), dk = e.dead || 0;
  var a = e.ang != null ? e.ang : Math.PI / 2;
  if (B.tell && e.aimAng != null) a = e.aimAng;
  var ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
  // crouch before a hop (tell of A): legs fold in, hull lowers; slam squash after landing; stretch while rising
  var crouch = B.tell && (B.attack === 'A' || B.attack === 'H') ? Math.min(1, B.tt / 0.8) : 0;
  var sq = land >= 0 ? Math.sin(land * Math.PI) * 0.1 : 0;
  var lift = z * rr * 1.1, sc = 1 + 0.2 * z;
  var hx = x, hy = y - lift;                 // hull drawn up the screen by its height (top-down with a low sun)
  // shadow under the ground point: shrinks at the apex, grows back and darkens as it comes down (the "where it lands" read)
  var spread = (1 - 0.4 * z - 0.12 * crouch + 0.1 * sq) * sc, R0 = rr * 1.28;
  var legC = ph2 ? k.mix(P.metalLite, P.boss2, 0.45) : P.metalLite, leg = Math.max(5, rr * 0.26);
  // four legs: hip at the hull corner, knee out, square foot further out on the diagonal
  for (var i = 0; i < 4; i++) {
    // frog legs: knees jut out to the sides, feet sit forward / back of them (elbows-out silhouette)
    var sg = i < 2 ? 1 : -1, fw = (i === 0 || i === 3) ? 1 : -1, la = Math.atan2(sa * fw + ny * sg, ca * fw + nx * sg);
    var hipx = hx + nx * sg * rr * 0.45 * sc + ca * fw * rr * 0.4 * sc, hipy = hy + ny * sg * rr * 0.45 * sc + sa * fw * rr * 0.4 * sc;
    var kx = hx + nx * sg * rr * 1.3 * spread + ca * fw * rr * 0.25 * spread, ky = hy + ny * sg * rr * 1.3 * spread + sa * fw * rr * 0.25 * spread;
    var fx = x + nx * sg * rr * 0.95 * spread + ca * fw * rr * 0.9 * spread, fy = y + ny * sg * rr * 0.95 * spread + sa * fw * rr * 0.9 * spread - lift * 0.55;
    k.line(hipx, hipy, kx, ky, leg + 4, P.ink); k.line(kx, ky, fx, fy, leg + 3, P.ink); k.circ(kx, ky, (leg + 4) / 2, P.ink);
    k.line(hipx, hipy, kx, ky, leg, legC); k.line(kx, ky, fx, fy, leg * 0.85, legC); k.circ(kx, ky, leg / 2, legC);
    k.line(kx, ky, fx, fy, 1.6, k.withA(P.spikeTip, 0.8));   // chrome piston rod
    var fs = rr * 0.42 * (1 - 0.2 * z);
    k.oRect(fx, fy, fs, fs, ph2 ? k.mix(P.metalLite, P.boss2, 0.3) : P.metalLite, a);
    k.rect(fx, fy, fs * 0.5, fs * 0.5, P.metalDark, a);
    // phase 1 rear leg armour plates (drop away in phase 2)
    if (!ph2 && fw < 0) { k.oRect((hipx + kx) / 2, (hipy + ky) / 2, rr * 0.3, rr * 0.22, k.mix(P.metalLite, P.white, 0.15), la); }
  }
  // hull: box (wider than deep), front head wedge, ports on the rim
  var hw = rr * 1.15 * sc * (1 + sq), hd = rr * 1.3 * sc * (1 - sq), body = hitTint(k, ph2 ? k.mix(C2.body, P.boss2, 0.7) : k.mix(C2.body, C2.lite, 0.4), C2);
  if (ph2) k.rect(hx, hy, hw + 9, hd + 9, k.withA(P.boss2Rim, 0.75 + 0.25 * Math.sin(t * 6)), a + Math.PI / 2);
  k.oRect(hx, hy, hw, hd, body, a + Math.PI / 2);
  k.grad(hx, hy, hw * 0.8, hd * 0.82, k.withA(k.mix(C2.lite, P.white, 0.1), 0.9), k.withA(C2.dark, 0.6), a + Math.PI / 2 + Math.PI);
  // head wedge at the front + triple sensor slits
  var fxw = hx + ca * hd * 0.55, fyw = hy + sa * hd * 0.55;
  k.oRect(fxw, fyw, hw * 0.48, rr * 0.3 * sc, C2.dark, a + Math.PI / 2);
  var hotP = B.tell && B.attack === 'B' ? B.tt : (B.tell ? 0.3 * B.tt : 0);
  for (var s3 = -1; s3 <= 1; s3++) k.rect(fxw + nx * s3 * hw * 0.14, fyw + ny * s3 * hw * 0.14, rr * 0.07 * sc, rr * (s3 ? 0.13 : 0.17) * sc, hotP > 0 ? k.mix(C2.eye, P.sparkHot, hotP) : C2.eye, a + Math.PI / 2);
  // gun ports: 8 (phase 2: 12) on the hull rim; flare before the burst
  var np = ph2 ? 12 : 8, spinP = B.tell && B.attack === 'B' ? TAU * 0.5 * B.tt * B.tt : 0;
  for (var p = 0; p < np; p++) {
    var pa = (e.ports && e.ports.length === np ? e.ports[p] : a + p * TAU / np) + spinP, pcx = Math.cos(pa), psy = Math.sin(pa);
    var rx = hx + pcx * hw * 0.5 * 0.92, ry = hy + psy * hd * 0.5 * 0.92;   // ellipse rim of the box
    var pr2 = rr * (p % (np / 4) === 0 || !ph2 ? 0.075 : 0.055) * sc;
    k.circ(rx, ry, pr2 + 1.6, P.ink);
    k.circ(rx, ry, pr2, hotP > 0 ? k.mix(P.metalDark, P.glow, hotP) : P.metalDark);
    if (hotP > 0.3) k.glow(rx, ry, pr2 * 3, P.glow, 0.5 * hotP, 3);
  }
  // back hatch (weak point) + unit plate (2 bars)
  var bkx = hx - ca * hd * 0.25, bky = hy - sa * hd * 0.25, open = e.st === 'cool' && (e.freeT || 0) < 1.0 && z === 0 ? 1 : 0;   // hatch opens in the free-shot window
  k.oRect(bkx, bky, hw * 0.26, hd * 0.18, open ? k.mix(HOT, P.sensorCore, 0.3 + 0.2 * Math.sin(t * 7)) : P.metalDark, a + Math.PI / 2);
  plate(k, hx + ca * hd * 0.12, hy + sa * hd * 0.12, a, rr * sc, 2);
  if (ph2) { for (var v = 0; v < 2; v++) { var vx = hx - ca * hd * 0.42 + nx * (v ? 1 : -1) * hw * 0.32, vy = hy - sa * hd * 0.42 + ny * (v ? 1 : -1) * hw * 0.32; k.circ(vx, vy, rr * 0.07 + Math.sin(t * 9 + v) * 0.8, P.boss2Vent); k.glow(vx, vy, rr * 0.25, P.boss2Vent, 0.45, 2); } }
  if (dk === 0) k.glow(fxw, fyw, rr * 0.45, P.sensor, 0.16 + 0.2 * hotP, 2);
  // steam off the dropped armour in phase 2
  if (ph2 && dk === 0) heatSparks(k, hx, hy, rr, t, 4);
  // takeoff stretch cue: dust ring under the feet at landing
  if (land >= 0 && land < 1 && dk === 0) k.ring(x, y, rr * (1.1 + 0.9 * land), 3 * (1 - land), k.withA(P.dust, 0.9 * (1 - land)));
}

// ======================= B-04 Siege Walker =======================
var STEP = {}, WALK_VIS = 1.4;
function drawWalker(k, S, e, x, y, rr, t, C2){
  if (!k) return; var P = k.PAL;
  var B = bossOf(S, e), ph2 = B.phase >= 2, dk = e.dead || 0;
  rr *= WALK_VIS;   // art larger than the hurtbox (r 1.0): the Colossus reads ~3.4 tiles wide, the biggest thing in Ch1
  // lower body faces the room (south) unless the AI gives a body angle; the turret drum / torso turns to aim
  var bodyA = e.bodyAng != null ? e.bodyAng : Math.PI / 2, ca = Math.cos(bodyA), sa = Math.sin(bodyA), nx = -sa, ny = ca;
  var aim = e.aimAng != null ? e.aimAng : (e.ang != null ? e.ang : Math.PI / 2);
  var m = STEP[e.id]; if (!m || m.t > t + 0.5) m = STEP[e.id] = { x: e.x, y: e.y, d: 0, t: t };
  var dd = Math.hypot(e.x - m.x, e.y - m.y); if (dd < 3) m.d += dd; m.x = e.x; m.y = e.y; m.t = t;
  var w01 = e.walk01 != null ? cl(e.walk01, 0, 1) : (dd > 1e-4 ? 1 : 0), walking = w01 > 0.05;
  var gait = (e.legPh != null ? Math.sin(e.legPh) : Math.sin(m.d * (ph2 ? 3.8 : 3.1))) * w01;
  var bob = walking ? Math.abs(gait) * rr * 0.03 : 0;
  // A spin-up: drum angle from tell01 (1.5 turns accelerating), then snaps to aim
  var spinA = e.spin != null ? e.spin : (B.tell && B.attack === 'A' ? TAU * 1.5 * B.tt * B.tt : 0);
  var drumA = (e.ang != null ? e.ang : aim) + spinA;   // boss-b04.js: e.ang facing, e.spin turret spin (grows in A, coasts down)
  var steel = hitTint(k, ph2 ? k.mix(C2.body, P.boss2, 0.55) : C2.body, C2);
  // feet: two pads far apart (T silhouette), stride alternates
  for (var f = -1; f <= 1; f += 2) {
    var st = walking ? gait * f * rr * 0.16 : 0;
    var px = x + nx * f * rr * 0.98 + ca * (rr * 0.42 + st), py = y + ny * f * rr * 0.98 + sa * (rr * 0.42 + st);
    var hipx = x + nx * f * rr * 0.38, hipy = y + ny * f * rr * 0.38 - bob;
    k.line(hipx, hipy, px, py, rr * 0.22 + 4, P.ink); k.line(hipx, hipy, px, py, rr * 0.22, P.metalDark);
    k.line(hipx, hipy, px, py, 2, k.withA(P.spikeTip, 0.85));
    k.oRect(px, py, rr * 0.36, rr * 0.56, ph2 ? k.mix(P.metalLite, P.boss2, 0.25) : P.metalLite, bodyA + Math.PI / 2);
    for (var tr = -1; tr <= 1; tr++) k.rect(px + ca * tr * rr * 0.15, py + sa * tr * rr * 0.15, rr * 0.3, 2, P.metalDark, bodyA + Math.PI / 2);
    if (walking && dk === 0) k.ring(px, py, rr * 0.36, 1.5, k.withA(P.ringEdge, 0.45));   // contact outline while walking
  }
  var ty = y - bob;
  // rear engine vents (weak point): 3 slits; glow during the spin-up, leak orange in phase 2
  var vg = (B.tell && B.attack === 'A' ? B.tt : 0) + (ph2 ? 0.5 + 0.2 * Math.sin(t * 7) : 0);
  // torso: broad block with chamfer posts (octagon read), rim glow in phase 2
  var TW = rr * 1.38, TD = rr * 0.92;
  if (ph2) k.rect(x, ty, TW + 10, TD + 10, k.withA(P.boss2Rim, 0.7 + 0.3 * Math.sin(t * 6)), bodyA + Math.PI / 2);
  k.oRect(x, ty, TW, TD, steel, bodyA + Math.PI / 2);
  k.grad(x, ty, TW * 0.86, TD * 0.8, k.withA(k.mix(C2.lite, P.white, 0.12), 0.85), k.withA(C2.dark, 0.7), bodyA - Math.PI / 2);
  for (var vv = -1; vv <= 1; vv++) {
    var sx = x - ca * TD * 0.36 + nx * vv * TW * 0.18, sy = ty - sa * TD * 0.36 + ny * vv * TW * 0.18;
    k.rect(sx, sy, TW * 0.12, 3, vg > 0 ? k.mix(P.metalDark, HOT, cl(vg, 0, 1)) : P.metalDark, bodyA + Math.PI / 2);
    if (vg > 0.2 && dk === 0) k.glow(sx, sy, rr * 0.22, HOT, 0.35 * cl(vg, 0, 1), 2);
  }
  // shoulders: armour plates (phase 1) or a bare frame with cables (phase 2)
  for (var sh = -1; sh <= 1; sh += 2) {
    var shx = x + nx * sh * TW * 0.56, shy = ty + ny * sh * TW * 0.56;
    if (!ph2) {
      k.oRect(shx, shy, rr * 0.4, rr * 0.5, k.mix(P.metalLite, P.white, 0.18), bodyA + Math.PI / 2);
      for (var rv = -1; rv <= 1; rv++) k.circ(shx + ca * rv * rr * 0.13, shy + sa * rv * rr * 0.13, 1.6, P.metalDark);
    } else {
      k.oRect(shx, shy, rr * 0.3, rr * 0.42, P.metalDark, bodyA + Math.PI / 2);
      for (var cb = -1; cb <= 1; cb += 2) k.line(shx - ca * rr * 0.18, shy - sa * rr * 0.18 + cb, shx + ca * rr * 0.18 + nx * sh * cb * 3, shy + sa * rr * 0.18, 2, P.boss2Vent);
    }
  }
  // turret drum with rock tubes (5, phase 2: 7) in a 120 degree arc toward the aim; bores glow in the tell
  var nt = ph2 ? 7 : 5, arc = 120 * DEG, glowT = B.tell ? B.tt : 0, DR = rr * 0.36;
  if (B.tell && B.attack === 'A') { k.ring(x, ty, DR * 1.25 + 2 * glowT, 2 + 3 * glowT, k.withA(P.glow, 0.35 + 0.6 * glowT)); for (var bl = 0; bl < 6; bl++) { var ba = drumA + bl * TAU / 6; k.ring(x, ty, DR * 1.05, DR * 0.25, k.withA(P.bossSpin, 0.25 + 0.6 * glowT), ba - 0.7 * glowT, ba); } }
  for (var tb = 0; tb < nt; tb++) {
    var ta = drumA + (tb / (nt - 1) - 0.5) * arc, ct = Math.cos(ta), stt = Math.sin(ta);
    var tl = rr * 0.34;
    k.oRect(x + ct * (DR + tl * 0.35), ty + stt * (DR + tl * 0.35), tl, rr * 0.22, C2.dark, ta);
    var bx = x + ct * (DR + tl * 0.72), by = ty + stt * (DR + tl * 0.72);
    k.circ(bx, by, rr * 0.075, glowT > 0 ? k.mix(P.ink, P.glow, glowT) : P.ink);
    if (glowT > 0.25 && dk === 0) k.glow(bx, by, rr * 0.2, P.glow, 0.5 * glowT, 3);
  }
  k.circ(x, ty, DR + 2.4, P.ink);
  k.circ(x, ty, DR, C2.dark);
  k.circ(x - DR * 0.1, ty - DR * 0.1, DR * 0.82, steel);
  k.rgrad(x - DR * 0.3, ty - DR * 0.3, DR * 0.6, k.withA(k.mix(C2.lite, P.white, 0.3), 0.8), k.withA(C2.lite, 0));
  k.ring(x, ty, DR * 0.7, 2, ph2 ? P.boss2Vent : C2.lite);
  k.circ(x, ty, DR * 0.3, ph2 ? k.mix(HOT, P.sensorCore, 0.3) : P.metalDark);
  // unit plate: 4 bars on the torso front, drawn over the drum and tubes so no turret angle hides it (QA D7)
  plate(k, x + ca * TD * 0.3 + nx * TW * 0.27, ty + sa * TD * 0.3 + ny * TW * 0.27, bodyA, rr * 0.8, 4);
  // head bar at the front edge with the triple sensor
  var hx = x + ca * TD * 0.62, hy = ty + sa * TD * 0.62, hot = B.tell ? B.tt : (ph2 ? 0.4 : 0);
  k.oRect(hx, hy, rr * 0.18, rr * 0.62, C2.dark, bodyA);
  triple(k, hx, hy, bodyA, rr * 0.9, hot, C2);
  var swell = 0;
  if (dk === 0) k.glow(hx, hy, rr * 0.45, P.sensor, 0.18 + 0.2 * hot, 2);
  if (ph2 && dk === 0) heatSparks(k, x, ty, rr, t, 6);
  if (B.tell && B.attack === 'B' && dk === 0) k.ring(x, ty, rr * 1.35, 2.5, k.withA(P.laneEdge, 0.4 + 0.6 * B.tt), -Math.PI / 2, -Math.PI / 2 + TAU * B.tt);
}

// ---------- shadows (hook: shadow(K, S, e, sx, sy, er, shx, shy); bosses use the sun offset x1.6) ----------
function shRam(k, S, e, sx, sy, er, shx, shy){
  var f = e.st === 'act' ? 1.1 : 1.6;   // rolling fast: the ball sits closer to its shadow
  k.circ(sx + shx * f, sy + shy * f, er * 1.0, k.PAL.shadow);
}
function shHop(k, S, e, sx, sy, er, shx, shy){
  // on the ground: a box + four feet. In the air: a round blob under the ground point that shrinks at the apex and
  // grows and darkens as the hop comes down (the landing read, with the kit landing ring).
  var P = k.PAL, z = airOf(e), u = hopU(e), a = e.ang != null ? e.ang : Math.PI / 2;
  if (z <= 0.01 || u < 0) {
    k.rect(sx + shx * 1.6, sy + shy * 1.6, er * 1.05, er * 1.22, P.shadow, a + Math.PI / 2);
    var ca = Math.cos(a), sa = Math.sin(a);
    for (var i = 0; i < 4; i++) { var sg = i < 2 ? 1 : -1, fw = (i === 0 || i === 3) ? 1 : -1; k.rect(sx - sa * sg * er * 0.95 + ca * fw * er * 0.9 + shx, sy + ca * sg * er * 0.95 + sa * fw * er * 0.9 + shy, er * 0.42, er * 0.42, P.shadow, a); }
    return;
  }
  var near = u > 0.5 ? (u - 0.5) / 0.5 : 0, r = er * (0.55 + 0.6 * (1 - z) + 0.15 * near);
  k.circ(sx + shx * (1 + z), sy + shy * (1 + z), r, k.withA(P.shadow, 1.0 + 0.8 * (1 - z)));
  k.ring(sx + shx * (1 + z), sy + shy * (1 + z), r, 1.5 + 1.5 * near, k.withA(P.ink, 0.25 + 0.45 * near));
}
function shWalk(k, S, e, sx, sy, er, shx, shy){
  var P = k.PAL, a = e.bodyAng != null ? e.bodyAng : Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca, ox = shx * 1.8, oy = shy * 1.8; er *= WALK_VIS;
  k.rect(sx + ox, sy + oy, er * 1.38 + er * 0.5, er * 0.95, P.shadow, a + Math.PI / 2);
  for (var f = -1; f <= 1; f += 2) k.rect(sx + nx * f * er * 0.98 + ca * er * 0.42 + shx, sy + ny * f * er * 0.98 + sa * er * 0.42 + shy, er * 0.36, er * 0.56, P.shadow, a + Math.PI / 2);
  k.circ(sx + ox * 1.2, sy + oy * 1.2, er * 0.45, P.shadow);
}
// ---------- ground (hook: ground(K, S, e, s, t)); the tell ribbon itself is e.kitLanes, drawn by scene ----------
// While B-03 rolls, the rest of its lane stays on the floor (fading), so the path is still readable after the tell ends.
function grRam(k, S, e, s, t){
  var L = e.lane; if (e.st !== 'act' || !L) return;
  var P = k.PAL, x1 = k.X(e.x), y1 = k.Y(e.y), x2 = k.X(L.x2), y2 = k.Y(L.y2), len = Math.hypot(x2 - x1, y2 - y1); if (len < 2) return;
  var a = Math.atan2(y2 - y1, x2 - x1), w = (L.w || 2 * e.r) * s, px = -Math.sin(a) * w / 2, py = Math.cos(a) * w / 2;
  k.rect((x1 + x2) / 2, (y1 + y2) / 2, len, w, k.withA(P.lane, 0.9), a);
  k.line(x1 + px, y1 + py, x2 + px, y2 + py, 1.5, k.withA(P.laneEdge, 0.8)); k.line(x1 - px, y1 - py, x2 - px, y2 - py, 1.5, k.withA(P.laneEdge, 0.8));
  k.rect(x2, y2, 4, w, P.laneEdge, a);
}
// ---------- registration ----------
function reg(type, body, shadow, ground){ V.Look[type] = { body: body, shadow: shadow, ground: ground, rimR: 0.9, hp: false, size: 'large', outline: 2.4 }; }
reg('B-03', function(K, S, e, x, y, rr, t, C2){ drawRamCore(K, S, e, x, y, rr, t, C2, false); }, shRam, grRam);
reg('B-03V', function(K, S, e, x, y, rr, t, C2){ drawRamCore(K, S, e, x, y, rr, t, C2, true); }, shRam, grRam);
reg('B-02', drawHopper, shHop);
reg('B-04', drawWalker, shWalk);
V.LookBosses = { drawRamCore: drawRamCore, drawHopper: drawHopper, drawWalker: drawWalker, airOf: airOf, genOf: genOf };
})();
