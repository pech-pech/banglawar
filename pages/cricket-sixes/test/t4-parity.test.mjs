// T4 parity (wheels SPEC test 1, 2, 2b): random means and careful ratios on a small seeded n. Pure modules only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { table } from '../tools/t4-parity.mjs';

const N = 4000, SEED = 1;
const rows = Object.fromEntries(table(N, SEED).map((r) => [r.key, r]));
const BAND = { 'Find 8': [1.30, 1.50], 'Find 18': [1.30, 1.50], 'Find 26': [1.30, 1.50], 'Scout steps': [1.30, 1.41], 'Finals coin-eq': [1.30, 1.41] };

test('random means match SPEC (Find = rate, Scout 0.60, Finals 21.6)', () => {
  const tol = { 'Find 8': 0.02, 'Find 18': 0.02, 'Find 26': 0.02, 'Scout steps': 0.03, 'Finals coin-eq': 0.6 };
  for (const [k, r] of Object.entries(rows)) assert.ok(Math.abs(r.random - r.spec) <= tol[k], `${k} random ${r.random} vs ${r.spec}`);
});

test('careful ratio inside the SPEC band (+-0.1 sampling noise at n=4000)', () => {
  for (const [k, [lo, hi]] of Object.entries(BAND)) {
    const q = rows[k].careful / rows[k].spec;
    assert.ok(q >= lo - 0.1 && q <= hi + 0.1, `${k} careful ${q.toFixed(3)} outside ${lo}-${hi}`);
  }
});

test('skill ordering random < careful < good < full', () => {
  for (const [k, r] of Object.entries(rows)) assert.ok(r.random < r.careful && r.careful < r.good + 0.02 && r.good < r.full, k);
});
