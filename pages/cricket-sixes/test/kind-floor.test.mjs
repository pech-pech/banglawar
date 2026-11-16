// Kind Floor, SPEC test 2c.
// ring is SPOT_SLICES from js/data/wheel-slices-train.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOT_SLICES } from '../js/data/wheel-slices-train.js';
import { KIND_FLOOR_SPOT, KIND_FLOOR_SPOT_FALLBACK, applyKindFloor, kindFloorPay } from '../js/core/perks/kind-floor.js';

const RING = SPOT_SLICES;
const mean = (r) => r.reduce((a, s) => a + s.w * s.value, 0) / r.reduce((a, s) => a + s.w, 0);

test('spot constants', () => {
  assert.equal(KIND_FLOOR_SPOT, 0.2);
  assert.equal(KIND_FLOOR_SPOT_FALLBACK, 0.1);
});

test('not owned: ring equal, new array', () => {
  const r = applyKindFloor(RING, false);
  assert.deepEqual(r, RING);
  assert.notEqual(r, RING);
  assert.ok(Math.abs(mean(r) - 1.292) < 1e-9);
});

test('owned: seven x1.0 pieces pay and print x1.2; input not mutated', () => {
  const before = JSON.stringify(RING);
  const r = applyKindFloor(RING, true);
  assert.equal(JSON.stringify(RING), before);
  const lifted = r.filter((s, i) => RING[i].value === 1.0);
  assert.equal(lifted.length, 7);
  for (const s of lifted) { assert.equal(s.value, 1.2); assert.equal(s.label, 'x1.2'); }
  assert.ok(Math.abs(mean(r) - 1.44) < 1e-9, 'random mean 1.440');
});

test('gold untouched, widths and ids untouched', () => {
  const r = applyKindFloor(RING, true);
  assert.deepEqual(r[0], RING[0]);
  r.forEach((s, i) => { assert.equal(s.w, RING[i].w); assert.equal(s.id, RING[i].id); assert.equal(s.gold, RING[i].gold); });
});

test('ladder order kept: never inverted, equal to x1.2 slice at most', () => {
  const r = applyKindFloor(RING, true);
  for (let i = 0; i < r.length; i++) assert.ok(r[i].value >= RING[i].value);
  const lowV = Math.max(...r.filter((s, i) => RING[i].tier === 'low').map((s) => s.value));
  const mids = r.filter((s) => !s.gold && s.value > 1.2 - 1e-9 && RING[s.id].tier === 'mid').map((s) => s.value);
  for (const m of mids) assert.ok(lowV <= m + 1e-9);
  // literal +0.67x is refused by the clamp: x1.0 -> x1.2 (next rung), never x1.67
  const big = applyKindFloor(RING, true, 0.67);
  for (const s of big) if (RING[s.id].tier === 'low') assert.ok(s.value <= 1.2 + 1e-9);
});

test('fallback +0.1x mean 1.366', () => {
  assert.ok(Math.abs(mean(applyKindFloor(RING, true, 0.1)) - 1.366) < 1e-9);
});

test('kindFloorPay: owned lifts x1.0, skipped on gold, others unchanged', () => {
  assert.equal(kindFloorPay(1.0, false, true), 1.2);
  assert.equal(kindFloorPay(1.0, false, false), 1.0);
  assert.equal(kindFloorPay(1.0, true, true), 1.0);
  assert.equal(kindFloorPay(3.0, true, true), 3.0);
  assert.equal(kindFloorPay(1.5, false, true), 1.5);
  assert.equal(kindFloorPay(1.2, false, true), 1.2);
});

test('kindFloorPay at +0.67x is refused: x1.0 pays 1.2, 1.2 and 1.5 unchanged', () => {
  assert.equal(kindFloorPay(1.0, false, true, 0.67), 1.2);
  assert.equal(kindFloorPay(1.2, false, true, 0.67), 1.2);
  assert.equal(kindFloorPay(1.5, false, true, 0.67), 1.5);
  assert.equal(kindFloorPay(1.0, true, true, 0.67), 1.0);
  for (const v of [1.0, 1.2, 1.5]) assert.ok(kindFloorPay(v, false, true, 0.67) >= v && kindFloorPay(v, false, true, 0.67) <= 1.5);
});
