// Shared helper for the training tests (not a test file itself: node --test only runs *.test.mjs).
import { makeRng } from '../js/core/rng.js';
export const player = (o = {}) => ({ id: 'p1', name: 'Tester', bat: 'Middle', bowl: 'Medium', bp: 30, bs: 30, spd: 30, bsk: 30, potential: 130, drillsHere: 0, nodes: { bat: 0, bowl: 0 }, ...o });
export const coach = (o = {}) => ({ id: 'k1', name: 'Coach', step: 4, strong: ['bat', 'bowl'], away: 0, courseSeason: null, ...o });
export function game({ players = [player()], coaches = [coach()], tp = 450, nets = 1 } = {}) {
  return { seed: 's', nets, coaches, coachPicked: true,
    clubs: [{ id: 'c0', name: 'Mine', mean: 30, squad: players, six: players.slice(0, 6).map((p) => p.id) }],
    training: { tp, week: 1, nodeBought: {}, weekLog: [], weekStart: {}, drillCount: 0 } };
}
export const me = (s, id = 'p1') => s.clubs[0].squad.find((p) => p.id === id);
/** rng whose random() returns the given values in turn */
export const fixed = (...xs) => { let i = 0; return { random: () => xs[Math.min(i++, xs.length - 1)] }; };
export { makeRng };
