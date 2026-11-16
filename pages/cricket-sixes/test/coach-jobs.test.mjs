import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { normJob, jobOf, legalJobs, defaultJob, setJob, jobsThisWeek } from '../js/core/coach-jobs.js';
import { weekKey } from '../js/core/week-key.js';
import { K, game } from './_tr2-fixture.mjs';

const three = (o = {}) => ({ ...game({ coaches: [K({ id: 'a' }), K({ id: 'b' }), K({ id: 'c' })] }), ...o });
const withPlan = (s, coachId) => ({ ...s, training: { ...s.training, coach_id: coachId, focus: 'bat', effort: 'normal' } });
const okSet = (s, id) => legalJobs(s, id).filter((r) => r.ok).map((r) => r.job).sort();

test('T3.1 nets coach is forced Nets', () => {
  const s = withPlan(three(), 'a');
  assert.equal(jobOf(s, 'a'), 'nets'); assert.deepEqual(okSet(s, 'a'), ['nets']);
  assert.equal(setJob(s, 'a', 'study'), s);
});
test('T3.2 idle coach chosen on match day is Match', () => {
  let s = withPlan(three(), 'a'); s = { ...s, training: { ...s.training, matchCoachId: 'c' } };
  assert.equal(jobOf(s, 'c'), 'match'); assert.deepEqual(okSet(s, 'c'), ['match']);
  assert.equal(jobOf(s, 'b'), 'study');
});
test('T3.3 other coaches only Study or Scout', () => {
  const s = withPlan(three(), 'a'); const other = ['b', 'c'].find((id) => jobOf(s, id) !== 'match');
  assert.deepEqual(okSet(s, other), ['scout', 'study']);
  assert.equal(setJob(s, other, 'match'), s); assert.equal(setJob(s, other, 'nets'), s);
  assert.equal(jobOf(setJob(s, other, 'scout'), other), 'scout');
});
test('T3.4 default is last week\'s job', () => {
  let s = withPlan(three(), 'a'); s = { ...s, training: { ...s.training, matchCoachId: 'c' } };
  s = { ...s, coaches: s.coaches.map((c) => (c.id === 'b' ? { ...c, job: 'scout', jobWeek: weekKey(s) - 1 } : c)) };
  assert.equal(defaultJob(s, 'b'), 'scout'); assert.equal(jobOf(s, 'b'), 'scout');
});
test('T3.5 illegal default falls to Study', () => {
  let s = withPlan(three(), 'a'); s = { ...s, training: { ...s.training, matchCoachId: 'c' } };
  s = { ...s, coaches: s.coaches.map((c) => (c.id === 'b' ? { ...c, job: 'nets' } : c.id === 'a' ? { ...c, job: 'match' } : c)) };
  assert.equal(defaultJob(s, 'b'), 'study');
  assert.equal(jobOf(s, 'a'), 'nets');
});
test('T3.6 away coach has no job', () => {
  const s = three(); s.coaches[1].away = 1;
  assert.equal(jobOf(s, 'b'), 'away'); assert.deepEqual(okSet(s, 'b'), []);
  assert.equal(setJob(s, 'b', 'study'), s);
  assert.equal(jobsThisWeek(s)[1].job, 'away');
});
test('T3.7 new coach defaults Study', () => {
  const s = withPlan(three(), 'a'); const b = s.coaches.find((c) => c.id === 'b');
  assert.equal(b.job, undefined); assert.equal(defaultJob(s, 'b'), jobOf(s, 'b'));
  assert.ok(['study', 'match'].includes(jobOf(s, 'b')));
  const solo = withPlan(game({ coaches: [K({ id: 'a' }), K({ id: 'b' })] }), 'a'); assert.equal(jobOf(solo, 'b'), 'match');
  assert.equal(normJob(undefined), 'study');
});
test('T3.8 away coach returns, default rule applies', () => {
  let s = three(); s.coaches[2].job = 'scout'; s.coaches[2].away = 1;
  s = withPlan(s, 'a'); assert.equal(jobOf(s, 'c'), 'away');
  s = { ...s, coaches: s.coaches.map((c) => (c.id === 'c' ? { ...c, away: 0 } : c)), training: { ...s.training, matchCoachId: 'b' } };
  assert.equal(jobOf(s, 'c'), 'scout');
});
test('T3.9 bye week: no match coach, Study/Scout free', () => {
  let s = withPlan(three(), 'a'); s = { ...s, training: { ...s.training, noMatch: true } };
  for (const id of ['b', 'c']) { assert.equal(jobOf(s, id), 'study'); assert.deepEqual(okSet(s, id), ['scout', 'study']); }
  assert.ok(!jobsThisWeek(s).some((r) => r.job === 'match'));
  assert.equal(setJob(s, 'b', 'match'), s);
});
test('T3.10 only coach is nets coach: no match coach this week', () => {
  const s = withPlan(game({ coaches: [K({ id: 'a' })] }), 'a');
  assert.equal(jobOf(s, 'a'), 'nets');
  assert.equal(legalJobs(s, 'a').find((r) => r.job === 'match').why, 'No match coach this week');
  assert.equal(jobsThisWeek(s)[0].why, 'No match coach this week');
});
test('T3.11 saved clinic or unknown job loads Study', () => {
  assert.equal(normJob('clinic'), 'study'); assert.equal(normJob('zzz'), 'study'); assert.equal(normJob(null), 'study');
  let s = withPlan(three(), 'a'); s.coaches[1].job = 'clinic';
  const b = jobOf(s, 'b'); assert.ok(b !== 'clinic' && ['study', 'match'].includes(b));
  assert.ok(!JSON.stringify(legalJobs(s, 'b')).includes('clinic'));
});
test('T3.12 2-slot: idle coach may take Study or Scout, then no Match coach', () => {
  let s = withPlan(game({ coaches: [K({ id: 'a' }), K({ id: 'b' })] }), 'a'); s = { ...s, clinic: { slots: 2 } };
  assert.deepEqual(okSet(s, 'b'), ['match', 'scout', 'study']);
  const t = setJob(s, 'b', 'scout'); assert.notEqual(t, s);
  assert.equal(jobOf(t, 'b'), 'scout'); assert.equal(t.coaches[1].jobWeek, weekKey(s));
  assert.equal(s.coaches[1].job, undefined, 'pure');
  assert.equal(jobOf(setJob(t, 'b', 'match'), 'b'), 'match');
  const s3 = { ...s, clinic: { slots: 3 } }; assert.deepEqual(okSet(s3, 'b'), ['match']);
});
test('v7 fixture shape: every coach has exactly one job, never clinic', () => {
  const f = JSON.parse(readFileSync(new URL('./fixtures/v7-save.json', import.meta.url), 'utf8')), d = f.data || f;
  const s = { ...d, coaches: (d.coaches || []).map((c) => ({ ...c })) };
  const rows = jobsThisWeek(s); assert.equal(rows.length, (s.coaches || []).filter((c) => !c.candidate).length);
  for (const r of rows) assert.ok(['nets', 'match', 'study', 'scout', 'away'].includes(r.job));
  assert.equal(jobsThisWeek({ coaches: [] }).length, 0);
});
