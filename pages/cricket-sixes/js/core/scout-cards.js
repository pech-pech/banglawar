// @ts-check
// Scout wheel candidate cards (wheels SPEC sec 9, 13). T4. Pure, deterministic.
// Same generator and seed key as scoutList() in training.js (`${seed}|scout|${n}|${L}`, per card: step draw,
// focus shuffle + count draw, surname pick), so reload gives the same cards. Grade = league centre + slice value.
import { makeRng } from './rng.js';
import { SURNAMES } from '../data/names.js';
import { letterOfStep } from './letters.js';
import { FOCUSES } from './training.js';
import { SCOUT_SLICES } from '../data/wheels/scout.js';

/** League centre grade steps, L1..L5 = E, D-, C+, B, A+ (SPEC sec 9). Step numbers per letters table. */
export const SCOUT_CENTRE_STEP = Object.freeze([5, 7, 12, 14, 18]);
export const SCOUT_CENTRE_LETTER = Object.freeze(['E', 'D-', 'C+', 'B', 'A+']);

/** @param {string|number} seed run seed @param {number} [season] season number (default 1) @param {number} [league] 1..5 (default 1)
 *  @returns {{grade:string, surname:string, focus:string}[]} one card per slice, index = slice id */
export function makeScoutCards(seed, season = 1, league = 1) {
  const L = Math.max(1, Math.min(5, league | 0 || 1)), n = season | 0 || 1;
  const rng = makeRng(`${seed || 'sixes'}|scout|${n}|${L}`), centre = SCOUT_CENTRE_STEP[L - 1];
  return SCOUT_SLICES.map((sl) => {
    rng.int(5); // keeps the draw order of scoutList() (step draw, unused: the slice sets the grade)
    const strong = rng.shuffle(FOCUSES.slice()).slice(0, 1 + rng.int(2));
    return { grade: letterOfStep(centre + sl.value), surname: rng.pick(SURNAMES), focus: strong[0] };
  });
}
