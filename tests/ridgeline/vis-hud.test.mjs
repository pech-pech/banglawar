import test from 'node:test';
import assert from 'node:assert/strict';
import { springStep, peakToV, settled, gapState, gapFrac, fadeFloor, fadeStep, boostColor, PALETTE, KEYS, CARDS, createHud, SAFE } from '../../pages/ridgeline/src/vis/hudspring.js';
import { tapAllowed, TAP_GUARD_S, endModel, nextHull, SHEET_MAX_VH, createEndCard } from '../../pages/ridgeline/src/vis/endcard.js';

test('spring settles for every card, overshoots once', () => {
  for (const c of CARDS) {
    const s = { x: 0, v: peakToV(10, c.k, c.z) };
    let peak = 0, t = 0;
    for (; t < 2; t += 1 / 60) { springStep(s, 0, c.k, c.z, 1 / 60); peak = Math.max(peak, Math.abs(s.x)); }
    assert.ok(peak > 8 && peak < 12.5, c.n + ' peak ' + peak);
    assert.ok(settled(s), c.n + ' settled');
  }
});
test('spring stable with big dt', () => {
  const s = { x: 5, v: 0 }; springStep(s, 0, 250, 0.8, 1); assert.ok(Number.isFinite(s.x) && Math.abs(s.x) < 5);
});
test('gap state thresholds', () => {
  assert.equal(gapState(Infinity), 'hidden'); assert.equal(gapState(undefined), 'hidden');
  assert.equal(gapState(200), 'far'); assert.equal(gapState(130), 'far');
  assert.equal(gapState(129), 'near'); assert.equal(gapState(60), 'near');
  assert.equal(gapState(59.9), 'heels'); assert.equal(gapState(0), 'heels');
  assert.equal(gapFrac(150), 1); assert.equal(gapFrac(300), 1); assert.equal(gapFrac(75), 0.5); assert.equal(gapFrac(Infinity), 0);
});
test('fade floors 42 / 58 and fade tends to floor', () => {
  assert.equal(fadeFloor(0, {}), 0.42); assert.equal(fadeFloor(0.4, {}), 0.42); assert.equal(fadeFloor(0.6, {}), 0.58);
  assert.equal(fadeFloor(0.9, { lookHudFloor: 30, lookHudFloorDusk: 50 }), 0.5);
  let f = 1; for (let i = 0; i < 120; i++) f = fadeStep(f, 0.42, 1 / 60, false);
  assert.ok(Math.abs(f - 0.42) < 0.01);
  assert.ok(fadeStep(0.42, 1, 0.1, false) > 0.8);
});
test('no cool colours in exported palette or boost ramp', () => {
  const hue = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  for (const [k, v] of Object.entries(PALETTE)) { const h = hue(v); assert.ok(!(h > 150 && h < 262 && v !== '#2a2358') , k + ' hue ' + h); assert.notEqual(v.toLowerCase(), '#3dfff0'); }
  for (let t = 0; t <= 1; t += 0.1) { const [r, g, b] = boostColor(t).match(/\d+/g).map(Number); assert.ok(r >= g && g >= b - 0 && r > b, 'warm ' + t); }
});
test('tap guard 0.6 s pure', () => {
  assert.equal(TAP_GUARD_S, 0.6);
  assert.equal(tapAllowed(10, 10.59), false); assert.equal(tapAllowed(10, 10.6), true);
  let fired = 0; const ec = createEndCard(null, () => 5);
  ec.open({ cause: 'caught', dist: 100 }, { onRideAgain: () => fired++ });
  assert.equal(ec.press('again', 5.3), false); assert.equal(fired, 0);
  assert.equal(ec.press('again', 5.7), true); assert.equal(fired, 1);
  ec.close(); assert.equal(ec.press('again', 9), false);
});
test('end model and sheet limits', () => {
  assert.ok(SHEET_MAX_VH <= 50); assert.ok(SAFE.minTouch >= 56);
  const m = endModel({ cause: 'caught', dist: 2846, best: 3120, top: 54.4, landings: 7 });
  assert.equal(m.cause, 'Night caught you'); assert.equal(m.top, 54); assert.equal(m.best, 3120); assert.equal(m.next.name, 'Anvil');
  assert.equal(nextHull(20000), null); assert.equal(nextHull(0).name, 'Kite');
});
test('createHud headless: events kick, settle; Infinity gap hides', () => {
  const h = createHud({ cfg: {}, root: null });
  const vs = { dist: 100, speed: 30, gap: Infinity, boost: 0.5, flow: 2, n: 0, reduced: false };
  h.update(1 / 60, vs);
  h.fx({ type: 'land', grade: 'slam' });
  let maxY = 0;
  for (let i = 0; i < 40; i++) { h.update(1 / 60, vs); maxY = Math.max(maxY, ...h.stats().cards.map((c) => Math.abs(c.y))); }
  assert.ok(maxY > 3, 'kicked ' + maxY);
  for (let i = 0; i < 180; i++) h.update(1 / 60, vs);
  assert.ok(h.stats().cards.every((c) => Math.abs(c.y) < 0.01));
  assert.equal(h.stats().gap, 'hidden');
  vs.gap = 40; h.update(1 / 60, vs); assert.equal(h.stats().gap, 'heels');
  const dusk = { ...vs, n: 0.8, gap: 500 };
  for (let i = 0; i < 900; i++) h.update(1 / 60, dusk);
  assert.ok(Math.abs(h.stats().cards[0].f - 0.58) < 0.01);
  h.endCard({ dist: 5 }, {}); assert.equal(h.stats().endOpen, true); h.hideEnd(); assert.equal(h.stats().endOpen, false);
});
test('reduced motion: no displacement, fade only', () => {
  const h = createHud({ cfg: { lookReducedMotion: 1 }, root: null });
  const vs = { dist: 1, speed: 1, gap: Infinity, boost: 0, flow: 0, n: 0 };
  h.update(1 / 60, vs); h.fx({ type: 'land', grade: 'slam' });
  for (let i = 0; i < 20; i++) h.update(1 / 60, vs);
  assert.ok(h.stats().cards.every((c) => c.y === 0 && c.r === 0 && c.s === 0));
});
test('KEYS shape', () => { for (const k of Object.values(KEYS)) assert.ok('def' in k && 'min' in k && 'max' in k && 'step' in k && k.label); });
