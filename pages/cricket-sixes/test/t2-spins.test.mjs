// T2: Spotlight and Course spins persist their STOP (wheel-stops), unspun before STOP, Course key k 1 vs 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { storedStop, spinKeyOf, statsOf } from '../js/core/wheel-stops.js';
import { newGame, step } from './_season-bot.mjs';

const untilTrain = (seed) => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'train' && g++ < 3000 && step(st)); return st.get(); };
const spotReady = (seed) => { const s0 = untilTrain(seed); return C(s0, 'SetTrainPlan', { spotlightId: s0.clubs[0].squad[0].id }); };

test('Spin persists the STOP; before STOP it is unspun and the reload keeps it', () => {
  const s = spotReady('t2a'), key = spinKeyOf(s, 'spot');
  assert.ok(key); assert.equal(storedStop(s, 'spot', key), null); assert.equal(statsOf(s, 'spot').n, 0);
  const sp = C(s, 'Spin', { careful: true, stop: { stopT: 3500, cycle: 1, tInCycle: 3.5 } });
  const e = storedStop(sp, 'spot', key);
  assert.ok(e); assert.equal(e.stops.length, 1); assert.equal(e.stops[0].value, sp.training.pending.result.gain);
  assert.equal(e.stops[0].sliceId, sp.training.pending.result.index); assert.equal(statsOf(sp, 'spot').n, 1);
  const back = JSON.parse(JSON.stringify(sp));
  assert.equal(storedStop(back, 'spot', key).stops.length, 1);
  assert.equal(storedStop(JSON.parse(JSON.stringify(s)), 'spot', key), null); // reload before STOP: unspun, nothing spent
});

test('same result with and without stop info (no extra rng)', () => {
  const s = spotReady('t2b');
  assert.deepEqual(C(s, 'Spin', { careful: true }).training.pending, C(s, 'Spin', { careful: true, stop: { stopT: 1, cycle: 1, tInCycle: 3.5 } }).training.pending);
});

test('CourseSpin persists under the course key, k 1 then 2', () => {
  const s = untilTrain('t2c'), id = s.coaches[0].id;
  const k1 = spinKeyOf(s, 'course', { coachId: id });
  assert.ok(k1.endsWith('|1')); assert.equal(storedStop(s, 'course', k1), null);
  const cs = C(s, 'CourseSpin', { coachId: id, careful: true, stop: { stopT: 3500, cycle: 1, tInCycle: 3.5 } });
  assert.ok(cs.training.coursePending);
  assert.equal(storedStop(cs, 'course', k1).stops[0].value, cs.training.coursePending.result.gain);
  const k2 = spinKeyOf(cs, 'course', { coachId: id, k: 2 });
  assert.ok(k2.endsWith('|2')); assert.notEqual(k1, k2); assert.equal(storedStop(cs, 'course', k2), null);
});
