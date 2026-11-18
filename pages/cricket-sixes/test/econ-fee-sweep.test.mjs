// Fee sweep: 200 seeded players x hidden/revealed grade x every payout path. A sale never pays the fee back, and sign-then-sell never gains Coins.
// Paths: SellPlayer (sell and release are the same command), board forced sale (applyMatch after two missed wage rounds). Migration refund (save-migrate refundValue) is exempt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/core/rng.js';
import { signFee, saleBack, transferValue, newEconomy, applyMatch } from '../js/core/economy.js';
import { applyCommand } from '../js/store/commands.js';

const rng = makeRng('econ-fee-sweep');
const N = 200;
/** 200 players spread over every grade (ability 1..99, one stat each or all four) and every potential 20..200. */
const players = Array.from({ length: N }, (_, i) => {
  const lo = 1 + (i % 10) * 9, v = () => Math.min(99, lo + rng.int(10));
  return { id: 'x' + i, name: 'X' + i, bat: 'Middle', bowl: 'Medium', bp: v(), bs: v(), spd: v(), bsk: v(), potential: 20 + Math.round((i / (N - 1)) * 180) % 181 + 0, nodes: { bat: 0, bowl: 0 } };
});
const view = (p, revealed) => ({ ...p, drillsHere: revealed ? 1 + rng.int(5) : 0 });
const tag = (p, rv) => `${p.id} bp${p.bp} bs${p.bs} spd${p.spd} bsk${p.bsk} pot${p.potential} ${rv ? 'revealed' : 'hidden'}`;
const filler = (i) => ({ id: 'f' + i, name: 'F' + i, bat: 'Middle', bowl: 'Medium', bp: 30, bs: 30, spd: 30, bsk: 30, potential: 100, drillsHere: 0, nodes: { bat: 0, bowl: 0 } });
const base = (target, coins) => {
  const six = [0, 1, 2, 3, 4, 5].map(filler);
  return { seed: 'e', stage: 'squad', season: { league: 1, n: 1, round: 1, phase: 'league' }, plan: {}, clubs: [{ id: 'c0', name: 'Mine', squad: [...six, target], six: six.map((p) => p.id) }], econ: { ...newEconomy(), coins } };
};

test('every payout path stays below the signing fee, hidden or revealed grade', () => {
  for (const p0 of players) for (const rv of [false, true]) {
    const p = view(p0, rv), fee = signFee(p), w = tag(p, rv);
    assert.ok(fee > 0, 'fee positive ' + w);
    assert.ok(transferValue(p) <= saleBack(p), 'transferValue <= 0.5 x fee ' + w);
    assert.ok(saleBack(p) < fee, 'saleBack < fee ' + w);
    // SellPlayer (sale and release)
    const s = base(p, 1000), after = applyCommand(s, 'SellPlayer', { id: p.id });
    assert.ok(!after.clubs[0].squad.some((x) => x.id === p.id), 'sold ' + w);
    const got = after.econ.coins - 1000;
    assert.ok(got <= saleBack(p) && got < fee, `SellPlayer paid ${got}, fee ${fee} ${w}`);
    // board forced sale: broke, one missed round already, target is the only player outside the Six
    const b = base(p, 0); b.econ.missed = 1; b.econ.arrears = 1e7;
    const out = applyMatch(b, {}), row = out.econ.ledger.filter((r) => r.k === 'sale').pop();
    assert.ok(row, 'board sold him ' + w);
    assert.ok(row.value <= saleBack(p) && row.value < fee, `board sale paid ${row.value}, fee ${fee} ${w}`);
  }
});

test('sign-then-sell loop never gains Coins (hidden and revealed)', () => {
  for (const p0 of players) for (const rv of [false, true]) {
    const p = view(p0, rv), fee = signFee(p);
    let coins = 5000; const start = coins;
    for (let k = 0; k < 5; k++) {
      coins -= fee;
      const after = applyCommand(base(p, coins), 'SellPlayer', { id: p.id });
      coins = after.econ.coins;
      assert.ok(coins < start, `loop ${k} gained: ${coins} vs ${start} ${tag(p, rv)}`);
    }
    assert.ok(coins <= start - 5 * (fee - saleBack(p)), 'net loss per cycle ' + tag(p, rv));
  }
});
