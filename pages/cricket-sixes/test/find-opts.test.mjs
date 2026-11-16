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
  assert.ok(o.cardHtml.includes('The tick shows the slice under the pointer now.'));
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
  assert.equal(o.describe({ find: false }).big, 'CHEER! No find this time.');
  assert.equal(o.describe({ find: true, type: 'player' }).big, 'Found a trial player');
  assert.equal(o.getPending(), null);
});

test('Second Cheer label reads cheerDone, not second (second = Extra Gold block)', () => {
  const d = (pending) => findWheelOpts(vm(0.18), ctx()).describe(pending);
  assert.ok(!d({ find: true, type: 'coins', second: true, cheerDone: false }).line.includes('Second Cheer'), 'Extra Gold find is not a Cheer');
  assert.ok(d({ find: true, type: 'coins', second: false, cheerDone: true }).line.includes('Second Cheer'), 'a find won by the Cheer shows it');
  assert.ok(d({ find: false, second: false, cheerDone: true }).line.includes('Second Cheer'));
});

// QA 26% Banner Night: log said FOUND, card said Nothing. The ring drawn must be the store wheel's own rows (tree mods add / widen FIND blocks).
import { findWheel } from '../js/core/wheels/find.js';
for (const [pct, mods] of [[26, { extra: 1 }], [26, { goldAdd: 0.3, extra: 1 }], [8, { extra: 1 }], [26, {}]]) {
  test('Find ring follows the store wheel rows at ' + pct + '% ' + JSON.stringify(mods) + ': landed slice = card = log', () => {
    const w = findWheel({ find: pct, mix: { coins: 1 } }, mods);
    const o = findWheelOpts(vm(w.rate, { rows: w.rows }), ctx());
    assert.equal(o.ring.length, w.cells.length);
    assert.deepEqual(o.ring.map((r) => r.gold), w.cells.map((c) => c.find));
    w.cells.forEach((c, i) => {
      const pend = c.find ? { index: i, find: true, type: 'coins', coins: 500, bonus: 0 } : { index: i, find: false };
      const p = findWheelOpts(vm(w.rate, { rows: w.rows, pending: pend }), ctx()).getPending();
      const log = o.aria.landed({ sliceId: i }, pend), card = o.describe(p).big;
      assert.equal(/^Landed: FIND/.test(log), !!c.find);
      assert.equal(card.startsWith('Found'), !!c.find, 'card follows slice ' + i);
      assert.equal(p.jackpot, !!c.find);
    });
  });
}

// 20-spin loop at 26% (with and without Extra Gold): stop on every slice id; log text, ring[sliceId], pending.find and card text all agree.
import { FIND_CHEER_PRIZE } from '../js/ui/wheels/find-opts.js';
for (const mods of [{}, { extra: 1 }]) {
  test('20-spin loop, Find 26% ' + JSON.stringify(mods) + ': log = ring = pending = card', () => {
    const w = findWheel({ find: 26, mix: { coins: 1 } }, mods);
    let n = 0;
    for (let spin = 0; spin < 20; spin++) {
      const i = spin % w.cells.length, find = !!w.cells[i].find;
      const pend = find ? { index: i, find: true, type: 'coins', coins: 500, bonus: 0 } : { index: i, find: false };
      const o = findWheelOpts(vm(w.rate, { rows: w.rows, pending: pend }), ctx());
      const p = o.getPending(), log = o.aria.landed({ sliceId: i }), card = o.describe(p);
      assert.equal(o.ring[i].gold, find, 'ring[sliceId] gold = pending.find');
      assert.equal(p.find, find);
      assert.equal(/^Landed: FIND/.test(log), find, 'log text');
      assert.equal(card.big.startsWith('Found'), find, 'card text');
      if (!find) {
        assert.equal(card.big, 'CHEER! No find this time.'); assert.ok(log.includes('No find this time') && card.say.includes('No find this time'));
        assert.ok(!('sub' in o.ring[i]), 'no prize: no row.sub');
        const op = findWheelOpts(vm(w.rate, { rows: w.rows, pending: pend, cheerPrize: '+5 Zest' }), ctx()), cp = op.describe(op.getPending());
        assert.ok(cp.big.includes('+5 Zest') && op.aria.landed({ sliceId: i }).includes('+5 Zest') && cp.say.includes('+5 Zest') && op.ring[i].sub === '+5 Zest', 'prize only when vm.cheerPrize is set');
      }
      n++;
    }
    assert.equal(n, 20);
  });
}
