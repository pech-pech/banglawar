import test from 'node:test';
import assert from 'node:assert/strict';
import { TOSS_SLICES } from '../js/data/wheels/toss.js';

const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);

test('Toss ring: 10 slices, ids 0..9, sum 10.000, cap 12%', () => {
  assert.equal(TOSS_SLICES.length, 10);
  TOSS_SLICES.forEach((s, i) => { assert.equal(s.id, i); assert.ok(s.w <= 1.2); });
  assert.ok(Math.abs(sum(TOSS_SLICES, (s) => s.w) - 10) <= 0.001);
});

test('Toss ring: 3 none / 4 +2.5 / 3 +5 split, gold only on +5', () => {
  const by = (v) => TOSS_SLICES.filter((s) => s.value === v);
  assert.equal(by(0).length, 3);
  assert.equal(by(2.5).length, 4);
  assert.equal(by(5).length, 3);
  assert.ok(by(0).every((s) => s.label === 'No boost, +1 Spoke' && s.tier === 'low' && !s.gold));
  assert.ok(by(2.5).every((s) => s.label === '+2.5%' && s.tier === 'mid' && !s.gold));
  assert.ok(by(5).every((s) => s.label === '+5%' && s.tier === 'top' && s.gold));
  assert.deepEqual([0, 1, 2].map((i) => TOSS_SLICES[i].value), [0, 0, 0]);
  assert.deepEqual([4, 7, 8].map((i) => TOSS_SLICES[i].value), [5, 5, 5]);
});

test('Toss random mean 2.50', () => {
  const mean = sum(TOSS_SLICES, (s) => s.w * s.value) / 10;
  assert.ok(Math.abs(mean - 2.5) <= 0.005, String(mean));
});
