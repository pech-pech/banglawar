// @ts-check
// s1 squad skew (2026-11-14-squad-skew/SPEC.md): top order bats better, lower order bowls better, middle as rolled. Ours only; rivals untouched.
import { SKEW, SQUAD } from '../data/run.js';
import { ABILITY } from '../data/ability.js';
import { capSum, bowlPart } from './ability.js';

const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));
/** True when this game uses the s1 rules (new games only). @param {any} s */
export const skewOn = (s) => !!(s && s.rules && s.rules.squadSkew);
/** Squad cap for this save: s.rules.squadMax (new games 9), else the old 8. @param {any} s */
export const squadMax = (s) => (s && s.rules && s.rules.squadMax) || SQUAD.size;
/**
 * Shift one freshly rolled player by batting type. Returns a new player. Potential: shift, clamp 20..limit, then re-raise to the cap-sum floor.
 * @param {any} p @param {number} [room] cap-sum room over the four ratings (SEASON.capRoom)
 */
export function skewPlayer(p, room = 0) {
  const k = /** @type {any} */ (SKEW)[String(p.bat).toLowerCase()] || SKEW.middle;
  const q = { ...p, bp: clamp(p.bp + k.bat, 1, 99), bs: clamp(p.bs + k.bat, 1, 99), spd: clamp(p.spd + k.bowl, 1, 99), bsk: clamp(p.bsk + k.bowl, 1, 99) };
  if (p.potential > 0) {
    let P = clamp(p.potential + k.pot, 20, ABILITY.limit);
    const floor = q.bp + q.bs + q.spd + q.bsk + room;
    while (P < 200 && capSum(P) < floor) P++;
    q.potential = P;
  }
  return q;
}

/**
 * NUMBERS default (04:05): at least SKEW.minBowlers of the six bowl SKEW.bowlFloor+ (bowlPart). Otherwise the best of the rest
 * gets SPD and BSK raised to the floor (both, so bowlPart >= floor for any type). Returns a new squad array.
 * @param {any[]} squad @param {string[]} six @param {number} [room]
 */
export function bowlFloor(squad, six, room = 0) {
  const out = squad.map((p) => ({ ...p })), F = SKEW.bowlFloor;
  const starters = () => out.filter((p) => six.includes(p.id));
  while (starters().filter((p) => bowlPart(p) >= F).length < SKEW.minBowlers) {
    const rest = starters().filter((p) => bowlPart(p) < F).sort((a, b) => bowlPart(b) - bowlPart(a) || (a.id < b.id ? -1 : 1));
    if (!rest.length) break;
    const p = rest[0]; p.spd = Math.max(p.spd, F); p.bsk = Math.max(p.bsk, F);
    while (p.potential > 0 && p.potential < 200 && capSum(p.potential) < p.bp + p.bs + p.spd + p.bsk + room) p.potential++;
  }
  return out;
}
