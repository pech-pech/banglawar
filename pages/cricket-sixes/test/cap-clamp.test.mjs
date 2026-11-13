import test from 'node:test';
import assert from 'node:assert/strict';
import { shownAbility, shownBat, shownBowl, capSum, atPeak, isMax, rollPotential } from '../js/core/ability.js';
import { drillRoom, runNets, netsPreview } from '../js/core/training.js';
import { game, player, me, fixed } from './_tr-fixture.mjs';

const hi = (o = {}) => player({ bp: 70, bs: 70, spd: 70, bsk: 70, ...o });   // shown ability ~ 133

test('NO clamp while the grade is hidden: shown ability goes above potential, and isMax is false', () => {
  for (const d of [0]) {
    const p = hi({ potential: 100, drillsHere: d });
    assert.ok(shownAbility(p) > 100, `d=${d} ${shownAbility(p)}`);
    assert.ok(shownBat(p) > 100 && shownBowl(p) > 100);
    assert.equal(isMax(p), false);
  }
});
test('from the 1st drill the clamp applies at once and max shows', () => {
  const p = hi({ potential: 100, drillsHere: 5 });
  assert.equal(shownAbility(p), 100); assert.equal(shownBat(p), 100); assert.equal(shownBowl(p), 100);
  assert.equal(isMax(p), true);
  assert.equal(isMax(hi({ potential: 150, drillsHere: 5 })), false);
});
test('the 1st drill flips the shown value from unclamped to clamped', () => {
  // Lower/Fast, sum 170 under the cap sum 176, shown 104 above potential 100 while hidden
  const p = player({ bat: 'Lower', bowl: 'Fast', bp: 57, bs: 28, spd: 57, bsk: 28, potential: 100, drillsHere: 0 });
  assert.equal(shownAbility(p), 104);
  let s = game({ players: [p], plan: { focus: 'bat', effort: 'normal' } });
  s = runNets(s, fixed(0.1), {}).state;
  assert.equal(me(s).drillsHere, 1);
  assert.equal(shownAbility(me(s)), 100); assert.equal(isMax(me(s)), true);
});
test('atPeak: sum of ratings equals the cap sum (2A)', () => {
  const P = 120, cap = capSum(P);
  assert.equal(atPeak(player({ potential: P, bp: cap / 4, bs: cap / 4, spd: cap / 4, bsk: cap / 4 })), true);
  assert.equal(atPeak(player({ potential: P })), false);
});
test('capSum formula and the current-sum + 12 floor', () => {
  for (let P = 20; P <= 185; P++) assert.equal(capSum(P), Math.round(4 * (1 + (P - 20) * 98 / 180)));
  const rng = { normalish: () => 60 };
  assert.ok(capSum(rollPotential(rng, { minCapSum: 200 })) >= 200);
});
test('room 0 skips the player: not charged, no roll', () => {
  const P = 100, cap = capSum(P); // 178
  const p = player({ potential: P, bp: 44, bs: 44, spd: 45, bsk: 45 });
  assert.equal(drillRoom(p, 'bp').locked, true);
  const s = game({ players: [p], plan: { focus: 'bat', effort: 'normal' } });
  assert.deepEqual(netsPreview(s).skippedIds, ['p1']); assert.equal(runNets(s, fixed(0.99), {}).cost, 0);
  assert.equal(cap, 178);
});
test('room under 3 cuts the gain to the room and still costs the effort', () => {
  const P = 100, cap = capSum(P);
  const p = player({ potential: P, bp: 44, bs: 44, spd: 44, bsk: 45 }); // sum 177, room 1
  assert.equal(cap - 177, 1);
  const r = drillRoom(p, 'bp'); assert.equal(r.room, 1); assert.equal(r.why, 'cap');
  const t = runNets(game({ players: [p], plan: { focus: 'bat', effort: 'normal' } }), fixed(0.99), {}).state; // Great (+3) cut to +1
  assert.equal(me(t).bp, 45); assert.equal(t.training.tp, 437);
});
test('balance rule: a rating cannot go more than 15 above the lowest; cut then locked', () => {
  const p = player({ potential: 185, bp: 50, bs: 36, spd: 40, bsk: 40 }); // lowest 36 -> limit 51
  assert.equal(drillRoom(p, 'bp').room, 1); assert.equal(drillRoom(p, 'bp').why, 'balance');
  const t = runNets(game({ players: [p], plan: { focus: 'bat', effort: 'normal' } }), fixed(0.99), {}).state; // bat rolls on the lower of bp/bs: bs 36
  assert.equal(me(t).bs, 39);
  const q = player({ potential: 185, bp: 51, bs: 36, spd: 40, bsk: 40 });
  const d = drillRoom(q, 'bp'); assert.equal(d.locked, true); assert.equal(d.lowest, 36);
  assert.deepEqual(netsPreview(game({ players: [q], plan: { focus: 'bat', effort: 'normal' } })).skippedIds, []);
  assert.equal(drillRoom(q, 'bs').locked, false);
});
test('the limit moves up as soon as the lowest rating rises', () => {
  const q = player({ potential: 185, bp: 51, bs: 37, spd: 40, bsk: 40 });
  assert.equal(drillRoom(q, 'bp').room, 1);
});
test('hard cap 99 and integers', () => {
  const p = player({ potential: 185, bp: 98, bs: 85, spd: 85, bsk: 85 });
  assert.equal(drillRoom(p, 'bp').room, 1); assert.equal(drillRoom(p, 'bp').why, 'max');
  const t = runNets(game({ players: [p, ], plan: { focus: 'bat', effort: 'normal' } }), fixed(0.99), {}).state;
  assert.equal(me(t).bs, 88); assert.equal(me(t).bp, 98);
  assert.equal(drillRoom(me(t), 'bp').room, 1); assert.equal(drillRoom({ ...me(t), bp: 99 }, 'bp').locked, true);
  for (const k of ['bp', 'bs', 'spd', 'bsk']) assert.ok(Number.isInteger(me(t)[k]));
});
test('superstar roll stays out of M0: rollPotential never exceeds the limit with no floor', () => {
  const rng = { normalish: () => 400 };
  assert.ok(rollPotential(rng, {}) <= 185);
});
