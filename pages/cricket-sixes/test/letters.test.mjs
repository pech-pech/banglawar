import test from 'node:test'; import assert from 'node:assert/strict';
import { STEPS, stepOfRaw, letterOfRaw, letterOfShown, letterOfStep, fillOfRaw, ticksOfRaw } from '../js/core/letters.js';
test('21 steps, F- to S+', () => { assert.equal(STEPS.length, 21); assert.equal(STEPS[0].letter, 'F-'); assert.equal(STEPS[20].letter, 'S+'); });
test('raw boundaries', () => {
  for (const s of STEPS) { assert.equal(stepOfRaw(s.rawFrom), s.step); if (s.rawFrom > 1) assert.equal(stepOfRaw(s.rawFrom - 0.01), s.step - 1); }
  assert.equal(letterOfRaw(1), 'F-'); assert.equal(letterOfRaw(29.7), 'E'); assert.equal(letterOfRaw(99), 'S+'); assert.equal(letterOfRaw(88), 'S');
});
test('raw boundaries agree with the shown scale a = 20 + 180 (r-1)/98', () => {
  for (const s of STEPS) { const a = 20 + 180 * (s.rawFrom - 1) / 98; assert.equal(letterOfShown(Math.round(a)), s.letter, s.letter); }
});
test('shown bands match potential bands', () => {
  assert.equal(letterOfShown(99).startsWith('C'), false); assert.equal(letterOfShown(100), 'C-');
  assert.equal(letterOfShown(111)[0], 'C'); assert.equal(letterOfShown(112), 'B-'); assert.equal(letterOfShown(124), 'A-'); assert.equal(letterOfShown(140), 'S-'); assert.equal(letterOfShown(200), 'S+');
});
test('letterOfStep clamps', () => { assert.equal(letterOfStep(0), 'F-'); assert.equal(letterOfStep(4), 'E-'); assert.equal(letterOfStep(99), 'S+'); });
test('fill and ticks: 4 per step', () => {
  assert.equal(ticksOfRaw(23), 0); assert.equal(fillOfRaw(23), 0);
  const seen = new Set(); for (let r = 23; r < 27; r += 0.25) seen.add(ticksOfRaw(r));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]); assert.equal(ticksOfRaw(26.99), 3);
  assert.equal(ticksOfRaw(99), 3);
});
