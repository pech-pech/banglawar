// T3 Hype slice table guards (wheels-like-match SPEC s6, s14 tests 1, 6, 6b).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HYPE_SLICES, hypeSlicesFor, HYPE_TOKEN_CAP, HYPE_WARM_CROWD, HYPE_RING_ORDER } from '../js/data/wheels/hype.js';

const T = HYPE_SLICES[0];
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('6b widths sum to 10.000 +-0.001', () => {
  assert.ok(Math.abs(sum(T.map((r) => r.w)) - 10) <= 0.001);
});
test('6 no slice over 12% of the rim', () => {
  for (const r of T) assert.ok(r.w <= 1.2, `slice ${r.id} w=${r.w}`);
});
test('6 no equal neighbours, wrap included', () => {
  T.forEach((r, i) => assert.notEqual(r.value, T[(i + 1) % T.length].value, `slices ${i}/${(i + 1) % T.length}`));
});
test('1 random mean 4.300 +-0.002', () => {
  assert.ok(Math.abs(sum(T.map((r) => r.w * r.value)) / 10 - 4.3) <= 0.002);
});
test('odds NUTS 10 / HIGH 20 / MED 35 / LOW 35', () => {
  const p = (v) => sum(T.filter((r) => r.value === v).map((r) => r.w)) * 10;
  for (const [v, want] of [[10, 10], [6, 20], [4, 35], [2, 35]]) assert.ok(Math.abs(p(v) - want) <= 0.01, `value ${v}: ${p(v)}`);
});
test('any tilt falls back to table 0', () => {
  assert.equal(hypeSlicesFor(3), HYPE_SLICES[0]);
  assert.deepEqual(hypeSlicesFor(3), T);
  assert.equal(hypeSlicesFor(0), T);
});
test('ids sequential, ring order, row shape, gold on NUTS only, frozen', () => {
  T.forEach((r, i) => {
    assert.equal(r.id, i);
    assert.equal(r.label.split(' ')[0], HYPE_RING_ORDER[i]);
    assert.ok(r.w >= 0.7);
    assert.equal(r.gold, HYPE_RING_ORDER[i] === 'NUTS');
    assert.ok(['top', 'mid', 'low'].includes(r.tier));
    assert.ok(Object.isFrozen(r));
  });
  assert.equal(T.length, 9);
  assert.ok(Object.isFrozen(T) && Object.isFrozen(HYPE_SLICES) && Object.isFrozen(HYPE_RING_ORDER));
});
test('constants', () => {
  assert.equal(HYPE_TOKEN_CAP, 1);
  assert.equal(HYPE_WARM_CROWD, 7);
});
