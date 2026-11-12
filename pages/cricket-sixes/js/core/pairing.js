// @ts-check
// P4 hidden pairing layer: the 27-cell lookup (batter role on strike x bowler type x phase) and the Pairing Book.
// Pure: no rng, no clock, no DOM. Source: sheet parts/11-pairing.md. The points are never shown, only the grade word.
import { PAIRING } from '../data/pairing.js';

export const BATS = ['Opener', 'Middle', 'Lower'];
export const BOWLS = ['Fast', 'Medium', 'Spin'];
export const CELLS = PAIRING.cells.length; // 27
export const COMBOS = PAIRING.combos.length; // 8
export const SEEN_BALLS = PAIRING.SEEN_BALLS;
const BAT_I = { Opener: 0, Middle: 1, Lower: 2 }, BOWL_I = { Fast: 0, Medium: 1, Spin: 2 };

/** Cell number 0-26 for a pairing. @param {string} bat @param {string} bowl @param {number} ph 0-2 */
export const cellIndex = (bat, bowl, ph) => BAT_I[/** @type {'Opener'} */ (bat)] * 9 + BOWL_I[/** @type {'Fast'} */ (bowl)] * 3 + ph;

/** Rating points for the ball (grade + combo). + helps the batter. 0 for an unknown role or type. @param {string} bat @param {string} bowl @param {number} ph */
export function pairPoints(bat, bowl, ph) {
  if (!(bat in BAT_I) || !(bowl in BOWL_I)) return 0;
  const c = PAIRING.cells[cellIndex(bat, bowl, ph)];
  return c[3] + c[4];
}

/** Grade word of a cell, batter's view (Hostile, Tough, Awkward, Easy, Good, Perfect). The combo bonus is not part of the word. @param {number} i */
export const gradeWord = (i) => PAIRING.gradeWords[String(PAIRING.cells[i][3])];
/** Rank 1 (Hostile) to 6 (Perfect), for the chip's look. @param {number} i */
export const gradeRank = (i) => Object.keys(PAIRING.gradeWords).map(Number).sort((a, b) => a - b).indexOf(PAIRING.cells[i][3]) + 1;
/** Combo of a cell: { name, helps:'batter'|'bowler' } or null. @param {number} i */
export function comboOf(i) {
  const n = PAIRING.cells[i][5];
  if (!n) return null;
  const c = PAIRING.combos.find((x) => x[0] === n);
  return { name: n, helps: c ? c[5] : (PAIRING.cells[i][4] > 0 ? 'batter' : 'bowler') };
}
/** Cell descriptor. @param {number} i */
export const cellOf = (i) => ({ i, bat: PAIRING.cells[i][0], bowl: PAIRING.cells[i][1], ph: PAIRING.cells[i][2] });

/** Empty Book: balls faced and found flag per cell. */
export const newBook = () => ({ balls: Array(CELLS).fill(0), found: Array(CELLS).fill(0) });

/** True when `b` has the Book shape. @param {any} b */
export const isBook = (b) => !!b && Array.isArray(b.balls) && b.balls.length === CELLS && Array.isArray(b.found) && b.found.length === CELLS;

/**
 * Count one over's balls into the Book (either innings) and find the cells that reached SEEN_BALLS. Checked at the end of the over.
 * @param {{balls:number[], found:number[]}} book
 * @param {{batter:number, bowler:number, ph:number}[]} balls over balls (batter and bowler are team indexes)
 * @param {{bat:string}[]} bats batting team @param {{bowl:string}[]} bowls bowling team
 * @returns {{book:{balls:number[], found:number[]}, newly:number[]}} a new Book (the input is not changed)
 */
export function recordOver(book, balls, bats, bowls) {
  const b = { balls: book.balls.slice(), found: book.found.slice() };
  const touched = new Set();
  for (const r of balls) {
    const bat = bats[r.batter], bowl = bowls[r.bowler];
    if (!bat || !bowl) continue;
    const i = cellIndex(bat.bat, bowl.bowl, r.ph);
    b.balls[i] += 1; touched.add(i);
  }
  const newly = [...touched].sort((x, y) => x - y).filter((i) => !b.found[i] && b.balls[i] >= SEEN_BALLS);
  for (const i of newly) b.found[i] = 1;
  return { book: b, newly };
}

/** Coach's notebook: from season 2 the unfound cell with the most balls so far is found free (ties: lowest cell number). cell null when there is nothing to find. */
export function seasonTip(book, seasonN) {
  if (!PAIRING.SEASON_TIP || seasonN < 2) return { book, cell: null };
  let best = -1;
  for (let i = 0; i < CELLS; i++) if (!book.found[i] && (best < 0 || book.balls[i] > book.balls[best])) best = i;
  if (best < 0) return { book, cell: null };
  const b = { balls: book.balls.slice(), found: book.found.slice() };
  b.found[best] = 1;
  return { book: b, cell: best };
}

/** Plain name: "Opener v Spin, early". @param {number} i */
export function cellName(i) {
  const c = cellOf(i);
  return `${c.bat} v ${c.bowl}, ${['early', 'middle', 'late'][c.ph]}`;
}
