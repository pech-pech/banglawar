// @ts-check
// s1 season-end recruits (2026-11-14-squad-skew/SPEC.md; admin reading of M's "the first recruit at the end of the season fills the quota").
// On the season-end screen of an s1 game: three candidates (one Opener, one Middle, one Lower), skewed, from their own rng stream.
// Sign one (free, wage applies) or pass; one per season. A full squad names who leaves (free, no refund).
import { SKEW } from '../data/run.js';
import { SEASON } from '../data/season.js';
import { leagueOf } from '../data/leagues.js';
import { SURNAMES } from '../data/names.js';
import { makeRng } from './rng.js';
import { rollPotential } from './ability.js';
import { aiPickSix } from './clubs.js';
import { skewOn, skewPlayer, squadMax } from './skew.js';

const clone = (/** @type {any} */ o) => JSON.parse(JSON.stringify(o));
const E_SD = 8; // same spread as the trial find
const seasonN = (/** @type {any} */ s) => (s.season && s.season.n) || 1;
const leagueN = (/** @type {any} */ s) => Math.min(5, Math.max(1, Math.round((s.season && s.season.league) || 1)));
/** This season's record, or null. @param {any} s */
export const recruitRec = (s) => (s.recruit && s.recruit.n === seasonN(s) ? s.recruit : null);
/** Recruits are open on the season-end screen of an s1 game, until one is signed or passed. @param {any} s */
export const recruitOpen = (s) => skewOn(s) && s.stage === 'end' && !!s.season && !recruitRec(s);

/** The three candidates (deterministic from seed, season, league). Empty when closed. @param {any} s */
export function recruitList(s) {
  if (!skewOn(s) || !s.season) return [];
  const L = leagueN(s), n = seasonN(s), rng = makeRng(`${s.seed || 'sixes'}|recruit|${n}|${L}`);
  const mean = leagueOf(L).ratingMean + ((s.econ && s.econ.fac && s.econ.fac.scout) || 0);
  const have = new Set(((s.clubs && s.clubs[0] && s.clubs[0].squad) || []).map((/** @type {any} */ p) => p.name));
  const types = Object.entries(SEASON.types).flatMap(([k, c]) => Array(/** @type {number} */ (c)).fill(k));
  const rate = () => Math.round(Math.min(99, Math.max(1, rng.normalish(mean, E_SD))));
  return SKEW.recruits.map((role, i) => {
    const pool = SURNAMES.filter((x) => !have.has(x));
    const name = rng.pick(pool.length ? pool : SURNAMES); have.add(name);
    const p = { id: `r${n}-${i}`, name, bat: role, bowl: rng.pick(types), bp: rate(), bs: rate(), spd: rate(), bsk: rate(), potential: 0, drillsHere: 0, nodes: { bat: 0, bowl: 0 } };
    p.potential = rollPotential(rng, { league: L, academy: Math.max(1, (s.econ && s.econ.fac && s.econ.fac.academy) || 1), minCapSum: p.bp + p.bs + p.spd + p.bsk + SEASON.capRoom });
    return skewPlayer(p, SEASON.capRoom);
  });
}

/** Signing fee in Coins (SKEW.recruitFee by league; 0 until M's fee card). @param {any} s */
export const recruitFee = (s) => SKEW.recruitFee[leagueN(s) - 1] || 0;
/** Sign recruit `id`. Full squad: `leaveId` (in the squad) leaves, free. Same state when refused. @param {any} s @param {{id?:string, leaveId?:string}} p */
export function recruitSign(s, p) {
  if (!recruitOpen(s) || !p || !p.id) return s;
  const r = recruitList(s).find((x) => x.id === p.id); if (!r) return s;
  const c0 = s.clubs[0];
  if (c0.squad.some((/** @type {any} */ x) => x.id === r.id)) return s;
  const full = c0.squad.length >= squadMax(s);
  const fee = recruitFee(s);
  if (fee > 0 && !(s.econ && s.econ.coins >= fee)) return s;
  if (full && !(p.leaveId && c0.squad.some((/** @type {any} */ x) => x.id === p.leaveId))) return s;
  const n = clone(s), c = n.clubs[0];
  let left = null;
  if (full) { left = c.squad.find((/** @type {any} */ x) => x.id === p.leaveId); c.squad = c.squad.filter((/** @type {any} */ x) => x.id !== p.leaveId); }
  c.squad.push(r);
  if (fee > 0) n.econ.coins -= fee;
  c.six = aiPickSix(c);
  n.plan = { ...n.plan, edited: false, key: '' };
  n.recruit = { n: seasonN(s), signed: r.id, name: r.name, left: left ? left.name : null, passed: false };
  if (n.econ && Array.isArray(n.econ.ledger)) n.econ.ledger.push({ k: 'recruit', id: r.id, name: r.name, left: left ? left.name : null, signed: true });
  return n;
}
/** Pass on this season's recruits. @param {any} s */
export function recruitPass(s) {
  if (!recruitOpen(s)) return s;
  return { ...s, recruit: { n: seasonN(s), signed: null, name: null, left: null, passed: true } };
}
