import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALS_SLICES as S } from '../js/data/wheels/finals.js';
import { paidAmount, paidRing } from '../js/core/finals-paid.js';

const M = { coins: 1.25, fans: 1.1 };
test('random mean 21.6 +-0.5% (no multipliers)', () => {
  const mean = S.reduce((a, s) => a + s.w * (s.type === 'Medal' ? s.value : paidAmount(s, {})), 0) / 10;
  assert.ok(Math.abs(mean / 21.6 - 1) < 0.005, String(mean));
});
test('label equals paid amount (13c)', () => {
  const ring = paidRing(S, M);
  S.forEach((s, i) => { if (s.type !== 'Medal') assert.equal(ring[i].label, String(paidAmount(s, M))); });
  assert.equal(paidAmount(S.find((s) => s.type === 'Coins' && s.value === 10), M), Math.round(12.5));
  assert.equal(paidAmount(S.find((s) => s.type === 'Fans' && s.value === 15), M), Math.round(16.5));
  assert.equal(paidAmount(S.find((s) => s.type === 'TP' && s.value === 25), M), 25);
});
test('Medal never multiplied; tier uses base values', () => {
  const big = { coins: 3, fans: 3 };
  assert.equal(paidAmount(S[0], big), 1);
  assert.equal(paidRing(S, big)[0].label, 'M');
  const r = paidRing(S, big);
  r.forEach((s, i) => { assert.equal(s.tier, S[i].tier); assert.equal(s.value, S[i].value); });
});
test('20 at slices 7-8 is the allowed equal-neighbour exception, with paid labels', () => {
  assert.equal(S[6].value, 20); assert.equal(S[7].value, 20); assert.notEqual(S[6].type, S[7].type);
  const r = paidRing(S, { coins: 1.5, fans: 1 });
  assert.notEqual(r[6].label, r[7].label); // Fans 20 vs Coins 30: still distinguishable
});
