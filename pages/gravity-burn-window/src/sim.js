// Burn Window physics core. Pure, deterministic, no DOM. UMD: node require() or browser global BW.sim.
// Units px, seconds. Fixed step DT=1/120. Velocity Verlet (kick-drift-kick). Bodies on circular rails (pure function of t).
(function (root) {
  'use strict';
  const C = {
    DT: 1 / 120, W: 340, H: 486, EPS: 12,
    THRUST: 20, FUEL_RATE: 10, FUEL0: 60, TICK_STEPS: 10, // 10 steps = 83.3 ms, the smallest whole-step burn >= 80 ms
    GATE_R: 22, DOCK_V: 90, CRASH_PAD: 3, OUT: 120, V_MIN_HEAD: 5,
    GM: { small: 90000, medium: 160000, large: 240000 },
    THROTTLE_MIN: 0.25
  };
  function bodyRadius(gm) { return 6 + 0.00006 * gm; }
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed() { // mix numbers into one uint32 seed
    let h = 2166136261 >>> 0;
    for (let i = 0; i < arguments.length; i++) { h ^= (arguments[i] | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; }
    return h >>> 0;
  }
  // body: {id, kind, gm, r, cx, cy, R, w, p, dark}
  function makeBody(o) {
    const gm = o.gm || C.GM[o.kind];
    return { id: o.id, kind: o.kind, gm, r: bodyRadius(gm), cx: o.cx, cy: o.cy, R: o.R || 0, w: o.w || 0, p: o.p || 0, dark: !!o.dark };
  }
  function bodyX(b, t) { return b.cx + b.R * Math.cos(b.w * t + b.p); }
  function bodyY(b, t) { return b.cy + b.R * Math.sin(b.w * t + b.p); }
  // sector: {id, bodies:[body], gate:{x,y}, start:{x,y,vx,vy}, fuel0}
  function newState(sector, fuel) {
    const s = sector.start, sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1;
    return {
      n: 0, x: s.x, y: s.y, vx: s.vx, vy: s.vy, hx: s.vx / sp, hy: s.vy / sp,
      fuel: fuel == null ? (sector.fuel0 == null ? C.FUEL0 : sector.fuel0) : fuel, fuelUsed: 0,
      tickLeft: 0, burning: false, throttle: 1, status: 'flying', minDist: 1e9
    };
  }
  function accel(bodies, x, y, t, skipDark, out) {
    let ax = 0, ay = 0;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (skipDark && b.dark) continue;
      const dx = bodyX(b, t) - x, dy = bodyY(b, t) - y;
      const r2 = dx * dx + dy * dy + C.EPS * C.EPS;
      const k = b.gm / (r2 * Math.sqrt(r2));
      ax += k * dx; ay += k * dy;
    }
    out[0] = ax; out[1] = ay;
  }
  const _a = [0, 0];
  // low-level integrate of one step of length dt starting at time t. thrust = px/s^2 magnitude (already throttled).
  function integrate(st, bodies, t, dt, thrust, skipDark) {
    let tx = 0, ty = 0;
    if (thrust > 0) {
      const sp = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
      if (sp >= C.V_MIN_HEAD) { tx = st.vx / sp * thrust; ty = st.vy / sp * thrust; } else { tx = st.hx * thrust; ty = st.hy * thrust; }
    }
    accel(bodies, st.x, st.y, t, skipDark, _a);
    st.vx += (_a[0] + tx) * dt * 0.5; st.vy += (_a[1] + ty) * dt * 0.5;
    st.x += st.vx * dt; st.y += st.vy * dt;
    accel(bodies, st.x, st.y, t + dt, skipDark, _a);
    st.vx += (_a[0] + tx) * dt * 0.5; st.vy += (_a[1] + ty) * dt * 0.5;
    const sp = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
    if (sp >= C.V_MIN_HEAD) { st.hx = st.vx / sp; st.hy = st.vy / sp; }
  }
  // advance exactly one DT. input = {burn:boolean, throttle:0.25..1}. Returns st.status.
  function step(st, sector, input) {
    if (st.status !== 'flying') return st.status;
    const t = st.n * C.DT;
    const want = !!(input && input.burn);
    if (want) { st.throttle = Math.max(C.THROTTLE_MIN, Math.min(1, input.throttle == null ? 1 : input.throttle)); }
    if (want && !st.burning) st.tickLeft = C.TICK_STEPS; // rising edge starts the 80 ms minimum
    st.burning = want;
    let on = want || st.tickLeft > 0;
    if (st.tickLeft > 0) st.tickLeft--;
    let thrust = 0;
    if (on && st.fuel > 0) {
      thrust = C.THRUST * st.throttle;
      const burn = C.FUEL_RATE * st.throttle * C.DT;
      const used = Math.min(burn, st.fuel);
      st.fuel -= used; st.fuelUsed += used;
      st.active = true;
    } else st.active = false;
    integrate(st, sector.bodies, t, C.DT, thrust, false);
    st.n++;
    const tn = st.n * C.DT;
    for (let i = 0; i < sector.bodies.length; i++) {
      const b = sector.bodies[i];
      const d = Math.sqrt((st.x - bodyX(b, tn)) * (st.x - bodyX(b, tn)) + (st.y - bodyY(b, tn)) * (st.y - bodyY(b, tn)));
      if (d < st.minDist) st.minDist = d;
      if (d < b.r + C.CRASH_PAD) { st.status = 'crashed'; st.crashBody = b.id; return st.status; }
    }
    if (st.x < -C.OUT || st.x > C.W + C.OUT || st.y < -C.OUT || st.y > C.H + C.OUT) { st.status = 'lost'; return st.status; }
    const g = sector.gate;
    if (Math.sqrt((st.x - g.x) * (st.x - g.x) + (st.y - g.y) * (st.y - g.y)) < C.GATE_R && Math.sqrt(st.vx * st.vx + st.vy * st.vy) < C.DOCK_V) st.status = 'docked';
    return st.status;
  }
  // Coast preview (burn off). Default 3 s at dt 1/30, two 1/60 sub-steps inside 60 px of a visible body.
  // Returns {pts:[{x,y,t}], closest:{i,d,body}|null, end:'ok'|'crashed'|'lost'|'docked'}
  function predict(st, sector, opts) {
    opts = opts || {};
    const seconds = opts.seconds || 3, skipDark = opts.includeDark ? false : true, bodies = sector.bodies;
    const p = { x: st.x, y: st.y, vx: st.vx, vy: st.vy, hx: st.hx, hy: st.hy };
    let t = st.n * C.DT, tEnd = t + seconds;
    const pts = [{ x: p.x, y: p.y, t: 0 }];
    let best = null, end = 'ok';
    const baseT = t;
    let k = 0;
    while (t < tEnd - 1e-9) {
      let near = 1e9;
      for (let i = 0; i < bodies.length; i++) { if (skipDark && bodies[i].dark) continue; const d = Math.sqrt((p.x - bodyX(bodies[i], t)) * (p.x - bodyX(bodies[i], t)) + (p.y - bodyY(bodies[i], t)) * (p.y - bodyY(bodies[i], t))); if (d < near) near = d; }
      const sub = near < 60 ? 2 : 1, dt = (1 / 30) / sub;
      for (let s = 0; s < sub; s++) { integrate(p, bodies, t, dt, 0, skipDark); t += dt; }
      k++;
      pts.push({ x: p.x, y: p.y, t: t - baseT });
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i]; if (skipDark && b.dark) continue;
        const d = Math.sqrt((p.x - bodyX(b, t)) * (p.x - bodyX(b, t)) + (p.y - bodyY(b, t)) * (p.y - bodyY(b, t)));
        if (!best || d - b.r < best.d) best = { i: pts.length - 1, d: d - b.r, body: b.id };
        if (d < b.r + C.CRASH_PAD) { end = 'crashed'; }
      }
      if (end === 'crashed') break;
      if (p.x < -C.OUT || p.x > C.W + C.OUT || p.y < -C.OUT || p.y > C.H + C.OUT) { end = 'lost'; break; }
      if (Math.sqrt((p.x - sector.gate.x) * (p.x - sector.gate.x) + (p.y - sector.gate.y) * (p.y - sector.gate.y)) < C.GATE_R && Math.sqrt(p.vx * p.vx + p.vy * p.vy) < C.DOCK_V) { end = 'docked'; break; }
    }
    return { pts, closest: best, end };
  }
  function checksum(st) { // FNV-1a over rounded state, hex string
    const v = [st.n, Math.round(st.x * 1000), Math.round(st.y * 1000), Math.round(st.vx * 1000), Math.round(st.vy * 1000), Math.round(st.fuel * 1000)];
    let h = 2166136261 >>> 0;
    for (let i = 0; i < v.length; i++) { h ^= (v[i] | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  // events: [[step, burn(0|1), throttle% (25..100)]] sorted by step. Returns stateful fn(step)->input; call with increasing steps.
  function inputFromEvents(events) {
    events = Array.isArray(events) ? events : [];
    let i = 0, cur = { burn: false, throttle: 1 };
    return function (n) {
      while (i < events.length) {
        const e = events[i];
        if (!Array.isArray(e) || typeof e[0] !== 'number') { i++; continue; } // skip malformed event
        if (e[0] > n) break;
        cur = { burn: !!e[1], throttle: (e[2] || 100) / 100 }; i++;
      }
      return cur;
    };
  }
  // sched: [[tStartSec, durSec, throttle?]] non-overlapping. Returns events array.
  function schedToEvents(sched) {
    const ev = [];
    for (const s of sched) {
      const a = Math.round(s[0] / C.DT), b = a + Math.max(C.TICK_STEPS, Math.round(s[1] / C.DT)), th = Math.round((s[2] == null ? 1 : s[2]) * 100);
      ev.push([a, 1, th]); ev.push([b, 0, th]);
    }
    ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    return ev;
  }
  // Run a whole schedule headless. Returns {result:'docked'|'crashed'|'lost'|'timeout', fuelUsed, steps, state, checksum}
  function runSchedule(sector, sched, opts) {
    opts = opts || {};
    const maxSteps = Math.round((opts.maxSeconds || 40) / C.DT), st = newState(sector, opts.fuel);
    const inp = inputFromEvents(schedToEvents(sched));
    while (st.n < maxSteps && st.status === 'flying') step(st, sector, inp(st.n));
    return { result: st.status === 'flying' ? 'timeout' : st.status, fuelUsed: st.fuelUsed, steps: st.n, state: st, checksum: checksum(st) };
  }
  // specific energy (static-body approximation use only in tests)
  function energy(st, sector, t) {
    let u = 0;
    for (const b of sector.bodies) { const d = Math.sqrt((st.x - bodyX(b, t)) * (st.x - bodyX(b, t)) + (st.y - bodyY(b, t)) * (st.y - bodyY(b, t))); u -= b.gm / Math.sqrt(d * d + C.EPS * C.EPS); }
    return 0.5 * (st.vx * st.vx + st.vy * st.vy) + u;
  }
  const api = { C, bodyRadius, mulberry32, hashSeed, makeBody, bodyX, bodyY, newState, step, predict, checksum, inputFromEvents, schedToEvents, runSchedule, energy, integrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.BW = root.BW || {}; root.BW.sim = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
