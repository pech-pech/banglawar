// @ts-check
// The default bowling plan the game pre-fills (M's pick: "pre-fill, you can change it"). Pure and deterministic.
// Scores each (over, bowler) by the same matchup rule the skilled bot reads (skilled.js: grade g + 1 if in his home phase,
// tie-break on spd+bsk), against the batters likely at the crease in that phase, then picks the best legal plan:
// each of the six bowls 1-2 overs, never twice in a row. Exact search (DP), ties go to the lowest bowler number.
import { matchup, phaseOf } from './match.js';
import { cellIndex, pairPoints } from './pairing.js';

/** Pairing hint weight (sheet 11 port line 5: -2 * PAIR for found cells). One visible grid step (g = 1) is 5 rating points, so the term is -BOOK_W * points / 5 in g units. */
export const BOOK_W = 2;

const OVERS = 10;
const BATTERS_AT_CREASE = [2, 3, 4]; // top-of-order batters met in Early / Middle / Late (openers first, then the rest come in)

/** @param {any[]} six my six bowlers (in plan order) @param {any[]} batters their six batters in batting order @param {{found:number[]}} [book] Pairing Book: found cells add their hidden points to the score; unfound cells add nothing @returns {number[]} 10 bowler indexes */
export function defaultOvers(six, batters, book) {
  const n = six.length;
  const score = Array.from({ length: OVERS }, (_, o) => {
    const ph = phaseOf(o + 1);
    const seen = batters.slice(0, BATTERS_AT_CREASE[ph] || 2);
    return six.map((p) => {
      let g = 0;
      for (const b of seen) {
        const m = matchup('bowl', b, p, ph);
        g += m.g + (m.inPhase ? 1 : 0);
        if (book && book.found[cellIndex(b.bat, p.bowl, ph)]) g += (-BOOK_W * pairPoints(b.bat, p.bowl, ph)) / 5;
      }
      return Math.round((g / Math.max(seen.length, 1)) * 1000) + (p.spd + p.bsk) / 1000;
    });
  });
  // best[o][last][counts]: best total from over o on. counts = base-3 digits (0..2 overs each).
  const pow = Array.from({ length: n }, (_, i) => 3 ** i);
  const memo = new Map();
  const solve = (o, last, cnt) => {
    if (o === OVERS) return cnt.every((c) => c >= 1) ? { v: 0, pick: -1 } : null;
    const key = (o * 8 + last + 1) * 800 + cnt.reduce((a, c, i) => a + c * pow[i], 0);
    if (memo.has(key)) return memo.get(key);
    let best = null;
    for (let b = 0; b < n; b++) {
      if (b === last || cnt[b] >= 2) continue;
      cnt[b]++;
      const r = solve(o + 1, b, cnt);
      cnt[b]--;
      if (r && (best === null || r.v + score[o][b] > best.v + 1e-9)) best = { v: r.v + score[o][b], pick: b };
    }
    memo.set(key, best);
    return best;
  };
  const cnt = Array(n).fill(0), out = [];
  let last = -1;
  for (let o = 0; o < OVERS; o++) {
    const r = solve(o, last, cnt);
    if (!r) return [0, 1, 2, 3, 4, 5, 0, 1, 2, 3];
    out.push(r.pick); cnt[r.pick]++; last = r.pick;
  }
  return out;
}
