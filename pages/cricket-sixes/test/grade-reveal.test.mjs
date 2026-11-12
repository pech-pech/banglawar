import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeOf, previewCount, bandOf } from '../js/core/ability.js';
import { doDrill, endWeek } from '../js/core/training.js';
import { game, player, me, fixed } from './_tr-fixture.mjs';

test('drillsHere 0..4 hide the grade, 5 shows it', () => {
  for (let d = 0; d < 5; d++) assert.equal(gradeOf(player({ potential: 150, drillsHere: d })), null);
  assert.equal(gradeOf(player({ potential: 150, drillsHere: 5 })), 'S');
});
test('reveal happens on the 5th drill, not the 6th, and not before', () => {
  let s = game({ players: [player({ potential: 130 })], tp: 450 });
  const seen = [];
  for (let wk = 1; wk <= 6; wk++) {
    s = doDrill(s, { playerId: 'p1', drillId: wk % 2 ? 'bp' : 'bs' }, fixed(0.1));
    seen.push([me(s).drillsHere, s.training.last.revealed, gradeOf(me(s))]);
    s = endWeek(s);
  }
  assert.deepEqual(seen.map((x) => x[1]), [false, false, false, false, true, false]);
  assert.deepEqual(seen.map((x) => x[2]), [null, null, null, null, 'A', 'A']);
});
test('GradeRevealed is logged with the grade and shows in the week summary', () => {
  let s = game({ players: [player({ drillsHere: 4, potential: 105 })] });
  s = doDrill(s, { playerId: 'p1', drillId: 'bp' }, fixed(0.1));
  const ev = s.training.weekLog.find((e) => e.type === 'GradeRevealed');
  assert.deepEqual({ ...ev }, { type: 'GradeRevealed', playerId: 'p1', grade: 'C' });
  assert.deepEqual(endWeek(s).training.weekSummary.reveals, [{ playerId: 'p1', grade: 'C' }]);
});
test('a locked drill is not a drill: drillsHere stays', () => {
  const full = player({ bp: 60, bs: 60, spd: 60, bsk: 60, potential: 100, drillsHere: 4 }); // capSum(100)=178 < 240
  const s = game({ players: [full] });
  assert.equal(doDrill(s, { playerId: 'p1', drillId: 'bp' }, fixed(0.1)), s);
  assert.equal(me(s).drillsHere, 4);
});
test('previews: 1 while hidden, then D1 C2 B3 A4 S6; band edges', () => {
  assert.equal(previewCount(player({ potential: 185, drillsHere: 4 })), 1);
  const want = { 99: 1, 100: 2, 111: 2, 112: 3, 123: 3, 124: 4, 139: 4, 140: 6, 185: 6 };
  for (const [P, n] of Object.entries(want)) assert.equal(previewCount(player({ potential: +P, drillsHere: 5 })), n, `P=${P}`);
  const edges = [[99, 'D'], [100, 'C'], [111, 'C'], [112, 'B'], [123, 'B'], [124, 'A'], [139, 'A'], [140, 'S'], [185, 'S']];
  for (const [P, g] of edges) assert.equal(bandOf(P), g);
});
test('drills at another club do not count: a new club starts at drillsHere 0 (field is per club)', () => {
  assert.equal(gradeOf(player({ potential: 150, drillsHere: 0 })), null);
});
