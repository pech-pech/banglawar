// @ts-check
// Match day: hype, toss, pep talk, crowd roar, rating scaling. Pure. Rolls use their OWN stream (never the ball RNG).
import { MD } from '../data/matchday.js';
import { makeRng } from './rng.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const tiltOf = (e) => (typeof e === 'number' ? e : e && typeof e.tilt === 'number' ? e.tilt : 0);

/** Crowd roar chance per over: 5% + 25% x min(1, Fans/4000), cap 30%. */
export function roarChance(fans) {
  return Math.min(MD.ROAR_CAP, MD.ROAR_BASE + MD.ROAR_FANS_ADD * Math.min(1, Math.max(0, +fans || 0) / MD.ROAR_FANS_REF));
}

/** Hype odds in percent [low, med, high, nuts], sum 100, never negative. actLedger: tilts newest first (numbers or {tilt}); last 3 used. */
export function hypeOdds(fans, actLedger) {
  const f = MD.HYPE_FANS_TILT * Math.min(1, Math.max(0, +fans || 0) / MD.HYPE_FANS_REF);
  const led = Array.isArray(actLedger) ? actLedger : [];
  let a = 0;
  for (let i = 0; i < MD.HYPE_ACT_DECAY.length; i++) a += tiltOf(led[i]) * MD.HYPE_ACT_DECAY[i];
  a = clamp(a, 0, MD.HYPE_ACT_CAP);
  const t = Math.min(MD.HYPE_TILT_CAP, f + a);
  let odds = MD.HYPE_ODDS.map((o, i) => Math.max(0, o + MD.HYPE_ODDS_SLOPE[i] * t));
  const sum = odds.reduce((x, y) => x + y, 0);
  odds = odds.map((o) => (o * 100) / sum);
  return { odds, t, f, a };
}

/** Pep slot 1..6 -> player id (or null when the six are not known yet). */
export const resolvePep = (md, sixIds) => (md && sixIds && sixIds[md.pepSlot - 1] != null ? sixIds[md.pepSlot - 1] : null);

/**
 * Roll the match day once, up front. Draw order is fixed: hype, toss, pep slot, then ROAR_OVERS roar draws.
 * @param {string|number} seed match seed @param {{fans?:number, actLedger?:any[], sixIds?:any[]}} [ctx]
 */
export function rollMatchday(seed, ctx = {}) {
  const rng = makeRng(`${seed}|matchday`);
  const { odds, t } = hypeOdds(ctx.fans, ctx.actLedger);
  const x = rng.random() * 100;
  let hypeIdx = 0, acc = 0;
  for (let i = 0; i < 4; i++) { acc += odds[i]; if (x < acc) { hypeIdx = i; break; } hypeIdx = 3; }
  const toss = rng.random() < 0.5 ? 'won' : 'lost';
  const pepSlot = 1 + rng.int(6);
  const rc = roarChance(ctx.fans);
  const roar = Array.from({ length: MD.ROAR_OVERS }, () => rng.random() < rc);
  const md = { hype: MD.HYPE_LEVELS[hypeIdx], hypeIdx, toss, pepSlot, pepId: null, roar, odds, t, roarChance: rc, hypeFanMult: MD.HYPE_FAN_MULT[hypeIdx] };
  md.pepId = resolvePep(md, ctx.sixIds);
  return md;
}

/** Boost fraction for one of our six from hype, toss and pep (multiplicative). 0.213 = +21.3%. Roar is separate (roarAt). */
export function teamBoost(md, playerId) {
  if (!md) return 0;
  let f = 1 + (MD.HYPE_PERF[md.hype] || 0);
  if (md.toss === 'won') f *= 1 + MD.TOSS_BOOST;
  if (md.pepId != null && playerId === md.pepId) f *= 1 + MD.PEP_BOOST;
  return f - 1;
}

/** Is over overIdx (0..19: innings index x 10 + over - 1) a crowd roar over? */
export const roarAt = (md, overIdx) => !!(md && md.roar && md.roar[overIdx]);

/** Copy of p with bp, bs, spd, bsk x(1+x), capped at RMAX. Never writes back. Missing fields stay missing. */
export function scaleRatings(p, x) {
  const q = { ...p };
  for (const k of ['bp', 'bs', 'spd', 'bsk']) if (typeof p[k] === 'number') q[k] = Math.min(MD.RMAX, p[k] * (1 + x));
  return q;
}
