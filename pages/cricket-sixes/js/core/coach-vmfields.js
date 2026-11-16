// @ts-check
// Coach weekly view-model fields for a training coach row (T5/T7). Pure: no DOM, no rng. core never imports ui; xp math mirrors ui/coach-xp-bar.js coachWeekly.
import { jobsThisWeek } from './coach-jobs.js';
import { xpToNext } from './coach-xp.js';
import { XP_MAX_STEP } from '../data/coach-weekly.js';

/** @param {any} s state @param {any} coach a coachList row @returns {{job:string, jobLocked:boolean, why:string, xp:number, xpNeed:number|null, max:boolean, stepUpPending:number}} */
export function coachVmFields(s, coach) {
  const row = jobsThisWeek(s).find((r) => r.coachId === coach.id);
  const job = row ? row.job : 'study';
  const step = Math.max(1, Math.min(XP_MAX_STEP, (coach.step | 0) || 1)), max = step >= XP_MAX_STEP, need = max ? null : xpToNext(step);
  const xp = max || need === null ? 0 : Math.max(0, Math.min(need - 1, Math.floor(Number(coach.xp)) || 0));
  return { job, jobLocked: !!(row && row.locked), why: row ? row.why : '', xp, xpNeed: need, max, stepUpPending: Math.max(0, Math.floor(Number(coach.stepUpPending)) || 0) };
}
