'use strict';
// Plain-node physics tests for Burn Window. Run: node tests/physics.test.js
const path = require('path');
const S = require(path.join(__dirname, '..', 'src', 'sim.js'));
const G = require(path.join(__dirname, '..', 'src', 'gen.js'));
const C = S.C;
let fails = 0;
function report(name, ok, info, ms) {
  if (!ok) fails++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (info ? ' | ' + info : '') + (ms != null ? ' | ' + ms.toFixed(0) + ' ms' : ''));
}
function test(name, fn) {
  const t0 = process.hrtime.bigint();
  let ok = false, info = '';
  try { const r = fn(); ok = !!r.ok; info = r.info || ''; } catch (e) { info = 'threw: ' + (e && e.stack || e); }
  report(name, ok, info, Number(process.hrtime.bigint() - t0) / 1e6);
}
const sector = (bodies, gate, start, extra) => Object.assign({ index: 0, bodies: bodies.map(S.makeBody), gate, start, fuel0: C.FUEL0 }, extra);
const BIG = { id: 'A', kind: 'large', cx: 170, cy: 243 };
const NOGATE = { x: -999, y: -999 };

test('1a determinism: hand-built sector + schedule', () => {
  const mk = () => sector([BIG, { id: 'B', kind: 'small', cx: 170, cy: 243, R: 80, w: 0.4, p: 1 }], { x: 60, y: 420 }, { x: 30, y: 60, vx: 50, vy: 30 });
  const sched = [[0.5, 0.3], [2, 0.8, 0.5]];
  const a = S.runSchedule(mk(), sched, { maxSeconds: 20 }), b = S.runSchedule(mk(), sched, { maxSeconds: 20 });
  return { ok: a.checksum === b.checksum && a.steps === b.steps, info: a.checksum + ' ' + b.checksum + ' (' + a.result + ', ' + a.steps + ' steps)' };
});

test('1b determinism: generateSector(1,0) twice', () => {
  const a = G.generateSector(1, 0), b = G.generateSector(1, 0);
  const pick = s => JSON.stringify({ bodies: s.bodies, gate: s.gate, par: s.par });
  return { ok: pick(a) === pick(b), info: 'par ' + a.par.fuel.toFixed(3) };
});

test('2 predictor vs real (no flyby, 3 s)', () => {
  const sec = sector([{ id: 'A', kind: 'small', cx: 30, cy: 30 }], NOGATE, { x: 300, y: 440, vx: -10, vy: -10 });
  const st = S.newState(sec), pr = S.predict(st, sec, { seconds: 3 });
  const n = Math.round(3 / C.DT);
  for (let i = 0; i < n; i++) S.step(st, sec, { burn: false });
  const last = pr.pts[pr.pts.length - 1];
  const err = Math.hypot(last.x - st.x, last.y - st.y);
  return { ok: err < 6 && pr.end === 'ok' && st.status === 'flying' && Math.abs(last.t - 3) < 1e-6, info: 'err ' + err.toFixed(4) + ' px, end ' + pr.end + ', t ' + last.t.toFixed(3) };
});

test('3 energy drift: circular orbit r=60, 60 s', () => {
  const sec = sector([BIG], NOGATE, { x: 230, y: 243, vx: 0, vy: 0 });
  const r = 60, a = BIG.gm || C.GM.large, acc = a * r / Math.pow(r * r + C.EPS * C.EPS, 1.5), v = Math.sqrt(acc * r);
  sec.start.vy = v;
  const st = S.newState(sec), e0 = S.energy(st, sec, 0);
  let rmin = 1e9, rmax = 0;
  for (let i = 0; i < 60 / C.DT; i++) { S.step(st, sec, { burn: false }); const d = Math.hypot(st.x - 170, st.y - 243); rmin = Math.min(rmin, d); rmax = Math.max(rmax, d); }
  const e1 = S.energy(st, sec, st.n * C.DT), drift = Math.abs((e1 - e0) / e0);
  return { ok: st.status === 'flying' && drift < 0.005, info: 'drift ' + (drift * 100).toFixed(5) + '%, r in [' + rmin.toFixed(1) + ',' + rmax.toFixed(1) + '], status ' + st.status };
});

test('4 Oberth: 0.5 s burn at periapsis vs apoapsis', () => {
  const sec = sector([BIG], NOGATE, { x: 215, y: 243, vx: 0, vy: 0 });
  const gm = C.GM.large, r = 45, acc = gm * r / Math.pow(r * r + C.EPS * C.EPS, 1.5);
  sec.start.vy = 1.2 * Math.sqrt(acc * r);
  const st = S.newState(sec), peri = Object.assign({}, st);
  let apo = null, rmax = 0;
  for (let i = 0; i < 20 / C.DT; i++) {
    S.step(st, sec, { burn: false });
    const d = Math.hypot(st.x - 170, st.y - 243);
    if (d > rmax) { rmax = d; apo = Object.assign({}, st); }
    if (st.status !== 'flying') break;
  }
  const gain = s0 => {
    const s = Object.assign({}, s0), e0 = S.energy(s, sec, s.n * C.DT), n = Math.round(0.5 / C.DT);
    for (let i = 0; i < n; i++) S.step(s, sec, { burn: true, throttle: 1 });
    return { de: S.energy(s, sec, s.n * C.DT) - e0, status: s.status };
  };
  const gp = gain(peri), ga = gain(apo), ratio = gp.de / ga.de;
  return { ok: gp.status === 'flying' && ga.status === 'flying' && ga.de > 0 && ratio >= 1.6, info: 'peri dE ' + gp.de.toFixed(1) + ', apo dE ' + ga.de.toFixed(1) + ', ratio ' + ratio.toFixed(2) + ' (apo r ' + rmax.toFixed(1) + ')' };
});

