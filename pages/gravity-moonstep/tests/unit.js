'use strict';
// Moonstep unit tests. Plain Node, no deps. Run: node tests/unit.js
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const M = require(path.join(SRC, 'engine.js'));
global.Moonstep = M;
global.MoonGen = require(path.join(SRC, 'gen.js'));
const C = M.C, DT = C.DT;

const results = [];
function test(name, fn) {
  try { fn(); results.push([name, true, '']); console.log('PASS ' + name); }
  catch (e) { results.push([name, false, e.message]); console.log('FAIL ' + name + ' :: ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'eq') + ': got ' + a + ', want ' + b); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'near') + ': got ' + a + ', want ' + b + ' +-' + tol); }

const MAXT = 240 * 120;
function policy(n) { return { down: (n % 90) < 40, reverse: n > 0 && n % 377 === 0, cancel: false }; }
function run(seed, pol, opts, maxTicks) {
  const s = M.newRun(seed, opts || {});
  let n = 0;
  while (!s.over && n < (maxTicks || MAXT)) { M.tick(s, pol(n)); n++; }
  return s;
}
function bodySig(bs, n) {
  return JSON.stringify(bs.slice(0, n).map(b => [b.id, b.x, b.y, b.r, b.kind, b.spin, b.g0, b.R]));
}

test('determinism: same seed+inputs => same hash x3', () => {
  const h = [0, 1, 2].map(() => M.hash(run('T1', policy)));
  eq(h[0], h[1], 'run1 vs run2'); eq(h[1], h[2], 'run2 vs run3');
});

test('replay(log string) and replay(log array) match original', () => {
  const a = run('T1', policy);
  ok(a.log.length > 0, 'no input log recorded');
  const rs = M.replay('T1', M.logString(a.log), {}, MAXT);
  const ra = M.replay('T1', a.log, {}, MAXT);
  eq(M.hash(rs), M.hash(a), 'string replay vs original');
  eq(M.hash(ra), M.hash(a), 'array replay vs original');
  eq(M.report(a).inputLog, M.logString(a.log), 'report inputLog');
});

test('different seeds differ', () => {
  const sigs = ['A', 'B', 'C', 'seed-4'].map(sd => bodySig(M.newRun(sd).bodies, 12));
  eq(new Set(sigs).size, sigs.length, 'body layouts collide');
  const hs = ['A', 'B', 'C'].map(sd => M.hash(run(sd, policy)));
  eq(new Set(hs).size, hs.length, 'hashes collide: ' + hs.join(' ; '));
});

test('fixed step count equals s.tick', () => {
  const s = M.newRun('T2');
  for (let i = 0; i < 500; i++) M.tick(s, { down: false });
  ok(!s.over, 'ended early');
  eq(s.tick, 500, 'tick');
  near(s.t, 500 * DT, 1e-9, 's.t');
});

function genBodies(seed, polFn, n) {
  const s = M.newRun(seed);
  for (let i = 0; i < n; i++) { if (s.over) break; M.tick(s, polFn(i)); }
  return s;
}
const deep = M.newRun('G1');
deep.runner.y = -6000; global.MoonGen.ensure(deep);

test('generator: x in [-150,150]', () => {
  ok(deep.bodies.length > 30, 'too few bodies ' + deep.bodies.length);
  for (const b of deep.bodies) ok(b.x >= -150 && b.x <= 150, 'body ' + b.id + ' x=' + b.x);
});

test('generator: consecutive rim gap >= 20', () => {
  for (let i = 1; i < deep.bodies.length; i++) {
    const a = deep.bodies[i - 1], b = deep.bodies[i];
    const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
    ok(gap >= 20 - 1e-6, 'bodies ' + (i - 1) + '-' + i + ' gap=' + gap.toFixed(2));
  }
});

test('generator: first 5 bodies big (r>=70) and still', () => {
  for (let i = 0; i < 5; i++) {
    const b = deep.bodies[i];
    ok(b.r >= 70, 'body ' + i + ' r=' + b.r);
    eq(b.kind, 'still', 'body ' + i + ' kind');
  }
});

test('generator: bodies identical for same seed regardless of input', () => {
  const a = genBodies('G2', () => ({ down: false }), 1500);
  const b = genBodies('G2', policy, 1500);
  const c = M.newRun('G2'); c.runner.y = -3000; global.MoonGen.ensure(c);
  const n = Math.min(a.bodies.length, b.bodies.length, c.bodies.length);
  ok(n >= 10, 'too few to compare ' + n);
  eq(bodySig(a.bodies, n), bodySig(b.bodies, n), 'idle vs scripted');
  eq(bodySig(a.bodies, n), bodySig(c.bodies, n), 'idle vs teleport-ensure');
});

// small deterministic rng for the tests themselves
function mkr(seed) { return M.rng(seed); }

test('predict landId equals actual landed body (30 random releases)', () => {
  const R = mkr(12345);
  let checked = 0, skipped = 0, bad = [];
  for (let k = 0; k < 30; k++) {
    const s = M.newRun('P' + k);
    const wait = Math.floor(R() * 120), hold = 1 + Math.floor(R() * 55);
    for (let i = 0; i < wait; i++) M.tick(s, { down: false });
    for (let i = 0; i < hold; i++) M.tick(s, { down: true });
    const ch = s.runner.charge;
    const pr = M.predict(s, ch, 900);
    M.tick(s, { down: false });
    if (s.jumps !== 1) { bad.push('k' + k + ' no jump'); continue; }
    let g = 0;
    while (!s.over && s.runner.mode === 'air' && g++ < 1200) M.tick(s, { down: false });
    if (s.over && s.cause === 'tide') { skipped++; continue; }
    const landed = s.runner.mode === 'rim' ? s.runner.body : -1;
    const jl = s.jumpLog[0];
    checked++;
    if (pr.landId !== landed) bad.push('k' + k + ' predict=' + pr.landId + ' actual=' + landed + ' ch=' + ch.toFixed(3));
    if (jl.aimed !== pr.landId) bad.push('k' + k + ' jumpLog.aimed=' + jl.aimed + ' predict=' + pr.landId);
    if (jl.landed !== landed) bad.push('k' + k + ' jumpLog.landed=' + jl.landed + ' actual=' + landed);
  }
  ok(checked >= 20, 'only ' + checked + ' checked, skipped ' + skipped);
  ok(bad.length === 0, bad.join(' | '));
});

test('probe agrees with predict on same 2-body setup', () => {
  const bad = [];
  for (let seed = 0; seed < 3; seed++) {
    const s = M.newRun('Q' + seed);
    s.bodies = s.bodies.slice(0, 2);
    const b0 = s.bodies[0], b1 = s.bodies[1];
    for (const th of [-120, -90, -60, -30, 0, 150]) for (const ch of [0, 0.2, 0.45]) {
      const pr = M.probe(b0, b1, th, ch, 600);
      const t = th * Math.PI / 180, rr = b0.r + C.RUNNER_R, r = s.runner;
      r.theta = t; r.x = b0.x + rr * Math.cos(t); r.y = b0.y + rr * Math.sin(t);
      r.vt = C.RUN; r.dir = 1; r.mode = 'rim'; r.body = 0; r.sinceLand = 1; s.owner = 0;
      const pd = M.predict(s, ch, 600);
      if (pr.landId !== pd.landId) bad.push('seed' + seed + ' th' + th + ' ch' + ch + ' probe=' + pr.landId + ' predict=' + pd.landId);
    }
  }
  ok(bad.length === 0, bad.slice(0, 4).join(' | '));
});

test('crumble: shrinks to dead in 1.5 s after runner leaves', () => {
  const s = M.newRun('CR');
  s.bodies[0].kind = 'crumble';
  for (let i = 0; i < 12; i++) M.tick(s, { down: true });
  M.tick(s, { down: false });
  const b = s.bodies[0];
  eq(s.jumps, 1, 'jump');
  ok(b.left, 'left flag not set');
  let n = 0, halfRem = null;
  while (!b.dead && n < 400) { M.tick(s, { down: false }); n++; if (n === 90) halfRem = b.rem; if (s.over) break; }
  ok(b.dead, 'never died (ran ' + n + ', rem=' + b.rem + ', over=' + s.over + ')');
  near(n * DT, 1.5, 2 * DT, 'time to dead');
  near(halfRem, b.r / 2, 0.5, 'rem at 0.75 s');
});

test('tide: 22 px/s at t=0, accelerates, capped 60, tideScale multiplies', () => {
  let s = M.newRun('TD');
  const y0 = s.tideY; M.tick(s, { down: false });
  near((y0 - s.tideY) / DT, 22, 0.1, 'initial rate');
  s = M.newRun('TD');
  s.tick = 100 * 120 - 1; let y = s.tideY; M.tick(s, { down: false });
  near((y - s.tideY) / DT, 42, 0.1, 'rate at t=100');
  s = M.newRun('TD');
  s.tick = 240 * 120 - 1; y = s.tideY; M.tick(s, { down: false });
  near((y - s.tideY) / DT, 60, 1e-6, 'capped rate');
  s = M.newRun('TD', { tideScale: 1.25 });
  y = s.tideY; M.tick(s, { down: false });
  near((y - s.tideY) / DT, 22 * 1.25, 0.2, 'tideScale 1.25');
  s = M.newRun('TD'); y = s.tideY;
  for (let i = 0; i < 600; i++) M.tick(s, { down: false });
  near(y - s.tideY, 112.5, 1, "integrated 5 s");
});

test('lost: fires after 1.2 s outside every attractor range', () => {
  const s = M.newRun('LO');
  const r = s.runner;
  r.mode = 'air'; r.x = 1000; r.y = -100; r.vx = 0; r.vy = 0; r.lostT = 0;
  let n = 0;
  while (!s.over && n < 400) { M.tick(s, { down: false }); n++; if (n === 140) ok(!s.over, 'fired too early at 140 ticks'); }
  eq(s.cause, 'lost', 'cause');
  near(n * DT, 1.2, 2 * DT, 'time to lost');
});

test('medal bands', () => {
  const cases = [[0, ''], [149.9, ''], [150, 'Bronze'], [399.9, 'Bronze'], [400, 'Silver'], [799.9, 'Silver'],
    [800, 'Gold'], [1499.9, 'Gold'], [1500, 'Moon'], [5000, 'Moon']];
  for (const [h, m] of cases) eq(M.medal(h), m, 'medal(' + h + ')');
  eq(M.dailySeed('20261118'), 'D20261118', 'dailySeed');
});

function jumpSpeed(sinceLand, charge) {
  const s = M.newRun('CH');
  const r = s.runner;
  r.vt = 0; r.sinceLand = sinceLand; r.charging = true; r.charge = charge; s.held = true;
  M.tick(s, { down: false });
  eq(s.jumps, 1, 'jump happened');
  return { sp: Math.hypot(r.vx, r.vy), jl: s.jumpLog[0], s };
}
test('chain bonus x1.10 inside 0.08 s window only', () => {
  const ch = 0.2, v = 200 + (ch / 0.45) * 180;
  const a = jumpSpeed(0.05, ch), n = jumpSpeed(1, ch), edge = jumpSpeed(0.08, ch), out = jumpSpeed(0.09, ch);
  ok(a.jl.chain, 'chain flag inside window'); eq(a.s.chain, 1, 's.chain');
  ok(!n.jl.chain, 'no chain flag far'); ok(!out.jl.chain, 'chain flag at 0.09 s');
  ok(edge.jl.chain, 'edge 0.08 should chain');
  near(a.sp - n.sp, 0.10 * v, 0.5, 'speed delta (want 10% of ' + v.toFixed(1) + ')');
  near(out.sp, n.sp, 0.5, 'outside window speed unchanged');
  // v range: min and max charge
  const lo = jumpSpeed(1, 0), hi = jumpSpeed(1, 0.45), over = jumpSpeed(1, 0.45);
  near(hi.sp - lo.sp, 180, 2, 'JUMP_RANGE');
  near(over.sp, hi.sp, 1e-9, 'determinism');
});

const fails = results.filter(r => !r[1]);
console.log('\n' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exit(fails.length ? 1 : 0);
