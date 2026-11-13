import test from 'node:test'; import assert from 'node:assert/strict';
import { wheelSlices, courseWheel, spinResult, effortOdds, meanGain } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';
const mean = (w, careful) => { const u = w.slices.reduce((a, b) => a + b, 0) / 10; return careful ? (1 - w.aim) * u + w.aim * w.jackpotGain : u; };
const rollMean = (e) => meanGain(effortOdds(e));
test('wheel is 10 slices with one jackpot', () => { for (const e of ['easy', 'normal', 'push']) { const w = wheelSlices(e); assert.equal(w.slices.length, 10); assert.equal(w.slices[w.jackpotIndex], w.jackpotGain); } });
test('wheel means vs roll (SPEC s2)', () => {
  const band = { easy: [[1.39, 1.39], [1.51, 1.51]], normal: [[1.33, 1.33], [1.49, 1.49]], push: [[1.3, 1.3], [1.47, 1.47]] };
  for (const e of ['easy', 'normal', 'push']) {
    const w = wheelSlices(e), r = rollMean(e);
    assert.ok(Math.abs(mean(w, false) / r - band[e][0][0]) < 0.011, e + ' random ' + mean(w, false) / r);
    assert.ok(Math.abs(mean(w, true) / r - band[e][1][0]) < 0.011, e + ' careful ' + mean(w, true) / r);
  }
});
test('roll means 1.22 / 1.5 / 2.0, Balanced 1.25 at Normal', () => {
  assert.ok(Math.abs(rollMean('easy') - 1.22) < 1e-9); assert.ok(Math.abs(rollMean('normal') - 1.5) < 1e-9); assert.ok(Math.abs(rollMean('push') - 2) < 1e-9);
  assert.ok(Math.abs(meanGain(effortOdds('normal', 0, true)) - 1.25) < 0.005);
});
test('jackpot chance Normal: random 10%, careful 17%', () => {
  const w = wheelSlices('normal'); const rng = makeRng('jp'); let r = 0, c = 0; const N = 40000;
  for (let i = 0; i < N; i++) { if (spinResult(rng, w, false).jackpot) r++; if (spinResult(rng, w, true).jackpot) c++; }
  assert.ok(Math.abs(r / N - 0.10) < 0.01, 'random ' + r / N); assert.ok(Math.abs(c / N - 0.172) < 0.012, 'careful ' + c / N);
  assert.equal(spinResult({ random: () => 0 }, w, true).jackpot, true); assert.equal(spinResult({ random: () => 0.99 }, w, true).jackpot, false);
});
test('coach: one +1 -> +2 per 6 Quality, one +1 stays, aim +0.003/step', () => {
  const c0 = wheelSlices('normal', 0), ones = (w) => w.slices.filter((v) => v === 1).length;
  assert.equal(ones(c0), 5);
  assert.equal(ones(wheelSlices('normal', 3)), 5); // Q 2.85 -> 0.48 -> 0 upgrades
  const w6 = wheelSlices('normal', 6); assert.equal(ones(w6), 4); // Q 5.7 -> 0.95 -> 1
  assert.equal(ones(wheelSlices('normal', 12)), 3); // Q 11.4 -> 1.9 -> 2
  assert.equal(ones(wheelSlices('normal', 21)), 2);  // Q 19.95 -> 3.3 -> 3 upgrades
  assert.ok(ones(wheelSlices('easy', 21)) >= 1); assert.ok(ones(wheelSlices('push', 21)) >= 1);
  assert.ok(Math.abs(wheelSlices('normal', 10).aim - 0.11) < 1e-9);
});
test('careful wheel stays about 1.5x with a coach (grade 4: 1.52, grade 21: 1.49)', () => {
  const r4 = mean(wheelSlices('normal', 4), true) / meanGain(effortOdds('normal', 0.95 * 4));
  const r21 = mean(wheelSlices('normal', 21), true) / meanGain(effortOdds('normal', 0.95 * 21));
  assert.ok(r4 > 1.4 && r4 < 1.6, '' + r4); assert.ok(r21 > 1.4 && r21 < 1.6, '' + r21);
});
test('course wheel: +1 x5, +2 x4, jackpot +3; means 1.6 / 1.8; jackpot 10% / 22.6%', () => {
  const w = courseWheel(8); assert.equal(w.slices.length, 10);
  assert.equal(w.slices.filter((v) => v === 1).length, 5); assert.equal(w.slices.filter((v) => v === 2).length, 4); assert.equal(w.jackpotGain, 3);
  assert.ok(Math.abs(mean(w, false) - 1.6) < 1e-9); assert.ok(Math.abs(mean(w, true) - 1.796) < 0.001);
  assert.ok(Math.abs((w.aim + (1 - w.aim) * 0.1) - 0.226) < 0.001);
});
test('spin is deterministic per seed', () => { const w = wheelSlices('push'); assert.deepEqual(spinResult(makeRng('a'), w, true), spinResult(makeRng('a'), w, true)); });
