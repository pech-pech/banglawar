// @ts-check
// Hype half-dial and Find slot reel (aimable), plus reveal-only spins (Toss, Pep, Scout, Finals). Pure: no DOM, no clock,
// no Math.random; every roll uses the rng handed in. Port of 03-DIAL-REEL-AIM.md sections 1-6 + dial_reel_aim_sim.py.
//
// S0 Z1: RE-EXPORT BARREL. The code lives per wheel in js/core/wheels/: common.js (tree modifiers adapter + shared stop maths),
// hype.js (Hype half-dial), find.js (Find reel, pity, Find big wheel), reveal.js (reveal dispatcher: revealWheel / revealResult /
// revealPlan / revealProgress) with the kind hooks in toss.js, pep.js (+ pepSteps), scout.js, finals.js.
// Import from here as before; per-wheel files never import this file (no cycles).
export { neutralMods, modsFromSim, simFromRanks, modsFor, clampStop, tri, idealTap, carefulTap, newAim, sweepAt } from './wheels/common.js';
export { hypeDial, dialGuideX, hypeDialFor, dialLanding, dialResult } from './wheels/hype.js';
export { findReel, reelLanding, reelResult, pityFind, findWheel, findWheelResult } from './wheels/find.js';
export { revealWheel, revealResult, revealPlan, revealProgress } from './wheels/reveal.js';
export { pepSteps } from './wheels/pep.js';
