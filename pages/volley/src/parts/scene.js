(function(){ var G = (typeof window !== 'undefined' ? window : globalThis); var V = G.V = G.V || {};
// Scene: state S + view -> flat draw list (CSS px). Look G2: sand ground, thin dark outlines, hard low-sun shadow.

function C(r, g, b, a) { return [r / 255, g / 255, b / 255, a == null ? 1 : a]; }
var PAL = {
  ground: C(214, 191, 142), groundDot: C(186, 160, 116), groundDot2: C(236, 220, 178),   // --pv-sand-lo / hi
  floor: C(236, 220, 178), seam: C(196, 176, 138, 0.55),
  shadow: C(92, 64, 30, 0.30),
  ink: C(15, 18, 21), inkSoft: C(20, 24, 28, 0.85),   // --pv-ink / -ink-soft
  wall: C(196, 188, 170), wallTop: C(218, 211, 194), wallSeam: C(150, 142, 126),
  pillar: C(184, 176, 158), pillarTop: C(206, 199, 182),
  crate: C(92, 104, 62), crateLid: C(112, 126, 76), crateBand: C(64, 72, 44),
  doorShut: C(70, 74, 80), doorOpen: C(40, 36, 30), doorLightShut: C(255, 60, 50), doorLightOpen: C(90, 240, 140), chevron: C(223, 230, 236),
  metal: C(62, 66, 74), metalLite: C(92, 98, 108), metalDark: C(36, 39, 45),
  sensor: C(255, 42, 31), sensorCore: C(255, 208, 192),   // --pv-sensor / -sensor-core
  heroBody: C(124, 140, 82), heroDark: C(61, 74, 40), cyan: C(56, 232, 255), cyanSoft: C(56, 232, 255, 0.35),
  heroSleeve: C(90, 103, 58), heroPad: C(182, 154, 104), helmHi: C(196, 168, 116), helmLo: C(122, 98, 56), heroPack: C(140, 117, 80), visor: C(76, 240, 255),
  gunHi: C(74, 83, 93), gunLo: C(27, 32, 38), rim: C(255, 248, 225, 0.55), sunWarm: C(255, 236, 190), vig: C(40, 32, 24),
  amber: C(255, 176, 32),
  roundRim: C(2, 26, 31, 0.92), roundTrail2: C(60, 235, 255, 0.95), round: C(154, 248, 255), roundCore: C(255, 255, 255), roundTrail: C(60, 235, 255, 0.45),   // --pv-round / -round-core / -round-trail
  shot: C(255, 42, 120), shotCore: C(255, 208, 228), shotRim: C(42, 3, 20),   // --pv-eshot / -eshot-core / -eshot-rim
  tellYellow: C(255, 222, 40), aim: C(255, 40, 40, 0.75), aimLock: C(255, 60, 60, 1),
  glow: C(255, 120, 40), fan: C(255, 60, 40, 0.22), fanEdge: C(255, 50, 40, 0.75),
  hpBack: C(30, 26, 22, 0.85), hpFill: C(255, 70, 60), hpPip: C(30, 26, 22),
  xp: C(143, 123, 255), xpRim: C(48, 38, 110), repair: C(228, 223, 210), repairCross: C(31, 184, 104), repairHi: C(124, 255, 176),   // --pv-xp violet (XP role), --pv-repair-hi/lo
  white: C(255, 255, 255), spark: C(255, 214, 120), sparkHot: C(255, 250, 220), debris: C(52, 54, 58),
  hurt: C(255, 60, 60), rotor: C(150, 200, 215), smoke: C(96, 88, 76, 0.34), dust: C(214, 196, 160, 0.4),
  spikePlate: C(96, 90, 80), spike: C(170, 166, 158), spikeTip: C(235, 232, 225),
  shellBody: C(48, 50, 56), ringFill: C(255, 60, 40, 0.16), ringEdge: C(255, 50, 40, 0.9),
  lane: C(255, 40, 40, 0.28), laneEdge: C(255, 40, 40, 0.9), stun: C(255, 222, 40),
  boss2: C(96, 40, 36), boss2Vent: C(255, 110, 40), floorLine: C(255, 50, 40, 0.5),
  bossEdge: C(120, 14, 10), boss2Hot: C(255, 72, 30), boss2Rim: C(255, 96, 36, 0.85), bossSpin: C(255, 170, 70, 0.55),
  chest: C(120, 84, 44), chestLid: C(150, 108, 58), chestTrim: C(230, 190, 70),
  burn: C(255, 140, 30), poison: C(120, 230, 60), freeze: C(190, 240, 255), pierce: C(255, 255, 255),
  heroHp: C(95, 208, 106), heroHpLow: C(255, 80, 60), heal: C(95, 208, 106), shield: C(64, 228, 255, 0.55),
  // QA-P1 fixes (RENDER-UNITS): hp track, room edge, hazard plate, mortar shadow, stun, open chest
  hpTrack: C(58, 50, 42), oob: C(70, 44, 18, 0.26), curb: C(176, 168, 150), curbTop: C(206, 199, 182),
  bag: C(170, 146, 100), bagTop: C(196, 174, 128), bagSeam: C(128, 106, 70),
  hazPlate: C(178, 158, 122), hazYellow: C(244, 194, 26), spikeRust: C(150, 70, 40),
  outside: C(0, 0, 0, 0.35), // R42 Q2-A: ground beyond the clamped room at 65% brightness (guess, FULLSCREEN-LAYOUT 1)
  shellShadow: C(60, 38, 16, 0.42), scorch: C(28, 22, 16), stunEye: C(110, 34, 30), chestIn: C(44, 28, 14), gold: C(255, 226, 122)
};
var TAU = Math.PI * 2;
V.Look = V.Look || {};   // S7: per-type look table (look-bosses.js and others fill it; load order does not matter)
function G_now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }
var reduced = false; try { reduced = !!(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

// ---------- effect steps under load (pick 15, 06-art-motion-vfx section 5) ----------
// Step 0 = full look. Each step adds to the one before. Render (render.js) decides when to move; this table decides what moves.
// Never dropped: render resolution, ink weights, hard shadows, sun wash, vignette, tells, rounds, hero hurt feedback, 60 Hz animation poses.
function tierFor(n) {
  var t = { step: n, pcap: 600, glow: 40, gain: 1, bloom: true, shimmer: true, dust: true, cMul: 1, decal: 60, trail: 60, sparkMul: 1, sparkMin: 0, ring2: true, simpleShadow: false, rim: true, shadowSmall: true };
  if (n >= 1) { t.shimmer = false; t.dust = false; }
  if (n >= 2) { t.cMul = 0.5; t.decal = 24; t.trail = 30; }
  if (n >= 3) { t.bloom = false; t.glow = 24; t.gain = 0.7; }
  if (n >= 4) { t.sparkMul = 0.7; t.sparkMin = 2; t.pcap = 220; t.ring2 = false; }
  if (n >= 5) { t.simpleShadow = true; t.rim = false; t.shadowSmall = false; }
  return t;
}
var TIERS = [0, 1, 2, 3, 4, 5].map(tierFor), T = TIERS[0], canvasMode = false;
var STAT = { prims: 0, particles: 0, glows: 0, decals: 0, ghosts: 0, peakParticles: 0, peakPrims: 0, peakGlows: 0, builds: 0 };

// own seeded RNG (mulberry32), never touches the sim's Rng
function mkRng(seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var P = { list: [], decals: [], rnd: mkRng(1), seed: null, lastFrame: -1, lastT: 0, ingested: false, roomKey: '', roomSeq: 0 }; // particles (world units)
var AN = { m: new Map(), pk: new WeakSet(), h: { x: 0, y: 0, vx: 0, vy: 0, stride: 0, kick: 0, flash: 0, hurt: 0, init: false, death: -1, dx: 0, dy: 0, dang: 0 } };
var FX = { shake: 0, shT: 0, lastShake: {}, flash: 0, bossIntro: -1, wall: 0, wdt: 0, hitMs: [], lastHitStop: 0 };
function MAXP() { return canvasMode ? Math.min(220, T.pcap) : T.pcap; }

function adj(n, mul, min) { var r = n * mul, f = Math.floor(r); if (P.rnd() < r - f) f++; return Math.max(min || 0, f); }
// classes (06 section 5): A never drops (gameplay feedback), B sparks, C litter (smoke, debris, casings), D ambient (drawn in build, not here)
function spawnBurst(x, y, n, spd, life, col, size, drag, cl, ang, cone) {
  if (cl === 'C') n = adj(n, T.cMul, 0); else if (cl === 'B') n = Math.max(Math.min(n, T.sparkMin), adj(n, T.sparkMul, 0));
  for (var i = 0; i < n && P.list.length < MAXP(); i++) {
    var a = ang != null ? ang + (P.rnd() - 0.5) * (cone || 1.2) : P.rnd() * TAU, v = spd * (0.4 + P.rnd() * 0.8);
    P.list.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: life * (0.6 + P.rnd() * 0.6), c: col, sz: size, drag: drag || 4, k: 0 });
  }
}
function spawnRing(x, y, r0, r1, life, col) {
  if (P.list.length < MAXP()) P.list.push({ x: x, y: y, t: 0, life: life, c: col, r0: r0, r1: r1, k: 1 });
}
function spawnSmoke(x, y, n, col) { // class C: soft grey puff that grows and drifts
  n = adj(n, T.cMul, 0);
  for (var i = 0; i < n && P.list.length < MAXP(); i++) P.list.push({ x: x + (P.rnd() - 0.5) * 0.15, y: y + (P.rnd() - 0.5) * 0.15, vx: (P.rnd() - 0.5) * 0.5 - 0.15, vy: -0.25 - P.rnd() * 0.3, t: 0, life: 0.5 + P.rnd() * 0.3, c: col || PAL.smoke, r0: 0.07, r1: 0.22 + P.rnd() * 0.1, k: 7 });
}
function spawnCasing(x, y, ang) { // class C: ejected brass, spins, slides and fades
  if (adj(1, T.cMul, 0) < 1 || P.list.length >= MAXP()) return;
  var a = ang + Math.PI / 2 + (P.rnd() - 0.5) * 0.8, v = 2.2 + P.rnd() * 1.4;
  P.list.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.5, c: PAL.gold, rot: P.rnd() * TAU, spin: (P.rnd() - 0.5) * 30, k: 5 });
}
function spawnGlint(x, y, col, life, size) { if (P.list.length < MAXP()) P.list.push({ x: x, y: y, t: 0, life: life || 0.35, c: col, sz: size || 0.22, k: 6 }); }
function spawnPlus(x, y, col) { if (P.list.length < MAXP()) P.list.push({ x: x, y: y, vx: 0, vy: -1.2, t: 0, life: 0.6, c: col, k: 8 }); }
function spawnDecal(x, y, r, kind) {
  var D = P.decals; if (T.decal <= 0) return;
  while (D.length >= T.decal) D.shift();
  D.push({ x: x, y: y, r: r, t: 0, life: kind === 'boss' ? 14 : 7, kind: kind, a: P.rnd() * TAU });
}
function spawnGhost(a, boss, elite) {
  if (!a) return;
  P.list.push({ k: 3, x: a.x, y: a.y, t: 0, life: boss ? 1.5 : (a.size === 'large' ? 0.7 : 0.5), type: a.type, r: a.r, ang: a.ang || 0, size: a.size, boss: boss, elite: !!elite, spin: (P.rnd() - 0.5) * 2.4, pops: boss ? [0.08, 0.22, 0.36, 0.5, 0.64, 0.8].slice() : null });
}
function shake(px, key, nobypass) {
  if (reduced) return;
  var w = FX.wall; key = key || 'x';
  if (FX.lastShake[key] != null && w - FX.lastShake[key] < 0.15) return; // refractory 150 ms per source
  FX.lastShake[key] = w; FX.shake = Math.max(FX.shake, px);
}

