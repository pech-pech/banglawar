// @ts-check
// Keyed wheel wobble (CONTRACT-A sec 3). Pure; own RNG stream, never the ball rng.
import { makeRng } from './rng.js';
import { seasonOf, weekOf } from './spin-keys.js';

/** No seed on the save: a stable fallback 0, never the text 'undefined'. @param {any} s @param {string} wheelId @param {number} spinIndex @param {number} respin */
export function wobbleKey(s, wheelId, spinIndex, respin) {
  const seed = s && s.seed != null ? s.seed : 0;
  return `${seed}|wob|${seasonOf(s)}|${weekOf(s)}|${wheelId}|${spinIndex}|${respin}`;
}

/** @param {string} key @param {number} J @returns {number} in [-J, +J] */
export function wheelWobble(key, J) {
  return (makeRng(key).random() * 2 - 1) * J;
}
