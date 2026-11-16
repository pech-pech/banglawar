import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openClinicWheel, clinicResultText, clinicMedian, clinicStopRec, applyClinicStop, loadClinicDeps } from '../js/ui/wheels/clinic.js';
import { clinicParity } from '../tools/clinic-parity.mjs';

const mk = (stored) => {
  const calls = { open: null, dispatch: [], rec: [] };
  const deps = { openWheel: (o) => { calls.open = o; return () => {}; }, wheelWobble: () => 0.25, wobbleKey: () => 'k', storedStop: () => stored || null,
    recordStop: (n, w, k, r, o) => { calls.rec.push([w, k, r, o]); return n; } };
  const ctx = { state: () => ({}), spinKey: '101:c1', slot: 0, coachId: 'c1', playerId: 'p1', dispatch: (t, p) => calls.dispatch.push([t, p]) };
  return { calls, deps, ctx };
};
test('ring rows, engine options, no auto or timing', () => {
  const { calls, deps, ctx } = mk(); openClinicWheel(ctx, deps);
  assert.equal(calls.open.wheelId, 'clinic'); assert.equal(calls.open.ring.length, 10);
  assert.ok(Math.abs(calls.open.ring.reduce((a, r) => a + r.w, 0) - 10) < 1e-9);
  for (const k of ['auto', 'timing', 'reducedMotion']) assert.ok(!(k in calls.open));
});
test('STOP dispatches ClinicSpin with wobble and result text', () => {
  const { calls, deps, ctx } = mk(); openClinicWheel(ctx, deps);
  calls.open.onSpin({ t: 3.5, stopT: 3500, cycle: 1, tInCycle: 3.5, sliceId: 4 });
  assert.equal(calls.dispatch[0][0], 'ClinicSpin'); assert.equal(calls.dispatch[0][1].stop.e, 0.25);
  assert.equal(calls.open.getPending().kind, 'L');
  assert.equal(clinicResultText(4), 'Landed: Large, +20%.');
});
test('reload shows the stored slice, no new pick', () => {
  const { calls, deps, ctx } = mk({ stops: [{ sliceId: 0, value: 30 }], kept: 0, spent: false }); openClinicWheel(ctx, deps);
  assert.ok(calls.open.stored); assert.equal(calls.open.getPending().kind, 'JP'); assert.equal(calls.dispatch.length, 0);
});
test('stop record and recordStop median', () => {
  assert.equal(clinicMedian(), 10);
  const r = clinicStopRec({ stopT: 3500.4, cycle: 2, tInCycle: 1, sliceId: 5 });
  assert.deepEqual(r, { stopT: 3500, cycle: 2, tInCycle: 1, sliceId: 5, value: 10, auto: false, respin: 0 });
  const { calls, deps } = mk(); applyClinicStop({}, '101:c1', { sliceId: 5, cycle: 1 }, deps);
  assert.equal(calls.rec[0][0], 'clinic'); assert.equal(calls.rec[0][3].median, 10);
});
test('default loader says T1 engine missing', async () => {
  await assert.rejects(() => loadClinicDeps(), /T1 engine missing/);
});
test('parity EV ratios near 1.33 / 1.46 / 1.70', () => {
  const r = clinicParity(20000, 11);
  [1.33, 1.46, 1.70].forEach((x, i) => assert.ok(Math.abs(r[i].ratio - x) < 0.06, r[i].tapper + ' ' + r[i].ratio));
});
