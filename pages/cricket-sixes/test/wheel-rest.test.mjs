// T8 N5: spoke-clear rest. 1000 seeded stops on every ring wheel table: the display rest point is >= 3 deg from every seam
// (or the slice centre for a slice under 6 deg), and the landed slice index is the one the stop landed on before the nudge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { restPos, restNudge, ringEdges, SEAM_CLEAR_DEG, widen } from '../js/core/wheel-ring.js';
import { tickAt } from '../js/core/wheel-pulse.js';
import { makeRng } from '../js/core/rng.js';
import { WHEEL_ENGINE } from '../js/data/wheel-engine.js';
import { SPOT_SLICES, COURSE_SLICES } from '../js/data/wheel-slices-train.js';
import { HYPE_SLICES } from '../js/data/wheels/hype.js';
import { TOSS_SLICES } from '../js/data/wheels/toss.js';
import { PEP_SLICES } from '../js/data/wheels/pep.js';
import { SCOUT_SLICES } from '../js/data/wheels/scout.js';
import { FINALS_SLICES } from '../js/data/wheels/finals.js';
import { FIND_SLICES } from '../js/data/wheels/find.js';
import { hypeRing } from '../js/core/wheels/hype.js';
import { tossRing } from '../js/core/wheels/toss.js';
import { pepRing } from '../js/core/wheels/pep.js';
import { findWheel } from '../js/core/wheels/find.js';
import { neutralMods } from '../js/core/wheels/common.js';
import { clinicRing } from '../js/data/clinic.js';

const mod = (x, C) => ((x % C) + C) % C;
const sliceAt = (cum, pos) => { const N = cum.length - 1, u = mod(pos, cum[N]); for (let i = 0; i < N; i++) if (u < cum[i + 1]) return i; return N - 1; };

const TABLES = {
  spot: SPOT_SLICES, course: COURSE_SLICES, toss: TOSS_SLICES, pep: PEP_SLICES, scout: SCOUT_SLICES, finals: FINALS_SLICES, clinic: clinicRing(),
  'hype ring': hypeRing(), 'toss ring': tossRing(), 'pep ring': pepRing(), 'pep ring +3': pepRing(neutralMods(), 3),
  'spot widened': widen(SPOT_SLICES, [0], 0.01),
  'find wheel': findWheel({ find: 26, mix: { gear: 1 } }).rows,
  'thin slice': [{ w: 0.1 }, { w: 0.05 }, { w: 4.85 }, { w: 5 }], // 3.6 deg and 1.8 deg slices: rest at the centre
};
for (const [k, r] of Object.entries(HYPE_SLICES)) TABLES['hype ' + k] = r;
for (const [k, r] of Object.entries(FIND_SLICES)) TABLES['find ' + k] = r;

function check(name, cum, end, idx) {
  const C = cum[cum.length - 1], m = (SEAM_CLEAR_DEG * C) / 360, w = cum[idx + 1] - cum[idx];
  const r = restPos(cum, end, idx), d = mod(r - cum[idx], C);
  assert.equal(sliceAt(cum, r), idx, `${name}: landed slice changed`);
  if (w < 2 * m) assert.ok(Math.abs(d - w / 2) < 1e-9, `${name}: thin slice ${idx} not at centre`);
  else assert.ok(d >= m - 1e-9 && w - d >= m - 1e-9, `${name}: rest ${((Math.min(d, w - d) * 360) / C).toFixed(3)} deg from a seam`);
  assert.ok(Math.abs(r - end) <= Math.max(m, w / 2) + 1e-9, `${name}: nudge too far`);
  if (d >= m && w - d >= m && w >= 2 * m && Math.abs(mod(end - cum[idx], C) - d) < 1e-12) assert.equal(restNudge(cum, end, idx), 0);
}

test('1000 seeded stops per ring table: rest clear of every seam, landed index unchanged', () => {
  for (const [name, ring] of Object.entries(TABLES)) {
    const cum = ringEdges(ring), C = cum[cum.length - 1], rng = makeRng('rest-' + name);
    let nudged = 0;
    for (let k = 0; k < 1000; k++) {
      const P = { W0: WHEEL_ENGINE.W0 * (0.6 + 0.4 * rng.random()), D: WHEEL_ENGINE.D };
      const phi = rng.random() * C, t = 0.35 + rng.random() * 60, e = (rng.random() * 2 - 1) * 1.5;
      const end = phi + tickAt(t, P) + e, idx = sliceAt(cum, end);
      if (restNudge(cum, end, idx) !== 0) nudged++;
      check(name, cum, end, idx);
    }
    // seam-hugging stops on every seam, both sides (the case seen on Find / Finals)
    for (let i = 0; i < cum.length - 1; i++) for (const off of [1e-9, 1e-4, 0.02, 0.05]) {
      for (const end of [cum[i] + off, cum[i + 1] - off, cum[i] + off + 3 * C, cum[i + 1] - off - 2 * C]) check(name, cum, end, sliceAt(cum, end));
    }
    assert.ok(nudged > 0 && nudged < 1000, `${name}: nudged ${nudged} of 1000`);
  }
});

test('restPos: clear rest unchanged, outside rest goes to centre the short way, bad input passes through', () => {
  const cum = ringEdges([{ w: 2 }, { w: 3 }, { w: 5 }]);
  assert.equal(restPos(cum, 3.5, 1), 3.5);
  assert.ok(Math.abs(restPos(cum, 2.0001, 1) - (2 + 10 / 120)) < 1e-12);
  assert.ok(Math.abs(restPos(cum, 4.9999, 1) - (5 - 10 / 120)) < 1e-12);
  assert.ok(Math.abs(restPos(cum, 9.9, 0) - 11) < 1e-12); // in slice 2 near the wrap, steered to slice 0: centre 1 (+10), forward 1.1
  assert.ok(Math.abs(restPos(cum, 0.1, 1) - 3.5) < 1e-12);
  assert.equal(restPos([0], 1.2, 0), 1.2);
  assert.ok(Number.isNaN(restPos(cum, NaN, 0)));
});
