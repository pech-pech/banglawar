// @ts-check
// Spin key accessors (CONTRACT-A s6/s7, Lead call 5; owner T1). Pure, no DOM, no rng. Every function reads the state only, returns a
// deterministic string (or int), and never throws on a partial or garbage save. `wheels.*` resets with each run (newRunFrom builds a fresh
// game), so ids need no run number.
//   seasonOf(s)     s.season.n, default 1 (same as wheelmeta / wheels/common seasonN)
//   weekOf(s)       s.training.week (run-cumulative), default 0
//   seasonIdOf(s)   String(seasonOf(s)), e.g. "2" (the key scoutSpin.n already uses)
//   matchDayIdOf(s) matchKeyOf(s) = `season|kind|round|salt`, e.g. "2|league|8|" (the token-cap key); '' when no fixture
//   occasionIdOf(s, wheelId, ctx?)  the existing occasion of a training / activity wheel:
//     spot   `${weekKey}|${playerId}` (+ '|2' for the Twin slot): playerId = ctx.playerId, else the plan's Spotlight (slot 2: spotlight2_id);
//            '' with no player
//     course `${seasonId}|${coachId}|${k}`: coachId = ctx.coachId ('' with none); k = 2 only when ctx.k is 2 (the Master Coach Licence
//            2nd course: the host reads courseUsesLicence(s, coachId) on the state before the dispatch and passes k), else 1. k never
//            reads coach.courseSeason / licenceSeason, which runCourse sets in the same dispatch, so the key is the same before and after it.
//     find   roundKey(s), e.g. "2.20" (one Find a round, the activity guard key)
//     other wheels: ''
import { matchKeyOf } from './wheelmeta.js';
import { roundKey } from './activities.js';
import { weekKey } from './week-key.js';

const isObj = (/** @type {any} */ x) => !!x && typeof x === 'object' && !Array.isArray(x);
const int = (/** @type {any} */ x, /** @type {number} */ d) => (typeof x === 'number' && Number.isFinite(x) ? Math.trunc(x) : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : d);
const str = (/** @type {any} */ x) => (typeof x === 'string' ? x : typeof x === 'number' && Number.isFinite(x) ? String(x) : '');
const safe = (/** @type {() => string} */ f) => { try { const v = f(); return typeof v === 'string' ? v : ''; } catch { return ''; } };

/** Season number, default 1 (a missing, zero or bad n reads 1). @param {any} s */
export function seasonOf(s) {
  const n = int(isObj(s) && isObj(s.season) ? s.season.n : undefined, 1);
  return n >= 1 ? n : 1;
}

/** Training week (run-cumulative, never reset per season), default 0. @param {any} s */
export function weekOf(s) {
  const w = int(isObj(s) && isObj(s.training) ? s.training.week : undefined, 0);
  return w >= 0 ? w : 0;
}

/** Season id for `wheels.scoutCards` and Scout / Finals spin keys: String(seasonOf(s)). @param {any} s */
export const seasonIdOf = (s) => String(seasonOf(s));

/** Match-day id for Hype / Toss / Pep keys and `wheels.pep*`: `season|kind|round|salt` (matchKeyOf), '' with no fixture. @param {any} s */
export const matchDayIdOf = (s) => (isObj(s) && isObj(s.fixture) ? safe(() => matchKeyOf({ ...s, season: { n: seasonOf(s) } })) : '');

/** Spotlight player on the plan (slot 2 = Twin pass wheel); mirrors planOf's raw read, without the squad check. @param {any} s @param {number} slot */
function spotPlayer(s, slot) {
  const T = isObj(s) && isObj(s.training) ? s.training : {}, leg = isObj(T.sel) ? T.sel : {};
  return slot === 2 ? str(T.spotlight2_id) : str(T.spotlight_id ?? leg.spotlightId);
}

/**
 * Occasion id of a Spotlight, Course or Find spin (see the top comment); '' for any other wheel.
 * @param {any} s @param {string} wheelId @param {{playerId?:string, slot?:number, coachId?:string, k?:number}} [ctx]
 */
export function occasionIdOf(s, wheelId, ctx = {}) {
  const c = isObj(ctx) ? ctx : {};
  if (wheelId === 'spot') {
    const slot = int(c.slot, 1) === 2 ? 2 : 1, pid = str(c.playerId) || spotPlayer(s, slot);
    return pid ? `${safe(() => String(weekKey(s)))}|${pid}${slot === 2 ? '|2' : ''}` : '';
  }
  if (wheelId === 'course') {
    const id = str(c.coachId), k = int(c.k, 1) === 2 ? 2 : 1;
    return id ? `${seasonIdOf(s)}|${id}|${k}` : '';
  }
  if (wheelId === 'find') return isObj(s) ? safe(() => roundKey({ ...s, season: { ...(isObj(s.season) ? s.season : {}), n: seasonOf(s) } })) : `${seasonOf(s)}.${(seasonOf(s) - 1) * 12 + 1}`;
  return '';
}
