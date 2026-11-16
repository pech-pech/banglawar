import test from 'node:test';
import assert from 'node:assert/strict';
import { pepRing, pepAtStop, pepSteps, REVEAL_KIND } from '../js/core/wheels/pep.js';
import { PEP_SLICES } from '../js/data/wheels/pep.js';
import { revealWheel, revealResult } from '../js/core/wheels/reveal.js';
import { neutralMods } from '../js/core/wheels/common.js';

const seq = (arr) => { let n = 0; return { random: () => { n++; return arr[(n - 1) % arr.length]; }, get n() { return n; } }; };

test('ring: 12 rows, p1..p6 twice, offset rotates', () => {
  const r = pepRing();
  assert.equal(r.length, 12);
  assert.deepEqual(r.map((x) => x.slot), [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(pepRing(neutralMods(), 2).map((x) => x.slot).slice(0, 6), [3, 4, 5, 6, 1, 2]);
  r.forEach((x, i) => assert.equal(x.value, PEP_SLICES[i].value));
});

test('each sliceId gives right slot and boostPct, 6 draws', () => {
  for (const off of [0, 3]) {
    const ring = pepRing(neutralMods(), off);
    ring.forEach((row, i) => {
      const rng = seq([0.5]), o = pepAtStop(rng, ring, { sliceId: i });
      assert.equal(rng.n, 6);
      assert.equal(o.index, i); assert.equal(o.slot, row.slot); assert.deepEqual(o.slots, [row.slot]);
      assert.equal(o.id, 'slot' + row.slot); assert.equal(o.boostPct, PEP_SLICES[i].value); assert.equal(o.fx.pep, 1);
    });
  }
});

test('Pep Rally neighbour and Booster second player', () => {
  const ring = pepRing();
  const o = pepAtStop(seq([0.5, 0.5, 0.5, 0.5, 0.5, 0.2]), ring, { sliceId: 5 }, { nb: 1 });
  assert.equal(o.neighbour, true); assert.deepEqual(o.slots, [6, 1]); assert.equal(o.fx.pep, 2);
  const n = pepAtStop(seq([0.5, 0.5, 0.5, 0.5, 0.5, 0.9]), ring, { sliceId: 5 }, { nb: 1 });
  assert.equal(n.neighbour, false); assert.deepEqual(n.slots, [6]);
  // booster: bch 1, d2 picks first non-gold candidate (id 0), d3 low -> second player
  const b = pepAtStop(seq([0.5, 0, 0, 0, 0.5, 0.5]), ring, { sliceId: 0 }, { bch: 1, bval: 2 });
  assert.equal(b.boosted, true); assert.equal(b.slots.length, 2); assert.equal(b.fx.pep, 2);
});

test('old revealResult for pep unchanged', () => {
  const w = revealWheel('pep');
  const o = revealResult(seq([0.3, 0.9, 0.9, 0.9, 0.5, 0.5]), w);
  assert.ok(o.slots.length >= 1 && o.index >= 0);
  assert.equal(typeof pepSteps, 'function'); assert.equal(REVEAL_KIND.extraKey, 'pep');
});
