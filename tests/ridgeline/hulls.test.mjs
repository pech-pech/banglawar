import test from 'node:test';
import assert from 'node:assert/strict';
import { HULLS, HULL_IDS, KEYS, hullCfg, unlockedFor } from '../../pages/ridgeline/src/hulls.js';
import { DEFAULTS } from '../../pages/ridgeline/src/config.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);

test('table has five lowercase hulls with names and flavour', () => {
  assert.deepEqual(HULL_IDS, ['wren', 'kite', 'anvil', 'barge', 'spindle']);
  for (const id of HULL_IDS) { assert.equal(HULLS[id].id, id); assert.ok(HULLS[id].name && HULLS[id].flavour); }
  assert.equal(Object.keys(KEYS).length, 32);
});
test('wren overlay equals base', () => {
  const o = hullCfg(DEFAULTS, 'wren');
  for (const k of ['launchRatio', 'slamWobble', 'airSteerMul', 'diveGravityMul', 'gradeClean', 'steerAccel', 'landKickDive']) close(o[k], DEFAULTS[k]);
  assert.equal(o.hullMass, 1);
});
test('multipliers', () => {
  const o = hullCfg(DEFAULTS, 'anvil');
  close(o.launchRatio, DEFAULTS.launchRatio * Math.sqrt(1.25));
  close(o.slamWobble, DEFAULTS.slamWobble * 1.2);
  close(o.airSteerMul, DEFAULTS.airSteerMul * 0.8);
  close(o.diveGravityMul, DEFAULTS.diveGravityMul * 1.15);
  close(o.gradeClean, DEFAULTS.gradeClean * 1.2);
  close(o.gradeRough, DEFAULTS.gradeRough * 1.2);
  close(o.gradeSlam, DEFAULTS.gradeSlam * 1.2);
  close(o.steerAccel, DEFAULTS.steerAccel * 0.96);
  assert.equal(o.hullMass, 1.4);
  const s = hullCfg(DEFAULTS, 'spindle');
  close(s.landKickDive, DEFAULTS.landKickDive * 1.25);
  close(s.gradeClean, DEFAULTS.gradeClean * 0.85);
});
test('base not mutated, live key override, unknown id is wren', () => {
  const base = { ...DEFAULTS, 'hull.kite.airSteer': 1.5 };
  const o = hullCfg(base, 'kite');
  close(o.airSteerMul, DEFAULTS.airSteerMul * 1.5);
  assert.equal(base.airSteerMul, DEFAULTS.airSteerMul);
  assert.equal(hullCfg(DEFAULTS, 'nope').hull, 'wren');
});
test('unlockedFor', () => {
  assert.deepEqual(unlockedFor(0), ['wren']);
  assert.deepEqual(unlockedFor(2799), ['wren']);
  assert.deepEqual(unlockedFor(2800), ['wren', 'kite']);
  assert.deepEqual(unlockedFor(8500), ['wren', 'kite', 'anvil', 'barge']);
  assert.deepEqual(unlockedFor(13500), HULL_IDS);
  assert.deepEqual(unlockedFor(3000, { markDist4: 3500 }), ['wren']);
});
