import test from 'node:test';
import assert from 'node:assert/strict';
import { findWheelOpts, findRingFor, findLegend } from '../js/ui/wheels/find-opts.js';

const vm = (rate, extra = {}) => ({ rate, phys: { W0: 36, SD: 0 }, pending: null, tokens: [{ kind: 'respin', count: 3 }, { kind: 'nudge', count: 1 }], tokLeft: 2, ...extra });
const ctx = (o = {}) => ({ pick: (s) => s, ...o });

test('ring per rate sums to 10 and has contract row keys', () => {
  for (const r of [0.08, 0.18, 0.26]) {
    const o = findWheelOpts(vm(r), ctx());
    assert.ok(Math.abs(o.ring.reduce((a, s) => a + s.w, 0) - 10) < 0.001);
    for (const s of o.ring) for (const k of ['id', 'w', 'value', 'label', 'tier', 'gold']) assert.ok(k in s);
    assert.equal(o.J, 1.5);
    assert.equal(o.phys.J, 1.5);
  }
  assert.equal(findRingFor(0.17), findRingFor(0.18));
});

test('labels: under 7% one character; FIND letter F at 8% and 2% block at 26%', () => {
  const a = findWheelOpts(vm(0.08), ctx());
  assert.deepEqual(a.labels.filter((l) => l === 'F').length, 2);
  assert.equal(a.legendText, 'F 4%');
  const c = findWheelOpts(vm(0.26), ctx());
  assert.equal(c.legendText, 'FIND 12%, F 2%');
  assert.deepEqual(c.legend, [{ ch: 'F', text: 'FIND 2%' }]);
  for (const o of [a, c]) o.ring.forEach((s) => { if (s.w < 0.7) assert.equal(s.label.length, 1); });
  assert.equal(findWheelOpts(vm(0.18), ctx()).legendText, '');
  assert.deepEqual(findLegend([]).legend, []);
});

test('tiers: FIND top triangle gold, CHEER mid dot', () => {
  const o = findWheelOpts(vm(0.18), ctx());
  assert.ok(o.ring.filter((s) => s.gold).every((s) => s.tier === 'top'));
  assert.ok(o.ring.filter((s) => !s.gold).every((s) => s.tier === 'mid'));
  assert.equal(o.tierShapes.top, 'triangle');
  assert.equal(o.tierShapes.mid, 'dot');
  assert.deepEqual(o.golds, o.ring.filter((s) => s.gold).map((s) => s.id));
});

test('kept strings in hint and chance text', () => {
  const o = findWheelOpts(vm(0.18), ctx());
  assert.ok(o.cardHtml.includes('Stop on a gold block to find Coins, a player or a coach.'));
  assert.ok(o.cardHtml.includes('The tick shows where it will land.'));
  assert.equal(o.plainResult, true);
  assert.ok(!('timing' in o));
});

test('onSpin passes the stop to the store pick; tokens drop nudge; results text', () => {
  let got = null;
  const o = findWheelOpts(vm(0.18), ctx({ pick: (s) => { got = s; }, useToken: (k) => k }));
  o.onSpin({ t: 3.5, sliceId: 2 });
  assert.equal(got.sliceId, 2);
  assert.deepEqual(o.tokens.map((t) => t.kind), ['respin']);
  assert.equal(o.tokens[0].count, 2);
  assert.equal(o.onToken('respin'), 'respin');
  assert.equal(o.describe({ find: true, type: 'coins', coins: 1200, bonus: 0 }).big, 'Found 1,200 Coins');
  assert.equal(o.describe({ find: false }).big, 'Nothing this time');
  assert.equal(o.describe({ find: true, type: 'player' }).big, 'Found a trial player');
  assert.equal(o.getPending(), null);
});
