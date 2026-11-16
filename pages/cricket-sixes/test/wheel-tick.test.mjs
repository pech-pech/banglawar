// A2.6 tick honesty (SPEC test 7 / W-T-7, W-T-8, W-T-9): pure math, 8 wheel rings + the match ring.
// For 10,000 seeded taps per ring with J = 0, the slice under the tick at STOP equals the landed slice, also on slice
// boundaries and across the ring wrap. Throttled to 10 fps the landing still comes from the event time, never the frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_ENGINE as E } from '../js/data/wheel-engine.js';
import { tickAt } from '../js/core/wheel-pulse.js';
import { pulseStop, spinClock } from '../js/ui/wheel-view.js';
import { wheelWobble, wobbleKey } from '../js/core/wheel-wobble.js';
import { makeRng } from '../js/core/rng.js';
import { buildSegments } from '../js/core/wheelmatch.js';

const C = E.CIRC, N_TAPS = 10000;
const mod = (x) => { const u = x % C; return u < 0 ? u + C : u; };

// ---- rings: widths in rim units from SPEC sections 3-10 (post cap split), sum 10 ----
const rep = (n, w) => Array.from({ length: n }, () => w);
// SPEC 3 Spotlight (12, 10.5714 x2, 8, 10.5714 x2, 6, 10.5714 x3), 4 Course (12, 10.4286 x7, 8, 3.5 x2),
// 5 Find (8 / 18 / 26 %), 6 Hype (NUTS 10, MED/LOW 11.6667 x3, HIGH 10 x2), 7 Toss, 9 Scout (10 x 10 %),
// 8 Pep (10 slice 9.6, eleven 8.2182), 10 Finals (Medal 4.0, eleven 8.7273).
const RINGS = {
  spot: [1.2, 74 / 70, 74 / 70, 0.8, 74 / 70, 74 / 70, 0.6, 74 / 70, 74 / 70, 74 / 70],
  course: [1.2, 73 / 70, 0.8, 73 / 70, 0.35, 73 / 70, 0.35, 73 / 70, 73 / 70, 73 / 70, 73 / 70],
  find8: [0.4, ...rep(4, 1.15), 0.4, ...rep(4, 1.15)],
  find18: [0.9, ...rep(4, 1.025), 0.9, ...rep(4, 1.025)],
  find26: [1.2, ...rep(3, 74 / 90), 1.2, ...rep(3, 74 / 90), 0.2, ...rep(3, 74 / 90)],
  hype: [1.0, 7 / 6, 7 / 6, 7 / 6, 1.0, 7 / 6, 7 / 6, 7 / 6, 1.0],
  toss: rep(10, 1),
  pep: [...rep(7, 90.4 / 110), 0.96, ...rep(4, 90.4 / 110)],
  scout: rep(10, 1),
  finals: [0.4, ...rep(11, 96 / 110)],
};

// Match ring: the real builder on a seeded synthetic over (no UI, no ball PRNG).
{
  const r = makeRng('wheel-tick|match-samples');
  const outs = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [6, 0], [0, 1], [1, 1], [4, 1], [2, 2]];
  const samples = Array.from({ length: 2000 }, (_, i) => {
    const [runs, wk] = outs[Math.floor(Math.pow(r.random(), 1.6) * outs.length)];
    return { runs, wk, end: '', key: `${runs}w${wk}#${i % 7}` };
  });
  const segs = buildSegments(samples, { side: 'bowl' });
  RINGS.match = segs.map((g) => g.width);
}

