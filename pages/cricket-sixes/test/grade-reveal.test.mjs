import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeOf, previewCount, bandOf } from '../js/core/ability.js';
import { runNets, endWeek } from '../js/core/training.js';
import { game, player, me, fixed } from './_tr-fixture.mjs';

test('drillsHere 0 hides the grade, 1 shows it', () => {
  assert.equal(gradeOf(player({ potential: 150, drillsHere: 0 })), null);
  assert.equal(gradeOf(player({ potential: 150, drillsHere: 1 })), 'S');
});
test('reveal happens on the 1st drill, not the 2nd', () => {
  let s = game({ players: [player({ potential: 130 })], tp: 450 });
  const seen = [];
  for (let wk = 1; wk <= 6; wk++) {
    s = runNets({ ...s, training: { ...s.training, lastPlan: { focus: 'bat', effort: 'normal' } } }, fixed(0.1), {}).state;
    seen.push([me(s).drillsHere, s.training.weekLog.some((e) => e.type === 'GradeRevealed'), gradeOf(me(s))]);
    s = endWeek(s);
  }
  assert.deepEqual(seen.map((x) => x[1]), [true, false, false, false, false, false]);
  assert.deepEqual(seen.map((x) => x[2]), ['A', 'A', 'A', 'A', 'A', 'A']);
});
test('GradeRevealed is logged with the grade and shows in the week summary', () => {
  let s = game({ players: [player({ drillsHere: 0, potential: 105 })] });
  s = runNets({ ...s, training: { ...s.training, lastPlan: { focus: 'bat', effort: 'normal' } } }, fixed(0.1), {}).state;
  const ev = s.training.weekLog.find((e) => e.type === 'GradeRevealed');
  assert.deepEqual({ ...ev }, { type: 'GradeRevealed', playerId: 'p1', grade: 'C' });
  assert.deepEqual(endWeek(s).training.weekSummary.reveals, [{ playerId: 'p1', grade: 'C' }]);
});
test('a locked drill is not a drill: drillsHere stays', () => {
  const full = player({ bp: 60, bs: 60, spd: 60, bsk: 60, potential: 100, drillsHere: 4 }); // capSum(100)=178 < 240
  const s = game({ players: [full] });
  const r = runNets({ ...s, training: { ...s.training, lastPlan: { focus: 'bat', effort: 'normal' } } }, fixed(0.1), {});
  assert.equal(r.cost, 0); assert.equal(me(r.state).drillsHere, 4);
});
test('previews: 1 while hidden, then D1 C2 B3 A4 S6; band edges', () => {
  assert.equal(previewCount(player({ potential: 185, drillsHere: 0 })), 1);
  const want = { 99: 1, 100: 2, 111: 2, 112: 3, 123: 3, 124: 4, 139: 4, 140: 6, 185: 6 };
  for (const [P, n] of Object.entries(want)) assert.equal(previewCount(player({ potential: +P, drillsHere: 5 })), n, `P=${P}`);
  const edges = [[99, 'D'], [100, 'C'], [111, 'C'], [112, 'B'], [123, 'B'], [124, 'A'], [139, 'A'], [140, 'S'], [185, 'S']];
  for (const [P, g] of edges) assert.equal(bandOf(P), g);
});
test('drills at another club do not count: a new club starts at drillsHere 0 (field is per club)', () => {
  assert.equal(gradeOf(player({ potential: 150, drillsHere: 0 })), null);
});
test('P5: the grade reveals after 1 drill, with the reveal flag on the first drill', () => {
  let s = game({ players: [player({ potential: 130 })], tp: 450 });
  assert.equal(gradeOf(me(s)), null);
  s = runNets({ ...s, training: { ...s.training, lastPlan: { focus: 'bat', effort: 'normal' } } }, fixed(0.1), {}).state;
  assert.equal(me(s).drillsHere, 1);
  assert.ok(s.training.weekLog.some((e) => e.type === 'GradeRevealed'));
  assert.equal(gradeOf(me(s)), 'A');
});
