// @ts-check
// Spotlight and Course wheel rings (SPEC 2026-11-16-wheels-like-match sections 3 and 4; CONTRACT-A sec 5 row shape).
// Row {id, w, value, label, tier, gold}: id = ring index clockwise from the pointer, w in rim units (percent / 10, ring sums 10).
// tier: top = value above wheel median (1), low = lowest value (1). Under 7% the label is one char or a signed number.

/** @param {Array<[number, number, string, boolean]>} spec [w, value, label, gold] */
const ring = (spec) => Object.freeze(spec.map(([w, value, label, gold], id) => Object.freeze({
  id, w, value, label, tier: value > 1 ? 'top' : 'low', gold,
})));

const X1 = 74 / 70; // seven x1.0 pieces share 74%: 10.5714% each

/** Spotlight multipliers, random mean 1.292. */
export const SPOT_SLICES = ring([
  [1.2, 3.0, 'x3.0', true],
  [X1, 1.0, 'x1.0', false], [X1, 1.0, 'x1.0', false],
  [0.8, 1.5, 'x1.5', false],
  [X1, 1.0, 'x1.0', false], [X1, 1.0, 'x1.0', false],
  [0.6, 1.2, '1.2', false],
  [X1, 1.0, 'x1.0', false], [X1, 1.0, 'x1.0', false], [X1, 1.0, 'x1.0', false],
]);

const P1 = 73 / 70; // seven +1 pieces share 73%: 10.4286% each

/** Course steps, random mean 1.590. */
export const COURSE_SLICES = ring([
  [1.2, 4, '+4', true],
  [P1, 1, '+1', false],
  [0.8, 3, '+3', false],
  [P1, 1, '+1', false],
  [0.35, 2, '+2', false],
  [P1, 1, '+1', false],
  [0.35, 2, '+2', false],
  [P1, 1, '+1', false], [P1, 1, '+1', false], [P1, 1, '+1', false], [P1, 1, '+1', false],
]);
