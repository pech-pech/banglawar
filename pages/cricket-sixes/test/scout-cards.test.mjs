import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScoutCards, SCOUT_CENTRE_LETTER } from '../js/core/scout-cards.js';
import { SCOUT_SLICES as S } from '../js/data/wheels/scout.js';
import { letterOfStep } from '../js/core/letters.js';

test('same seed gives the same cards; other seed differs', () => {
  assert.deepEqual(makeScoutCards('abc', 2, 3), makeScoutCards('abc', 2, 3));
  assert.notDeepEqual(makeScoutCards('abc', 2, 3), makeScoutCards('abd', 2, 3));
});
test('10 well-formed cards', () => {
  const c = makeScoutCards('abc', 1, 1);
  assert.equal(c.length, 10);
  for (const x of c) { assert.ok(x.grade && x.surname); assert.ok(['bat', 'bowl', 'bal'].includes(x.focus)); }
});
test('grades: centre letter per league, +1/+2 steps; even slices are the centre', () => {
  SCOUT_CENTRE_LETTER.forEach((letter, i) => {
    const c = makeScoutCards('s', 1, i + 1);
    assert.equal(c[1].grade, letter);
    assert.equal(c[0].grade !== letter, true);
    assert.equal(new Set([1, 3, 5, 7, 9].map((k) => c[k].grade)).size, 1);
  });
  assert.equal(letterOfStep(5), 'E'); assert.equal(letterOfStep(7), 'D-'); assert.equal(letterOfStep(12), 'C+');
  assert.equal(letterOfStep(14), 'B'); assert.equal(letterOfStep(18), 'A+');
});
test('random mean over cards 0.60 steps above centre; no equal neighbour grades incl. wrap', () => {
  const mean = S.reduce((a, s) => a + s.w * s.value, 0) / 10;
  assert.ok(Math.abs(mean - 0.6) <= 0.003);
  for (let L = 1; L <= 5; L++) {
    const c = makeScoutCards('k', 4, L);
    for (let i = 0; i < 10; i++) assert.notEqual(c[i].grade, c[(i + 1) % 10].grade);
  }
});
