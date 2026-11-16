import test from 'node:test'; import assert from 'node:assert/strict';
import '../js/store/spins/coach-job.js';
import { spinHandler } from '../js/store/spin-registry.js';
import { jobOf } from '../js/core/coach-jobs.js';
import { jobSheetVM } from '../js/ui/job-sheet-vm.js';
import { K, game } from './_tr2-fixture.mjs';

const three = () => { const s = game({ coaches: [K({ id: 'a' }), K({ id: 'b' }), K({ id: 'c' })] }); return { ...s, training: { ...s.training, coach_id: 'a', matchCoachId: 'c', focus: 'bat', effort: 'normal' } }; };
const h = spinHandler('SetJob');

test('SetJob registered', () => assert.equal(typeof h, 'function'));
test('SetJob legal sets the job', () => {
  const s = three(), n = h(s, { coachId: 'b', job: 'scout' }, {});
  assert.notEqual(n, s); assert.equal(jobOf(n, 'b'), 'scout'); assert.equal(s.coaches[1].job, undefined);
});
test('SetJob illegal leaves state unchanged', () => {
  const s = three();
  assert.equal(h(s, { coachId: 'b', job: 'match' }, {}), s);
  assert.equal(h(s, { coachId: 'a', job: 'study' }, {}), s);
  assert.equal(h(s, { coachId: 'zz', job: 'study' }, {}), s);
  assert.equal(h(s, { coachId: 'b', job: 'clinic' }, {}), s);
  assert.equal(h(s, null, {}), s);
});
test('T6.7 reload keeps the choice', () => {
  const n = h(three(), { coachId: 'b', job: 'scout' }, {});
  const back = JSON.parse(JSON.stringify(n));
  assert.equal(jobOf(back, 'b'), 'scout');
});
test('jobSheetVM rows', () => {
  const vm = jobSheetVM(three(), 'b');
  assert.equal(vm.coachName, 'Coach');
  assert.deepEqual(vm.rows.map((r) => r.job), ['nets', 'match', 'study', 'scout']);
  const by = Object.fromEntries(vm.rows.map((r) => [r.job, r]));
  assert.equal(by.study.ok, true); assert.equal(by.study.xp, 12); assert.equal(by.study.effect, 'Study tape: +12 XP at EndWeek');
  assert.equal(by.scout.xp, 8); assert.equal(by.scout.effect, 'Scout: +8 XP and 1 scout name');
  assert.equal(by.nets.ok, false); assert.ok(by.nets.why);
  assert.equal(jobSheetVM(three(), 'nope'), null);
});
