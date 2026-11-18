// Burn Window sector generator + best-fuel search. Deterministic from (runSeed, index). UMD: BW.gen.
(function (root) {
  'use strict';
  const S = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./sim.js') : root.BW.sim;
  const C = S.C;
  // type per sector index 0..7
  const TYPES = ['open', 'open', 'open', 'dark', 'corridor', 'dark', 'corridor', 'gauntlet'];
  function randSched(rng, maxStart) {
    const nb = 1 + Math.floor(rng() * 3), sched = []; let t = 0;
    for (let i = 0; i < nb; i++) {
      t += rng() * (maxStart / nb);
      const q = rng(); let dur = q < 0.3 ? 0.08 + rng() * 0.07 : q < 0.75 ? 0.15 + rng() * 0.45 : 0.6 + rng() * 1.9;
      sched.push([t, dur]); t += dur + 0.05;
    }
    return sched;
  }
  function trial(sector, sched, maxSeconds) { const r = S.runSchedule(sector, sched, { maxSeconds: maxSeconds || 35 }); return r; }
  // Search: random samples then hill climb. Returns {fuel, sched, dockFuels:[...fuel of docking random samples], tried}
  function searchBest(sector, opts) {
    opts = opts || {};
    const rng = S.mulberry32(S.hashSeed(opts.seed || 7, sector.index || 0, 99));
    const samples = opts.samples || 600, climb = opts.climb == null ? 300 : opts.climb, maxSeconds = opts.maxSeconds || 35;
    let best = null; const dockFuels = [];
    if (opts.seedSched) { const r0 = trial(sector, opts.seedSched, maxSeconds); if (r0.result === 'docked') best = { fuel: r0.fuelUsed, sched: opts.seedSched }; }
    for (let i = 0; i < samples; i++) {
      const sc = randSched(rng, 14), r = trial(sector, sc, maxSeconds);
      if (r.result === 'docked') { dockFuels.push(r.fuelUsed); if (!best || r.fuelUsed < best.fuel) best = { fuel: r.fuelUsed, sched: sc }; }
      if (opts.quick && i >= opts.quick && !best) return { fuel: null, sched: null, dockFuels, tried: i + 1 };
    }
    if (best) for (let i = 0; i < climb; i++) {
      const sc = best.sched.map(b => [Math.max(0, b[0] + (rng() - 0.5) * 0.5), Math.max(C.TICK_STEPS * C.DT, b[1] + (rng() - 0.5) * 0.3)]);
      sc.sort((a, b) => a[0] - b[0]);
      let ok = true; for (let k = 1; k < sc.length; k++) if (sc[k][0] < sc[k - 1][0] + sc[k - 1][1]) { sc[k][0] = sc[k - 1][0] + sc[k - 1][1] + 0.02; }
      const r = trial(sector, sc, maxSeconds);
      if (r.result === 'docked' && r.fuelUsed < best.fuel - 1e-9) best = { fuel: r.fuelUsed, sched: sc };
    }
    return { fuel: best ? best.fuel : null, sched: best ? best.sched : null, dockFuels, tried: samples };
  }
  function candidate(runSeed, index, attempt) {
    const rng = S.mulberry32(S.hashSeed(runSeed, index, attempt)), W = C.W, H = C.H, type = TYPES[index % TYPES.length], bodies = [];
    const mk = (id, kind, cx, cy, R, w, p, dark) => bodies.push(S.makeBody({ id, kind, cx, cy, R, w, p, dark }));
    const rw = () => (0.15 + rng() * 0.45) * (rng() < 0.5 ? -1 : 1), rp = () => rng() * Math.PI * 2;
    if (type === 'corridor') {
      const y = H * (0.42 + rng() * 0.16), gap = 62 + rng() * 22;
      mk('A', 'large', W / 2 - gap / 2 - 24, y, 0, 0, 0); mk('B', 'large', W / 2 + gap / 2 + 24, y + (rng() - 0.5) * 30, 0, 0, 0);
      mk('C', 'small', W / 2, y + 120 * (rng() < 0.5 ? 1 : -1), 40 + rng() * 30, rw(), rp());
    } else {
      mk('A', 'large', W * (0.35 + rng() * 0.3), H * (0.35 + rng() * 0.25), rng() * 16, rw() * 0.5, rp());
      const extra = [2, 2, 3, 3, 3, 4, 4, 4][index % 8] - 1;
      for (let i = 0; i < extra; i++) mk('BCD'[i], i === 0 ? 'medium' : 'small', 70 + rng() * (W - 140), 110 + rng() * (H - 220), 40 + rng() * 55, rw(), rp());
      if (type === 'dark' || type === 'gauntlet') bodies[bodies.length - 1].dark = true;
    }
    const left = rng() < 0.5, sy = 40 + rng() * 80, gy = H - 40 - rng() * 80;
    const sx = left ? 30 : W - 30, gx = left ? W - 40 - rng() * 60 : 40 + rng() * 60;
    const aim = Math.atan2(H * 0.5 - sy, W * 0.5 - sx) + (rng() - 0.5) * 0.9, sp = 40 + rng() * 40;
    return { index, type, bodies, gate: { x: gx, y: gy }, start: { x: sx, y: sy, vx: Math.cos(aim) * sp, vy: Math.sin(aim) * sp }, fuel0: C.FUEL0 };
  }
  function clearance(sec) { // gate and start must keep clear of every body surface for all t in one period
    for (let t = 0; t < 24; t += 0.4) for (const b of sec.bodies) {
      const x = S.bodyX(b, t), y = S.bodyY(b, t);
      if (Math.hypot(x - sec.gate.x, y - sec.gate.y) < b.r + 27) return false;
      if (t < 6 && Math.hypot(x - sec.start.x, y - sec.start.y) < b.r + 40) return false;
    }
    return true;
  }
  // Gate placed on a surviving random trajectory (solvable by construction), then best-fuel search sets par.
  function placeGate(sec, rng) {
    for (let k = 0; k < 80; k++) {
      const sc = randSched(rng, 12), st = S.newState(sec), inp = S.inputFromEvents(S.schedToEvents(sc)), maxN = Math.round(30 / C.DT), pts = [];
      while (st.n < maxN && st.status === 'flying') { S.step(st, sec, inp(st.n)); if (st.n % 60 === 0) pts.push([st.x, st.y, Math.hypot(st.vx, st.vy), st.n * C.DT]); }
      const cand = pts.filter(p => p[3] > 5 && p[2] < 80 && p[0] > 25 && p[0] < C.W - 25 && p[1] > 25 && p[1] < C.H - 25 && Math.hypot(p[0] - sec.start.x, p[1] - sec.start.y) > 110);
      if (!cand.length) continue;
      for (let q = 0; q < cand.length; q++) {
        const p = cand[(Math.floor(rng() * cand.length) + q) % cand.length]; sec.gate = { x: p[0], y: p[1] };
        if (clearance(sec)) { sec._seed = sc; return true; }
      }
    }
    return false;
  }
  function generateSector(runSeed, index, opts) {
    opts = opts || {};
    for (let a = 0; a < 150; a++) {
      const sec = candidate(runSeed, index, a); sec.index = index;
      const rng = S.mulberry32(S.hashSeed(runSeed, index, a, 5));
      sec.gate = { x: -999, y: -999 };
      if (!placeGate(sec, rng)) continue;
      if (trial(sec, [], 35).result === 'docked') continue;                 // free coast must not dock
      const q = searchBest(sec, { seed: runSeed, seedSched: sec._seed, samples: opts.samples || 500, climb: opts.climb == null ? 250 : opts.climb });
      if (q.fuel == null || q.fuel > 34 || q.fuel < 2.5) continue;            // solvable, not trivial, within budget
      sec.par = { fuel: q.fuel, sched: q.sched }; sec.dockFuels = q.dockFuels; sec.attempt = a;
      return sec;
    }
    throw new Error('generator failed for seed ' + runSeed + ' sector ' + index);
  }
  const api = { TYPES, randSched, searchBest, generateSector, candidate, clearance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.BW = root.BW || {}; root.BW.gen = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
