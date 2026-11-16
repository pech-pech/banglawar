import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/core/rng.js';
import { wobbleKey, wheelWobble } from '../js/core/wheel-wobble.js';

const S = { seed: 'abc' };

// First draws of makeRng(key).random(), recorded from the seeded sfc32 generator (hand-pinned literals, not recomputed here).
const DRAW_R1 = 0.16158632608130574, DRAW_R0 = 0.68172313482500613;
const STATE = { seed: 'abc', season: { n: 3 }, training: { week: 7 } };

test('wobbleKey follows the contract string literally (season 3, week 7)', () => {
  assert.equal(wobbleKey(STATE, 'hype', 2, 1), 'abc|wob|3|7|hype|2|1');
  assert.equal(wobbleKey(S, 'hype', 2, 1), 'abc|wob|1|0|hype|2|1'); // defaults: season 1, week 0
});

test('known key gives the exact value of a hand-computed makeRng draw', () => {
  const k = 'abc|wob|3|7|hype|2|1';
  assert.equal(makeRng(k).random(), DRAW_R1);
  assert.equal(wheelWobble(wobbleKey(STATE, 'hype', 2, 1), 1.2), (DRAW_R1 * 2 - 1) * 1.2);
  assert.ok(Math.abs(wheelWobble(k, 1.2) - -0.81219282) < 1e-7); // (0.16158632 * 2 - 1) * 1.2 by hand
  assert.equal(wheelWobble(wobbleKey(STATE, 'hype', 2, 0), 1.5), (DRAW_R0 * 2 - 1) * 1.5);
  assert.ok(Math.abs(wheelWobble(wobbleKey(STATE, 'hype', 2, 0), 1.5) - 0.54516940) < 1e-7);
});

test('respin draws independently: respin 1 is the same value whether or not respin 0 was drawn first', () => {
  const k0 = wobbleKey(STATE, 'hype', 2, 0), k1 = wobbleKey(STATE, 'hype', 2, 1);
  const alone = wheelWobble(k1, 1.2);
  const first = wheelWobble(k0, 1.2), after = wheelWobble(k1, 1.2);
  assert.equal(after, alone);
  assert.notEqual(first, alone);
  assert.equal(wheelWobble(k0, 1.2), first); // and drawing respin 1 did not advance respin 0
  // across many spins the two streams are not the same sequence (not just shifted or copied)
  let same = 0;
  for (let i = 0; i < 500; i++) if (wheelWobble(wobbleKey(STATE, 'hype', i, 0), 1) === wheelWobble(wobbleKey(STATE, 'hype', i, 1), 1)) same++;
  assert.equal(same, 0);
});

test('same key same value; different parts differ', () => {
  const k = wobbleKey(S, 'hype', 0, 0);
  const v = wheelWobble(k, 1.2);
  for (let i = 0; i < 1000; i++) assert.equal(wheelWobble(k, 1.2), v);
  assert.notEqual(wheelWobble(wobbleKey(S, 'hype', 0, 1), 1.2), v);
  assert.notEqual(wheelWobble(wobbleKey(S, 'hype', 1, 0), 1.2), v);
  assert.notEqual(wheelWobble(wobbleKey(S, 'scout', 0, 0), 1.2), v);
});

test('range within [-J, J] and J=0 gives 0', () => {
  for (const J of [1.2, 1.5, 1.2 * 0.7225]) {
    for (let i = 0; i < 2000; i++) {
      const w = wheelWobble(wobbleKey(S, 'w', i, 0), J);
      assert.ok(w >= -J && w <= J);
    }
  }
  for (let i = 0; i < 200; i++) assert.ok(wheelWobble(wobbleKey(S, "w", i, 0), 0) === 0);
});

test('roughly uniform over 2000 keys', () => {
  const J = 1.2, bins = new Array(10).fill(0);
  let sum = 0;
  for (let i = 0; i < 2000; i++) {
    const w = wheelWobble(wobbleKey(S, 'w', i, 0), J);
    sum += w;
    bins[Math.min(9, Math.floor(((w + J) / (2 * J)) * 10))]++;
  }
  assert.ok(Math.abs(sum / 2000) < 0.08);
  for (const b of bins) assert.ok(b > 140 && b < 260, `bin ${b}`);
});

test('wobble is a pure function of its key: evaluation order never changes a value', () => {
  const keys = Array.from({ length: 50 }, (_, i) => wobbleKey(STATE, ['hype', 'spot', 'toss'][i % 3], i, i % 2));
  const fwd = keys.map((k) => wheelWobble(k, 1.2));
  const rev = keys.slice().reverse().map((k) => wheelWobble(k, 1.2)).reverse();
  assert.deepEqual(fwd, rev);
  // it never reads the ball seed stream: makeRng('abc') (same seed text, no wob suffix) is a different stream
  assert.notEqual(makeRng('abc').random(), makeRng('abc|wob|3|7|hype|2|1').random());
});
