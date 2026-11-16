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

// T8: Scout landed card in coachPickVM
import { scoutLandedVM, coachPickVM as _cpVM } from '../js/store/selectors.js';
import { scoutBodyHtml } from '../js/ui/coachpick-view.js';
test('scoutLandedVM: null without a slice spin; card + line after one', () => {
  assert.equal(scoutLandedVM({ season: { n: 1 } }), null);
  const s = { season: { n: 1 }, scoutSpin: { n: 1, index: 0, id: 'top2', steps: 2, extra: 0, sliceId: 0, value: 2, card: { grade: 'B', surname: 'Khan', focus: 'bp' } } };
  const v = scoutLandedVM(s);
  assert.equal(v.name, 'Khan'); assert.equal(v.gold, true); assert.equal(v.line, 'Top name: Khan (B) joins as your first name, +2 steps.');
  const vm = _cpVM(game({ coaches: [] }));
  assert.equal(vm.cands.filter((c) => c.landed).length, 0);
  const g = game({ coaches: [] }); g.scoutSpin = { ...s.scoutSpin, n: g.season.n };
  const v2 = _cpVM(g); assert.equal(v2.cands[0].landed, true); assert.equal(v2.cands[0].id, 'sc' + g.season.n + '-c'); assert.equal(v2.cands.filter((c) => c.name === 'Khan').length, 1);
  const h = scoutBodyHtml(v2); assert.equal((h.match(/Scout pick/g) || []).length, 1); assert.match(h, /SignCoach/);
});
