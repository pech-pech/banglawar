// Coach Scout job (SPEC s4/s5): a Scout-week coach queues +1 name for the next scout list, max 2 extra a season. Pure: mutates the state object it is handed (pass a clone), no DOM, no rng.
import { SCOUT_NAMES_PER_JOB, SCOUT_NAMES_MAX_SEASON } from '../data/coach-weekly.js';

const int = (v) => { const x = Math.floor(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };
const rec = (n) => { if (!n.scout || typeof n.scout !== 'object') n.scout = {}; return n.scout; };

/** Queued extra names for the next list. @param {any} n state */
export const bonusNamesOf = (n) => int(n && n.scout && n.scout.bonusNames);
/** Extra names already added this season (0..max). @param {any} n state */
export const extraThisSeasonOf = (n) => Math.min(SCOUT_NAMES_MAX_SEASON, int(n && n.scout && n.scout.extraThisSeason));

/**
 * EndWeek hook for one coach. Adds SCOUT_NAMES_PER_JOB to s.scout.bonusNames when he is on the scout job, not away, and the season cap is not reached.
 * Past the cap the job still pays XP elsewhere but adds no name. Mutates n.scout. @param {any} n state @param {string} coachId @returns {number} names added (0|1)
 */
export function scoutNameGain(n, coachId) {
  const c = ((n && n.coaches) || []).find((x) => x && x.id === coachId);
  if (!c || c.job !== 'scout' || int(c.away) > 0) return 0;
  const sc = rec(n), used = extraThisSeasonOf(n), room = SCOUT_NAMES_MAX_SEASON - used;
  if (room <= 0) { sc.extraThisSeason = used; sc.bonusNames = bonusNamesOf(n); return 0; }
  const add = Math.min(SCOUT_NAMES_PER_JOB, room);
  sc.bonusNames = bonusNamesOf(n) + add; sc.extraThisSeason = used + add;
  return add;
}
/** Called when the scout list is built: empties the queue, returns how many extra names to add. @param {any} n state @returns {number} */
export function takeBonusNames(n) {
  const k = bonusNamesOf(n); if (n && n.scout && typeof n.scout === 'object') n.scout.bonusNames = 0; return k;
}
/** Season rollover: extraThisSeason = 0, unused queued names dropped. @param {any} n state */
export function seasonReset(n) { const sc = rec(n); sc.extraThisSeason = 0; sc.bonusNames = 0; }
