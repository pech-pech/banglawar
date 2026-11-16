import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekItems, chipWord } from '../js/ui/week-sheet.js';

const full = { notice: { line: 'Squad is 8.' }, freePick: { pending: true }, trial: { player: { name: 'Ravi' } }, activities: { picked: false }, unlock: { name: 'Pace', left: 2 } };

test('weekItems order', () => {
  assert.deepEqual(weekItems(full).map((i) => i.key), ['free', 'trial', 'activity', 'unlock', 'notice']);
});
test('weekItems empty', () => {
  assert.deepEqual(weekItems({}), []);
  assert.deepEqual(weekItems({ notice: null, freePick: { pending: false }, trial: null, activities: { picked: true }, unlock: null }), []);
  assert.deepEqual(weekItems(), []);
});
test('chipWord', () => {
  assert.equal(chipWord([]), null);
  assert.equal(chipWord(weekItems({ unlock: { name: 'A', left: 1 } })), 'This week');
  assert.equal(chipWord(weekItems({ freePick: { pending: true } })), 'Free facility: pick one');
  assert.equal(chipWord(weekItems(full)), 'Free facility: pick one · 5');
  assert.equal(chipWord(weekItems({ unlock: { name: 'A', left: 1 }, trial: { coach: { name: 'C' } } })), 'Trial coach: C · 2');
});
