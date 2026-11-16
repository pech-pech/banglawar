import test from 'node:test'; import assert from 'node:assert/strict';
import { endWeekPay, courseCap, canStartCourse, courseAllowed, coursesThisSeason } from '../js/core/coach-steps.js';
import { xpToNext, payXp } from '../js/core/coach-xp.js';
import { jobOf } from '../js/core/coach-jobs.js';
import { XP_STUDY, XP_SCOUT, XP_PER_STEP } from '../js/data/coach-weekly.js';
import { game, K } from './_tr2-fixture.mjs';

const W = (o = {}) => K({ xp: 0, xpTotal: 0, stepsXp: 0, stepUpPending: 0, job: 'study', jobWeek: null, ...o });
// k1 = nets coach (plan), k2 = match coach (highest idle), k3 / k4 = free picks.
function club(extra = [], o = {}) {
  const s = game({ coaches: [W({ id: 'k1', step: 4 }), W({ id: 'k2', step: 8 }), ...extra], plan: { focus: 'bat', effort: 'normal', coachId: 'k1' }, ...o });
  s.training.lastPlan = { focus: 'bat', effort: 'normal', coachId: 'k1' }; s.training.week = 18; s.season.n = 2; s.training.matchCoachId = 'k2';
  return s;
}
const info = { week: 18, weekKey: 218 };
const byId = (n, id) => n.coaches.find((c) => c.id === id);

test('fixture roles: k1 nets, k2 match, k3 study, k4 scout', () => {
  const s = club([W({ id: 'k3', step: 5, job: 'study' }), W({ id: 'k4', step: 5, job: 'scout' })]);
  assert.deepEqual(['k1', 'k2', 'k3', 'k4'].map((id) => jobOf(s, id)), ['nets', 'match', 'study', 'scout']);
});

test('T4.5 EndWeek pays Study 12 and Scout 8, once per coach', () => {
  const n = club([W({ id: 'k3', step: 5, job: 'study' }), W({ id: 'k4', step: 5, job: 'scout' })]);
  const r = endWeekPay(n, info);
  assert.deepEqual(r.paid.map((p) => [p.coachId, p.job, p.xp]), [['k3', 'study', XP_STUDY], ['k4', 'scout', XP_SCOUT]]);
  assert.equal(byId(n, 'k3').xp, 12); assert.equal(byId(n, 'k3').xpTotal, 12);
  assert.equal(byId(n, 'k4').xp, 8); assert.equal(byId(n, 'k4').xpTotal, 8);
  assert.equal(byId(n, 'k1').xp, 0, 'nets coach earns nothing from Study/Scout'); assert.equal(byId(n, 'k2').xp, 0, 'match coach not paid at EndWeek');
  const j = n.report.jobs;
  assert.equal(j.study, 1); assert.equal(j.scout, 1); assert.equal(j.away, 0);
  assert.equal(j.xp.study, 12); assert.equal(j.xp.scout, 8); assert.equal(j.xp.nets, 0); assert.equal(j.xp.match, 0);
  for (const id of ['k1', 'k2', 'k3', 'k4']) assert.equal(byId(n, id).jobWeek, 218);
  assert.deepEqual(['k1', 'k2', 'k3', 'k4'].map((id) => byId(n, id).job), ['nets', 'match', 'study', 'scout']);
});

test('T4.5 duplicate coach ids pay once', () => {
  const n = club([W({ id: 'k3', job: 'study' }), W({ id: 'k3', job: 'study' })]);
  endWeekPay(n, info);
  assert.equal(n.report.jobs.study, 1); assert.equal(n.report.jobs.xp.study, 12);
});

test('T4.5 bye week: would-be match coach takes Study and is paid', () => {
  const n = club(); n.training.noMatch = true;
  endWeekPay(n, info);
  assert.equal(byId(n, 'k2').xp, XP_STUDY); assert.equal(n.report.jobs.match, 0); assert.equal(n.report.jobs.study, 1);
});

test('T4.6 away coach pays 0 and counts away', () => {
  const n = club([W({ id: 'k3', away: 1, job: 'scout' })]);
  endWeekPay(n, info);
  const c = byId(n, 'k3');
  assert.equal(c.xp, 0); assert.equal(c.xpTotal, 0); assert.equal(c.jobWeek, null); assert.equal(c.job, 'scout');
  assert.equal(n.report.jobs.away, 1); assert.equal(n.report.jobs.scout, 0); assert.equal(n.report.jobs.xp.scout, 0);
});

test('T4.9 S+ coach on Study pays 0 XP, xp stays 0, week still counted', () => {
  const n = club([W({ id: 'k3', step: 21, job: 'study' })]);
  const r = endWeekPay(n, info), c = byId(n, 'k3');
  assert.equal(c.step, 21); assert.equal(c.xp, 0); assert.equal(c.xpTotal, 0); assert.equal(xpToNext(21), null);
  assert.equal(r.paid[0].xp, 0); assert.equal(n.report.jobs.study, 1); assert.equal(n.report.jobs.xp.study, 0);
});

