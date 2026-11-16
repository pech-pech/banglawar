// FIND wheel slice tables (SPEC 5, 2f). Pure data. Ring = 10 rim units, index = sliceId, clockwise from the pointer.
// Row {id, w, value, label, tier, gold}. FIND value 1 (gold, tier top), CHEER value 0 (tier mid).
export const FIND_J = 1.5;
export const FIND_RATES = Object.freeze([0.08, 0.18, 0.26]);
const LABEL_MIN_W = 0.7; // under 0.7 unit (7%): exactly one character
const find = (w) => ({ w, value: 1, label: w < LABEL_MIN_W ? 'F' : 'FIND', tier: 'top', gold: true });
const cheer = (w) => ({ w, value: 0, label: 'CHEER', tier: 'mid', gold: false });
const ring = (rows) => Object.freeze(rows.map((r, id) => Object.freeze({ id, ...r })));
const rep = (n, f) => Array.from({ length: n }, f);

export const FIND_SLICES = Object.freeze({
  0.08: ring([find(0.4), ...rep(4, () => cheer(1.15)), find(0.4), ...rep(4, () => cheer(1.15))]),
  0.18: ring([find(0.9), ...rep(4, () => cheer(1.025)), find(0.9), ...rep(4, () => cheer(1.025))]),
  // 12 / 12 / 2 (two equal 13% blocks would break the cap); CHEER 74/9 % each
  0.26: ring([find(1.2), ...rep(3, () => cheer(74 / 90)), find(1.2), ...rep(3, () => cheer(74 / 90)), find(0.2), ...rep(3, () => cheer(74 / 90))]),
});
