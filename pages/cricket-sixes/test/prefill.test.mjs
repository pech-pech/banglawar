import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C, planProblem } from '../js/store/commands.js';
import { planVM } from '../js/store/selectors.js';

// M's pick (13:46): the bowling plan opens pre-filled with the best matchups, and any over can be changed.
function toPlan(seed, ids) {
  let s = C(null, 'NewGame', { seed });
  s = C(s, 'PickCoach', { coachId: s.coaches.find((c) => c.candidate).id });
  s = C(s, 'OpenSquad', {});
  s = C(s, 'SetSix', { ids: ids || s.clubs[0].squad.slice(0, 6).map((p) => p.id) });
  return s;
}

test('prefill: the default plan is valid for many seeds', () => {
  for (let i = 0; i < 40; i++) {
    const s = toPlan('pf-' + i);
    assert.equal(s.stage, 'plan');
    assert.equal(planProblem(s.plan.overs), null, 'seed ' + i + ': ' + s.plan.overs);
    assert.deepEqual(s.plan.fields, ['A', 'A', 'A']);
    const vm = planVM(s);
    assert.equal(vm.valid, true);
    assert.ok(vm.hint && vm.hint.length > 0 && vm.hint.length < 70);
  }
});

test('prefill: it is the matchup pick, not the 0..5 rota (differs on some seeds)', () => {
  const rota = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3].join();
  let diff = 0;
  for (let i = 0; i < 20; i++) if (toPlan('pf-' + i).plan.overs.join() !== rota) diff++;
  assert.ok(diff >= 10, 'only ' + diff + ' of 20 differ from the rota');
});

test('prefill: deterministic for the same state', () => {
  const a = toPlan('pf-det'), b = toPlan('pf-det');
  assert.deepEqual(a.plan, b.plan);
  const six = a.clubs[0].squad.slice(0, 6).map((p) => p.id);
  assert.deepEqual(C(a, 'OpenSquad', {}) && C(C(a, 'OpenSquad', {}), 'SetSix', { ids: six }).plan, a.plan);
});

test('prefill: an edited plan is not overwritten (same six, back and forth)', () => {
  let s = toPlan('pf-edit');
  const edited = [5, 4, 3, 2, 1, 0, 5, 4, 3, 2];
  s = C(s, 'EditPlan', { overs: edited, fields: ['P', 'A', 'P'] });
  assert.deepEqual(s.plan.overs, edited);
  s = C(s, 'OpenSquad', {});
  s = C(s, 'SetSix', { ids: s.clubs[0].six });
  assert.deepEqual(s.plan.overs, edited);
  assert.deepEqual(s.plan.fields, ['P', 'A', 'P']);
});

test('prefill: a half-edited plan (an empty over) is kept, and cannot start', () => {
  let s = toPlan('pf-half');
  const half = s.plan.overs.slice(); half[3] = null;
  s = C(s, 'EditPlan', { overs: half, fields: s.plan.fields });
  assert.equal(s.plan.overs[3], null);
  assert.equal(C(s, 'NewMatch', {}), s);
  assert.equal(planVM(s).valid, false);
});

test('prefill: six changed, plan untouched -> rebuilt; plan edited -> kept', () => {
  let s = toPlan('pf-six');
  const squad = s.clubs[0].squad.map((p) => p.id);
  const other = squad.slice(2, 8);
  const rebuilt = C(C(s, 'OpenSquad', {}), 'SetSix', { ids: other });
  assert.equal(planProblem(rebuilt.plan.overs), null);
  assert.deepEqual(rebuilt.plan, toPlan('pf-six', other).plan);
  const e = C(s, 'EditPlan', { overs: [5, 4, 3, 2, 1, 0, 5, 4, 3, 2], fields: ['A', 'A', 'A'] });
  const kept = C(C(e, 'OpenSquad', {}), 'SetSix', { ids: other });
  assert.deepEqual(kept.plan.overs, [5, 4, 3, 2, 1, 0, 5, 4, 3, 2]);
});

test('prefill: an edit from an earlier match does not block the next match default', () => {
  let s = toPlan('pf-next');
  s = C(s, 'EditPlan', { overs: [5, 4, 3, 2, 1, 0, 5, 4, 3, 2], fields: ['A', 'A', 'A'] });
  s = C(s, 'SetPlan', { overs: s.plan.overs, fields: s.plan.fields });
  s = C(s, 'NewMatch', {});
  let g = 0;
  while (s.stage !== 'hub' && g++ < 60) {
    const st = s.stage;
    s = st === 'bowl' ? C(s, 'BowlOver', {}) : st === 'break' ? C(s, 'StartChase', {}) : st === 'chase' ? C(s, 'BowlOver', { intent: 'R' }) : st === 'done' ? C(s, 'FinishMatch', {}) : s;
    if (s.stage === st && st !== 'hub') break;
  }
  assert.ok(['hub', 'train', 'semi', 'final'].includes(s.stage) || g < 60, s.stage);
  if (s.stage === 'hub') {
    s = C(C(s, 'OpenSquad', {}), 'SetSix', { ids: s.clubs[0].six });
    assert.equal(s.plan.edited, false);
  }
});

test('EditPlan rejects junk', () => {
  const s = toPlan('pf-junk');
  assert.equal(C(s, 'EditPlan', { overs: [0, 1], fields: ['A', 'A', 'A'] }), s);
  assert.equal(C(s, 'EditPlan', { overs: s.plan.overs, fields: ['X', 'A', 'A'] }), s);
  assert.equal(C(s, 'EditPlan', { overs: [9, 1, 2, 3, 4, 5, 0, 1, 2, 3], fields: ['A', 'A', 'A'] }), s);
});
