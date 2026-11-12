import test from 'node:test';
import assert from 'node:assert/strict';

let A = null;
try { A = await import('../js/core/ability.js'); } catch (e) { A = null; }
const skip = A ? false : 'js/core/ability.js not present yet';

const mk = (o = {}) => ({ id: 1, name: 'T', bat: 'Middle', bowl: 'Medium', bp: 50, bs: 50, spd: 50, bsk: 50, potential: 200, drillsHere: 5, ...o });
const shown = (p) => { const r = A.shownAbility(p); return typeof r === 'object' ? r.overall : r; };
const cap = (P) => { let r = A.capSum(mk({ potential: P })); if (typeof r !== 'number' || Number.isNaN(r)) r = A.capSum(P); return r; };

test('shownAbility endpoints: all 1 -> 20, all 99 -> 200 (potential 200, no clamp)', { skip }, () => {
  for (const bat of ['Opener', 'Middle', 'Lower']) for (const bowl of ['Fast', 'Medium', 'Spin']) {
    assert.equal(shown(mk({ bat, bowl, bp: 1, bs: 1, spd: 1, bsk: 1 })), 20, `${bat}/${bowl} low`);
    assert.equal(shown(mk({ bat, bowl, bp: 99, bs: 99, spd: 99, bsk: 99 })), 200, `${bat}/${bowl} high`);
  }
});

test('shownAbility is clamped at potential', { skip }, () => {
  assert.equal(shown(mk({ bp: 99, bs: 99, spd: 99, bsk: 99, potential: 120 })), 120);
});

test('shownAbility is a whole number and monotonic in ratings', { skip }, () => {
  let prev = -1;
  for (let r = 1; r <= 99; r++) {
    const v = shown(mk({ bp: r, bs: r, spd: r, bsk: r }));
    assert.ok(Number.isInteger(v)); assert.ok(v >= prev); prev = v;
  }
});

test('gradeOf band edges', { skip }, () => {
  const g = (P) => A.gradeOf(mk({ potential: P }));
  const edges = [[20, 'D'], [99, 'D'], [100, 'C'], [111, 'C'], [112, 'B'], [123, 'B'], [124, 'A'], [139, 'A'], [140, 'S'], [185, 'S']];
  for (const [P, want] of edges) assert.equal(g(P), want, `P=${P}`);
});

test('gradeOf hidden (null) until 5 drills here', { skip }, () => {
  for (const d of [0, 1, 4]) assert.equal(A.gradeOf(mk({ potential: 150, drillsHere: d })), null);
  assert.equal(A.gradeOf(mk({ potential: 150, drillsHere: 5 })), 'S');
});

test('previewCount: hidden 1, D1 C2 B3 A4 S6', { skip }, () => {
  assert.equal(A.previewCount(mk({ potential: 150, drillsHere: 2 })), 1);
  const want = { 90: 1, 105: 2, 118: 3, 130: 4, 150: 6 };
  for (const [P, n] of Object.entries(want)) assert.equal(A.previewCount(mk({ potential: +P })), n, `P=${P}`);
});

test('capSum formula and SAMPLE-DATA rows', { skip }, () => {
  assert.equal(cap(150), 287);
  assert.equal(cap(99), 176);
  assert.equal(cap(20), 4);
  assert.equal(cap(200), 396);
  for (let P = 20; P <= 185; P++) assert.equal(cap(P), Math.round(4 * (1 + (P - 20) * 98 / 180)), `P=${P}`);
});