const startsOf = (ws) => { let x = 0; return ws.map((w) => { const s = x; x += w; return s; }); };
// Slice under a rim position: linear scan (path A).
function sliceScan(ws, pos) {
  const u = mod(pos); let x = 0;
  for (let i = 0; i < ws.length; i++) { x += ws[i]; if (u < x) return i; }
  return ws.length - 1;
}
// Slice under a rim position: binary search on starts (path B, independent of A).
function sliceBin(starts, pos) {
  const u = mod(pos); let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= u) lo = m; else hi = m - 1; }
  return lo;
}
// ---- Independent reference (CONTRACT-A sec 3 written out here, nothing imported from wheel-pulse.js) ----
// speed: t < 3.8: 36 e^(-t/3); else w38 + (36 - w38) s(x), x = (t - 3.8)/2.2, s = x^2 (3 - 2x), w38 = 36 e^(-3.8/3).
// arc in a cycle: t < 3.8: 36*3 (1 - e^(-t/3)); else decay(3.8) + w38 u + (36 - w38) 2.2 (x^3 - x^4/2), u = t - 3.8.
// tick = k ARC + arc(t) + speed(t) D/3 with D = 2, k = floor(elapsed/6), ARC = decay(3.8) + 2.2 (w38 + (36 - w38)/2).
const R_W0 = 36, R_TAU = 3, R_D = 2, R_FROM = 3.8, R_PER = 6, R_RAMP = R_PER - R_FROM;
const R_W38 = R_W0 * Math.exp(-R_FROM / R_TAU), R_DECAY38 = R_W0 * R_TAU * (1 - Math.exp(-R_FROM / R_TAU));
const R_ARC = R_DECAY38 + R_RAMP * (R_W38 + (R_W0 - R_W38) / 2);
const refW = (t) => (t < R_FROM ? R_W0 * Math.exp(-t / R_TAU) : (() => { const x = (t - R_FROM) / R_RAMP; return R_W38 + (R_W0 - R_W38) * x * x * (3 - 2 * x); })());
const refArc = (t) => (t < R_FROM ? R_W0 * R_TAU * (1 - Math.exp(-t / R_TAU)) : (() => { const u = t - R_FROM, x = u / R_RAMP; return R_DECAY38 + R_W38 * u + (R_W0 - R_W38) * R_RAMP * (x ** 3 - x ** 4 / 2); })());
const refTick = (el) => { const k = Math.floor(el / R_PER), t = el - k * R_PER; return k * R_ARC + refArc(t) + refW(t) * R_D / 3; };
// Landing the way the view does it for a tap: spinClock (event time) -> pulseStop (real STOP record), on a ring given by its widths.
const cumOf = (ws) => { const c = [0]; for (const w of ws) c.push(c[c.length - 1] + w); return c; };
function realStop(ws, cum, phi, stopS, e = 0) {
  const clk = spinClock(), spinTs = 1234567.25; // ms, arbitrary event timestamps
  clk.start(spinTs);
  const t = clk.tap(spinTs + stopS * 1000);
  assert.notEqual(t, null);
  return pulseStop(undefined, phi, t, e, cum, C).stop;
}
// Numeric guard that refArc really is the integral of refW (Simpson), so the reference is not a copy-paste of a bug.
function simpson(f, a, b, n = 4000) { const h = (b - a) / n; let s = f(a) + f(b); for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; }

test('reference pulse is the true integral of the speed curve and matches the engine constants', () => {
  assert.equal(R_W0, E.W0); assert.equal(R_TAU, E.TAU); assert.equal(R_D, E.D); assert.equal(R_FROM, E.PULSE_FROM); assert.equal(R_PER, E.PULSE_PERIOD);
  for (const t of [0.5, 1.7, 3.5, 3.8, 4.4, 5.9, 6]) assert.ok(Math.abs(simpson(refW, 0, t) - refArc(t)) < 1e-6, `arc at ${t}`);
  assert.ok(Math.abs(simpson(refW, 0, 6) - R_ARC) < 1e-6);
  assert.ok(Math.abs(R_ARC - 128.327) < 5e-3, `ARC ${R_ARC}`);
  for (const el of [0.35, 1, 3.5, 6, 9.25, 17.9]) assert.ok(Math.abs(tickAt(el) - refTick(el)) < 1e-9, `tickAt vs reference at ${el}`);
});

test('rings: 8 SPEC wheels + match ring sum to 10 and fit the width cap', () => {
  for (const [name, ws] of Object.entries(RINGS)) {
    const sum = ws.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - C) < 0.001, `${name} sums ${sum}`);
    assert.ok(Math.max(...ws) <= E.SLICE_MAX_P * C + 1e-9, `${name} widest ${Math.max(...ws)}`);
  }
  assert.ok(RINGS.match.length >= 5, 'match ring built');
});

test('J = 0: wobble is exactly zero (the honest-tick precondition)', () => {
  const key = wobbleKey({ seed: 'wt', season: { n: 1 } }, 'spot', 0, 0);
  assert.equal(wheelWobble(key, 0) + 0, 0);
  const w = wheelWobble(key, E.J); assert.ok(Math.abs(w) <= E.J);
});

