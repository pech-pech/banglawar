import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOT_SLICES, COURSE_SLICES } from '../js/data/wheel-slices-train.js';

const sum = (r) => r.reduce((a, s) => a + s.w, 0);
const mean = (r) => r.reduce((a, s) => a + s.w * s.value, 0) / sum(r);
const RINGS = { spot: [SPOT_SLICES, 1.292, [3, 1, 1, 1.5, 1, 1, 1.2, 1, 1, 1]], course: [COURSE_SLICES, 1.59, [4, 1, 3, 1, 2, 1, 2, 1, 1, 1, 1]] };

for (const [name, [ring, want, order]] of Object.entries(RINGS)) {
  test(`${name}: ring order, ids, row shape`, () => {
    assert.deepEqual(ring.map((s) => s.value), order);
    ring.forEach((s, i) => {
      assert.equal(s.id, i);
      assert.deepEqual(Object.keys(s).sort(), ['gold', 'id', 'label', 'tier', 'value', 'w']);
    });
  });
  test(`${name}: widths sum 10.000 +-0.001, none over 12%`, () => {
    assert.ok(Math.abs(sum(ring) - 10) <= 0.001);
    for (const s of ring) assert.ok(s.w <= 1.2 + 1e-9);
  });
  test(`${name}: random mean ${want} +-0.002`, () => {
    assert.ok(Math.abs(mean(ring) - want) <= 0.002, String(mean(ring)));
  });
  test(`${name}: labels under 7% are one char or a signed number`, () => {
    for (const s of ring) {
      if (s.w < 0.7) assert.ok(s.label.length === 1 || /^[+-]\d+$/.test(s.label) || /^\d\.\d$/.test(s.label), s.label);
    }
  });
  test(`${name}: tier and gold flags`, () => {
    const lo = Math.min(...ring.map((s) => s.value));
    for (const s of ring) {
      assert.equal(s.tier, s.value > 1 ? 'top' : 'low');
      assert.equal(s.tier === 'low', s.value === lo);
    }
    const top = Math.max(...ring.map((s) => s.value));
    ring.forEach((s) => assert.equal(s.gold, s.value === top));
  });
}

test('Spotlight: specific labels and runs', () => {
  assert.equal(SPOT_SLICES[6].label, '1.2');
  assert.equal(SPOT_SLICES[0].label, 'x3.0');
  assert.equal(SPOT_SLICES[1].w.toFixed(4), '1.0571');
});
test('Course: specific labels', () => {
  assert.equal(COURSE_SLICES[4].label, '+2');
  assert.equal(COURSE_SLICES[4].w, 0.35);
  assert.equal(COURSE_SLICES[1].w.toFixed(4), '1.0429');
});

test('neighbour rule: equal neighbours only in the x1.0 / +1 run, wrap included', () => {
  for (const [ring, allowed] of [[SPOT_SLICES, 1], [COURSE_SLICES, 1]]) {
    ring.forEach((s, i) => {
      const n = ring[(i + 1) % ring.length];
      if (s.value === n.value) assert.equal(s.value, allowed);
    });
  }
});
test('at most 3 x1.0 in a row (wrap included)', () => {
  const r = SPOT_SLICES, n = r.length;
  for (let i = 0; i < n; i++) assert.ok(![0, 1, 2, 3].every((k) => r[(i + k) % n].value === 1));
});
