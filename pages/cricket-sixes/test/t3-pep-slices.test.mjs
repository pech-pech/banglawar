import test from 'node:test';
import assert from 'node:assert/strict';
import { PEP_SLICES, PEP_SLOT_OF, PEP_MAX_NAME, pepName } from '../js/data/wheels/pep.js';

const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);

test('Pep ring: 12 slices, sum 10.000, cap 12%, one gold (the 10)', () => {
  assert.equal(PEP_SLICES.length, 12);
  PEP_SLICES.forEach((s, i) => { assert.equal(s.id, i); assert.ok(s.w <= 1.2); });
  assert.ok(Math.abs(sum(PEP_SLICES, (s) => s.w) - 10) <= 0.001);
  const gold = PEP_SLICES.filter((s) => s.gold);
  assert.equal(gold.length, 1);
  assert.equal(gold[0].value, 10);
  assert.equal(gold[0].id, 7);
  assert.equal(gold[0].w, 0.96);
  assert.equal(gold[0].tier, 'top');
});

test('Pep boosts and tiers', () => {
  assert.deepEqual(PEP_SLICES.map((s) => s.value), [5, 7.5, 5, 2.5, 2.5, 5, 7.5, 10, 7.5, 5, 2.5, 2.5]);
  for (const s of PEP_SLICES) {
    assert.equal(s.tier, s.value === 10 ? 'top' : s.value === 2.5 ? 'low' : 'mid');
  }
});

test('Pep random mean 5.2745', () => {
  const mean = sum(PEP_SLICES, (s) => s.w * s.value) / 10;
  assert.ok(Math.abs(mean - 5.2745) <= 0.005, String(mean));
});

test('PEP_SLOT_OF: each of p1..p6 twice; offset 0 gives slot 2 on slice index 7', () => {
  for (let off = 0; off < 6; off++) {
    const cnt = {};
    for (let i = 0; i < 12; i++) { const p = PEP_SLOT_OF(i, off); assert.ok(p >= 1 && p <= 6); cnt[p] = (cnt[p] || 0) + 1; }
    for (let p = 1; p <= 6; p++) assert.equal(cnt[p], 2);
  }
  assert.equal(PEP_SLOT_OF(7, 0), 2);
});

test('pepName cuts names over 10 chars to the surname', () => {
  assert.equal(PEP_MAX_NAME, 10);
  assert.equal(pepName('Tamim Iqbal'), 'Iqbal');
  assert.equal(pepName('Shakib Al Hasan'), 'Hasan');
  assert.equal(pepName('Rubel Hos'), 'Rubel Hos');
  assert.equal(pepName('Mushfiqur'), 'Mushfiqur');
});
