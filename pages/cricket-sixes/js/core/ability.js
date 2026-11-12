// @ts-check
// Display-only ability, grade, previews, cap, potential roll. Pure: no Math.random, no DOM, no clock.
import { ABILITY } from '../data/ability.js';
import { DRILLS } from '../data/training.js';

/** @typedef {{bat:'Opener'|'Middle'|'Lower', bowl:'Fast'|'Medium'|'Spin', bp:number, bs:number, spd:number, bsk:number, potential:number, drillsHere:number}} AbilityPlayer */

const W = ABILITY.weights;
const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));

/** Rating (1..99) to the 20..200 scale. @param {number} w */
export function shown(w) { return Math.round(20 + 180 * (w - 1) / 98); }

/** Weighted batting rating (1..99). @param {AbilityPlayer} p */
export function batPart(p) { const w = W.batting[p.bat]; return w.BP * p.bp + w.BS * p.bs; }
/** Weighted bowling rating (1..99). @param {AbilityPlayer} p */
export function bowlPart(p) { const w = W.bowling[p.bowl]; return w.SPD * p.spd + w.BSK * p.bsk; }

/** True while the grade is hidden (fewer than 5 drills at this club). @param {{drillsHere:number}} p */
export function isHidden(p) { return p.drillsHere < DRILLS.revealAfter; }
/** Clamp at potential only once the grade is revealed (LOOK 1A: unclamped and no max while hidden). */
const limit = (/** @type {number} */ v, /** @type {{potential:number, drillsHere:number}} */ p) => (isHidden(p) ? v : Math.min(v, p.potential));

/** Unclamped overall ability 20..200 (never shown as is while revealed). @param {AbilityPlayer} p */
export function rawAbility(p) { return shown(0.5 * batPart(p) + 0.5 * bowlPart(p)); }
/** Overall shown ability 20..200. Clamped at potential from the 5th drill; NOT clamped while hidden. @param {AbilityPlayer} p */
export function shownAbility(p) { return limit(rawAbility(p), p); }
/** Batting-only shown ability (same clamp rule). @param {AbilityPlayer} p */
export function shownBat(p) { return limit(shown(batPart(p)), p); }
/** Bowling-only shown ability (same clamp rule). @param {AbilityPlayer} p */
export function shownBowl(p) { return limit(shown(bowlPart(p)), p); }
/** 2A: the four ratings add up to the cap sum. @param {AbilityPlayer} p */
export function atPeak(p) { return p.bp + p.bs + p.spd + p.bsk >= capSum(p.potential); }
/** 3A: revealed only, shown ability has reached potential ("max"). @param {AbilityPlayer} p */
export function isMax(p) { return !isHidden(p) && rawAbility(p) >= p.potential; }

/** True grade of a potential number. @param {number} P @returns {'D'|'C'|'B'|'A'|'S'} */
export function bandOf(P) {
  let g = 'D';
  for (const b of ABILITY.bands) if (P >= b.from) g = b.grade;
  return /** @type {'D'|'C'|'B'|'A'|'S'} */ (g);
}

/** Grade letter, or null while hidden (fewer than 5 drills here). @param {{potential:number, drillsHere:number}} p */
export function gradeOf(p) { return isHidden(p) ? null : bandOf(p.potential); }

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
 * Optional minCapSum: CONTRACT s11 floor (cap sum >= current rating sum + 12). P is raised to the
 * smallest value whose capSum reaches it; the floor alone may lift P above the limit (up to 200).
 * @param {{league?:number, academy?:number, bonus?:number, minCapSum?:number}} [o]
 */
export function rollPotential(rng, o = {}) {
  const { league = 1, academy = 1, bonus = 0, minCapSum = 0 } = o;
  const c = ABILITY.centre;
  const centre = c.c0 + c.dl * (league - 1) + c.da * (academy - 1) + bonus;
  let v = rng.normalish(centre, ABILITY.spread);
  for (let i = 0; i < 100 && v > ABILITY.limit; i++) v = rng.normalish(centre, ABILITY.spread);
  let P = Math.round(clamp(v, 20, Math.min(200, ABILITY.limit)));
  if (minCapSum > 0 && capSum(P) < minCapSum) {
    P = Math.min(200, Math.ceil(20 + (minCapSum / 4 - 1) * 180 / 98));
    while (P < 200 && capSum(P) < minCapSum) P++;
  }
  return P;
}
