import test from 'node:test'; import assert from 'node:assert/strict';
import { coachVmFields } from '../js/core/coach-vmfields.js';
import { setJob } from '../js/core/coach-jobs.js';
import { coachList } from '../js/core/training.js';
import { XP_PER_STEP } from '../js/data/coach-weekly.js';
import { K, game } from './_tr2-fixture.mjs';

const three = () => game({ coaches: [K({ id: 'a' }), K({ id: 'b' }), K({ id: 'c' })] });
const withPlan = (s, id) => ({ ...s, training: { ...s.training, coach_id: id, focus: 'bat', effort: 'normal' } });
const row = (s, id) => coachVmFields(s, coachList(s).find((c) => c.id === id));

test('job comes from state (scout after setJob)', () => {
  let s = withPlan(three(), 'a'); s = { ...s, training: { ...s.training, matchCoachId: 'c' } };
  assert.equal(row(s, 'b').job, 'study');
  s = setJob(s, 'b', 'scout');
  assert.equal(row(s, 'b').job, 'scout'); assert.equal(row(s, 'b').jobLocked, false);
});
test('locked nets coach has why', () => {
  const r = row(withPlan(three(), 'a'), 'a');
  assert.equal(r.job, 'nets'); assert.equal(r.jobLocked, true); assert.ok(r.why.length > 0);
});
test('xp fields: need, clamp, max, stepUpPending', () => {
  const s = withPlan({ ...three(), coaches: [K({ id: 'a', step: 4, xp: 58, stepUpPending: 2 }), K({ id: 'b', step: 21, xp: 99 })] }, 'a');
  const a = row(s, 'a'); assert.equal(a.xp, 58); assert.equal(a.xpNeed, XP_PER_STEP[3]); assert.equal(a.max, false); assert.equal(a.stepUpPending, 2);
  const b = row(s, 'b'); assert.equal(b.max, true); assert.equal(b.xpNeed, null); assert.equal(b.xp, 0);
});
