import test from 'node:test';
import assert from 'node:assert/strict';
import { tossRing, tossAtStop } from '../js/core/wheels/toss.js';
import { neutralMods } from '../js/core/wheels/common.js';
import { revealWheel, revealResult } from '../js/core/wheels/reveal.js';
import { TOSS_SLICES } from '../js/data/wheels/toss.js';

const mkRng = (n = 0) => { let c = 0; return { random: () => (c++, ((n + c) * 0.137) % 1), get calls() { return c; } }; };

test('ring sums 10 and neutral matches data', () => {
  const r = tossRing(); assert.equal(r.length, 10);
  assert.ok(Math.abs(r.reduce((t, s) => t + s.w, 0) - 10) < 1e-9);
  r.forEach((s, i) => assert.equal(s.value, TOSS_SLICES[i].value));
});
test('each sliceId gives its boost, 6 draws, ids', () => {
  const ring = tossRing();
  ring.forEach((row, i) => {
    const g = mkRng(i), o = tossAtStop(g, ring, { sliceId: i });
    assert.equal(g.calls, 6); assert.equal(o.index, i); assert.equal(o.fx.tossb, row.value);
    assert.equal(o.id, row.value > 0 ? 'won' : 'sport'); assert.equal(o.boosted, false);
    assert.deepEqual(Object.keys(o).sort(), ['boosted', 'fx', 'id', 'index', 'label', 'neighbour', 'slot', 'slots']);
  });
});
test('Booster adds on the boosted non-gold slice only', () => {
  const ring = tossRing(), m = { ...neutralMods(), bch: 1, bval: 2 };
  const rng = (d1, d2) => { const a = [0, d1, d2, 0, 0, 0]; let k = 0; return { random: () => a[k++] }; };
  const nonGold = ring.filter((s) => !s.gold), bi = nonGold[0]; // d2 = 0 picks first non-gold
  const o = tossAtStop(rng(0, 0), ring, { sliceId: bi.id }, m);
  assert.equal(o.boosted, true); assert.equal(o.fx.tossb, bi.value + 2);
  assert.equal(tossAtStop(rng(0, 0), ring, { sliceId: 4 }, m).boosted, false); // gold never
});
test('Kind Floor and Good Sport rows', () => {
  const f = tossRing({ floor: 2 }); f.forEach((s, i) => assert.equal(s.value, TOSS_SLICES[i].value ? TOSS_SLICES[i].value : 2));
  const c = tossRing({ cons: 1 }); c.filter((s, i) => !TOSS_SLICES[i].value).forEach((s) => { assert.equal(s.value, 2.5); assert.equal(s.label, 'Good sport +1 Spoke +2.5%'); });
  assert.equal(tossAtStop(mkRng(), c, { sliceId: 0 }).id, 'won');
  assert.equal(tossRing({ cons: 1, floor: 2 })[0].value, 2.5);
});
test('old revealResult for toss unchanged', () => {
  const w = revealWheel('toss'); assert.equal(w.slices.length, 6);
  const g = mkRng(3), r = revealResult(g, w); assert.equal(g.calls, 6); assert.ok(['won', 'sport'].includes(r.id));
  assert.equal(revealWheel('toss', { floor: 3 }).slices.find((s) => s.low).fx.tossb, 3);
  assert.equal(revealWheel('toss', { cons: 1 }).slices.find((s) => s.low).fx.tossb, 2.5);
});
