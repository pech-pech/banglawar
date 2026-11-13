// @ts-check
// Letter grades F- to S+ (21 steps) over the raw 1..99 rating / shown 20..200 ability. SPEC s4 option A (potential-anchored).
// Engine keeps numbers; the screen shows letters and a 4-tick fill bar. Pure: no Math.random, no clock, no DOM.
import { TRAIN2 } from '../data/training.js';

/** @type {{step:number, letter:string, aFrom:number, rawFrom:number}[]} */
export const STEPS = TRAIN2.letters.map(([letter, aFrom, rawFrom], i) => ({ step: i + 1, letter, aFrom, rawFrom }));
export const TICKS = TRAIN2.ticksPerStep;
const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));

/** Step 1..21 of a raw rating. @param {number} r */
export function stepOfRaw(r) { let st = 1; for (const s of STEPS) if (r >= s.rawFrom) st = s.step; return st; }
/** @param {number} r */
export const letterOfRaw = (r) => STEPS[stepOfRaw(r) - 1].letter;
/** Letter of a shown ability / potential on 20..200. @param {number} a */
export function letterOfShown(a) { let st = 1; for (const s of STEPS) if (a >= s.aFrom) st = s.step; return STEPS[st - 1].letter; }
/** @param {number} step */
export const letterOfStep = (step) => STEPS[clamp(Math.round(step), 1, 21) - 1].letter;
/** Position inside the current step, 0..1 (top step spans 89..99). @param {number} r */
export function fillOfRaw(r) {
  const i = stepOfRaw(r) - 1, lo = STEPS[i].rawFrom, hi = i < 20 ? STEPS[i + 1].rawFrom : 100;
  return clamp((r - lo) / (hi - lo), 0, 1);
}
/** Lit ticks 0..3 of the 4 per step. @param {number} r */
export const ticksOfRaw = (r) => Math.min(TICKS - 1, Math.floor(fillOfRaw(r) * TICKS));
