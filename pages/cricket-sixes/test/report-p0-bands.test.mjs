import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANDS, inRange, LUCK_LABEL } from '../js/report/bands.js';

const SRC = readFileSync(new URL('../js/report/bands.js', import.meta.url), 'utf8');

test('P0-15 bands: exported shape is stable', () => {
  assert.deepEqual(Object.keys(BANDS).sort(), ['fit', 'luck', 'luckBy', 'matchup', 'rpo', 'runs', 'win']);
  for (const k of ['runs.us', 'runs.them', 'luck', 'luckBy.won', 'luckBy.lost']) {
    const [lo, hi] = k.split('.').reduce((o, p) => o[p], BANDS);
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi, k);
  }
  assert.equal(BANDS.matchup.skilled.length, 3); assert.equal(BANDS.matchup.random.length, 3);
  assert.equal(inRange(0, BANDS.luck), 'ok'); assert.equal(inRange(-99, BANDS.luck), 'below'); assert.equal(inRange(99, BANDS.luck), 'above'); assert.equal(inRange(null, BANDS.luck), 'no band');
});

test('P0-15 bands: Good/OK/Poor shares sum to about 100', () => {
  for (const r of [BANDS.matchup.skilled, BANDS.matchup.random]) assert.ok(Math.abs(r.reduce((a, b) => a + b, 0) - 100) <= 1);
});

test('P0-15 bands: luck is labelled [pre-P14] and the sim is marked r7', () => {
  assert.equal(LUCK_LABEL, '[pre-P14]');
  const luckLines = SRC.split('\n').filter((l) => /^\s*luck(By)?:/.test(l));
  assert.equal(luckLines.length, 2);
  for (const l of luckLines) assert.ok(l.includes('[pre-P14]') && l.includes('[sim r7]'), l);
  for (const k of ['runs', 'fit', 'matchup', 'rpo']) assert.ok(new RegExp(`^\\s*${k}:.*\\[sim r7\\]`, 'm').test(SRC), k);
});

test('P0-15 bands: luck bands are ordered sensibly (wins above losses, mixed band spans both)', () => {
  assert.ok(BANDS.luckBy.won[1] > BANDS.luckBy.lost[1] && BANDS.luckBy.won[0] > BANDS.luckBy.lost[0]);
  assert.ok(BANDS.luck[0] <= BANDS.luckBy.lost[0] + 6 && BANDS.luck[1] >= BANDS.luckBy.won[1] - 6);
});
