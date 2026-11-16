// @ts-check
// Finals reveal kind hooks (S0 Z1, owner T4). Read by the dispatcher in ./reveal.js.
import { DR } from '../../data/dialreel.js';

/** @type {{extraKey:string, tweak:(sl:any[], m:any)=>void, boost:(fx:any, v:number, d:number[])=>void, post:(out:any, s:any, fx:any, m:any, d:number[])=>void}} */
export const REVEAL_KIND = {
  extraKey: 'coins',
  /** Extra Gold copies on Finals are the second gold (pays 40 Coins), not a copy of the jackpot. Source slices never carry `second`. */
  tweak(sl) { for (const s of sl) if (s.second) Object.assign(s, { id: DR.FINALS_SECOND.id, label: DR.FINALS_SECOND.label, fx: { ...DR.FINALS_SECOND.fx } }); },
  /** Booster: + value x Finals unit Coins. */
  boost(fx, v) { fx.coins = (fx.coins || 0) + v * DR.UNIT.finals; },
  /** Prize Pair: Coins / TP / Fans x1.5 (rounded), never Medals. */
  post(out, s, fx, m) { if (m.nb) for (const k of ['coins', 'tp', 'fans']) if (fx[k]) fx[k] = Math.floor(fx[k] * 1.5 + 0.5); },
};
