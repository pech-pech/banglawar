import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeStatus, unlockNode, treeBoost, playerFx, makeFx } from '../js/core/skills.js';
import { doDrill, endWeek } from '../js/core/training.js';
import { game, player, coach, me, fixed } from './_tr-fixture.mjs';

const lv3 = (focus) => coach({ lv: { Power: 0, Technique: 0, Pace: 0, Craft: 0, [focus]: 3 } });
const COST = [30, 45, 75, 120, 180];

test('nodes unlock in order 1..5 at 30/45/75/120/180 TP', () => {
  let s = game({ players: [player()], coaches: [lv3('Craft')], tp: 1000 });
  assert.equal(unlockNode(s, { playerId: 'p1', side: 'bowl', node: 2 }), s, 'out of order is refused');
  let tp = 1000;
  for (let n = 1; n <= 5; n++) {
    assert.equal(nodeStatus(s, 'p1', 'bowl', n).cost, COST[n - 1]);
    s = unlockNode(s, { playerId: 'p1', side: 'bowl', node: n }); tp -= COST[n - 1];
    assert.equal(me(s).nodes.bowl, n); assert.equal(s.training.tp, tp);
    s = endWeek(s);
  }
  assert.equal(unlockNode(s, { playerId: 'p1', side: 'bowl', node: 5 }), s, 'already owned');
});
test('one node per player per week, and it does not use the drill', () => {
  let s = game({ tp: 1000 });
  s = unlockNode(s, { playerId: 'p1', side: 'bat', node: 1 });
  assert.equal(nodeStatus(s, 'p1', 'bat', 2).reason, 'week');
  assert.equal(unlockNode(s, { playerId: 'p1', side: 'bowl', node: 1 }), s, 'the other tree is the same player: refused');
  assert.equal(s.training.drilled.p1, undefined);
  const t = doDrill(s, { playerId: 'p1', drillId: 'bp' }, fixed(0.1));
  assert.equal(t.training.tp, 1000 - 30 - 15);
  assert.equal(nodeStatus(endWeek(s), 'p1', 'bat', 2).status, 'available');
});
test('not enough TP is refused', () => {
  const s = game({ tp: 29 });
  assert.equal(unlockNode(s, { playerId: 'p1', side: 'bat', node: 1 }), s);
  assert.equal(nodeStatus(s, 'p1', 'bat', 1).reason, 'tp');
});
test('Top node needs a matching coach at level 3+ at the moment of unlocking only', () => {
  const four = player({ nodes: { bat: 4, bowl: 0 } }); // Middle: Technique
  const no = game({ players: [four], coaches: [lv3('Power')], tp: 500 });
  assert.equal(nodeStatus(no, 'p1', 'bat', 5).reason, 'coach');
  assert.equal(unlockNode(no, { playerId: 'p1', side: 'bat', node: 5 }), no);
  const low = game({ players: [four], coaches: [coach({ lv: { Power: 0, Technique: 2, Pace: 0, Craft: 0 } })], tp: 500 });
  assert.equal(nodeStatus(low, 'p1', 'bat', 5).reason, 'coach');
  const ok = game({ players: [four], coaches: [lv3('Technique')], tp: 500 });
  const done = unlockNode(ok, { playerId: 'p1', side: 'bat', node: 5 });
  assert.equal(me(done).nodes.bat, 5);
  // coach leaves: the skill stays
  assert.equal(me({ ...done, coaches: [] }).nodes.bat, 5);
});
test('a coach still only a candidate does not count', () => {
  const s = game({ players: [player({ nodes: { bat: 4, bowl: 0 } })], coaches: [{ ...lv3('Technique'), candidate: true }], tp: 500 });
  assert.equal(nodeStatus(s, 'p1', 'bat', 5).reason, 'coach');
});
test('treeBoost x1.5 with a matching level 3+ coach, x1 without (leaves) or below level 3', () => {
  assert.equal(treeBoost([lv3('Technique')], 'Middle'), 1.5);
  assert.equal(treeBoost([lv3('Technique')], 'Opener'), 1.5);
  assert.equal(treeBoost([lv3('Power')], 'Lower'), 1.5);
  assert.equal(treeBoost([lv3('Pace')], 'Fast'), 1.5);
  assert.equal(treeBoost([lv3('Craft')], 'Spin'), 1.5);
  assert.equal(treeBoost([lv3('Craft')], 'Medium'), 1.5);
  assert.equal(treeBoost([lv3('Power')], 'Middle'), 1);
  assert.equal(treeBoost([], 'Middle'), 1);
  assert.equal(treeBoost([coach({ lv: { Power: 0, Technique: 2, Pace: 0, Craft: 0 } })], 'Middle'), 1);
});
test('playerFx scales every effect x1.5 with the coach and keeps the skill without', () => {
  const p = player({ bat: 'Lower', bowl: 'Fast', nodes: { bat: 3, bowl: 2 } });
  const plain = playerFx(p, []), boosted = playerFx(p, [lv3('Power'), lv3('Pace')]);
  assert.deepEqual(plain.bat.eff.map((e) => [e.k, e.ph]), [['wicket', 2], ['six', 2]]);
  assert.equal(plain.bat.eff[0].v, -0.006); assert.equal(plain.bat.bad, 1.5);
  assert.equal(boosted.bat.eff[0].v, -0.006 * 1.5); assert.equal(boosted.bat.bad, 1.5 * 1.5);
  assert.equal(plain.bowl.eff.length, 1); // Fast N1: wicket +0.15 overs 1-3 (N2 is a Great reduction)
  assert.equal(plain.bowl.great, 2); assert.equal(boosted.bowl.great, 3);
  assert.equal(playerFx(player(), []), null, 'no nodes -> no fx');
});
test('Burst is only the top node of Fast and Spin', () => {
  const f = playerFx(player({ bowl: 'Fast', nodes: { bat: 0, bowl: 5 } }), []);
  assert.equal(f.bowl.burst, 0.015);
  assert.equal(playerFx(player({ bowl: 'Spin', nodes: { bat: 0, bowl: 5 } }), []).bowl.burst, 0.015);
  assert.equal(playerFx(player({ bowl: 'Medium', nodes: { bat: 0, bowl: 5 } }), []).bowl.burst, undefined);
  assert.equal(playerFx(player({ bowl: 'Fast', nodes: { bat: 0, bowl: 4 } }), []).bowl.burst, undefined);
});
test('makeFx.of reads a player by object and returns undefined for nodeless or foreign players', () => {
  const p = player({ nodes: { bat: 1, bowl: 0 } });
  const fx = makeFx([]);
  assert.ok(fx.of(p)); assert.equal(fx.of(player()), undefined);
});
