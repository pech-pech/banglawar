import test from 'node:test';
import assert from 'node:assert/strict';
import { capSplit, checkRing, widen, EQUAL_OK } from '../js/core/wheel-ring.js';

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

test('widen never gives a zero or negative width, even when the growth would eat the rest of the ring', () => {
  const r = mk(Array(10).fill(1));
  const a = widen(r, [0, 1, 2, 3, 4, 5, 6, 7, 8], 0.5); // 9 slices to 1.3 = 11.7 > 10: the old code gave the last slice -1.7
  assert.ok(a.every((s) => s.w > 0), a.map((s) => s.w).join());
  assert.ok(Math.abs(sum(a) - 10) < 1e-9);
  assert.ok(a[9].w >= 0.1 * 1 - 1e-9, `last keeps >= 10% of its width: ${a[9].w}`);
  assert.ok(a.slice(0, 9).every((s) => s.w >= 1 && s.w <= 1.3 + 1e-9));
  const all = widen(r, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0.5); // nothing left to shrink: unchanged
  assert.deepEqual(all.map((s) => s.w), r.map((s) => s.w));
  for (const by of [-0.5, 0, NaN]) assert.deepEqual(widen(r, [0], by).map((s) => s.w), r.map((s) => s.w), `by ${by}`);
  const tiny = mk([0.05, 0.05, 9.9]); // one big slice being widened, tiny others
  const c = widen(tiny, [2], 0.5);
  assert.ok(c.every((s) => s.w > 0) && Math.abs(sum(c) - 10) < 1e-9);
  // moderate cases are untouched by the guard
  const m = widen(r, [0, 1], 0.02);
  assert.ok(Math.abs(m[0].w - 1.2) < 1e-9 && Math.abs(m[1].w - 1.2) < 1e-9 && Math.abs(m[2].w - 7.6 / 8) < 1e-9);
});

test('EQUAL_OK: real SPEC 7 Toss and SPEC 8 Pep rings pass with wheelId, no ring edits; stray equal pairs still fail', () => {
  const toss = mk(Array(10).fill(1), [0, 0, 0, 2.5, 5, 2.5, 2.5, 5, 5, 2.5]);
  const pepW = [0.822, 0.822, 0.822, 0.822, 0.822, 0.822, 0.822, 0.96, 0.822, 0.822, 0.822, 0.822].map((w) => (w === 0.822 ? 90.4 / 110 : w));
  const pep = mk(pepW, [5, 7.5, 5, 2.5, 2.5, 5, 7.5, 10, 7.5, 5, 2.5, 2.5]);
  assert.ok(checkRing(toss).length > 0 && checkRing(pep).length > 0, 'fail without wheelId');
  assert.deepEqual(checkRing(toss, { wheelId: 'toss' }), []);
  assert.deepEqual(checkRing(pep, { wheelId: 'pep' }), []);
  assert.ok(checkRing(toss, { wheelId: 'pep' }).length > 0, 'pep list does not excuse toss');
  assert.ok(checkRing(mk(Array(10).fill(1), [0, 0, 0, 2.5, 2.5, 2.5, 2.5, 5, 5, 2.5]), { wheelId: 'toss' }).some((m) => /slices 3 and 4/.test(m)));
  assert.ok(checkRing(mk(Array(10).fill(1), [0, 0, 0, 2.5, 5, 2.5, 2.5, 5, 5, 0]), { wheelId: 'toss' }).some((m) => /slices 9 and 0/.test(m)), 'wrap');
  assert.ok(checkRing(pep, { wheelId: 'pep', allowEqual: false }).length > 0, 'explicit allowEqual wins');
  assert.deepEqual(checkRing(toss, { wheelId: 'hype' }).length > 0, true);
  assert.ok(Object.isFrozen(EQUAL_OK) && Object.isFrozen(EQUAL_OK.toss));
});
