// @ts-check
// Hype wheel slice table (wheels-like-match SPEC s6, CONTRACT-A s5). Full wheel, 10-unit ring, random mean 4.30 points.
// Ring clockwise from the pointer: NUTS, MED, LOW, MED, HIGH, LOW, MED, LOW, HIGH. Odds 10 / 20 / 35 / 35 %.
// Only tilt 0 is specified; any other tilt uses table 0 until NUMBERS sims another (SPEC s6, question 5).

/** @typedef {{id:number, w:number, value:number, label:string, tier:'top'|'mid'|'low', gold:boolean, level:'nuts'|'high'|'med'|'low'}} SliceRow */

const MP = 1.16667; // each MED / LOW piece, rim units (3.5 / 3)

/** @param {number} id @param {number} w @param {number} value @param {string} label @param {'top'|'mid'|'low'} tier @param {boolean} gold @returns {SliceRow} */
const row = (id, w, value, label, tier, gold) => Object.freeze({ id, w, value, label, tier, gold, level: /** @type {'nuts'|'high'|'med'|'low'} */ (label.split(' ')[0].toLowerCase()) });

/** Ring order, clockwise from the pointer (kind per piece). */
export const HYPE_RING_ORDER = Object.freeze(['NUTS', 'MED', 'LOW', 'MED', 'HIGH', 'LOW', 'MED', 'LOW', 'HIGH']);

/** @type {Readonly<Record<number, ReadonlyArray<SliceRow>>>} */
export const HYPE_SLICES = Object.freeze({
  0: Object.freeze([
    row(0, 1.0, 10, 'NUTS +10', 'top', true),
    row(1, MP, 4, 'MED +4', 'mid', false),
    row(2, MP, 2, 'LOW +2', 'low', false),
    row(3, MP, 4, 'MED +4', 'mid', false),
    row(4, 1.0, 6, 'HIGH +6', 'mid', false),
    row(5, MP, 2, 'LOW +2', 'low', false),
    row(6, MP, 4, 'MED +4', 'mid', false),
    row(7, MP, 2, 'LOW +2', 'low', false),
    row(8, 1.0, 6, 'HIGH +6', 'mid', false),
  ]),
});

/** Any tilt falls back to table 0.
 * @param {number} [tilt] @returns {ReadonlyArray<SliceRow>} */
export const hypeSlicesFor = (tilt) => HYPE_SLICES[/** @type {number} */ (tilt)] || HYPE_SLICES[0];

/** Hype tokens allowed a season (rule F). */
export const HYPE_TOKEN_CAP = 1;
/** Warm Crowd: a HIGH +6 landing pays +7 (data constant only; widths do not change). */
export const HYPE_WARM_CROWD = 7;
