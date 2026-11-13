// @ts-check
// Save envelope, checksum and version migration. Pure: no storage, no clock, no rng. Never mutates its input.
import { applyTag } from './tags.js';
import { aiPickSix } from './clubs.js';
import { rawAbility, isHidden } from './ability.js';
import { newEconomy, backfillEconomy } from './economy.js';
import { FLAGS } from '../data/flags.js';
import { ECON as E } from '../data/economy.js';
import { SQUAD } from '../data/run.js';
import { coachFromOld, startCoach } from './training.js';
export const VERSION = 6;

/** fnv1a 32-bit of a string, as 8 hex digits. @param {string} str */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** @param {any} state @returns {{v:number, sum:string, data:any}} */
export function wrap(state) {
  const data = JSON.parse(JSON.stringify(state));
  return { v: VERSION, sum: fnv1a(JSON.stringify(data)), data };
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Old-shape coach to the new shape, dropping the old xp / lv / candidate keys. */
function oldCoach(c) {
  const { xp, lv, candidate, ...rest } = c;
  return { ...rest, ...coachFromOld(c) };
}

/** Refund value of a player: 0.5 x fee, the fee read from his ability before the grade shows and from his potential after. Ties: lower rating sum first. */
export function refundValue(p) {
  const a = isHidden(p) ? rawAbility(p) : p.potential;
  return Math.round(0.5 * a * 100) / 100;
}

/** Players to release (never in the Six, lowest refund value first) until `keep` remain; never below `floor`. Returns ledger entries. */
export function autoRelease(club, keep, floor) {
  const six = Array.isArray(club.six) && club.six.length === 6 ? club.six : aiPickSix(club);
  const sum = (p) => p.bp + p.bs + p.spd + p.bsk;
  const pool = club.squad.filter((p) => !six.includes(p.id)).map((p) => ({ p, v: refundValue(p) }))
    .sort((a, b) => a.v - b.v || sum(a.p) - sum(b.p) || (a.p.id < b.p.id ? -1 : 1));
  const out = [];
  let left = club.squad.length;
  for (const { p, v } of pool) {
    if (left <= keep || left <= floor) break;
    out.push({ player_id: p.id, name: p.name, value_at_release: v, rule: 'squad8' });
    left--;
  }
  return out;
}

/** One plan record (r7): training.sel -> focus / effort / spotlight_id / coach_id, training.lastPlan -> last_plan; drillCount (a dead counter, p.drillsHere is the reveal counter) is dropped; report counters start at 0. Idempotent. */
function tidyTraining(n) {
  if (!isObj(n.training)) return {};
  const T = { ...n.training }, sel = isObj(T.sel) ? T.sel : {};
  if (isObj(T.sel)) {
    if (typeof sel.focus === 'string') T.focus = sel.focus;
    if (typeof sel.effort === 'string') T.effort = sel.effort;
    if (sel.spotlightId !== undefined) T.spotlight_id = sel.spotlightId || null;
    if (sel.coachId !== undefined) T.coach_id = sel.coachId || null;
  }
  if (!T.last_plan && isObj(T.lastPlan) && typeof T.lastPlan.focus === 'string') T.last_plan = { ...T.lastPlan };
  delete T.sel; delete T.lastPlan; delete T.drillCount;
  if (T.coach_id === undefined) T.coach_id = null;
  T.netsRuns = T.netsRuns | 0; T.focusChanges = T.focusChanges | 0;
  return { training: T };
}

/** One-off economy back-fill for matches already played (r7); safe to call again (econ.backfilled). Returns the fields to merge: econ, notice. */
function backfillNote(n) {
  if (!isObj(n.econ) || n.econ.backfilled) return {};
  const r = backfillEconomy(n);
  if (!r.rounds) return { econ: r.state.econ };
  const notice = !n.notice ? 'econ-backfill' : String(n.notice).includes('econ-backfill') ? n.notice : n.notice + '+econ-backfill';
  return { econ: r.state.econ, notice };
}

/**
 * Steps keyed by the version they upgrade FROM. Each takes a private copy and returns the next version's state.
 * deps.newGame(seed) -> state (the store's NewGame); optional, so this file stays free of core imports.
 */
const STEPS = {
  // v0: a bare step-0 state (has `stage`, no `v`) -> v1 new game with season, squad and coaches.
  0: (data, deps) => {
    const ng = deps && typeof deps.newGame === 'function' ? deps.newGame(data.seed != null ? data.seed : '0') : null;
    if (isObj(ng) && ng.stage) return { ...ng, v: 1, salt: '' };
    return { ...data, v: 1, salt: '' }; // no new-game hook: keep the step-0 match as it was
  },
  // v1 -> v2: add the run record. Season number, league and game seed are read from the season; counters start at 0 (history was not kept).
  1: (data) => {
    const se = isObj(data.season) ? data.season : {};
    const n = Number.isInteger(se.n) ? se.n : 1, league = Number.isInteger(se.league) ? se.league : 1;
    const root = String(se.seed != null ? se.seed : data.seed != null ? data.seed : '0').replace(/\|s\d+$/, '');
    return { ...data, v: 2, run: { no: 1, root, n, league, best: league, titles: 0, finals: 0, wins: 0, bestAbility: 0, history: [], chapters: {}, last: null, ended: false } };
  },
  // v2 -> v3: add the Pairing Book (P4). 27 cells, none seen yet (balls faced before this version were not counted). 27 = CELLS in core/pairing.js (a test keeps them equal).
  2: (data) => ({ ...data, v: 3, book: { balls: Array(27).fill(0), found: Array(27).fill(0) } }),
  // v3 -> v4: rival style tags (P9). AI clubs c1..c3 get the league's named, tagged rivals and the tag offsets (once; a tagged club is skipped).
  3: (data) => {
    const league = (isObj(data.season) && Number.isInteger(data.season.league) ? data.season.league : isObj(data.run) && Number.isInteger(data.run.league) ? data.run.league : 1);
    const clubs = Array.isArray(data.clubs) ? data.clubs.map((c) => (isObj(c) && /^c[1-3]$/.test(c.id) && Array.isArray(c.squad) ? applyTag(c, league, Number(c.id.slice(1))) : c)) : data.clubs;
    return { ...data, v: 4, clubs };
  },
  // v4 -> v5 (P11): squad of 8, new training fields, coach shape, release ledger. SPEC s7. The store keeps a .v4bak copy of the raw v4 save (store.js).
  4: (data) => {
    const n = { ...data, v: 5 };
    const club = Array.isArray(n.clubs) ? n.clubs.find((c) => isObj(c) && c.id === 'c0') : null;
    if (club && Array.isArray(club.squad)) {
      const out = autoRelease(club, SQUAD.size, SQUAD.min);
      if (out.length) {
        n.clubs = n.clubs.map((c) => (c === club ? { ...club, squad: club.squad.filter((p) => !out.some((r) => r.player_id === p.id)) } : c));
        n.releaseLedger = [...(Array.isArray(n.releaseLedger) ? n.releaseLedger : []), ...out];
        n.notice = 'squad8';
      }
    }
    if (!Array.isArray(n.releaseLedger)) n.releaseLedger = [];
    if (!isObj(n.econ)) n.econ = { ...newEconomy({ legacy: true }), backfilled: false }; // paid for played rounds just below
    Object.assign(n, backfillNote(n));
    const T = isObj(n.training) ? { ...n.training } : {};
    for (const k of ['drilled', 'last', 'bulk', 'plan', 'drillPlan', 'lastPlan', 'autoBench']) delete T[k];
    T.focus = T.focus || 'bat'; T.effort = T.effort || 'normal'; T.spotlight_id = T.spotlight_id || null; T.last_plan = T.last_plan || null; // training.js reads lastPlan / sel and defaults when absent
    n.training = T;
    const staff = (Array.isArray(n.coaches) ? n.coaches : []).filter((c) => isObj(c) && !c.candidate).map((c) => (typeof c.step === 'number' && Array.isArray(c.strong) ? c : oldCoach(c)));
    n.coaches = staff.length ? staff : [startCoach('k0', 'Okafor')];
    n.coachPicked = true;
    for (const k of ['coachPool', 'coachBack', 'coachCur']) delete n[k];
    if (n.stage === 'coach') n.stage = 'hub'; // the pick screen is gone: the start coach is given
    return n;
  },
  // v5 -> v6 (r9, fans-matchday SPEC s1): the free facility pick. If econ.freePick is unset it is set pending (done at once when every facility is owned: no refund,
  // nothing owned is removed). With FLAGS.freePick on and something still at L0, the Home card is flagged by notice 'freepick'. Idempotent.
  5: (data) => {
    const n = { ...data, v: 6 };
    if (!isObj(n.econ)) return n;
    if (isObj(n.econ.freePick)) return n;
    const fac = isObj(n.econ.fac) ? n.econ.fac : {};
    const open = E.FAC.some((k) => !(fac[k] > 0));
    n.econ = { ...n.econ, freePick: open ? { done: false, pick: null } : { done: true, pick: null } };
    if (open && FLAGS.freePick) n.notice = !n.notice ? 'freepick' : String(n.notice).split('+').includes('freepick') ? n.notice : n.notice + '+freepick';
    return n;
  },
};

/**
 * @param {any} data a state at version `from`
 * @param {number} from
 * @param {{newGame?:(seed:any)=>any}} [deps]
 * @returns {{ok:boolean, state:any, from:number, reason?:string}}
 */
export function migrate(data, from, deps) {
  if (!isObj(data) || typeof data.stage !== 'string') return { ok: false, state: null, from, reason: 'shape' };
  if (!Number.isInteger(from) || from < 0) return { ok: false, state: null, from, reason: 'shape' };
  if (from > VERSION) return { ok: false, state: null, from, reason: 'newer' };
  let s = structuredClone(data);
  for (let v = from; v < VERSION; v++) {
    if (!STEPS[v]) return { ok: false, state: null, from, reason: 'shape' };
    s = STEPS[v](s, deps);
  }
  if (s.v === VERSION) Object.assign(s, tidyTraining(s));
  if (s.v === VERSION && isObj(s.season)) Object.assign(s, backfillNote(s)); // v5 saves written by r6 have an economy but no back-fill
  return { ok: true, state: s, from };
}

/**
 * Parse saved or pasted text. Accepts the envelope {v,sum,data} or a bare step-0 state.
 * @param {string} text
 * @param {{newGame?:(seed:any)=>any}} [deps]
 * @returns {{ok:boolean, state:any, from:number, reason?:string}}
 */
export function unwrap(text, deps) {
  const bad = (reason, from = -1) => ({ ok: false, state: null, from, reason });
  let o;
  try { o = JSON.parse(String(text == null ? '' : text).trim()); } catch (e) { return bad('parse'); }
  if (!isObj(o)) return bad('parse');
  if ('data' in o && 'sum' in o && 'v' in o) {
    if (!Number.isInteger(o.v) || o.v < 1) return bad('shape');
    if (o.v > VERSION) return bad('newer', o.v); // checked first: a newer file may use a newer checksum
    if (!isObj(o.data)) return bad('shape');
    if (o.sum !== fnv1a(JSON.stringify(o.data))) return bad('checksum', o.v);
    return migrate(o.data, o.v, deps);
  }
  if (typeof o.stage === 'string') return migrate(o, Number.isInteger(o.v) ? o.v : 0, deps);
  return bad('shape');
}
