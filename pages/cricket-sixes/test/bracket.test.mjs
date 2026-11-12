import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTable, applyResult, finalsDraw, koWinner, finalFrom, placeOf, inTopFour, tableOrder } from '../js/core/season.js';

const IDS = Array.from({ length: 10 }, (_, i) => `c${i}`);
// Build a table where club c<k> finishes k+1-th by giving it (9-k) wins via results against a dummy loser pool.
function ranked(order) {
  const rows = order.map((id, i) => ({ id, p: 9, w: 9 - i, l: i, t: 0, pts: 2 * (9 - i), rf: 100 - i, ra: 50 }));
  return tableOrder(rows);
}

test('top 4 qualify: semis are 1v4 and 2v3', () => {
  const t = ranked(['c7', 'c3', 'c9', 'c1', 'c0', 'c2', 'c4', 'c5', 'c6', 'c8']);
  const f = finalsDraw(t);
  assert.deepEqual(f.semis.map((s) => [s.a, s.b]), [['c7', 'c1'], ['c3', 'c9']]);
  assert.ok(f.semis.every((s) => s.winner === null));
  assert.equal(f.final.winner, null);
  assert.equal(f.final.a, null);
});

test('final = the two semi winners (1v4 winner is a, 2v3 winner is b)', () => {
  const f = finalsDraw(ranked(IDS));
  f.semis[0].winner = 'c3'; f.semis[1].winner = 'c1';
  const fin = finalFrom(f.semis);
  assert.deepEqual([fin.a, fin.b, fin.winner], ['c3', 'c1', null]);
  assert.equal(finalFrom(finalsDraw(ranked(IDS)).semis), null, 'not ready until both semis are won');
});

test('M outside the top 4: inTopFour false, no semi for c0', () => {
  const t = ranked(['c1', 'c2', 'c3', 'c4', 'c5', 'c0', 'c6', 'c7', 'c8', 'c9']);
  assert.equal(inTopFour(t, 'c0'), false);
  assert.equal(placeOf(t, 'c0'), 6);
  const f = finalsDraw(t);
  assert.ok(f.semis.every((s) => s.a !== 'c0' && s.b !== 'c0'));
  assert.equal(inTopFour(t, 'c4'), true);
  assert.equal(placeOf(t, 'c1'), 1);
});

test('equal on points for 4th place resolves by the table tie-break (run difference)', () => {
  const rows = [
    { id: 'c1', p: 9, w: 9, l: 0, t: 0, pts: 18, rf: 300, ra: 100 },
    { id: 'c2', p: 9, w: 7, l: 2, t: 0, pts: 14, rf: 300, ra: 200 },
    { id: 'c3', p: 9, w: 6, l: 3, t: 0, pts: 12, rf: 300, ra: 250 },
    { id: 'c4', p: 9, w: 5, l: 4, t: 0, pts: 10, rf: 290, ra: 260 }, // rd +30
    { id: 'c0', p: 9, w: 5, l: 4, t: 0, pts: 10, rf: 300, ra: 260 }, // rd +40 -> beats c4
    ...['c5', 'c6', 'c7', 'c8', 'c9'].map((id) => ({ id, p: 9, w: 0, l: 9, t: 0, pts: 0, rf: 0, ra: 100 })),
  ];
  const t = tableOrder(rows);
  assert.equal(placeOf(t, 'c0'), 4);
  assert.equal(inTopFour(t, 'c0'), true);
  assert.equal(inTopFour(t, 'c4'), false);
});

test('koWinner: more runs wins; a tie goes to the higher table place (no super over)', () => {
  assert.equal(koWinner({ a: 'c1', b: 'c4', ra: 50, rb: 40 }, 1, 4), 'c1');
  assert.equal(koWinner({ a: 'c1', b: 'c4', ra: 40, rb: 50 }, 1, 4), 'c4');
  assert.equal(koWinner({ a: 'c1', b: 'c4', ra: 44, rb: 44 }, 1, 4), 'c1');
  assert.equal(koWinner({ a: 'c4', b: 'c1', ra: 44, rb: 44 }, 4, 1), 'c1', 'higher place wins whichever side it is on');
  assert.equal(koWinner({ a: 'c2', b: 'c3', ra: 44, rb: 44 }, 2, 3), 'c2');
});

test('outcomes: champion, runner-up, semi loser and non-qualifier are all reachable from the draw', () => {
  const t = ranked(IDS);
  const f = finalsDraw(t);
  const semiLosers = f.semis.map((s) => (koWinner({ ...s, ra: 1, rb: 1 }, placeOf(t, s.a), placeOf(t, s.b)) === s.a ? s.b : s.a));
  assert.deepEqual(semiLosers, ['c3', 'c2']);
  assert.equal(IDS.filter((id) => !inTopFour(t, id)).length, 6);
});
