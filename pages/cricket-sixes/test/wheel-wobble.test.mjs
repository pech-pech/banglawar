import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/core/rng.js';
import { wobbleKey, wheelWobble } from '../js/core/wheel-wobble.js';
import { seasonOf, weekOf } from '../js/core/spin-keys.js';

const S = { seed: 'abc' };

test('wobbleKey follows the contract string', () => {
  assert.equal(wobbleKey(S, 'hype', 2, 1), `abc|wob|${seasonOf(S)}|${weekOf(S)}|hype|2|1`);
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

test('wobble does not move any other rng stream', () => {
  const a = makeRng('ball'), b = makeRng('ball');
  const first = [a.random(), a.random()];
  wheelWobble(wobbleKey(S, 'hype', 0, 0), 1.2);
  const rest = [a.random(), a.random()];
  assert.deepEqual([...first, ...rest], [b.random(), b.random(), b.random(), b.random()]);
});
