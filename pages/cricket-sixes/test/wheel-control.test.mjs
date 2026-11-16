// A2.3 Control values (CONTRACT-A sec 2, SPEC 2a/2b/2g): Slow W0 x (1 - 0.15 x rank), Steady J x 0.85^rank, Guide tap sd (sim only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlPhys, controlRanks, CONTROL, metaWheel, effective } from '../js/core/wheelmeta.js';
import { WHEEL_ENGINE } from '../js/data/wheel-engine.js';
import { FLAGS } from '../js/data/flags.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test('no ranks = the engine itself (W0 36, J 1.2, sd 0.110)', () => {
  assert.deepEqual(controlPhys(), { W0: WHEEL_ENGINE.W0, J: WHEEL_ENGINE.J, SD: 0.11 });
  assert.deepEqual(controlPhys({}), controlPhys());
  assert.deepEqual(controlPhys(null), controlPhys());
});

test('Slow: W0 x (1 - 0.15 x rank), 0.55 at 3 ranks', () => {
  [1, 0.85, 0.7, 0.55].forEach((m, r) => near(controlPhys({ slow: r }).W0, 36 * m));
  near(controlPhys({ slow: 3 }).W0 / WHEEL_ENGINE.W0, 0.55);
  near(controlPhys({ c_slow: 3 }).W0, 19.8);
  assert.equal(controlPhys({ slow: 3 }).J, 1.2, 'Slow leaves J alone');
});

test('Steady: J x 0.85^rank, 0.7225 at 2 ranks (not the old 0.7)', () => {
  near(controlPhys({ steady: 1 }).J, 1.2 * 0.85);
  near(controlPhys({ steady: 2 }).J / 1.2, 0.7225);
  near(controlPhys({ c_steady: 2 }).J, 0.867);
  assert.equal(controlPhys({ steady: 2 }).W0, 36, 'Steady leaves W0 alone');
});

test('per-wheel J override: Find 1.5, Steady scales it', () => {
  assert.equal(controlPhys({}, WHEEL_ENGINE, 1.5).J, 1.5);
  near(controlPhys({ steady: 2 }, WHEEL_ENGINE, 1.5).J, 1.5 * 0.7225);
  near(controlPhys({ slow: 3, steady: 2 }, WHEEL_ENGINE, 1.5).W0, 19.8);
});

test('Guide: tap sd 0.110 -> 0.080 (sim only), W0 and J unchanged', () => {
  assert.deepEqual(controlPhys({ guide: 1 }), { W0: 36, J: 1.2, SD: 0.08 });
  assert.equal(controlPhys({ guide: true }).SD, CONTROL.SD_GUIDE);
  assert.equal(controlPhys({ guide: 0 }).SD, CONTROL.SD_AVG);
  near(controlPhys({ guide: 1 }, { W0: 24, J: 0.6, SD: 0.07 }).SD, 0.07 * 0.08 / 0.11, 1e-12);
});

test('full Control = the sim row (Slow x0.55, Steady x0.7225, Guide sd 0.080)', () => {
  const p = controlPhys({ slow: 3, steady: 2, guide: 1 });
  near(p.W0, 36 * 0.55); near(p.J, 1.2 * 0.7225); assert.equal(p.SD, 0.08);
});

test('ranks clamp to 0..max_rank; junk is 0', () => {
  assert.deepEqual(controlPhys({ slow: 9, steady: 9 }), controlPhys({ slow: 3, steady: 2 }));
  assert.deepEqual(controlPhys({ slow: -2, steady: 'x' }), controlPhys());
  near(controlPhys({ slow: 1.9 }).W0, 36 * 0.85);
});

test('a custom base is used and never mutated; the engine stays frozen', () => {
  const base = Object.freeze({ W0: 24, J: 0.6 });
  const p = controlPhys({ slow: 3, steady: 2 }, base);
  near(p.W0, 13.2); near(p.J, 0.6 * 0.7225); assert.equal(p.SD, 0.11);
  assert.ok(Object.isFrozen(WHEEL_ENGINE)); assert.equal(WHEEL_ENGINE.W0, 36); assert.equal(WHEEL_ENGINE.J, 1.2);
});

test('controlRanks reads owned ranks; flag off = all 0', () => {
  const s = { wheelMeta: { owned: { c_slow: 2, c_steady: 1, c_guide: 1 } } };
  assert.deepEqual(controlRanks(s), { slow: 0, steady: 0, guide: 0 });
  const was = FLAGS.wheelMeta; /** @type {any} */ (FLAGS).wheelMeta = true;
  try {
    assert.deepEqual(controlRanks(s), { slow: 2, steady: 1, guide: 1 });
    assert.deepEqual(controlRanks({}), { slow: 0, steady: 0, guide: 0 });
    near(controlPhys(controlRanks(s)).W0, 36 * 0.7);
  } finally { /** @type {any} */ (FLAGS).wheelMeta = was; }
});

test('metaWheel phys = the engine after Control (T2 review: was W0 24 / J 0.6); effective multipliers = controlPhys', () => {
  const was = FLAGS.wheelMeta; /** @type {any} */ (FLAGS).wheelMeta = true;
  try {
    const s = { wheelMeta: { owned: { c_slow: 3, c_steady: 2, c_guide: 1 } } };
    const E = effective(s).spot; near(E.w0Mult, 0.55); near(E.jMult, 0.7225); assert.equal(E.guide, true);
    const w = metaWheel({ slices: [1, 2, 3, 4, 5, 6], jackpotIndex: 0 }, 'spot', s);
    assert.deepEqual(w.phys, { ...controlPhys(controlRanks(s), WHEEL_ENGINE, WHEEL_ENGINE.J), D: WHEEL_ENGINE.D });
    near(w.phys.W0, 36 * 0.55); near(w.phys.J, 1.2 * 0.7225); assert.equal(w.phys.SD, 0.08); assert.equal(w.phys.D, 2);
    const n = metaWheel({ slices: [1, 2, 3], jackpotIndex: 0 }, 'course', {}); assert.deepEqual(n.phys, { W0: 36, J: 1.2, SD: 0.11, D: 2 });
  } finally { /** @type {any} */ (FLAGS).wheelMeta = was; }
});
