// @ts-check
// Golden Over (Captain's Over): pure rules. No DOM, no Math.random, no clock. CONTRACT-GO s2/s3.
import { GOLDEN } from '../data/golden-over.js';
import { stepOfRaw } from './letters.js';
import { outcomeFromX, playOver } from './match.js';
import { matchOpts, boostedRival, rivalBoostOf } from './wheelmatch.js';
import { makeRng } from './rng.js';

/** Window (Perfect, Good) in whole ms for a raw rating. wset = name ('Mid') or [p, g]. @param {number} raw @param {string|number[]} [wset] */
export function windowFor(raw, wset) {
  const w = Array.isArray(wset) ? wset : /** @type {any} */ (GOLDEN.WINDOWS)[wset || GOLDEN.WINDOW] || GOLDEN.WINDOWS[GOLDEN.WINDOW];
  const mult = GOLDEN.MULT_LO + (stepOfRaw(raw) - 1) / (GOLDEN.STEPS - 1) * (GOLDEN.MULT_HI - GOLDEN.MULT_LO);
  return { p: Math.round(w[0] * mult), g: Math.round(w[1] * mult) };
}
/** @param {number|null|undefined} errMs @param {{p:number,g:number}} win @returns {'P'|'G'|'M'} null / no tap = M */
export function gradeOf(errMs, win) {
  if (errMs == null || !Number.isFinite(errMs)) return 'M';
  const a = Math.abs(errMs);
  return a <= win.p ? 'P' : a <= win.g ? 'G' : 'M';
}
/** Value of an outcome for M: batting W bad; bowling W good. */
const val = (/** @type {any} */ o, /** @type {string} */ side) => (side === 'bat' ? (o === 'W' ? -GOLDEN.WK_VAL : o) : (o === 'W' ? GOLDEN.WK_VAL : -o));
/** An x that outcomeFromX maps to `target` (1 or 2), or null. */
function xFor(pr, target) {
  const p = pr.p;
  if (target === 1) { const x = p.wicket + p.six + p.four + p.two + pr.singleRaw / 2; return pr.singleRaw > 0 && outcomeFromX(p, pr.singleRaw, x) === 1 ? x : null; }
  const x = p.wicket + p.six + p.four + p.two / 2; return p.two > 0 && outcomeFromX(p, pr.singleRaw, x) === 2 ? x : null;
}
/** Picker factory: (pr, rng) => x. Always draws exactly ROLLS values. side 'bat' | 'bowl' (ours). @param {'P'|'G'|'M'} grade @param {'bat'|'bowl'} side */
export function pickX(grade, side) {
  return (/** @type {any} */ pr, /** @type {any} */ rng) => {
    const xs = []; for (let i = 0; i < GOLDEN.ROLLS; i++) xs.push(rng.random());
    const oc = (/** @type {number} */ x) => outcomeFromX(pr.p, pr.singleRaw, x);
    if (grade === 'G') return xs[0];
    if (grade === 'M') return val(oc(xs[1]), side) < val(oc(xs[0]), side) ? xs[1] : xs[0];
    let bi = 0; for (let i = 1; i < xs.length; i++) if (val(oc(xs[i]), side) > val(oc(xs[bi]), side)) bi = i;
    const o = oc(xs[bi]);
    if (side === 'bat' && (o === 'W' || o === 0)) return xFor(pr, GOLDEN.FLOOR_BAT) ?? xs[bi];
    if (side === 'bowl' && (o === 4 || o === 6)) return xFor(pr, GOLDEN.FLOOR_BOWL) ?? xs[bi];
    return xs[bi];
  };
}
/** The seed of a golden over's rng. */
export const goldSeed = (/** @type {any} */ s, /** @type {number} */ over) => `${s.seed}|gold|${s.stage}|${over}`;

/**
 * Play the golden over on `n` (mutates it, pass a clone for a preview) with the same fx / centre / pairing / roar / rival boost as replayOver.
 * Ball i uses grades[i]; unknown = 'G'. Neutral calls: field P, intent R. @param {any} n @param {'bowl'|'bat'} side @param {number} bowlerIdx @param {string[]} grades
 */
export function goldenReplay(n, side, bowlerIdx, grades) {
  const o = matchOpts(n, side), b = rivalBoostOf(n);
  const bowlSide = side === 'bowl';
  const inn = bowlSide ? n.inn1 : n.inn2, bat0 = bowlSide ? n.rival.players : n.me.players, bowl0 = bowlSide ? n.me.players : n.rival.players;
  const batB = bowlSide ? b : 0, bowlB = bowlSide ? 0 : b;
  let i = 0;
  const hook = (/** @type {any} */ pr, /** @type {any} */ rng) => pickX(/** @type {any} */ (grades[i++] || 'G'), side)(pr, rng);
  const opts = { ...(o.roar || {}), pickX: hook };
  const rng = makeRng(goldSeed(n, inn.over));
  if (!batB && !bowlB) return playOver(rng, inn, bat0, bowl0, bowlerIdx, 'R', 'P', o.fx, o.centre, o.pairing, opts);
  const orig = new WeakMap();
  const cp = (/** @type {any[]} */ team, /** @type {number} */ k) => team.map((p) => { const c = boostedRival(p, k); if (c !== p) orig.set(c, p); return c; });
  const bat2 = cp(bat0, batB), bowl2 = cp(bowl0, bowlB);
  const fx = o.fx ? { of: (/** @type {any} */ q) => o.fx.of(orig.get(q) || q) } : undefined;
  const balls = playOver(rng, inn, bat2, bowl2, bowlerIdx, 'R', 'P', fx, o.centre, o.pairing, opts);
  bowl2.forEach((c, k) => { if (c !== bowl0[k]) bowl0[k].overs = c.overs; });
  return balls;
}
/** Preview: clone of s, unknown grades 'G', returns the first grades.length balls (all balls if the innings ends sooner). @param {any} s @param {string[]} grades @param {{side?:'bowl'|'bat', bowler:number}} ctx */
export function previewBalls(s, grades, ctx) {
  const side = (ctx && ctx.side) || (s.stage === 'bowl' ? 'bowl' : 'bat');
  const n = structuredClone(s);
  return goldenReplay(n, side, ctx.bowler, grades).slice(0, grades.length);
}
