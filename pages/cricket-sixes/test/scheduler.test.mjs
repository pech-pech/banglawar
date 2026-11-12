import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSchedule } from '../js/core/season.js';
import { makeRng } from '../js/core/rng.js';

const IDS = Array.from({ length: 10 }, (_, i) => `c${i}`);
const sched = (seed, ids = IDS) => makeSchedule(ids, makeRng(seed));
const key = (p) => [p.a, p.b].sort().join('-');

test('9 rounds of 5 pairs; every club plays once in each round', () => {
  const s = sched('s1');
  assert.equal(s.length, 9);
  for (const round of s) {
    assert.equal(round.length, 5);
    const seen = round.flatMap((p) => [p.a, p.b]).sort();
    assert.deepEqual(seen, IDS.slice().sort());
  }
});

test('c0 meets each of the 9 other clubs exactly once, always as home (a)', () => {
  const s = sched('s2');
  const opp = s.map((r) => {
    const mine = r.filter((p) => p.a === 'c0' || p.b === 'c0');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].a, 'c0', 'M is always home');
    return mine[0].b;
  });
  assert.deepEqual(opp.slice().sort(), IDS.slice(1).sort());
});

test('every pair of clubs meets exactly once across the season (45 matches), no self-fixture', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const all = sched(seed).flat();
    assert.equal(all.length, 45);
    assert.ok(all.every((p) => p.a !== p.b));
    assert.equal(new Set(all.map(key)).size, 45);
  }
});

test("M's pair is listed first in each round", () => {
  for (const r of sched('s3')) assert.equal(r[0].a, 'c0');
});

test('same seed gives same schedule; different seeds differ somewhere', () => {
  assert.deepEqual(sched('x'), sched('x'));
  const base = JSON.stringify(sched('x'));
  assert.ok(['y', 'z', 'w', 'v'].some((s) => JSON.stringify(sched(s)) !== base));
});

test('pure: input array is not mutated (and may be frozen)', () => {
  const ids = Object.freeze(IDS.slice());
  const before = JSON.stringify(ids);
  sched('p', ids);
  assert.equal(JSON.stringify(ids), before);
});
