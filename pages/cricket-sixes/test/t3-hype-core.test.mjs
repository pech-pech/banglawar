import test from 'node:test';
import assert from 'node:assert/strict';
import { hypeRing, hypeAtStop, HYPE_LEVEL_OF, hypeDial, dialResult } from '../js/core/wheels/hype.js';
import { neutralMods } from '../js/core/wheels/common.js';

const counter = (v = 0.5) => { let n = 0; return { rng: { random: () => { n++; return v; } }, get n() { return n; } }; };
const sum = (r) => r.reduce((a, b) => a + b.w, 0);

test('ring sums 10 and rows carry level', () => {
  const r = hypeRing();
  assert.ok(Math.abs(sum(r) - 10) < 0.001);
  assert.deepEqual(r.map(HYPE_LEVEL_OF), ['nuts', 'med', 'low', 'med', 'high', 'low', 'med', 'low', 'high']);
});
test('Warm Crowd: HIGH pays 7, LOW unchanged', () => {
  const r = hypeRing({ ...neutralMods(), warmCrowd: 1 });
  assert.equal(r[4].value, 7); assert.equal(hypeAtStop(counter().rng, r, { sliceId: 4 }, neutralMods()).pts, 7);
  assert.equal(r[2].value, 2);
});
test('Kind Floor and Home Crowd lift LOW', () => {
  assert.equal(hypeRing({ ...neutralMods(), floor: 1 })[2].value, 3);
  const h = hypeRing({ ...neutralMods(), hfloor: 1 })[2];
  assert.equal(h.value, 4); assert.equal(h.level, 'med');
});
test('each sliceId returns row level and pts, exactly 7 draws', () => {
  const r = hypeRing();
  for (const row of r) {
    const c = counter(), x = hypeAtStop(c.rng, r, { sliceId: row.id, tInCycle: 3.5 }, neutralMods());
    assert.equal(x.index, row.id); assert.equal(x.level, row.level); assert.equal(x.pts, row.value); assert.equal(c.n, 7);
    assert.equal(x.t, 3.5); assert.equal(x.phi, 0); assert.equal(x.boosted, false);
  }
});
test('Booster: boosts only the picked non-gold slice', () => {
  const r = hypeRing(), m = { ...neutralMods(), bch: 1, bval: 1 };
  // d[6]=0 picks first non-gold = id 1
  const seq = (v6) => { let i = 0; return { random: () => (i++ === 6 ? v6 : 0.1) }; };
  const a = hypeAtStop(seq(0), r, { sliceId: 1 }, m);
  assert.equal(a.boosted, true); assert.ok(a.pts > 4);
  assert.equal(hypeAtStop(seq(0), r, { sliceId: 2 }, m).boosted, false);
  assert.equal(hypeAtStop(seq(0), r, { sliceId: 0 }, m).boosted, false);
});
test('old dialResult unchanged', () => {
  const d = hypeDial([35, 35, 20, 10]), c = counter();
  const x = dialResult(c.rng, d, false);
  assert.equal(c.n, 7); assert.ok('index' in x && 'fanMult' in x && 'x' in x);
});
