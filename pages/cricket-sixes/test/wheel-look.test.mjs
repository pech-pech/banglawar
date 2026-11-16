// A2.2 look helpers: SPEC section 14 test 8 (glow is time only) and test 12 (labels, legend, no colour alone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glowOn, sliceLabel, legendRows, tierShape, aimMarker, MATERIALS } from '../js/ui/wheel-look.js';

test('8 glow is on for 3.2..3.8 s of every cycle and nothing else', () => {
  for (const t of [3.2, 3.5, 3.8]) assert.equal(glowOn(t), true, 't ' + t);
  for (const t of [0, 3.19, 3.1999, 3.8001, 3.81, 5.99]) assert.equal(glowOn(t), false, 't ' + t);
  assert.equal(glowOn.length, 1, 'time is the only input: no slice or ring argument');
  for (let k = 0; k < 5; k++) for (let ms = 0; ms < 6000; ms += 10) assert.equal(glowOn(ms / 1000), ms >= 3200 && ms <= 3800);
});

const RING = [
  { id: 0, w: 1.2, value: 3, label: 'x3.0', tier: 'top', gold: false },
  { id: 1, w: 0.4, value: 1, label: 'F', tier: 'top', gold: true },
  { id: 2, w: 0.35, value: 2, label: '+2', tier: 'top', gold: false },
  { id: 3, w: 0.4, value: 20, label: 'Medal', tier: 'mid', gold: false, legend: 'Medal' },
  { id: 4, w: 0.6, value: 1.2, label: 'x1.2', tier: 'top', gold: false },
  { id: 5, w: 0.2, value: 1, label: 'F', tier: 'mid', gold: false },
  { id: 6, w: 0.7, value: 1, label: 'Wide', tier: 'low', gold: false },
];

test('12 under-7% slices print one character or a signed number; 7% and wider print the label', () => {
  assert.equal(sliceLabel(RING[0]), 'x3.0');
  assert.equal(sliceLabel(RING[6]), 'Wide', 'w = 0.7 is not under 7%');
  assert.equal(sliceLabel(RING[1]), 'F');
  assert.equal(sliceLabel(RING[2]), '+2');
  assert.equal(sliceLabel(RING[3]), 'M');
  assert.equal(sliceLabel(RING[4]), '1.2');
  for (const r of RING.filter((q) => q.w < 0.7)) {
    const s = sliceLabel(r);
    assert.ok(Array.from(s).length === 1 || /^[+-]?\d+(\.\d+)?$/.test(s), 'one char or signed number: ' + s);
  }
  assert.equal(sliceLabel({ w: 0.3, label: '', value: 4 }), '4');
});

test('12 legend lists each under-7% character once; none when every slice is wide', () => {
  const rows = legendRows(RING);
  assert.deepEqual(rows.map((r) => r.ch), ['F', '+2', 'M', '1.2']);
  assert.ok(rows.every((r) => r.text && typeof r.text === 'string'));
  assert.deepEqual(legendRows([RING[0], RING[6]]), []);
  assert.deepEqual(legendRows(null), []);
});

test('12 no slice relies on colour alone: tier differs by shape or by pale sand, low is not top', () => {
  const top = tierShape('top'), mid = tierShape('mid'), low = tierShape('low');
  assert.equal(top.shape, 'triangle-up');
  assert.equal(mid.shape, 'dot'); assert.equal(low.shape, 'dot');
  assert.notDeepEqual(low.colour, mid.colour, 'low is paler sand than mid');
  assert.ok(low.colour.every((c, i) => c >= mid.colour[i]), 'low sand is at least as pale as mid');
  assert.ok(low.colour[0] > 230 && low.colour[1] > 225, 'pale sand, not rose');
  assert.ok(!(low.colour[0] > low.colour[1] + 40), 'never rose');
  assert.equal(tierShape('nope').tier, 'mid');
});

test('aim marker spec is a shape plus the word AIM at 12 px', () => {
  const a = aimMarker();
  assert.equal(a.text, 'AIM'); assert.ok(a.fontPx >= 12); assert.equal(a.points.length, 3);
  assert.ok(Object.isFrozen(a));
});

test('existing exports still work', () => assert.equal(MATERIALS.length, 7));
