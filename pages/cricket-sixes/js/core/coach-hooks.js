// @ts-check
// T5 hook listeners (CONTRACT-B s6): coach XP and job counts on netsRun / matchEnd / endWeek / seasonClose.
// installCoachHooks() is safe to call twice (once-guard per hook registry state). Listeners never throw. Pure: no DOM, no rng.
import { onHook } from './hooks.js';
import { netsXp, matchXp, payXp } from './coach-xp.js';
import { endWeekPay } from './coach-steps.js';
import { scoutNameGain, seasonReset } from './coach-scout.js';
import { matchCoachOf } from './training.js';

const int0 = (/** @type {any} */ v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
/** report.jobs on the draft, created if missing. @param {any} n */
function jobsOf(n) {
  const r = n.report && typeof n.report === 'object' ? n.report : (n.report = {});
  const j = r.jobs && typeof r.jobs === 'object' ? r.jobs : (r.jobs = {});
  return j;
}
const safe = (/** @type {Function} */ fn) => (/** @type {any} */ n, /** @type {any} */ info) => { try { fn(n, info || {}); } catch (e) { console.warn('coach hook failed:', e); } };

/** netsRun: pay the picked coach once for the MAIN run. A jackpot / extra run (info.jackpot, info.extra) pays none. */
function onNets(n, info) {
  if (!n || info.jackpot || info.extra) return;
  const id = info.plan && info.plan.coachId; if (!id) return;
  const probe = { coaches: n.coaches, training: { ...(n.training || {}), ...(info.plan.focus ? { focus: info.plan.focus } : {}) } };
  payXp(n, id, netsXp(probe, id), 'nets');
  const j = jobsOf(n); j.nets = int0(j.nets) + 1;
}
/** matchEnd: Match XP to the match coach (info.mcId else matchCoachOf). No match coach: nothing paid, nothing counted. */
function onMatch(n, info) {
  if (!n) return;
  const id = info.mcId || (matchCoachOf(n) || {}).coach?.id; if (!id) return;
  const won = !!info.won;
  payXp(n, id, matchXp(won), 'match');
  const j = jobsOf(n); j.match = int0(j.match) + 1; j.wins = int0(j.wins) + (won ? 1 : 0);
}
/** endWeek: Study/Scout pay (endWeekPay, which also sets each coach's job = resolved job), then +1 scout name per scouting coach. */
function onEndWeek(n, info) {
  if (!n) return;
  const { paid } = endWeekPay(n, info);
  let names = 0;
  for (const p of paid) if (p.job === 'scout') names += scoutNameGain(n, p.coachId);
  if (names) { const j = jobsOf(n); j.scoutNames = int0(j.scoutNames) + names; }
}

/** @type {(() => void)[]} */
let offs = [];
/** Register the T5 listeners once. A repeat call first drops the previous registration, so listeners never double (also after clearHooks()). */
export function installCoachHooks() {
  for (const off of offs) { try { off(); } catch { /* ignore */ } }
  offs = [
    onHook('netsRun', safe(onNets)),
    onHook('matchEnd', safe(onMatch)),
    onHook('endWeek', safe(onEndWeek)),
    onHook('seasonClose', safe((n) => seasonReset(n))),
  ];
}
