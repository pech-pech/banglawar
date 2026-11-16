import test from 'node:test'; import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { kindFloorGain } from '../js/core/perks/kind-floor.js';
import { wheelSlices, courseWheel } from '../js/core/training.js';
import { metaWheel, afterResult, effective } from '../js/core/wheelmeta.js';

const spot = wheelSlices('normal'), course = courseWheel();
test('Kind Floor pay (SPEC 2i / 3): Spotlight x1.0 -> x1.2, Course +1 -> +2, never gold, never above the next rung, off = unchanged', () => {
  assert.equal(kindFloorGain('spot', spot, 1, 1, 1), 1.2); assert.equal(kindFloorGain('spot', spot, 6, 1.2, 1), 1.2); assert.equal(kindFloorGain('spot', spot, 3, 1.5, 1), 1.5);
  assert.equal(kindFloorGain('spot', spot, 0, 3, 1), 3, 'gold skipped'); assert.equal(kindFloorGain('spot', spot, 1, 1, 0), 1, 'not owned');
  assert.equal(kindFloorGain('course', course, 1, 1, 1), 2); assert.equal(kindFloorGain('course', course, 4, 2, 1), 2); assert.equal(kindFloorGain('course', course, 0, 4, 1), 4);
  assert.equal(kindFloorGain('hype', spot, 1, 1, 1), 1, 'only Spotlight and Course pay here');
});
test('Kind Floor pays through afterResult when effective(s).spot.kindFloor is 1 (the tree flag), and not without the node', () => {
  const was = FLAGS.wheelMeta; FLAGS.wheelMeta = true;
  try {
    const own = (o) => ({ season: { n: 1 }, wheelMeta: { tally: 600, owned: o, tokens: {}, streak: 0 } }), kf = own({ f_floor: 1 }), no = own({});
    assert.equal(effective(kf).spot.kindFloor, 1); const w = metaWheel(spot, 'spot', kf), r = { index: 2, gain: 1, jackpot: false };
    assert.equal(afterResult(kf, 'spot', r, { random: () => 0.99 }, { wheel: w }).result.gain, 1.2);
    assert.equal(afterResult(no, 'spot', r, { random: () => 0.99 }, { wheel: metaWheel(spot, 'spot', no) }).result.gain, 1);
    assert.equal(afterResult(kf, 'course', { index: 1, gain: 1, jackpot: false }, { random: () => 0.99 }, { wheel: metaWheel(course, 'course', kf) }).result.gain, 2);
  } finally { FLAGS.wheelMeta = was; }
});
