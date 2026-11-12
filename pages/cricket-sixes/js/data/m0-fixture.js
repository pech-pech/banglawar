// @ts-check
// Step-0 start state: two clubs of six. Pure; all randomness from the passed rng.
import { rollPotential } from '../core/ability.js';

const ME_CLUB = 'Fernhill';
const RIVAL_CLUB = 'Dunmore CC';
const ME_NAMES = ['Marlow', 'Whitcombe', 'Okoro', 'Sandhu', 'Pike', 'Reyes'];
const RIVAL_NAMES = ['Brook', 'Lister', 'Voss', 'Harrow', 'Ellery', 'Dace'];
const BAT = ['Opener', 'Opener', 'Middle', 'Middle', 'Lower', 'Lower'];
const TYPES = ['Fast', 'Fast', 'Medium', 'Medium', 'Spin', 'Spin'];
const FIXTURE = {
  ratingMean: 50, ratingSd: 8,
  // M's potentials in batting order: grades D, C, B, A, S, then B (the hidden one).
  mePotential: [92, 105, 118, 131, 150, 116],
  meDrills: [5, 5, 5, 5, 5, 2],
  rivalBonus: 20,
};

/** @param {{normalish:(m:number,sd:number)=>number, shuffle:(a:any[])=>any[]}} rng */
function rating(rng) { return Math.round(Math.min(99, Math.max(1, rng.normalish(FIXTURE.ratingMean, FIXTURE.ratingSd)))); }

/**
 * @param {any} rng
 * @param {string} prefix
 * @param {string[]} names
 * @param {(i:number)=>{potential:number, drillsHere:number}} meta
 */
function makeSix(rng, prefix, names, meta) {
  const types = rng.shuffle(TYPES.slice());
  return names.map((name, i) => {
    const bp = rating(rng), bs = rating(rng), spd = rating(rng), bsk = rating(rng);
    const m = meta(i);
    return {
      id: prefix + i, name, bat: BAT[i], bowl: types[i], bp, bs, spd, bsk,
      potential: m.potential, drillsHere: m.drillsHere,
      overs: 0, figs: { r: 0, w: 0 }, inn: { r: 0, b: 0, out: false },
    };
  });
}

/** @param {any} rng */
export function makeStartState(rng) {
  const me = makeSix(rng, 'm', ME_NAMES, (i) => ({ potential: FIXTURE.mePotential[i], drillsHere: FIXTURE.meDrills[i] }));
  const rival = makeSix(rng, 'r', RIVAL_NAMES, () => ({ potential: rollPotential(rng, { bonus: FIXTURE.rivalBonus }), drillsHere: 0 }));
  return { me: { name: ME_CLUB, players: me }, rival: { name: RIVAL_CLUB, players: rival } };
}
