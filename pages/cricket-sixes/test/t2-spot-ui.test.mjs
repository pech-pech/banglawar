import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../js/ui/training-view.js', import.meta.url), 'utf8');
const tv = await import('../js/ui/training-view.js');

test('spotlight ring: Kind Floor prints x1.2 on the floor pieces, not owned = x1.0', () => {
  const plain = tv.spotRing({}), kf = tv.spotRing({ kindFloor: true });
  assert.equal(plain.filter((s) => s.label === 'x1.0').length, 7);
  assert.equal(kf.filter((s) => s.label === 'x1.2').length, 7);
  assert.equal(kf.find((s) => s.gold).label, 'x3.0');
});
test('result strip text and legend', () => {
  assert.equal(tv.spotMult({ value: 1.2 }), 'x1.2');
  assert.equal(tv.spotMult({}), '');
  assert.deepEqual(tv.spotLegend(tv.spotRing({ kindFloor: true })), [{ ch: '1.2', text: 'x1.2: the thin slice' }]);
});
test('slot: empty without a player, strip with one', () => {
  assert.equal(tv.slotSpotlight({}), '');
  assert.match(tv.slotSpotlight({ wheel: { player: { id: 1 }, kindFloor: true } }), /x1\.2/);
});
test('openSpotlightWheel: new call shape, timing retired, hooks kept', () => {
  assert.ok(!/timing: true/.test(src));
  assert.ok(src.includes("wheelId: 'spot'") && src.includes('ring = spotRing(w)') && src.includes('legend: spotLegend(ring).concat(spotKey(ring, !!w.kindFloor)), J: 1.2'));
  assert.ok(src.includes("onSpin: (stop) => dispatch('Spin'") && src.includes('stored: w.stored'));
  assert.ok(!/COAST|STOP_FROM|wheelStop/.test(src) && !src.includes('wheel plus') && !src.includes('widths: w.widths'));
  assert.ok(src.includes('The tick shows where it will land.'));
});
