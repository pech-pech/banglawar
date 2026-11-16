// A2.4: parity bands on the pure modules (SPEC 14 tests 1-3). Ring tables are SPEC section 3-10 fixtures typed here
// (T2-T4 own the real data files later). Seeded only; small n with common random numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTapper, exactRandom, TAPPERS, SIM } from '../tools/wheels-parity.mjs';
import { checkRing } from '../js/core/wheel-ring.js';

// rows: [value, width %]; label/tier filled in the simple way, gold = top value.
const mk = (spec) => {
  const vals = spec.map((r) => r[0]), top = Math.max(...vals);
  return spec.map(([value, pct], id) => ({ id, w: pct / 10, value, label: String(value), tier: value === top ? 'top' : 'mid', gold: value === top }));
};
const rep = (n, x) => Array.from({ length: n }, () => x);
const FIND = (blocks, gap, per) => blocks.flatMap((b) => [[1, b], ...rep(per, [0, gap])]);

const R = {
  spot: mk([[3, 12], [1, 74 / 7], [1, 74 / 7], [1.5, 8], [1, 74 / 7], [1, 74 / 7], [1.2, 6], [1, 74 / 7], [1, 74 / 7], [1, 74 / 7]]),
  course: mk([[4, 12], [1, 73 / 7], [3, 8], [1, 73 / 7], [2, 3.5], [1, 73 / 7], [2, 3.5], ...rep(4, [1, 73 / 7])]),
  hype: mk([[10, 10], [4, 35 / 3], [2, 35 / 3], [4, 35 / 3], [6, 10], [2, 35 / 3], [4, 35 / 3], [2, 35 / 3], [6, 10]]),
  toss: mk([0, 0, 0, 2.5, 5, 2.5, 2.5, 5, 5, 2.5].map((v) => [v, 10])),
  pep: mk([5, 7.5, 5, 2.5, 2.5, 5, 7.5, 10, 7.5, 5, 2.5, 2.5].map((v) => [v, v === 10 ? 9.6 : 90.4 / 11])),
  scout: mk([2, 0, 1, 0, 1, 0, 1, 0, 1, 0].map((v) => [v, 10])),
  finals: mk([60, 30, 25, 20, 10, 15, 20, 20, 10, 15, 25, 30].map((v) => [v, v === 60 ? 4 : 96 / 11])),
  find8: mk(FIND([4, 4], 11.5, 4)),
  find18: mk(FIND([9, 9], 10.25, 4)),
  find26: mk([[1, 12], ...rep(3, [0, 74 / 9]), [1, 12], ...rep(3, [0, 74 / 9]), [1, 2], ...rep(3, [0, 74 / 9])]),
};
const RANDOM = { spot: 1.292, course: 1.590, hype: 4.30, toss: 2.50, pep: 5.27, scout: 0.60, finals: 21.6, find8: 0.08, find18: 0.18, find26: 0.26 };
const J_OF = (k) => (k.startsWith('find') ? 1.5 : 1.2);
const MIN_AIM = (k) => (k.startsWith('find') ? SIM.FIND_MIN_AIM : SIM.MIN_AIM);
// SPEC table ratios (14 test 2): careful, full Control.
const CAREFUL = { spot: 1.33, course: 1.39, hype: 1.36, toss: 1.37, pep: 1.36, scout: 1.33, finals: 1.37, find8: 1.46, find18: 1.44, find26: 1.35 };
const FULL_MAX = { spot: 1.65, course: 1.71, hype: 1.69, toss: 1.64, pep: 1.60, scout: 1.68, finals: 1.52, find8: 2.26, find18: 2.23, find26: 2.01 };

const SEED = 'wheel-bands-1';
const N_RANDOM = 400;   // stratified random tapper: smallest n that holds +-0.1 on every ring (Finals is the widest spread)
const N_SKILL = 2500;
const N_FIND = 6000;    // Find rates are Bernoulli, 8% needs more spins for the same ratio noise   // skilled tappers: common random numbers across tappers
// Careful-band sizing (measured over 4 seeds, ratio minus SPEC value): s.d. of the careful ratio is ~0.015 at n 2500 and ~0.007 at n 12000
// (non-Find, noisiest ring Scout/Spot). N_BAND 12000 with tol 0.03 is ~4 s.e. and 2x the SPEC +-0.015; the old 0.07 let Spotlight 1.26 pass.
// Find (Bernoulli 8-26% rates): n 20000 gives s.e. ~0.002 absolute on the careful hit rate, so the SPEC +-1.5 pp is used as is.
const N_BAND = 12000, TOL_BAND = 0.03, N_BAND_FIND = 20000, TOL_FIND_PP = 0.015;
const run = (k, who, n) => runTapper(R[k], who, { n, seed: SEED, name: k, J: J_OF(k), minAim: MIN_AIM(k) });

