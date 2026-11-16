// @ts-check
// Reveal-only wheels (Toss, Pep, Scout, Finals): the per-kind DISPATCHER. S0 Z1 split of js/core/dialreel.js.
// FROZEN (S0): a change here = message the S0 / T1 lead. Kind behaviour lives in ./toss.js ./pep.js ./scout.js ./finals.js, each exporting
// REVEAL_KIND = { extraKey?, tweak?(sl, m), boost?(fx, v, d), post?(out, s, fx, m, d), plan?(plan, c, target, sec) }:
//   extraKey  the fx key Extra Gold copies are placed after (absent = no Extra Gold on this wheel, e.g. Toss)
//   tweak     slice tweaks after Extra Gold, before indexing (Kind Floor, Good Sport, Scout's Eye, Finals second gold)
//   boost     Booster pay on the boosted slice (fx is the result's own copy; v = bval; d = the 6 draws)
//   post      result post-step after `out` is built (Prize Pair, Pep slots / Pep Rally)
//   plan      revealPlan extra fields (default: turns)
// Draw order unchanged: revealResult always draws 6 numbers, same indices (0 pick, 1-2 booster, 3 pep booster, 4-5 pep slots / rally).
import { DR } from '../../data/dialreel.js';
import { neutralMods } from './common.js';
import { REVEAL_KIND as TOSS } from './toss.js';
import { REVEAL_KIND as PEP } from './pep.js';
import { REVEAL_KIND as SCOUT } from './scout.js';
import { REVEAL_KIND as FINALS } from './finals.js';

/** @type {Record<string, any>} */
const KINDS = { toss: TOSS, pep: PEP, scout: SCOUT, finals: FINALS };
/** @param {string} kind @returns {any} */
const kindOf = (kind) => KINDS[kind] || {};

/**
 * Reveal wheel for 'toss' | 'pep' | 'scout' | 'finals' with the tree applied (port of sim build()): gold/rare widths, Extra Gold (not Toss; Finals second gold pays 40 Coins),
 * Kind Floor (Toss low slice +1%), Good Sport (Toss consolation +2.5%), Scout's Eye (Extra name +1 step). Slice: {index,id,label,w,a,b,gold,rare,low,fx,slot?}.
 * @param {string} kind @param {any} [mods]
 */
export function revealWheel(kind, mods = neutralMods()) {
  const src = DR.WHEELS[kind]; if (!src) throw new Error('revealWheel: unknown kind ' + kind);
  const m = { ...neutralMods(), ...mods }, K = kindOf(kind);
  let sl = src.map((/** @type {any} */ s) => ({ ...s, fx: { ...s.fx }, gold: !!s.gold, rare: !!s.rare, low: !!s.low }));
  for (const s of sl) { if (s.gold) s.w += m.goldAdd; if (s.rare) s.w += m.rareAdd; }
  const g0 = sl.findIndex((/** @type {any} */ s) => s.gold);
  if (g0 >= 0 && K.extraKey) {
    const pk = K.extraKey;
    for (let e = 0; e < m.extra; e++) {
      /** @type {number[]} */ const cand = []; sl.forEach((/** @type {any} */ s, /** @type {number} */ i) => { if (!s.gold && i >= 3 && (s.fx[pk] || 0) >= 2) cand.push(i); });
      const pos = cand.length ? cand[e % cand.length] + 1 + e : Math.round(sl.length * (e + 1) / (m.extra + 1)) + e;
      const g = sl[g0], copy = { ...g, fx: { ...g.fx }, w: g.w * DR.EXTRA_W, rare: false, second: true };
      sl.splice(pos, 0, copy);
    }
  }
  if (K.tweak) K.tweak(sl, m);
  let x = 0;
  const slices = sl.map((/** @type {any} */ s, /** @type {number} */ i) => { const a = x; x += s.w; return { ...s, index: i, a, b: x }; });
  return { kind, wheel: kind, widget: DR.REVEAL[kind].widget, slices, total: x, mods: m, widths: slices.map((/** @type {any} */ s) => s.w) };
}

/**
 * Reveal result: the pre-drawn pick by width (an honest free spin), always 6 draws. Booster adds a unit to the boosted non-gold slice when it lands (Pep: 0.5 per value, as a
 * 50%-per-value extra player). Pep Rally: 50% the next slot is pepped too (expected x1.5). Prize Pair: Finals Coins/TP/Fans x1.5 (rounded), never Medals.
 * Returns {index, id, label, fx, boosted, slot, slots (pep), neighbour (pep)}.
 * @param {{random:()=>number}} rng @param {any} wheel from revealWheel
 */
export function revealResult(rng, wheel) {
  const d = Array.from({ length: 6 }, () => rng.random()), m = wheel.mods, K = kindOf(wheel.kind);
  let x = d[0] * wheel.total, i = 0;
  while (i < wheel.slices.length - 1 && x >= wheel.slices[i].b) i++;
  const s = wheel.slices[i], fx = { ...s.fx }; let boosted = false;
  if (m.bch && d[1] < m.bch) {
    const cand = wheel.slices.filter((/** @type {any} */ c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[2] * cand.length))];
    if (bi && bi.index === i) {
      boosted = true; const v = m.bval;
      if (K.boost) K.boost(fx, v, d);
    }
  }
  const out = { index: i, id: s.id, label: s.label, fx, boosted, slot: s.slot || null, slots: /** @type {number[]} */ ([]), neighbour: false };
  if (K.post) K.post(out, s, fx, m, d);
  return out;
}

/**
 * Pure timing for the UI (03 section 5, contract times: Toss and Pep 2.5 s, Scout and Finals 3 s of spin, then a 0.3 s hold). target = slice index
 * (pep: slot 0..5; toss: 0 won face, 1 lost face). Spin-up 0.2/1.5, cruise 0.6/1.5, cubic ease-out 0.7/1.5 of the spin time. Reduced motion: skip the spin, show at once.
 * Returns plain data: {kind, widget, seconds, hold, total, up, cruise, ease, target, flips?, turns?, steps?}. Use revealProgress(plan, t) for 0..1 travel.
 * @param {string} kind @param {number} [target]
 */
export function revealPlan(kind, target = 0) {
  const R = DR.REVEAL, c = R[kind]; if (!c || typeof c !== 'object') throw new Error('revealPlan: unknown kind ' + kind);
  const sec = c.seconds, plan = { kind, widget: c.widget, seconds: sec, hold: R.HOLD, total: sec + R.HOLD, up: R.UP * sec, cruise: R.CRUISE * sec, ease: R.EASE * sec, target };
  const K = kindOf(kind);
  if (K.plan) return K.plan(plan, c, target, sec);
  return { ...plan, turns: c.turns };
}

/** Travel 0..1 at time t (s from the start of the spin): linear ramp up, constant cruise, cubic ease-out to rest. Reaches exactly 1 at plan.seconds. @param {any} plan @param {number} t */
export function revealProgress(plan, t) {
  const { up, cruise, ease, seconds } = plan; if (t <= 0) return 0; if (t >= seconds) return 1;
  const tot = up / 2 + cruise + ease / 3; // distance in units of the cruise speed
  let dist;
  if (t < up) dist = (t * t) / (2 * up);
  else if (t < up + cruise) dist = up / 2 + (t - up);
  else { const s = (t - up - cruise) / ease; dist = up / 2 + cruise + (ease / 3) * (1 - Math.pow(1 - s, 3)); }
  return dist / tot;
}
