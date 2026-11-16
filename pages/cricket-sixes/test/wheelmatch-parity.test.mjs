// Wheel match parity smoke (SIMCHECK): the parity tool plays whole seeded wheel matches through the real store commands.
// Small and fast; the win-rate table itself is tools/wheelmatch-parity.mjs (n 300+), not a unit test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { makeRng } from '../js/core/rng.js';
import { WHEEL_MATCH as WMX } from '../js/data/wheelmatch.js';
import { landingPos, segAt } from '../js/core/wheelmatch.js';
import { runCell, chooseStop } from '../tools/wheelmatch-parity.mjs';

const keep = { ...FLAGS };
const withFlags = (fn) => { try { return fn(); } finally { Object.assign(FLAGS, keep); } };

test('careful tap with no error lands on the aimed slice (tool physics = core landingPos on the pulse, no coast)', () => {
  // wheels SPEC 2b/2c: careful aim = slice centre, arrival nearest 3.5 s of the cycle, solved on the pulse tick (tickAt); no COAST, no STOP_FROM.
  const P = { W0: WMX.W0, TAU: WMX.TAU, D: WMX.D, J: 0 };
  const segs = [0.5, 1, 1.5, 2, 2, 3].map((w, i, a) => ({ start: a.slice(0, i).reduce((x, y) => x + y, 0), width: w, value: i === 3 ? 9 : i }));
  const rng = makeRng('parity-test');
  // the tap time solves the honest landing exactly; only the tap sd (0.070 s) moves it, so a 'good' tap lands on slice 3 (2 units) most spins
  let hit = 0;
  for (let i = 0; i < 200; i++) {
    const st = chooseStop('good', segs, P, rng);
    assert.ok(Number.isFinite(st.t) && st.t >= WMX.STOP_GUARD_S && st.t < WMX.PULSE_PERIOD, `careful tap in cycle 1 after the guard: ${st.t}`);
    if (segAt(segs, landingPos(P, { t: st.t, phi: st.phi, e: 0 })) === 3) hit++;
  }
  assert.ok(hit > 150, `good tapper hit the best slice ${hit}/200`);
  // a random tapper taps anywhere after the guard (no 6 s coast cap)
  for (let i = 0; i < 200; i++) { const st = chooseStop('random', segs, P, rng); assert.ok(Number.isFinite(st.t) && st.t >= WMX.STOP_GUARD_S); }
});

test('wheel match plays to a result through WheelOver, rival boosted, deterministic', () => withFlags(() => {
  const a = runCell({ variant: 'wheel', who: 'avg', seed: 'pt', k0: 0, k1: 1 });
  const b = runCell({ variant: 'wheel', who: 'avg', seed: 'pt', k0: 0, k1: 1 });
  assert.equal(a.n, 1); assert.equal(a.boostBad, 0);
  assert.ok(a.spins >= 2 && a.spins <= 20);
  assert.deepEqual({ w: a.win, o: a.ours, r: a.rival }, { w: b.win, o: b.ours, r: b.rival });
}));

test('classic match through BowlOver: rival not boosted', () => withFlags(() => {
  const c = runCell({ variant: 'classic', who: 'classic', seed: 'pt', k0: 0, k1: 1 });
  assert.equal(c.n, 1); assert.equal(c.boostBad, 0); assert.equal(c.spins, 0);
}));
