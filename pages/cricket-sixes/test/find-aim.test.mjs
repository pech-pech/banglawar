import test from 'node:test'; import assert from 'node:assert/strict';
import { FIND_SLICES, FIND_J } from '../js/data/wheels/find.js';
import { findAimTarget, arrivalNear, tickFallback, blockStarts, FIND_TIE_EPS, FIND_AIM_MIN_W } from '../js/core/find-aim.js';
const mk = (ws, gold) => ws.map((w, id) => ({ id, w, gold: gold.includes(id), value: 0, label: '', tier: 'mid' }));
const at = (m) => (id) => m[id];
test('constants', () => { assert.equal(FIND_TIE_EPS, 0.05); assert.equal(FIND_AIM_MIN_W, 0.3); });
test('nearest arrival to 3.5 s wins', () => { const r = mk([1, 1, 1, 1], [0, 2]); assert.equal(findAimTarget(r, at({ 0: 3.3, 2: 3.9 })), 0); assert.equal(findAimTarget(r, at({ 0: 3.3, 2: 3.6 })), 2); });
test('within eps = tied: wider wins, then first clockwise; outside eps nearest wins', () => {
  const r = mk([1, 1, 1.4, 1], [0, 2]);
  assert.equal(findAimTarget(r, at({ 0: 3.5, 2: 3.54 })), 2);   // tied, 2 wider
  assert.equal(findAimTarget(r, at({ 0: 3.5, 2: 3.56 })), 0);   // beyond eps
  const e = mk([1, 1, 1, 1], [1, 3]);
  assert.equal(findAimTarget(e, at({ 1: 3.52, 3: 3.5 })), 1);   // equal widths: first clockwise
  assert.equal(findAimTarget(e, at({ 1: 3.52, 3: 3.5 }), { phi: 1.5 }), 3); // first clockwise from the pointer, ring rotated
});
test('26%: equal 12 / 12 blocks tie -> first clockwise; 2% block (<0.3) never a target', () => {
  const r = FIND_SLICES[0.26], gold = r.filter((x) => x.gold);
  assert.equal(findAimTarget(r, (id) => (id === gold[2].id ? 3.5 : 3.5)), gold[0].id);
  assert.equal(findAimTarget(r, (id) => (id === gold[2].id ? 3.5 : 9)), gold[0].id); // 2% block nearest but ineligible
  assert.equal(findAimTarget(mk([1, 0.2], [1]), () => 3.5), -1);
});
test('deterministic and total (same inputs same id)', () => { const r = FIND_SLICES[0.18]; for (let i = 0; i < 20; i++) { const phi = i * 0.5, f = (id) => arrivalNear(r, id, phi); assert.equal(findAimTarget(r, f, { phi }), findAimTarget(r, f, { phi })); } });
test('arrivalNear: block centre is at the pointer at the returned time', () => {
  const r = FIND_SLICES[0.18], st = blockStarts(r);
  for (const phi of [0, 1.7, 5.3, 9.9]) for (const id of [0, 5]) { const t = arrivalNear(r, id, phi), pos = (((phi + tickFallback(t)) % 10) + 10) % 10; assert.ok(Math.abs(pos - (st[id] + r[id].w / 2)) < 1e-6 || Math.abs(Math.abs(pos - (st[id] + r[id].w / 2)) - 10) < 1e-6, `${phi} ${id} ${pos}`); }
});
// Seeded careful-tapper sim (tap noise SD 0.1 s; T1's sim model is not in tree, so bands are looser than SPEC +-0.015).
const ratio = (rate, aim, N = 20000) => {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, g = () => { let a = 0; for (let q = 0; q < 12; q++) a += rnd(); return a - 6; };
  const ring = FIND_SLICES[rate], st = blockStarts(ring); let f = 0;
  for (let i = 0; i < N; i++) {
    const phi = rnd() * 10, id = aim(ring, phi), t = arrivalNear(ring, id, phi) + g() * 0.1;
    const pos = (((phi + tickFallback(t) + (rnd() * 2 - 1) * FIND_J) % 10) + 10) % 10;
    if (ring.some((x, j) => x.gold && pos >= st[j] && pos < st[j] + x.w)) f++;
  }
  return f / N / rate;
};
const nearest = (ring, phi) => findAimTarget(ring, (id) => arrivalNear(ring, id, phi), { phi });
test('2b: careful ratio in the Find band 1.30-1.50+, nearest beats first block at 18%', () => {
  const nr = ratio(0.18, nearest);
  assert.ok(nr > 1.30 && nr < 1.55, 'nearest ' + nr);
  const fr = ratio(0.18, (ring) => ring.find((x) => x.gold).id);
  assert.ok(nr - fr > 0.04, `aim at the first block must lose to the tie rule: ${nr} vs ${fr}`);
});
