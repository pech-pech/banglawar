// A2.2 look helpers: SPEC section 14 test 8 (glow is time only) and test 12 (labels, legend, no colour alone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glowOn, sliceLabel, legendRows, tierShape, aimMarker, MATERIALS, tierMark, labelLines, radialFit, radialTurn, legendWith, legendShape, cardOf, MARK_MIN_RAD, sliceWheelSvg } from '../js/ui/wheel-look.js';

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

test('aim marker spec is a shape plus the word AIM at 14 px', () => {
  const a = aimMarker();
  assert.equal(a.text, 'AIM'); assert.ok(a.fontPx >= 14); assert.equal(a.points.length, 3);
  assert.ok(Object.isFrozen(a));
});

test('existing exports still work', () => assert.equal(MATERIALS.length, 7));

test('FL "+2 steps" prints "+2"; words print the first letter; x1.2 prints 1.2', () => {
  assert.equal(sliceLabel({ w: 0.3, label: '+2 steps' }), '+2');
  assert.equal(sliceLabel({ w: 0.3, label: 'x1.2' }), '1.2');
  assert.equal(sliceLabel({ w: 0.3, label: 'Fast' }), 'F');
  assert.equal(sliceLabel({ w: 0.3, label: 'Xtra' }), 'X');
});

test('FL legend keeps different slices sharing a letter apart, merges identical ones', () => {
  const rows = legendRows([
    { w: 0.3, label: 'Fast', legend: 'Fast ball' }, { w: 0.3, label: 'Free', legend: 'Free hit' },
    { w: 0.3, label: 'Fast', legend: 'Fast ball' }, { w: 0.3, label: '+2 steps' },
  ]);
  assert.deepEqual(rows.map((r) => [r.ch, r.text]), [['F', 'Fast ball'], ['F', 'Free hit'], ['+2', '+2 steps']]);
});

// ---- QA fixes: radial labels, tier marks, legend rows (T3 QA D4/D5, T4 QA 1-3, T2 QA) ----
const fake = (lines, f) => ({ w: Math.max(...lines.map((l) => l.length)) * f * 0.6, h: lines.length * Math.round(f * 1.12) }); // ~0.6 em per letter

test('D5 tier mark: gold and top = up-triangle, mid and low = dots, low paler than mid; never colour alone', () => {
  assert.equal(tierMark('top').shape, 'triangle-up'); assert.equal(tierMark('low', true).shape, 'triangle-up', 'gold is a top mark');
  assert.equal(tierMark('mid').shape, 'dot'); assert.equal(tierMark('low').shape, 'dot'); assert.equal(tierMark('zzz').shape, 'dot');
  const sum = (c) => c[0] + c[1] + c[2]; assert.ok(sum(tierMark('low').fill) > sum(tierMark('mid').fill), 'pale sand lighter than sand');
  assert.ok(Math.abs(MARK_MIN_RAD - Math.PI / 18) < 1e-12, '10 degrees');
});

test('D4 labelLines: one line first, then a split at ", " (Toss), else at the middle space', () => {
  assert.deepEqual(labelLines('No boost, +1 Spoke'), [['No boost, +1 Spoke'], ['No boost,', '+1 Spoke']]);
  assert.deepEqual(labelLines('Linden +10%'), [['Linden +10%'], ['Linden', '+10%']]);
  assert.deepEqual(labelLines('x3.0'), [['x3.0']]);
});

