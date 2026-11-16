// Coach Scout job: T5.1-T5.5 (T5.6 skipped, see note at the bottom).
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoutNameGain, takeBonusNames, seasonReset } from '../js/core/coach-scout.js';

const mk = (jobs, extra = {}) => ({ coaches: jobs.map((job, i) => ({ id: `c${i}`, job, away: 0 })), scout: { bonusNames: 0, extraThisSeason: 0 }, ...extra });
const week = (n) => n.coaches.reduce((a, c) => a + scoutNameGain(n, c.id), 0);

test('T5.1 a Scout week adds 1 name for the next list', () => {
  const n = mk(['scout']); assert.equal(scoutNameGain(n, 'c0'), 1);
  assert.equal(n.scout.bonusNames, 1); assert.equal(n.scout.extraThisSeason, 1);
});
test('T5.2 other jobs and away coaches add 0', () => {
  const n = mk(['nets', 'match', 'study']); assert.equal(week(n), 0);
  n.coaches.push({ id: 'cx', job: 'scout', away: 2 }); assert.equal(scoutNameGain(n, 'cx'), 0);
  assert.equal(scoutNameGain(n, 'nobody'), 0); assert.equal(n.scout.bonusNames, 0);
});
test('T5.3 cap 2 extra names a season', () => {
  const n = mk(['scout']); const got = [1, 2, 3, 4].map(() => scoutNameGain(n, 'c0'));
  assert.deepEqual(got, [1, 1, 0, 0]); assert.equal(n.scout.bonusNames, 2); assert.equal(n.scout.extraThisSeason, 2);
  assert.equal(week(mk(['scout', 'scout', 'scout'])), 2);
});
test('T5.4 queue empties when the list is built', () => {
  const n = mk(['scout']); scoutNameGain(n, 'c0'); scoutNameGain(n, 'c0');
  assert.equal(takeBonusNames(n), 2); assert.equal(n.scout.bonusNames, 0); assert.equal(takeBonusNames(n), 0);
  assert.equal(n.scout.extraThisSeason, 2); // taking names does not refund the cap
  assert.equal(scoutNameGain(n, 'c0'), 0);
  assert.equal(takeBonusNames({}), 0);
});
test('T5.5 season rollover resets the cap and drops unused names', () => {
  const n = mk(['scout']); scoutNameGain(n, 'c0'); scoutNameGain(n, 'c0');
  seasonReset(n); assert.equal(n.scout.bonusNames, 0); assert.equal(n.scout.extraThisSeason, 0);
  assert.equal(scoutNameGain(n, 'c0'), 1);
  const e = {}; seasonReset(e); assert.deepEqual(e.scout, { extraThisSeason: 0, bonusNames: 0 });
});
import { scoutList } from '../js/core/training.js';
import { TRAIN2 } from '../js/data/training.js';
const base = (seed, bonus) => ({ seed, scout: { bonusNames: bonus, extraThisSeason: 0 } });
test('T5.6 extra names follow the same grade-centre rule (1000 seeded draws)', () => {
  const norm = [], extra = [];
  for (let i = 0; i < 1000; i++) {
    const a = scoutList(base('s' + i, 0)), b = scoutList(base('s' + i, 1));
    assert.equal(b.length, a.length + 1);
    a.forEach((c) => norm.push(c.step)); extra.push(b[b.length - 1].step);
  }
  const mean = (x) => x.reduce((p, c) => p + c, 0) / x.length;
  const sd = Math.sqrt(mean(norm.map((v) => (v - mean(norm)) ** 2)));
  assert.ok(Math.abs(mean(extra) - mean(norm)) <= sd, `${mean(extra)} vs ${mean(norm)} sd ${sd}`);
});
test('scoutList grows by bonusNames, stays deterministic, ids stable, resets at season close', () => {
  const L0 = scoutList(base('x', 0));
  for (const k of [1, 2]) {
    const l = scoutList(base('x', k)); assert.equal(l.length, L0.length + k);
    assert.deepEqual(l, scoutList(base('x', k)));
    assert.deepEqual(l.slice(0, L0.length), L0); assert.equal(l[l.length - 1].id, `sc${l[0].id.match(/^sc(\d+)-/)[1]}-${L0.length + k - 1}`);
  }
  const n = base('x', 2); seasonReset(n.scout ? n : n); assert.equal(scoutList(n).length, L0.length);
});
