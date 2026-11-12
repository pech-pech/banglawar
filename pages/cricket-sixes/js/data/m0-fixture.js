// @ts-check
// Step-0 start state: two clubs of six. Pure; all randomness from the passed rng.
import { rollPotential, capSum } from '../core/ability.js';

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
  meDrills: [5, 5, 5, 5, 5, 0],
  rivalBonus: 20,
  room: 12, // CONTRACT s11: cap sum >= rating sum + room
};

/** @param {{normalish:(m:number,sd:number)=>number, shuffle:(a:any[])=>any[]}} rng */
function rating(rng) { return Math.round(Math.min(99, Math.max(1, rng.normalish(FIXTURE.ratingMean, FIXTURE.ratingSd)))); }

/** Scale four ratings down (keeping shape, each 1..99) until sum <= maxSum. @param {number[]} r @param {number} maxSum */
function fit(r, maxSum) {
  const sum = r.reduce((a, b) => a + b, 0);
  if (sum <= maxSum) return r;
  const f = maxSum / sum;
  const o = r.map((v) => Math.max(1, Math.round(v * f)));
  while (o.reduce((a, b) => a + b, 0) > maxSum) o[o.indexOf(Math.max(...o))]--;
  return o;
}

/**
 * @param {any} rng
 * @param {string} prefix
 * @param {string[]} names
 * @param {(i:number, sum:number)=>{potential:number, drillsHere:number}} meta
 * @param {number} [teamMeanSum] if given, scale the whole team's ratings (shape kept, 1..99) so the mean rating sum matches
 */
function makeSix(rng, prefix, names, meta, teamMeanSum) {
  const types = rng.shuffle(TYPES.slice());
  let rs = names.map((_n, i) => {
    const r = [rating(rng), rating(rng), rating(rng), rating(rng)];
    const fixed = meta(i, -1).potential;
    return fixed > 0 ? fit(r, capSum(fixed) - FIXTURE.room) : r;
  });
  if (teamMeanSum !== undefined) {
    const mean = rs.reduce((a, r) => a + r[0] + r[1] + r[2] + r[3], 0) / rs.length;
    const f = teamMeanSum / mean;
    rs = rs.map((r) => r.map((v) => Math.min(99, Math.max(1, Math.round(v * f)))));
  }
  return names.map((name, i) => {
    const [bp, bs, spd, bsk] = rs[i];
    const m = meta(i, bp + bs + spd + bsk);
    return {
      id: prefix + i, name, bat: BAT[i], bowl: types[i], bp, bs, spd, bsk,
      potential: m.potential, drillsHere: m.drillsHere,
      overs: 0, figs: { r: 0, w: 0 }, inn: { r: 0, b: 0, out: false },
    };
  });
}

/** @param {any[]} ps */
function meanSum(ps) { return ps.reduce((a, p) => a + p.bp + p.bs + p.spd + p.bsk, 0) / ps.length; }

/** @param {any} rng */
export function makeStartState(rng) {
  const me = makeSix(rng, 'm', ME_NAMES, (i) => ({ potential: FIXTURE.mePotential[i], drillsHere: FIXTURE.meDrills[i] }));
  const rival = makeSix(rng, 'r', RIVAL_NAMES, (_i, sum) => ({ potential: sum < 0 ? 0 : rollPotential(rng, { bonus: FIXTURE.rivalBonus, minCapSum: sum + FIXTURE.room }), drillsHere: 0 }), meanSum(me));
  return { me: { name: ME_CLUB, players: me }, rival: { name: RIVAL_CLUB, players: rival } };
}
