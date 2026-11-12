import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C, planProblem } from '../js/store/commands.js';
import { teamVM, clubVM } from '../js/store/selectors.js';

// P6: the six and the overs are edited from the hub (stage stays), and one Start match uses what is saved.
function hub(seed) {
  let s = C(null, 'NewGame', { seed });
  return C(s, 'PickCoach', { coachId: s.coaches.find((c) => c.candidate).id });
}
const ids = (s) => s.clubs[0].squad.map((p) => p.id);

test('team: the hub plan is already suggested and valid for many seeds', () => {
  for (let i = 0; i < 20; i++) {
    const s = hub('ts-' + i), vm = clubVM(s);
    assert.equal(s.stage, 'hub');
    assert.equal(vm.plan.ok, true); assert.equal(vm.plan.word, 'Suggested');
    assert.equal(vm.cta.label, 'Start match'); assert.equal(vm.cta.disabled, false);
    assert.equal(vm.six.length, 6);
  }
});

test('StartMatch: one command from the hub starts the match with the saved six and plan', () => {
  const s = hub('ts-a'), six = s.clubs[0].six.slice();
  const n = C(s, 'StartMatch');
  assert.equal(n.stage, 'bowl');
  assert.deepEqual(n.me.players.map((p) => p.id), six);
  assert.equal(planProblem(n.plan.overs), null);
  assert.deepEqual(n.plan.overs, clubVM(s).plan.ok ? teamVM(s).plan.overs.map((o) => o.bowler) : null);
  assert.deepEqual(C(s, 'StartMatch'), n, 'same state, same match');
});

test('TeamSix: swap from the hub keeps the stage, re-suggests an unedited plan', () => {
  const s = hub('ts-b'), all = ids(s), six = s.clubs[0].six.slice();
  const bench = all.find((id) => !six.includes(id));
  const next = six.slice(); next[2] = bench;
  const n = C(s, 'TeamSix', { ids: next });
  assert.equal(n.stage, 'hub');
  assert.deepEqual(n.clubs[0].six, next);
  assert.equal(teamVM(n).players.filter((p) => p.order != null).length, 6);
  assert.equal(clubVM(n).plan.word, 'Suggested');
  assert.equal(C(s, 'TeamSix', { ids: six.slice(0, 5) }), s, 'five is not a six');
  assert.equal(C(s, 'TeamSix', { ids: [...six.slice(0, 5), 'nope'] }), s);
});

test('TeamPlan: edits save, a broken plan blocks Start, Suggest restores', () => {
  const s = hub('ts-c');
  const good = teamVM(s).plan.overs.map((o) => o.bowler);
  const swapped = good.slice();
  let n = C(s, 'TeamPlan', { overs: swapped, fields: ['P', 'A', 'A'] });
  assert.equal(n.stage, 'hub'); assert.equal(n.plan.edited, true);
  assert.deepEqual(n.plan.fields, ['P', 'A', 'A']);
  assert.equal(clubVM(n).plan.word, 'Saved');
  const broken = swapped.slice(); broken[3] = null;
  n = C(n, 'TeamPlan', { overs: broken, fields: ['P', 'A', 'A'] });
  assert.equal(clubVM(n).cta.disabled, true); assert.equal(clubVM(n).plan.word, 'Fix it');
  assert.equal(C(n, 'StartMatch'), n, 'broken plan: nothing happens');
  n = C(n, 'TeamSuggest');
  assert.equal(clubVM(n).plan.word, 'Suggested'); assert.equal(C(n, 'StartMatch').stage, 'bowl');
  assert.equal(C(s, 'TeamPlan', { overs: [0, 1], fields: ['A', 'A', 'A'] }), s);
});

test('team commands do nothing outside the hub, and the old squad and plan stages still work', () => {
  const s = hub('ts-d');
  const m = C(s, 'StartMatch');
  assert.equal(C(m, 'StartMatch'), m); assert.equal(C(m, 'TeamSuggest'), m);
  let o = C(s, 'OpenSquad'); o = C(o, 'SetSix', { ids: s.clubs[0].six }); o = C(o, 'NewMatch');
  assert.equal(o.stage, 'bowl');
});

test('clubVM: checklist, next unlock and fixture line', () => {
  const vm = clubVM(hub('ts-e'));
  assert.equal(vm.promo.total, 3); assert.ok(vm.promo.rows.find((r) => r.key === 'stadium').sub === 'Not built yet');
  assert.equal(vm.promo.rows.find((r) => r.key === 'fans').tag, 'Later');
  assert.match(vm.cta.sub, /^v .+ · Home/);
  if (vm.unlock) assert.ok(vm.unlock.left >= 1);
});
