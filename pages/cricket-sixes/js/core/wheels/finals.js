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

// ---------------------------------------------------------------- T4 Wave 2: the 12-slice Finals ring (wheels SPEC 10), result decided at STOP
import { FINALS_SLICES } from '../../data/wheels/finals.js';
import { paidAmount } from '../finals-paid.js';
import { neutralMods } from './common.js';

/** Coin / Fans multipliers on the Finals prize. NONE exist in today's code (the old reel paid fx.coins / fx.fans raw; the league multipliers only touch the fixed finalsReward), so x1. */
export const FINALS_MULT = Object.freeze({ coins: 1, fans: 1 });
/** Hard ceiling for a widened gold piece (SPEC 14 test 6): 13.0% of the rim = 1.3 units. */
export const MEDAL_MAX_W = 1.3;
const FX_KEY = /** @type {Record<string,string>} */ ({ Coins: 'coins', TP: 'tp', Fans: 'fans', Medal: 'medal' });
const pair = (/** @type {number} */ v) => Math.floor(v * 1.5 + 0.5);

/**
 * The Finals wheel in the revealWheel shape ({kind,slices:[{index,id,label,w,a,b,gold,rare,low,fx,value,type,tier,sliceId}],total,mods,widths}), built from FINALS_SLICES
 * so the core token rules keep working. Label = PAID amount (Coin / Fans multipliers, then Prize Pair x1.5 when owned; Medal 'M', never multiplied).
 * fx stays the BASE (x mult) amount: revealResult applies Prize Pair itself, so label === what is paid.
 * @param {any} [mods] @param {{coins?:number,fans?:number}} [mult]
 */
export function finalsWheel(mods, mult = FINALS_MULT) {
  const m = { ...neutralMods(), ...(mods || {}) };
  const sl = FINALS_SLICES.map((r) => {
    const paid = paidAmount(r, mult), medal = r.type === 'Medal';
    const w = medal ? Math.min(MEDAL_MAX_W, r.w + m.goldAdd + m.rareAdd) : r.w;
    return { id: medal ? 'medal' : `${r.type.toLowerCase()}${r.amount}`, label: medal ? 'M' : String(m.nb ? pair(paid) : paid), w, gold: !!r.gold, rare: medal, low: false,
      fx: { [FX_KEY[r.type]]: medal ? 1 : paid }, value: r.value, type: r.type, tier: r.tier, second: false };
  });
  const g0 = sl.findIndex((s) => s.gold), n0 = sl.length;
  for (let e = 0; g0 >= 0 && e < m.extra; e++) { // Extra Gold: the second gold (40 Coins) goes farthest from the first gold piece
    const g = sl[g0], pos = (g0 + Math.round(n0 / 2) + e) % sl.length + 1;
    sl.splice(pos, 0, { ...g, fx: { ...g.fx }, w: g.w * DR.EXTRA_W, rare: false, second: true });
  }
  REVEAL_KIND.tweak(sl);
  for (const s of /** @type {any[]} */ (sl)) if (s.second) { const c = paidAmount({ type: 'Coins', value: 40 }, mult); s.fx = { coins: c }; s.label = String(m.nb ? pair(c) : c); s.value = 40; s.type = 'Coins'; s.tier = 'top'; }
  let x = 0;
  const slices = sl.map((s, i) => { const a = x; x += s.w; return { ...s, index: i, sliceId: i, a, b: x }; });
  return { kind: 'finals', wheel: 'finals', widget: DR.REVEAL.finals.widget, slices, total: x, mods: m, widths: slices.map((s) => s.w) };
}

/** Ring rows for the wheel view (CONTRACT-A sec 5: id = ring index, w rim units, value base coin-eq, label paid, tier, gold). @param {any} wheel */
export const finalsRing = (wheel) => wheel.slices.map((/** @type {any} */ s) => ({ id: s.index, w: s.w, value: s.value, label: s.label, tier: s.tier, gold: !!s.gold }));
