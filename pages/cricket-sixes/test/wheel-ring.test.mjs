import test from 'node:test';
import assert from 'node:assert/strict';
import { capSplit, checkRing, widen } from '../js/core/wheel-ring.js';

const mk = (ws, vals) => ws.map((w, i) => ({ id: i, w, value: vals ? vals[i] : i, label: String(i), tier: 'mid', gold: i === 0 }));
const sum = (r) => r.reduce((a, s) => a + s.w, 0);

test('capSplit splits fat slice into equal neighbours, keeps total and fields', () => {
  const r = capSplit(mk([4, 1.5, 1.5, 1, 1, 1], [9, 1, 2, 3, 4, 5]));
  assert.ok(Math.abs(sum(r) - 10) < 1e-6);
  assert.deepEqual(r.map((s) => s.id), r.map((_, i) => i));
  assert.deepEqual(checkRing(r, { allowEqual: true }), []);
  const first = r.filter((s) => s.value === 9);
  assert.equal(first.length, 4);
  assert.ok(first.every((s) => s.gold && Math.abs(s.w - 1) < 1e-9));
  assert.ok(r.slice(0, 4).every((s) => s.value === 9));
});

test('capSplit leaves a legal ring alone', () => {
  const r = mk(Array(10).fill(1));
  assert.deepEqual(capSplit(r).map((s) => s.w), r.map((s) => s.w));
});

test('checkRing mutation: 13.1% slice fails (and 12.1% fails at build cap)', () => {
  const ring = (w) => mk([w, ...Array(9).fill((10 - w) / 9)]);
  assert.deepEqual(checkRing(ring(1.2)), []);
  assert.ok(checkRing(ring(1.21)).some((p) => /over cap/.test(p)));
  assert.deepEqual(checkRing(ring(1.3), { cap: 0.13 }), []);
  assert.ok(checkRing(ring(1.31), { cap: 0.13 }).some((p) => /over cap/.test(p)));
});

test('checkRing flags bad sum and equal neighbours incl. wrap, honours allowlist', () => {
  assert.ok(checkRing(mk(Array(10).fill(1.01))).some((p) => /sum/.test(p)));
  const eq = mk(Array(10).fill(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 1]);
  assert.ok(checkRing(eq).some((p) => /share value 1/.test(p)));
  assert.deepEqual(checkRing(eq, { allowEqual: true }), []);
  assert.deepEqual(checkRing(eq, { allowEqual: (a) => a.value === 1 }), []);
});

test('widen clamps at 0.13 and renormalises the rest', () => {
  const r = mk(Array(10).fill(1));
  const a = widen(r, [0], 0.02);
  assert.ok(Math.abs(a[0].w - 1.2) < 1e-9);
  assert.ok(Math.abs(sum(a) - 10) < 1e-9);
  assert.ok(Math.abs(a[1].w - 8.8 / 9) < 1e-9);
  const b = widen(r, [0], 0.5);
  assert.ok(Math.abs(b[0].w - 1.3) < 1e-9);
  assert.ok(Math.abs(sum(b) - 10) < 1e-9);
  assert.deepEqual(checkRing(b, { cap: 0.13, allowEqual: true }), []);
  const c = widen(r, [0, 1], 0.5);
  assert.ok(c[0].w <= 1.3 + 1e-9 && c[1].w <= 1.3 + 1e-9 && Math.abs(sum(c) - 10) < 1e-9);
});
