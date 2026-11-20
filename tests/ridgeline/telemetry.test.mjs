import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPointer, percentile, steerShares, createTelemetry, formatTelemetry } from '../../pages/ridgeline/src/telemetry.js';

test('tap vs drag classification', () => {
  assert.equal(classifyPointer(100, 3), 'tap');
  assert.equal(classifyPointer(199, 9.9), 'tap');
  assert.equal(classifyPointer(200, 3), 'drag');
  assert.equal(classifyPointer(100, 10), 'drag');
  assert.equal(classifyPointer(500, 80), 'drag');
});

test('percentiles', () => {
  const a = new Float64Array(600);
  for (let i = 0; i < 100; i++) a[i] = 100 - i; // unsorted 100..1
  assert.equal(percentile(a, 100, 5), 5);
  assert.equal(percentile(a, 100, 95), 95);
  assert.equal(percentile(a, 0, 50), null);
  assert.equal(percentile(a, 1, 95), 100);
});

test('steer shares', () => {
  const s = steerShares(1, 2, 1);
  assert.equal(s.left, 25); assert.equal(s.centre, 50); assert.equal(s.right, 25);
  assert.deepEqual(steerShares(0, 0, 0), { left: 0, centre: 0, right: 0 });
});

test('telemetry accumulates and formats', () => {
  const t = createTelemetry();
  t.reset(1000);
  t.touchDown(1500, 100, 100); t.touchUp(1600, 0.1, true);          // tap, dry release
  t.touchDown(2000, 100, 100); t.touchMove(190, 100); t.touchUp(3000, 0.5, true); // drag 90px, boosted
  t.touchIgnored(3100, true);
  for (let i = 0; i < 10; i++) t.step(0.1, i < 2 ? -1 : i < 5 ? 0 : 1, 20 + i, i === 3, i === 4 || i === 5);
  for (let i = 0; i < 700; i++) t.frame(i === 0 ? 80 : 16);
  const s = t.snapshot();
  assert.equal(s.touches, 3); assert.equal(s.taps, 1); assert.equal(s.drags, 1);
  assert.equal(s.dragMax, 90); assert.equal(s.boosted, 1); assert.equal(s.dry, 1);
  assert.equal(s.ignoredHud, 1); assert.equal(s.firstInputMs, 500);
  assert.equal(s.holdMax, 1);
  assert.equal(s.edgeHits, 1);
  assert.equal(s.speedMax, 29);
  assert.equal(s.slow, 1); assert.equal(s.longest, 80);
  assert.equal(Math.round(s.steer.left), 20); assert.equal(Math.round(s.steer.right), 50);
  const text = formatTelemetry(s, {}).join('\n');
  assert.match(text, /^  touches: 3$/m);
  assert.match(text, /^  drags: 1$/m);
});
