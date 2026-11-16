// @ts-check
// Pep reveal kind hooks + the Pep light chase timing (S0 Z1, owner T3). Read by the dispatcher in ./reveal.js.
import { DR } from '../../data/dialreel.js';
import { clamp, sum, neutralMods } from './common.js';
import { PEP_SLICES, PEP_SLOT_OF } from '../../data/wheels/pep.js';

/** Pep light chase: the lit light index (0..5) after each step and the time (s) it lights; n = 6 + target steps, d_i = 0.06 + 0.20 (i/10)^2 rescaled to `seconds`. @param {number} slot0 @param {number} [seconds] */
export function pepSteps(slot0, seconds = DR.REVEAL.pep.seconds) {
  const R = DR.REVEAL, n = 6 + clamp(slot0 | 0, 0, 5), d = [];
  for (let i = 0; i < n; i++) d.push(R.PEP_STEP0 + R.PEP_STEP_GROW * Math.pow(i / R.PEP_STEP_REF, 2));
  const k = seconds / sum(d); let t = 0;
  return d.map((di, i) => { t += di * k; return { light: (i + 1) % 6, at: t - di * k }; }).map((s, i, a) => ({ ...s, end: i + 1 < a.length ? a[i + 1].at : seconds }));
}

/** @type {{extraKey:string, boost:(fx:any, v:number, d:number[])=>void, post:(out:any, s:any, fx:any, m:any, d:number[])=>void, plan:(plan:any, c:any, target:number, sec:number)=>any}} */
export const REVEAL_KIND = {
  extraKey: 'pep',
  /** Booster: 0.5 per value chance of one more pepped player (draw 3). */
  boost(fx, v, d) { fx.pep = (fx.pep || 0) + (d[3] < clamp(v * DR.UNIT.pep, 0, 1) ? 1 : 0); },
  /** Slots: the slice's slot or a random one (draw 4); double = a random second slot (draw 5); Pep Rally: 50% the next slot too (draw 5). */
  post(out, s, fx, m, d) {
    const a = s.slot || 1 + Math.min(5, Math.floor(d[4] * 6)); // double pep: a random pair
    out.slots = [a];
    let b = 0;
    if (s.id === 'double' || fx.pep >= 2) { b = 1 + Math.min(4, Math.floor(d[5] * 5)); if (b >= a) b++; out.slots.push(b); }
    if (m.nb) { out.neighbour = d[5] < 0.5; if (out.neighbour) { const n = (a % 6) + 1; if (!out.slots.includes(n)) out.slots.push(n); } }
    out.fx.pep = out.slots.length;
  },
  plan(plan, c, target, sec) { return { ...plan, steps: pepSteps(target, sec) }; },
};

/**
 * Pep ring (CONTRACT-A sec 5 rows): the 12 PEP_SLICES, each also carrying slot = PEP_SLOT_OF(i, offset) (1..6, p1..p6 twice round the ring).
 * TODO(T3-after-T1): Pep Voice widening and Extra Gold need T1's wheel-ring.js; not done here, so mods only matter to pepAtStop.
 * @param {any} [mods] @param {number} [offset]
 */
export function pepRing(mods = neutralMods(), offset = 0) {
  void mods;
  return PEP_SLICES.map((s, i) => ({ ...s, slot: PEP_SLOT_OF(i, offset) }));
}

/**
 * Pep result at a stop: same shape as revealResult for pep, {index, id:'slot'+slot, label, fx:{pep}, boosted, slot, slots, neighbour} plus boostPct = row.value (2.5..10).
 * Always 6 draws, same indices as revealResult (0 unused here, 1-2 booster, 3 pep booster, 4-5 second slot / Pep Rally). No 'double' slice in this path.
 * @param {{random:()=>number}} rng @param {any[]} ring from pepRing @param {{sliceId:number}} stop @param {any} [mods]
 */
export function pepAtStop(rng, ring, stop, mods = neutralMods()) {
  const d = Array.from({ length: 6 }, () => rng.random()), m = { ...neutralMods(), ...mods };
  const i = stop.sliceId, row = ring[i], fx = { pep: 1 };
  let boosted = false;
  if (m.bch && d[1] < m.bch) {
    const cand = ring.filter((c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[2] * cand.length))];
    if (bi && bi.id === row.id) { boosted = true; REVEAL_KIND.boost(fx, m.bval, d); }
  }
  const out = { index: i, id: 'slot' + row.slot, label: row.label, fx, boosted, slot: row.slot, slots: /** @type {number[]} */ ([row.slot]), neighbour: false, boostPct: row.value };
  const a = row.slot;
  if (fx.pep >= 2) { let b = 1 + Math.min(4, Math.floor(d[5] * 5)); if (b >= a) b++; out.slots.push(b); }
  if (m.nb) { out.neighbour = d[5] < 0.5; if (out.neighbour) { const n = (a % 6) + 1; if (!out.slots.includes(n)) out.slots.push(n); } }
  out.fx.pep = out.slots.length;
  return out;
}
