// @ts-check
// Coach steps (CONTRACT-B s3-s4, SPEC s4-s5): EndWeek Study/Scout pay and the Course cap. Pure: no DOM, no rng.
// endWeekPay mutates the draft n like a hook listener (fn(n, info)); the other exports are read-only.
import { XP_STUDY, XP_SCOUT, COURSE_MAX_STEP, COURSES_PER_SEASON } from '../data/coach-weekly.js';
import { jobOf, normJob } from './coach-jobs.js';
import { payXp } from './coach-xp.js';
import { coachList } from './training.js';

const int0 = (/** @type {any} */ v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const isInt = (/** @type {any} */ v) => typeof v === 'number' && Number.isInteger(v);

/** report.jobs on the draft, filled to the CONTRACT-B s1 shape (present values kept). @param {any} n */
function jobsOf(n) {
  const r = n.report && typeof n.report === 'object' ? n.report : (n.report = {});
  const j = r.jobs && typeof r.jobs === 'object' ? r.jobs : (r.jobs = {});
  for (const k of ['nets', 'match', 'wins', 'study', 'scout', 'away', 'scoutNames', 'courseCut']) j[k] = int0(j[k]);
  const x = j.xp && typeof j.xp === 'object' ? j.xp : (j.xp = {});
  for (const k of ['nets', 'match', 'study', 'scout']) x[k] = int0(x[k]);
  return j;
}

/**
 * EndWeek pay (endWeek hook, info = {week, weekKey} of the CLOSING week). Each coach once: job resolved by jobOf(n, id).
 * Study pays XP_STUDY, Scout XP_SCOUT (payXp: S+ and away pay 0). Nets / Match coaches get nothing here; away counts in report.jobs.away.
 * Counts study/scout/away coach-weeks in report.jobs. Non-away coaches get job = resolved job (next week's default) and jobWeek = info.weekKey.
 * Returns {paid: [{coachId, job, xp, steps}]}.
 * @param {any} n @param {{week?:number, weekKey?:number}} [info]
 */
export function endWeekPay(n, info) {
  const out = { paid: /** @type {{coachId:string, job:string, xp:number, steps:number}[]} */ ([]) };
  if (!n || typeof n !== 'object' || !Array.isArray(n.coaches)) return out;
  const wk = info && isInt(info.weekKey) ? info.weekKey : null;
  const jobs = jobsOf(n), seen = new Set();
  // resolve every job before paying, so a step-up mid-loop cannot change another coach's role
  const rows = coachList(n).filter((c) => !seen.has(c.id) && seen.add(c.id)).map((c) => ({ id: c.id, job: jobOf(n, c.id) }));
  for (const { id, job } of rows) {
    const c = n.coaches.find((/** @type {any} */ k) => k.id === id); if (!c) continue;
    if (job === 'away') { jobs.away += 1; continue; }
    c.job = normJob(job); c.jobWeek = wk;
    if (job !== 'study' && job !== 'scout') continue;
    jobs[job] += 1;
    const before = int0(c.xpTotal), amount = job === 'study' ? XP_STUDY : XP_SCOUT;
    const steps = payXp(n, id, amount, job);
    out.paid.push({ coachId: id, job, xp: int0(c.xpTotal) - before, steps });
  }
  return out;
}

/**
 * Course cap: to = min(step + gain, COURSE_MAX_STEP), never below the start step; cut = true when the cap took steps off.
 * The Course owner (T2) applies it; XP is not touched. @param {number} step @param {number} gain
 */
export function courseCap(step, gain) {
  const s = int0(step), g = int0(gain), raw = s + g;
  const to = Math.max(s, Math.min(raw, COURSE_MAX_STEP));
  return { to, cut: to < raw };
}

/** Any coach may start the club's course (M, 2026-11-16); at step 19+ the result is cut by courseCap, so the course can be wasted. @param {any} coach @returns {{ok:boolean, why:string}} */
export function canStartCourse(coach) {
  if (!coach || typeof coach !== 'object') return { ok: false, why: 'No coach' };
  return { ok: true, why: '' };
}

/**
 * Courses used this season, club wide. Counter = the live per-coach mark `courseSeason` (runCourse sets it to season.n):
 * coaches whose courseSeason equals the current season.n. No new save key; a released coach's course leaves the count.
 * @param {any} n
 */
export function coursesThisSeason(n) {
  const sn = n && n.season && isInt(n.season.n) ? n.season.n : null;
  if (sn === null || !n || !Array.isArray(n.coaches)) return 0;
  return n.coaches.filter((/** @type {any} */ c) => c && !c.candidate && c.courseSeason === sn).length;
}

/** True while the club has a course left this season (COURSES_PER_SEASON = 1). @param {any} n */
export const courseAllowed = (n) => coursesThisSeason(n) < COURSES_PER_SEASON;
