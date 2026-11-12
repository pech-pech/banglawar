// @ts-check
// Display-only ability, grade, previews, cap, potential roll. Pure: no Math.random, no DOM, no clock.
import { ABILITY } from '../data/ability.js';

/** @typedef {{bat:'Opener'|'Middle'|'Lower', bowl:'Fast'|'Medium'|'Spin', bp:number, bs:number, spd:number, bsk:number, potential:number, drillsHere:number}} AbilityPlayer */

const W = ABILITY.weights;
const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));

/** Rating (1..99) to the 20..200 scale. @param {number} w */
export function shown(w) { return Math.round(20 + 180 * (w - 1) / 98); }

/** Weighted batting rating (1..99). @param {AbilityPlayer} p */
export function batPart(p) { const w = W.batting[p.bat]; return w.BP * p.bp + w.BS * p.bs; }
/** Weighted bowling rating (1..99). @param {AbilityPlayer} p */
export function bowlPart(p) { const w = W.bowling[p.bowl]; return w.SPD * p.spd + w.BSK * p.bsk; }

/** Overall shown ability 20..200, clamped at potential. @param {AbilityPlayer} p */
export function shownAbility(p) {
  const w = 0.5 * batPart(p) + 0.5 * bowlPart(p);
  return Math.min(shown(w), p.potential);
}
/** Batting-only shown ability, clamped at potential. @param {AbilityPlayer} p */
export function shownBat(p) { return Math.min(shown(batPart(p)), p.potential); }
/** Bowling-only shown ability, clamped at potential. @param {AbilityPlayer} p */
export function shownBowl(p) { return Math.min(shown(bowlPart(p)), p.potential); }

/** True grade of a potential number. @param {number} P @returns {'D'|'C'|'B'|'A'|'S'} */
export function bandOf(P) {
  let g = 'D';
  for (const b of ABILITY.bands) if (P >= b.from) g = b.grade;
  return /** @type {'D'|'C'|'B'|'A'|'S'} */ (g);
}

/** Grade letter, or null while hidden (fewer than 5 drills here). @param {{potential:number, drillsHere:number}} p */
export function gradeOf(p) { return p.drillsHere < 5 ? null : bandOf(p.potential); }

/** How many matchup chips to show before a Call. @param {{potential:number, drillsHere:number}} p */
export function previewCount(p) {
  const g = gradeOf(p);
  return g === null ? ABILITY.previews.hidden : ABILITY.previews[g];
}

/** Sum cap of the four ratings for potential P. @param {number} P */
export function capSum(P) { return Math.round(4 * (1 + (P - 20) * 98 / 180)); }

/**
 * Roll a potential: normalish(centre, spread), redraw while above limit, clamp 20..200, round.
 * @param {{normalish:(m:number,sd:number)=>number}} rng
 * @param {{league?:number, academy?:number, bonus?:number}} [o]
 */
export function rollPotential(rng, o = {}) {
  const { league = 1, academy = 1, bonus = 0 } = o;
  const c = ABILITY.centre;
  const centre = c.c0 + c.dl * (league - 1) + c.da * (academy - 1) + bonus;
  let v = rng.normalish(centre, ABILITY.spread);
  for (let i = 0; i < 100 && v > ABILITY.limit; i++) v = rng.normalish(centre, ABILITY.spread);
  return Math.round(clamp(v, 20, Math.min(200, ABILITY.limit)));
}
