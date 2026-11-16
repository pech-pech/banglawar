// QA-LW-JOIN-A D7: a player who trained this week and then hit the cap showed twice on Nets done (result line + "Can't gain").
import test from 'node:test';
import assert from 'node:assert/strict';
import { adapt } from '../js/ui/training-view.js';

const row = (id, status) => ({ id, name: id, status, rates: {} });
test('Nets done: a trained player is not also listed as "Can\'t gain"', () => {
  const vm = { done: true, week: 1, tp: 5, rows: [row('a', 'skip'), row('b', 'skip'), row('c', 'train')],
    result: { cost: 13, lines: [{ id: 'a', name: 'a', rating: 'batPower', fromRaw: 1, toRaw: 2, word: 'Good' }] } };
  const n = adapt(vm).nets;
  assert.deepEqual(n.lines.map((l) => l.id), ['a']);
  assert.deepEqual(n.skipped.map((k) => k.id), ['b']);
});
