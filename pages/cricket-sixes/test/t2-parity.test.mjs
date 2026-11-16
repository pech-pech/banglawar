import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOT_SLICES, COURSE_SLICES } from '../js/data/wheel-slices-train.js';
import { applyKindFloor } from '../js/core/perks/kind-floor.js';
import { exactRandomMean, simMean, TAPPERS, arcPerCycle } from '../tools/t2-parity.mjs';

// Parity numbers (careful ratio, full Control) are reported in PARITY-T2.md, not asserted here.
test('t2 random means are exact', () => {
  assert.ok(Math.abs(exactRandomMean(SPOT_SLICES) - 1.292) < 0.0005);
  assert.ok(Math.abs(exactRandomMean(COURSE_SLICES) - 1.590) < 0.0005);
});
test('t2 Kind Floor random mean is 1.440', () => {
  assert.ok(Math.abs(exactRandomMean(applyKindFloor(SPOT_SLICES, true)) - 1.440) < 0.0005);
});
test('t2 sim random tapper lands by width (sampled mean near exact)', () => {
  const m = simMean(SPOT_SLICES, TAPPERS.random, 20000, 11).mean;
  assert.ok(Math.abs(m - 1.292) < 0.02, String(m));
});
test('t2 sim uses the pulse engine numbers (ARC_PER_CYCLE 128.327)', () => {
  assert.ok(Math.abs(arcPerCycle({ W0: 36, D: 2 }) - 128.327) < 0.01);
});
