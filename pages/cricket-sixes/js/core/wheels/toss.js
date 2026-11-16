// @ts-check
// Toss reveal kind hooks (S0 Z1, owner T3). Read by the dispatcher in ./reveal.js. No Extra Gold on Toss (no extraKey).
import { DR } from '../../data/dialreel.js';

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
