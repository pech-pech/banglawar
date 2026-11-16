import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { scoutSpin } from '../js/store/spins/scout.js';
import { scoutSpin as wmScoutSpin, scoutSpinVM } from '../js/store/wmstore.js';
import { scoutCardsOf, scoutSliceRow, scoutSliceToken, withLandedCard, scoutSeasonId } from '../js/store/wheels/scout.js';
import { scoutNudge, scoutKeep, scoutSliceId } from '../js/core/wheels/scout.js';
import { makeScoutCards } from '../js/core/scout-cards.js';
import { scoutList } from '../js/core/training.js';
import { spinKeyOf, statsOf } from '../js/core/wheel-stops.js';
import { SCOUT_SLICES } from '../js/data/wheels/scout.js';

FLAGS.wheelMeta = true;
const base = () => ({ seed: 'abc', season: { n: 2, league: 3, seed: 'abc|s2' }, scout: null, wheelMeta: null, training: { week: 1 }, clubs: [] });
const stop = (sliceId, extra = {}) => ({ stop: { sliceId, stopT: 3500, cycle: 1, tInCycle: 3.5, ...extra } });

test('pure rules: gold neighbours, nudge, keep, slice id guard', () => {
  assert.equal(scoutSliceId(10), -1); assert.equal(scoutSliceId('1'), -1); assert.equal(scoutSliceId(0), 0);
  assert.equal(scoutNudge(1), 2); // 1 is value 0; neighbours 0 (gold) and 2 (value 1) -> 2
  assert.equal(scoutNudge(2), -1); // value 1: neighbours 1, 3 are 0 and 0
  for (let i = 0; i < 10; i++) { const t = scoutNudge(i); if (t >= 0) assert.ok(!SCOUT_SLICES[t].gold && SCOUT_SLICES[t].value > SCOUT_SLICES[i].value); }
  assert.equal(scoutKeep(1, 0), 0); assert.equal(scoutKeep(2, 4), 2); assert.equal(scoutKeep(2, 0), 0);
});

test('STOP decides from the slice table, adds that card, stores + records the stop', () => {
  const s = base(), n = scoutSpin(s, stop(0));
  assert.notEqual(n, s);
  const row = scoutSliceRow(n);
  assert.equal(row.sliceId, 0); assert.equal(row.value, 2); assert.equal(row.tokUsed, 0);
  const cards = makeScoutCards('abc', 2, 3);
  assert.deepEqual(n.wheels.scoutCards['2'], cards);
  assert.deepEqual(row.card, cards[0]);
  const e = n.wheels.stops.scout['2'];
  assert.equal(spinKeyOf(n, 'scout'), '2'); assert.equal(statsOf(n, 'scout').n, 1);
  assert.equal(e.stops.length, 1); assert.equal(e.stops[0].sliceId, 0); assert.equal(e.stops[0].value, 2); assert.equal(e.stops[0].respin, 0);
  assert.equal(n.wheels.stats.scout.n, 1);
  assert.equal(s.wheels, undefined, 'input state untouched');
  const list = withLandedCard(n, scoutList(n));
  assert.equal(list[0].name, cards[0].surname); assert.equal(list.length, scoutList(n).length + 1);
});

test('reload after STOP shows the same slice and cannot be re-spun', () => {
  const n = scoutSpin(base(), stop(4));
  const re = JSON.parse(JSON.stringify(n));
  assert.equal(scoutSliceRow(re).sliceId, 4);
  assert.deepEqual(scoutCardsOf(re), n.wheels.scoutCards['2']);
  assert.equal(scoutSpin(re, stop(7)), re);
  assert.equal(scoutSpinVM(re).stored.sliceId, 4);
  assert.equal(scoutSpinVM(re).spun, true);
});

test('before STOP: unspun, nothing stored, cards regenerate identically', () => {
  const s = base(), vm = scoutSpinVM(s);
  assert.equal(vm.stored, null); assert.equal(s.scoutSpin, undefined);
  assert.deepEqual(scoutCardsOf(s), makeScoutCards('abc', 2, 3));
  assert.equal(vm.ring.length, 10); assert.equal(vm.cards.length, 10); assert.equal(scoutSeasonId(s), '2');
});

test('bad sliceId = old reveal path (unchanged behaviour)', () => {
  const n = scoutSpin(base(), { stop: { t: 3.5 } });
  assert.deepEqual(n.scoutSpin && n.scoutSpin.sliceId, undefined);
  assert.ok(n.scoutSpin && n.scoutSpin.src);
  assert.deepEqual(scoutSpin(base(), undefined).scoutSpin.n, 2);
  assert.ok(typeof wmScoutSpin === 'function');
});

test('tokens: none on gold, at most 1 per spin, again keeps higher / tie keeps first, nudge never onto gold', () => {
  const gold = scoutSpin(base(), stop(0));
  assert.equal(scoutSliceToken(gold, { kind: 'nudge' }), gold);
  assert.equal(scoutSliceToken(gold, { kind: 'again', ...stop(2) }), gold);
  const a = scoutSpin(base(), stop(1));
  const nudged = scoutSliceToken(a, { kind: 'nudge' });
  assert.equal(scoutSliceRow(nudged).sliceId, 2); assert.equal(scoutSliceRow(nudged).tokUsed, 1);
  assert.equal(scoutSliceToken(nudged, { kind: 'nudge' }), nudged, 'second token refused');
  assert.equal(scoutSliceToken(nudged, { kind: 'again', ...stop(0) }), nudged);
  const again = scoutSliceToken(a, { kind: 'again', ...stop(0, { cycle: 2 }) });
  assert.equal(scoutSliceRow(again).sliceId, 0); assert.equal(again.wheels.stops.scout['2'].stops.length, 2); assert.equal(again.wheels.stops.scout['2'].stops[1].respin, 1);
  assert.equal(again.wheels.stops.scout['2'].kept, 1); assert.equal(again.wheels.stops.scout['2'].spent, true);
  const hi = scoutSliceToken(scoutSpin(base(), stop(1)), { kind: 'again', ...stop(4) }); // 0 vs 1: second is higher
  assert.equal(scoutSliceRow(hi).sliceId, 4);
  const t2 = scoutSliceToken(scoutSpin(base(), stop(2)), { kind: 'again', ...stop(4) }); // 1 vs 1: tie keeps first
  assert.equal(scoutSliceRow(t2).sliceId, 2);
  assert.equal(scoutSliceToken(a, { kind: 'nudge' }).wheels.stops.scout['2'].stops.length, 1, 'nudge adds no second stop');
});

test('old import paths still work', async () => {
  const w = await import('../js/store/wmstore.js'); assert.equal(typeof w.canScoutSpin, 'function'); assert.equal(typeof w.scoutSpinVM, 'function');
});