function eatEvents(ev, S) {
  ev = ev || [];
  for (var i = 0; i < ev.length; i++) {
    var e = ev[i], x = e.x, y = e.y;
    if (x == null || y == null) { x = S.hero.x; y = S.hero.y; }
    switch (e.k) {
      case 'hit': {
        var an = AN.m.get(e.id), boss = an && an.boss, r0 = an ? an.r : 0.3, dir = e.dir;
        if (an) { an.hurt = 1; if (dir != null) { an.hx = Math.cos(dir); an.hy = Math.sin(dir); } else { an.hx = 0; an.hy = 0; } }
        // impact on the side the round came from; sparks fly back along the round's path
        var ix = dir != null ? x - Math.cos(dir) * r0 * 0.8 : x, iy = dir != null ? y - Math.sin(dir) * r0 * 0.8 : y;
        spawnBurst(ix, iy, boss ? 8 : 5, boss ? 5 : 4, boss ? 0.28 : 0.22, PAL.spark, boss ? 0.07 : 0.06, 4, 'B', dir != null ? dir + Math.PI : null, 1.6);
        spawnRing(ix, iy, 0.04, boss ? 0.34 : 0.22, boss ? 0.16 : 0.12, PAL.sparkHot);
        if (boss) { spawnBurst(ix, iy, 3, 2.5, 0.5, PAL.debris, 0.09, 3, 'C'); shake(0.9, 'bosshit'); }
        break;
      }
      case 'crit': spawnBurst(x, y, 9, 6, 0.3, PAL.sparkHot, 0.08, 4, 'B'); spawnRing(x, y, 0.1, 0.6, 0.2, PAL.amber); spawnGlint(x, y, PAL.sparkHot, 0.3, 0.3); break;
      case 'kill': {
        var ka = AN.m.get(e.id), big = e.size === 'large' || e.boss, med = e.size === 'medium';
        if (ka) spawnGhost(ka, !!e.boss, e.elite);
        else spawnGhost({ x: x, y: y, type: e.type, r: big ? 0.9 : med ? 0.42 : 0.35, ang: 0, size: e.size }, !!e.boss, e.elite);
        spawnBurst(x, y, e.boss ? 18 : 12, 6, 0.4, PAL.spark, 0.08, 4, 'B'); spawnBurst(x, y, 6, 3, 0.6, PAL.debris, 0.1, 3, 'C');
        spawnRing(x, y, 0.2, med ? 1.2 : 1.0, 0.3, PAL.sparkHot);
        spawnSmoke(x, y, big ? 5 : med ? 3 : 2);
        spawnDecal(x, y, big ? (e.boss ? 1.5 : 0.8) : med ? 0.5 : 0.36, e.boss ? 'boss' : 'scorch');
        if (big) { spawnBurst(x, y, 10, 5, 0.6, PAL.debris, 0.12, 3, 'C'); if (T.ring2) spawnRing(x, y, 0.3, 1.6, 0.4, PAL.amber); }
        if (e.last && !e.boss) spawnRing(x, y, 0.3, 1.8, 0.45, PAL.white); // last kill of the room (B2)
        if (e.boss) { spawnRing(x, y, 0.5, 4.5, 1.0, PAL.sparkHot); FX.flash = reduced ? 0 : 0.35; shake(5, 'bossdeath'); }
        break;
      }
      case 'block': spawnBurst(x, y, 4, 3, 0.18, PAL.spark, 0.05, 4, 'B'); spawnRing(x, y, 0.05, 0.35, 0.15, PAL.spark); break; // cover stopped a round (B6)
      case 'hurt': {
        var H = AN.h; H.hurt = 1; H.flash = 0;
        // L6: the burst goes out on the side the hit came from (nearest enemy, round or shell), about 0.5 tile out, never on the Operator's centre
        var hx2 = S.hero ? S.hero.x : x, hy2 = S.hero ? S.hero.y : y, bd = 1e9, ba2 = -Math.PI / 2, srcL = [].concat(S.shots || [], S.enemies || [], S.shells || []);
        for (var si = 0; si < srcL.length; si++) { var dd = Math.hypot(srcL[si].x - hx2, srcL[si].y - hy2); if (dd < bd && dd > 0.01) { bd = dd; ba2 = Math.atan2(srcL[si].y - hy2, srcL[si].x - hx2); } }
        var bx2 = hx2 + Math.cos(ba2) * 0.5, by2 = hy2 + Math.sin(ba2) * 0.5;
        spawnBurst(bx2, by2, 8, 4, 0.3, PAL.hurt, 0.07, 4, 'A', ba2 + Math.PI, 1.6); spawnRing(bx2, by2, 0.05, 0.45, 0.25, PAL.hurt);
        var frac = S.hero && S.hero.maxHp ? Math.min(1, (e.dmg || 0) / S.hero.maxHp * 5) : 0.5;
        shake(1.5 + 1.0 * frac, 'hurt'); // spec 3.0..5.0 px, halved (M's picks)
        break;
      }
      case 'pickup':
        if (e.kind === 'repair') { spawnRing(x, y, 0.1, 0.7, 0.35, PAL.repairHi); spawnBurst(x, y, 6, 2.5, 0.5, PAL.repairHi, 0.06, 3, 'B'); spawnPlus(x, y - 0.2, PAL.repairHi); }
        else { spawnRing(x, y, 0.1, 0.5, 0.25, PAL.xp); spawnBurst(x, y, 6, 3.5, 0.3, PAL.xp, 0.055, 5, 'B'); spawnGlint(x, y, PAL.white, 0.25, 0.2); }
        break;
      case 'levelup': spawnRing(x, y, 0.3, 1.8, 0.4, PAL.xp); spawnRing(x, y, 0.1, 1.0, 0.3, PAL.white); spawnBurst(x, y, 12, 4.5, 0.4, PAL.xp, 0.07, 4, 'A'); break; // violet (XP role), under 400 ms
      case 'death': { var Hd = AN.h; Hd.death = FX.wall; Hd.dx = x; Hd.dy = y; Hd.dang = (S.hero && S.hero.ang) || 0;
        spawnBurst(x, y, 24, 7, 0.8, PAL.hurt, 0.1, 4, 'A'); spawnRing(x, y, 0.3, 2.2, 0.6, PAL.hurt); spawnBurst(x, y, 8, 3, 0.7, PAL.debris, 0.1, 3, 'C'); shake(3, 'death'); break; }
      case 'land': spawnRing(x, y, 0.2, (e.r || 1) * 1.1, 0.35, PAL.glow); spawnBurst(x, y, 10, 5, 0.45, PAL.debris, 0.1, 3, 'C'); spawnBurst(x, y, 6, 4, 0.3, PAL.spark, 0.07, 4, 'B'); spawnDecal(x, y, 0.4, 'scorch'); P.list.length < MAXP() && P.list.push({ k: 9, x: x, y: y, t: 0, life: 0.18, c: PAL.glow, r1: (e.r || 1) * 1.5 }); break;
      case 'dodge': spawnRing(x, y, 0.3, 0.8, 0.3, PAL.white); break;
      case 'split': { var sa0 = (e.angs && e.angs[0] != null) ? e.angs[0] : 0; spawnRing(x, y, 0.15, 0.9, 0.25, PAL.sparkHot); spawnBurst(x, y, 8, 4.5, 0.3, PAL.glow, 0.07, 4, 'B', sa0, 0.9); spawnBurst(x, y, 8, 4.5, 0.3, PAL.glow, 0.07, 4, 'B', sa0 + Math.PI, 0.9); break; }   // S7 E-06 seam crack
      case 'bossphase': spawnRing(x, y, 0.5, 3.0, 0.7, PAL.boss2Vent); spawnBurst(x, y, 20, 6, 0.6, PAL.boss2Vent, 0.09, 4, 'B'); spawnSmoke(x, y, 4); shake(2, 'bossphase'); break;
      case 'boss': FX.bossIntro = FX.wall; spawnRing(x, y, 0.4, 3.2, 0.9, PAL.sensor); break;
      case 'chest': spawnRing(x, y, 0.2, 1.4, 0.5, PAL.chestTrim); spawnBurst(x, y, 14, 5, 0.5, PAL.cyan, 0.07, 4, 'B'); spawnGlint(x, y, PAL.sparkHot, 0.5, 0.4); break;
      case 'win': spawnRing(x, y, 0.5, 4.0, 1.0, PAL.cyan); break;
      case 'drone': spawnBurst(x, y, 2, 2, 0.1, PAL.cyan, 0.04, 8, 'B', e.ang != null ? e.ang : 0, 0.6); break;   // GEAR: Wing Drone muzzle
      case 'guard': spawnRing(x, y, 0.1, 0.6, 0.3, PAL.shield); spawnBurst(x, y, 6, 3, 0.25, PAL.shield, 0.05, 4, 'B'); break;   // GEAR: Guard Drone ate a round
      case 'fire': {
        var Hf = AN.h; Hf.kick = 1; Hf.flash = 1;
        var fa = e.ang != null ? e.ang : (S.hero.ang || 0);
        spawnBurst(x, y, 2, 2, 0.1, PAL.roundCore, 0.05, 8, 'B', fa, 0.6);
        spawnCasing(S.hero.x, S.hero.y, fa);
        if (P.rnd() < 0.5) spawnSmoke(x + Math.cos(fa) * 0.3, y + Math.sin(fa) * 0.3, 1);
        break;
      }
    }
  }
}

function eatFx(fx) {
  if (!fx) return;
  for (var i = 0; i < fx.length; i++) {
    var f = fx[i];
    switch (f.k) {
      case 'arc': if (P.list.length < MAXP()) P.list.push({ k: 2, x: f.x1 != null ? f.x1 : f.x, y: f.y1 != null ? f.y1 : f.y, x2: f.x2 != null ? f.x2 : f.x, y2: f.y2 != null ? f.y2 : f.y, t: 0, life: 0.15, c: PAL.freeze }); break;
      case 'strike': case 'blast': spawnRing(f.x, f.y, 0.1, f.r || 1.2, 0.3, PAL.burn); spawnBurst(f.x, f.y, 8, 5, 0.3, PAL.sparkHot, 0.07, 4, 'B'); break;
      case 'heal': spawnRing(f.x, f.y, 0.2, 0.8, 0.35, PAL.heal); spawnPlus(f.x, f.y - 0.2, PAL.repairHi); break;
      case 'dodge': spawnRing(f.x, f.y, 0.3, 0.7, 0.25, PAL.white); break;
      case 'orb': case 'shield': break; // persistent, drawn from S.fx each frame
      default: if (f.x != null) spawnRing(f.x, f.y, 0.1, 0.5, 0.2, PAL.cyan);
    }
  }
}

function stepParticles(dt) {
  var L = P.list, j = 0, D = P.decals, i, p;
  for (i = 0; i < L.length; i++) {
    p = L[i]; p.t += dt;
    if (p.t >= p.life) continue;
    if (p.k === 0) { var f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; p.x += p.vx * dt; p.y += p.vy * dt; }
    else if (p.k === 5) { var f5 = Math.max(0, 1 - 5 * dt); p.vx *= f5; p.vy *= f5; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; }
    else if (p.k === 7 || p.k === 8) { p.vx *= Math.max(0, 1 - 2 * dt); p.x += p.vx * dt; p.y += p.vy * dt; }
    else if (p.k === 3 && p.pops) { // boss death: staged pops across the hull
      var u = p.t / p.life;
      while (p.pops.length && u >= p.pops[0]) {
        p.pops.shift();
        var ox = (P.rnd() - 0.5) * p.r * 1.5, oy = (P.rnd() - 0.5) * p.r * 1.5;
        spawnRing(p.x + ox, p.y + oy, 0.15, 0.9, 0.3, PAL.sparkHot); spawnBurst(p.x + ox, p.y + oy, 8, 5, 0.4, PAL.boss2Hot, 0.09, 4, 'B'); spawnBurst(p.x + ox, p.y + oy, 4, 3, 0.6, PAL.debris, 0.11, 3, 'C');
        spawnSmoke(p.x + ox, p.y + oy, 2);
      }
    }
    L[j++] = p;
  }
  L.length = j; j = 0;
  for (i = 0; i < D.length; i++) { D[i].t += dt; if (D[i].t < D[i].life) D[j++] = D[i]; }
  D.length = j;
}

// per-entity pose state (idle, move lean, fire kick, hurt jitter), updated from the sim clock S.t so hit-stop and pause freeze it
function animStep(S, dt) {
  var E = S.enemies || [], i, k = Math.min(1, dt * 14);
  for (i = 0; i < E.length; i++) {
    var e = E[i], a = AN.m.get(e.id);
    if (!a) { a = { x: e.x, y: e.y, vx: 0, vy: 0, st: e.st, kick: 0, hurt: 0, hx: 0, hy: 0, age: 0, dustT: 0 }; AN.m.set(e.id, a); }
    a.vx += ((e.x - a.x) / dt - a.vx) * k; a.vy += ((e.y - a.y) / dt - a.vy) * k; a.x = e.x; a.y = e.y;
    if (e.st === 'act' && a.st !== 'act') a.kick = 1;
    a.st = e.st; a.kick = Math.max(0, a.kick - dt * 7); a.hurt = Math.max(0, a.hurt - dt * 9); a.age += dt;
    a.r = e.r; a.ang = e.ang; a.type = e.type; a.boss = isBossE(e); a.size = e.size;
    // chargers throw dust while running (class C)
    if (e.type === 'E-05' && e.st === 'move' && Math.hypot(a.vx, a.vy) > 2.5) { a.dustT -= dt; if (a.dustT <= 0) { a.dustT = 0.12; spawnSmoke(e.x - Math.cos(e.ang || 0) * 0.3, e.y - Math.sin(e.ang || 0) * 0.3, 1, PAL.dust); } }
  }
  var h = S.hero, H = AN.h;
  if (h) {
    if (!H.init) { H.x = h.x; H.y = h.y; H.init = true; }
    H.vx += ((h.x - H.x) / dt - H.vx) * k; H.vy += ((h.y - H.y) / dt - H.vy) * k; H.x = h.x; H.y = h.y;
    var sp = Math.hypot(H.vx, H.vy);
    if (h.moving) { H.stride += sp * dt * 2.1; if (sp > 1) { H.dustT = (H.dustT || 0) - dt; if (H.dustT <= 0) { H.dustT = 0.16; spawnSmoke(h.x - H.vx / sp * 0.15, h.y + 0.12, 1, PAL.dust); } } }
    H.kick = Math.max(0, H.kick - dt * 8); H.flash = Math.max(0, H.flash - dt * 14); H.hurt = Math.max(0, H.hurt - dt * 7);
  }
}
function sweepAnim(S) {
  if (!AN.m.size) return;
  var live = {}, E = S.enemies || [], i;
  for (i = 0; i < E.length; i++) live[E[i].id] = 1;
  AN.m.forEach(function (a, id) { if (!live[id]) AN.m.delete(id); });
}

// --- primitive helpers (all take world coords via the view) ---
var out, vw, sh = { x: 0, y: 0 }, shx = 0, shy = 0, GL = [], glN = 0;
function X(x) { return vw.ox + x * vw.s + shx; }   // shx/shy: one-channel screen shake, play field only, never rotates
function Y(y) { return vw.oy + y * vw.s + shy; }
function circ(x, y, r, c) { out.push({ p: 'circle', x: x, y: y, r: r, c: c }); }
function ring(x, y, r, lw, c, a0, a1) { var o = { p: 'ring', x: x, y: y, r: r, lw: lw, c: c }; if (a0 != null) { o.a0 = a0; o.a1 = a1; } out.push(o); }
function rect(x, y, w, h, c, rot) { out.push({ p: 'rect', x: x, y: y, w: w, h: h, rot: rot || 0, c: c }); }
function line(x1, y1, x2, y2, lw, c) { out.push({ p: 'line', x1: x1, y1: y1, x2: x2, y2: y2, lw: lw, c: c }); }
function ngon(x, y, r, n, rot, c) { out.push({ p: 'ngon', x: x, y: y, r: r, n: n, rot: rot || 0, c: c }); }
function grad(x, y, w, h, c, c2, rot) { out.push({ p: 'grad', x: x, y: y, w: w, h: h, rot: rot || 0, c: c, c2: c2 }); }
function rgrad(x, y, r, c, c2, add) { var o = { p: 'rgrad', x: x, y: y, r: r, c: c, c2: c2 }; if (add) o.add = true; out.push(o); }
// glow sprite (cached-sprite look: one radial gradient). Collected, then flushed by priority up to the tier cap (40 / 24 / 12).
// prio 3 = gameplay light (rounds, muzzle), 2 = sensors and tells, 1 = pickups and ambience. Colour fades to its own alpha 0, never to grey.
function glow(x, y, r, c, a, prio, add) { GL.push({ x: x, y: y, r: r, c: c, a: a, pr: prio || 1, add: !!add }); }
function flushGlows() {
  var cap = canvasMode ? Math.min(12, T.glow) : T.glow, n = GL.length;
  if (n > cap) GL.sort(function (p, q) { return q.pr - p.pr; });
  var m = Math.min(n, cap), i, g;
  for (i = 0; i < m; i++) {
    g = GL[i];
    if (T.bloom && g.pr >= 3) rgrad(g.x, g.y, g.r * 2.6, [g.c[0], g.c[1], g.c[2], g.a * 0.22], [g.c[0], g.c[1], g.c[2], 0], g.add);   // bloom stand-in: wide soft halo (step 0..2 only)
    rgrad(g.x, g.y, g.r, [g.c[0], g.c[1], g.c[2], Math.min(1, g.a * T.gain)], [g.c[0], g.c[1], g.c[2], 0], g.add);
  }
  STAT.glows = m; if (m > STAT.peakGlows) STAT.peakGlows = m;
  GL.length = 0;
}
function withA(c, a) { return [c[0], c[1], c[2], c[3] * a]; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; }
// outlined shapes: dark shape 1 px larger, then the fill
var OL = 1.25;   // structure edge; units set 1.6 (small 1.3), bosses 2.4 while they draw (token weights at 344 wide)
function oCirc(x, y, r, c) { circ(x, y, r + OL, PAL.ink); circ(x, y, r, c); }
function oRect(x, y, w, h, c, rot) { rect(x, y, w + 2 * OL, h + 2 * OL, PAL.ink, rot); rect(x, y, w, h, c, rot); }
function oNgon(x, y, r, n, rot, c) { ngon(x, y, r + OL / Math.cos(Math.PI / n), n, rot, PAL.ink); ngon(x, y, r, n, rot, c); }

