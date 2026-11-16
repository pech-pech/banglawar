// @ts-check
// Stop records and report stats of every wheel (CONTRACT-A s6/s7, Lead calls 6/9; wheels SPEC s2d/s11a/s13). Owner T1. Pure, no DOM, no rng.
//
// recordStop(n, wheelId, spinKey, rec, opts?) -> n   mutates the reducer draft n in place, in the same dispatch as STOP:
//   - creates n.wheels (and any missing / non-object sub-map, as normWheels: WHEELS_DEFAULT) and the stops[wheelId][spinKey] entry
//     {stops:[], kept:0, spent:false} when missing;
//   - appends the cleaned StopRec {stopT:int>=0 ms, cycle:int>=1, tInCycle:0..6 s, sliceId:int>=0, value, paid? (Finals), auto:bool, respin:0|1};
//   - kept: rec.kept when it is a valid index (the player's Pick Two choice; marks the entry keptBy:'pick', and a later stop without
//     rec.kept leaves that choice alone); otherwise the index of the highest value, a tie keeps the first (Spin Again, SPEC 11a);
//   - spent = true once rec.spent is true (sticky); markSpent writes it at the Spin Again / Pick Two press, before the next STOP (SPEC 2d);
//   - stats[wheelId]: n += 1 always; when !rec.auto also careful / early / late and a tap {cycle, tInCycle} (last 200 kept).
// Careful (SPEC s13): value > WHEEL_MEDIAN[wheelId] (spot 1.0, course 1, hype 4, toss 2.5, pep 5, scout 0.5, finals 20); Find: the tick is
// on a FIND block (value >= FIND = 1). rec.careful / opts.careful (boolean) win, then rec.median / opts.median, then the table. match
// (wheel-match SPEC 14) and clinic have no table row: their caller passes careful (or median); without one careful is not counted.
// median / careful / kept / spent are never stored on the StopRec.
// Early = tInCycle < GLOW[0] (3.2 s), late = tInCycle > GLOW[1] (3.8 s); they may overlap with careful.
// An empty or non-string spinKey, or an unknown wheelId, records nothing (n returned as is).
//
// markSpent(n, wheelId, spinKey) -> n   Spin Again / Pick Two press: the entry (created when missing) gets spent:true; no stop, no stats.
//
// spinKeyOf(s, wheelId, ctx?) -> string  (CONTRACT-A s7, T1-PLAN accepted 07:45): '' when the occasion does not exist.
//   match  = matchDayIdOf(s)|ball, ball = ctx.ball (int >= 0, matchBallOf); '' with no ball or no fixture (quick match records nothing);
//   hype / toss / pep = matchDayIdOf(s); scout = seasonIdOf(s);
//   finals = seasonIdOf(s)|kind|round of the semi / final (as finalsKey; ctx.kind / ctx.round override the fixture), '' when the
//            fixture is not a semi or final with an integer round (never a second key shape for one occasion);
//   spot / course / find = occasionIdOf(s, wheelId, ctx) ('' with no player / coach);
//   clinic = `${weekKey}:${coachId}` (CONTRACT-B lead call 4), slot fallback when no ctx.coachId (default 0).
// statsOf(s, wheelId) -> {n, careful, early, late, taps}  stored stats with defaults (a fresh copy, never the stored object).
// storedStop(s, wheelId, spinKey) -> entry | null          the stored {stops, kept, spent} (the live object), null when unspun.
import { WHEEL_ENGINE, WHEEL_STOP_IDS } from '../data/wheel-engine.js';
import { WHEELS_DEFAULT } from '../data/save-defaults.js';
import { weekKey } from './week-key.js';
import { seasonIdOf, matchDayIdOf, occasionIdOf } from './spin-keys.js';

export const TAPS_MAX = 200;
const [EARLY_T, LATE_T] = WHEEL_ENGINE.GLOW;
/** Report medians, one value per slice (wheels SPEC s13). Find counts FIND blocks (FIND_VALUE); match / clinic: the caller decides. */
export const WHEEL_MEDIAN = Object.freeze({ spot: 1.0, course: 1, hype: 4, toss: 2.5, pep: 5, scout: 0.5, finals: 20 });
const FIND_VALUE = 1;

