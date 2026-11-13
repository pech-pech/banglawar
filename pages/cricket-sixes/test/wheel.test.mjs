import test from 'node:test'; import assert from 'node:assert/strict';
import { wheelSlices, courseWheel, spinResult, effortOdds, meanGain } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';
// Wheel stop v2 (2026-11-13): the stop decides; detailed rule tests live in r9-wheel.test.mjs.
const rollMean = (e) => meanGain(effortOdds(e));
const mc = (w, careful, N, seed) => { const rng = makeRng(seed); let t = 0, j = 0; for (let i = 0; i < N; i++) { const r = spinResult(rng, w, careful); t += r.gain; if (r.jackpot) j++; } return { mean: t / N, jp: j / N }; };
test('wheel is 10 slices with one narrow jackpot', () => { for (const e of ['easy', 'normal', 'push']) { const w = wheelSlices(e); assert.equal(w.slices.length, 10); assert.equal(w.slices[w.jackpotIndex], w.jackpotGain); assert.equal(Math.min(...w.widths), w.widths[w.jackpotIndex]); } });
test('wheel means vs roll: random about 1.3x, careful about 1.5x (option B)', () => {
  for (const e of ['easy', 'normal']) { const w = wheelSlices(e), r = rollMean(e), a = mc(w, false, 30000, e + 'r').mean / r, b = mc(w, true, 30000, e + 'c').mean / r; assert.ok(a > 1.2 && a < 1.4, e + ' random ' + a); assert.ok(b > 1.4 && b < 1.7, e + ' careful ' + b); }
});
test('roll means 1.22 / 1.5 / 2.0, Balanced 1.25 at Normal', () => {
  assert.ok(Math.abs(rollMean('easy') - 1.22) < 1e-9); assert.ok(Math.abs(rollMean('normal') - 1.5) < 1e-9); assert.ok(Math.abs(rollMean('push') - 2) < 1e-9);
  assert.ok(Math.abs(meanGain(effortOdds('normal', 0, true)) - 1.25) < 0.005);
});
test('jackpot chance Normal: random about 4-6%, careful about 17%', () => {
  const w = wheelSlices('normal'), r = mc(w, false, 40000, 'jp'), c = mc(w, true, 40000, 'jc');
  assert.ok(r.jp > 0.03 && r.jp < 0.08, 'random ' + r.jp); assert.ok(Math.abs(c.jp - 0.17) < 0.04, 'careful ' + c.jp);
});
test('coach: one +1 -> +2 per 6 Quality, one +1 stays', () => {
  const c0 = wheelSlices('normal', 0), ones = (w) => w.slices.filter((v) => v === 1).length;
  assert.equal(ones(c0), 5); assert.equal(ones(wheelSlices('normal', 3)), 5); assert.equal(ones(wheelSlices('normal', 6)), 4);
  assert.equal(ones(wheelSlices('normal', 12)), 3); assert.equal(ones(wheelSlices('normal', 21)), 2);
  assert.ok(ones(wheelSlices('easy', 21)) >= 1); assert.ok(ones(wheelSlices('push', 21)) >= 1);
});
test('course wheel: +1 x5, +2 x4, jackpot +3; plain mean 1.6', () => {
  const w = courseWheel(8); assert.equal(w.slices.length, 10);
  assert.equal(w.slices.filter((v) => v === 1).length, 5); assert.equal(w.slices.filter((v) => v === 2).length, 4); assert.equal(w.jackpotGain, 3);
  assert.ok(Math.abs(w.slices.reduce((a, b) => a + b, 0) / 10 - 1.6) < 1e-9);
});
test('spin is deterministic per seed', () => { const w = wheelSlices('push'); assert.deepEqual(spinResult(makeRng('a'), w, true), spinResult(makeRng('a'), w, true)); });
