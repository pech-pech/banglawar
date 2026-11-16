import test from 'node:test';
import assert from 'node:assert/strict';
import { warmCrowdOwned, applyWarmCrowd, hypeTokenAllowed, WARM_CROWD_VALUE } from '../js/core/perks/warm-crowd.js';

const mk = (label, value, width) => Object.freeze({ label, value, width });
const RING = Object.freeze([mk('NUTS +10', 10, 10), mk('MED +4', 4, 11.6667), mk('LOW +2', 2, 11.6667), mk('MED +4', 4, 11.6667), mk('HIGH +6', 6, 10),
  mk('LOW +2', 2, 11.6667), mk('MED +4', 4, 11.6667), mk('LOW +2', 2, 11.6667), mk('HIGH +6', 6, 10)]);

test('Warm Crowd off leaves ring equal (copy, not same object)', () => {
  const out = applyWarmCrowd(RING, false);
  assert.deepEqual(out, RING); assert.notEqual(out, RING);
});
test('on changes only HIGH rows to 7 / +7, widths unchanged, frozen input ok', () => {
  const out = applyWarmCrowd(RING, true);
  out.forEach((r, i) => {
    assert.equal(r.width, RING[i].width);
    if (RING[i].value === 6) { assert.equal(r.value, WARM_CROWD_VALUE); assert.match(r.label, /\+7/); assert.doesNotMatch(r.label, /\+6/); }
    else assert.deepEqual(r, RING[i]);
  });
  assert.equal(out.filter((r) => r.value === 7).length, 2);
  assert.equal(RING[4].value, 6);
});
test('Home Crowd lifts LOW to +4 first, Warm Crowd still only touches HIGH', () => {
  const lifted = RING.map((r) => (r.value === 2 ? { ...r, value: 4, label: '+4' } : r));
  const out = applyWarmCrowd(lifted, true);
  assert.deepEqual(out.map((r) => r.value), [10, 4, 4, 4, 7, 4, 4, 4, 7]);
});
test('warmCrowdOwned reads mods', () => {
  assert.equal(warmCrowdOwned(null), false);
  assert.equal(warmCrowdOwned({ rareAdd: 0 }), false);
  assert.equal(warmCrowdOwned({ warmCrowd: 1 }), true);
  assert.equal(warmCrowdOwned({ rareAdd: 0.08 }), false);
});
test('hypeTokenAllowed cap 1 a season', () => {
  assert.equal(hypeTokenAllowed(0), true); assert.equal(hypeTokenAllowed(1), false); assert.equal(hypeTokenAllowed(2), false);
});