const isObj = (/** @type {any} */ x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (/** @type {any} */ x, /** @type {number} */ d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const int = (/** @type {any} */ x, /** @type {number} */ d) => Math.trunc(num(x, d));
const known = (/** @type {any} */ w) => typeof w === 'string' && WHEEL_STOP_IDS.includes(w);

/** n.wheels with every sub-map present (same fill as normWheels: a missing or non-object sub-key gets its default). @param {any} n */
function wheelsOf(n) {
  if (!isObj(n.wheels)) n.wheels = {};
  for (const k of Object.keys(WHEELS_DEFAULT)) if (!isObj(n.wheels[k])) n.wheels[k] = structuredClone(/** @type {any} */ (WHEELS_DEFAULT)[k]);
  return n.wheels;
}

/** The stops[wheelId][spinKey] entry on the draft, created when missing. @param {any} n @param {string} wheelId @param {string} spinKey */
function entryOf(n, wheelId, spinKey) {
  const W = wheelsOf(n);
  if (!isObj(W.stops[wheelId])) W.stops[wheelId] = {};
  const byKey = W.stops[wheelId];
  if (!isObj(byKey[spinKey])) byKey[spinKey] = { stops: [], kept: 0, spent: false };
  const e = byKey[spinKey];
  if (!Array.isArray(e.stops)) e.stops = [];
  return e;
}
const okArgs = (/** @type {any} */ n, /** @type {any} */ w, /** @type {any} */ k) => isObj(n) && known(w) && typeof k === 'string' && !!k;

/** Careful of one non-auto stop (see the top comment). @param {string} wheelId @param {any} sr @param {any} r @param {any} o */
function carefulOf(wheelId, sr, r, o) {
  const fin = (/** @type {any} */ x) => typeof x === 'number' && Number.isFinite(x);
  if (typeof r.careful === 'boolean') return r.careful;
  if (typeof o.careful === 'boolean') return o.careful;
  const med = fin(r.median) ? r.median : fin(o.median) ? o.median : /** @type {any} */ (WHEEL_MEDIAN)[wheelId];
  if (fin(med)) return sr.value > med;
  return wheelId === 'find' ? sr.value >= FIND_VALUE : false;
}

/** The StopRec as stored (CONTRACT-A s6). @param {any} r */
function cleanRec(r) {
  const out = /** @type {any} */ ({ stopT: Math.max(0, int(r.stopT, 0)), cycle: Math.max(1, int(r.cycle, 1)),
    tInCycle: Math.min(WHEEL_ENGINE.PULSE_PERIOD, Math.max(0, num(r.tInCycle, 0))), sliceId: Math.max(0, int(r.sliceId, 0)), value: num(r.value, 0) });
  if (typeof r.paid === 'number' && Number.isFinite(r.paid)) out.paid = r.paid;
  out.auto = !!r.auto; out.respin = r.respin ? 1 : 0;
  return out;
}

/** Index of the highest value; a tie keeps the first. @param {any[]} stops */
const bestIdx = (stops) => stops.reduce((b, x, i) => (num(x && x.value, -Infinity) > num(stops[b] && stops[b].value, -Infinity) ? i : b), 0);

/** Stats with every field the right type (a fresh object). @param {any} st */
function cleanStats(st) {
  const o = isObj(st) ? st : {};
  const taps = Array.isArray(o.taps) ? o.taps.filter(isObj).map((t) => ({ cycle: Math.max(1, int(t.cycle, 1)), tInCycle: num(t.tInCycle, 0) })) : [];
  return { n: Math.max(0, int(o.n, 0)), careful: Math.max(0, int(o.careful, 0)), early: Math.max(0, int(o.early, 0)), late: Math.max(0, int(o.late, 0)), taps: taps.slice(-TAPS_MAX) };
}

/**
 * Record one STOP on the draft (see the top comment). Mutates and returns n.
 * @param {any} n @param {string} wheelId @param {string} spinKey
 * @param {any} rec StopRec + optional {kept, spent, median, careful}
 * @param {{median?:number, careful?:boolean}} [opts]
 */
export function recordStop(n, wheelId, spinKey, rec, opts = {}) {
  if (!okArgs(n, wheelId, spinKey)) return n;
  const r = isObj(rec) ? rec : {}, o = isObj(opts) ? opts : {}, W = wheelsOf(n), e = entryOf(n, wheelId, spinKey);
  const sr = cleanRec(r);
  e.stops.push(sr);
  const k = r.kept;
  if (Number.isInteger(k) && k >= 0 && k < e.stops.length) { e.kept = k; e.keptBy = 'pick'; }
  else if (!(e.keptBy === 'pick' && Number.isInteger(e.kept) && e.kept >= 0 && e.kept < e.stops.length)) { e.kept = bestIdx(e.stops); delete e.keptBy; }
  e.spent = e.spent === true || r.spent === true;
  const st = cleanStats(W.stats[wheelId]);
  st.n += 1;
  if (!sr.auto) {
    if (carefulOf(wheelId, sr, r, o)) st.careful += 1;
    if (sr.tInCycle < EARLY_T) st.early += 1;
    if (sr.tInCycle > LATE_T) st.late += 1;
    st.taps.push({ cycle: sr.cycle, tInCycle: sr.tInCycle });
    if (st.taps.length > TAPS_MAX) st.taps = st.taps.slice(-TAPS_MAX);
  }
  W.stats[wheelId] = st;
  return n;
}

/**
 * Spin Again / Pick Two press (SPEC 2d): spent:true at once, before the next STOP. Creates the entry when missing; no stop, no stats.
 * @param {any} n @param {string} wheelId @param {string} spinKey
 */
export function markSpent(n, wheelId, spinKey) {
  if (!okArgs(n, wheelId, spinKey)) return n;
  entryOf(n, wheelId, spinKey).spent = true;
  return n;
}

/**
 * Spin key of a wheel occasion (see the top comment). Never throws; '' when there is no occasion.
 * @param {any} s @param {string} wheelId @param {{ball?:number, slot?:number, playerId?:string, coachId?:string, k?:number, kind?:string, round?:number}} [ctx]
 */
export function spinKeyOf(s, wheelId, ctx = {}) {
  const c = isObj(ctx) ? ctx : {};
  try {
    switch (wheelId) {
      case 'match': { const mk = matchDayIdOf(s); return mk && Number.isInteger(c.ball) && c.ball >= 0 ? `${mk}|${c.ball}` : ''; }
      case 'hype': case 'toss': case 'pep': return matchDayIdOf(s);
      case 'scout': return seasonIdOf(s);
      case 'finals': {
        const fx = isObj(s) && isObj(s.fixture) ? s.fixture : {}, kind = c.kind ?? fx.kind, round = c.round ?? fx.round;
        return (kind === 'semi' || kind === 'final') && Number.isInteger(round) ? `${seasonIdOf(s)}|${kind}|${round}` : '';
      }
      case 'spot': case 'course': case 'find': return occasionIdOf(s, wheelId, c);
      case 'clinic': return (c.coachId != null && c.coachId !== '') ? `${weekKey(s)}:${c.coachId}` : `${weekKey(s)}:${Math.max(0, int(c.slot, 0))}`;
      default: return '';
    }
  } catch { return ''; }
}

/** Report stats of a wheel, defaults {n:0, careful:0, early:0, late:0, taps:[]}. @param {any} s @param {string} wheelId */
export function statsOf(s, wheelId) {
  const st = isObj(s) && isObj(s.wheels) && isObj(s.wheels.stats) ? s.wheels.stats[wheelId] : undefined;
  return cleanStats(st);
}

/** Stored stop entry {stops, kept, spent}, or null when unspun. @param {any} s @param {string} wheelId @param {string} spinKey */
export function storedStop(s, wheelId, spinKey) {
  const by = isObj(s) && isObj(s.wheels) && isObj(s.wheels.stops) ? s.wheels.stops[wheelId] : undefined;
  const e = isObj(by) && typeof spinKey === 'string' ? by[spinKey] : undefined;
  return isObj(e) && Array.isArray(e.stops) ? e : null;
}
