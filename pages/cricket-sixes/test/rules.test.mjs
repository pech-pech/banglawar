import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/core/rng.js';
import { eligibleBowlers, newInnings, playOver } from '../js/core/match.js';

const BATS = ['Opener', 'Opener', 'Middle', 'Middle', 'Lower', 'Lower'];
const BOWLS = ['Fast', 'Medium', 'Spin'];
function team(rng, tag) {
  return BATS.map((bat, i) => ({
    id: `${tag}${i}`, name: `${tag}${i}`, bat, bowl: BOWLS[rng.int(3)],
    bp: 1 + rng.int(99), bs: 1 + rng.int(99), spd: 1 + rng.int(99), bsk: 1 + rng.int(99),
    overs: 0, figs: { r: 0, w: 0 }, inn: { r: 0, b: 0, out: false },
  }));
}
const INT = ['D', 'R', 'A'], FLD = ['A', 'P'];

test('200 seeded innings obey bowling rules and end conditions', () => {
  let full = 0, chaseEnds = 0, wkEnds = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed);
    const bat = team(rng, 'b'), bowl = team(rng, 'w');
    const chase = seed % 2 === 0;
    const inn = newInnings(bat, bowl, chase ? 20 + rng.int(60) : null);
    let last = null; const used = [];
    while (!inn.done) {
      const over = inn.over;
      const el = eligibleBowlers(bowl, over, last);
      assert.ok(el.length > 0, `seed ${seed} over ${over}: no eligible bowler`);
      assert.ok(!el.includes(last), 'same bowler twice running offered');
      for (const i of el) assert.ok(bowl[i].overs < 2, 'bowler with 2 overs offered');
      const bi = rng.pick(el);
      const balls = playOver(rng, inn, bat, bowl, bi, rng.pick(INT), rng.pick(FLD));
      assert.ok(balls.length >= 1 && balls.length <= 6);
      if (!inn.done) assert.equal(balls.length, 6, 'a not-finished over has six balls');
      assert.notEqual(bi, last, `seed ${seed}: bowler twice running`);
      used.push(bi); last = bi;
      assert.ok(inn.over <= 11);
    }
    for (const p of bowl) assert.ok(p.overs <= 2, 'max 2 overs');
    assert.ok(inn.balls <= 60 && inn.wk <= 5);
    const finishedByRule = inn.wk >= 5 || inn.balls >= 60 || (inn.target != null && inn.runs > inn.target);
    assert.ok(finishedByRule, `seed ${seed}: innings ended for no rule (wk ${inn.wk}, balls ${inn.balls})`);
    if (inn.target != null && inn.runs > inn.target) chaseEnds++;
    if (inn.wk >= 5) wkEnds++;
    if (inn.balls === 60 && inn.over > 10) {
      full++;
      assert.equal(used.length, 10);
      assert.equal(new Set(used).size, 6, `seed ${seed}: not all six bowled`);
      for (const p of bowl) assert.ok(p.overs >= 1 && p.overs <= 2);
    }
  }
  assert.ok(full > 20, `too few full innings (${full}) to be meaningful`);
  assert.ok(chaseEnds > 0 && wkEnds > 0, `coverage: chase ${chaseEnds}, wickets ${wkEnds}`);
});

test('eligibleBowlers basics', () => {
  const t = BATS.map((_, i) => ({ overs: 0 }));
  assert.deepEqual(eligibleBowlers(t, 1, null), [0, 1, 2, 3, 4, 5]);
  assert.ok(!eligibleBowlers(t, 2, 3).includes(3));
  t[0].overs = 2; assert.ok(!eligibleBowlers(t, 5, null).includes(0));
});