// raycast in world units against solids and room bounds (for the aim line)
function rayLen(S, x, y, ang, max) {
  var dx = Math.cos(ang), dy = Math.sin(ang), sol = S.room.solids || [], W = S.room.w || S.cols || 9, H = S.room.h || 15;
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

function drawSolidShadow(q, s, RW, RH) {
  // QA-VISUAL D4: the hard shadow is clipped to the room rect, so the top wall's shadow never spills onto the side strip or the dark ground
  var x0 = Math.max(X(q.x) + sh.x, X(0)), x1 = Math.min(X(q.x + q.w) + sh.x, X(RW)), y0 = Math.max(Y(q.y) + sh.y, Y(0)), y1 = Math.min(Y(q.y + q.h) + sh.y, Y(RH));
  if (x1 > x0 && y1 > y0) rect((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, PAL.shadow);
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
    // C16 / AN-401: lamps red -> dark (first 0.4 s of clear) -> green; chevrons white-steel. Render only: the sim door is already passable.
    var lamp = S.phase === 'clear' && !S.bossWin && (S.clearT || 0) < 0.4 ? PAL.metalDark : PAL.doorLightOpen;
    rect(cx, cy, w, h, PAL.doorOpen);
    rect(cx, cy + h * 0.25, w - 4, h * 0.5, C(70, 60, 44));
    // chevrons pointing north
    for (var k = 0; k < 2; k++) {
      var yy = cy + h * 0.15 - k * 6;
      line(cx - 6, yy + 4, cx, yy - 2, 2, PAL.chevron); line(cx, yy - 2, cx + 6, yy + 4, 2, PAL.chevron);
    }
    circ(cx - w / 2 + 4, cy, 2.5, lamp); circ(cx + w / 2 - 4, cy, 2.5, lamp);
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

var RIMR = { 'E-01': 0.5, 'E-02': 0.62, 'E-03': 0.8, 'E-04': 0.66, 'E-05': 0.62, 'B-01': 0.92,
  'E-06': 0.86, 'E-06h': 0.8, 'E-07': 0.84, 'E-08': 0.5, 'B-02': 0.9, 'B-03': 0.9, 'B-03V': 0.9, 'B-03s': 0.9, 'B-04': 0.9 };   // S7: V.Look[type].rimR wins
// S7 boss test: any e.boss (set by the AI in init), B-01 kept for old ghosts / saves. Draw-only.
function isBossE(e) { return !!e.boss || e.type === 'B-01'; }
// S7 look hook: V.Look[type] is a body function or { body, ground, shadow, over, rimR, hp }. See LOOK-HOOK.md.
function lookOf(e) { var L = V.Look && V.Look[e.type]; if (!L) return null; return typeof L === 'function' ? { body: L } : L; }
function drawEnemy(S, e, s, t) {
  var an = e.dead == null ? AN.m.get(e.id) : null, isBoss = isBossE(e), LK = lookOf(e);
  if (e.under === true && !(e.dead > 0)) return;   // S7 E-07 underground: mound / crack ring are ground-layer (drawMachineGround)
  var x = X(e.x), y = Y(e.y), rr = (e.r || 0.4) * s, flash = e.flashT > 0, tell = e.st === 'tell', n0 = out.length;
  var elite = e.elite === true && !isBoss && /^E-0[2-578]$/.test(e.type);   // R64: +10% size, white-steel rim, one extra fin/antenna, two sensor lights; no stripes, gold or glow
  if (elite) rr *= 1.1;
  OL = isBoss ? 2.4 : (e.type === 'E-01' ? 1.3 : 1.6);
  if (an) {
    // pose: idle hover (flyer) or servo hum, lean into the move, kick back on the shot, jitter away from the hit. Machines never squash.
    var fly = e.type === 'E-01', aim = e.aimAng != null ? e.aimAng : (e.ang || 0);
    y += Math.sin(t * (fly ? 3.2 : 2.0) + e.id * 1.7) * (fly ? 1.8 : 0.45);
    var lx = Math.max(-2.2, Math.min(2.2, an.vx * 0.55)), ly = Math.max(-2.2, Math.min(2.2, an.vy * 0.55));
    x += lx; y += ly;
    if (an.kick > 0) { var kk = an.kick * rr * (isBoss ? 0.07 : 0.16); x -= Math.cos(aim) * kk; y -= Math.sin(aim) * kk; }
    if (an.hurt > 0) { var hk = an.hurt * (isBoss ? 1.0 : 1.8); x += an.hx * hk; y += an.hy * hk; }
  }
  var body = PAL.metal, lite = PAL.metalLite, dark = PAL.metalDark, eye = PAL.sensor;
  if (e.st === 'spawn') { var k = Math.min(1, e.tell01 || 0.5); body = withA(body, 0.5); lite = withA(lite, 0.5); }
  if (e.type === 'E-01' && tell) {
    // yellow flash: whole body pulses toward yellow, faster as the lunge nears
    var tt = e.tell01 || 0, pulse = 0.5 + 0.5 * Math.sin(t * (18 + 30 * tt));
    var m = 0.45 + 0.55 * pulse;
    body = mix(body, PAL.tellYellow, m); lite = mix(lite, PAL.tellYellow, m);
  }
  // QA-P1 D12: the boss gets a soft, short hull tint instead of the full white flash (barrels, core and tells stay readable)
  var hit = 0;
  if (flash && isBoss) { hit = Math.max(0, (e.flashT - 0.04) / 0.06); flash = false; }
  if (flash) { body = PAL.white; lite = PAL.white; dark = PAL.white; eye = PAL.white; }
  var dk = e.dead || 0;
  if (dk > 0) { // death: scorch the hull, sensor dies, then it fades (AN-203)
    var sc = Math.min(1, dk * 1.6) * 0.75;
    body = mix(body, PAL.ink, sc); lite = mix(lite, PAL.metalDark, sc); dark = mix(dark, PAL.ink, sc * 0.6);
    eye = dk > 0.3 ? PAL.metalDark : eye;
    if (dk < 0.12 && !isBoss) { body = PAL.white; lite = PAL.white; }   // L5: the boss never fills white; it gets a warm rim below
  }
  var a = e.ang || 0, ca = Math.cos(a), sa = Math.sin(a);
  var C2 = { body: body, lite: lite, dark: dark, eye: eye, core: flash ? PAL.white : (dk > 0.3 ? PAL.metalDark : PAL.sensorCore), hit: hit, an: an, t: t, dk: dk, flash: flash, tell: tell, elite: elite, boss: isBoss, B: isBoss ? (bossAttack(S, e) || {}) : null };
  if (LK && LK.body) LK.body(V.SceneKit, S, e, x, y, rr, t, C2);
  else if (e.type === 'E-04') drawE04(e, x, y, rr, t, C2);
  else if (e.type === 'E-06') drawE06(e, x, y, rr, t, C2);
  else if (e.type === 'E-06h') drawE06h(e, x, y, rr, t, C2);
  else if (e.type === 'E-07') drawE07(e, x, y, rr, t, C2);
  else if (e.type === 'E-08') drawE08(e, x, y, rr, t, C2);
  else if (e.type === 'E-05') drawE05(e, x, y, rr, t, C2);
  else if (isBoss) drawB01(S, e, x, y, rr, t, C2);
  else if (e.type === 'E-01') {
    // small round drone with rotor ring and four rotor pods
    var spinR = dk > 0 ? 0 : t * (tell ? 24 : (e.st === 'move' ? 15 : 10));
    for (var i = 0; i < 4; i++) {
      var ra = a + Math.PI / 4 + (i * Math.PI) / 2, px = x + Math.cos(ra) * rr * 0.92, py = y + Math.sin(ra) * rr * 0.92;
      line(x, y, px, py, 3, flash ? PAL.white : PAL.ink);
      oCirc(px, py, rr * 0.36, dark);
      ring(px, py, rr * 0.28, 1.2, flash ? PAL.white : lite);
      if (dk === 0) { var bq = spinR + i * 1.9; ring(px, py, rr * 0.3, 1.6, withA(PAL.rotor, 0.55), bq, bq + 2.2); } // spinning blur arc on each rotor pod
    }
    oCirc(x, y, rr * 0.55, body);
    circ(x + ca * rr * 0.15, y + sa * rr * 0.15, rr * 0.22, eye);
    circ(x + ca * rr * 0.18, y + sa * rr * 0.18, rr * 0.08, flash ? PAL.white : PAL.sensorCore);
    if (tell) ring(x, y, rr * (1.25 + 0.25 * (e.tell01 || 0)), 2.5, PAL.tellYellow);
  } else if (e.type === 'E-02') {
    // square gun drone, one barrel along aimAng while aiming
    var ga = (tell || e.st === 'act') && e.aimAng != null ? e.aimAng : a + (dk > 0 ? 0 : Math.sin(t * 1.6 + e.id) * 0.1), cg = Math.cos(ga), sg = Math.sin(ga);
    var bl = rr * (1.25 - (an ? an.kick * 0.18 : 0));
    oRect(x + cg * bl * 0.55, y + sg * bl * 0.55, bl, rr * 0.3, dark, ga);
    oRect(x, y, rr * 1.5, rr * 1.5, body, a);
    rect(x, y, rr * 0.9, rr * 0.9, lite, a);
    circ(x, y, rr * 0.3, eye);
    circ(x, y, rr * 0.11, flash ? PAL.white : PAL.sensorCore);
  } else if (e.type === 'E-03') {
    // E-03 hexagon turret, three barrels in a fan
    var ta = (e.aimAng != null ? e.aimAng : a) + (!tell && dk === 0 ? Math.sin(t * 1.1 + e.id) * 0.12 : 0), gl3 = tell ? (e.tell01 || 0) : 0;
    for (var b = -1; b <= 1; b++) {
      var ba = ta + b * (25 * Math.PI / 180), cb = Math.cos(ba), sb = Math.sin(ba);
      oRect(x + cb * rr * 0.95, y + sb * rr * 0.95, rr * 0.9, rr * 0.26, dark, ba);
      if (gl3 > 0) {
        var gx = x + cb * rr * 1.42, gy = y + sb * rr * 1.42;
        circ(gx, gy, 3 + 6 * gl3, withA(PAL.glow, 0.35 + 0.3 * gl3));
        circ(gx, gy, 2 + 3 * gl3, mix(PAL.glow, PAL.sparkHot, gl3));
      }
    }
    oNgon(x, y, rr, 6, Math.PI / 6, body);
    ngon(x, y, rr * 0.62, 6, Math.PI / 6, lite);
    circ(x, y, rr * 0.3, gl3 > 0 ? mix(eye, PAL.sparkHot, gl3) : eye);
    circ(x, y, rr * 0.12, flash ? PAL.white : PAL.sensorCore);
  }
  if (elite && dk < 0.3) drawEliteTrim(e, x, y, rr, a, flash, eye);
  // lit look: pale catch-light on the sun side of the hull (upper left), sensor gl3, muzzle flash on the shot
  if (T.rim && dk < 0.3 && e.under !== true) ring(x, y, rr * ((LK && LK.rimR) || RIMR[e.type] || 0.7), 1.3, PAL.rim, Math.PI * 1.04, Math.PI * 1.46);
  if (dk < 0.3 && e.st !== 'spawn') glow(x, y, rr * (tell ? 0.7 : 0.5), PAL.sensor, tell ? 0.26 : 0.14, 2);
  if (an && an.kick > 0.45) {
    var ma = e.aimAng != null ? e.aimAng : (e.ang || 0), mr = rr * (isBoss ? 1.5 : 1.4);
    glow(x + Math.cos(ma) * mr, y + Math.sin(ma) * mr, rr * (isBoss ? 0.9 : 0.7), PAL.shotCore, 0.8 * an.kick, 3, true);
  }
  drawStatus(e, x, y, rr, t);
  if (!isBoss && dk === 0 && !(LK && LK.hp === false) && e.under !== true) hpBar(x, y, rr * (e.type === 'E-01' ? 1.3 : 1.05), e.hp, e.maxHp);
  if (isBoss && dk > 0 && dk < 0.6) ring(x, y, rr * 1.1, 3, withA(PAL.boss2Rim, 1 - dk / 0.6));
  if (dk > 0.55) { var fa = Math.max(0, 1 - (dk - 0.55) / 0.45); for (var qi = n0; qi < out.length; qi++) { var qc = out[qi].c; out[qi].c = [qc[0], qc[1], qc[2], qc[3] * fa]; } }   // fade out
  OL = 1.25;
}
function drawGhosts(S, s, t) {
  var L = P.list;
  for (var i = 0; i < L.length; i++) {
    var p = L[i]; if (p.k !== 3) continue;
    var u = p.t / p.life, g = { id: -1, type: p.type, x: p.x, y: p.y, r: p.r * (1 - 0.12 * u), ang: p.ang + p.spin * u, st: 'dead', dead: Math.max(0.001, reduced ? Math.min(1, u * 1.4) : u), boss: p.boss, elite: p.elite, size: p.size, flashT: 0, hp: 0, maxHp: 0, tell01: 0 };
    drawEnemy(S, g, s, t);
  }
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
  if (e.type === 'E-08') return drawSniperAim(S, e, s);
  if ((e.type !== 'E-02' && e.type !== 'E-06' && e.type !== 'E-06h') || e.st !== 'tell' || e.aimAng == null) return;
  if (e.type !== 'E-02') {   // E-06 twin shot: same aim-line language as E-02, lock = e.locked (last 0.2 s)
    var t6 = e.tell01 || 0, lk = e.locked === true || t6 > 0.7, L6 = rayLen(S, e.x, e.y, e.aimAng, 20);
    var x6 = X(e.x), y6 = Y(e.y), q6 = innerClip(x6, y6, X(e.x + Math.cos(e.aimAng) * L6), Y(e.y + Math.sin(e.aimAng) * L6), S), ex6 = q6[0], ey6 = q6[1];
    line(x6, y6, ex6, ey6, 3, withA(PAL.ink, 0.25));
    if (lk) { line(x6, y6, ex6, ey6, 2.2, PAL.aimLock); circ(ex6, ey6, 2.5, PAL.aimLock); }
    else dashLine(x6, y6, ex6, ey6, 1.3, PAL.aim, 6, 4, -FX.wall * 30);
    return;
  }
  var t = e.tell01 || 0, locked = t > 0.66, L = rayLen(S, e.x, e.y, e.aimAng, 20);
  var x = X(e.x), y = Y(e.y), ex = X(e.x + Math.cos(e.aimAng) * L), ey = Y(e.y + Math.sin(e.aimAng) * L);
  line(x, y, ex, ey, locked ? 2.2 : 1.2, locked ? PAL.aimLock : PAL.aim);
  if (locked) circ(ex, ey, 2.5, PAL.aimLock);
}

function drawHero(S, s, t, ghost) {
  var h = S.hero, H = AN.h, x = X(h.x), y = Y(h.y), rr = (h.r || 0.28) * s, a = h.ang || 0, wob = 0, dying = ghost != null;
  if (dying) { x = X(H.dx); y = Y(H.dy); a = H.dang + ghost * 2.6; }
  // QA-P1 D2: when an enemy body overlaps the Operator, cut a sand patch with an ink rim under it, so the
  // Operator (blinking at 35% too) never reads through the drones under it. Drawn before n0: not blinked.
  var E = S.enemies || [], hr = h.r || 0.28;
  if (!dying) for (var j = 0; j < E.length; j++) {
    var e = E[j], er = (e.r || 0.4) * (e.type === 'E-01' ? 1.3 : 1.05); if (e.under === true) continue;
    if (Math.hypot(e.x - h.x, e.y - h.y) < er + hr + 0.08) { circ(x, y, rr + 5, withA(PAL.ink, 0.7)); circ(x, y, rr + 3.5, PAL.ground); break; }
  }
  // pose: breathing at rest, stride bob and lean while walking, rifle kick on the shot, red tint when hurt
  var moving = !dying && h.moving, br = Math.sin(t * 2.4) * (moving ? 0 : 1);
  var sb = moving ? Math.abs(Math.sin(H.stride * 3.2)) : 0, sw = moving ? Math.sin(H.stride * 3.2) : 0;
  y += -sb * 1.3 + br * 0.35;
  if (moving) { var sp = Math.hypot(H.vx, H.vy) || 1; x += H.vx / sp * 0.9; y += H.vy / sp * 0.9; }
  var kick = dying ? 0 : H.kick, K = kick * rr * 0.3, sc = dying ? Math.max(0.05, 1 - ghost * 0.8) : 1 + br * 0.012;
  var R = rr * sc, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
  // L2: VFX-302 curve, 2.5 Hz sine timed from the hit: starts at 100%, dips to 35% once, back to 100% at 0.4 s, second dip faded out so it ends at 100%
  var inv = (S.tune && S.tune.INVULN) || 0.6, tau = inv - h.invulnT, blink = !dying && h.invulnT > 0, n0 = out.length, blinkA = 1;
  if (blink) { var dip = 0.5 - 0.5 * Math.cos(TAU * 2.5 * tau), env = tau < 0.4 ? 1 : Math.max(0, (inv - tau) / Math.max(0.01, inv - 0.4)); blinkA = 1 - 0.65 * dip * env; }
  OL = 1.6;
  var tintHurt = dying ? Math.min(1, ghost * 2) : H.hurt;
  function tint(c) { return tintHurt > 0 ? mix(c, PAL.hurt, 0.3 * Math.min(1, tintHurt)) : c; }   // L6: partial tint, the dome keeps its two-step shading and the slit
  // rifle (long, straight): kicks back along its own axis on the shot
  var gx = x + ca * (rr * 1.15 - K) + px * R * 0.35, gy = y + sa * (rr * 1.15 - K) + py * R * 0.35;
  oRect(gx, gy, R * 1.5, R * 0.32, tint(PAL.gunLo), a); rect(gx - ca * R * 0.05, gy - sa * R * 0.05, R * 1.35, R * 0.12, PAL.gunHi, a);
  circ(x + ca * (rr * 1.85 - K) + px * R * 0.35, y + sa * (rr * 1.85 - K) + py * R * 0.35, R * 0.13, PAL.cyan);
  // pack behind the shoulders, capsule torso (shoulder pads either side), swinging with the stride
  oRect(x - ca * R * 0.62, y - sa * R * 0.62, R * 0.7, R * 1.3, tint(mix(PAL.heroPack, PAL.ink, 0.3)), a);
  var tx = x + px * sw * R * 0.06, ty = y + py * sw * R * 0.06;
  oRect(tx, ty, R * 0.95, R * 1.5, tint(PAL.heroSleeve), a);
  oCirc(tx + px * R * 0.78, ty + py * R * 0.78, R * 0.44, tint(PAL.heroDark)); circ(tx + px * R * 0.78, ty + py * R * 0.78, R * 0.18, tint(PAL.heroPad));
  oCirc(tx - px * R * 0.78, ty - py * R * 0.78, R * 0.44, tint(PAL.heroDark)); circ(tx - px * R * 0.78, ty - py * R * 0.78, R * 0.18, tint(PAL.heroPad));
  oCirc(tx, ty, R * 0.9, tint(PAL.heroBody));
  ring(tx, ty, R * 0.9, 1.6, PAL.cyan);   // --pv-hero-ring
  // canonical helmet (P-02): smooth tan dome, one tall cyan slit in a narrow dark socket, round ear disc, thin antenna stub
  var hx = tx - ca * R * 0.08, hy = ty - sa * R * 0.08;
  oCirc(hx, hy, R * 0.56, tint(PAL.helmLo)); circ(hx - R * 0.06, hy - R * 0.07, R * 0.45, tint(PAL.helmHi));
  var vx = hx + ca * R * 0.34, vy = hy + sa * R * 0.34;
  rect(vx, vy, R * 0.28, R * 0.6, PAL.ink, a); rect(vx + ca * R * 0.02, vy + sa * R * 0.02, R * 0.14, R * 0.5, PAL.visor, a);
  circ(hx + px * R * 0.5, hy + py * R * 0.5, R * 0.14, tint(PAL.helmLo));   // ear disc
  var aw = Math.sin(t * 3 + sw * 2) * (moving ? 0.5 : 0.15), axx = hx - ca * R * 0.4 - px * R * 0.35, ayy = hy - sa * R * 0.4 - py * R * 0.35;
  line(axx, ayy, axx - ca * R * 0.55 + px * aw * R * 0.4, ayy - sa * R * 0.55 + py * aw * R * 0.4, 1.2, PAL.ink);
  if (T.rim && !dying) ring(hx, hy, R * 0.42, 1.2, PAL.rim, Math.PI * 1.02, Math.PI * 1.5);
  if (blink && blinkA < 1) for (var i = n0; i < out.length; i++) { var c = out[i].c; out[i].c = [c[0], c[1], c[2], c[3] * blinkA]; }
  if (dying && ghost > 0.5) { var fa = Math.max(0, 1 - (ghost - 0.5) / 0.5); for (var q = n0; q < out.length; q++) { var qc = out[q].c; out[q].c = [qc[0], qc[1], qc[2], qc[3] * fa]; } }
  OL = 1.25;
  if (!dying) {
    glow(vx, vy, R * 0.55, PAL.visor, 0.35, 2);
    if (H.flash > 0.2) glow(x + ca * (rr * 2.0 - K), y + sa * (rr * 2.0 - K) + 0, R * 0.9, PAL.sparkHot, 0.9 * H.flash, 3, true);   // muzzle flash (VFX-001), 6 at once at most, class A
    if (H.flash > 0.45) { var mx = x + ca * (rr * 2.1), my = y + sa * (rr * 2.1); rect(mx, my, R * (0.5 + 1.0 * H.flash), R * 0.14, PAL.sparkHot, a); rect(mx, my, R * (0.5 + 1.0 * H.flash), R * 0.14, PAL.sparkHot, a + Math.PI / 2 * 0); }
  }
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
  var x = X(pk.x), y = Y(pk.y) + Math.sin(t * 4 + pk.x * 3) * 1.5, ph = (t * 0.8 + pk.x * 0.37 + pk.y * 0.21) % 1;
  OL = 1.25;
  if (pk.kind === 'repair') {
    oRect(x, y, 13, 11, PAL.repair);
    rect(x, y, 3, 7, PAL.repairCross); rect(x, y, 7, 3, PAL.repairCross);
    glow(x, y, 11, PAL.repairHi, 0.4, 1);
  } else {
    var r = pk.v >= 8 ? 6.5 : 5;
    oNgon(x, y, r, 4, t * 2 + pk.y, PAL.xp);
    circ(x - 1, y - 1, r * 0.3, PAL.white);
    glow(x, y, r * 2.2, PAL.xp, 0.38, 1);
  }
  if (ph < 0.18) { var gl = Math.sin(ph / 0.18 * Math.PI) * 5.5; rect(x + 3, y - 3, 1.4, gl, PAL.white); rect(x + 3, y - 3, gl, 1.4, PAL.white); }   // glint, once a second
}

function drawParticles(s, S) {
  for (var i = 0; i < P.list.length; i++) {
    var p = P.list[i], u = p.t / p.life, al = 1 - u;
    if (p.k === 3) continue; // ghosts draw with the machines
    if (p.k === 2) { line(X(p.x), Y(p.y), X(p.x2), Y(p.y2), 2, withA(p.c, al)); continue; }
    if (p.k === 1) {
      var r = (p.r0 + (p.r1 - p.r0) * u) * s;
      ring(X(p.x), Y(p.y), r + 1.2 * al, 4 * al + 1.2, withA(PAL.ink, 0.35 * al));   // dark under-stroke so a bright ring reads on sand (V3)
      ring(X(p.x), Y(p.y), r, 2.5 * al + 0.5, withA(p.c, al));
    } else if (p.k === 5) {
      rect(X(p.x), Y(p.y), 3.2, 1.8, withA(p.c, al), p.rot); rect(X(p.x), Y(p.y) + 1, 3.2, 1, withA(PAL.ink, 0.3 * al), p.rot);
    } else if (p.k === 6) {
      var gs = p.sz * s * (0.4 + 0.6 * Math.sin(Math.min(1, u * 1.2) * Math.PI)), gx = X(p.x), gy = Y(p.y);
      line(gx - gs, gy, gx + gs, gy, 1.6, withA(p.c, al)); line(gx, gy - gs, gx, gy + gs, 1.6, withA(p.c, al));
    } else if (p.k === 7) {
      circ(X(p.x), Y(p.y), (p.r0 + (p.r1 - p.r0) * u) * s, withA(p.c, p.c[3] * al));
    } else if (p.k === 8) {
      var px8 = X(p.x), py8 = Y(p.y), a8 = Math.min(1, al * 1.6);
      rect(px8, py8, 3, 9, withA(PAL.ink, 0.5 * a8)); rect(px8, py8, 9, 3, withA(PAL.ink, 0.5 * a8));
      rect(px8, py8, 2, 8, withA(p.c, a8)); rect(px8, py8, 8, 2, withA(p.c, a8));
    } else if (p.k === 9) {
      glow(X(p.x), Y(p.y), (0.3 + 0.7 * u) * p.r1 * s, p.c, 0.6 * al, 3, true);
    } else {
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy), sz = Math.max(1.2, p.sz * s * (1 - u * 0.5));
      if (sp > 1.5) {
        var k = Math.min(0.05, 0.6 / sp);
        line(X(p.x - p.vx * k), Y(p.y - p.vy * k), X(p.x), Y(p.y), sz, withA(p.c, al));
      } else circ(X(p.x), Y(p.y), sz * 0.6, withA(p.c, al));
    }
  }
}
function drawDecals(s) {
  var D = P.decals;
  for (var i = 0; i < D.length; i++) {
    var d = D[i], u = d.t / d.life, al = u < 0.7 ? 1 : (1 - u) / 0.3, x = X(d.x), y = Y(d.y), r = d.r * s;
    circ(x, y, r, withA(PAL.scorch, 0.42 * al));
    circ(x + r * 0.15, y + r * 0.1, r * 0.55, withA(PAL.scorch, 0.35 * al));
    if (d.kind === 'boss') for (var k = 0; k < 5; k++) { var aa = d.a + k * 1.26; line(x + Math.cos(aa) * r * 0.5, y + Math.sin(aa) * r * 0.5, x + Math.cos(aa) * r * 1.15, y + Math.sin(aa) * r * 1.15, 1.2, withA(PAL.scorch, 0.4 * al)); }
  }
}
// class D ambience (step 0 only): dust motes drifting down-right with the sun, heat-shimmer streaks over the hot ground. Pure functions of S.t.
function drawAmbient(S, s, t, RW, RH) {
  if (reduced) return;
  var x0 = X(0), y0 = Y(0), W = RW * s, H = RH * s, i;
  if (T.dust) for (i = 0; i < 12; i++) {
    var u = (t * (0.05 + (i % 4) * 0.012) + i * 0.173) % 1, v = (t * 0.03 + i * 0.311 + Math.sin(t * 0.4 + i) * 0.02) % 1;
    circ(x0 + u * W, y0 + v * H, 1 + (i % 3) * 0.35, [1, 0.96, 0.82, 0.32 + 0.2 * Math.sin(t * 1.3 + i)]);
  }
  if (T.shimmer) for (i = 0; i < 6; i++) {
    var yy = y0 + ((i * 0.37 + t * 0.018) % 1) * H * 0.7 + 14, xx = x0 + ((i * 0.61) % 1) * W, wv = Math.sin(t * 1.7 + i * 2.1) * 6;
    line(xx + wv, yy, xx + wv + 46 + 14 * (i % 3), yy + Math.sin(t * 2.3 + i) * 1.2, 1.2, [1, 0.97, 0.88, 0.1]);
  }
}
// grade over the whole screen: edge vignette (--pv-vignette), pulses to about 15% on the boss intro (AN-301)
function drawVignette(S) {
  var w = vw.w, h = vw.h, bw = Math.min(w, h) * 0.34, a = 0.24, bi = FX.wall - FX.bossIntro;
  if (FX.bossIntro >= 0 && bi >= 0 && bi < 1.5 && !reduced) a += 0.1 * Math.sin(Math.min(1, bi / 0.6) * Math.PI / 2) * (1 - Math.max(0, (bi - 0.9) / 0.6));
  var c1 = [PAL.vig[0], PAL.vig[1], PAL.vig[2], a], c0 = [PAL.vig[0], PAL.vig[1], PAL.vig[2], 0];
  grad(w / 2, bw / 2, w, bw, c1, c0, 0);               // top
  grad(w / 2, h - bw / 2, w, bw, c0, c1, 0);           // bottom
  grad(bw / 2, h / 2, h, bw, c1, c0, -Math.PI / 2);    // left (local +y points right)
  grad(w - bw / 2, h / 2, h, bw, c0, c1, -Math.PI / 2); // right
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
    // QA-P1 D5: floor hazard, not cover: light plate flush with the sand, yellow/black hazard tape edge, rust-red studs
    var pw = q.w * s - 2, ph = q.h * s - 2, tw = 4;
    rect(cx, cy, pw, ph, PAL.ink);
    rect(cx, cy, pw - 2, ph - 2, PAL.hazYellow);
    rect(cx, cy, pw - 2 - 2 * tw, ph - 2 - 2 * tw, PAL.hazPlate);
    var seg = 7, nh = Math.max(2, Math.round((pw - 2) / seg)), nv = Math.max(2, Math.round((ph - 2) / seg));
    for (var u = 0; u < nh; u += 2) {
      var sx = cx - (pw - 2) / 2 + ((pw - 2) * (u + 0.5)) / nh, sw = (pw - 2) / nh;
      rect(sx, cy - (ph - 2) / 2 + tw / 2, sw, tw, PAL.ink); rect(sx, cy + (ph - 2) / 2 - tw / 2, sw, tw, PAL.ink);
    }
    for (var v = 1; v < nv - 1; v += 2) {
      var sy = cy - (ph - 2) / 2 + ((ph - 2) * (v + 0.5)) / nv, svh = (ph - 2) / nv;
      rect(cx - (pw - 2) / 2 + tw / 2, sy, tw, svh, PAL.ink); rect(cx + (pw - 2) / 2 - tw / 2, sy, tw, svh, PAL.ink);
    }
    var nx = Math.max(1, Math.round(q.w * 2)), ny = Math.max(1, Math.round(q.h * 2)), up = q.on == null || q.on;
    for (var a = 0; a < nx; a++) for (var b = 0; b < ny; b++) {
      var px = X(q.x + (a + 0.5) * q.w / nx), py = Y(q.y + (b + 0.5) * q.h / ny), r = s * 0.15;
      circ(px, py + 1, r * 0.95, withA(PAL.spikeRust, up ? 0.75 : 0.45));
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
    if (q.rock) { var xk = Math.min(R * 0.45, 10); line(x - xk, y - xk, x + xk, y + xk, 3.5, withA(PAL.ink, 0.35)); line(x - xk, y + xk, x + xk, y - xk, 3.5, withA(PAL.ink, 0.35)); line(x - xk, y - xk, x + xk, y + xk, 1.8, PAL.ringEdge); line(x - xk, y + xk, x + xk, y - xk, 1.8, PAL.ringEdge); }   // S7 B-04 rock: X marker
    else { line(x - 5, y, x + 5, y, 1.5, PAL.ringEdge); line(x, y - 5, x, y + 5, 1.5, PAL.ringEdge); }
  }
  // QA-P1 D6: big dark ground shadow right under the shell's ground point; shrinks and fades a little at the apex
  for (var j = 0; j < L.length; j++) {
    var g = shellGround(L[j]), h01 = Math.sin(Math.PI * g.u), gx = X(g.x) + 1.5, gy = Y(g.y) + 2, r0 = 8 - 2.5 * h01;
    circ(gx, gy, r0 + 2.5, withA(PAL.shellShadow, 0.45 - 0.15 * h01));
    circ(gx, gy, r0, withA(PAL.shellShadow, 1 - 0.3 * h01));
  }
}
function drawShells(S, s) {
  var L = S.shells || [];
  for (var i = 0; i < L.length; i++) {
    // QA-P1 D6: the ball grows to 1.4x at the apex (ground shadow: drawShellShadows, ground layer)
    var q = L[i], g = shellGround(q), h01 = Math.sin(Math.PI * g.u), hgt = h01 * 2.2 * s, x = X(g.x), y = Y(g.y), k = 1 + 0.4 * h01;
    circ(x, y - hgt, 5 * k + 1.5, PAL.ink); circ(x, y - hgt, 5 * k, PAL.shellBody);
    circ(x - 1.5 * k, y - hgt - 1.5 * k, 1.8 * k, PAL.metalLite); circ(x + 1.2 * k, y - hgt + 1.2 * k, 1.6 * k, PAL.sensor);
  }
}

// S7 shared tell shapes (px). Same grammar as the E-04 shell ring and the E-05 lane: TELL-FILL, dark under-stroke, red edge, pulse in the last 25%.
function dashLine(x1, y1, x2, y2, lw, c, dash, gap, ph) {
  var L = Math.hypot(x2 - x1, y2 - y1); if (L < 0.5) return;
  var ux = (x2 - x1) / L, uy = (y2 - y1) / L, d = dash || 6, g = gap || 4, p = -((ph || 0) % (d + g));
  for (; p < L; p += d + g) { var a = Math.max(0, p), b = Math.min(L, p + d); if (b > a) line(x1 + ux * a, y1 + uy * a, x1 + ux * b, y1 + uy * b, lw, c); }
}
function groundRing(x, y, R, u, o) {
  o = o || {}; u = Math.max(0, Math.min(1, u || 0));
  var tw = o.t != null ? o.t : FX.wall, edge = o.edge || PAL.ringEdge, fill = o.fill || PAL.ringFill;
  circ(x, y, R, fill);
  circ(x, y, R * u, withA(fill, 1.6));
  ring(x, y, R - 1, 4.5, withA(PAL.ink, 0.45));
  ring(x, y, R - 1, 2 + (u > 0.75 ? 1.5 * Math.abs(Math.sin(tw * 20)) : 0), edge);
  if (o.cross !== false) { var c5 = Math.min(6, R * 0.3); line(x - c5, y, x + c5, y, 1.5, edge); line(x, y - c5, x, y + c5, 1.5, edge); }
  if (u >= 1 && o.hot !== false) ring(x, y, R * 0.98, 3, withA(PAL.sparkHot, 0.8));
}
function ribbon(x1, y1, x2, y2, w, u, locked) {
  var a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  u = Math.max(0, Math.min(1, u || 0)); if (locked == null) locked = u >= 0.75;
  rect(mx, my, len, w, withA(PAL.lane, locked ? 1.5 : 0.8), a);
  if (u > 0) rect(x1 + Math.cos(a) * len * u / 2, y1 + Math.sin(a) * len * u / 2, len * u, w * 0.45, withA(PAL.lane, 1.4), a);   // fill runs along the lane with the tell
  var px = -Math.sin(a) * w / 2, py = Math.cos(a) * w / 2;
  line(x1 + px, y1 + py, x2 + px, y2 + py, 3.5, withA(PAL.ink, 0.35)); line(x1 - px, y1 - py, x2 - px, y2 - py, 3.5, withA(PAL.ink, 0.35));
  line(x1 + px, y1 + py, x2 + px, y2 + py, locked ? 2 : 1.2, PAL.laneEdge); line(x1 - px, y1 - py, x2 - px, y2 - py, locked ? 2 : 1.2, PAL.laneEdge);
  // chevrons along the lane show the roll direction
  // QA-S7 D1: symmetric filled arrowheads (triangle with a dark under-stroke) along the lane, wide lanes only
  if (w >= 24) for (var k = 1; k <= 3; k++) { var f = k / 4, cx = x1 + (x2 - x1) * f, cy = y1 + (y2 - y1) * f, ar = w * 0.2;
    ngon(cx, cy, ar + 1.6, 3, a, withA(PAL.ink, 0.35)); ngon(cx, cy, ar, 3, a, withA(PAL.laneEdge, 0.6 + 0.4 * u)); }
  if (locked) rect(x2, y2, 4, w, PAL.laneEdge, a);
}
function marker(x, y, R, u, kind) {   // rock / landing marker: small ring + X, shrinking target ring as it lands
  u = Math.max(0, Math.min(1, u || 0));
  circ(x, y, R, withA(PAL.ringFill, 1.2 + 0.8 * u));
  ring(x, y, R, 3.5, withA(PAL.ink, 0.4)); ring(x, y, R, 1.6 + (u > 0.75 ? 1 : 0), PAL.ringEdge);
  var k = R * 0.55; line(x - k, y - k, x + k, y + k, 1.6, PAL.ringEdge); line(x - k, y + k, x + k, y - k, 1.6, PAL.ringEdge);
  if (u < 1) ring(x, y, R * (1 + 1.2 * (1 - u)), 1.2, withA(PAL.laneEdge, 0.4 + 0.5 * u));
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
  var LK = lookOf(e); if (LK) { if (LK.ground) LK.ground(V.SceneKit, S, e, s, t); return; }
  if (e.type !== 'B-01') return;   // S7 (B3): the built-in floor lines / fan are B-01's only; other bosses draw BossKit data (drawKitTells) + their look
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
      // QA-P1 D4: same weight as attack A (wide floor band fading in with tell01) plus a 4 px core with a darker edge
      var fx1 = X(e.x), fy1 = Y(e.y), fx2 = fx1 + Math.cos(ba) * R, fy2 = fy1 + Math.sin(ba) * R;
      line(fx1, fy1, fx2, fy2, 0.3 * s * (0.4 + 0.6 * tt), withA(PAL.floorLine, 0.6 + 0.8 * tt));
      line(fx1, fy1, fx2, fy2, 4, withA(PAL.bossEdge, 0.55 + 0.45 * tt));
      line(fx1, fy1, fx2, fy2, 2, withA(PAL.laneEdge, 0.7 + 0.3 * tt));
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

// R64 elite trim, drawn over the normal body: white-steel rim (1.2 px), one extra fin or antenna, two small sensor lights. No stripes, gold, red outline or glow.
var STEEL = mix(PAL.white, PAL.metalLite, 0.25);
var ELITE_RIMR = { 'E-02': 0.86, 'E-03': 0.92, 'E-04': 0.9, 'E-05': 0.9, 'E-07': 1.62, 'E-08': 0.62 };
function drawEliteTrim(e, x, y, rr, a, flash, eye) {
  var st = flash ? PAL.white : STEEL, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
  if (e.type !== 'E-08') ring(x, y, rr * (ELITE_RIMR[e.type] || 0.9), 1.2, st);   // E-08: rhombus rim in drawE08 (QA-S7 D2)
  if (e.type === 'E-07') {   // own extra piece (outer tooth ring + bigger dome, drawn in drawE07); here: two sensors on the dome
    circ(x + nx * rr * 0.34, y + ny * rr * 0.34, rr * 0.1, eye); circ(x - nx * rr * 0.34, y - ny * rr * 0.34, rr * 0.1, eye); return; }   // QA-S7 D6: >= 5 px apart
  if (e.type === 'E-08') {   // keeps one large sensor + one small (02 s2.3); scope tube and extra feet are in drawE08
    var ga = e.aimAng != null ? e.aimAng : a; circ(x + Math.cos(ga + 2.4) * rr * 0.66, y + Math.sin(ga + 2.4) * rr * 0.66, rr * 0.1, eye); return; }   // QA-S7 D2: clear of the big sensor
  // extra fin (E-02, E-04) or antenna (E-03, E-05), on the back side of the facing, thin 2 px steel with a small tip
  var bx = x - ca * rr * 0.8, by = y - sa * rr * 0.8;
  if (e.type === 'E-02' || e.type === 'E-04') { line(bx, by, bx - ca * rr * 0.55 + nx * rr * 0.1, by - sa * rr * 0.55 + ny * rr * 0.1, 2.4, st); }
  else { var tx = x + nx * rr * 0.55 - ca * rr * 0.55, ty = y + ny * rr * 0.55 - sa * rr * 0.55; line(x + nx * rr * 0.35, y + ny * rr * 0.35, tx, ty, 1.6, st); circ(tx, ty, rr * 0.08, st); }
  // two sensor lights, either side of the centre sensor
  circ(x + nx * rr * 0.42 + ca * rr * 0.1, y + ny * rr * 0.42 + sa * rr * 0.1, rr * 0.07, eye);
  circ(x - nx * rr * 0.42 + ca * rr * 0.1, y - ny * rr * 0.42 + sa * rr * 0.1, rr * 0.07, eye);
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
  if (stun) a += 0.35 + Math.sin(t * 14) * 0.12; // QA-P1 D9: slumped tilt + wobble
  var ca = Math.cos(a), sa = Math.sin(a);
  oNgon(x - ca * rr * 0.1, y - sa * rr * 0.1, rr * 1.0 * k, 3, a, stun ? mix(C2.body, PAL.metalLite, 0.4) : C2.body);
  ngon(x - ca * rr * 0.15, y - sa * rr * 0.15, rr * 0.55 * k, 3, a, C2.lite);
  oRect(x + ca * rr * 0.62 * k, y + sa * rr * 0.62 * k, rr * 0.3, rr * 1.35 * k, kneel ? mix(C2.dark, PAL.sensor, 0.35) : C2.dark, a); // ram plate
  circ(x + ca * rr * 0.2, y + sa * rr * 0.2, rr * (kneel ? 0.24 : 0.18), stun ? (C2.eye === PAL.white ? PAL.white : PAL.stunEye) : C2.eye);
  if (stun) {
    // QA-P1 D9: dimmed eye (above) + a big orbiting spark ring around the whole body
    var R5 = rr * 1.4, sp = t * 4;
    for (var j = 0; j < 3; j++) { var a0 = sp + j * TAU / 3; ring(x, y, R5, 4.5, PAL.ink, a0 - 0.05, a0 + 1.25); ring(x, y, R5, 2.5, PAL.stun, a0, a0 + 1.2); }
    for (var i = 0; i < 4; i++) { var sa2 = -sp * 1.3 + i * TAU / 4; oNgon(x + Math.cos(sa2) * R5, y + Math.sin(sa2) * R5, 4.5, 4, t * 6, i % 2 ? PAL.sparkHot : PAL.stun); }
  }
}

function drawB01(S, e, x, y, rr, t, C2) {
  var B = bossAttack(S, e) || {}, ph2 = (B.phase || e.phase) === 2, tell = !!B.attack && e.st !== 'act', tt = tell ? (B.tell01 != null ? B.tell01 : e.tell01 || 0) : 0;
  var body = ph2 ? mix(C2.body, PAL.boss2, 0.75) : C2.body, a0 = e.aimAng != null ? e.aimAng : Math.PI / 2;
  if (C2.hit > 0) body = mix(body, PAL.white, 0.35 * C2.hit); // D12: soft hull tint only
  // D7: attack B spin-up. The angle comes from tell01 (1.5 turns, accelerating, no jumps), plus motion trails and a growing glow ring.
  var spinB = B.attack === 'B' && tell, spin = t * 0.4 + (spinB ? TAU * 1.5 * tt * tt : 0);
  var hot = ph2 ? 0.75 + 0.25 * Math.sin(t * 6) : 0, nb = 8, k, ba, cb, sb;
  // D8: phase 2 hull rim glows orange-red
  if (ph2) ngon(x, y, rr * 1.08 + OL + 4.5, 8, Math.PI / 8, withA(PAL.boss2Rim, hot));
  oNgon(x, y, rr * 1.08, 8, Math.PI / 8, ph2 ? mix(PAL.metalDark, PAL.boss2, 0.45) : PAL.metalDark); // base
  if (spinB) {
    ring(x, y, rr * (1.12 + 0.4 * tt), 2 + 3 * tt, withA(PAL.glow, 0.35 + 0.6 * tt));
    for (k = 0; k < nb; k++) { ba = spin + k * TAU / nb; ring(x, y, rr * 0.98, rr * 0.2, withA(PAL.bossSpin, 0.25 + 0.65 * tt), ba - 0.6 * tt, ba); }
  }
  for (k = 0; k < nb; k++) {
    ba = spin + k * TAU / nb; cb = Math.cos(ba); sb = Math.sin(ba);
    oRect(x + cb * rr * 0.98, y + sb * rr * 0.98, rr * 0.5, rr * 0.2, spinB ? mix(C2.dark, PAL.glow, 0.4 * tt) : C2.dark, ba);
    if (ph2) rect(x + cb * rr * 1.17, y + sb * rr * 1.17, rr * 0.12, rr * 0.2, mix(PAL.boss2Hot, PAL.sparkHot, 0.35 * hot), ba); // D8: hot barrel tips
    if (spinB) circ(x + cb * rr * 1.27, y + sb * rr * 1.27, 2.5 + 3.5 * tt, mix(PAL.glow, PAL.sparkHot, tt));
  }
  oCirc(x, y, rr * 0.78, body);
  ring(x, y, rr * 0.6, 2, ph2 ? PAL.boss2Vent : C2.lite);
  if (ph2) for (var v = 0; v < 4; v++) { var va = v * Math.PI / 2 + Math.PI / 4; circ(x + Math.cos(va) * rr * 0.45, y + Math.sin(va) * rr * 0.45, 3 + Math.sin(t * 8 + v) * 1, PAL.boss2Vent); }
  // main gun toward aim
  oRect(x + Math.cos(a0) * rr * 0.55, y + Math.sin(a0) * rr * 0.55, rr * 0.7, rr * 0.3, C2.dark, a0);
  if (ph2) rect(x + Math.cos(a0) * rr * 0.86, y + Math.sin(a0) * rr * 0.86, rr * 0.1, rr * 0.3, mix(PAL.boss2Hot, PAL.sparkHot, 0.35 * hot), a0);
  circ(x, y, rr * (0.3 + 0.08 * tt), tell ? mix(C2.eye, PAL.sparkHot, tt) : C2.eye);
  circ(x, y, rr * 0.12, C2.core);
  var swell = 0, bi = FX.wall - FX.bossIntro;
  if (FX.bossIntro >= 0 && bi >= 0 && bi < 1.6) swell = Math.sin(Math.min(1, bi / 1.2) * Math.PI) * 0.45;   // AN-301: sensor swells while the banner shows (the Operator keeps control)
  if (!C2.dead) glow(x, y, rr * (0.5 + 0.15 * tt + swell * 0.5), PAL.sensor, 0.16 + 0.14 * tt + swell * 0.3, 2);
  if (ph2) for (var gv = 0; gv < 4; gv++) { var gva = gv * Math.PI / 2 + Math.PI / 4; glow(x + Math.cos(gva) * rr * 0.45, y + Math.sin(gva) * rr * 0.45, rr * 0.3, PAL.boss2Vent, 0.4 * hot, 2); }
  if (tell && B.attack === 'A') ring(x, y, rr * 1.3, 2.5, withA(PAL.laneEdge, 0.4 + 0.6 * tt), -Math.PI / 2, -Math.PI / 2 + TAU * tt);
  // D8: heat sparks rising off the phase-2 hull (deterministic from t, so both renderers draw the same)
  if (ph2) for (var hs = 0; hs < 5; hs++) {
    var hu = (t * 0.9 + hs / 5) % 1, hx = x + (hs - 2) * rr * 0.38 + Math.sin(t * 3 + hs * 1.7) * rr * 0.08;
    circ(hx, y - rr * 0.7 - hu * rr * 1.1, 1.5 + 3 * (1 - hu), withA(mix(PAL.boss2Hot, PAL.sparkHot, 1 - hu), 1 - hu * 0.8));
  }
}


// ---------- S7 machines: E-06 Splitter "Clam", E-06h half, E-07 Burrower "Gear", E-08 Sniper "Needle" (02 s2.2 A-006..A-009) ----------
var TELLHOT = C(255, 106, 48), PLATE = C(176, 182, 188), SANDL = C(226, 206, 160), SANDD = C(176, 150, 106), DUNE = C(150, 124, 84, 0.7), FURROW = C(70, 55, 35, 0.5);
function halfDisc(x, y, r, a, c) { ring(x, y, r / 2, r, c, a - Math.PI / 2, a + Math.PI / 2); }   // filled half disc, round side toward a
function drawE06(e, x, y, rr, t, C2) {
  var a = e.ang || 0, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca, R = rr * 1.05, g = Math.max(0, Math.min(1, e.seam01 || 0)), k = rr / 16;
  if (C2.dk > 0) g = 0;
  // the seam runs along travel; the halves sit either side (+n, -n)
  circ(x, y, R + OL, PAL.ink);
  halfDisc(x, y, R, a + Math.PI / 2, C2.lite); halfDisc(x, y, R, a - Math.PI / 2, C2.body);
  circ(x + nx * R * 0.42 - ca * R * 0.15, y + ny * R * 0.42 - sa * R * 0.15, R * 0.28, withA(C2.flash ? PAL.white : PAL.metalLite, 0.55));   // dome catch on each half
  circ(x - nx * R * 0.42 - ca * R * 0.15, y - ny * R * 0.42 - sa * R * 0.15, R * 0.28, withA(C2.flash ? PAL.white : PAL.metal, 0.7));
  // seam channel: STEEL-DEEP 2.5 px, fills TELL and widens to 5 px over the last 0.3 s
  var sw = (2.5 + 2.5 * g) * k;
  rect(x, y, R * 2.04, sw + 1.4, PAL.ink, a);
  rect(x, y, R * 2.0, sw, g > 0 ? mix(C2.dark, TELLHOT, Math.min(1, g * 1.5)) : C2.dark, a);
  if (g > 0.5) rect(x, y, R * 1.7, sw * 0.4, mix(TELLHOT, PAL.sparkHot, (g - 0.5) * 2), a);
  // ear tabs at the seam ends, bolts along the seam
  oRect(x + ca * R * 1.02, y + sa * R * 1.02, 5 * k, 5 * k, C2.flash ? PAL.white : PLATE, a);
  oRect(x - ca * R * 1.02, y - sa * R * 1.02, 5 * k, 5 * k, C2.flash ? PAL.white : PLATE, a);
  for (var b = -1; b <= 1; b++) for (var sd = -1; sd <= 1; sd += 2) circ(x + ca * b * R * 0.5 + nx * sd * (sw / 2 + 2.2 * k), y + sa * b * R * 0.5 + ny * sd * (sw / 2 + 2.2 * k), 1.2 * k, C2.flash ? PAL.white : PAL.metalLite);
  // two sensors, one per half, 6 px off the seam, turn hot with the seam
  var ey = g > 0 ? mix(C2.eye, PAL.sensorCore, g) : C2.eye;
  circ(x + nx * R * 0.5 + ca * R * 0.35, y + ny * R * 0.5 + sa * R * 0.35, 2.2 * k, ey);
  circ(x - nx * R * 0.5 + ca * R * 0.35, y - ny * R * 0.5 + sa * R * 0.35, 2.2 * k, ey);
  if (g > 0) glow(x, y, R * (0.7 + 0.4 * g), TELLHOT, 0.12 + 0.22 * g, 2, true);
}
function drawE06h(e, x, y, rr, t, C2) {
  // D-shaped half: round side faces travel (the pop direction while popping), flat cut at the back, bright PLATE cut line
  var a = e.ang != null ? e.ang : (e.splitAng || 0), R = rr * 1.0, k = rr / 11, g = Math.max(0, Math.min(1, e.seam01 || 0)), ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
  if (C2.dk > 0) g = 0;
  var pop = e.st === 'pop' ? Math.max(0, Math.min(1, e.pop01 || 0)) : 1, st = 1 + 0.1 * (e.st === 'pop' || (C2.an && Math.hypot(C2.an.vx, C2.an.vy) > 1.2) ? 1 : 0);   // speed lean 1.1x
  var cx = x - ca * R * 0.3, cy = y - sa * R * 0.3;   // flat edge centre (the disc centre of the old shell)
  halfDisc(cx, cy, R * st + OL, a, PAL.ink);
  rect(cx, cy, OL * 2, (R + OL) * 2, PAL.ink, a);
  halfDisc(cx, cy, R * st, a, e.side === -1 ? C2.body : C2.lite);
  circ(cx + ca * R * 0.55 - nx * R * 0.2, cy + sa * R * 0.55 - ny * R * 0.2, R * 0.25, withA(C2.flash ? PAL.white : PAL.metalLite, 0.55));
  rect(cx + ca * 1.2 * k, cy + sa * 1.2 * k, 2 * k, R * 1.9, g > 0 ? mix(PLATE, TELLHOT, g) : (C2.flash ? PAL.white : PLATE), a);   // cut line (hot while the seam still glows)
  circ(cx + ca * R * 0.5, cy + sa * R * 0.5, 2 * k * 1.1, g > 0 ? mix(C2.eye, PAL.sensorCore, g) : C2.eye);
  if (g > 0) glow(cx, cy, R * 0.9, TELLHOT, 0.35 * g * (1 - 0.5 * pop), 2, true);
}
function drawE07(e, x, y, rr, t, C2) {
  var u = e.surf01 != null ? Math.max(0, Math.min(1, e.surf01)) : 1, sc = 0.55 + 0.45 * u, k = rr / 16 * sc, a = e.ang || 0, R = rr * 1.0 * sc;
  var fire = C2.an ? C2.an.kick : 0, i, ta;
  // sand fringe: it just broke the ground (drawn first, under the gear)
  if (u < 1) for (i = 0; i < 6; i++) { ta = i * TAU / 6 + e.id; circ(x + Math.cos(ta) * R * 1.15, y + Math.sin(ta) * R * 1.15, R * 0.3 * (1.2 - 0.4 * u), withA(SANDL, 0.9)); }
  if (C2.elite) { var R2 = R * 1.3; for (i = 0; i < 12; i++) { ta = a + i * TAU / 12 + t * 0.3; oNgon(x + Math.cos(ta) * R2, y + Math.sin(ta) * R2, 3.2 * k, 3, ta, C2.dark); } }
  // tooth ring: 10 triangle teeth around r 17
  for (i = 0; i < 10; i++) { ta = a + i * TAU / 10; oNgon(x + Math.cos(ta) * R * 1.08, y + Math.sin(ta) * R * 1.08, 4.2 * k, 3, ta, C2.lite); }
  oCirc(x, y, R * 0.96, C2.body);
  circ(x - R * 0.12, y - R * 0.12, R * 0.78, withA(C2.lite, 0.6));
  // eight ports on r 12, flare SENSOR-HOT on the shot
  for (i = 0; i < 8; i++) { ta = i * Math.PI / 4 + Math.PI / 8; var px = x + Math.cos(ta) * R * 0.74, py = y + Math.sin(ta) * R * 0.74;
    circ(px, py, 2.4 * k, PAL.ink); circ(px, py, 1.7 * k, fire > 0.05 ? mix(C2.dark, PAL.sensorCore, fire) : C2.dark);
    if (fire > 0.3) glow(px, py, 8 * k, PAL.sensorCore, 0.6 * fire, 3, true); }
  var dr = (C2.elite ? 9 : 7) * k;
  oCirc(x, y, dr, C2.dark); circ(x - dr * 0.25, y - dr * 0.25, dr * 0.6, mix(C2.dark, PAL.metalLite, 0.5));
  if (!C2.elite) { circ(x, y, 2.4 * k, C2.eye); circ(x, y, 0.9 * k, C2.core); }
}
function drawE08(e, x, y, rr, t, C2) {
  // tall diamond base (fixed, never rotates) + a very long barrel on a turret ring (rotates to aim)
  var k = rr / 16, W = rr * 0.92, Ht = rr * 1.3, ga = e.aimAng != null ? e.aimAng : (e.ang || 0), cg = Math.cos(ga), sg = Math.sin(ga), i;
  var lk = e.st === 'tell' && e.locked === true, lamp = lk ? PAL.sensorCore : C(255, 74, 58);
  // stabiliser feet at the four corners (elite: an extra pair on the diagonals)
  var ft = [[0, -Ht], [W, 0], [0, Ht], [-W, 0]];
  for (i = 0; i < ft.length; i++) oRect(x + ft[i][0] * 1.0, y + ft[i][1] * 1.0, 5 * k, 5 * k, C2.lite, Math.PI / 4);
  // base: square diamond + a triangle on top and bottom (all inks first, then fills, so no inner seam)
  var tri = Ht - W * 0.62;
  ngon(x, y, W + OL * 1.41, 4, 0, PAL.ink);
  ngon(x, y - tri, W * 0.62 + OL * 2, 3, -Math.PI / 2, PAL.ink); ngon(x, y + tri, W * 0.62 + OL * 2, 3, Math.PI / 2, PAL.ink);
  ngon(x, y, W, 4, 0, C2.body); ngon(x, y - tri, W * 0.62, 3, -Math.PI / 2, C2.body); ngon(x, y + tri, W * 0.62, 3, Math.PI / 2, C2.body);
  ngon(x - W * 0.08, y - W * 0.1, W * 0.62, 4, 0, withA(C2.lite, 0.7));
  if (C2.elite && C2.dk < 0.3) { var ro = OL + 1.4, rv = [[0, -Ht - ro * 1.5], [W + ro * 1.4, 0], [0, Ht + ro * 1.5], [-W - ro * 1.4, 0]];
    for (i = 0; i < 4; i++) { var v0 = rv[i], v1 = rv[(i + 1) % 4]; line(x + v0[0], y + v0[1], x + v1[0], y + v1[1], 1.2, C2.flash ? PAL.white : STEEL); } }
  for (i = 0; i < 8; i++) { var tq = i * Math.PI / 4 + Math.PI / 8; line(x + Math.cos(tq) * W * 0.5, y + Math.sin(tq) * W * 0.5, x + Math.cos(tq) * W * 0.66, y + Math.sin(tq) * W * 0.66, 1, PAL.ink); }
  // barrel 9 x 28 from the ring centre; kicks back along itself on the shot
  var kb = C2.an ? C2.an.kick * rr * 0.25 : 0, BL = rr * 1.95, bx = x + cg * (BL * 0.5 + rr * 0.15 - kb), by = y + sg * (BL * 0.5 + rr * 0.15 - kb);
  oRect(bx, by, BL, 6.4 * k, C2.dark, ga); rect(bx - sg * 1 * k, by + cg * 1 * k, BL * 0.92, 1.6 * k, withA(PAL.metalLite, 0.7), ga);
  if (C2.elite) {   // QA-S7 D2: long scope tube beside the barrel, sticking out past the diamond; white-steel rim follows the diamond
    var sx0 = x + cg * rr * 1.2 - sg * 5 * k, sy0 = y + sg * rr * 1.2 + cg * 5 * k; oRect(sx0, sy0, rr * 1.15, 3.6 * k, C2.lite, ga); circ(sx0 + cg * rr * 0.58, sy0 + sg * rr * 0.58, 1.6 * k, PAL.ink);
  }
  var mx = x + cg * (BL + rr * 0.15 - kb), my = y + sg * (BL + rr * 0.15 - kb);
  rect(mx, my, 2.5 * k + 1, 6.4 * k + 1, PAL.ink, ga); rect(mx, my, 2.5 * k, 5 * k, C2.flash ? PAL.white : lamp, ga);
  if (C2.dk === 0) glow(mx, my, (lk ? 14 : 9) * k, lamp, lk ? 0.7 : 0.35, lk ? 3 : 2, true);
  // turret ring r 8 and the large sensor r 3
  oCirc(x, y, 8 * k, C2.dark); ring(x, y, 6 * k, 1.3, withA(C2.lite, 0.8));
  circ(x, y, 3.2 * k, e.st === 'tell' ? mix(C2.eye, PAL.sensorCore, e.lock01 || 0) : C2.eye); circ(x - 0.8 * k, y - 0.8 * k, 1.1 * k, C2.core);
}
// QA-S7 D4: clamp a drawn aim line's end inside the room's inner edge (side curbs, top of the sandbag berm). px in, px out.
function innerClip(x1, y1, x2, y2, S) {
  var RW = (S.room && S.room.w) || S.cols || 9, RH = (S.room && S.room.h) || 15, xl = X(0) + 5, xr = X(RW) - 5, yt = Y(0.5), yb = Y(RH) - 18, tt = 1, dx = x2 - x1, dy = y2 - y1;
  if (dx > 0 && x2 > xr) tt = Math.min(tt, (xr - x1) / dx); if (dx < 0 && x2 < xl) tt = Math.min(tt, (xl - x1) / dx);
  if (dy > 0 && y2 > yb) tt = Math.min(tt, (yb - y1) / dy); if (dy < 0 && y2 < yt) tt = Math.min(tt, (yt - y1) / dy);
  tt = Math.max(0, tt); return [x1 + dx * tt, y1 + dy * tt];
}
function drawSniperAim(S, e, s) {
  if (e.st !== 'tell' || e.aimX2 == null) return;
  var x1 = X(e.aimX1), y1 = Y(e.aimY1), q2 = innerClip(x1, y1, X(e.aimX2), Y(e.aimY2), S), x2 = q2[0], y2 = q2[1], lk = e.locked === true, f = e.lock01 || 0;
  // A-009 tell: wide additive glow, dark-red underlay, thin red core. Sweep: 50% and dashed. Last 0.4 s: solid, full alpha, bigger end dot.
  if (lk) {
    line(x1, y1, x2, y2, 5 + 2 * f, C(255, 40, 30, 0.22 + 0.1 * f));
    line(x1, y1, x2, y2, 2.4, C(70, 0, 0, 0.6));
    line(x1, y1, x2, y2, 1.4, C(255, 58, 42, 1));
    circ(x2, y2, 4, PAL.aimLock); circ(x2, y2, 1.6, PAL.sensorCore);
  } else {
    line(x1, y1, x2, y2, 4, C(255, 40, 30, 0.11));
    dashLine(x1, y1, x2, y2, 1.8, C(70, 0, 0, 0.3), 8, 5, -FX.wall * 24);
    dashLine(x1, y1, x2, y2, 1, C(255, 58, 42, 0.55), 8, 5, -FX.wall * 24);
    circ(x2, y2, 3, C(255, 58, 42, 0.55));
  }
  if (e.aimBlocked) { var bk = lk ? 5 : 4; line(x2 - bk, y2 - bk, x2 + bk, y2 + bk, 1.6, PAL.chevron); line(x2 - bk, y2 + bk, x2 + bk, y2 - bk, 1.6, PAL.chevron); }   // stopped at cover: steel X at the clip point
}
// E-07 ground layer: sand mound while underground, crack ring tell at the surfacing spot
function drawMachineGround(S, e, s, t) {
  if (e.type !== 'E-07') return;
  if (e.under === true) {
    var x = X(e.x), y = Y(e.y), k = s / 36 * 1.25, a = e.ang || 0, ca = Math.cos(a), sa = Math.sin(a), tl = e.st === 'tell', jx = tl ? Math.sin(t * 40 + e.id) * 0.8 * (e.tell01 || 0) : 0;
    var spA = e.st === 'spawn' ? 0.5 : 1;
    if (!tl) for (var f = -1; f <= 1; f += 2) line(x - ca * 10 * k - sa * f * 4 * k, y - sa * 10 * k + ca * f * 4 * k, x - ca * 24 * k - sa * f * 5 * k, y - sa * 24 * k + ca * f * 5 * k, 1.5, withA(FURROW, spA));   // furrow trail
    circ(x + 2 * k + jx, y + 3 * k, 13 * k, withA(PAL.shadow, 1.1 * spA));
    circ(x - 4 * k + jx, y + 1 * k, 9 * k, withA(SANDD, spA)); circ(x + 4 * k + jx, y + 1 * k, 9 * k, withA(SANDD, spA)); circ(x + jx, y - 1 * k, 10 * k, withA(SANDD, spA));
    circ(x - 3 * k + jx, y - 1.5 * k, 7 * k, withA(SANDL, spA)); circ(x + 3 * k + jx, y - 2 * k, 6.5 * k, withA(SANDL, spA));
    for (var r = 0; r < 3; r++) ring(x + jx, y, (4 + r * 3.5) * k, 1, withA(DUNE, spA), Math.PI * 0.9 + r * 0.2, Math.PI * 1.6 + r * 0.2);
    for (var q = 0; q < 3; q++) { var qa = e.id * 2.1 + q * 2.2; circ(x + Math.cos(qa) * 13 * k, y + Math.sin(qa) * 9 * k, 1.1 * k, SANDD); }
  }
  if (e.st === 'tell' && e.ringX != null) drawCrackRing(X(e.ringX), Y(e.ringY), (e.ringR || 0.8) * s, Math.max(0, Math.min(1, e.tell01 || 0)), e.id, t);
}
function drawCrackRing(x, y, R, u, id, t) {
  // A-008 tell: TELL-FILL growing to the edge over 1.0 s, 10 jagged crack segments (dark 2 px over a red hairline), 8 spokes growing in
  var rn = mkRng(id * 977 + 3), i, pts = [];
  circ(x, y, R, withA(PAL.ringFill, 1.25)); circ(x, y, R * u, withA(PAL.ringFill, 1.7));   // QA-S7 D3: red at .2 from the first frame
  for (i = 0; i < 20; i++) { var a = i * TAU / 20 + (rn() - 0.5) * 0.12, rr = R * (i % 2 ? 0.92 : 1.04) * (0.97 + rn() * 0.06); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
  var pulse = u > 0.75 ? Math.abs(Math.sin(t * 20)) : 0;
  for (i = 0; i < 20; i++) { var p0 = pts[i], p1 = pts[(i + 1) % 20]; line(p0[0] + 0.6, p0[1] + 0.9, p1[0] + 0.6, p1[1] + 0.9, 1.8 + pulse, PAL.ringEdge); }
  for (i = 0; i < 20; i++) { var a0 = pts[i], a1 = pts[(i + 1) % 20]; line(a0[0], a0[1], a1[0], a1[1], 2, C(26, 20, 16, 0.9)); }
  for (i = 0; i < 8; i++) { var sa2 = i * Math.PI / 4 + 0.2, r0 = R * 0.22, r1 = R * (0.3 + 0.62 * u);
    line(x + Math.cos(sa2) * r0, y + Math.sin(sa2) * r0, x + Math.cos(sa2 + 0.08) * r1, y + Math.sin(sa2 + 0.08) * r1, 1.6, C(26, 20, 16, 0.75)); }
  if (u >= 0.98) ring(x, y, R, 2.5, withA(PAL.sparkHot, 0.8));
}
// BossKit draw data (BOSSKIT-API.md): e.kitRings {x,y,r,fill01,done,tag} and e.kitLanes {x1,y1,x2,y2,w,fill01,tag}, any enemy
function drawKitTells(S, e, s, t) {
  var R = e.kitRings, L = e.kitLanes && e.kitLanes.length ? e.kitLanes : null, i, g;
  if (L) for (i = 0; i < L.length; i++) { g = L[i]; if (g.x1 == null) continue; ribbon(X(g.x1), Y(g.y1), X(g.x2), Y(g.y2), (g.w || 0.6) * s, g.fill01 != null ? g.fill01 : (g.T ? g.t / g.T : 0)); }
  else if (e.lane && e.lane.x1 != null && e.st === 'tell') { var ln = e.lane; ribbon(X(ln.x1), Y(ln.y1), X(ln.x2), Y(ln.y2), (ln.w || 0.6) * s, e.tell01 || 0); }   // B-03 fallback when no kit ribbon
  if (R) for (i = 0; i < R.length; i++) {
    g = R[i]; if (g.x == null) continue;
    var u = g.fill01 != null ? g.fill01 : (g.T ? g.t / g.T : 0), px = X(g.x), py = Y(g.y), rp = (g.r || 1) * s;
    if (g.tag && /rock/i.test(String(g.tag))) marker(px, py, rp, u);
    else groundRing(px, py, rp, u, { t: t, hot: !!g.done });
    if (g.done) circ(px, py, rp, withA(PAL.sparkHot, 0.25 * Math.abs(Math.sin(t * 30))));   // landed: brief flash while it lingers
  }
}

function drawChest(S, s, t) {
  var c = S.chest; if (!c) return;
  var x = X(c.x), y = Y(c.y), w = 0.9 * s, h = 0.6 * s;
  rect(x + sh.x, y + sh.y, w, h, PAL.shadow);
  if (c.open) {
    // QA-P1 D11: lid raised behind the box (inside face showing), dark mouth full of gold, pulsing gold glint
    var lh = h * 0.8, ly = y - h / 2 - lh / 2 + 2, pu = 0.5 + 0.5 * Math.sin(t * 5);
    rect(x + sh.x * 0.6, ly + sh.y * 0.4, w + 2, lh, PAL.shadow);
    oRect(x, ly, w + 2, lh, PAL.chestLid);
    rect(x, ly + 1.5, w - 4, lh - 6, mix(PAL.chest, PAL.chestIn, 0.45));
    rect(x, ly - lh / 2 + 1.5, w + 2, 2.5, PAL.chestTrim); rect(x - w * 0.3, ly, 2.5, lh, PAL.chestTrim); rect(x + w * 0.3, ly, 2.5, lh, PAL.chestTrim);
    oRect(x, y, w, h, PAL.chest);
    rect(x - w * 0.3, y, 2.5, h, PAL.chestTrim); rect(x + w * 0.3, y, 2.5, h, PAL.chestTrim);
    rect(x, y - h * 0.18, w - 5, h * 0.5, PAL.chestIn);
    circ(x, y - h * 0.18, h * 0.42, withA(PAL.gold, 0.25 + 0.15 * pu));
    for (var g = -2; g <= 2; g++) circ(x + g * w * 0.15, y - h * 0.12 - (2 - Math.abs(g)) * 1.5, 3.2, g % 2 ? PAL.chestTrim : PAL.gold);
    var gx = x + w * 0.22, gy = y - h * 0.38, gl = 5 + 6 * pu;
    rect(gx, gy, 1.8, gl, PAL.sparkHot); rect(gx, gy, gl, 1.8, PAL.sparkHot); circ(gx, gy, 2, PAL.white);
  } else {
    oRect(x, y, w, h, PAL.chest);
    rect(x, y, w, 2.5, PAL.chestTrim); rect(x - w * 0.3, y, 2.5, h, PAL.chestTrim); rect(x + w * 0.3, y, 2.5, h, PAL.chestTrim);
    rect(x, y - h * 0.32, w, h * 0.36, PAL.chestLid);
    oRect(x, y, 6, 7, PAL.chestTrim);
    ring(x, y, w * 0.75 + 2 * Math.sin(t * 4), 1.5, withA(PAL.chestTrim, 0.6));
  }
}

function drawSupply(S, s, t) {
  if (S.stageKind !== 'supply') return;
  var p = S.supplyPos || { x: (S.room && S.room.w || S.cols || 9) / 2, y: (S.room && S.room.h || 15) / 2 }, x = X(p.x), y = Y(p.y), w = 1.1 * s;
  rect(x + sh.x * 1.3, y + sh.y * 1.3, w, w, PAL.shadow);
  oRect(x, y, w, w, PAL.crate);
  if (!S.supply && S.phase !== 'supply') {   // choice made: crate stands open and empty (dark inside, lid knocked aside), no beacon
    rect(x, y, w - 8, w - 8, PAL.crateBand); rect(x, y - w * 0.1, w - 12, w * 0.3, PAL.ink);
    rect(x + w * 0.42, y + w * 0.5, w * 0.7, w * 0.22, PAL.crateLid, -0.35); rect(x + w * 0.42, y + w * 0.5 + w * 0.08, w * 0.7, 3, PAL.crateBand, -0.35);
    return;
  }
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

// GEAR (step 8): Wing Drone = small diamond body with a cyan eye at the shoulder; Guard Drone = a ring around the Operator,
// full and bright when ready, a filling arc while it recharges. Sim state only (S.drone, S.guard); nothing here when the keys are absent.
function drawGear(S, s, t) {
  var h = S.hero, rr = (h.r || 0.28) * s;
  if (S.guard) {
    var g = S.guard, ready = g.t <= 0, f = ready ? 1 : 1 - g.t / g.every, cx = X(h.x), cy = Y(h.y), R = rr + 7;
    ring(cx, cy, R, 4, withA(PAL.ink, 0.55));
    if (ready) { ring(cx, cy, R, 2.4, PAL.shield); glow(cx, cy, R * 1.2, PAL.shield, 0.25, 3); }
    else ring(cx, cy, R, 2.4, withA(PAL.shield, 0.75), -Math.PI / 2, -Math.PI / 2 + TAU * f);
  }
  if (S.drone) {
    var d = S.drone, bob = Math.sin(t * 3.1) * 1.4, dx = X(d.x), dy = Y(d.y) + bob, z = Math.max(4, rr * 0.5) + d.kick * 1.2;
    circ(dx + 1.5, dy + 3 + 1, z * 0.8, PAL.shadow);
    rect(dx, dy, z * 2 + 2, z * 2 + 2, PAL.ink, Math.PI / 4);
    rect(dx, dy, z * 2, z * 2, PAL.pierce, Math.PI / 4);
    circ(dx, dy, z * 0.55 + d.kick * 0.8, d.kick > 0.2 ? PAL.sparkHot : PAL.cyan);
  }
}

function drawHeroHp(S, s) {
  var h = S.hero; if (!(h.maxHp > 0)) return;
  // QA-P1 D13: 1 px ink outline + dark track, lifted clear of the rifle tip when aiming up
  var x = X(h.x), y = Y(h.y) - (h.r || 0.28) * s * 1.95 - 7, w = 28, f = Math.max(0, Math.min(1, h.hp / h.maxHp));
  rect(x, y, w + 2, 6, PAL.ink);
  rect(x, y, w, 4, PAL.hpTrack);
  if (f > 0) rect(x - w / 2 + (w * f) / 2, y, w * f, 4, f < 0.3 ? PAL.heroHpLow : PAL.heroHp);
}

// QA-P1 D3: visible room edge (visual only; sim bounds unchanged). Same sand everywhere; out of bounds is a shade of it.
// Stepped rooms (R42, FULLSCREEN-LAYOUT 1): spare width of one tile or less in total is the room's own side wall, half each side;
// beyond the 15-column clamp the ground outside the room is the same sand at 65% brightness (Q2-A), with no lights and no text.
function drawOutOfBounds(S, s, RW, RH) {
  var y0 = Y(RH), xl = X(0), xr = X(RW);
  if (y0 < vw.h) rect((xl + xr) / 2, (y0 + vw.h) / 2, xr - xl, vw.h - y0, PAL.oob); // ground apron under the room
  if (!(xl > 0.5 || xr < vw.w - 0.5)) return;
  var spare = xl + (vw.w - xr), yt = Y(0);
  if (spare <= s + 0.5) {   // thin side wall (at most one tile in total)
    var ys = Y(topWallH(S, RW)); // seam (side-wall rail) starts under the top wall; drawWallCorners joins the two
    if (xl > 0.5) { rect(xl / 2, (yt + y0) / 2, xl, y0 - yt, PAL.wall); rect(xl - 1, (ys + y0) / 2, 2, y0 - ys, PAL.wallSeam); }
    if (xr < vw.w - 0.5) { rect((xr + vw.w) / 2, (yt + y0) / 2, vw.w - xr, y0 - yt, PAL.wall); rect(xr + 1, (ys + y0) / 2, 2, y0 - ys, PAL.wallSeam); }
    if (y0 < vw.h) { if (xl > 0.5) rect(xl / 2, (y0 + vw.h) / 2, xl, vw.h - y0, PAL.oob); if (xr < vw.w - 0.5) rect((xr + vw.w) / 2, (y0 + vw.h) / 2, vw.w - xr, vw.h - y0, PAL.oob); }
    return;
  }
  // beyond the clamp: darkened ground (black at 0.35 over the sand and its decals = 65% brightness), full height; perimeter line on the room edge
  if (xl > 0.5) rect(xl / 2, vw.h / 2, xl + 1, vw.h + 2, PAL.outside);
  if (xr < vw.w - 0.5) rect((xr + vw.w) / 2, vw.h / 2, vw.w - xr + 1, vw.h + 2, PAL.outside);
  rect(xl - 1.5, (yt + y0) / 2, 3, y0 - yt, PAL.ink); rect(xr + 1.5, (yt + y0) / 2, 3, y0 - yt, PAL.ink);
}
// height (tiles) of the top wall: the solids on row 0 touching a side of the room (1 in every template; 0 if a room has none)
function topWallH(S, RW) {
  var sol = (S.room && S.room.solids) || [], h = 0;
  for (var i = 0; i < sol.length; i++) { var q = sol[i]; if (q.y <= 0.01 && (q.x <= 0.01 || q.x + q.w >= RW - 0.01)) h = Math.max(h, q.h); }
  return h;
}
// QA-VISUAL D4 (option A): with a thin side strip (spare width of one tile or less), the strip is the side wall's continuation of the top wall:
// the top wall's face (wall rim + light top) runs on to the screen edge, its bottom ink line runs across the strip, and the strip's rail starts
// under it, so neither top corner shows a seam. Drawn after the solids so it covers the top wall's own end outline.
function drawWallCorners(S, s, RW, RH) {
  var xl = X(0), xr = X(RW), spare = xl + (vw.w - xr);
  if (!(xl > 0.5 || xr < vw.w - 0.5) || spare > s + 0.5) return;
  var h = topWallH(S, RW); if (!(h > 0)) return;
  var yt = Y(0), yb = Y(h), ph = yb - yt;
  for (var k = 0; k < 2; k++) {
    var a = k ? xr - OL - 0.5 : 0, b = k ? vw.w : xl + OL + 0.5; // covers the top wall's end outline (OL wide) on that side
    if (k ? !(xr < vw.w - 0.5) : !(xl > 0.5)) continue;
    var ia = k ? xr : 0, ib = k ? vw.w : xl;                                       // ink band (bottom rim) stops at the room edge, under the face
    rect((ia + ib) / 2, (yt + yb) / 2, ib - ia, ph + 2 * OL, PAL.ink);             // so no half-covered ink pixel is left at the join
    rect((a + b) / 2, (yt + yb) / 2 - OL / 2, b - a, ph + OL, PAL.wall);           // wall face, flush with the top edge
    var la = k ? xr - 5 : 0, lb = k ? vw.w : xl + 4;                              // light top, overlapping the top wall's inner rect (no AA seam)
    rect((la + lb) / 2, (yt + 1 + yb - 3) / 2, lb - la, ph - 4, PAL.wallTop);
  }
}
function drawRoomEdge(S, s, RW, RH) {
  var y0 = Y(RH), yt = Y(0.5), xl = X(0), xr = X(RW), cw = 4;
  // side curbs: thin concrete strip just inside each side wall line
  for (var k = 0; k < 2; k++) {
    var cx = k ? xr - cw / 2 : xl + cw / 2, hh = y0 - yt;
    rect(cx + (k ? -1 : 1) * (cw / 2 + 0.5), yt + hh / 2, 1, hh, withA(PAL.ink, 0.55));
    rect(cx, yt + hh / 2, cw, hh, PAL.curb);
    rect(cx + (k ? 0.5 : -0.5), yt + hh / 2, 1.5, hh, PAL.curbTop);
  }
  // bottom berm: two staggered rows of sandbags inside the bottom strip of row 14 (QA-VISUAL D1 option A: same look at every size, whole
  // even with no apron). The front row's lower rim sits on the room line; with an apron, the hard shadow falls on the ground below it.
  var bw = Math.max(18, s * 0.6), bh = 9, n = Math.ceil((xr - xl) / bw) + 1, rb = bh / 2, core = bw - 2 * rb - 1.5, b0 = y0 - 19;
  if (y0 < vw.h) rect((xl + xr) / 2, y0 + 1 + sh.y * 0.5, xr - xl, 6, PAL.shadow);
  for (var row = 0; row < 2; row++) {
    var by = b0 + 5.5 + row * 8, off = row ? bw / 2 : 0;
    for (var i = -1; i < n; i++) {
      var bx = xl + off + i * bw + bw / 2;
      if (bx + bw / 2 < xl - 2 || bx - bw / 2 > xr + 2) continue;
      // pillow-shaped bag: rect body + round ends, ink rim
      rect(bx, by, core, bh + 2 * OL, PAL.ink); circ(bx - core / 2, by, rb + OL, PAL.ink); circ(bx + core / 2, by, rb + OL, PAL.ink);
      rect(bx, by, core, bh, PAL.bag); circ(bx - core / 2, by, rb, PAL.bag); circ(bx + core / 2, by, rb, PAL.bag);
      rect(bx - 1, by - 1.8, core, 2.5, PAL.bagTop);
      rect(bx + core / 2 - 1, by, 1.2, bh - 3, PAL.bagSeam);
    }
  }
}

// particle clock = S.t (hit-stop and pause freeze sparks); stepped from both ingest and build. The shake, the screen flash and the Operator's
// death use a wall clock instead: they must keep moving while hit-stop and the results screen hold the sim still.
function tickWall() {
  var w = G_now(); FX.wdt = FX.wall ? Math.min(0.1, Math.max(0, w - FX.wall)) : 0; FX.wall = w;
  if (FX.shake > 0) FX.shake = FX.shake < 0.05 ? 0 : FX.shake * Math.exp(-FX.wdt * 11);
  if (FX.flash > 0) FX.flash = Math.max(0, FX.flash - FX.wdt * 2.4);
}
function advance(S) {
  var t = S.t || 0, dt = Math.max(0, Math.min(0.1, t - P.lastT)); P.lastT = t;
  if (dt > 0) { stepParticles(dt); animStep(S, dt); }
}
function resetIfNew(S) {
  var t = S.t || 0;
  if (P.seed !== S.seed || t < P.lastT) {
    P.list.length = 0; P.decals.length = 0; AN.m.clear(); P.rnd = mkRng(((S.seed | 0) ^ 0x5eed) + 1); P.seed = S.seed; P.lastFrame = -1; P.lastT = t;
    AN.h.init = false; AN.h.death = -1; AN.h.kick = AN.h.flash = AN.h.hurt = 0; FX.shake = 0; FX.flash = 0; FX.bossIntro = -1; FX.lastShake = {}; FX.hitMs.length = 0;
  }
}
function noteRoom(S) {
  var k = (S.stage | 0) + ':' + (S.roomId || '') + ':' + (S.lap | 0);
  if (k !== P.roomKey) { P.roomKey = k; P.decals.length = 0; P.roomSeq++; V.Scene.roomSeq = P.roomSeq; }
}
// hero death: the Operator collapses (spin, shrink, fade) over 0.9 s of wall time after the run ends
function heroDeathU() { var H = AN.h; if (H.death < 0) return -1; var u = (FX.wall - H.death) / (reduced ? 0.4 : 0.9); return u >= 1 ? -1 : Math.max(0, u); }

// Hit-stop (M's picks, VISUAL-DESIGN 11): only on boss hits, hero damage and the boss's final blast; none on ordinary hits, crits or kills.
// Returns the freeze in ms for one sim event (0 = none). main.js calls this for every event; limits from VISUAL-DESIGN 4.7:
// 200 ms between stops (hero hurt always allowed), 250 ms in any 1 s, max 160 ms. Durations are guesses, about half the spec's 70-90 ms.
function hitStopMs(e, S, nowMs) {
  if (reduced || !e) return 0;
  var ms = 0, hurt = e.k === 'hurt';
  if (hurt) ms = 45;
  else if (e.k === 'hit') { var a = AN.m.get(e.id); if (a && a.boss) ms = 30; }
  else if (e.k === 'kill' && e.boss) ms = 110;
  if (!ms) return 0;
  var now = nowMs != null ? nowMs : G_now() * 1000, L = FX.hitMs, i, used = 0;
  while (L.length && now - L[0].t > 1000) L.shift();
  for (i = 0; i < L.length; i++) used += L[i].ms;
  if (!hurt && e.k !== 'kill') { if (now - FX.lastHitStop < 200) return 0; if (used + ms > 250) return 0; }
  FX.lastHitStop = now; L.push({ t: now, ms: ms });
  return ms;
}

V.Scene = {
  stress: 0,
  roomSeq: 0,
  reduced: reduced,
  // main.js calls this after EVERY sim step; once used, build() stops reading S.events itself (no doubles)
  ingest: function (events, S) {
    if (!S) return;
    P.ingested = true; tickWall();
    resetIfNew(S); noteRoom(S);
    advance(S);
    eatEvents(events, S);
    eatFx(S.fx);
    sweepAnim(S);
  },
  hitStopMs: hitStopMs,
  PAL: PAL,
  particles: P.list,
  // Effect scaler hooks (render.js): setStep(0..5, isCanvas). Canvas 2D has no bloom blur and 12 glow sprites, so render.js floors it at step 4.
  setStep: function (n, isCanvas) { n = Math.max(0, Math.min(5, n | 0)); T = TIERS[n]; canvasMode = !!isCanvas; V.Scene.step = n; },
  step: 0,
  stats: STAT,
  tiers: TIERS,
  // Drawing helpers for other parts (draw-list helper object; the catch room draws on its own overlay canvas, so it does not use it). All coordinates are CSS px.
  ctx: { rect: function (x, y, w, h, c, rot) { rect(x, y, w, h, c, rot); }, circ: function (x, y, r, c) { circ(x, y, r, c); }, ring: function (x, y, r, lw, c, a0, a1) { ring(x, y, r, lw, c, a0, a1); },
    line: function (x1, y1, x2, y2, lw, c) { line(x1, y1, x2, y2, lw, c); }, ngon: function (x, y, r, n, rot, c) { ngon(x, y, r, n, rot, c); },
    grad: function (x, y, w, h, c, c2, rot) { grad(x, y, w, h, c, c2, rot); }, rgrad: function (x, y, r, c, c2, add) { rgrad(x, y, r, c, c2, add); },
    glow: function (x, y, r, c, a, prio, add) { glow(x, y, r, c, a, prio, add); },
    oCirc: function (x, y, r, c) { oCirc(x, y, r, c); }, oRect: function (x, y, w, h, c, rot) { oRect(x, y, w, h, c, rot); }, oNgon: function (x, y, r, n, rot, c) { oNgon(x, y, r, n, rot, c); },
    X: function (x) { return X(x); }, Y: function (y) { return Y(y); }, withA: withA, mix: mix, PAL: PAL, mkRng: mkRng,
    get list() { return out; }, get view() { return vw; }, get step() { return T.step; }, get reduced() { return reduced; },
    // world-unit effect spawners (they obey the tier caps): spark burst, ring, smoke puff
    burst: function (x, y, n, spd, life, col, size) { spawnBurst(x, y, n, spd, life, col, size, 4, 'B'); }, spawnRing: function (x, y, r0, r1, life, col) { spawnRing(x, y, r0, r1, life, col); }, smoke: function (x, y, n) { spawnSmoke(x, y, n); } },
  build: function (S, view, outArr) {
    out = outArr; vw = view; out.length = 0; GL.length = 0;
    var s = view.s, t = S.t || 0;
    tickWall(); V.Scene.lastStage = S.stage;
    // particle bookkeeping (own clock = S.t, so hit-stop and pause freeze sparks too)
    resetIfNew(S); noteRoom(S);
    advance(S);
    if (!P.ingested && S.frame !== P.lastFrame) { P.lastFrame = S.frame; eatEvents(S.events, S); eatFx(S.fx); }
    sweepAnim(S);
    sh.x = Math.max(2, s * 0.14); sh.y = Math.max(3, s * 0.2);
    // screen shake: one channel, play field only, 150 ms refractory per source; held to 1.5 px while a lethal tell is locked (spec 3 px, halved)
    var amp = FX.shake, E0 = S.enemies || [];
    if (amp > 0) { for (var li = 0; li < E0.length; li++) if (E0[li].st === 'tell' && (E0[li].tell01 || 0) > 0.66 && E0[li].locked !== false) { amp = Math.min(amp, 1.5); break; } }
    shx = amp > 0 ? Math.sin(FX.wall * 131.7) * amp : 0; shy = amp > 0 ? Math.cos(FX.wall * 97.3) * amp : 0;

    // ground: whole screen (oversized so the shake never shows an edge), continues below the room
    rect(view.w / 2, view.h / 2, view.w + 24, view.h + 24, PAL.ground);
    var dc = groundDeco(S);
    for (var i = 0; i < dc.length; i++) {
      var d = dc[i];
      if (d.streak) line(d.x - 6 * Math.cos(d.a), d.y - 2, d.x + 6 * Math.cos(d.a), d.y + 2, 1, PAL.groundDot);
      else circ(d.x, d.y, d.r, d.light ? PAL.groundDot2 : PAL.groundDot);
    }
    if (S.stageKind === 'collect' && S.mini) { drawVignette(S); STAT.prims = out.length; return out; }   // the catch room draws on its own overlay canvas (main.js cCatch); only the ground shows under it
    var R = S.room, RW = (R && R.w) || S.cols || 9, RH = (R && R.h) || 15;
    // room floor = same sand as the ground below (M 2026-11-10: one continuous yard, no panel)
    drawOutOfBounds(S, s, RW, RH); // QA-P1 D3: below/beside the room = same sand, shaded darker

    var E = S.enemies || [], sol = (R && R.solids) || [];
    drawHazards(S, s, t);
    drawDecals(s);
    for (i = 0; i < E.length; i++) { drawEnemyTellGround(S, E[i], s); drawLaneTell(S, E[i], s); drawMachineGround(S, E[i], s, t); drawKitTells(S, E[i], s, t); drawBossGround(S, E[i], s, t); }
    drawShellRings(S, s, t);

    // shadows (hard, low sun from the upper left). Step 5: unit shadows are plain hull circles, pickups and small props stop casting.
    for (i = 0; i < sol.length; i++) drawSolidShadow(sol[i], s, RW, RH);
    var pk = S.pickups || [];
    if (T.shadowSmall) for (i = 0; i < pk.length; i++) circ(X(pk[i].x) + sh.x * 0.4, Y(pk[i].y) + sh.y * 0.4, 4, PAL.shadow);
    for (i = 0; i < E.length; i++) {
      var e = E[i], er = (e.r || 0.4) * s, fly = e.type === 'E-01' ? 1.6 : 1;
      if (e.under === true) continue;   // E-07 underground casts nothing
      if (e.type === 'E-07') er *= 0.4 + 0.6 * (e.surf01 != null ? e.surf01 : 1);
      if (T.simpleShadow) { var eb = isBossE(e); circ(X(e.x) + sh.x * (eb ? 1.6 : fly), Y(e.y) + sh.y * (eb ? 1.6 : fly), er * (eb ? 1.05 : 0.9), PAL.shadow); continue; }
      var LKs = lookOf(e);
      if (LKs && LKs.shadow) { LKs.shadow(V.SceneKit, S, e, X(e.x), Y(e.y), er, sh.x, sh.y); continue; }
      if (e.type === 'E-02') rect(X(e.x) + sh.x * fly, Y(e.y) + sh.y * fly, er * 1.5, er * 1.5, PAL.shadow, e.ang || 0);
      else if (e.type === 'E-03') ngon(X(e.x) + sh.x, Y(e.y) + sh.y, er, 6, Math.PI / 6, PAL.shadow);
      else if (isBossE(e)) ngon(X(e.x) + sh.x * 1.6, Y(e.y) + sh.y * 1.6, er * 1.08, 8, Math.PI / 8, PAL.shadow);
      else if (e.type === 'E-04') rect(X(e.x) + sh.x, Y(e.y) + sh.y, er * 1.5, er * 1.15, PAL.shadow, e.ang || 0);
      else if (e.type === 'E-05') ngon(X(e.x) + sh.x, Y(e.y) + sh.y, er, 3, e.ang || 0, PAL.shadow);
      else if (e.type === 'E-08') { ngon(X(e.x) + sh.x, Y(e.y) + sh.y, er * 1.0, 4, 0, PAL.shadow); ngon(X(e.x) + sh.x, Y(e.y) + sh.y - er * 0.75, er * 0.55, 3, -Math.PI / 2, PAL.shadow); ngon(X(e.x) + sh.x, Y(e.y) + sh.y + er * 0.75, er * 0.55, 3, Math.PI / 2, PAL.shadow); }
      else if (e.type === 'E-06') circ(X(e.x) + sh.x, Y(e.y) + sh.y, er * 1.05, PAL.shadow);
      else circ(X(e.x) + sh.x * fly, Y(e.y) + sh.y * fly, er * 0.9, PAL.shadow);
    }
    var H = S.hero, dU = heroDeathU(), heroOn = H && S.phase !== 'dead' && !(S.phase === 'results' && S.result && !S.result.win);
    if (heroOn) circ(X(H.x) + sh.x * 0.7, Y(H.y) + sh.y * 0.7, (H.r || 0.28) * s, PAL.shadow);
    else if (H && dU >= 0 && dU < 0.7) circ(X(AN.h.dx) + sh.x * 0.7, Y(AN.h.dy) + sh.y * 0.7, (H.r || 0.28) * s * (1 - dU), PAL.shadow);

    drawRoomEdge(S, s, RW, RH); // QA-P1 D3: sandbag berm + side curbs
    for (i = 0; i < sol.length; i++) drawSolid(sol[i], s);
    drawWallCorners(S, s, RW, RH); // QA-VISUAL D4: thin side strip joined to the top wall
    drawDoor(S, s);
    // sun grade: one warm wash from the upper left fading to a cool-brown corner lower right, over ground and structure, under every unit and tell.
    var dg = Math.hypot(view.w, view.h);
    grad(view.w / 2, view.h / 2, dg, dg, [1, 0.93, 0.745, 0.16], [0.27, 0.19, 0.08, 0.16], -Math.PI / 4);
    drawAmbient(S, s, t, RW, RH);
    drawSupply(S, s, t);
    drawChest(S, s, t);
    for (i = 0; i < pk.length; i++) drawPickup(pk[i], s, t);
    for (i = 0; i < E.length; i++) { drawEnemyAim(S, E[i], s); var LKo = lookOf(E[i]); if (LKo && LKo.over) LKo.over(V.SceneKit, S, E[i], s, t); }
    for (i = 0; i < E.length; i++) drawEnemy(S, E[i], s, t);
    drawGhosts(S, s, t);
    drawFx(S, s, t);
    drawLock(S, s, t); // enemy marker: under the Operator (QA-P1 D2)
    // QA-P1 D2: the Operator and its HP bar sit above every enemy layer (bodies, HP bars, lock ring)
    if (heroOn) { drawBrace(S, s); drawHero(S, s, t); drawHeroHp(S, s); }
    if (heroOn && (S.drone || S.guard)) drawGear(S, s, t);
    else if (H && dU >= 0) drawHero(S, s, t, dU);

    var rd = S.rounds || [];
    for (i = 0; i < rd.length; i++) {
      var q = rd[i], rr = Math.max(2.5, (q.r || 0.12) * s), sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy) || 1;
      var tl = 0.6 / sp;   // trail about 0.6 tile
      var core = q.burn ? PAL.burn : q.poison ? PAL.poison : q.freeze ? PAL.freeze : PAL.roundCore;
      var trail = q.burn ? withA(PAL.burn, 0.5) : q.poison ? withA(PAL.poison, 0.5) : PAL.roundTrail;
      // L1: capsule streak with a dark --pv-round-rim under it and a rim ring on the head, so it reads on sand, in greyscale, and among the pink
      var tx0 = X(q.x - q.vx * tl * (q.pierce ? 1.2 : 1)), ty0 = Y(q.y - q.vy * tl * (q.pierce ? 1.2 : 1)), hx0 = X(q.x), hy0 = Y(q.y);
      line(tx0, ty0, hx0, hy0, rr * 1.5 + 3, PAL.roundRim); circ(tx0, ty0, rr * 0.75 + 1.5, PAL.roundRim);
      line(tx0, ty0, hx0, hy0, rr * 1.5, q.burn || q.poison ? trail : PAL.roundTrail2); circ(tx0, ty0, rr * 0.75, q.burn || q.poison ? trail : PAL.roundTrail2);
      if (q.pierce) rect(hx0, hy0, rr * 3.2, rr * 1.3, PAL.pierce, Math.atan2(q.vy, q.vx));
      circ(hx0, hy0, rr + 1.5, PAL.roundRim); circ(hx0, hy0, rr, PAL.round); circ(hx0, hy0, rr * 0.55, core);
      if (q.rico) ring(X(q.x), Y(q.y), rr + 2.5, 1.2, PAL.cyan);
      if (q.bounceWall) ring(X(q.x), Y(q.y), rr + 1, 1, PAL.ink);
      glow(X(q.x), Y(q.y), rr * 3, q.burn ? PAL.burn : q.poison ? PAL.poison : PAL.cyan, 0.4, 3);
    }
    var sv = S.shots || [];
    for (i = 0; i < sv.length; i++) {
      var o = sv[i], r2 = Math.max(4, (o.r || 0.12) * 2 * s);
      circ(X(o.x), Y(o.y), r2 + 2.5, withA(PAL.shot, 0.28));
      circ(X(o.x), Y(o.y), r2 + 1, PAL.shotRim);
      circ(X(o.x), Y(o.y), r2, PAL.shot); circ(X(o.x), Y(o.y), r2 * 0.45, PAL.shotCore);
      if (i < 20 || !canvasMode) glow(X(o.x), Y(o.y), r2 * 2.6, PAL.shot, 0.38, 3);   // enemy rounds with a halo: first 20 only past that (step 3 rule)
    }
    drawShells(S, s);
    drawParticles(s, S);
    flushGlows();
    if (V.Scene.stress > 0) drawStress(V.Scene.stress | 0, t);
    drawVignette(S);
    if (FX.flash > 0) rect(view.w / 2, view.h / 2, view.w + 2, view.h + 2, [1, 0.97, 0.88, FX.flash]);   // boss death flash: once, 0.15 s
    // counters for the report and the scaler log
    STAT.prims = out.length; STAT.particles = P.list.length; STAT.decals = P.decals.length; STAT.builds++;
    if (STAT.prims > STAT.peakPrims) STAT.peakPrims = STAT.prims; if (STAT.particles > STAT.peakParticles) STAT.peakParticles = STAT.particles;
    return out;
  }
};
// S7 SceneKit: the helper set V.Look[type] functions draw with (LOOK-HOOK.md). Screen coords are CSS px; world -> px via X()/Y() and s.
// Draw-only: nothing here reads or writes sim state or the sim rng.
V.SceneKit = {
  circ: circ, ring: ring, rect: rect, line: line, ngon: ngon, grad: grad, rgrad: rgrad, glow: glow,
  oCirc: oCirc, oRect: oRect, oNgon: oNgon,
  X: X, Y: Y, withA: withA, mix: mix, C: C, PAL: PAL, TAU: TAU, STEEL: STEEL, mkRng: mkRng,
  rayLen: rayLen, bossAttack: bossAttack, isBoss: isBossE,
  hpBar: hpBar, eliteTrim: drawEliteTrim, status: drawStatus,
  dashLine: dashLine, groundRing: groundRing, ribbon: ribbon, marker: marker,
  burst: function (x, y, n, spd, life, col, size) { spawnBurst(x, y, n, spd, life, col, size, 4, 'B'); },
  spawnRing: function (x, y, r0, r1, life, col) { spawnRing(x, y, r0, r1, life, col); }, smoke: function (x, y, n, col) { spawnSmoke(x, y, n, col); },
  get OL() { return OL; }, set OL(v) { OL = v; },
  get s() { return vw ? vw.s : 36; }, get view() { return vw; }, get list() { return out; },
  get sh() { return sh; }, get step() { return T.step; }, get rim() { return T.rim; }, get reduced() { return reduced; },
  get wall() { return FX.wall; }, get bossIntro() { return FX.bossIntro; }
};
})();
