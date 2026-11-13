import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { wheelSlices, courseWheel, spinResult, stopLanding, stopExtra, stopDist, wheelSpeed, wheelArc, sliceAt, wheelWidths, effortOdds, meanGain } from '../js/core/training.js';
import { TRAIN2 } from '../js/data/training.js';
import { makeRng } from '../js/core/rng.js';
const WS = TRAIN2.wheelStop, sum = (a) => a.reduce((x, y) => x + y, 0);
const rollMean = (e) => meanGain(effortOdds(e));

test('tuning: speed B W0 24, jackpot slice 0.35 (Push and course 0.48 after NUMBERS retune), wobble 0.6, no aim key', () => {
  assert.equal(WS.W0, 24); assert.equal(WS.J, 0.6); assert.equal(WS.D, 1); assert.equal(WS.COAST, 6); assert.equal(WS.STOP_FROM, 1);
  for (const e of ['easy', 'normal', 'push']) { const w = wheelSlices(e); assert.equal(w.widths[0], e === 'push' ? 0.48 : 0.35); assert.equal(w.widths.length, 10); assert.equal('aim' in w, false); assert.equal(TRAIN2.wheel[e].aim, undefined); }
  assert.equal(courseWheel().widths[0], 0.48); assert.equal('aim' in courseWheel(), false);
  const n = wheelSlices('normal'); assert.deepEqual(n.slices, [5, 2, 1, 3, 1, 1, 3, 1, 1, 2]); assert.ok(Math.abs(n.C - 8.55) < 1e-9);
});
test('stop is smooth: start speed of the ease equals the wheel speed, ends at base+dist+e', () => {
  for (const t of [1, 3.5, 6]) { const d = stopDist(t), h = 1e-6, v = (stopExtra(d, 0.4, h) - stopExtra(d, 0.4, 0)) / h; assert.ok(Math.abs(v - wheelSpeed(t)) < 1e-3, t + ' ' + v); assert.ok(Math.abs(stopExtra(d, 0.4, 1) - (d + 0.4)) < 1e-12); assert.equal(stopExtra(d, 0.4, 0), 0); }
  assert.ok(Math.abs(wheelArc(3.5) - 24 * 3 * (1 - Math.exp(-3.5 / 3))) < 1e-12);
});
test('result is the slice under the landing position (no snap, no hidden aim)', () => {
  const w = wheelSlices('normal'), rng = makeRng('land');
  for (let i = 0; i < 300; i++) {
    const stop = { t: 1 + Math.random() * 5, phi: Math.random() * w.C, e: (Math.random() * 2 - 1) * 0.6 };
    const L = stopLanding(w, stop), r = spinResult(rng, w, stop);
    assert.equal(r.index, L.index); assert.equal(r.index, sliceAt(w, L.base + L.dist + L.e)); assert.equal(r.gain, w.slices[r.index]);
  }
  // a landing 0.001 inside the jackpot's far edge is the jackpot; 0.001 past it is the next slice
  assert.equal(sliceAt(w, 0.349), 0); assert.equal(sliceAt(w, 0.351), 1); assert.equal(sliceAt(w, w.C + 0.1), 0);
});
test('deterministic given the rng seed; taps outside 1..6 are clamped; legacy booleans work', () => {
  const w = wheelSlices('push');
  assert.deepEqual(spinResult(makeRng('a'), w, true), spinResult(makeRng('a'), w, true));
  assert.deepEqual(spinResult(makeRng('a'), w, { t: 3.5 }), spinResult(makeRng('a'), w, { t: 3.5 }));
  assert.equal(spinResult(makeRng('a'), w, { t: 0.1, phi: 1, e: 0 }).t, 1); assert.equal(spinResult(makeRng('a'), w, { t: 99, phi: 1, e: 9 }).e, 0.6);
  const r = makeRng('b'); const before = r.random(); const r2 = makeRng('b'); spinResult(r2, w); assert.notEqual(r2.random(), before); // draws 5, so the next draw differs from the first
  assert.deepEqual(wheelWidths({ slices: w.slices, jackpotIndex: 0 }), w.widths);
  assert.deepEqual(wheelWidths({ slices: courseWheel().slices, jackpotIndex: 0 }), courseWheel().widths);
});
test('the player decides: early tap goes further than a late tap', () => {
  const w = wheelSlices('normal'); const a = stopLanding(w, { t: 1.2, phi: 0, e: 0 }), b = stopLanding(w, { t: 5.5, phi: 0, e: 0 });
  assert.ok(a.dist > b.dist * 3);
});
function mc(w, mode, N, seed) {
  const rng = makeRng(seed); let tot = 0, jp = 0;
  for (let i = 0; i < N; i++) { const r = spinResult(rng, w, mode); tot += r.gain; if (r.jackpot) jp++; }
  return { mean: tot / N, jp: jp / N };
}
test('Spotlight Normal: random about 1.29x roll, careful about 1.57x and 17% jackpot (SPEC option B)', () => {
  const w = wheelSlices('normal'), roll = rollMean('normal'), r = mc(w, false, 40000, 'r'), c = mc(w, true, 40000, 'c');
  assert.ok(r.mean / roll > 1.2 && r.mean / roll < 1.4, 'random ' + r.mean / roll); assert.ok(r.jp > 0.03 && r.jp < 0.09, 'rjp ' + r.jp);
  assert.ok(c.mean / roll > 1.42 && c.mean / roll < 1.72, 'careful ' + c.mean / roll); assert.ok(c.jp > 0.12 && c.jp < 0.24, 'cjp ' + c.jp);
  assert.ok(c.mean > r.mean);
});
test('Easy and Push careful beat random; every slice pays at least +1; course careful beats random', () => {
  for (const e of ['easy', 'push']) { const w = wheelSlices(e), r = mc(w, false, 20000, e + 'r'), c = mc(w, true, 20000, e + 'c'); assert.ok(c.mean > r.mean * 1.05, e); assert.ok(Math.min(...w.slices) >= 1); }
  const cw = courseWheel(); assert.ok(mc(cw, true, 20000, 'cc').mean > mc(cw, false, 20000, 'cr').mean * 1.05);
});
test('coach lifts slice values only; widths and count unchanged', () => {
  const a = wheelSlices('normal', 0), b = wheelSlices('normal', 21); assert.deepEqual(a.widths, b.widths); assert.equal(b.slices.filter((v) => v === 1).length, 2);
});
test('wheel-view: no aim, no natural landing branch, stop timestamp, tick, reduced motion', () => {
  const src = fs.readFileSync(new URL('../js/ui/wheel-view.js', import.meta.url), 'utf8');
  assert.equal(/\.aim\b|natural|WIN0|WIN1|inWin/.test(src), false); assert.ok(/timeStamp/.test(src)); assert.ok(/prefers-reduced-motion/.test(src)); assert.ok(/stopExtra/.test(src)); assert.ok(/stopLanding/.test(src));
  assert.equal(/[^a-zA-Z]ico\(/.test(src.replace(/icoDeco\(/g, '')), false);
});
