// Checker's independent spec test: recruit fee = 0.35 x feeOf, sale pays 50% of the fee paid, no arbitrage, Coins never negative.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { feeOf } from '../js/core/economy.js';
import { recruitList } from '../js/core/recruit.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const endGame = (seed, coins) => { const s = clone(C(null, 'NewGame', { seed })); s.stage = 'end'; s.econ.coins = coins; return s; };
// One-line rounding tolerance: the spec fixes the ratio, not the rounding mode.
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1, `${a} vs ${b}`);

test('season-end recruit costs 0.35 x feeOf', () => {
  for (const seed of ['f1', 'f2', 'f3', 'f4']) {
    const s = endGame(seed, 100000);
    for (const r of recruitList(s)) {
      const t = clone(s); t.clubs[0].squad.pop(); // free a seat
      const n = C(t, 'SignRecruit', { id: r.id });
      if (n === t) continue;
      assert.ok(n.clubs[0].squad.some((p) => p.id === r.id), 'signed');
      near(t.econ.coins - n.econ.coins, 0.35 * feeOf(r));
      assert.ok(n.econ.coins >= 0);
    }
  }
});

test('selling a fresh signing pays 50% of the fee paid; no arbitrage loop', () => {
  for (const seed of ['g1', 'g2', 'g3']) {
    let s = endGame(seed, 100000); s.clubs[0].squad.pop();
    const r = recruitList(s)[0];
    const before = s.econ.coins;
    s = C(s, 'SignRecruit', { id: r.id });
    const fee = before - s.econ.coins;
    assert.ok(fee > 0);
    const mid = s.econ.coins;
    const sold = C(s, 'SellPlayer', { id: r.id });
    assert.ok(!sold.clubs[0].squad.some((p) => p.id === r.id), 'sold');
    const back = sold.econ.coins - mid;
    near(back, 0.5 * fee);
    assert.ok(back < fee, 'sale value below fee paid');
    assert.ok(sold.econ.coins < before, 'net loss on a sign-then-sell round trip');
  }
});

test('repeated sign/sell cycles never gain Coins and never go negative', () => {
  let s = endGame('loop', 3000); s.clubs[0].squad.pop();
  const start = s.econ.coins;
  for (let i = 0; i < 6; i++) {
    const r = recruitList(s)[0];
    const n = C(s, 'SignRecruit', { id: r.id });
    if (n.econ.coins < 0) assert.fail('negative after sign');
    if (n !== s) { s = C(n, 'SellPlayer', { id: r.id }); s.recruit = null; }
    assert.ok(s.econ.coins >= 0 && s.econ.coins <= start, `coins ${s.econ.coins}`);
  }
});

test('cannot sign a recruit you cannot afford; Coins stay put', () => {
  const s = endGame('poor', 0); s.clubs[0].squad.pop();
  const r = recruitList(s)[0];
  const n = C(s, 'SignRecruit', { id: r.id });
  assert.ok(n.econ.coins >= 0);
  assert.ok(!n.clubs[0].squad.some((p) => p.id === r.id), 'refused');
});

test('scout/trial sign costs 0.35 x feeOf, sale pays half of it, poor club refused', () => {
  const base = endGame('trial', 100000); base.clubs[0].squad.pop();
  const p = { ...recruitList(base)[0], id: 'tr-x', name: 'Zed Trial' };
  const mk = (coins) => { const s = clone(base); s.econ.coins = coins; s.stage = 'squad'; s.trial = { kind: 'player', player: clone(p), wage: 0, from: 'x', key: 'k' }; return s; };
  const s = mk(100000), n = C(s, 'SignTrial');
  assert.ok(n.clubs[0].squad.some((q) => q.id === 'tr-x'), 'signed');
  const fee = s.econ.coins - n.econ.coins;
  near(fee, 0.35 * feeOf(p));
  const m = clone(n); m.stage = 'end';
  const back = C(m, 'SellPlayer', { id: 'tr-x' }).econ.coins - m.econ.coins;
  near(back, 0.5 * fee); assert.ok(back < fee);
  const poor = C(mk(Math.max(0, fee - 1)), 'SignTrial');
  assert.ok(poor.econ.coins >= 0);
});
