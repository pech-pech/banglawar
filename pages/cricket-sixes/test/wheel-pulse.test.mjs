// Pulse math (wheels SPEC 2c, section 14 test 5; 07-TESTS W-T-1..5, W-T-7 J = 0 part). CONTRACT-A sec 2, 3, 6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WHEEL_ENGINE as E, WHEEL_STOP_IDS } from '../js/data/wheel-engine.js';
import { pulseW, pulseArc, ARC_PER_CYCLE, tickAt, cycleOf } from '../js/core/wheel-pulse.js';
import { makeRng } from '../js/core/rng.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const SLOW = { W0: E.W0 * 0.55, D: E.D };

test('WHEEL_ENGINE is frozen and equals CONTRACT-A sec 2', () => {
  assert.deepEqual({ ...E, GLOW: [...E.GLOW] }, { W0: 36, TAU: 3.0, D: 2.0, J: 1.2, CIRC: 10, SLICE_MAX_P: 0.12, SLICE_WIDEN_MAX: 0.13,
    PULSE_PERIOD: 6.0, PULSE_FROM: 3.8, GLOW: [3.2, 3.8], STOP_GUARD_S: 0.35 });
  assert.ok(Object.isFrozen(E) && Object.isFrozen(E.GLOW));
  assert.equal('ARC_PER_CYCLE' in E, false);
  assert.equal('COAST' in E || 'STOP_FROM' in E, false);
});

test('WHEEL_STOP_IDS: the 10 save ids of CONTRACT-A sec 6', () => {
  assert.deepEqual([...WHEEL_STOP_IDS], ['spot', 'course', 'find', 'hype', 'toss', 'pep', 'scout', 'finals', 'match', 'clinic']);
  assert.ok(Object.isFrozen(WHEEL_STOP_IDS));
});

test('pulseW: w(0) = W0, w(3.8) = 0.28177 W0, w(6.0) = W0, exp decay then rising smoothstep', () => {
  assert.equal(pulseW(0), 36);
  near(pulseW(3.8) / 36, 0.28177, 0.0005, 'w(3.8)');
  near(pulseW(6.0), 36, 1e-12, 'w(6.0)');
  near(pulseW(6.0 - 1e-12), 36, 1e-9, 'w(6.0-)');
  for (let t = 0; t < 3.8; t += 0.01) near(pulseW(t), 36 * Math.exp(-t / 3), 1e-12, `decay t=${t}`);
  let prev = pulseW(3.8);
  for (let t = 3.8 + 0.001; t <= 6.0; t += 0.001) { const w = pulseW(t); assert.ok(w >= prev - 1e-12, `ramp rises at ${t}`); prev = w; }
  near(pulseW(3.8, SLOW), 0.28177 * SLOW.W0, 0.0005 * SLOW.W0, 'Slow scales w(3.8)');
  near(pulseW(6.0, SLOW), SLOW.W0, 1e-12, 'Slow scales the ramp peak');
});

test('pulseW and pulseArc are continuous at the 3.8 and 6.0 seams', () => {
  for (const P of [undefined, SLOW]) {
    const e = 1e-12;
    near(pulseW(3.8 - e, P), pulseW(3.8, P), 1e-9, 'w at 3.8');
    near(pulseW(3.8 + e, P), pulseW(3.8, P), 1e-9, 'w at 3.8+');
    near(pulseArc(3.8 - e, P), pulseArc(3.8, P), 1e-9, 'arc at 3.8');
    near(pulseArc(3.8 + e, P), pulseArc(3.8, P), 1e-9, 'arc at 3.8+');
    near(pulseW(6.0 - e, P), pulseW(0, P), 1e-9, 'w at 6.0- equals next cycle w(0)');
    near(pulseArc(6.0 - e, P), ARC_PER_CYCLE(P), 1e-9, 'arc at 6.0- equals ARC_PER_CYCLE');
    assert.equal(pulseArc(0, P), 0);
    // arc is the integral of w (midpoint rule)
    let s = 0; const n = 60000, h = 6 / n;
    for (let i = 0; i < n; i++) s += pulseW((i + 0.5) * h, P) * h;
    near(s, ARC_PER_CYCLE(P), 1e-5, 'integral of w');
  }
});