test('5 tick: 1-step press burns 10 steps (83.3 ms >= 80 ms min), 0.8333 fuel', () => {
  const sec = sector([], NOGATE, { x: 170, y: 243, vx: 10, vy: 0 });
  const st = S.newState(sec); let active = 0;
  for (let i = 0; i < 30; i++) { S.step(st, sec, { burn: i === 0, throttle: 1 }); if (st.active) active++; }
  return { ok: active === 10 && Math.abs(st.fuelUsed - 10 / 12) < 1e-9 && Math.abs(st.fuel - (60 - 10 / 12)) < 1e-9 && 10 / 120 >= 0.08, info: 'active steps ' + active + ', fuelUsed ' + st.fuelUsed.toFixed(6) + ', fuel ' + st.fuel.toFixed(6) };
});

test('6 dock rule: ring entry at speed 100 vs 80', () => {
  const run = v => {
    const sec = sector([], { x: 170, y: 400 }, { x: 170, y: 350, vx: 0, vy: v });
    const st = S.newState(sec);
    while (st.n < 600 && st.status === 'flying') S.step(st, sec, { burn: false });
    return st.status;
  };
  const a = run(100), b = run(80);
  return { ok: a !== 'docked' && b === 'docked', info: 'v=100 -> ' + a + ', v=80 -> ' + b };
});

test('7 crash radius + out-of-world', () => {
  const tiny = { id: 'T', kind: 'small', gm: 1e-9, cx: 170, cy: 243 }; // r = 6, crash below 9
  const at = d => { const sec = sector([tiny], NOGATE, { x: 170 + d, y: 243, vx: 0, vy: 0 }); const st = S.newState(sec); S.step(st, sec, { burn: false }); return st.status; };
  const inside = at(8.9), outside = at(9.1);
  const lostAt = (x, vx) => { const sec = sector([], NOGATE, { x, y: 243, vx, vy: 0 }); const st = S.newState(sec); for (let i = 0; i < 240 && st.status === 'flying'; i++) S.step(st, sec, { burn: false }); return st.status; };
  const edgeIn = lostAt(C.W + C.OUT - 5, 0), pastFast = lostAt(C.W + C.OUT - 5, 30), farInside = lostAt(C.W + 50, 0), left = lostAt(-C.OUT + 5, -30);
  return { ok: inside === 'crashed' && outside === 'flying' && edgeIn === 'flying' && pastFast === 'lost' && farInside === 'flying' && left === 'lost',
    info: 'd8.9 ' + inside + ', d9.1 ' + outside + ', edge static ' + edgeIn + ', edge moving ' + pastFast + ', x=W+50 ' + farInside + ', left moving ' + left };
});

(function generatorSweep() {
  const t0 = process.hrtime.bigint();
  let threw = 0, checked = 0, bad = [];
  for (let seed = 1; seed <= 4; seed++) for (let idx = 0; idx < 8; idx++) {
    let sec;
    try { sec = G.generateSector(seed, idx); } catch (e) { threw++; continue; }
    checked++;
    const coast = S.runSchedule(sec, [], { maxSeconds: 35 });
    const run = S.runSchedule(sec, sec.par.sched, { maxSeconds: 35 });
    const f = sec.par.fuel, why = [];
    if (coast.result === 'docked') why.push('free coast docks');
    if (!(f >= 2.5 && f <= 34)) why.push('par.fuel ' + f.toFixed(2) + ' out of [2.5,34]');
    if (run.result !== 'docked') why.push('par.sched -> ' + run.result);
    else if (Math.abs(run.fuelUsed - f) > 0.01) why.push('fuel mismatch ' + run.fuelUsed.toFixed(4) + ' vs ' + f.toFixed(4));
    if (why.length) bad.push('seed ' + seed + ' sector ' + idx + ': ' + why.join('; '));
  }
  console.log('INFO generator: ' + checked + ' sectors checked, ' + threw + ' threw (skipped)');
  bad.forEach(b => console.log('  ' + b));
  report('8 generator seeds 1..4 x sectors 0..7', bad.length === 0 && checked > 0, checked + ' ok-checked, ' + threw + ' failed to generate, ' + bad.length + ' violations', Number(process.hrtime.bigint() - t0) / 1e6);
})();

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: ALL PASSED');
process.exit(fails ? 1 : 0);
