// @ts-check
// Finals paid amount (T4, wheels SPEC 10, test 13c). Pure. Same rounding as the economy pays today (`rd = Math.round`, core/economy.js).
// Coins x multipliers.coins, Fans x multipliers.fans, TP unchanged, Medal never multiplied. Label = paid amount.
const rd = Math.round;

/** @param {{type:string, amount?:number, value:number}} slice @param {{coins?:number, fans?:number}} [mult] @returns {number} */
export function paidAmount(slice, mult = {}) {
  const base = slice.amount != null ? slice.amount : slice.value;
  if (slice.type === 'Coins') return rd(base * (mult.coins == null ? 1 : mult.coins));
  if (slice.type === 'Fans') return rd(base * (mult.fans == null ? 1 : mult.fans));
  return base; // TP and Medal: never multiplied
}

/** Ring with printed labels = paid amounts (Medal keeps "M"). Tier/value untouched (base). */
export function paidRing(/** @type {readonly any[]} */ ring, /** @type {any} */ mult) {
  return ring.map((s) => ({ ...s, label: s.type === 'Medal' ? s.label : String(paidAmount(s, mult)) }));
}