test('D4 radialFit: the text box stays inside its slice edges and inside rOut; never under the floor', () => {
  const cases = [['No boost, +1 Spoke', Math.PI / 10], ['Linden +10%', 0.258], ['NUTS +10', 0.314], ['x1.0', 0.33], ['+2', 0.11]];
  for (const [text, half] of cases) {
    const F = radialFit({ text, half, rIn: 28, rOut: 118, measure: fake, rPref: 70, fMin: 12 });
    assert.ok(F, 'fits: ' + text); const m = fake(F.lines, F.f), r0 = F.rc - m.w / 2;
    assert.ok(F.f >= 12 && F.f <= 18, 'font in range ' + text);
    assert.ok(r0 >= 28 - 1e-9 && F.rc + m.w / 2 <= 118 + 1e-9, 'inside hub..rOut ' + text);
    assert.ok(r0 * Math.sin(half) >= m.h / 2 + 2 - 1e-9, 'inside the slice edges at its inner end ' + text);
  }
  const two = radialFit({ text: 'No boost, +1 Spoke', half: Math.PI / 10, rIn: 28, rOut: 118, measure: fake, fMin: 12 });
  assert.equal(two.lines.length, 2, 'Toss wraps to two lines');
  assert.equal(radialFit({ text: 'A very long prize name here', half: 0.05, rIn: 28, rOut: 80, measure: fake, fMin: 14 }), null, 'too long: null (one character + legend)');
  const ways = radialFit({ text: '20', ways: [['20 Coins'], ['20', 'Coins']], half: 0.26, rIn: 28, rOut: 112, measure: fake, fMin: 14 });
  assert.ok(ways && ways.lines.join(' ') === '20 Coins', 'caller line sets are used');
});

test('D4 radialTurn: a label never reads upside down (turn within -90..+90 degrees)', () => {
  for (let d = -180; d <= 360; d += 7.5) { const t = radialTurn(d * Math.PI / 180), c = Math.cos(t); assert.ok(c >= -1e-9, 'angle ' + d); }
});

test('legendWith: host rows first and kept, narrow slices add one row each, duplicates merged', () => {
  const ring = [{ w: 1, label: 'No boost, +1 Spoke' }, { w: 1, label: 'No boost, +1 Spoke' }, { w: 0.4, label: 'M', legend: 'Gold Medal' }, { w: 1, label: '+5%' }];
  const rows = legendWith(ring, [true, true, false, false], [{ ch: 'tri', text: 'above centre' }]);
  assert.deepEqual(rows.map((r) => r.ch + '=' + r.text), ['tri=above centre', 'N=No boost, +1 Spoke', 'M=Gold Medal']);
  assert.deepEqual(legendWith(ring.slice(3), [], null), []);
  assert.deepEqual(legendWith([{ w: 0.6, label: '1.2' }], [], [{ ch: '1.2', text: 'x1.2' }]).map((r) => r.text), ['x1.2'], 'the host row for 1.2 is the only 1.2 row');
});

test('T4 QA 2: shape words on legend chips map to shapes (never printed); cards are read from any key style', () => {
  assert.equal(legendShape('tri'), 'top'); assert.equal(legendShape('dot'), 'mid'); assert.equal(legendShape('pale'), 'low'); assert.equal(legendShape('GOLD'), 'gold'); assert.equal(legendShape('F'), ''); assert.equal(legendShape('M'), '');
  assert.deepEqual(cardOf({ card: { g: 'B+', n: 'Okonkwo-Bell', ic: 'Bat' } }), { grade: 'B+', name: 'Okonkw.', focus: 'bat' });
  assert.deepEqual(cardOf({ card: { grade: 'E', name: 'Ito', focus: 'bal' } }), { grade: 'E', name: 'Ito', focus: 'bal' });
  assert.equal(cardOf({ label: 'x1.0' }), null);
});

test('sliceWheelSvg +v text renders at least 14 px (font units = max(9, 1400/size)); under 100 px the text is dropped, shape only', () => {
  assert.doesNotMatch(sliceWheelSvg({ mat: 'wood', bars: 4, size: 72 }), /<text/);
  for (const size of [100, 120, 150, 200]) {
    const m = /font-size="([\d.]+)"/.exec(sliceWheelSvg({ mat: 'wood', bars: 4, size }));
    assert.ok(m && +m[1] * size / 100 >= 14 - 0.06 && +m[1] >= 9, 'size ' + size);
  }
});
