import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { wheelSlices, courseWheel, spinResult, stopLanding, stopExtra, stopDist, wheelSpeed, wheelArc, sliceAt, wheelWidths, effortOdds, meanGain } from '../js/core/training.js';
import { TRAIN2 } from '../js/data/training.js';
import { makeRng } from '../js/core/rng.js';
import { tickAt } from '../js/core/wheel-pulse.js';
const WS = TRAIN2.wheelStop, sum = (a) => a.reduce((x, y) => x + y, 0);
const rollMean = (e) => meanGain(effortOdds(e));

test('tuning: Spotlight/Course physics W0 36, D 2, J 1.2 (CONTRACT-A); COAST and STOP_FROM retired; rings from the slice tables, no aim key', () => {
  assert.equal(WS.W0, 36); assert.equal(WS.J, 1.2); assert.equal(WS.D, 2); assert.equal(WS.STOP_FROM, 0.35, "legacy-only"); assert.ok(WS.COAST > 1e6, "legacy-only, no auto-stop");
  for (const e of ['easy', 'normal', 'push']) { const w = wheelSlices(e); assert.equal(w.widths[0], 1.2); assert.equal(w.widths.length, 10); assert.equal('aim' in w, false); }
  assert.equal(courseWheel().widths[0], 1.2); assert.equal('aim' in courseWheel(), false);
  const n = wheelSlices('normal'); assert.deepEqual(n.slices, [3, 1, 1, 1.5, 1, 1, 1.2, 1, 1, 1]); assert.ok(Math.abs(n.C - 10) < 1e-9);
});
test('stop is smooth: start speed of the ease equals the wheel speed, ends at base+dist+e', () => {
  for (const t of [1, 3.5, 6, 9]) { const d = stopDist(t), h = 1e-6, v = (stopExtra(d, 0.4, h) - stopExtra(d, 0.4, 0)) / h; assert.ok(Math.abs(v - wheelSpeed(t)) < 1e-3, t + ' ' + v); assert.ok(Math.abs(stopExtra(d, 0.4, WS.D) - (d + 0.4)) < 1e-12); assert.equal(stopExtra(d, 0.4, 0), 0); }
  assert.ok(Math.abs(wheelArc(3.5) - 36 * 3 * (1 - Math.exp(-3.5 / 3))) < 1e-12);
});
test('result is the slice under the landing position (no snap, no hidden aim)', () => {
  const w = wheelSlices('normal'), rng = makeRng('land');
  for (let i = 0; i < 300; i++) {
    const stop = { t: 0.35 + Math.random() * 8, phi: Math.random() * w.C, e: (Math.random() * 2 - 1) * 1.2 };
    const L = stopLanding(w, stop), r = spinResult(rng, w, stop);
    assert.equal(r.index, L.index); assert.equal(r.index, sliceAt(w, L.base + L.dist + L.e)); assert.equal(r.gain, w.slices[r.index]);
  }
  // a landing 0.001 inside the gold's far edge is the gold; 0.001 past it is the next slice
  assert.equal(sliceAt(w, 1.199), 0); assert.equal(sliceAt(w, 1.201), 1); assert.equal(sliceAt(w, w.C + 0.1), 0);
});
test('deterministic given the rng seed; no upper clamp on STOP time (the wheel spins until STOP); legacy booleans work', () => {
  const w = wheelSlices('push');
  assert.deepEqual(spinResult(makeRng('a'), w, true), spinResult(makeRng('a'), w, true));
  assert.deepEqual(spinResult(makeRng('a'), w, { t: 3.5 }), spinResult(makeRng('a'), w, { t: 3.5 }));
  assert.equal(spinResult(makeRng('a'), w, { t: 0.1, phi: 1, e: 0 }).t, 0.1); assert.equal(spinResult(makeRng('a'), w, { t: 99, phi: 1, e: 9 }).t, 99); assert.equal(spinResult(makeRng('a'), w, { t: 99, phi: 1, e: 9 }).e, 1.2);
  const r = makeRng('b'); const before = r.random(); const r2 = makeRng('b'); spinResult(r2, w); assert.notEqual(r2.random(), before); // draws 5, so the next draw differs from the first
  assert.deepEqual(wheelWidths({ slices: w.slices, jackpotIndex: 0 }), w.widths);
  assert.deepEqual(wheelWidths({ slices: courseWheel().slices, jackpotIndex: 0 }), courseWheel().widths);
});
test('the player decides: early tap goes further than a late tap', () => {
  // SPEC 2c pulse: the wheel slows to 3.8 s, then ramps back to W0 by 6.0 s (5.5 s is fast again, so 'late' = the slow end of the glow, 3.8 s)
  const w = wheelSlices('normal'); const a = stopLanding(w, { t: 0.35, phi: 0, e: 0 }), b = stopLanding(w, { t: 3.8, phi: 0, e: 0 }), r = stopLanding(w, { t: 5.5, phi: 0, e: 0 });
  assert.ok(a.dist > b.dist * 3); assert.ok(r.dist > b.dist * 2, 'ramp after 3.8 s');
  for (const t of [0.35, 2, 3.8, 4.5, 5.9, 6, 9.5]) assert.ok(Math.abs(stopLanding(w, { t, phi: 0.3, e: 0 }).pos - (0.3 + tickAt(t, w.phys))) < 1e-9, 'landing = phi + tickAt(t) at ' + t);
});
function mc(w, mode, N, seed) {
  const rng = makeRng(seed); let tot = 0, jp = 0;
  for (let i = 0; i < N; i++) { const r = spinResult(rng, w, mode); tot += r.gain; if (r.jackpot) jp++; }
  return { mean: tot / N, jp: jp / N };
}
test('Spotlight: random 1.29 (SPEC 1.292), careful above random, gold about 12% random / 38% careful', () => {
  const w = wheelSlices('normal'), r = mc(w, false, 40000, 'r'), c = mc(w, true, 40000, 'c');
  assert.ok(Math.abs(r.mean - 1.292) < 0.03, 'random ' + r.mean); assert.ok(Math.abs(r.jp - 0.12) < 0.015, 'rjp ' + r.jp);
  assert.ok(c.mean / r.mean > 1.25 && c.mean / r.mean < 1.5, 'careful ' + c.mean / r.mean); assert.ok(c.jp > 0.3 && c.jp < 0.45, 'cjp ' + c.jp);
});
test('Easy and Push give the same ring; every slice pays at least x1; course careful beats random', () => {
  for (const e of ['easy', 'push']) { const w = wheelSlices(e); assert.deepEqual(w, wheelSlices('normal')); assert.ok(Math.min(...w.slices) >= 1); }
  const cw = courseWheel(); assert.ok(mc(cw, true, 20000, 'cc').mean > mc(cw, false, 20000, 'cr').mean * 1.05);
});
test('coach step does not change the ring (the +1 -> +2 coach lift is retired with the effort rings)', () => {
  const a = wheelSlices('normal', 0), b = wheelSlices('normal', 21); assert.deepEqual(a, b);
});
test('wheel-view: no aim, no natural landing branch, stop timestamp, tick, no reduced-motion path (SPEC 2e)', () => {
  const src = fs.readFileSync(new URL('../js/ui/wheel-view.js', import.meta.url), 'utf8');
  assert.equal(/\.aim\b|natural|WIN0|WIN1|inWin/.test(src), false); assert.ok(/timeStamp/.test(src)); assert.equal(/prefers-reduced-motion|reducedNow|\breduced\b/.test(src), false); assert.ok(/stopExtra/.test(src));
  assert.ok(/pulseStop\(P, phi, t, e, cum, C, RESPIN\)/.test(src), 'pulse landing: phi + tickAt(t) + e'); assert.equal(/stopLanding|COAST|STOP_FROM/.test(src), false, 'no old coast landing');
  assert.equal(/[^a-zA-Z]ico\(/.test(src.replace(/icoDeco\(/g, '')), false);
});
