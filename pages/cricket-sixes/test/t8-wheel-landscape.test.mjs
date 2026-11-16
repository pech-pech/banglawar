import test from 'node:test';
import assert from 'node:assert/strict';
import { isLandscapeWide, wheelCap } from '../js/ui/wheel-view.js';
// GRID-RULES G0: landscape inner = width >= 760, height >= 500, landscape. Portrait caps (340 / 420) must not change.
test('landscape wide rule matches the G0 truth table', () => {
  for (const [w, h] of [[816, 568], [882, 704]]) assert.equal(isLandscapeWide(w, h), true);
  for (const [w, h] of [[344, 882], [475, 638], [624, 912], [704, 783], [704, 823], [882, 344]]) assert.equal(isLandscapeWide(w, h), false);
});
test('wheel cap: 560 landscape, 420 wide portrait, 340 narrow', () => {
  assert.equal(wheelCap(816, 568, true), 560);
  assert.equal(wheelCap(704, 783, true), 420);
  assert.equal(wheelCap(624, 912, true), 420);
  assert.equal(wheelCap(475, 638, false), 340);
  assert.equal(wheelCap(344, 882, false), 340);
});
import { scoutNameCuts } from '../js/ui/wheel-look.js';
test('scout cuts: wide screens may start from the whole name, narrow keep the 6-letter cap', () => {
  assert.equal(scoutNameCuts('Banerjee', 3, 0)[0].endsWith('..'), true);
  assert.equal(scoutNameCuts('Banerjee', 3, 0, 99)[0], 'Banerjee');
  assert.equal(scoutNameCuts('Banerjee', 3, 0, 99).every((x) => Array.from(x).length >= 3), true);
});
