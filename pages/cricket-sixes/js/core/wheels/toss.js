// @ts-check
// Toss reveal kind hooks (S0 Z1, owner T3). Read by the dispatcher in ./reveal.js. No Extra Gold on Toss (no extraKey).
import { DR } from '../../data/dialreel.js';
import { TOSS_SLICES } from '../../data/wheels/toss.js';
import { neutralMods } from './common.js';

/** @type {{tweak:(sl:any[], m:any)=>void, boost:(fx:any, v:number, d:number[])=>void, plan:(plan:any, c:any, target:number, sec:number)=>any}} */
export const REVEAL_KIND = {
  /** Kind Floor (low slice +1% a rank), Good Sport (consolation +2.5%). */
  tweak(sl, m) {
    for (const s of sl) if (s.low) { if (m.floor) s.fx.tossb = (s.fx.tossb || 0) + m.floor * DR.UNIT.toss; if (m.cons) { s.fx.tossb = 2.5; s.label = 'Good sport +1 Spoke +2.5%'; } }
  },
  /** Booster: + value x Toss unit. */
  boost(fx, v) { fx.tossb = (fx.tossb || 0) + v * DR.UNIT.toss; },
  /** Coin flips; lost face lands half a turn later. */
  plan(plan, c, target) { return { ...plan, flips: c.flips, turns: c.flips + (target === 1 ? 0.5 : 0) }; },
};

// ---- T3 stop-resolved Toss (SPEC sec 7, 11b). Result is decided at STOP from the landed ring slice; shape = revealResult's.
/**
 * Toss ring rows (CONTRACT-A sec 5 shape + value/tier/gold). Kind Floor: No-boost rows gain +1% x floor. Good Sport: No-boost rows pay 2.5, label 'Good sport +1 Spoke +2.5%'
 * (cons wins over floor, as the old REVEAL_KIND.tweak). Widths stay 1.0 (sum 10).
 * TODO(T3-after-T1): Coin Weight widens the +5% rows by +5% via wheel-ring.js (needs T1); Toss has no Extra Gold.
 * @param {any} [mods]
 */
export function tossRing(mods = neutralMods()) {
  const m = { ...neutralMods(), ...mods };
  return TOSS_SLICES.map((s) => {
    let value = s.value, label = s.label;
    if (s.value === 0) {
      if (m.floor) value += m.floor * DR.UNIT.toss;
      if (m.cons) { value = 2.5; label = 'Good sport +1 Spoke +2.5%'; }
    }
    return { ...s, value, label };
  });
}

/**
 * Toss result at the STOP. Same shape as revealResult('toss'): {index, id, label, fx, boosted, slot, slots, neighbour}; index = stop.sliceId.
 * id: 'won' when the row pays (value > 0), else 'sport' (the No-boost row; md.js reads id === 'sport' for the +1 Spoke via recordSpin sportSlice). Always draws 6 numbers
 * (d0 unused here, d1/d2 Booster as revealResult, d3-d5 unused), no other randomness.
 * @param {{random:()=>number}} rng @param {any[]} ring from tossRing @param {{sliceId:number}} stop @param {any} [mods]
 */
export function tossAtStop(rng, ring, stop, mods = neutralMods()) {
  const d = Array.from({ length: 6 }, () => rng.random()), m = { ...neutralMods(), ...mods };
  const i = stop.sliceId, row = ring[i]; if (!row) throw new Error('tossAtStop: bad sliceId ' + i);
  const fx = { tossb: row.value }; let boosted = false;
  if (m.bch && d[1] < m.bch) {
    const cand = ring.filter((c) => !c.gold), bi = cand[Math.min(cand.length - 1, Math.floor(d[2] * cand.length))];
    if (bi && bi.id === row.id) { boosted = true; REVEAL_KIND.boost(fx, m.bval, d); }
  }
  return { index: i, id: row.value > 0 ? 'won' : 'sport', label: row.label, fx, boosted, slot: null, slots: /** @type {number[]} */ ([]), neighbour: false };
}
