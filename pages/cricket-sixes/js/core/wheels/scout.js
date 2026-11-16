// @ts-check
// Scout reveal kind hooks (S0 Z1, owner T4). Read by the dispatcher in ./reveal.js.
import { DR } from '../../data/dialreel.js';

/** @type {{extraKey:string, tweak:(sl:any[], m:any)=>void, boost:(fx:any, v:number, d:number[])=>void}} */
export const REVEAL_KIND = {
  extraKey: 'steps',
  /** Scout's Eye: the low slice becomes Extra name +1 step. */
  tweak(sl, m) { if (m.sfloor) for (const s of sl) if (s.low) { s.fx.steps = Math.max(s.fx.steps || 0, 1); s.label = 'Extra name +1 step'; } },
  /** Booster: + value x Scout unit steps. */
  boost(fx, v) { fx.steps = (fx.steps || 0) + v * DR.UNIT.scout; },
};
