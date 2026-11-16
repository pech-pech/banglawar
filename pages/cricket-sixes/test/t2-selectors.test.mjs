import test from 'node:test'; import assert from 'node:assert/strict';
import { trainingVMT2, coachesVMT2 } from '../js/store/selectors.js';
import { spinKeyOf } from '../js/core/wheel-stops.js';
import { game, K } from './_tr2-fixture.mjs';

const base = () => game({ coaches: [K()], plan: { focus: 'bat', effort: 'normal' } });
const withSpot = () => { const s = base(); s.training.spotlight_id = 'p1'; return s; };

test('keys are empty without a player or coach, set with one', () => {
  const none = trainingVMT2(base());
  assert.equal(none.spotlight.spinKey, ''); assert.equal(none.spotlight.wobKey, ''); assert.equal(none.spotlight.stored, null);
  const s = withSpot(), vm = trainingVMT2(s);
  assert.ok(vm.spotlight.spinKey.length > 0); assert.ok(vm.spotlight.wobKey.length > 0);
  assert.equal(vm.spotlight.spinKey, spinKeyOf(s, 'spot', { playerId: 'p1' }));
  assert.equal(vm.twin.spinKey, '');
  const c = coachesVMT2(base()).coaches[0].course;
  assert.ok(c.spinKey.length > 0); assert.equal(c.spinKey, spinKeyOf(base(), 'course', { coachId: 'k1', k: 1 }));
});

test('stored: fresh null, stored stop returned', () => {
  const s = withSpot(); assert.equal(trainingVMT2(s).spotlight.stored, null);
  const k = spinKeyOf(s, 'spot', { playerId: 'p1' }), ck = spinKeyOf(s, 'course', { coachId: 'k1', k: 1 });
  s.wheels = { stops: { spot: { [k]: { stops: [0.4], kept: 0, spent: false } }, course: { [ck]: { stops: [0.2], kept: 0, spent: false } } } };
  assert.deepEqual(trainingVMT2(s).spotlight.stored.stops, [0.4]);
  assert.deepEqual(coachesVMT2(s).coaches[0].course.stored.stops, [0.2]);
});

test('kindFloor follows effective(s)', () => {
  const s = withSpot(); assert.equal(trainingVMT2(s).spotlight.kindFloor, 0); assert.equal(coachesVMT2(s).coaches[0].course.kindFloor, 0);
});

test('kindFloor 1 when Kind Floor owned (wheelMeta on)', async () => {
  const { FLAGS } = await import('../js/data/flags.js'); const was = FLAGS.wheelMeta; FLAGS.wheelMeta = true;
  try {
    const s = withSpot(); s.wheelMeta = { owned: { f_floor: 1 } };
    assert.equal(trainingVMT2(s).spotlight.kindFloor, 1); assert.equal(coachesVMT2(s).coaches[0].course.kindFloor, 1);
  } finally { FLAGS.wheelMeta = was; }
});
