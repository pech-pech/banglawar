import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetOf } from '../js/ui/golden-cal.js';
import { beat } from '../js/ui/golden-audio.js';

test('offsetOf median, whole ms', () => {
  assert.equal(offsetOf([]), 0);
  assert.equal(offsetOf([30, -10, 50, 20, 40]), 30);
  assert.equal(offsetOf([10.4, 20.2, 90, 15, 12, 11, 13, 14, 16, 17]), 15);
  assert.equal(offsetOf([-40, -20, -30]), -30);
  assert.ok(Number.isInteger(offsetOf([1.4, 2.6, 3.5])));
});

test('audio never throws without AudioContext', () => {
  assert.doesNotThrow(() => { beat.prime(); beat.tick('pre'); beat.tick('cross'); beat.hit('P'); beat.hit('G'); beat.hit('M'); });
});
