import test from 'node:test'; import assert from 'node:assert/strict';
import { installCoachHooks } from '../js/core/coach-hooks.js';
import { fireHook, clearHooks } from '../js/core/hooks.js';
import { coachQuality, netsQuality } from '../js/core/training.js';
import { payXp, xpToNext } from '../js/core/coach-xp.js';
import { coachReportLines } from '../js/report/coach.js';
import { loadV7 } from './_v7-fixture.mjs';

const rt = (o) => JSON.parse(JSON.stringify(o));
const fresh = () => { clearHooks(); installCoachHooks(); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const coach = (s, id) => s.coaches.find((c) => c.id === id);
const numbers = (line) => line.match(/\d+/g).map(Number);

test('T4.11 a step-up changes coach Quality (3 x Nets level + 0.95 x step) from the next nets run', () => {
  const s = loadV7(); const id = 'sc2-0';
  s.training.focus = 'bal'; s.training.coach_id = id; // coach is strong in bal, step 6
  const c = coach(s, id); assert.equal(c.step, 6); assert.ok(c.strong.includes('bal'));
  const netsQ = netsQuality(s);
  const before = netsQ + coachQuality(s);
  near(coachQuality(s), 0.95 * 6); near(before, netsQ + 0.95 * 6);
  c.xp = xpToNext(6) - 1;
  assert.equal(payXp(s, id, 1, 'nets'), 1);
  assert.equal(c.step, 7); assert.equal(c.stepUpPending, 1);
  const after = netsQuality(s) + coachQuality(s);
  near(coachQuality(s), 0.95 * 7); near(after - before, 0.95); near(netsQuality(s), netsQ);
  // a coach weak in the focus adds nothing, even after a step-up
  s.training.focus = 'bowl'; near(coachQuality(s), 0);
});

test('T4.14 each job pays at its own event; round trips between events never double pay; one endWeek pays once', () => {
  fresh();
  let s = loadV7();
  const [a, b] = s.coaches.map((c) => c.id), m = 'k9';
  s.coaches.push({ ...rt(coach(s, a)), id: m, name: 'Match', step: 9 }); // highest step = match coach
  coach(s, b).strong = ['bal']; s.training.focus = 'bal'; s.training.coach_id = b; // b = nets coach
  coach(s, a).job = 'scout';                                                        // a = idle coach, scouting
  const info = { week: 18, weekKey: 18, plan: { focus: 'bal', effort: 'normal', coachId: b }, q: 1, lines: [], trainIds: [], shortIds: [], skippedIds: [] };
  const xp = (id) => coach(s, id).xpTotal;
  s = rt(s); fireHook('netsRun', s, info);
  assert.deepEqual([xp(a), xp(b), xp(m)], [0, 10, 0]);       // only nets paid so far
  s = rt(s); fireHook('matchEnd', s, { won: true, mcId: m });
  assert.deepEqual([xp(a), xp(b), xp(m)], [0, 10, 12]);      // match paid, nets not repaid
  s = rt(s);
  fireHook('endWeek', s, { week: 18, weekKey: 18 });
  const j = s.report.jobs;
  assert.deepEqual(j.xp, { nets: 10, match: 12, study: 0, scout: 8 });
  assert.equal(j.scout, 1); assert.equal(j.study, 0);
  assert.deepEqual([xp(a), xp(b), xp(m)], [8, 10, 12]);      // scout 8 to a, once
  s = rt(s);
  assert.deepEqual([xp(a), xp(b), xp(m)], [8, 10, 12]);      // reload pays nothing
  assert.deepEqual([s.report.jobs.nets, s.report.jobs.match, s.report.jobs.wins], [1, 1, 1]);
});

test('T11.4 COACHES report numbers match a scripted week through the installed hooks', () => {
  fresh();
  let s = loadV7();
  const [a, b] = s.coaches.map((c) => c.id), m = 'k9';
  s.coaches.push({ ...rt(coach(s, a)), id: m, name: 'Match', step: 9 });
  coach(s, b).strong = ['bal']; s.training.focus = 'bal'; s.training.coach_id = b;
  coach(s, a).job = 'study';
  s.report = { jobs: { nets: 0, match: 0, wins: 0, study: 0, scout: 0, away: 0, xp: { nets: 0, match: 0, study: 0, scout: 0 }, scoutNames: 0, courseCut: 0 } };
  fireHook('netsRun', s, { week: 18, weekKey: 18, plan: { focus: 'bal', effort: 'normal', coachId: b }, q: 1, lines: [], trainIds: [], shortIds: [], skippedIds: [] });
  fireHook('matchEnd', s, { won: true, mcId: m });
  fireHook('endWeek', s, { week: 18, weekKey: 18 });
  const j = s.report.jobs;
  assert.deepEqual([j.nets, j.match, j.wins, j.study, j.scout], [1, 1, 1, 1, 0]);
  assert.deepEqual(j.xp, { nets: 10, match: 12, study: 12, scout: 0 });
  const [l1, l2, l3] = coachReportLines(rt(s));
  assert.deepEqual(numbers(l1), [1, 1, 1, 1, 0, j.away]);    // nets, match, wins, study, scout, away
  assert.deepEqual(numbers(l2).slice(0, 4), [10, 12, 12, 0]);
  assert.equal(numbers(l3)[0], j.scoutNames);
  const total = s.coaches.reduce((t, c) => t + c.xpTotal, 0);
  assert.equal(total, 10 + 12 + 12);                      // report xp equals coach xp actually banked
});
