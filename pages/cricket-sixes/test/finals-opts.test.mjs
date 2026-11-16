import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALS_SLICES as S } from '../js/data/wheels/finals.js';
import { paidAmount } from '../js/core/finals-paid.js';
import { finalsWheel, finalsRing } from '../js/core/wheels/finals.js';
import { finalsWheelOpts, paidOf } from '../js/ui/wheels/finals-opts.js';

const K = { Coins: 'coins', TP: 'tp', Fans: 'fans' };
const pendingOf = (s, mult) => { const n = paidAmount(s, mult); return s.type === 'Medal' ? { medal: 1, jackpot: true } : { [K[s.type]]: n, coins: 0, tp: 0, fans: 0, medal: 0, ...{ [K[s.type]]: n } }; };

for (const mult of [{ coins: 1, fans: 1 }, { coins: 1.25, fans: 1.1 }]) {
  test('label equals strip equals paid, mult ' + JSON.stringify(mult), () => {
    const vm = { ring: finalsRing(finalsWheel(null, mult)), pending: null, tokens: [] };
    const o = finalsWheelOpts(vm, { mult: undefined });
    assert.equal(o.ring.length, 12);
    S.forEach((s, i) => {
      const lab = o.ring[i].label, d = o.describe(pendingOf(s, mult));
      if (s.type === 'Medal') { assert.equal(lab, 'M'); assert.match(d.big, /Medal/); return; }
      const paid = paidAmount(s, mult);
      assert.equal(lab, String(paid));
      assert.equal(String(d.paid), lab);
      assert.ok(d.big.split(/\D+/).includes(lab), d.big + ' vs ' + lab);
      assert.equal(paidOf(pendingOf(s, mult)), paid);
    });
  });
}

test('ctx.mult re-labels rows that carry type', () => {
  const o = finalsWheelOpts({ ring: S }, { mult: { coins: 1.25, fans: 1.1 } });
  S.forEach((s, i) => { if (s.type !== 'Medal') assert.equal(o.ring[i].label, String(paidAmount(s, { coins: 1.25, fans: 1.1 }))); });
});

test('Medal legend has icon, kept strings and tokText shape', () => {
  const o = finalsWheelOpts({ ring: S, pending: null }, {});
  assert.deepEqual(o.legend, [{ ch: 'M', icon: 'medal', text: 'Gold Medal (4%)' }]);
  assert.match(o.cardHtml, /Spin for your prize\./);
  assert.equal(o.wheelId, 'finals');
  assert.equal(typeof o.tokText, 'function');
  assert.equal(o.tokText({ coins: 20 }), '20 Coins');
  assert.equal(o.tokText({ medal: 1 }), '+1 Medal');
});

test('onSpin dispatches FinalsSpin with the stop', () => {
  const calls = [];
  const o = finalsWheelOpts({ ring: S }, { dispatch: (k, p) => calls.push([k, p]) });
  o.onSpin({ sliceId: 3 });
  assert.deepEqual(calls, [['FinalsSpin', { stop: { sliceId: 3 } }]]);
});