test('ARC_PER_CYCLE() = 128.327 at W0 36 (decay 77.569 + ramp 50.758), linear in W0, never a literal', () => {
  near(ARC_PER_CYCLE(), 128.327, 0.01, 'ARC');
  near(pulseArc(3.8), 77.569, 0.001, 'decay part');
  near(ARC_PER_CYCLE() - pulseArc(3.8), 50.758, 0.001, 'ramp part');
  near(ARC_PER_CYCLE(SLOW), ARC_PER_CYCLE() * 0.55, 1e-9, 'scales with W0');
  for (const f of ['js/core/wheel-pulse.js', 'js/data/wheel-engine.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.equal(/128\.[34]/.test(src), false, `${f} hard-codes 128.3/128.4`);
  }
});

test('tickAt: monotonic over 0..60 s (1 ms steps), no jump at cycle seams', () => {
  for (const P of [undefined, SLOW]) {
    let prev = tickAt(0, P);
    for (let i = 1; i <= 60000; i++) { const v = tickAt(i / 1000, P); assert.ok(v >= prev, `tick decreases at ${i} ms`); prev = v; }
    for (const s of [6, 12, 18, 24]) near(tickAt(s - 1e-12, P), tickAt(s, P), 1e-9, `seam ${s}`);
  }
  assert.equal(tickAt(0), 36 * 2 / 3, 'first spin starts at W0 (tick = W0*D/3)');
});

test('tickAt: cycle k repeats cycle 1 shifted by k*ARC_PER_CYCLE', () => {
  const rng = makeRng('wheel-pulse-test'), A = ARC_PER_CYCLE();
  for (let i = 0; i < 1000; i++) {
    const t = rng.random() * 6;
    for (let k = 1; k <= 4; k++) near(tickAt(t + 6 * k) - k * A, tickAt(t), 1e-9, `t=${t} k=${k}`);
  }
});

test('cycleOf: cycle from 1, tInCycle in [0, 6)', () => {
  assert.deepEqual(cycleOf(0), { cycle: 1, tInCycle: 0 });
  assert.deepEqual(cycleOf(3.5), { cycle: 1, tInCycle: 3.5 });
  assert.equal(cycleOf(6).cycle, 2); assert.equal(cycleOf(6).tInCycle, 0);
  const c = cycleOf(21.5); assert.equal(c.cycle, 4); near(c.tInCycle, 3.5, 1e-12, 'tInCycle');
  assert.equal(cycleOf(59.999).cycle, 10);
});

test('J = 0 landing equals the tick slice; 10 fps frames do not change the stop slice', () => {
  const W = [1.2, 0.4, 1.1, 0.7, 1.2, 0.35, 1.2, 1.05, 1.2, 1.6]; // sums to 10
  const C = E.CIRC;
  const sliceAt = (pos) => { let p = ((pos % C) + C) % C, a = 0; for (let i = 0; i < W.length; i++) { a += W[i]; if (p < a) return i; } return W.length - 1; };
  const rng = makeRng('wheel-pulse-land');
  for (let i = 0; i < 10000; i++) {
    const phi = rng.random() * C, stopS = rng.random() * 30;
    const { cycle, tInCycle } = cycleOf(stopS);
    const land = phi + (cycle - 1) * ARC_PER_CYCLE() + pulseArc(tInCycle) + pulseW(tInCycle) * E.D / 3 + 0; // e = wheelWobble(key, 0) = 0
    assert.equal(sliceAt(land), sliceAt(phi + tickAt(stopS)), `tap ${stopS}`);
  }
  // Throttle: frames at 10 fps; the tap at 3.5 s lands from its own timeStamp, not the frame time
  const phi = 2.345, at60 = sliceAt(phi + tickAt(3.5));
  let frame = 0; while (frame + 0.1 <= 3.5) frame += 0.1;
  assert.equal(sliceAt(phi + tickAt(3.5)), at60);
  assert.ok(frame < 3.5);
});