test('T4.10 course steps come from the ladder gain, XP unchanged', () => {
  const c = W({ step: 10, xp: 50, xpTotal: 90 });
  const { to, cut } = courseCap(c.step, 3); c.step = to;
  assert.equal(to, 13); assert.equal(cut, false); assert.equal(c.xp, 50); assert.equal(c.xpTotal, 90);
  for (const g of [1, 2, 3, 4]) assert.equal(courseCap(5, g).to, 5 + g);
});

test('T4.13 Clinic spin data leaves EndWeek XP unchanged', () => {
  const a = club([W({ id: 'k3', job: 'study' })]), b = club([W({ id: 'k3', job: 'study' })]);
  b.clinic = { week: 218, slots: 3, netsDone: true, pending: null, spins: [{ slot: 0, coachId: 'k3', playerId: 'p1', spinKey: '218:k3', spokePaid: true }], boost: { p1: { pcts: [20], extraRun: true } }, stats: {} };
  const before = JSON.stringify(b.clinic);
  endWeekPay(a, info); endWeekPay(b, info);
  assert.deepEqual(b.coaches.map((c) => [c.xp, c.xpTotal, c.step]), a.coaches.map((c) => [c.xp, c.xpTotal, c.step]));
  assert.deepEqual(b.report.jobs, a.report.jobs); assert.equal(JSON.stringify(b.clinic), before);
});

test('T4.15 course cut at 19', () => {
  assert.deepEqual(courseCap(17, 4), { to: 19, cut: true });
  assert.deepEqual(courseCap(15, 4), { to: 19, cut: false });
  assert.deepEqual(courseCap(18, 2), { to: 19, cut: true });
  assert.deepEqual(courseCap(19, 0), { to: 19, cut: false });
  assert.equal(courseCap(20, 3).to, 20, 'never lowers a coach');
});

test('T4.15 any coach may start a course; at 19 or above the result is cut and gains nothing', () => {
  for (const step of [1, 18, 19, 20, 21]) assert.deepEqual(canStartCourse(W({ step })), { ok: true, why: '' });
  for (const step of [19, 20, 21]) assert.deepEqual(courseCap(step, 3), { to: step, cut: true });
  assert.equal(canStartCourse(null).ok, false);
});

test('T4.15 one course a season, club wide (courseSeason counter)', () => {
  const n = club([W({ id: 'k3' })]);
  assert.equal(coursesThisSeason(n), 0); assert.equal(courseAllowed(n), true);
  byId(n, 'k3').courseSeason = 1; assert.equal(courseAllowed(n), true, 'last season does not count');
  byId(n, 'k3').courseSeason = 2; assert.equal(coursesThisSeason(n), 1); assert.equal(courseAllowed(n), false);
  assert.equal(courseAllowed({}), true);
});

test('T4.8 payout 500 loops steps, then EndWeek pay carries on', () => {
  const n = club([W({ id: 'k3', step: 1, job: 'study' })]);
  assert.equal(payXp(n, 'k3', 500, 'study'), 4);
  const c = byId(n, 'k3');
  // 500 xp from step 1: 74 + 88 + 102 + 116 = 380, next 130 > 120 left
  assert.equal(c.step, 5); assert.equal(c.xp, 120); assert.equal(c.stepsXp, 4); assert.equal(c.stepUpPending, 4);
  assert.equal(XP_PER_STEP.slice(0, 4).reduce((a, b) => a + b, 0) + c.xp, 500, 'XP conserved');
  endWeekPay(n, info);
  assert.equal(c.step, 6); assert.equal(c.xp, 2); assert.equal(c.xpTotal, 512); assert.equal(n.report.jobs.xp.study, 512);
});

test('T4.8 500 EndWeeks of Study loop to S+ and stop', () => {
  const n = club([W({ id: 'k3', step: 1, job: 'study' })]);
  let total = 0;
  for (let w = 0; w < 500; w++) { n.training.week = 18 + w; total += endWeekPay(n, { week: 18 + w, weekKey: 218 + w }).paid[0].xp; }
  const c = byId(n, 'k3');
  assert.equal(c.step, 21); assert.equal(c.xp, 0); assert.equal(c.stepsXp, 20); assert.equal(c.stepUpPending, 20);
  assert.equal(c.xpTotal, total); assert.equal(n.report.jobs.study, 500);
  assert.ok(total >= XP_PER_STEP.reduce((a, b) => a + b, 0) && total < XP_PER_STEP.reduce((a, b) => a + b, 0) + XP_STUDY);
});

test('bad input never throws', () => {
  assert.deepEqual(endWeekPay(null, info).paid, []); assert.deepEqual(endWeekPay({}, undefined).paid, []);
  const n = club([W({ id: 'k3' })]); endWeekPay(n, undefined); assert.equal(byId(n, 'k3').jobWeek, null);
});
