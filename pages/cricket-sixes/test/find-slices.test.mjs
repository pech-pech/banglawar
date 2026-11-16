import test from 'node:test'; import assert from 'node:assert/strict';
import { FIND_SLICES, FIND_J, FIND_RATES } from '../js/data/wheels/find.js';
const sum = (r) => r.reduce((a, x) => a + x.w, 0);
test('6b: Find ring widths sum to 10.000 at every rate', () => { for (const r of FIND_RATES) assert.ok(Math.abs(sum(FIND_SLICES[r]) - 10) <= 0.001, r); });
test('FIND share of the rim equals the rate (random mean = rate)', () => { for (const r of FIND_RATES) assert.ok(Math.abs(FIND_SLICES[r].filter((x) => x.gold).reduce((a, x) => a + x.w, 0) / 10 - r) < 1e-9, r); });
test('6: no slice over 12%, row shape, ids are ring indices', () => {
  for (const r of FIND_RATES) FIND_SLICES[r].forEach((x, i) => {
    assert.ok(x.w <= 1.2 + 1e-9, r + ' ' + i); assert.equal(x.id, i);
    assert.deepEqual(Object.keys(x).sort(), ['gold', 'id', 'label', 'tier', 'value', 'w']);
  });
});
test('rim orders: 2 FIND blocks at 8% and 18%, 3 at 26% (12 / 12 / 2); no two FIND neighbours incl. wrap', () => {
  const pat = (r) => FIND_SLICES[r].map((x) => (x.gold ? 'F' : 'c')).join('');
  assert.equal(pat(0.08), 'Fccccfcccc'.toUpperCase().replace(/C/g, 'c')); assert.equal(pat(0.18), 'Fccccfcccc'.replace('f', 'F'));
  assert.equal(pat(0.26), 'FcccFcccFccc'.replace(/c/g, 'c'));
  assert.deepEqual(FIND_SLICES[0.26].filter((x) => x.gold).map((x) => x.w), [1.2, 1.2, 0.2]);
  for (const r of FIND_RATES) { const s = FIND_SLICES[r]; s.forEach((x, i) => assert.ok(!(x.gold && s[(i + 1) % s.length].gold))); }
});
test('tiers, values, gold: FIND top/gold/1, CHEER mid/0', () => {
  for (const r of FIND_RATES) for (const x of FIND_SLICES[r]) x.gold ? assert.deepEqual([x.tier, x.value], ['top', 1]) : assert.deepEqual([x.tier, x.value, x.gold], ['mid', 0, false]);
});
test('12: blocks under 0.7 unit print exactly one char "F"; wider print text', () => {
  for (const r of FIND_RATES) for (const x of FIND_SLICES[r]) { if (x.w < 0.7) { assert.equal([...x.label].length, 1); assert.equal(x.label, 'F'); } else assert.ok(x.label.length > 1); }
  assert.equal(FIND_SLICES[0.08][0].label, 'F'); assert.equal(FIND_SLICES[0.26][8].label, 'F'); assert.equal(FIND_SLICES[0.18][0].label, 'FIND');
});
test('J is 1.5', () => assert.equal(FIND_J, 1.5));
