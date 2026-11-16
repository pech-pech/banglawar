// SPEC section 14 tests 2, 2c, 6, 12 for Spotlight and Course (computable now; 3, 8, 9, 14 wait on T1).
// Seeded sim from tools/t2-parity.mjs, 4000 spins per cell. Noise: SPEC +-0.01 plus 2 s.e. of the 4000-spin mean.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOT_SLICES, COURSE_SLICES } from '../js/data/wheel-slices-train.js';
import { applyKindFloor, KIND_FLOOR_SPOT } from '../js/core/perks/kind-floor.js';
import { exactRandomMean, simMean, TAPPERS } from '../tools/t2-parity.mjs';
import { checkRing, widen, SLICE_WIDEN_MAX } from '../js/core/wheel-ring.js';

const N = 4000;
const ratio = (ring, who, seed) => {
  const r = simMean(ring, TAPPERS[who], N, seed), b = exactRandomMean(ring);
  return { x: r.mean / b, tol: 0.01 + (2 * r.se) / b };
};
const KF = applyKindFloor(SPOT_SLICES, true, KIND_FLOOR_SPOT);

// Mutation: set TAPPERS.careful.sd to 0.5 (or aim at the lowest value) and the band/cap checks fail.
test('2: Spotlight careful ratio 1.30-1.41, full Control at most 1.65', () => {
  const c = ratio(SPOT_SLICES, 'careful', 101), f = ratio(SPOT_SLICES, 'full', 102);
  assert.ok(c.x >= 1.30 - c.tol && c.x <= 1.41 + c.tol, `careful ${c.x}`);
  assert.ok(f.x <= 1.65 + f.tol, `full ${f.x}`);
});
// Mutation: change a Course slice value (e.g. the +4 to +6) and the band/cap fail.
test('2: Course careful ratio 1.30-1.41, full Control at most 1.71', () => {
  const c = ratio(COURSE_SLICES, 'careful', 201), f = ratio(COURSE_SLICES, 'full', 202);
  assert.ok(c.x >= 1.30 - c.tol && c.x <= 1.41 + c.tol, `careful ${c.x}`);
  assert.ok(f.x <= 1.71 + f.tol, `full ${f.x}`);
});
// Mutation: switch KIND_FLOOR_SPOT to 0.67 (or 0.1) and the 1.440 / 1.28 / 1.38 / 1.54 checks fail.
test('2c: Kind Floor random 1.440, careful 1.28, good 1.38, full 1.54 (+-0.015), +0.67x refused', () => {
  assert.ok(Math.abs(exactRandomMean(KF) - 1.440) <= 0.015);
  const want = { careful: 1.28, good: 1.38, full: 1.54 };
  let seed = 301;
  for (const [who, v] of Object.entries(want)) {
    const r = simMean(KF, TAPPERS[who], N, seed++), e = exactRandomMean(KF);
    const tol = 0.015 + (2 * r.se) / e;
    assert.ok(Math.abs(r.mean / e - v) <= tol, `${who} ${r.mean / e}`);
  }
  // +0.67x refused: the ring is clamped to the +0.2x ladder (no x1.67 slice, random mean stays 1.440)
  const k67 = applyKindFloor(SPOT_SLICES, true, 0.67);
  assert.ok(Math.abs(exactRandomMean(k67) - 1.440) <= 0.015);
  assert.ok(k67.every((x) => x.value <= 3.0 && x.value !== 1.67));
});

const ALLOW = (s) => s.value === 1; // Spotlight x1.0 run, Course +1 run (SPEC test 6 exceptions)
// Mutation: make any slice 12.1% wide (w 1.21) and the build check fails; allow 13.1% and the widen check fails.
test('6: build rings have no slice over 12% and no equal neighbours except the x1 run (wrap included)', () => {
  for (const ring of [SPOT_SLICES, COURSE_SLICES]) assert.deepEqual(checkRing(ring, { allowEqual: ALLOW }), []);
});
test('6: widened rings clamp at 13.0%, sum 10, no equal neighbours beyond the allowed run', () => {
  assert.equal(SLICE_WIDEN_MAX, 0.13);
  for (const ring of [SPOT_SLICES, COURSE_SLICES]) {
    const gold = ring.filter((s) => s.gold).map((s) => s.id);
    const wide = widen(ring, gold, 0.05); // asks for far more than the ceiling
    for (const s of wide) if (s.gold) assert.ok(s.w <= 1.3 + 1e-9 && s.w >= 1.3 - 1e-9, String(s.w));
    assert.deepEqual(checkRing(wide, { cap: SLICE_WIDEN_MAX, allowEqual: ALLOW }), []);
    assert.equal(wide.length, ring.length); // never re-split
  }
});

// Mutation: rename a 6% slice label to 'abc' and this fails.
test('12: every slice under 7% prints one character or a signed number', () => {
  for (const ring of [SPOT_SLICES, COURSE_SLICES, KF]) {
    for (const s of ring) if (s.w < 0.7) assert.ok(String(s.label).length === 1 || /^[+-]?\d+(\.\d+)?$/.test(String(s.label)), `${s.id} ${s.label}`);
  }
});
