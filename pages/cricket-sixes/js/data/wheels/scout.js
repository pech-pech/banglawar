// @ts-check
// Scout wheel slice table (wheels SPEC sec 9, CONTRACT-A sec 5 row shape). T4. Pure data.
// 10 slices x w 1.0 (10% each). Value = grade steps above the league centre card.
// Slice #1 centre +2 (gold); odd 3,5,7,9 centre +1; even 2,4,6,8,10 centre. Random mean 0.60.
const VALUES = [2, 0, 1, 0, 1, 0, 1, 0, 1, 0];
const MEDIAN = 0.5; // sorted values: five 0, four 1, one 2 -> (0 + 1) / 2
const LOW = 0;
/** @type {ReadonlyArray<Readonly<{id:number,w:number,value:number,label:string,tier:'top'|'mid'|'low',gold:boolean}>>} */
export const SCOUT_SLICES = Object.freeze(VALUES.map((value, id) => Object.freeze({
  id, w: 1.0, value,
  label: value === 0 ? 'Centre' : 'Centre +' + value,
  tier: /** @type {'top'|'mid'|'low'} */ (value > MEDIAN ? 'top' : value === LOW ? 'low' : 'mid'),
  gold: id === 0,
})));
