// @ts-check
// Clinic view-model helpers (T6, pure): the per-coach Clinic row and the per-player boost map. Nothing here writes.
import { CLINIC_SLICES, CLINIC_SLICE_ORDER, CLINIC_WHEEL_ID, CLINIC_PCT } from '../data/clinic.js';
import { clinicOf, canClinic, clinicSpinKey } from './clinic.js';
import { normBoost } from './clinic-boost.js';
import { findPlayer } from './training.js';

const isObj = (/** @type {any} */ x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** Prize words for a ring index: 'Medium, +10%' / 'Jackpot, one extra nets roll'; '' when unknown. @param {any} sliceId */
export function clinicPrize(sliceId) {
  const k = Number.isInteger(sliceId) ? CLINIC_SLICE_ORDER[sliceId] : null; if (!k) return '';
  return k === 'JP' ? 'Jackpot, one extra nets roll' : `${CLINIC_SLICES[k].label}, +${CLINIC_PCT[k]}%`;
}

/**
 * The Clinic part of a coach row: state 'ready' (may spin now) | 'used' (spun this week; prize + playerName set) | 'nets' (nets already run) | 'course' (cannot spin now: away, no slot, wrong stage, nobody to pick).
 * @param {any} s @param {any} coach a coach (or {id}) @returns {{state:'ready'|'used'|'nets'|'course', prize:string, playerName:string}|null}
 */
export function clinicCoachVM(s, coach) {
  try {
    if (!s || !coach || coach.id == null || !isObj(s.clinic)) return null;
    const c = clinicOf(s), spin = (Array.isArray(c.spins) ? c.spins : []).find((/** @type {any} */ x) => x && x.coachId === coach.id);
    if (spin) {
      const stops = s.wheels && isObj(s.wheels.stops) && isObj(s.wheels.stops[CLINIC_WHEEL_ID]) ? s.wheels.stops[CLINIC_WHEEL_ID] : {};
      const st = stops[spin.spinKey || clinicSpinKey(s, coach.id)];
      const p = findPlayer(s, spin.playerId);
      return { state: 'used', prize: st ? clinicPrize(st.sliceId) : '', playerName: p && p.name ? String(p.name) : '' };
    }
    const r = canClinic(s, coach.id);
    return { state: r.ok ? 'ready' : r.why === 'nets' ? 'nets' : 'course', prize: '', playerName: '' };
  } catch { return null; }
}

/** This week's boosts by player: {playerId: {pcts:int[], extraRun:bool}} (clean entries; empty ones left out). @param {any} s */
export function clinicBoostMap(s) {
  /** @type {Record<string,{pcts:number[], extraRun:boolean}>} */
  const out = {};
  try {
    const b = s && isObj(s.clinic) ? clinicOf(s).boost : null;
    if (!isObj(b)) return out;
    for (const id of Object.keys(b)) { const e = normBoost(b[id]); if (e.pcts.length || e.extraRun) out[id] = e; }
  } catch { /* empty map */ }
  return out;
}
