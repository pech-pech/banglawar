// Burn Window sector generator + best-fuel search. Deterministic from (runSeed, index). UMD: BW.gen.
// 2026-11-19 polish: start aim screened (root cause of ~5-7% throws: launches aimed into the primary crashed
// in < 5 s, so placeGate found no gate spot in 80 x 30 s runs, 150 times over), cheap early rejects,
// salted fallback attempts (never throws in practice), new types binary / ring / slingshot, stronger par search.
(function (root) {
  'use strict';
  const S = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./sim.js') : root.BW.sim;
  const C = S.C;
  // type per sector index 0..7 (escalating: 2 bodies -> twin -> hidden -> squeeze -> moving hazard -> flyby -> all)
  const TYPES = ['open', 'open', 'binary', 'dark', 'corridor', 'ring', 'slingshot', 'gauntlet'];
  const ROCK_GM = 12000; // ring rocks: r = 6.7 px, pull negligible, pure moving hazard
  function randSched(rng, maxStart) {
    const nb = 1 + Math.floor(rng() * 3), sched = []; let t = 0;
    for (let i = 0; i < nb; i++) {
      t += rng() * (maxStart / nb);
      const q = rng(); let dur = q < 0.3 ? 0.08 + rng() * 0.07 : q < 0.75 ? 0.15 + rng() * 0.45 : 0.6 + rng() * 1.9;
      sched.push([t, dur]); t += dur + 0.05;
    }
    return sched;
  }
  function trial(sector, sched, maxSeconds) { return S.runSchedule(sector, sched, { maxSeconds: maxSeconds || 35 }); }
  function fixOrder(sc) {
    sc.sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < sc.length; k++) if (sc[k][0] < sc[k - 1][0] + sc[k - 1][1]) sc[k][0] = sc[k - 1][0] + sc[k - 1][1] + 0.02;
    return sc;
  }
  const MIN_DUR = C.TICK_STEPS * C.DT;
  // one hill-climb move on a schedule [[t,dur,th?]]. Moves: jiggle all, nudge one burn, shrink one, throttle one, drop one.
  function mutate(sched, rng, scale) {
    const sc = sched.map(b => b.slice()), m = rng(), i = Math.floor(rng() * sc.length);
    if (m < 0.35) for (const b of sc) { b[0] = Math.max(0, b[0] + (rng() - 0.5) * 0.5 * scale); b[1] = Math.max(MIN_DUR, b[1] + (rng() - 0.5) * 0.3 * scale); }
    else if (m < 0.65) { sc[i][0] = Math.max(0, sc[i][0] + (rng() - 0.5) * 0.4 * scale); sc[i][1] = Math.max(MIN_DUR, sc[i][1] + (rng() - 0.5) * 0.2 * scale); }
    else if (m < 0.82) sc[i][1] = Math.max(MIN_DUR, sc[i][1] * (1 - rng() * 0.25 * scale));
    else if (m < 0.95) { const th = sc[i][2] == null ? 1 : sc[i][2]; sc[i][2] = Math.round(Math.max(C.THROTTLE_MIN, Math.min(1, th + (rng() - 0.6) * 0.5)) * 100) / 100; }
    else if (sc.length > 1) sc.splice(i, 1);
    return fixOrder(sc);
  }
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
      if (opts.floor && best && best.fuel < opts.floor) return { fuel: best.fuel, sched: best.sched, dockFuels, tried: i + 1 }; // under the floor: reject early
      if (opts.quick && i >= opts.quick && !best) return { fuel: null, sched: null, dockFuels, tried: i + 1 };
    }
    if (best && opts.floor && best.fuel < opts.floor) return { fuel: best.fuel, sched: best.sched, dockFuels, tried: samples }; // already under the floor: reject early
    if (best) for (let i = 0; i < climb; i++) {
      const sc = mutate(best.sched, rng, 1 - 0.7 * i / climb), r = trial(sector, sc, maxSeconds);
      if (r.result === 'docked' && r.fuelUsed < best.fuel - 1e-9) best = { fuel: r.fuelUsed, sched: sc };
    }
    return { fuel: best ? best.fuel : null, sched: best ? best.sched : null, dockFuels, tried: samples };
  }
  // coast for `sec` seconds from a start; true when it neither crashes nor leaves the world
  function coastOk(sector, seconds) {
    const st = S.newState(sector), n = Math.round(seconds / C.DT);
    while (st.n < n && st.status === 'flying') { S.step(st, sector, null); if (st.x < 0 || st.x > C.W || st.y < 0 || st.y > C.H) return false; }
    return st.status === 'flying';
  }
  function candidate(runSeed, index, attempt) {
    const rng = S.mulberry32(S.hashSeed(runSeed, index, attempt)), W = C.W, H = C.H, type = TYPES[index % TYPES.length], bodies = [];
    const mk = (id, kind, cx, cy, R, w, p, dark, gm) => { const b = S.makeBody({ id, kind, cx, cy, R, w, p, dark, gm }); bodies.push(b); return b; };
    const sgn = () => (rng() < 0.5 ? -1 : 1), rw = () => (0.15 + rng() * 0.45) * sgn(), rp = () => rng() * Math.PI * 2;
    if (type === 'corridor') {
      const y = H * (0.42 + rng() * 0.16), gap = 62 + rng() * 22;
      mk('A', 'large', W / 2 - gap / 2 - 24, y, 0, 0, 0); mk('B', 'large', W / 2 + gap / 2 + 24, y + (rng() - 0.5) * 30, 0, 0, 0);
      mk('C', 'small', W / 2, y + 120 * (rng() < 0.5 ? 1 : -1), 40 + rng() * 30, rw(), rp());
    } else if (type === 'binary') { // two medium bodies on one rail, opposite phase, plus a far small moon
      const cx = W * (0.38 + rng() * 0.24), cy = H * (0.4 + rng() * 0.2), R = 27 + rng() * 9, w = (0.35 + rng() * 0.3) * sgn(), p = rp();
      mk('A', 'medium', cx, cy, R, w, p); mk('B', 'medium', cx, cy, R, w, p + Math.PI);
      mk('C', 'small', 70 + rng() * (W - 140), 110 + rng() * (H - 220), 40 + rng() * 40, rw(), rp());
    } else if (type === 'ring') { // primary inside a turning ring of rocks: time the gap
      const cx = W * (0.4 + rng() * 0.2), cy = H * (0.42 + rng() * 0.16), R = 78 + rng() * 22, n = 5 + Math.floor(rng() * 3), w = (0.22 + rng() * 0.18) * sgn(), p = rp();
      mk('A', 'large', cx, cy, 0, 0, 0);
      for (let i = 0; i < n; i++) mk('R' + i, 'small', cx, cy, R, w, p + i * 2 * Math.PI / n, false, ROCK_GM).rock = true;
    } else if (type === 'slingshot') { // fast medium moon around a static primary; gate sits past a moon flyby
      const cx = W * (0.4 + rng() * 0.2), cy = H * (0.4 + rng() * 0.2);
      mk('A', 'large', cx, cy, 0, 0, 0); mk('B', 'medium', cx, cy, 92 + rng() * 26, (0.45 + rng() * 0.25) * sgn(), rp());
    } else {
      mk('A', 'large', W * (0.35 + rng() * 0.3), H * (0.35 + rng() * 0.25), rng() * 16, rw() * 0.5, rp());
      const extra = [2, 2, 3, 3, 3, 4, 4, 4][index % 8] - 1;
      for (let i = 0; i < extra; i++) mk('BCD'[i], i === 0 ? 'medium' : 'small', 70 + rng() * (W - 140), 110 + rng() * (H - 220), 40 + rng() * 55, rw(), rp());
      if (type === 'dark' || type === 'gauntlet') bodies[bodies.length - 1].dark = true;
    }
    const left = rng() < 0.5, sy = 40 + rng() * 80, gy = H - 40 - rng() * 80;
    const sx = left ? 30 : W - 30, gx = left ? W - 40 - rng() * 60 : 40 + rng() * 60;
    const aim0 = Math.atan2(H * 0.5 - sy, W * 0.5 - sx) + (rng() - 0.5) * 0.9, sp = 40 + rng() * 40;
    const sec = { index, type, bodies, gate: { x: gx, y: gy }, start: { x: sx, y: sy, vx: Math.cos(aim0) * sp, vy: Math.sin(aim0) * sp }, fuel0: C.FUEL0 };
    // Launch screen: the old aim (toward centre) dropped ~2/3 of launches into the primary within 5 s.
    // Try the drawn aim, then deterministic offsets either side (then slower); keep the first that coasts 10 s inside the world.
    const offs = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05], spf = [1, 0.75, 0.55];
    const g = sec.gate; sec.gate = { x: -999, y: -999 };
    for (const f of spf) for (const o of offs) {
      sec.start.vx = Math.cos(aim0 + o) * sp * f; sec.start.vy = Math.sin(aim0 + o) * sp * f;
      if (coastOk(sec, 10)) { sec.gate = g; return sec; }
    }
    sec.gate = g; sec.dead = true; return sec;
  }
  function clearance(sec) { // gate and start must keep clear of every body surface for all t in one period
    for (let t = 0; t < 24; t += 0.4) for (const b of sec.bodies) {
      const x = S.bodyX(b, t), y = S.bodyY(b, t);
      if (Math.sqrt((x - sec.gate.x) * (x - sec.gate.x) + (y - sec.gate.y) * (y - sec.gate.y)) < b.r + 27) return false;
      if (t < 6 && Math.sqrt((x - sec.start.x) * (x - sec.start.x) + (y - sec.start.y) * (y - sec.start.y)) < b.r + 40) return false;
    }
    return true;
  }
  function startClear(sec) {
    for (let t = 0; t < 6; t += 0.4) for (const b of sec.bodies) if (Math.sqrt((S.bodyX(b, t) - sec.start.x) * (S.bodyX(b, t) - sec.start.x) + (S.bodyY(b, t) - sec.start.y) * (S.bodyY(b, t) - sec.start.y)) < b.r + 40) return false;
    return true;
  }
  // Gate placed on a surviving random trajectory (solvable by construction), then best-fuel search sets par.
  // Slingshot: only points after the craft passed within 30 px of the moon's surface count.
  function placeGate(sec, rng) {
    const moon = sec.type === 'slingshot' ? sec.bodies[1] : null;
    // free-coast path: a gate within 45 px of it docks for free or for < 2.5 fuel (was ~45% of rejected attempts)
    const cst = S.newState(sec), coast = [];
    while (cst.n < 35 / C.DT && cst.status === 'flying') { S.step(cst, sec, null); if (cst.n % 6 === 0) coast.push(cst.x, cst.y); }
    const farFromCoast = (x, y) => { for (let i = 0; i < coast.length; i += 2) if (Math.abs(coast[i] - x) < 45 && Math.sqrt((coast[i] - x) * (coast[i] - x) + (coast[i + 1] - y) * (coast[i + 1] - y)) < 45) return false; return true; };
    let found = 0;
    for (let k = 0; k < 60; k++) {
      if (k >= 12 && !found) return false; // bimodal: a launch that yields nothing in 12 runs is a dead layout
      const sc = randSched(rng, 12), st = S.newState(sec), inp = S.inputFromEvents(S.schedToEvents(sc)), maxN = Math.round(30 / C.DT), pts = [];
      let flyby = !moon;
      while (st.n < maxN && st.status === 'flying') {
        S.step(st, sec, inp(st.n));
        if (moon && !flyby && Math.sqrt((st.x - S.bodyX(moon, st.n * C.DT)) * (st.x - S.bodyX(moon, st.n * C.DT)) + (st.y - S.bodyY(moon, st.n * C.DT)) * (st.y - S.bodyY(moon, st.n * C.DT))) < moon.r + 30) flyby = true;
        if (flyby && st.n % 60 === 0) pts.push([st.x, st.y, Math.sqrt(st.vx * st.vx + st.vy * st.vy), st.n * C.DT]);
      }
      const cand = pts.filter(p => p[3] > 5 && p[2] < 80 && p[0] > 25 && p[0] < C.W - 25 && p[1] > 25 && p[1] < C.H - 25 && Math.sqrt((p[0] - sec.start.x) * (p[0] - sec.start.x) + (p[1] - sec.start.y) * (p[1] - sec.start.y)) > 110 && farFromCoast(p[0], p[1]));
      if (!cand.length) continue;
      found++;
      for (let q = 0; q < cand.length; q++) {
        const p = cand[(Math.floor(rng() * cand.length) + q) % cand.length]; sec.gate = { x: p[0], y: p[1] };
        if (clearance(sec)) { sec._seed = sc; return true; }
      }
    }
    return false;
  }
  // min distance from the par path to body b's surface (slingshot check)
  function pathMinDist(sec, sched, b) {
    const st = S.newState(sec), inp = S.inputFromEvents(S.schedToEvents(sched)); let d = 1e9;
    while (st.n < 35 / C.DT && st.status === 'flying') { S.step(st, sec, inp(st.n)); const t = st.n * C.DT; d = Math.min(d, Math.sqrt((st.x - S.bodyX(b, t)) * (st.x - S.bodyX(b, t)) + (st.y - S.bodyY(b, t)) * (st.y - S.bodyY(b, t))) - b.r); }
    return d;
  }
  function tryAttempt(runSeed, index, a, opts) {
    const sec = candidate(runSeed, index, a), no = why => { if (opts.stats) opts.stats[why] = (opts.stats[why] || 0) + 1; return null; };
    sec.index = index;
    if (sec.dead) return no('launch'); if (!startClear(sec)) return no('startClear');
    const rng = S.mulberry32(S.hashSeed(runSeed, index, a, 5));
    sec.gate = { x: -999, y: -999 };
    if (!placeGate(sec, rng)) return no('gate');
    if (trial(sec, [], 35).result === 'docked') return no('coast');               // free coast must not dock
    const q = searchBest(sec, { seed: runSeed, seedSched: sec._seed, samples: opts.samples || 500, floor: 2.5, climb: opts.climb == null ? 300 : opts.climb });
    if (q.fuel == null || q.fuel > 34 || q.fuel < 2.5) return no(q.fuel == null ? 'nosolve' : q.fuel > 34 ? 'parHigh' : 'parLow');           // solvable, not trivial, within budget
    if (sec.type === 'slingshot' && pathMinDist(sec, q.sched, sec.bodies[1]) > 40) return no('noFlyby'); // par line must use the moon
    sec.par = { fuel: q.fuel, sched: q.sched }; sec.dockFuels = q.dockFuels; sec.attempt = a;
    delete sec._seed; delete sec.dead;
    return sec;
  }
  function generateSector(runSeed, index, opts) {
    opts = opts || {};
    for (let a = 0; a < 400; a++) { const s = tryAttempt(runSeed, index, a, opts); if (s) return s; }
    // salted fallback: same type, fresh deterministic sub-seeds
    for (let k = 1; k <= 400; k++) { const s = tryAttempt(S.hashSeed(runSeed, 0x5a17, k), index, k, opts); if (s) { s.salt = k; return s; } }
    throw new Error('generator failed for seed ' + runSeed + ' sector ' + index);
  }
  const api = { TYPES, randSched, searchBest, generateSector, candidate, clearance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.BW = root.BW || {}; root.BW.gen = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
