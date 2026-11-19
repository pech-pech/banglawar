// Wellhand deterministic simulation. No DOM. Adds to global WH.
(function () {
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  var WH = root.WH = root.WH || {};

  // ---- Params ----
  WH.DEF = {
    S0: 0.9e7, Smax: 3.1e7, ramp: 1.0, e: 30, R: 150,
    heatBase: 5, heatRate: 22, cool: 18, ignite: 6, retapLock: 0.25,
    stallT: 2.0, resumeHeat: 40, drag: 0.2, cruiseFloor: 35, vcap: 520, capSpeed: 220, capR: 30,
    blastR: 140, strongFrac: 0.6, tapMax: 0.12, healWaves: 5, offset: null, noSpawn: false
  };

  WH.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  WH.hashSeed = function (str) {
    str = String(str); var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  function fnv(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  var DT = 1 / 120, PATTERNS = ['crossing', 'converging', 'pincer'];

  function Sim(seed, W, H, po) {
    var P = {}, k;
    for (k in WH.DEF) P[k] = WH.DEF[k];
    if (po) for (k in po) P[k] = po[k];
    this.P = P; this.seed = seed; this.W = W; this.H = H;
    // ---- Layout ----
    this.topbar = H < 700 ? 56 : 64;
    this.offset = (P.offset == null) ? clamp(0.11 * H, 80, 100) : P.offset; // admin default: auto offset
    this.core = { x: W / 2, y: 0.52 * H, r: 36 };
    this.cols = [0.2, 0.5, 0.8].map(function (f) { return { x: W * f, y: 0.24 * H, r: 30 }; });
    this.bodies = [];
    this.well = { open: false, x: 0, y: 0, S: 0, held: 0, tapLeft: 0 };
    this.ptr = { down: false, x: 0, y: 0, t: 0 };
    this._sx = 0; this._sy = 0; this._moved = 0; this._pressOpened = false;
    this.heat = 0; this.stall = 0; this.lockLeft = 0;
    this.integrity = 5; this.score = 0; this.streak = 0; this.mult = 1;
    this.wave = 0; this.phase = 'spawn'; this.pattern = PATTERNS[0];
    this.spawnLeft = 0; this._spawnT = 0; this._spawnIdx = 0; this._gapT = 0;
    this._badShare = 0; this._gap = 1; this._cleanStreak = 0; this._waveStalled = false; this._waveMaxHeat = 0;
    this.time = 0; this.n = 0; this.over = false; this.ev = [];
    this._rng = WH.mulberry32(WH.hashSeed(seed));
    this.stats = { captures: 0, clashes: 0, merges: 0, stalls: 0, escapes: 0, lost: 0, hits: 0, blasts: 0,
      maxHeat: 0, coldWaves: 0, cleanWaves: 0, peakStreak: 0, holdHist: [0, 0, 0, 0, 0] };
    if (!P.noSpawn) { this._startWave(1); this._spawnT = 1.0; }
  }
  var SP = Sim.prototype;

  SP._startWave = function (k) {
    this.wave = k; this.phase = 'spawn'; this.pattern = PATTERNS[(k - 1) % 3];
    this.spawnLeft = Math.min(30, 8 + k); this._spawnIdx = 0;
    this._gap = Math.max(0.7, 2.0 - 0.07 * k);
    this._badShare = Math.min(0.55, 0.25 + 0.02 * k);
    this._spawnT = 0; this._waveStalled = false; this._waveMaxHeat = this.heat;
    this.ev.push({ k: 'wave', x: this.W / 2, y: this.H / 2, kind: this.pattern });
  };

  SP.addBody = function (o) {
    var good = !!o.good, merged = !!o.merged, b;
    if (merged) b = { m: 2, r: 16, val: 40 };
    else if (good) b = { m: 1, r: 12, val: 10 };
    else b = { m: 1.4, r: 14, val: 0 };
    b.x = o.x; b.y = o.y; b.vx = o.vx || 0; b.vy = o.vy || 0; b.good = good; b.merged = merged; b.trail = []; b.dead = false;
    this.bodies.push(b); return b;
  };

  SP._spawn = function () {
    var rng = this._rng, W = this.W, H = this.H, core = this.core, col = this.cols[0];
    var spd = Math.min(140, 50 + 6 * this.wave), pat = this.pattern, i = this._spawnIdx++;
    var bad = rng() < this._badShare, x, y, vx, vy, side, a, A25 = 25 * Math.PI / 180, A10 = 10 * Math.PI / 180;
    if (pat === 'converging') {
      x = (0.1 + 0.8 * rng()) * W; y = this.topbar + 4;
      if (bad) { a = Math.atan2(core.y - y, core.x - x) + (rng() * 2 - 1) * A25; vx = Math.cos(a) * spd; vy = Math.sin(a) * spd; }
      else {
        var tx = rng() * W, ty = 0.88 * H;
        a = Math.atan2(ty - y, tx - x) + (rng() * 2 - 1) * A10; vx = Math.cos(a) * 0.8 * spd; vy = Math.sin(a) * 0.8 * spd;
      }
    } else {
      side = (pat === 'pincer') ? (i % 2 === 0 ? 0 : 1) : (rng() < 0.5 ? 0 : 1); // 0=left
      x = side === 0 ? -12 : W + 12;
      if (bad) {
        y = this.topbar + 20 + rng() * Math.max(0, core.y - 120 - (this.topbar + 20));
        a = Math.atan2(core.y - y, core.x - x) + (rng() * 2 - 1) * A25; vx = Math.cos(a) * spd; vy = Math.sin(a) * spd;
      } else {
        y = col.y - 70 + rng() * 240;
        vx = side === 0 ? spd : -spd; vy = (rng() * 2 - 1) * 15;
      }
    }
    this.addBody({ x: x, y: y, vx: vx, vy: vy, good: !bad });
  };

  SP._hit = function (x, y, kind) {
    this.integrity = Math.max(0, this.integrity - 1); this.stats.blasts++;
    this.ev.push({ k: 'blast', x: x, y: y, kind: kind });
    if (this.integrity <= 0 && !this.over) {
      this.integrity = 0; this.over = true; this.ev.push({ k: 'over', x: this.core.x, y: this.core.y });
    }
  };

  SP._openWell = function () {
    var w = this.well, p = this.ptr;
    w.open = true; w.held = 0; w.tapLeft = 0; w.x = p.x; w.y = Math.max(this.topbar + 24, p.y - this.offset);
    this.heat += this.P.ignite; this._pressOpened = true;
    this.ev.push({ k: 'open', x: w.x, y: w.y });
  };
  SP._closeWell = function () {
    var w = this.well; if (!w.open) return;
    w.open = false; w.S = 0; w.held = 0; w.tapLeft = 0;
    this.ev.push({ k: 'close', x: w.x, y: w.y });
  };

  SP.step = function (events) {
    if (this.over) return;
    var P = this.P, w = this.well, p = this.ptr, st = this.stats, i, j, b, ev;
    // pointer events
    if (events) for (i = 0; i < events.length; i++) {
      ev = events[i]; var t = ev[0];
      if (t === 'd') {
        if (p.down) continue; // only one pointer
        p.down = true; p.x = ev[1]; p.y = ev[2]; p.t = 0; this._sx = p.x; this._sy = p.y; this._moved = 0; this._pressOpened = false;
      } else if (t === 'm') {
        if (!p.down) continue;
        p.x = ev[1]; p.y = ev[2];
        var md = Math.hypot(p.x - this._sx, p.y - this._sy); if (md > this._moved) this._moved = md;
        if (w.open && w.tapLeft <= 0) { w.x = p.x; w.y = Math.max(this.topbar + 24, p.y - this.offset); }
      } else if (t === 'u') {
        if (!p.down) continue;
        if (ev[1] != null) { p.x = ev[1]; p.y = ev[2]; }
        var h = p.t, hb = h < 0.12 ? 0 : h < 0.4 ? 1 : h < 1 ? 2 : h < 2 ? 3 : 4; st.holdHist[hb]++;
        p.down = false;
        if (w.open && w.tapLeft <= 0) {
          if (h < P.tapMax && this._moved < 10 && this._pressOpened) w.tapLeft = Math.max(DT, P.tapMax - h);
          else this._closeWell();
        }
      }
    }
    if (p.down) p.t += DT;
    // timers
    if (this.lockLeft > 0) this.lockLeft = Math.max(0, this.lockLeft - DT);
    if (w.open && w.tapLeft > 0) {
      w.tapLeft -= DT;
      if (w.tapLeft <= 1e-9) { this._closeWell(); this.lockLeft = P.retapLock; }
    }
    var justResumed = false;
    if (this.stall > 0) {
      this.stall -= DT;
      if (this.stall <= 1e-9) {
        this.stall = 0; this.heat = P.resumeHeat; justResumed = true; this.ev.push({ k: 'resume', x: w.x, y: w.y });
      }
    }
    // open attempt
    if (p.down && !w.open && this.stall <= 0 && this.lockLeft <= 0) this._openWell();
    // well strength & heat
    var S = 0;
    if (w.open) {
      if (w.tapLeft > 0) S = P.S0;
      else { w.held += DT; S = P.S0 + (P.Smax - P.S0) * Math.min(1, w.held / P.ramp); }
      w.S = S;
      this.heat += (P.heatBase + P.heatRate * Math.pow(S / P.Smax, 2)) * DT;
    } else if (this.stall > 0) {
      this.heat = 100;
    } else if (!justResumed) {
      this.heat = Math.max(0, this.heat - P.cool * DT);
    }
    if (this.heat >= 100 && this.stall <= 0) {
      this.heat = 100; this.stall = P.stallT; st.stalls++; this._waveStalled = true; this._cleanStreak = 0;
      this._closeWell(); this.ev.push({ k: 'stall', x: w.x, y: w.y });
    }
    if (this.heat > st.maxHeat) st.maxHeat = this.heat;
    if (this.heat > this._waveMaxHeat) this._waveMaxHeat = this.heat;
    // physics
    var sample = (this.n % 4) === 0, bodies = this.bodies, R = P.R, e2 = P.e * P.e;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (w.open) {
        var dx = w.x - b.x, dy = w.y - b.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
        if (d < R) {
          var q = 1 - d / R, k = S * q * q / (Math.pow(d2 + e2, 1.5) * b.m);
          b.vx += k * dx * DT; b.vy += k * dy * DT;
        }
      }
      var sp = Math.hypot(b.vx, b.vy);
      // admin default: drag only slows a body down to cruiseFloor (35 px/s), so bodies never stall mid-field and every wave can clear
      if (sp > P.cruiseFloor) { var f = Math.max(P.cruiseFloor / sp, 1 - P.drag * DT); b.vx *= f; b.vy *= f; sp *= f; }
      if (sp > P.vcap) { b.vx *= P.vcap / sp; b.vy *= P.vcap / sp; }
      b.x += b.vx * DT; b.y += b.vy * DT;
      if (sample) { b.trail.push([b.x, b.y]); if (b.trail.length > 14) b.trail.shift(); }
    }
    // capture / core hit
    var core = this.core;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i]; if (b.dead) continue;
      if (b.good) {
        var sp2 = Math.hypot(b.vx, b.vy);
        if (sp2 < P.capSpeed) for (j = 0; j < 3; j++) {
          var c = this.cols[j];
          if (Math.hypot(b.x - c.x, b.y - c.y) < P.capR) {
            b.dead = true; st.captures++; this.streak++;
            if (this.streak > st.peakStreak) st.peakStreak = this.streak;
            this.mult = Math.min(5, 1 + Math.floor(this.streak / 3));
            this.score += b.val * this.mult;
            this.ev.push({ k: 'capture', x: c.x, y: c.y, kind: b.merged ? 'merged' : 'good' });
            break;
          }
        }
        if (b.dead) continue;
      }
      if (Math.hypot(b.x - core.x, b.y - core.y) < core.r + b.r) {
        b.dead = true;
        if (!b.good) { st.hits++; this._hit(b.x, b.y, 'hit'); }
        else { this.streak = 0; this.mult = 1; st.lost++; this.ev.push({ k: 'lost', x: b.x, y: b.y }); }
      }
    }
    // pair overlaps
    var strong = w.open && S >= P.strongFrac * P.Smax, add = [];
    for (i = 0; i < bodies.length; i++) {
      var a = bodies[i]; if (a.dead) continue;
      for (j = i + 1; j < bodies.length; j++) {
        b = bodies[j]; if (b.dead || a.dead) continue;
        var ddx = a.x - b.x, ddy = a.y - b.y, rr = a.r + b.r;
        if (ddx * ddx + ddy * ddy >= rr * rr) continue;
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (Math.hypot(a.x - core.x, a.y - core.y) < P.blastR || Math.hypot(b.x - core.x, b.y - core.y) < P.blastR) {
          a.dead = b.dead = true; this._hit(mx, my, 'near');
        } else if (!a.good && !b.good) {
          a.dead = b.dead = true; st.clashes++; this.score += 25; this.ev.push({ k: 'clash', x: mx, y: my, kind: 'bad' });
        } else if (a.good && b.good) {
          if (strong && !a.merged && !b.merged) {
            a.dead = b.dead = true; st.merges++;
            var m = a.m + b.m;
            add.push({ x: mx, y: my, vx: (a.vx * a.m + b.vx * b.m) / m, vy: (a.vy * a.m + b.vy * b.m) / m, good: true, merged: true });
            this.ev.push({ k: 'merge', x: mx, y: my });
          }
        } else {
          a.dead = b.dead = true; this.streak = 0; this.mult = 1; this.ev.push({ k: 'clash', x: mx, y: my, kind: 'mix' });
        }
      }
    }
    // outside
    var W = this.W, H = this.H;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i]; if (b.dead) continue;
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) {
        b.dead = true;
        if (b.good) { st.escapes++; this.streak = 0; this.mult = 1; this.ev.push({ k: 'escape', x: clamp(b.x, 0, W), y: clamp(b.y, 0, H) }); }
      }
    }
    var live = [];
    for (i = 0; i < bodies.length; i++) if (!bodies[i].dead) live.push(bodies[i]);
    for (i = 0; i < add.length; i++) { this.addBody(add[i]); live.push(this.bodies.pop()); }
    this.bodies = live;
    // waves
    if (!P.noSpawn && !this.over) {
      if (this.phase === 'spawn') {
        this._spawnT -= DT;
        if (this._spawnT <= 0 && this.spawnLeft > 0) {
          this._spawn(); this.spawnLeft--; this._spawnT = this._gap;
          if (this.spawnLeft === 0) this.phase = 'clear';
        }
      } else if (this.phase === 'clear') {
        if (this.bodies.length === 0) {
          if (this._waveMaxHeat < 60) st.coldWaves++;
          if (!this._waveStalled) {
            this.score += 100; st.cleanWaves++; this._cleanStreak++;
            if (this._cleanStreak === P.healWaves) { this.integrity = Math.min(5, this.integrity + 1); this._cleanStreak = 0; }
          }
          this.phase = 'gap'; this._gapT = 1.5;
        }
      } else if (this.phase === 'gap') {
        this._gapT -= DT;
        if (this._gapT <= 0) this._startWave(this.wave + 1);
      }
    }
    this.n++; this.time = this.n * DT;
  };

  SP.medal = function () {
    var w = this.wave, s = this.score;
    if (w >= 20 || s >= 8000) return 'gold';
    if (w >= 14 || s >= 4000) return 'silver';
    if (w >= 8 || s >= 1500) return 'bronze';
    return null;
  };

  SP.hash = function () {
    var pos = this.bodies.map(function (b) { return [Math.round(b.x * 1000) / 1000, Math.round(b.y * 1000) / 1000]; });
    return fnv(JSON.stringify([this.score, this.wave, this.n, this.stats, this.integrity, pos]));
  };

  SP.report = function () {
    var P = {}, k; for (k in this.P) P[k] = this.P[k];
    return { seed: this.seed, W: this.W, H: this.H, params: P, steps: this.n, time: this.time, wave: this.wave,
      score: this.score, integrity: this.integrity, medal: this.medal(),
      badge: this.stats.coldWaves >= 1 ? 'Cold hands' : null,
      stats: JSON.parse(JSON.stringify(this.stats)), hash: this.hash() };
  };

  WH.createSim = function (seed, W, H, po) { return new Sim(seed, W, H, po); };

  WH.replay = function (seed, W, H, P, log, steps) {
    var sim = WH.createSim(seed, W, H, P), idx = 0; log = log || [];
    while (sim.n < steps) {
      var evs = [];
      while (idx < log.length && log[idx][0] <= sim.n) { if (log[idx][0] === sim.n) evs.push([log[idx][1], log[idx][2], log[idx][3]]); idx++; }
      sim.step(evs.length ? evs : undefined);
      if (sim.over) break;
    }
    return sim;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = WH;
})();
