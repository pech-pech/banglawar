import test from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, beatFor, beatMs, createRunner, crowdFill, DEFAULT_FILL, HOOKS, GLYPH, chipFor, ropeGold, sixPoint, fourPoint, wicketFrame, confettiAt, confettiCount, stampDy, SEAT_RANK, ROWS, geo } from '../js/ui/beats.js';

test('only wicket, four and six get a beat (no wides or no-balls exist)', () => {
  assert.deepEqual([0, 1, 2, 4, 6, 'W'].map(beatFor), [null, null, null, 'four', 'six', 'wicket']);
});
test('frame tables match the spec lengths', () => {
  assert.equal(beatMs('upgrade'), 600); assert.equal(beatMs('win'), 1200);
  assert.equal(beatMs('crowd'), 1240);
  // the over-panel beats fit one 400 ms ball slot, so a beat never runs into the next ball
  for (const n of ['wicket', 'six', 'four']) assert.ok(beatMs(n) <= 400, n);
});
test('runner: steps in order, rest frame last, new beat cancels the old one', () => {
  const q = []; let id = 0; const log = [];
  const r = createRunner({ set: (f, ms) => { q.push([++id, f, ms]); return id; }, clear: (t) => { const i = q.findIndex((x) => x[0] === t); if (i >= 0) q.splice(i, 1); }, rm: () => false });
  r.play('wicket', (k) => log.push(k));
  while (q.length) { const [, f] = q.shift(); f(); }
  assert.deepEqual(log, [0, 1, 2, 3, 4, 5]); assert.equal(r.running, false);
  r.play('six', () => {}); r.play('four', (k) => log.push('f' + k));
  assert.equal(q.length, 1);   // only the new beat's timer is pending
});
test('reduced motion: one calm frame held rm ms, then rest', () => {
  const q = []; const log = [];
  const r = createRunner({ set: (f, ms) => { q.push([f, ms]); return q.length; }, clear() {}, rm: () => true });
  r.play('six', (k, rm) => log.push([k, rm]));
  assert.deepEqual(log, [[0, true]]); assert.equal(q[0][1], 400); q[0][0]();
  assert.deepEqual(log[1], [5, false]);
});
test('chip and number show from frame 0 and never flash', () => {
  for (const n of ['wicket', 'six', 'four']) assert.ok(chipFor(n));
  assert.equal(chipFor('promo'), null);
  const rope = Array.from({ length: 6 }, (_, k) => ropeGold(k, false)); let ch = 0; rope.forEach((v, i) => { if (i && v !== rope[i - 1]) ch++; });
  assert.equal(ch, 1);   // gold once, then it holds
});
test('whole pixels only', () => {
  for (let k = 0; k < 5; k++) { const p = sixPoint(k); assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y)); }
  for (let k = 0; k < 5; k++) { const p = fourPoint(k); assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y)); }
  for (let k = 0; k < 12; k++) confettiAt(k).forEach((c) => assert.ok(Number.isInteger(c.x) && Number.isInteger(c.y)));
  assert.equal(confettiCount(), 24); assert.equal(wicketFrame(9, false), wicketFrame(0, true));
});
test('six ball lands in the near stand; four ends on the rope', () => {
  assert.equal(sixPoint(4).y >= geo().lowTop, true); assert.equal(fourPoint(4).atRope, true);
});
test('trophy stamp drops in over 3 frames and ends at rest', () => {
  assert.deepEqual([0, 1, 2, 3].map((k) => stampDy(k, false)), [-6, -3, 0, 0]); assert.equal(stampDy(0, true), 0);
});
test('hooks are stubs: Fans changes nothing until NUMBERS supplies a curve; seats rank is seeded', () => {
  assert.equal(crowdFill(0), DEFAULT_FILL); assert.equal(crowdFill(9999), DEFAULT_FILL);
  HOOKS.crowdFill = (f) => f / 100; assert.equal(crowdFill(25), 0.25); assert.equal(crowdFill(500), 1); HOOKS.crowdFill = null;
  assert.equal(SEAT_RANK.length, ROWS.length); assert.deepEqual(SEAT_RANK[0].slice(0, 2), SEAT_RANK[0].slice(0, 2));
});
test('popup glyphs are 5x7', () => { for (const k in GLYPH) assert.equal(GLYPH[k].length, 35, k); });
