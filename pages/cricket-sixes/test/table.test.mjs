import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTable, applyResult, tableOrder, tpAward, makeSchedule } from '../js/core/season.js';
import { makeRng } from '../js/core/rng.js';

const IDS = Array.from({ length: 10 }, (_, i) => `c${i}`);
const res = (a, b, ra, rb, extra = {}) => ({ round: 1, kind: 'league', a, b, ra, wa: 2, rb, wb: 3, winner: ra > rb ? a : ra < rb ? b : null, ...extra });
const row = (t, id) => t.find((r) => r.id === id);

test('points: win 2, tie 1, loss 0; rf/ra are runs for and against', () => {
  let t = makeTable(IDS);
  t = applyResult(t, res('c0', 'c1', 60, 50));
  t = applyResult(t, res('c2', 'c3', 40, 40));
  assert.deepEqual(row(t, 'c0'), { id: 'c0', p: 1, w: 1, l: 0, t: 0, pts: 2, rf: 60, ra: 50 });
  assert.deepEqual(row(t, 'c1'), { id: 'c1', p: 1, w: 0, l: 1, t: 0, pts: 0, rf: 50, ra: 60 });
  assert.equal(row(t, 'c2').pts, 1);
  assert.equal(row(t, 'c3').t, 1);
});

test('order by points first (a tie on 1 point sits between a win and a loss)', () => {
  let t = makeTable(IDS);
  t = applyResult(t, res('c5', 'c0', 100, 30)); // c5 2 pts, c0 0
  t = applyResult(t, res('c6', 'c1', 31, 30)); // c6 2 pts, c1 0
  t = applyResult(t, res('c7', 'c8', 40, 40)); // both 1
  assert.deepEqual(t.map((r) => r.pts), [2, 2, 1, 1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(t.slice(0, 2).map((r) => r.id), ['c5', 'c6'], 'then run difference');
});

test('tie-break 1: run difference (rf - ra)', () => {
  let t = makeTable(IDS);
  t = applyResult(t, res('c4', 'c8', 70, 60)); // c4 +10
  t = applyResult(t, res('c2', 'c9', 90, 50)); // c2 +40
  assert.deepEqual(t.slice(0, 2).map((r) => r.id), ['c2', 'c4']);
});

test('tie-break 2: wins (same points and run difference)', () => {
  // c1: one win (2 pts), rd +10. c2: two ties (2 pts), rd +10 (rows built directly: a tie has rd 0).
  const rows = [
    { id: 'c1', p: 1, w: 1, l: 0, t: 0, pts: 2, rf: 60, ra: 50 },
    { id: 'c2', p: 2, w: 0, l: 0, t: 2, pts: 2, rf: 60, ra: 50 },
  ];
  assert.deepEqual(tableOrder(rows).map((r) => r.id), ['c1', 'c2']);
  assert.deepEqual(tableOrder(rows.slice().reverse()).map((r) => r.id), ['c1', 'c2']);
});

test('tie-break chain ends in club id, never rng: identical rows order by id in any input order', () => {
  const base = IDS.map((id) => ({ id, p: 0, w: 0, l: 0, t: 0, pts: 0, rf: 0, ra: 0 }));
  const want = IDS.slice();
  for (const seed of ['a', 'b', 'c', 'd', 'e']) {
    const shuffled = makeRng(seed).shuffle(base.slice());
    assert.deepEqual(tableOrder(shuffled).map((r) => r.id), want);
  }
});

test('order is a pure function of results (no mutation, repeatable)', () => {
  const rows = [
    { id: 'c3', p: 1, w: 0, l: 1, t: 0, pts: 0, rf: 1, ra: 2 },
    { id: 'c1', p: 1, w: 1, l: 0, t: 0, pts: 2, rf: 2, ra: 1 },
  ];
  const before = JSON.stringify(rows);
  const a = tableOrder(rows), b = tableOrder(rows);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(a, b);
  assert.notEqual(a, rows);
});

test('applyResult does not mutate its input and ignores an invalid result', () => {
  const t = makeTable(IDS);
  const before = JSON.stringify(t);
  const n = applyResult(t, res('c0', 'c1', 10, 5));
  assert.equal(JSON.stringify(t), before);
  assert.notDeepEqual(n, t);
  assert.deepEqual(applyResult(t, res('c0', 'c0', 10, 5)), t);
  assert.deepEqual(applyResult(t, res('c0', 'zz', 10, 5)), t);
});

test('full season of 45 matches: played, won, lost, tied and points sum', () => {
  const rng = makeRng('table-full');
  const sched = makeSchedule(IDS, makeRng('table-sched')).flat();
  let t = makeTable(IDS);
  for (const { a, b } of sched) {
    const ra = rng.int(5) * 10 + 20 + (rng.int(4) === 0 ? 0 : rng.int(40)), rb = rng.int(5) * 10 + 20 + rng.int(40);
    t = applyResult(t, res(a, b, ra, rb));
  }
  assert.equal(t.length, 10);
  assert.ok(t.every((r) => r.p === 9 && r.w + r.l + r.t === 9 && r.pts === 2 * r.w + r.t));
  const sum = (k) => t.reduce((s, r) => s + r[k], 0);
  assert.equal(sum('p'), 90);
  assert.equal(sum('w'), sum('l'));
  assert.equal(sum('pts'), 90);
  assert.equal(sum('rf'), sum('ra'));
  const ord = tableOrder(t);
  assert.deepEqual(t.map((r) => r.id), ord.map((r) => r.id), 'table is kept sorted');
});

test('tpAward: league 60, +30 for a win; knockouts 75 / 200 / 400', () => {
  assert.equal(tpAward('league', 'won'), 90);
  assert.equal(tpAward('league', 'tied'), 60);
  assert.equal(tpAward('league', 'lost'), 60);
  assert.equal(tpAward('semi', 'lost'), 75);
  assert.equal(tpAward('semi', 'won'), 0);
  assert.equal(tpAward('final', 'lost'), 200);
  assert.equal(tpAward('final', 'won'), 400);
});
