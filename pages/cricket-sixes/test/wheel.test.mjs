import test from 'node:test'; import assert from 'node:assert/strict';
import { wheelSlices, courseWheel, spinResult, effortOdds, meanGain } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';
// Wheel stop v2 (2026-11-13): the stop decides; detailed rule tests live in r9-wheel.test.mjs.
const rollMean = (e) => meanGain(effortOdds(e));
const mc = (w, careful, N, seed) => { const rng = makeRng(seed); let t = 0, j = 0; for (let i = 0; i < N; i++) { const r = spinResult(rng, w, careful); t += r.gain; if (r.jackpot) j++; } return { mean: t / N, jp: j / N }; };
test('Spotlight wheel is the SPOT_SLICES ring: 10 slices, one gold x3.0, widths sum 10, no effort or coach variants (2026-11-16 SPEC s3 retires the Easy/Normal/Push rings)', () => {
  const ref = JSON.stringify(wheelSlices('normal'));
  for (const e of ['easy', 'normal', 'push']) { const w = wheelSlices(e); assert.equal(w.slices.length, 10); assert.equal(w.slices[w.jackpotIndex], 3); assert.deepEqual(w.golds, [0]); assert.ok(Math.abs(w.widths.reduce((x, y) => x + y, 0) - 10) < 1e-9); assert.equal(JSON.stringify(w), ref, 'effort does not change the ring'); }
  assert.equal(JSON.stringify(wheelSlices('normal', 21)), ref, 'coach step does not change the ring');
});
test('wheel means: random 1.292 exact (SPEC s3), careful above random', () => {
  const w = wheelSlices('normal'), exact = w.slices.reduce((a, v, i) => a + v * w.widths[i], 0) / 10;
  assert.ok(Math.abs(exact - 1.292) < 1e-9, 'exact ' + exact);
  const a = mc(w, false, 40000, 'r').mean, b = mc(w, true, 40000, 'c').mean;
  assert.ok(Math.abs(a - 1.292) < 0.03, 'random ' + a); assert.ok(b > a * 1.25 && b < a * 1.5, 'careful ' + b / a);
});
test('roll means 1.22 / 1.5 / 2.0, Balanced 1.25 at Normal', () => {
  assert.ok(Math.abs(rollMean('easy') - 1.22) < 1e-9); assert.ok(Math.abs(rollMean('normal') - 1.5) < 1e-9); assert.ok(Math.abs(rollMean('push') - 2) < 1e-9);
  assert.ok(Math.abs(meanGain(effortOdds('normal', 0, true)) - 1.25) < 0.005);
});
test('Spotlight gold (x3.0, 12% of the rim): random about 12%, careful about 38%', () => {
  const w = wheelSlices('normal'), r = mc(w, false, 40000, 'jp'), c = mc(w, true, 40000, 'jc');
  assert.ok(Math.abs(r.jp - 0.12) < 0.015, 'random ' + r.jp); assert.ok(c.jp > 0.3 && c.jp < 0.45, 'careful ' + c.jp);
});
test('Kind Floor: owned lifts the x1.0 pieces to x1.2 (mean 1.440), never gold; not owned = plain ring', () => {
  const k = wheelSlices('normal', 0, true), p = wheelSlices('normal');
  assert.deepEqual(k.slices.filter((v) => v !== 1.2 && v !== 1.5 && v !== 3), []); assert.equal(k.slices[0], 3);
  assert.ok(Math.abs(k.slices.reduce((a, v, i) => a + v * k.widths[i], 0) / 10 - 1.44) < 1e-9);
  assert.equal(p.slices.filter((v) => v === 1).length, 7); assert.equal(k.ring[0].gold, true);
});
test('course wheel: COURSE_SLICES, +4 gold 12%, 11 slices, exact mean 1.590, coach step does not change it', () => {
  const w = courseWheel(8); assert.equal(w.slices.length, 11); assert.equal(w.jackpotGain, 4); assert.deepEqual(w.golds, [0]);
  assert.equal(w.slices.filter((v) => v === 1).length, 7); assert.equal(w.slices.filter((v) => v === 2).length, 2); assert.equal(w.slices.filter((v) => v === 3).length, 1);
  assert.ok(Math.abs(w.slices.reduce((a, v, i) => a + v * w.widths[i], 0) / 10 - 1.59) < 1e-9);
  assert.equal(JSON.stringify(courseWheel(0)), JSON.stringify(courseWheel(20)));
});
test('spin is deterministic per seed', () => { const w = wheelSlices('push'); assert.deepEqual(spinResult(makeRng('a'), w, true), spinResult(makeRng('a'), w, true)); });
