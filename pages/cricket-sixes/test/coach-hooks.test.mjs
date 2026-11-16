import test from 'node:test'; import assert from 'node:assert/strict';
import { installCoachHooks } from '../js/core/coach-hooks.js';
import { fireHook, clearHooks } from '../js/core/hooks.js';
import { game, K } from './_tr2-fixture.mjs';
import { loadV7 } from './_v7-fixture.mjs';

const rt = (o) => JSON.parse(JSON.stringify(o)); // save/load round trip
const fresh = () => { clearHooks(); installCoachHooks(); };
const planInfo = (coachId, focus = 'bat') => ({ week: 1, weekKey: 5, plan: { focus, effort: 'normal', coachId }, q: 1, lines: [], trainIds: [], shortIds: [], skippedIds: [] });
const xp = (n, id) => n.coaches.find((c) => c.id === id).xpTotal | 0;

test('T4.2 netsRun pays the plan coach 10 (strong in focus) / 5 (not), counts report.jobs.nets', () => {
  fresh();
  const n = game({ coaches: [K({ strong: ['bat'] }), K({ id: 'k2', strong: ['bowl'] })] });
  fireHook('netsRun', n, planInfo('k1', 'bat'));
  assert.equal(xp(n, 'k1'), 10); assert.equal(n.report.jobs.nets, 1); assert.equal(n.report.jobs.xp.nets, 10);
  fireHook('netsRun', n, planInfo('k2', 'bat'));
  assert.equal(xp(n, 'k2'), 5); assert.equal(n.report.jobs.nets, 2);
});
test('T4.2 jackpot / extra nets run and no coach pay nothing', () => {
  fresh();
  const n = game({ coaches: [K({ strong: ['bat'] })] });
  fireHook('netsRun', n, { ...planInfo('k1'), jackpot: true });
  fireHook('netsRun', n, { ...planInfo(null) });
  assert.equal(xp(n, 'k1'), 0); assert.ok(!n.report || !n.report.jobs || !n.report.jobs.nets);
});
test('T4.4 matchEnd pays mcId, 6 loss / 12 win, counts match and wins', () => {
  fresh();
  const n = game({ coaches: [K(), K({ id: 'k2' })] });
  fireHook('matchEnd', n, { won: false, mcId: 'k2' });
  assert.equal(xp(n, 'k2'), 6); assert.equal(n.report.jobs.match, 1); assert.equal(n.report.jobs.wins, 0);
  fireHook('matchEnd', n, { won: true, mcId: 'k2' });
  assert.equal(xp(n, 'k2'), 18); assert.equal(n.report.jobs.match, 2); assert.equal(n.report.jobs.wins, 1); assert.equal(xp(n, 'k1'), 0);
});
test('T4.4 matchEnd without mcId uses matchCoachOf; no match coach pays 0', () => {
  fresh();
  const n = game({ coaches: [K(), K({ id: 'k2', step: 6 })] });
  fireHook('matchEnd', n, { won: true });
  assert.equal(xp(n, 'k2'), 12); assert.equal(xp(n, 'k1'), 0);
  const none = game({ coaches: [] }); fireHook('matchEnd', none, { won: true });
  assert.ok(!none.report || !none.report.jobs || !none.report.jobs.match);
  const solo = game({ coaches: [K()], plan: { focus: 'bat', effort: 'normal', coachId: 'k1' } }); solo.training.coach_id = 'k1';
  fireHook('matchEnd', solo, { won: true }); assert.equal(xp(solo, 'k1'), 0);
});
test('T4.12 endWeek pays study 12 / scout 8, adds a scout name, counts jobs', () => {
  fresh();
  const n = game({ coaches: [K({ job: 'study' }), K({ id: 'k2', job: 'scout' }), K({ id: 'k3', step: 9 })] }); // k3 = match coach (highest step)
  fireHook('endWeek', n, { week: 1, weekKey: 5 });
  assert.equal(xp(n, 'k1'), 12); assert.equal(xp(n, 'k2'), 8); assert.equal(xp(n, 'k3'), 0);
  assert.equal(n.report.jobs.study, 1); assert.equal(n.report.jobs.scout, 1);
  assert.equal(n.scout.bonusNames, 1); assert.equal(n.scout.extraThisSeason, 1); assert.equal(n.report.jobs.scoutNames, 1);
});
test('seasonClose resets scout counters', () => {
  fresh();
  const n = game(); n.scout = { n: 1, bonusNames: 1, extraThisSeason: 2 };
  fireHook('seasonClose', n, { season: 2 });
  assert.equal(n.scout.bonusNames, 0); assert.equal(n.scout.extraThisSeason, 0); assert.equal(n.scout.n, 1);
});
test('double install does not double pay', () => {
  clearHooks(); installCoachHooks(); installCoachHooks();
  const n = game({ coaches: [K({ strong: ['bat'] })] });
  fireHook('netsRun', n, planInfo('k1')); assert.equal(xp(n, 'k1'), 10); assert.equal(n.report.jobs.nets, 1);
});
test('listener errors never throw', () => {
  fresh();
  assert.doesNotThrow(() => { fireHook('netsRun', null, undefined); fireHook('matchEnd', {}, undefined); fireHook('endWeek', { coaches: 5 }, null); fireHook('seasonClose', {}, null); });
});
test('week flow on the v7 fixture: nets, match, endWeek in order, round trip between events', () => {
  fresh();
  let s = loadV7();
  const ids = s.coaches.map((c) => c.id), [a, b] = ids;
  s.coaches.find((c) => c.id === b).strong = ['bal'];
  s.training.focus = 'bal'; s.training.coach_id = b;
  const info = { week: 18, weekKey: 18, plan: { focus: 'bal', effort: 'normal', coachId: b }, q: 1, lines: [], trainIds: [], shortIds: [], skippedIds: [] };
  s = rt(s); fireHook('netsRun', s, info);
  assert.equal(xp(s, b), 10);
  s = rt(s); fireHook('matchEnd', s, { won: true, mcId: a });
  assert.equal(xp(s, a), 12); assert.equal(xp(s, b), 10);
  s = rt(s); const before = ids.map((id) => xp(s, id));
  fireHook('endWeek', s, { week: 18, weekKey: 18 });
  const j = s.report.jobs;
  assert.equal(j.nets, 1); assert.equal(j.match, 1); assert.equal(j.wins, 1);
  const gained = ids.map((id, i) => xp(s, id) - before[i]);
  assert.equal(gained.reduce((x, y) => x + y, 0), 12 * j.study + 8 * j.scout);
  s = rt(s);
  assert.equal(xp(s, a) + xp(s, b), before[0] + before[1] + gained[0] + gained[1]);
  assert.equal(j.xp.nets, 10); assert.equal(j.xp.match, 12);
});
