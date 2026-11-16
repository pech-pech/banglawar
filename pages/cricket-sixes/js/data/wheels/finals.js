// @ts-check
// FINALS_SLICES (T4, wheels SPEC 10): 12 slices, ring order exact, widths in rim units (% / 10), ring sums 10.000.
// `value` = base coin-eq (tier, median and careful use it). `label` is the BASE text; the paid label comes from js/core/finals-paid.js.
// Row shape = CONTRACT-A sec 5 {id, w, value, label, tier, gold}; `type` / `amount` are extra keys (engine ignores them).

export const FINALS_MEDIAN = 20;
const W = 0.87273, WM = 0.4;
const T = (/** @type {number} */ v) => (v > FINALS_MEDIAN ? 'top' : v === 10 ? 'low' : 'mid');
const R = (/** @type {number} */ id, /** @type {string} */ type, /** @type {number} */ v) =>
  ({ id, w: W, value: v, label: `${v}`, tier: /** @type {'top'|'mid'|'low'} */ (T(v)), gold: false, type, amount: v });

export const FINALS_SLICES = Object.freeze([
  Object.freeze({ id: 0, w: WM, value: 60, label: 'M', tier: /** @type {'top'} */ ('top'), gold: true, type: 'Medal', amount: 1 }),
  R(1, 'Coins', 30), R(2, 'TP', 25), R(3, 'Fans', 20), R(4, 'Coins', 10), R(5, 'TP', 15),
  R(6, 'Fans', 20), R(7, 'Coins', 20), R(8, 'TP', 10), R(9, 'Fans', 15), R(10, 'Coins', 25), R(11, 'TP', 30),
].map((s) => Object.freeze(s)));
