import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../../pages/ridgeline/src/config.js';
import * as E from '../../pages/ridgeline/src/endless.js';

const cfg = { ...DEFAULTS };
const LAP = 1200 + 1500 * 3 + 1800;

test('zone boundaries and lap wrap', () => {
  assert.equal(LAP, 7500);
  const edges = [[0, 0, 0], [1199.9, 0, 0], [1200, 1, 0], [2699, 1, 0], [2700, 2, 0], [4200, 3, 0], [5700, 4, 0], [7499, 4, 0], [7500, 0, 1], [7500 + 1200, 1, 1], [15000, 0, 2]];
  for (const [d, zone, lap] of edges) {
    const z = E.zoneAt(d, cfg);
    assert.equal(z.zone, zone, `zone at ${d}`);
    assert.equal(z.lap, lap, `lap at ${d}`);
    assert.equal(z.name, E.ZONE_NAMES[zone]);
    assert.ok(z.start <= d && d < z.end);
    assert.ok(Math.abs(z.local - (d - z.start)) < 1e-9);
  }
  assert.equal(E.zoneAt(1200, cfg).start, 1200);
  assert.equal(E.zoneAt(1200, cfg).end, 2700);
});

test('zone weights positive, lap mix blends', () => {
  for (let d = 0; d < 30000; d += 250) {
    const w = E.zoneWeights(d, cfg);
    assert.ok(Object.values(w).reduce((a, b) => a + b, 0) > 0);
    for (const v of Object.values(w)) assert.ok(v >= 0);
  }
  const w0 = E.zoneWeights(100, cfg), w1 = E.zoneWeights(7500 + 100, cfg);
  assert.equal(w0.roller, 35);
  assert.equal(w0.gap, 0);
  assert.ok(w1.roller < 35 && w1.gap > 0, 'lap 1 blends');
  assert.ok(Math.abs(w1.roller - (35 * 0.75 + (35 + 10 + 5) / 5 * 0.25)) < 1e-9);
  const w4 = E.zoneWeights(4 * 7500 + 100, cfg); // mix capped at 1 -> average of all five
  assert.ok(Math.abs(w4.gap - (25 + 12) / 5) < 1e-9);
  assert.ok(Math.abs(w4.roller - w4.roller) < 1e-9 && w4.roller === (35 + 10 + 5) / 5);
});

test('zone modifiers', () => {
  const mids = [600, 1950, 3450, 4950, 6600];
  assert.deepEqual(mids.map(d => E.zoneRockX(d, cfg)), [0.9, 1.0, 1.05, 0.95, 1.15]);
  assert.deepEqual(mids.map(d => E.zoneWind(d, cfg)), [0, 2, 0, 0, 1]);
  assert.deepEqual(mids.map(d => E.zoneSand(d, cfg)), [0, 0, 0, 0.04, 0.02]);
});

test('difficulty functions are monotone', () => {
  let p = [E.pitchTarget(0, cfg), E.halfWidthAt(0, cfg), E.rockDensityAt(0, cfg), E.baseSpeed(0, cfg)];
  for (let d = 50; d <= 40000; d += 50) {
    const n = [E.pitchTarget(d, cfg), E.halfWidthAt(d, cfg), E.rockDensityAt(d, cfg), E.baseSpeed(d, cfg)];
    assert.ok(n[0] <= p[0] + 1e-12, 'pitch falls');
    assert.ok(n[1] <= p[1] + 1e-12, 'half width falls');
    assert.ok(n[2] >= p[2] - 1e-12, 'rocks rise');
    assert.ok(n[3] >= p[3] - 1e-12, 'speed rises');
    p = n;
  }
  assert.ok(Math.abs(E.pitchTarget(0, cfg) - 100) < 1e-9);
  assert.ok(Math.abs(E.halfWidthAt(0, cfg) - 14) < 1e-9);
  assert.ok(Math.abs(E.rockDensityAt(0, cfg) - 0.3) < 1e-9);
});

test('gate spacing clamps and rises', () => {
  assert.ok(Math.abs(E.gateSpacingAt(0, cfg) - 52.8) < 0.1);
  for (let d = 0; d < 40000; d += 100) {
    const g = E.gateSpacingAt(d, cfg);
    assert.ok(g >= cfg.gateMin && g <= cfg.gateMax);
  }
  assert.equal(E.gateSpacingAt(40000, cfg), cfg.gateMax);
});

test('baseSpeed matches design table', () => {
  assert.ok(Math.abs(E.baseSpeed(0, cfg) - 22) < 0.05);
  assert.ok(Math.abs(E.baseSpeed(1000, cfg) - 24.9) < 0.1);
  assert.ok(Math.abs(E.baseSpeed(2500, cfg) - 28.6) < 0.2);
  assert.ok(Math.abs(E.baseSpeed(5000, cfg) - 33.2) < 0.2);
  assert.ok(E.baseSpeed(1e6, cfg) <= cfg.vBase0 + cfg.vBaseGain + cfg.lapSpeedMax + 1e-9);
});

test('deterministic', () => {
  for (const d of [0, 777, 12345.6, 99999]) {
    assert.deepEqual(E.zoneWeights(d, cfg), E.zoneWeights(d, { ...cfg }));
    assert.equal(E.baseSpeed(d, cfg), E.baseSpeed(d, { ...cfg }));
    assert.deepEqual(E.zoneAt(d, cfg), E.zoneAt(d, { ...cfg }));
  }
});