for (const [name, ws] of Object.entries(RINGS)) {
  const starts = startsOf(ws), cum = cumOf(ws);

  test(`${name}: ${N_TAPS} taps, slice under the tick at STOP equals the landed slice (J = 0)`, () => {
    const r = makeRng(`wheel-tick|${name}`);
    let bad = 0, wraps = 0;
    for (let i = 0; i < N_TAPS; i++) {
      const phi = r.random() * C, stopS = E.STOP_GUARD_S + r.random() * 24; // up to 4 cycles
      const under = sliceBin(starts, phi + refTick(stopS)); // what the player sees under the tick at STOP (independent maths)
      const st = realStop(ws, cum, phi, stopS, wheelWobble(`wt|${name}|${i}`, 0));
      if (under !== st.sliceId) bad++;
      assert.equal(st.cycle, Math.floor(stopS / R_PER) + 1);
      assert.ok(Math.abs(st.tInCycle - (stopS - Math.floor(stopS / R_PER) * R_PER)) < 1e-9);
      if (Math.floor((phi + refTick(stopS)) / C) !== Math.floor((phi + refTick(stopS - 0.2)) / C)) wraps++;
    }
    assert.equal(bad, 0);
    assert.ok(wraps > 100, `ring wrap crossed in the sample (${wraps})`);
  });

  test(`${name}: taps on slice boundaries and across the ring wrap land the slice under the tick`, () => {
    const r = makeRng(`wheel-tick|edge|${name}`);
    let checked = 0;
    for (let i = 0; i < 500; i++) {
      const phi = r.random() * C, b = starts[i % starts.length]; // includes boundary 0 = last slice to first
      // find stopS in [0.35, 20] where the unwrapped tick first reaches phi + tick = b + m*C (monotone, bisect)
      const t0 = E.STOP_GUARD_S, t1 = 20, base = phi + refTick(t0);
      const m = Math.ceil((base - b) / C + 1e-9) + Math.floor(r.random() * 3);
      const target = b + m * C;
      if (target > phi + refTick(t1)) continue;
      let lo = t0, hi = t1;
      for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (phi + refTick(mid) < target) lo = mid; else hi = mid; }
      const prev = (sliceBin(starts, b) + ws.length - 1) % ws.length;
      for (const [dt, want] of [[-1e-6, prev], [1e-6, sliceBin(starts, b)]]) {
        const t = hi + dt;
        assert.equal(realStop(ws, cum, phi, t, 0).sliceId, want, `${name} boundary ${b} dt ${dt} i ${i} t ${t} pos ${mod(phi + refTick(t))} m ${m}`);
      }
      checked++;
    }
    assert.ok(checked > 300, `edge cases checked ${checked}`);
  });

  test(`${name}: 10 fps frame sampling, landing comes from the event time not the frame`, () => {
    const r = makeRng(`wheel-tick|fps|${name}`);
    const FRAME = 0.1; let differs = 0;
    for (let i = 0; i < N_TAPS; i++) {
      const phi = r.random() * C, stopS = E.STOP_GUARD_S + r.random() * 18;
      const nextFrame = (Math.floor(stopS / FRAME) + 1) * FRAME, lastFrame = Math.floor(stopS / FRAME) * FRAME;
      const fromEvent = realStop(ws, cum, phi, stopS, 0).sliceId;
      assert.equal(fromEvent, sliceBin(starts, phi + refTick(stopS)), 'landing = slice under the tick at the event time');
      // the frame the player last saw (10 fps) is allowed to be a different slice; the landing must not follow it
      const shownLast = sliceBin(starts, phi + refTick(lastFrame)), shownNext = sliceBin(starts, phi + refTick(nextFrame));
      if (fromEvent !== shownLast || fromEvent !== shownNext) differs++;
    }
    assert.ok(differs > 50, `non-vacuous: frame sampling disagrees with the event slice on ${differs} taps`);
  });
}

test('W-T-8 shape: tap at 3.500 s with next frame at 3.540 s lands the slice under the tick at 3.500 s', () => {
  for (const [name, ws] of Object.entries(RINGS)) {
    const r = makeRng(`wheel-tick|w8|${name}`), starts = startsOf(ws), cum = cumOf(ws); let seen = 0;
    for (let i = 0; i < 2000; i++) {
      const phi = r.random() * C;
      const a = sliceBin(starts, phi + refTick(3.5)), b = sliceBin(starts, phi + refTick(3.54));
      assert.equal(realStop(ws, cum, phi, 3.5, 0).sliceId, a);
      if (a !== b) seen++;
    }
    assert.ok(seen > 0, `${name}: some phases differ between 3.500 and 3.540`);
  }
});
