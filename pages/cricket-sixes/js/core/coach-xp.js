// Coach XP (CONTRACT-B s4): pure pay functions, no DOM, no rng. payXp / stepLoop mutate the draft like hooks do.
import { XP_PER_STEP, XP_MAX_STEP, XP_NETS, XP_NETS_WEAK, XP_MATCH, XP_WIN_MULT } from '../data/coach-weekly.js';
import { planOf } from './training.js';

const int0 = (/** @type {any} */ v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
/** XP needed to leave this step; null at the top step. @param {number} step */
export const xpToNext = (step) => (step >= XP_MAX_STEP ? null : XP_PER_STEP[step - 1] ?? null);

/** Nets XP for a coach: 10 when strong in this week's nets focus (same test as coachQuality), else 5, 0 if away or unknown. @param {any} s @param {string} coachId */
export function netsXp(s, coachId) {
  const c = (s.coaches || []).find((/** @type {any} */ k) => k.id === coachId);
  if (!c || c.away > 0) return 0;
  const strong = Array.isArray(c.strong) && c.strong.includes(planOf(s).focus);
  return strong ? XP_NETS : XP_NETS_WEAK;
}
/** Match XP: 6, doubled on a win. @param {boolean} won */
export const matchXp = (won) => (won ? XP_MATCH * XP_WIN_MULT : XP_MATCH);

/** Clamp a coach's saved xp (CONTRACT-B s1). Mutates. @param {any} c */
export function clampXp(c) {
  c.xp = int0(c.xp); const cost = xpToNext(c.step);
  if (cost === null) c.xp = 0; else if (c.xp >= cost) c.xp = cost - 1;
  return c.xp;
}
/** While xp covers the cost: step+1, stepsXp+1, stepUpPending+1. Top step keeps xp 0. Returns steps gained. @param {any} c */
export function stepLoop(c) {
  c.xp = int0(c.xp); c.step = Math.min(XP_MAX_STEP, int0(c.step) || 1);
  let gained = 0, cost;
  while ((cost = xpToNext(c.step)) !== null && c.xp >= cost) { c.xp -= cost; c.step += 1; c.stepsXp = int0(c.stepsXp) + 1; c.stepUpPending = int0(c.stepUpPending) + 1; gained++; }
  if (c.step >= XP_MAX_STEP) c.xp = 0;
  return gained;
}
/** Pay XP to a coach on draft n (xp, xpTotal, report.jobs.xp[job], then stepLoop). Away coach, S+ and amount <= 0 pay nothing. Returns steps gained. @param {any} n @param {string} coachId @param {number} amount @param {string} job */
export function payXp(n, coachId, amount, job) {
  const c = (n.coaches || []).find((/** @type {any} */ k) => k.id === coachId);
  if (!c || c.away > 0 || !(amount > 0)) return 0;
  clampXp(c);
  if (c.step >= XP_MAX_STEP) return 0;
  const a = Math.floor(amount);
  c.xp += a; c.xpTotal = int0(c.xpTotal) + a;
  const r = n.report || (n.report = {}), j = r.jobs || (r.jobs = {}), x = j.xp || (j.xp = {});
  x[job] = int0(x[job]) + a;
  return stepLoop(c);
}
