// Shared fixture for the training-redo tests (not a test file).
import { makeRng } from '../js/core/rng.js';
export const P = (i, o = {}) => ({ id: 'p' + i, name: 'Pl' + i, bat: 'Middle', bowl: 'Medium', bp: 30, bs: 30, spd: 30, bsk: 30, potential: 150, drillsHere: 1, nodes: { bat: 0, bowl: 0 }, ...o });
export const K = (o = {}) => ({ id: 'k1', name: 'Coach', step: 4, strong: ['bat', 'bowl'], away: 0, courseSeason: null, ...o });
export function game({ players, tp = 450, nets = 1, coaches = [K()], league = 1, n = 1, plan } = {}) {
  const sq = players || Array.from({ length: 8 }, (_, i) => P(i + 1));
  return { seed: 'g', nets, coaches, season: { n, league },
    clubs: [{ id: 'c0', name: 'Mine', squad: sq, six: sq.slice(0, 6).map((p) => p.id) }],
    training: { tp, week: 1, nodeBought: {}, last: null, weekLog: [], weekStart: {}, drillCount: 0, lastPlan: plan || null } };
}
export const me = (s, id) => s.clubs[0].squad.find((p) => p.id === id);
export { makeRng };
