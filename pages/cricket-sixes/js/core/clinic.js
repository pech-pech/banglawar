// @ts-check
// Clinic core (coach-weekly SPEC s6, s7, s10; CONTRACT-B s5): ready count, the week-checked block, who may spin, who can be picked.
// Pure reads of the state; nothing here writes. The spin itself is the store (T6), the boost is clinic-boost.js, the reset is clinic-hooks.js.
import { CLINIC_DEFAULT } from '../data/save-defaults.js';
import { weekKey } from './week-key.js';
import { coachList, netsPreview, findPlayer, MAX_COACHES } from './training.js';

const isObj = (/** @type {any} */ x) => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * This week's Clinic block. A missing block, or one whose week is not the current weekKey, reads as the default
 * (no spins, no boost, nothing pending). Never throws, never mutates; returns a fresh object for the default.
 * @param {any} s the game state
 */
export function clinicOf(s) {
  const wk = weekKey(s), c = s && isObj(s.clinic) ? s.clinic : null;
  if (c && c.week === wk) return c;
  const T = (s && isObj(s.training) && s.training) || {};
  return { ...structuredClone(CLINIC_DEFAULT), week: wk, slots: MAX_COACHES, netsDone: T.netsWeek != null && T.netsWeek === T.week };
}

/** The spinKey of a coach's spin this week (CONTRACT-B lead call 4). @param {any} s @param {string} coachId */
export const clinicSpinKey = (s, coachId) => `${weekKey(s)}:${coachId}`;

const spinsOf = (/** @type {any} */ c) => (Array.isArray(c.spins) ? c.spins : []);

/**
 * May this coach spin the Clinic now? why: '' | 'unknown' | 'slots' (slot beyond the week's first-day slots) | 'away' | 'used' (this coach already spun this week) | 'nets' (nets already run) | 'nobody' (no one can be picked).
 * @param {any} s @param {string} coachId @returns {{ok:boolean, why:string}}
 */
export function canClinic(s, coachId) {
  const list = s && Array.isArray(s.coaches) ? coachList(s) : [];
  const slot = list.findIndex((c) => c.id === coachId);
  if (slot < 0) return { ok: false, why: 'unknown' };
  const c = clinicOf(s), co = list[slot];
  if (co.away > 0) return { ok: false, why: 'away' };
  if (slot >= (Number.isInteger(c.slots) ? c.slots : MAX_COACHES)) return { ok: false, why: 'slots' };
  if (spinsOf(c).some((/** @type {any} */ x) => x && (x.coachId === coachId))) return { ok: false, why: 'used' };
  if (spinsOf(c).length >= (Number.isInteger(c.slots) ? c.slots : MAX_COACHES)) return { ok: false, why: 'slots' }; // slot count spent (slot index is only stored, never matched)
  if (c.netsDone || (s.training && s.training.netsWeek != null && s.training.netsWeek === s.training.week)) return { ok: false, why: 'nets' };
  if (!pickable(s).some((p) => p.ok)) return { ok: false, why: 'nobody' };
  return { ok: true, why: '' };
}

/**
 * Players the pick list shows: every squad player in nets order, ok when this week's TP covers him and he can still gain
 * (SPEC s7). why: '' | 'At cap' (no legal gain: cap, balance or 99) | 'No TP' (can gain, pool short).
 * @param {any} s @returns {{playerId:string, ok:boolean, why:string}[]}
 */
export function pickable(s) {
  if (!s || !isObj(s.training) || !Array.isArray(s.clubs)) return [];
  const pv = netsPreview(s);
  return [
    ...pv.trainIds.map((/** @type {string} */ playerId) => ({ playerId, ok: true, why: '' })),
    ...pv.shortIds.map((/** @type {string} */ playerId) => ({ playerId, ok: false, why: 'No TP' })),
    ...pv.skippedIds.map((/** @type {string} */ playerId) => ({ playerId, ok: false, why: 'At cap' })),
  ].filter((p) => findPlayer(s, p.playerId));
}

/**
 * How many Clinic spins are ready this week (badge on the Clinic button): coaches that canClinic, clamped 0-3.
 * @param {any} s the game state
 * @returns {number} int 0-3
 */
export function clinicReadyCount(s) {
  try {
    if (!s || !Array.isArray(s.coaches) || !isObj(s.clinic)) return 0; // a state without the clinic block (pre-fill, S0 fixture game()) shows no badge
    const n = coachList(s).filter((c) => canClinic(s, c.id).ok).length;
    return Math.max(0, Math.min(3, n));
  } catch { return 0; }
}
