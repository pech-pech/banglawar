// @ts-check
// Coach weekly jobs (coach-weekly SPEC s4, CONTRACT-B s3). Pure: no DOM, no rng. One legal job per coach per week.
// Contract unclear on two inputs, read here as: bye week = s.training.noMatch === true (no match this week or it is skipped);
// slot count = s.clinic.slots when set, else MAX_COACHES (2 or fewer = "2-slot": the idle coach may take Study or Scout, no Match coach).
import { coachList, idleCoaches, matchCoachOf, planOf, MAX_COACHES } from './training.js';
import { weekKey } from './week-key.js';

const JOBS = ['nets', 'match', 'study', 'scout'];
/** Unknown values (including a saved 'clinic') load as 'study'. @param {any} v */
export const normJob = (v) => (JOBS.includes(v) ? v : 'study');

const byeWeek = (/** @type {any} */ s) => !!(s && s.training && s.training.noMatch === true);
const slotCount = (/** @type {any} */ s) => { const n = s && s.clinic && Number(s.clinic.slots); return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : MAX_COACHES; };
const twoSlot = (/** @type {any} */ s) => slotCount(s) < 3;

/** Role of a coach this week. @param {any} s @param {string} coachId */
function roleOf(s, coachId) {
  const list = coachList(s), c = list.find((x) => x.id === coachId); if (!c) return null;
  if (c.away > 0) return { c, role: 'away' };
  const idle = idleCoaches(s);
  if (!idle.some((x) => x.id === coachId)) return { c, role: 'nets' };
  const mc = byeWeek(s) ? null : matchCoachOf(s);
  return { c, role: mc && mc.coach.id === coachId ? 'matchcoach' : 'idle', hasIdle: true };
}

/** Rows {job, ok, why} for the picker; one per job. @param {any} s @param {string} coachId */
export function legalJobs(s, coachId) {
  const r = roleOf(s, coachId); if (!r) return [];
  const row = (/** @type {string} */ job, /** @type {boolean} */ ok, why = '') => ({ job, ok, why: ok ? '' : why });
  if (r.role === 'away') return JOBS.map((j) => row(j, false, 'Away on a course'));
  if (r.role === 'nets') {
    const none = !byeWeek(s) && !idleCoaches(s).length;
    return [row('nets', true), row('match', false, none ? 'No match coach this week' : byeWeek(s) ? 'No match this week' : 'Nets coach this week'),
      row('study', false, 'Nets coach this week'), row('scout', false, 'Nets coach this week')];
  }
  const bye = byeWeek(s);
  const matchWhy = bye ? 'No match this week' : 'Another coach is Match coach';
  if (r.role === 'matchcoach') {
    const free = twoSlot(s), why = 'Match coach this week';
    return [row('nets', false, 'Not the nets coach'), row('match', true), row('study', free, why), row('scout', free, why)];
  }
  return [row('nets', false, 'Not the nets coach'), row('match', false, matchWhy), row('study', true), row('scout', true)];
}

const okJob = (/** @type {any} */ s, /** @type {string} */ id, /** @type {string} */ job) => !!legalJobs(s, id).find((r) => r.job === job && r.ok);

/** Default job: last week's job if legal now, else Study (else the only legal job). @param {any} s @param {string} coachId */
export function defaultJob(s, coachId) {
  const r = roleOf(s, coachId); if (!r) return 'study';
  if (r.role === 'away') return 'away';
  if (r.role === 'nets') return 'nets';
  const last = normJob(r.c.job);
  if (okJob(s, coachId, last)) return last;
  if (okJob(s, coachId, 'study')) return 'study';
  return 'match';
}

/** The coach's job this week: 'nets' | 'match' | 'study' | 'scout' | 'away'. @param {any} s @param {string} coachId */
export const jobOf = (s, coachId) => defaultJob(s, coachId);

/** Set a legal job (sets job and jobWeek). An illegal job or unknown coach returns the same s. @param {any} s @param {string} coachId @param {string} job */
export function setJob(s, coachId, job) {
  if (!JOBS.includes(job) || !okJob(s, coachId, job)) return s;
  const i = (s.coaches || []).findIndex((/** @type {any} */ c) => c.id === coachId); if (i < 0) return s;
  const coaches = s.coaches.slice(); coaches[i] = { ...coaches[i], job, jobWeek: weekKey(s) };
  return { ...s, coaches };
}

/** One row per coach in coachList order. locked = the picker has no free choice. @param {any} s */
export function jobsThisWeek(s) {
  return coachList(s).map((c, slot) => {
    const job = jobOf(s, c.id), rows = legalJobs(s, c.id), open = rows.filter((r) => r.ok).length;
    const why = job === 'away' ? 'Away on a course' : job === 'nets' ? (byeWeek(s) || idleCoaches(s).length ? 'Nets coach this week' : 'No match coach this week')
      : job === 'match' ? 'Match coach this week' : '';
    return { coachId: c.id, slot, job, locked: open <= 1, why };
  });
}
