// vfx.js - PL.Vfx: particles, event effects, quality governor, flash limiter, reduced-motion, star wipe (S8).
// Wraps PL.Light (load light.js first). Pure visuals: never reads or writes game state beyond the hero
// snapshot passed to update(); own seeded RNG; fixed-size typed pools (no per-frame allocation).
//
// CALL ORDER (skin / ui loop), world coords = room px, cam = { scale, cx, cy } (+ optional W,H):
//   once:      PL.Vfx.init(cssW, cssH, dpr, {seed})   ; on resize: PL.Vfx.resize(cssW, cssH, dpr)
//   per room:  PL.Vfx.setRoom(state.room)             ; (optional) PL.Vfx.setBackdrop(farImg, nearImg)
//   per frame: PL.Vfx.update(realDtSeconds, state.events, state, state.g)   // skipped safely on bad dt
//              ctx.save(); apply PL.Vfx.cameraFx() (shake/tilt/zoom) if wanted
//              PL.Vfx.drawBack(ctx, cam)      // replaces the paper fill: backdrop, aurora, shafts, motes
//              ...skin draws walls, gates, crushers, spikes, exit, hero (use PL.Vfx.heroDeform())...
//              PL.Vfx.drawFront(ctx, cam)     // gate ribbons, spike glints, portal, rim light, lantern, hero light,
//                                             // particles, bloom, vignette, grade
//              ...HUD, pad...
//              PL.Vfx.drawOverlay(ctx, cam)   // room-transition star wipe (above HUD, below DEV badge)
//   other:     PL.Vfx.setQuality('auto'|'full'|'lite'|'off'), setReduced(bool), setHazards(rects),
//              PL.Vfx.wipe('close'|'open'), PL.Vfx.wipeState(), PL.Vfx.fire(name,{x,y}), PL.Vfx.stats()
const PL = (globalThis.PL = globalThis.PL || {});

