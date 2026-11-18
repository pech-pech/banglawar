import test from 'node:test';
import assert from 'node:assert/strict';
import { feeOf, signFee, saleBack, transferValue } from '../js/core/economy.js';
test('recruit fee is 0.35 x feeOf and sale pays 50% of it: no arbitrage', () => {
  for (const v of [5, 20, 40, 60, 90]) {
    const p = { bp: v, bs: v, spd: v, bsk: v, potential: 120 };
    assert.equal(signFee(p), Math.round(0.35 * feeOf(p)));
    assert.ok(signFee(p) > 0);
    assert.ok(saleBack(p) < signFee(p));
    assert.equal(saleBack(p), Math.round(0.5 * signFee(p)));
  }
});
