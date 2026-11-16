import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { scoutSpinVM } from '../js/store/wmstore.js';
import { scoutSpin } from '../js/store/spins/scout.js';
import { scoutRingOf, scoutCardsOf, scoutSliceRow } from '../js/store/wheels/scout.js';
import { scoutWheelOpts } from '../js/ui/wheels/scout-opts.js';
import { pepSlices } from '../js/ui/wheels/pep.js';
import { SCOUT_SLICES } from '../js/data/wheels/scout.js';
import { pepRing } from '../js/core/wheels/pep.js';

FLAGS.wheelMeta = true;
const mk = (owned) => ({ seed: 'abc', season: { n: 2, league: 3, seed: 'abc|s2' }, scout: null, wheelMeta: owned ? { tally: 0, spokes: 99, spent: 0, owned, tokens: {}, tierSeen: 0, tierUpQueue: [], swapDone: {}, tokUsed: {}, matchTokUsed: { key: '', n: 0 } } : null, training: { week: 1 }, clubs: [] });
const stop = (sliceId) => ({ stop: { sliceId, stopT: 3500, cycle: 1, tInCycle: 3.5 } });
const NAMES = ['Asif', 'Bashir', 'Chowdhury Rahman', 'Dev', 'Emon', 'Farid'];

test('Scout: no tree nodes owned = SCOUT_SLICES exactly (store ring, vm ring, 10 cards)', () => {
  const s = mk(null), vm = scoutSpinVM(s);
  assert.deepEqual(scoutRingOf(s), SCOUT_SLICES.map((c) => ({ ...c })));
  assert.deepEqual(vm.ring, SCOUT_SLICES.map((c) => ({ ...c })));
  assert.equal(vm.cards.length, 10);
});

test('Scout: owned Widener + Extra Gold ring is the SAME ring in store, vm and view; landed index matches', () => {
  const s = mk({ f_wide: 3, f_extra: 1 }), ring = scoutRingOf(s), vm = scoutSpinVM(s);
  assert.equal(ring.length, 11, 'Extra Gold adds a second +2 piece');
  assert.deepEqual(vm.ring, ring.map((c) => ({ ...c })));
  assert.equal(vm.cards.length, ring.length);
  const view = scoutWheelOpts(vm, { dispatch() {} });
  assert.equal(view.ring.length, ring.length);
  assert.deepEqual(view.ring.map((r) => [r.value, r.gold, r.w]), ring.map((r) => [r.value, r.gold, r.w]));
  assert.ok(ring[0].w > SCOUT_SLICES[0].w, 'Widener widens the +2');
  const second = ring.findIndex((r) => r.second); assert.ok(second > 0);
  assert.equal(vm.cards[second].grade, vm.cards[0].grade, 'the second +2 piece carries a +2 card');
  const n = scoutSpin(s, stop(second)), row = scoutSliceRow(n);
  assert.ok(row, 'the view can land on index 10 of the 11-slice ring');
  assert.equal(row.sliceId, second); assert.equal(row.value, ring[second].value); assert.equal(row.id, 'top2'); assert.equal(row.card.grade, vm.cards[second].grade);
  assert.equal(scoutSpin(s, stop(11)), s, 'past the ring end rejected');
  const plain = mk(null); assert.equal(scoutSpin(plain, stop(10)), plain, 'no-tree: 10 is not a slice');
  assert.equal(scoutSliceRow(scoutSpin(mk(null), stop(10))), null);
  assert.equal(scoutCardsOf(n).length, 11);
});

test('Pep: 13-slice ring prints unique short names, and 12-slice keeps pepName', () => {
  const six = ['Asif', 'Bashir', 'Chowdhury Rahman', 'Dev', 'Emon', 'Farid'];
  const r13 = pepRing({ goldAdd: 0.06, rareAdd: 0.16, extra: 1 }, 0), sl = pepSlices(r13, six);
  assert.equal(sl.length, 13);
  const names = sl.map((c) => c.label.replace(/ \+.*$/, ''));
  assert.ok(names.every((n) => Array.from(n).length <= 4 && n.length > 0 && !n.includes('..')), names.join());
  for (const p of sl) assert.ok(/ \+\d/.test(p.label));
  assert.equal(new Set(names).size, six.length, 'one distinct short name per player');
  assert.equal(pepSlices(pepRing(undefined, 0), six)[2].label, 'Rahman +5%');
});
