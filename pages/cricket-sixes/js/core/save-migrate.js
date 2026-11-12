// @ts-check
// Save envelope, checksum and version migration. Pure: no storage, no clock, no rng. Never mutates its input.
export const VERSION = 3;

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
