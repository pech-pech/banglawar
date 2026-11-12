// @ts-check
// Port of 2026-11-12/sim/match_sim.py AI policies (pick_bowler, intent, field) + rival_sim call share. Pure, seeded.
// Contract note: `batters` = the two on-crease batter objects in crease order (batters[inn.strike] is the striker); `inn` = newInnings() state.
import { T, MATCH, BOWL_HOME } from '../data/match.js';
import { phaseOf, eligibleBowlers } from './match.js';

/**
 * Pick the bowler index. Smart: max of spd+bsk, +2*PHASE_BONUS if home phase, minus MATCHUP*step per batter on crease (first max wins, as Python max()).
 * Careless: rng.pick of eligible (one draw).
 * @param {any[]} team bowling side players
 * @param {any} inn innings state (uses over, last)
 * @param {any[]} batters batters on the crease
 * @param {{pick:(a:any[])=>any}} rng
 * @param {boolean} smart
 * @returns {number}
 */
export function pickBowler(team, inn, batters, rng, smart) {
  const el = eligibleBowlers(team, inn.over, inn.last);
  if (!smart) return rng.pick(el);
  const ph = phaseOf(inn.over);
  let best = el[0], bestScore = -Infinity;
  for (const i of el) {
    const p = team[i];
    let s = p.spd + p.bsk;
    if (BOWL_HOME[p.bowl] === ph) s += 2 * T.PHASE_BONUS;
    for (const b of batters) s += -T.MATCHUP * MATCH[`${b.bat}|${p.bowl}`];
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

/**
 * Batting intent 'D'|'R'|'A'. Smart uses chase maths (inn.target set) or the batting-first rule; careless = rng.pick('DRA') (one draw).
 * @param {any} inn innings state (uses over, wk, runs, balls, target)
 * @param {boolean} chasing
 * @param {{pick:(a:any[])=>any}} rng
 * @param {boolean} smart
 * @returns {'D'|'R'|'A'}
 */
export function pickIntent(inn, chasing, rng, smart) {
  if (!smart) return rng.pick(['D', 'R', 'A']);
  const { wk, over } = inn;
  if (chasing && inn.target != null) {
    const rr = (inn.target + 1 - inn.runs) / Math.max(60 - inn.balls, 1);
    return rr > 1.65 || (wk <= 2 && over >= 8) ? 'A' : (wk >= 4 && rr < 1.2 ? 'D' : 'R');
  }
  return (over >= 8 && wk <= 3) || over >= 9 ? 'A' : (wk >= 4 ? 'D' : 'R');
}

/**
 * Fielding call 'A'|'P'|'N'. Smart: 'A' if striker bp+bs<95 else 'P'; 'N' once the chase target is passed. Careless = rng.pick('APN') (one draw).
 * @param {any} inn innings state (uses strike, runs, target)
 * @param {any[]} batters batters on the crease (batters[inn.strike] is striker)
 * @param {{pick:(a:any[])=>any}} rng
 * @param {boolean} smart
 * @returns {'A'|'P'|'N'}
 */
export function pickField(inn, batters, rng, smart) {
  if (!smart) return rng.pick(['A', 'P', 'N']);
  const s = batters[inn.strike];
  let field = s.bp + s.bs < 95 ? 'A' : 'P';
  if (inn.target != null && inn.runs > inn.target) field = 'N';
  return field;
}

/**
 * Rival's Call is good with probability `share` (rival_sim _flag: rng.random() < s). One draw.
 * @param {{random:()=>number}} rng
 * @param {number} [share]
 * @returns {boolean}
 */
export function rivalCall(rng, share = 0.7) { return rng.random() < share; }
