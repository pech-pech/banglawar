// @ts-check
// AI club generator (League 1, squads of 10) and the AI six pick. Pure and seeded: all randomness comes from the passed rng.
import { rollPotential, capSum, batPart, bowlPart } from './ability.js';
import { CLUB_NAMES, SURNAMES, ME_CLUB } from '../data/names.js';

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));
const ROLE_RANK = { Opener: 0, Middle: 1, Lower: 2 };
const sum4 = (/** @type {any} */ p) => p.bp + p.bs + p.spd + p.bsk;
/** Overall for the pick: plain mean of the batting and bowling parts, never clamped. */
const overall = (/** @type {any} */ p) => 0.5 * batPart(p) + 0.5 * bowlPart(p);

/** @param {Record<string, number>} counts @returns {string[]} */
function expand(counts) { return Object.entries(counts).flatMap(([k, n]) => Array(n).fill(k)); }

/**
 * Best six by overall; batting order Opener, Middle, Lower, then bat ability (high first), then id.
 * @param {{squad:any[]}} club @returns {string[]} player ids in batting order
 */
export function aiPickSix(club) {
  const best = club.squad.slice().sort((a, b) => overall(b) - overall(a) || (a.id < b.id ? -1 : 1)).slice(0, 6);
  best.sort((a, b) => ROLE_RANK[a.bat] - ROLE_RANK[b.bat] || batPart(b) - batPart(a) || (a.id < b.id ? -1 : 1));
  return best.map((p) => p.id);
}

/**
 * 10 clubs: c0 is M's club (offset 0), c1..c9 are the AI clubs with shuffled strength offsets.
 * @param {{random:()=>number, int:(n:number)=>number, shuffle:(a:any[])=>any[], normalish:(m:number,sd:number)=>number}} rng
 * @param {any} D the SEASON data (js/data/season.js)
 */
export function makeClubs(rng, D) {
  const surnames = rng.shuffle(SURNAMES.slice());
  const clubNames = rng.shuffle(CLUB_NAMES.slice());
  const offsets = rng.shuffle(D.clubOffsets.slice());
  let nextName = 0;
  return Array.from({ length: D.teams }, (_, ci) => {
    const id = `c${ci}`;
    const mine = ci === 0;
    const mean = D.league.ratingMean + (mine ? 0 : offsets[ci - 1]);
    const bats = rng.shuffle(expand(D.roles));
    const bowls = rng.shuffle(expand(D.types));
    const rate = () => Math.round(clamp(rng.normalish(mean, D.league.ratingSd), 1, 99));
    const squad = Array.from({ length: D.squadSize }, (_x, i) => {
      const p = { id: `${id}p${i}`, name: surnames[nextName++], bat: bats[i], bowl: bowls[i], bp: rate(), bs: rate(), spd: rate(), bsk: rate(), potential: 0, drillsHere: 0, nodes: { bat: 0, bowl: 0 } };
      p.potential = rollPotential(rng, { bonus: mine ? D.startBonus : 0, minCapSum: sum4(p) + D.capRoom });
      return p;
    });
    const club = { id, name: mine ? ME_CLUB : clubNames[ci - 1], mean, squad, six: /** @type {string[]} */ ([]) };
    club.six = aiPickSix(club);
    if (mine) {
      // 8 of M's 10 show a grade; the weakest bench players do not yet (CONTRACT m0 open point 3).
      const bench = squad.filter((p) => !club.six.includes(p.id)).sort((a, b) => overall(a) - overall(b) || (a.id < b.id ? -1 : 1));
      for (const p of squad) p.drillsHere = D.myDrills.full;
      for (const p of bench.slice(0, D.myDrills.benchCount)) p.drillsHere = D.myDrills.bench;
    }
    return club;
  });
}

/**
 * Season rollover for AI clubs: every rating +delta (cap 99); potential is raised only if the cap-sum floor needs it.
 * c0 (M) is copied unchanged. Returns new clubs; input untouched.
 * @param {any[]} clubs @param {number} delta @param {number} [room]
 */
export function growClubs(clubs, delta, room = 12) {
  return clubs.map((c) => {
    const n = structuredClone(c);
    if (c.id === 'c0') return n;
    n.mean = c.mean + delta;
    for (const p of n.squad) {
      for (const k of ['bp', 'bs', 'spd', 'bsk']) p[k] = Math.min(99, p[k] + delta);
      while (p.potential < 200 && capSum(p.potential) < sum4(p) + room) p.potential++;
    }
    n.six = aiPickSix(n);
    return n;
  });
}
