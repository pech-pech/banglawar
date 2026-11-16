// Hub banner (H2): drawBanner is null-safe without a window; crowdCells is pure and deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawBanner, crowdCells } from '../js/ui/ground-canvas.js';

test('drawBanner returns null without window/SPR and never throws', () => {
  assert.equal(drawBanner({}, { stadium: 1, levels: {}, gate: { pct: 0, hidden: true } }), null);
  assert.equal(drawBanner(null), null);
  assert.equal(drawBanner(undefined, undefined), null);
});

test('crowdCells is deterministic, monotone in pct, empty at 0', () => {
  assert.deepEqual(crowdCells(3, 4, 30, 8, 40), crowdCells(3, 4, 30, 8, 40));
  assert.equal(crowdCells(0, 0, 30, 8, 0).length, 0);
  const a = crowdCells(0, 0, 30, 8, 30), b = crowdCells(0, 0, 30, 8, 70), full = crowdCells(0, 0, 30, 8, 100);
  assert.ok(a.length < b.length && b.length <= full.length);
  const keys = new Set(b.map((c) => c[0] + ',' + c[1]));
  assert.ok(a.every((c) => keys.has(c[0] + ',' + c[1])));
});