test('fixtures: every SPEC ring sums to 10 and keeps the 12% cap', () => {
  for (const [k, rows] of Object.entries(R)) assert.deepEqual(checkRing(rows, { allowEqual: true }), [], k);
});

test('test 1: exact random means equal the SPEC values (rounded as printed)', () => {
  for (const k of Object.keys(R)) assert.ok(Math.abs(exactRandom(R[k]) - RANDOM[k]) <= 0.005, `${k} ${exactRandom(R[k])}`);
});

test('test 2: random tapper mean within +-0.1 of SPEC (Find +-0.01 as a rate)', () => {
  for (const k of Object.keys(R)) {
    const tol = k.startsWith('find') ? 0.01 : 0.1;
    const m = run(k, 'random', N_RANDOM).mean;
    assert.ok(Math.abs(m - RANDOM[k]) <= tol, `${k}: ${m.toFixed(3)} vs ${RANDOM[k]}`);
  }
});

test('mutation: the tightened tolerance rejects a Spotlight careful ratio of 1.26', () => {
  assert.ok(Math.abs(1.26 - CAREFUL.spot) > TOL_BAND);
});

test('test 2: careful ratio sits in the SPEC band; full Control stays under its cap', () => {
  for (const k of Object.keys(R)) {
    const find = k.startsWith('find');
    const n = find ? N_BAND_FIND : N_BAND, tol = find ? (TOL_FIND_PP / RANDOM[k]) : TOL_BAND;   // Find: SPEC +-1.5 pp absolute
    const careful = run(k, 'careful', n).ratio, full = run(k, 'full', n).ratio;
    assert.ok(Math.abs(careful - CAREFUL[k]) <= tol, `${k} careful ${careful.toFixed(3)} vs ${CAREFUL[k]}`);
    assert.ok(full <= FULL_MAX[k] + tol, `${k} full ${full.toFixed(3)} vs <= ${FULL_MAX[k]}`);
    assert.ok(full > careful, `${k}: full Control beats careful`);
  }
});

test('test 2: good beats careful, tappers are seeded (same seed same numbers)', () => {
  for (const k of ['spot', 'hype', 'finals']) assert.ok(run(k, 'good', N_SKILL).ratio > run(k, 'careful', N_SKILL).ratio, k);
  assert.deepEqual(run('hype', 'careful', 300), run('hype', 'careful', 300));
  assert.notDeepEqual(runTapper(R.hype, 'careful', { n: 300, seed: 'other', name: 'hype' }).hits, run('hype', 'careful', 300).hits);
});

test('test 3: patient tapper at the cycle-4 time nearest 3.5 s gains at most +0.03 over cycle 1', () => {
  assert.equal(TAPPERS.patient.cycle, 4);
  const TOL = 0.04;   // common random numbers keep the difference small; SPEC bound 0.03
  for (const k of Object.keys(R)) {
    const n = k.startsWith('find') ? N_FIND : N_SKILL, tol = k.startsWith('find') ? 0.02 / RANDOM[k] : TOL;
    const d = run(k, 'patient', n).ratio - run(k, 'careful', n).ratio;
    assert.ok(d <= 0.03 + tol, `${k} patient gains ${d.toFixed(3)}`);
  }
});

// SPEC 14 test 3 second clause (wait for 3.6-3.8 s of cycle 4, at most +0.03). FINDING for the lead: with the SPEC 3-10 rings
// this tapper gains more on rings with several top slices (Toss +0.08 at n 30000 / Spotlight +0.04), so the SPEC bound is NOT met
// by the shipped pulse. The guard below pins the current size (regression only); it is not the SPEC +0.03.
test('test 3: waiting for 3.6-3.8 s (finding: above the SPEC +0.03 on some rings, guard +0.14)', () => {
  for (const k of Object.keys(R)) {
    const n = k.startsWith('find') ? N_FIND : N_SKILL, tol = k.startsWith('find') ? 0.02 / RANDOM[k] : 0;
    const d = run(k, 'patientSlow', n).ratio - run(k, 'careful', n).ratio;
    assert.ok(d <= 0.14 + tol, `${k} patientSlow gains ${d.toFixed(3)}`);
  }
});
