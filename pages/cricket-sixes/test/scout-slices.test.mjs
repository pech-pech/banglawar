import test from 'node:test';
import assert from 'node:assert/strict';
import { SCOUT_SLICES as S } from '../js/data/wheels/scout.js';

test('scout slices: 10 x w1.0, sum 10', () => {
  assert.equal(S.length, 10);
  assert.ok(S.every((s, i) => s.w === 1 && s.id === i));
  assert.ok(Math.abs(S.reduce((a, s) => a + s.w, 0) - 10) <= 0.001);
});
test('scout slices: values, gold, random mean 0.60', () => {
  assert.deepEqual(S.map((s) => s.value), [2, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual(S.map((s) => s.gold), [true, ...Array(9).fill(false)]);
  assert.ok(Math.abs(S.reduce((a, s) => a + s.w * s.value, 0) / 10 - 0.6) <= 0.005);
});
test('scout slices: no equal neighbours incl. wrap', () => {
  for (let i = 0; i < 10; i++) assert.notEqual(S[i].value, S[(i + 1) % 10].value);
});
test('scout slices: labels (w 1.0 >= 0.7 prints text) and tiers', () => {
  assert.ok(S.every((s) => s.label.length > 0));
  for (const s of S) assert.equal(s.tier, s.value === 0 ? 'low' : 'top');
});
