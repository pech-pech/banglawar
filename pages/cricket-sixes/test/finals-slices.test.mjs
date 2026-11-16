import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALS_SLICES as S, FINALS_MEDIAN } from '../js/data/wheels/finals.js';

test('Finals ring: order, sum, types', () => {
  assert.deepEqual(S.map((s) => s.value), [60, 30, 25, 20, 10, 15, 20, 20, 10, 15, 25, 30]);
  assert.ok(Math.abs(S.reduce((a, s) => a + s.w, 0) - 10) <= 0.001);
  assert.equal(S[0].gold, true); assert.equal(S[0].label, 'M'); assert.equal(S[0].w, 0.4);
  const n = (t) => S.filter((s) => s.type === t).length;
  assert.deepEqual([n('Coins'), n('TP'), n('Fans'), n('Medal')], [4, 4, 3, 1]);
  S.forEach((s, i) => assert.equal(s.id, i));
});
test('Finals ring: cap, equal neighbours, tiers, EV', () => {
  assert.ok(S.every((s) => s.w / 10 <= 0.12));
  for (let i = 0; i < 12; i++) {
    const a = S[i], b = S[(i + 1) % 12];
    if (a.value === b.value) { assert.equal(i, 6, 'only 20 at slices 7-8'); assert.notEqual(a.type, b.type); }
  }
  assert.equal(FINALS_MEDIAN, 20);
  for (const s of S) assert.equal(s.tier, s.value > 20 ? 'top' : s.value === 10 ? 'low' : 'mid');
  const ev = S.reduce((a, s) => a + s.w * s.value, 0) / 10;
  assert.ok(Math.abs(ev / 21.6 - 1) < 0.005, String(ev));
});
test('under-7% slice prints one character', () => {
  for (const s of S) if (s.w / 10 < 0.07) assert.equal(s.label.length, 1);
});
