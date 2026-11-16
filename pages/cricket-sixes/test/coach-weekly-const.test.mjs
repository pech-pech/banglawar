// SPEC s12 T1.1, T1.6, T1.7, T1.9: coach weekly constants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as C from '../js/data/coach-weekly.js';

const SPEC = '/mnt/project-files/games-design/cricket-sixes/2026-11-16-coach-weekly/SPEC.md';

test('T1.1 constants load from one module', () => {
  for (const k of ['COACH_JOBS', 'XP_NETS', 'XP_NETS_WEAK', 'XP_MATCH', 'XP_WIN_MULT', 'XP_STUDY', 'XP_SCOUT',
    'XP_PER_STEP', 'XP_MAX_STEP', 'COURSE_MAX_STEP', 'COURSES_PER_SEASON', 'SCOUT_NAMES_PER_JOB', 'SCOUT_NAMES_MAX_SEASON']) {
    assert.notEqual(C[k], undefined, k);
  }
});

test('T1.6 XP_PER_STEP shape', () => {
  const a = C.XP_PER_STEP;
  assert.equal(a.length, 20);
  for (let k = 1; k <= 17; k++) assert.equal(a[k - 1], 60 + 14 * k);
  for (let k = 1; k < 17; k++) assert.ok(a[k] > a[k - 1]);
  assert.deepEqual(a.slice(17), [230, 230, 230]);
  assert.equal(a[0], 74);
  assert.equal(a[16], 298);
  assert.equal(a.reduce((s, x) => s + x, 0), 3852);
});

test('T1.7 job ids', () => {
  assert.deepEqual([...C.COACH_JOBS], ['nets', 'match', 'study', 'scout']);
  assert.ok(Object.isFrozen(C.COACH_JOBS));
});

test('T1.9 constants equal SPEC section 3 numbers', () => {
  const lit = { XP_NETS: 10, XP_NETS_WEAK: 5, XP_MATCH: 6, XP_WIN_MULT: 2, XP_STUDY: 12, XP_SCOUT: 8,
    XP_MAX_STEP: 21, COURSE_MAX_STEP: 19, COURSES_PER_SEASON: 1, SCOUT_NAMES_PER_JOB: 1, SCOUT_NAMES_MAX_SEASON: 2 };
  let want = lit;
  if (existsSync(SPEC)) {
    const txt = readFileSync(SPEC, 'utf8');
    const row = (name) => {
      const m = txt.match(new RegExp('^\\| `' + name + '` \\| (\\d+)', 'm'));
      assert.ok(m, 'spec row ' + name);
      return Number(m[1]);
    };
    want = Object.fromEntries(Object.keys(lit).map((k) => [k, row(k)]));
    assert.deepEqual(want, lit);
  }
  for (const [k, v] of Object.entries(want)) assert.equal(C[k], v, k);
});