(function () {
  const TAU = Math.PI * 2;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const MAXP = 160, MAXRATE_FLASH = 2;
  const CAPS = { full: 160, lite: 64, off: 0 }, CAP_REDUCED = 24;
  const LEVELS = ['full', 'lite', 'off'];

  if (!PL.vfxRand) {
    PL.vfxRand = function (seed) {
      let a = (seed >>> 0) || 1;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
  }
  function fin(n, d) { return typeof n === 'number' && isFinite(n) ? n : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function mk(w, h) {
    let c;
    if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
    else c = { getContext: function () { return PL.vfxFakeCtx ? PL.vfxFakeCtx() : null; } };
    c.width = w; c.height = h; return c;
  }
  const eo = function (t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
  const ei = function (t) { t = clamp(t, 0, 1); return t * t * t; };
  const eb = function (t) { t = clamp(t, 0, 1); const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  // ---------- quality governor (pure, testable) ----------
  // Measures real frame deltas (rAF). Thresholds are absolute so a locked 60 Hz screen (16.7 ms) is healthy:
  // step down when avg > 20 ms (below 50 fps) for 2 s; step up when avg < 17.5 ms for 10 s, at most one
  // up-step per 30 s, with back-off (x2, cap 240 s) if a step-down follows an up-step within 60 s.
  // Never steps while `busy` (flip, slam, wipe).
  function Governor(opts) {
    opts = opts || {};
    this.win = opts.win || 90; this.down = opts.down || 20; this.up = opts.up || 17.5;
    this.downT = opts.downT || 2; this.upT = opts.upT || 10; this.gap = opts.gap || 30;
    this.buf = new Float32Array(this.win); this.n = 0; this.i = 0; this.sum = 0;
    this.over = 0; this.under = 0; this.since = 1e9; this.level = 0; this.backoff = 1; this.lastUp = -1e9; this.clock = 0;
  }
  Governor.prototype.avg = function () { return this.n ? this.sum / this.n : 0; };
  Governor.prototype.p95 = function () {
    if (!this.n) return 0;
    const a = Array.prototype.slice.call(this.buf, 0, this.n).sort(function (x, y) { return x - y; });
    return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
  };
  // dtMs: real frame delta. returns +1 (stepped down: lower quality), -1 (stepped up), 0 nothing
  Governor.prototype.push = function (dtMs, busy) {
    if (!(dtMs > 0) || dtMs > 250 || !isFinite(dtMs)) return 0; // tab switch / hitch: ignore
    const dt = dtMs / 1000;
    this.clock += dt; this.since += dt;
    if (this.n < this.win) { this.buf[this.i] = dtMs; this.sum += dtMs; this.n++; }
    else { this.sum += dtMs - this.buf[this.i]; this.buf[this.i] = dtMs; }
    this.i = (this.i + 1) % this.win;
    if (this.n < 30) return 0;
    const a = this.avg();
    this.over = a > this.down ? this.over + dt : 0;
    this.under = a < this.up ? this.under + dt : 0;
    if (busy) return 0;
    if (this.over >= this.downT && this.level < LEVELS.length - 1) {
      if (this.clock - this.lastUp < 60) this.backoff = Math.min(8, this.backoff * 2);
      this.level++; this.over = 0; this.under = 0; this.since = 0; this.n = 0; this.i = 0; this.sum = 0;
      return 1;
    }
    if (this.under >= this.upT && this.since >= this.gap * this.backoff && this.level > 0) {
      this.level--; this.under = 0; this.over = 0; this.since = 0; this.lastUp = this.clock; this.n = 0; this.i = 0; this.sum = 0;
      return -1;
    }
    return 0;
  };
  Governor.prototype.reset = function () { this.n = 0; this.i = 0; this.sum = 0; this.over = 0; this.under = 0; };

  // ---------- flash limiter: at most MAXRATE_FLASH brightness pulses per second (hard cap 3) ----------
  function FlashLimiter(max) { this.max = Math.min(3, max || MAXRATE_FLASH); this.ts = []; }
  FlashLimiter.prototype.try = function (t) {
    while (this.ts.length && t - this.ts[0] >= 1) this.ts.shift();
    if (this.ts.length >= this.max) return false;
    this.ts.push(t); return true;
  };
  FlashLimiter.prototype.count = function (t) { while (this.ts.length && t - this.ts[0] >= 1) this.ts.shift(); return this.ts.length; };

  // ---------- state ----------
  const V = {
    inited: false, W: 360, H: 640, dpr: 1, seed: 1, rng: null,
    level: 0, auto: true, forced: null, reduced: false, t: 0, busyT: 0,
    gov: new Governor(), flash: new FlashLimiter(MAXRATE_FLASH),
    // particle pool (typed, fixed)
    alive: new Uint8Array(MAXP), kind: new Uint8Array(MAXP), col: new Uint8Array(MAXP), trailF: new Uint8Array(MAXP),
    x: new Float32Array(MAXP), y: new Float32Array(MAXP), vx: new Float32Array(MAXP), vy: new Float32Array(MAXP),
    ax: new Float32Array(MAXP), ay: new Float32Array(MAXP), drag: new Float32Array(MAXP),
    life: new Float32Array(MAXP), max: new Float32Array(MAXP), s0: new Float32Array(MAXP), s1: new Float32Array(MAXP),
    al: new Float32Array(MAXP), rot: new Float32Array(MAXP), vr: new Float32Array(MAXP),
    count: 0, trailCount: 0, peak: 0, dropped: 0,
    hero: { x: 0, y: 0, vx: 0, vy: 0, g: 2, has: false, grounded: true, dead: false, t: 0 },
    room: null, tips: [], exit: null, prevO: [],
    shake: 0, shakeAmp: 0, shakeT: 1, shx: 0, shy: 0, shakeScale: 1,
    flipT: 9, flipDir: 2, tiltAmp: 0.021, zoomAmp: 0.015,
    antic: 0, landT: 9, landAmp: 0.15, smoothS: 1, blinkT: 3, blink: 0, bobT: 0, vanish: -1, vanishFrom: null,
    trailAcc: 0, suckAcc: 0, celT: 0,
    wipeKind: 'idle', wipeT: 0, wipeDur: 0.32, wipeCb: null, wipeFade: false,
    sprites: null, costMs: 0, trailRate: 0, frame: 0
  };
  const COL = [[255, 214, 110], [95, 224, 200], [244, 239, 224], [150, 150, 200], [139, 108, 255]]; // gold teal cream dust violet
  const CAP_TRAIL = 0.55;

  function bakeSprites() {
    const sp = [];
    for (let i = 0; i < COL.length; i++) {
      const c = mk(32, 32), x = c.getContext('2d'), r = COL[i];
      const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',0.9)');
      g.addColorStop(0.55, 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',0.25)'); g.addColorStop(1, 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',0)');
      x.fillStyle = g; x.fillRect(0, 0, 32, 32);
      sp.push(c);
    }
    const dust = mk(32, 32), dx = dust.getContext('2d'), dg = dx.createRadialGradient(16, 16, 0, 16, 16, 16);
    dg.addColorStop(0, 'rgba(210,200,235,0.9)'); dg.addColorStop(0.6, 'rgba(190,180,225,0.4)'); dg.addColorStop(1, 'rgba(190,180,225,0)');
    dx.fillStyle = dg; dx.fillRect(0, 0, 32, 32);
    V.sprites = { glow: sp, dust: dust };
  }

  function cap() {
    const lv = LEVELS[V.level];
    let c = CAPS[lv];
    if (V.reduced) c = Math.min(c, CAP_REDUCED);
    return c;
  }
  function density() { return V.level === 0 ? 1 : V.level === 1 ? 0.4 : 0; }
  function allowed() { return V.level < 2; }

  // returns slot or -1. prio particles may evict the oldest trail particle when the pool is full.
  function alloc(prio, isTrail) {
    const c = cap();
    if (c <= 0) return -1;
    if (isTrail && V.trailCount >= Math.floor(c * CAP_TRAIL)) { V.dropped++; return -1; }
    if (V.count < c) {
      for (let i = 0; i < MAXP; i++) if (!V.alive[i]) { take(i, isTrail); return i; }
    }
    if (prio) {
      let best = -1, bl = 1e9;
      for (let i = 0; i < MAXP; i++) if (V.alive[i] && V.trailF[i] && V.life[i] < bl) { bl = V.life[i]; best = i; }
      if (best >= 0) { V.alive[best] = 0; V.count--; V.trailCount--; take(best, isTrail); return best; }
    }
    V.dropped++; return -1;
  }
  function take(i, isTrail) { V.alive[i] = 1; V.count++; V.trailF[i] = isTrail ? 1 : 0; if (isTrail) V.trailCount++; if (V.count > V.peak) V.peak = V.count; }
  function free(i) { V.alive[i] = 0; V.count--; if (V.trailF[i]) V.trailCount--; }

  // kinds: 0 glow dot, 1 dust, 2 shard, 3 star, 4 streak
  function emit(kind, col, x, y, vx, vy, life, s0, s1, al, o) {
    const i = alloc(o && o.prio, o && o.trail);
    if (i < 0) return -1;
    V.kind[i] = kind; V.col[i] = col; V.x[i] = x; V.y[i] = y; V.vx[i] = vx; V.vy[i] = vy;
    V.life[i] = life; V.max[i] = life; V.s0[i] = Math.min(24, s0); V.s1[i] = Math.min(24, s1); V.al[i] = Math.min(0.8, al);
    V.ax[i] = o && o.ax || 0; V.ay[i] = o && o.ay || 0; V.drag[i] = o && o.drag || 0;
    V.rot[i] = o && o.rot || 0; V.vr[i] = o && o.vr || 0;
    return i;
  }
  function R() { return V.rng(); }
  function n(k) { return Math.max(0, Math.round(k * (V.level === 0 ? 1 : 0.5))); }

  // ---------- effects ----------
  function burstStars(x, y, count, speedMin, speedMax, life, cols) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * TAU + R() * 0.5, sp = speedMin + R() * (speedMax - speedMin);
      emit(3, cols[(R() * cols.length) | 0], x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * (0.7 + R() * 0.5), 6 + R() * 4, 1, 0.8, { prio: true, drag: 2.2, rot: R() * TAU, vr: (R() - 0.5) * 8 });
    }
  }
  function dustToward(x, y, d, count, spread, speed) {
    for (let k = 0; k < count; k++) {
      const a = (R() - 0.5) * spread, c = Math.cos(a), s = Math.sin(a);
      const dx = d[0] * c - d[1] * s, dy = d[0] * s + d[1] * c, sp = speed * (0.5 + R() * 0.8);
      emit(1, 3, x + (R() - 0.5) * 12, y + (R() - 0.5) * 12, dx * sp, dy * sp, 0.55 + R() * 0.3, 4 + R() * 4, 9 + R() * 5, 0.35, { prio: true, drag: 1.5 });
    }
  }

  const FX = {
    flip: function (o) {
      const h = V.hero, d = DIRS[h.g] || DIRS[2], x = fin(o && o.x, h.x), y = fin(o && o.y, h.y);
      V.flipT = 0; V.flipDir = h.g; V.antic = 0.06; V.busyT = 0.6;
      if (!allowed()) return;
      burstStars(x, y, n(12), 60, 150, 0.5, [0, 2, 1]);
      dustToward(x, y, d, n(8), 1.6, 70);
      if (V.flash.try(V.t) && !V.reduced) PL.Light.pulse(0.06);
    },
    dive: function (o) {
      const h = V.hero, d = DIRS[h.g] || DIRS[2], x = fin(o && o.x, h.x), y = fin(o && o.y, h.y);
      V.busyT = 0.3;
      if (!allowed()) return;
      for (let k = 0; k < n(8); k++) {
        const off = (k - 3.5) * 3.2, px = x - d[1] * off - d[0] * (4 + R() * 10), py = y + d[0] * off - d[1] * (4 + R() * 10);
        emit(4, k % 2 ? 1 : 2, px, py, d[0] * 220, d[1] * 220, 0.28, 14 + R() * 10, 2, 0.7, { prio: true });
      }
    },
    land: function (o) {
      const h = V.hero, d = DIRS[h.g] || DIRS[2], x = fin(o && o.x, h.x + d[0] * 11), y = fin(o && o.y, h.y + d[1] * 11);
      V.landT = 0;
      if (!allowed()) return;
      const px = -d[1], py = d[0];
      for (let k = 0; k < n(6); k++) {
        const s = (k % 2 ? 1 : -1) * (20 + R() * 40);
        emit(1, 3, x, y, px * s - d[0] * 10, py * s - d[1] * 10, 0.4 + R() * 0.2, 3 + R() * 2, 8 + R() * 3, 0.4, { prio: true, drag: 3 });
      }
      for (let k = 0; k < n(3); k++) emit(0, 1, x, y, -d[0] * (30 + R() * 30) + (R() - 0.5) * 50, -d[1] * (30 + R() * 30) + (R() - 0.5) * 50, 0.35, 5, 1, 0.7, { prio: true, drag: 2 });
    },
    crumble: function (o) {
      const h = V.hero, d = DIRS[h.g] || DIRS[2];
      let x = fin(o && o.x, NaN), y = fin(o && o.y, NaN);
      if (isNaN(x) && V.room && V.room.crumbles) {
        let best = 1e9; const cr = V.room.crumbles;
        for (let i = 0; i < cr.length; i++) {
          const cx = cr[i][0] + cr[i][2] / 2, cy = cr[i][1] + cr[i][3] / 2, dd = Math.hypot(cx - h.x, cy - h.y);
          if (dd < best) { best = dd; x = cx; y = cy; }
        }
      }
      if (isNaN(x)) { x = h.x + d[0] * 11; y = h.y + d[1] * 11; }
      if (!allowed()) return;
      for (let k = 0; k < n(6); k++) {
        emit(2, k % 2 ? 2 : 1, x + (R() - 0.5) * 30, y + (R() - 0.5) * 8, (R() - 0.5) * 50, (R() - 0.5) * 30, 0.7, 6 + R() * 3, 4, 0.8, { prio: true, ax: d[0] * 360, ay: d[1] * 360, rot: R() * TAU, vr: (R() - 0.5) * 12 });
      }
      for (let k = 0; k < n(4); k++) emit(0, k % 2 ? 1 : 2, x + (R() - 0.5) * 30, y, (R() - 0.5) * 40, (R() - 0.5) * 40, 0.5, 4, 1, 0.8, { prio: true, drag: 1.5 });
    },
    slam: function (o) {
      const x = fin(o && o.x, V.hero.x), y = fin(o && o.y, V.hero.y), nx = fin(o && o.nx, 0), ny = fin(o && o.ny, 1);
      if (!V.reduced && V.level < 2) { V.shakeAmp = (V.level === 0 ? 5 : 2) * V.shakeScale; V.shakeT = 0; }
      V.busyT = 0.4;
      if (V.level !== 0) return;
      for (let k = 0; k < 10; k++) {
        const a = Math.atan2(ny, nx) + (k / 9 - 0.5) * 2.4, sp = 50 + R() * 60;
        emit(1, 3, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + R() * 0.2, 4, 12, 0.4, { prio: true, drag: 2.5 });
      }
    },
    death: function (o) {
      const h = V.hero, x = fin(o && o.x, h.x), y = fin(o && o.y, h.y);
      V.vanish = -1;
      if (!allowed()) return;
      burstStars(x, y, n(10), 70, 190, 0.6, [0, 0, 2]);
      if (V.flash.try(V.t)) PL.Light.desaturate(0.4);
    },
    win: function (o) {
      const h = V.hero, x = fin(o && o.x, h.x), y = fin(o && o.y, h.y);
      V.vanish = 0; V.vanishFrom = { x: h.x, y: h.y };
      V.celT = 1.5;
      if (!allowed()) return;
      burstStars(x, y, n(24), 80, 240, 1.2, [0, 1, 2, 0]);
      if (!V.reduced && V.flash.try(V.t)) PL.Light.celebrate();
    },
    ride: function () { /* gate ride: sparkles handled by trail; nothing extra */ }
  };

  const V_API = (PL.Vfx = {});
  V_API.Governor = Governor; V_API.FlashLimiter = FlashLimiter;

  V_API.init = function (w, h, dpr, opts) {
    opts = opts || {};
    V.W = Math.max(1, fin(w, 360)); V.H = Math.max(1, fin(h, 640));
    V.dpr = clamp(fin(dpr, 1), 1, 2);
    V.seed = (opts.seed == null ? 1 : opts.seed) >>> 0 || 1;
    V.rng = PL.vfxRand(V.seed);
    V.t = 0; V.alive.fill(0); V.count = 0; V.trailCount = 0; V.peak = 0; V.dropped = 0;
    V.gov = new Governor(opts.governor); V.flash = new FlashLimiter(MAXRATE_FLASH);
    V.level = 0; V.auto = true; V.forced = null; V.shake = 0; V.shakeT = 1; V.shakeAmp = 0; V.flipT = 9; V.landT = 9;
    V.wipeKind = 'idle'; V.vanish = -1; V.hero.has = false;
    V.blinkT = 3; V.blink = 0; V.bobT = 0; V.antic = 0; V.trailAcc = 0; V.suckAcc = 0; V.celT = 0; V.shx = 0; V.shy = 0; V.busyT = 0; V.prevO = []; V.hero.vx = 0; V.hero.vy = 0; V.frame = 0;
    if (typeof matchMedia === 'function') { try { V.reduced = !!matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ } }
    if (!V.sprites) bakeSprites();
    if (PL.Light) { PL.Light.init(V.W, V.H, V.dpr, { seed: V.seed, dome: opts.dome }); PL.Light.setReduced(V.reduced); PL.Light.setQuality('full'); }
    V.inited = true;
  };
  V_API.resize = function (w, h, dpr) {
    if (!V.inited) return V_API.init(w, h, dpr);
    V.W = Math.max(1, fin(w, V.W)); V.H = Math.max(1, fin(h, V.H)); V.dpr = clamp(fin(dpr, V.dpr), 1, 2);
    if (PL.Light) PL.Light.resize(V.W, V.H, V.dpr);
  };
  // dpr cap for the skin's canvas backing store: 2 in full, 1.5 in lite/off
  V_API.dprFor = function (deviceDpr) { return Math.min(fin(deviceDpr, 1), V.level === 0 ? 2 : 1.5); };
  V_API.setQuality = function (q) {
    if (q === 'auto') { V.auto = true; V.forced = null; return; }
    const i = LEVELS.indexOf(q);
    if (i < 0) return;
    V.auto = false; V.forced = q; setLevel(i);
  };
  function setLevel(i) {
    V.level = clamp(i | 0, 0, 2);
    if (PL.Light) PL.Light.setQuality(LEVELS[V.level]);
    const c = cap();
    if (V.count > c) trim(c);
  }
  function trim(c) { // drop oldest-life particles until count <= c
    while (V.count > c) {
      let best = -1, bl = 1e9;
      for (let i = 0; i < MAXP; i++) if (V.alive[i] && V.life[i] < bl) { bl = V.life[i]; best = i; }
      if (best < 0) break; free(best);
    }
  }
  V_API.setReduced = function (b) {
    V.reduced = !!b;
    if (PL.Light) PL.Light.setReduced(V.reduced);
    if (V.reduced) { V.shake = 0; V.shakeAmp = 0; V.shx = 0; V.shy = 0; trim(cap()); }
  };
  V_API.setShakeScale = function (k) { V.shakeScale = clamp(fin(k, 1), 0, 1); };
  V_API.setBackdrop = function (far, near) { if (PL.Light) PL.Light.setBackdrop(far, near); };
  V_API.setHazards = function (r) { if (PL.Light) PL.Light.setHazards(r); };
  V_API.setRoom = function (room) {
    V.room = room || null; V.tips = []; V.prevO = []; V.exit = room && room.exit ? room.exit : null;
    if (PL.Light) PL.Light.setRoom(room);
    V.alive.fill(0); V.count = 0; V.trailCount = 0; V.hero.has = false;
    if (!room) return;
    (room.spikes || []).forEach(function (s, idx) {
      const r = s.r, dir = PL.Light ? PL.Light.spikeDir(room, r) : 0, horiz = dir === 0 || dir === 2;
      const len = horiz ? r[2] : r[3], hgt = Math.min(horiz ? r[3] : r[2], len), cnt = Math.max(1, Math.round(len / 12)), step = len / cnt, tips = [];
      for (let k = 0; k < cnt; k++) {
        const am = (k + 0.5) * step;
        if (dir === 0) tips.push([r[0] + am, r[1] + r[3] - hgt]);
        else if (dir === 2) tips.push([r[0] + am, r[1] + hgt]);
        else if (dir === 1) tips.push([r[0] + hgt, r[1] + am]);
        else tips.push([r[0] + r[2] - hgt, r[1] + am]);
      }
      V.tips.push({ tips: tips, off: idx * 0.9 });
    });
  };
  V_API.fire = function (name, o) { const f = FX[name]; if (f && V.inited) f(o); };
  V_API.wipe = function (kind, cb) {
    if (kind !== 'close' && kind !== 'open') return;
    V.wipeKind = kind === 'close' ? 'closing' : 'opening'; V.wipeT = 0; V.wipeCb = typeof cb === 'function' ? cb : null;
    V.wipeFade = V.reduced || V.level > 0;
    V.wipeDur = V.wipeFade ? 0.15 : 0.32;
  };
  V_API.wipeState = function () { return V.wipeKind === 'closing' ? 'closing' : V.wipeKind === 'opening' ? 'opening' : V.wipeKind === 'closed' ? 'closed' : 'idle'; };

  // ---------- update ----------
  V_API.update = function (dt, events, hero, g) {
    if (!V.inited) return;
    dt = fin(dt, 0);
    if (!(dt > 0)) return;
    const t0 = now(), raw = dt;
    dt = Math.min(dt, 0.05);
    V.t += dt; V.frame++;
    if (V.busyT > 0) V.busyT -= dt;
    // governor on real frame time
    if (V.auto) {
      const st = V.gov.push(raw * 1000, V.busyT > 0 || V.wipeKind === 'closing' || V.wipeKind === 'opening');
      if (st !== 0) setLevel(V.level + st);
    }
    const h = V.hero;
    if (hero && isFinite(hero.x) && isFinite(hero.y)) {
      if (h.has) {
        let vx = (hero.x - h.x) / dt, vy = (hero.y - h.y) / dt;
        if (Math.hypot(hero.x - h.x, hero.y - h.y) > 160) { vx = 0; vy = 0; }
        const k = Math.min(1, dt / 0.08);
        h.vx += (vx - h.vx) * k; h.vy += (vy - h.vy) * k;
      }
      h.x = hero.x; h.y = hero.y; h.has = true; h.dead = hero.dead > 0;
      h.grounded = hero.grounded !== false; h.t = fin(hero.t, h.t);
    }
    if (g != null && g >= 0 && g <= 3) h.g = g | 0;
    else if (hero && hero.g != null) h.g = hero.g | 0;
    if (PL.Light) PL.Light.update(raw, events, hero, h.g);
    // events (strings or {type,x,y})
    if (events && events.length) {
      for (let i = 0; i < events.length; i++) {
        const e = events[i], name = typeof e === 'string' ? e : e && e.type;
        if (FX[name]) FX[name](typeof e === 'object' ? e : null);
      }
    }
    if (hero && hero.t != null) { if (!V.reduced) slamScan(h); dynHazards(h); }
    spawnAmbient(dt, h);
    stepParticles(dt, h);
    stepAnim(dt, h);
    V.costMs += ((now() - t0) - V.costMs) * 0.1;
  };

  // moving crusher boxes follow the block (hero.t is the game tick, 120 Hz, same formula as draw.js)
  const dynBuf = [];
  function dynHazards(h) {
    const cs = V.room && V.room.crushers;
    if (!cs || !cs.length || !PL.Light) return;
    const tsec = h.t / 120; dynBuf.length = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], o = Math.sin(TAU * tsec / 2.4 + (c.phase || 0)) * (c.amp || 0), r = c.r;
      dynBuf.push([r[0] + (c.ax ? o : 0), r[1] + (c.ay ? o : 0), r[2], r[3]]);
    }
    PL.Light.setDynamicHazards(dynBuf);
  }
  function slamScan(h) {
    const cs = V.room && V.room.crushers;
    if (!cs) return;
    const tsec = h.t / 120;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], amp = c.amp || 0;
      if (amp <= 0) continue;
      const o = Math.sin(TAU * tsec / 2.4 + (c.phase || 0)) * amp, a = Math.abs(o) / amp, prev = V.prevO[i] == null ? 0 : V.prevO[i];
      V.prevO[i] = a;
      if (a >= 0.985 && prev < 0.985) {
        const r = c.r, bx = r[0] + (c.ax ? o : 0), by = r[1] + (c.ay ? o : 0), sg = o >= 0 ? 1 : -1;
        const px = c.ax ? bx + (sg > 0 ? r[2] : 0) : bx + r[2] / 2, py = c.ay ? by + (sg > 0 ? r[3] : 0) : by + r[3] / 2;
        const near = Math.hypot(px - h.x, py - h.y) < 260;
        const sv = V.shakeAmp; if (!near) V.shakeAmp = 0;
        FX.slam({ x: px, y: py, nx: c.ax ? sg : 0, ny: c.ay ? sg : 0 });
        if (!near) V.shakeAmp = sv;
      }
    }
  }

  function spawnAmbient(dt, h) {
    if (!allowed() || !h.has || h.dead) { V.trailAcc = 0; return; }
    const d = DIRS[h.g] || DIRS[2], sp = Math.hypot(h.vx, h.vy);
    // hero teal flame trail: streams opposite to motion; idle flame rises opposite gravity
    const full = V.level === 0 && !V.reduced;
    const rate = (full ? 90 : V.level === 0 ? 20 : 30) * (sp > 40 ? clamp(sp / 160, 0.3, 1) : 0.16);
    V.trailRate = rate;
    V.trailAcc += rate * dt;
    const life = V.reduced ? 0.22 : 0.45;
    while (V.trailAcc >= 1) {
      V.trailAcc -= 1;
      const inv = sp > 1 ? 1 / sp : 0;
      const bx = -h.vx * inv, by = -h.vy * inv; // opposite motion
      const mv = clamp(sp / 200, 0, 1);
      const ux = -d[0] * (1 - mv) + bx * mv, uy = -d[1] * (1 - mv) + by * mv;
      // origin: the tail (opposite gravity side of the hero) so the flame reads as the tail flame
      const ox = h.x - d[0] * 10 + (R() - 0.5) * 5, oy = h.y - d[1] * 10 + (R() - 0.5) * 5;
      const v = 30 + R() * 40;
      emit(0, R() < 0.25 ? 2 : 1, ox, oy, ux * v + (R() - 0.5) * 24, uy * v + (R() - 0.5) * 24, life * (0.7 + R() * 0.4), 7 + R() * 3, 1, 0.75, { trail: true, drag: 1.2 });
    }
    // portal suction
    const ex = V.exit;
    if (ex && !V.reduced && V.level === 0 && Math.hypot(h.x - ex.x, h.y - ex.y) < 80) {
      V.suckAcc += 36 * dt;
      while (V.suckAcc >= 1) {
        V.suckAcc -= 1;
        const a = R() * TAU, rr = 40 + R() * 36;
        emit(3, R() < 0.5 ? 0 : 2, ex.x + Math.cos(a) * rr, ex.y + Math.sin(a) * rr, -Math.cos(a) * rr * 2.2, -Math.sin(a) * rr * 2.2, 0.45, 5, 1, 0.8, { rot: R() * TAU, vr: 6 });
      }
    }
  }

  function stepParticles(dt) {
    for (let i = 0; i < MAXP; i++) {
      if (!V.alive[i]) continue;
      V.life[i] -= dt;
      if (!(V.life[i] > 0)) { free(i); continue; }
      const dr = Math.exp(-V.drag[i] * dt);
      V.vx[i] = (V.vx[i] + V.ax[i] * dt) * dr; V.vy[i] = (V.vy[i] + V.ay[i] * dt) * dr;
      V.x[i] += V.vx[i] * dt; V.y[i] += V.vy[i] * dt; V.rot[i] += V.vr[i] * dt;
    }
  }

  function stepAnim(dt, h) {
    // camera feel
    if (V.shakeT < 1) {
      V.shakeT += dt / 0.16;
      const k = Math.pow(1 - clamp(V.shakeT, 0, 1), 2);
      V.shx = (R() * 2 - 1) * V.shakeAmp * k; V.shy = (R() * 2 - 1) * V.shakeAmp * k;
      if (V.shakeT >= 1) { V.shx = 0; V.shy = 0; }
    }
    if (V.reduced || V.level > 0) { V.shx = 0; V.shy = 0; if (V.level > 1) V.shakeT = 1; }
    V.flipT += dt; V.landT += dt;
    if (V.antic > 0) V.antic = Math.max(0, V.antic - dt);
    // hero idle
    V.bobT += dt;
    V.blinkT -= dt;
    if (V.blinkT <= 0) { V.blink = 0.12; V.blinkT = 3 + R() * 2; }
    if (V.blink > 0) V.blink -= dt;
    if (V.vanish >= 0 && V.vanish < 1) V.vanish = Math.min(1, V.vanish + dt / (V.reduced ? 0.2 : 0.45));
    if (V.celT > 0) V.celT -= dt;
    // wipe
    if (V.wipeKind === 'closing' || V.wipeKind === 'opening') {
      V.wipeT += dt / V.wipeDur;
      if (V.wipeT >= 1) {
        const closing = V.wipeKind === 'closing';
        V.wipeKind = closing ? 'closed' : 'idle'; V.wipeT = 1;
        const cb = V.wipeCb; V.wipeCb = null;
        if (cb) { try { cb(); } catch (e) { /* never break the loop */ } }
      }
    }
  }

  // camera feel for the skin: shake px, tilt radians (signed toward new down; 0 for up/down), zoom factor
  V_API.cameraFx = function () {
    if (V.reduced || V.level > 0 && V.level !== 1) return { shx: 0, shy: 0, tilt: 0, zoom: 1 };
    const out = { shx: V.shx, shy: V.shy, tilt: 0, zoom: 1 };
    if (V.level === 0 && V.flipT < 0.26) {
      const p = V.flipT / 0.26, ramp = Math.min(1, V.flipT / 0.04), k = Math.pow(1 - eo(p), 1) * ramp;
      const sgn = V.flipDir === 1 ? 1 : V.flipDir === 3 ? -1 : 0;
      out.tilt = V.tiltAmp * sgn * k; out.zoom = 1 + V.zoomAmp * k;
    }
    return out;
  };

  // hero squash/stretch, bob and blink. Apply as: translate(hero screen xy + bobX,bobY); rotate(ang);
  // scale(sx, sy); rotate(-ang); draw upright. vanish 0..1 (win spiral) and dx,dy (world px toward the exit).
  V_API.heroDeform = function () {
    const h = V.hero, sp = Math.hypot(h.vx, h.vy), d = DIRS[h.g] || DIRS[2];
    let sx = 1, sy = 1, ang = sp > 1 ? Math.atan2(h.vy, h.vx) : Math.atan2(d[1], d[0]);
    if (V.level === 2) return { sx: 1, sy: 1, ang: ang, bobX: 0, bobY: 0, blink: false, vanish: 0, dx: 0, dy: 0, alpha: 1 };
    if (V.antic > 0) { // anticipation: squash along old down (visual only)
      const k = V.level === 0 ? 0.12 : 0.06, p = 1 - V.antic / 0.06;
      ang = Math.atan2(d[1], d[0]); sx = 1 - k * ei(p); sy = 1 + k * 0.6 * ei(p);
    } else if (V.landT < 0.14) {
      const k = V.level === 0 ? 0.15 : 0.08, p = V.landT / 0.14, a = k * (1 - eb(p) + 1) * (1 - p);
      ang = Math.atan2(d[1], d[0]); sx = 1 - a; sy = 1 + a * 0.7;
    } else if (sp > 30) {
      const s = clamp(sp / 420, 0, 1) * 0.18; sx = 1 + s; sy = 1 - s * 0.55;
    }
    const idle = h.grounded && sp < 20 && V.landT > 0.2;
    const bob = idle && !V.reduced ? Math.sin(V.bobT / 1.6 * TAU) * 2 : 0;
    let vanish = 0, dx = 0, dy = 0, alpha = 1;
    if (V.vanish >= 0 && V.exit) {
      const p = V.vanish; vanish = p;
      if (V.reduced) alpha = 1 - p;
      else {
        const e = ei(p), s = 1 - e; sx *= s; sy *= s;
        const a = p * TAU * 1.2, rr = (1 - e) * 10;
        dx = (V.exit.x - V.vanishFrom.x) * e + Math.cos(a) * rr; dy = (V.exit.y - V.vanishFrom.y) * e + Math.sin(a) * rr;
      }
    }
    return { sx: Math.max(0, sx), sy: Math.max(0, sy), ang: ang, bobX: -d[0] * bob, bobY: -d[1] * bob, blink: V.blink > 0, vanish: vanish, dx: dx, dy: dy, alpha: alpha };
  };

  // ---------- drawing ----------
  function frame(cam) {
    return { sc: (cam && cam.scale) || 1, cx: fin(cam && cam.cx, 168), cy: fin(cam && cam.cy, 250), W: (cam && cam.W) || V.W, H: (cam && cam.H) || V.H };
  }
  V_API.drawBack = function (ctx, cam) { if (V.inited && PL.Light) PL.Light.drawBack(ctx, cam); };

  function star(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = rot + k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r;
      if (k) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function spark4(ctx, x, y, r) {
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.closePath();
  }

  // particles: called by Light.drawFront inside the hazard clip. bloomPass draws only glowing kinds.
  function drawParticles(ctx, f, bloomPass) {
    if (!V.count) return;
    const sc = f.sc, sp = V.sprites;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 0 && bloomPass) continue;
      ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
      for (let i = 0; i < MAXP; i++) {
        if (!V.alive[i]) continue;
        const k = V.kind[i], isNormal = k === 1 || k === 2;
        if ((pass === 0) !== isNormal) continue;
        const p = 1 - V.life[i] / V.max[i], x = (V.x[i] - f.cx) * sc + f.W / 2, y = (V.y[i] - f.cy) * sc + f.H / 2;
        if (x < -30 || x > f.W + 30 || y < -30 || y > f.H + 30) continue;
        const size = (V.s0[i] + (V.s1[i] - V.s0[i]) * p) * sc, a = V.al[i] * (k === 1 ? Math.sin(Math.PI * Math.min(1, p * 1.2 + 0.0)) * 1 : 1 - p * p);
        if (a <= 0.01) continue;
        ctx.globalAlpha = Math.min(0.8, a);
        if (k === 0) ctx.drawImage(sp.glow[V.col[i]], x - size, y - size, size * 2, size * 2);
        else if (k === 1) ctx.drawImage(sp.dust, x - size, y - size, size * 2, size * 2);
        else if (k === 2) {
          const c = Math.cos(V.rot[i]) * size, s = Math.sin(V.rot[i]) * size;
          ctx.fillStyle = V.col[i] === 2 ? '#f4efe0' : '#cfe9ff';
          ctx.beginPath(); ctx.moveTo(x + c, y + s); ctx.lineTo(x - s * 0.6, y + c * 0.6); ctx.lineTo(x - c, y - s); ctx.lineTo(x + s * 0.5, y - c * 0.5); ctx.closePath(); ctx.fill();
        } else if (k === 3) {
          const c = COL[V.col[i]];
          ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
          star(ctx, x, y, size * 0.6 + 1.5, V.rot[i]); ctx.fill();
        } else {
          const c = COL[V.col[i]];
          ctx.strokeStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; ctx.lineWidth = Math.max(1.5, 2 * sc);
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - V.vx[i] * 0.07 * sc * (size / 14), y - V.vy[i] * 0.07 * sc * (size / 14)); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawGates(ctx, f) {
    const gs = V.room && V.room.gates;
    if (!gs || !gs.length) return;
    const t = V.reduced ? 0 : V.t, sc = f.sc, full = V.level === 0;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i], r = g.r, d = DIRS[g.dir | 0] || DIRS[0];
      const x = (r[0] - f.cx) * sc + f.W / 2, y = (r[1] - f.cy) * sc + f.H / 2, w = r[2] * sc, h = r[3] * sc;
      if (x > f.W || x + w < 0 || y > f.H || y + h < 0) continue;
      const horiz = r[2] >= r[3];
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      // scrolling teal-white wave ribbons along the flow direction
      const along = horiz ? w : h, across = horiz ? h : w, dirSign = horiz ? d[0] || 1 : d[1] || 1;
      ctx.lineWidth = Math.max(1.5, 2 * sc); ctx.strokeStyle = '#9ff5e6';
      const lines = full ? 3 : 2;
      for (let l = 0; l < lines; l++) {
        ctx.globalAlpha = 0.45 - l * 0.1; ctx.beginPath();
        for (let s = 0; s <= 16; s++) {
          const u = s / 16, wv = Math.sin((u * 2.2 - dirSign * t * 0.8 + l * 0.33) * TAU) * across * 0.22 + (l - (lines - 1) / 2) * across * 0.25;
          const px = horiz ? x + u * along : x + across / 2 + wv, py = horiz ? y + across / 2 + wv : y + u * along;
          if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
      // chevrons slide in flow direction (still slide in lite)
      const tt = (V.t * 0.5) % 1, cnt = Math.max(2, Math.round(along / (26 * sc)));
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#e8fffa'; ctx.lineWidth = Math.max(1.5, 2.2 * sc);
      for (let k = 0; k < cnt; k++) {
        let u = ((k + tt) / cnt); if (dirSign < 0) u = 1 - u;
        const a = 5 * sc, cxp = horiz ? x + u * along : x + across / 2, cyp = horiz ? y + across / 2 : y + u * along;
        const edge = Math.sin(Math.PI * clamp(u, 0, 1)); ctx.globalAlpha = 0.55 * edge;
        ctx.beginPath();
        if (horiz) { const sg = dirSign; ctx.moveTo(cxp - sg * a, cyp - a); ctx.lineTo(cxp + sg * a * 0.6, cyp); ctx.lineTo(cxp - sg * a, cyp + a); }
        else { const sg = dirSign; ctx.moveTo(cxp - a, cyp - sg * a); ctx.lineTo(cxp, cyp + sg * a * 0.6); ctx.lineTo(cxp + a, cyp - sg * a); }
        ctx.stroke();
      }
      ctx.restore();
      // edge orbs pulse softly (alpha only)
      if (V.sprites) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.7 + 0.3 * Math.sin(V.t / 0.8 * TAU), oz = Math.max(18, Math.min(across * 1.4, 34 * sc));
        ctx.globalAlpha = 0.45 * pulse;
        const e1 = horiz ? [x, y + h / 2] : [x + w / 2, y], e2 = horiz ? [x + w, y + h / 2] : [x + w / 2, y + h];
        ctx.drawImage(V.sprites.glow[1], e1[0] - oz / 2, e1[1] - oz / 2, oz, oz);
        ctx.drawImage(V.sprites.glow[1], e2[0] - oz / 2, e2[1] - oz / 2, oz, oz);
        ctx.restore();
      }
    }
  }

  function drawSpikeGlint(ctx, f) {
    if (V.level !== 0 || V.reduced || !V.tips.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff6ea';
    for (let c = 0; c < V.tips.length; c++) {
      const cl = V.tips[c], ph = ((V.t + cl.off) % 3.5) / 0.45;
      if (ph >= 1) continue;
      const cnt = cl.tips.length, fi = ph * cnt, k = Math.min(cnt - 1, Math.floor(fi)), fr = fi - k;
      const tp = cl.tips[k], x = (tp[0] - f.cx) * f.sc + f.W / 2, y = (tp[1] - f.cy) * f.sc + f.H / 2;
      ctx.globalAlpha = 0.9 * Math.sin(Math.PI * fr);
      spark4(ctx, x, y, 5.5 * f.sc);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPortal(ctx, f) {
    const ex = V.exit;
    if (!ex || V.level > 1) return;
    const x = (ex.x - f.cx) * f.sc + f.W / 2, y = (ex.y - f.cy) * f.sc + f.H / 2, sc = f.sc;
    if (x < -60 || x > f.W + 60 || y < -60 || y > f.H + 60) return;
    const t = V.reduced ? 0 : V.t, br = 0.5 + 0.5 * Math.sin(t / 2 * TAU);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // breathing crescent glow
    const hz = (54 + 10 * br) * sc;
    ctx.globalAlpha = 0.32 + 0.2 * br + (V.celT > 0 ? 0.15 : 0);
    ctx.drawImage(V.sprites.glow[2], x - hz, y - hz, hz * 2, hz * 2);
    if (V.level === 0) {
      // two counter-rotating brass ring ticks (6 and -4 deg/s)
      ctx.fillStyle = '#e8bd5a';
      for (let ring = 0; ring < 2; ring++) {
        const rr = (ring ? 16 : 22) * sc * 1.0 + (ring ? 0 : 3 * sc), rot = (ring ? -4 : 6) * Math.PI / 180 * t, nn = ring ? 8 : 12;
        ctx.globalAlpha = 0.6;
        for (let k = 0; k < nn; k++) { const a = rot + k / nn * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.4 * sc, 0, TAU); ctx.fill(); }
      }
      // twinkling stars in the portal
      for (let k = 0; k < 5; k++) {
        const a = k * 1.9 + 0.4, rr = (6 + (k * 5) % 11) * sc, tw = 0.5 + 0.5 * Math.sin(t * 2.2 + k * 1.7);
        ctx.globalAlpha = 0.25 + 0.6 * tw; ctx.fillStyle = '#f4efe0';
        ctx.fillRect(x + Math.cos(a) * rr - 0.75, y + Math.sin(a) * rr - 0.75, 1.8, 1.8);
      }
    }
    ctx.restore();
  }

  V_API.drawFront = function (ctx, cam) {
    if (!V.inited || !ctx) return;
    const t0 = now(), f = frame(cam);
    if (V.level < 2) { ctx.save(); drawGates(ctx, f); drawSpikeGlint(ctx, f); drawPortal(ctx, f); ctx.restore(); }
    if (PL.Light) PL.Light.drawFront(ctx, cam, V.level < 2 ? drawParticles : null);
    V.costMs += ((now() - t0) - V.costMs) * 0.05;
  };

  // star-iris wipe (full) or short fade (lite/off/reduced). Draw above HUD.
  V_API.drawOverlay = function (ctx, cam) {
    if (!V.inited || !ctx || V.wipeKind === 'idle') return;
    const W = V.W, H = V.H, closing = V.wipeKind === 'closing' || V.wipeKind === 'closed', p = clamp(V.wipeT, 0, 1);
    ctx.save();
    ctx.fillStyle = '#151a3d';
    if (V.wipeFade) {
      const a = V.wipeKind === 'closed' ? 1 : closing ? p : 1 - p;
      ctx.globalAlpha = clamp(a, 0, 1); ctx.fillRect(0, 0, W, H);
    } else {
      const f = frame(cam), hx = clamp((V.hero.x - f.cx) * f.sc + W / 2, 0, W), hy = clamp((V.hero.y - f.cy) * f.sc + H / 2, 0, H);
      const rmax = Math.hypot(Math.max(hx, W - hx), Math.max(hy, H - hy)) * 1.15;
      const e = V.wipeKind === 'closed' ? 1 : closing ? ei(p) : eo(p);
      const r = closing ? rmax * (1 - e) : rmax * e;
      if (r < 2) ctx.fillRect(0, 0, W, H);
      else {
        ctx.beginPath(); ctx.rect(-2, -2, W + 4, H + 4);
        const rot = (closing ? p : 1 - p) * 1.2;
        for (let k = 0; k < 10; k++) {
          const a = rot + k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.55 : r;
          if (k) ctx.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr); else ctx.moveTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill('evenodd');
      }
    }
    ctx.restore();
  };

  V_API.stats = function () {
    const ls = PL.Light ? PL.Light.stats() : {};
    return {
      quality: LEVELS[V.level], auto: V.auto, reduced: V.reduced, particles: V.count, cap: cap(), peak: V.peak, dropped: V.dropped,
      trail: V.trailCount, avgMs: V.gov.avg(), p95Ms: V.gov.p95(), vfxUpdateMs: V.costMs, lightDrawMs: ls.costMs || 0,
      shake: Math.hypot(V.shx, V.shy), flashesLastSec: V.flash.count(V.t), wipe: V.wipeKind, backdrop: ls.backdrop, dpr: V.dpr, dprCap: V_API.dprFor(V.dpr),
      motes: ls.motes || 0, trailRate: V.trailRate
    };
  };
  V_API._V = V; // test hook
})();
