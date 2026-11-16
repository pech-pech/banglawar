// T6 Clinic view-model helpers: clinicCoachVM, clinicBoostMap, and the selector wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadV7 } from './_v7-fixture.mjs';
import { clinicCoachVM, clinicBoostMap, clinicPrize } from '../js/core/clinic-vm.js';
import { weekKey } from '../js/core/week-key.js';
import { coachList } from '../js/core/training.js';
import { clinicSpinKey } from '../js/core/clinic.js';
import { squadVM } from '../js/store/selectors.js';

const fresh = () => { const s = loadV7(); s.clinic.week = weekKey(s); s.clinic.netsDone = false; s.training.netsWeek = null; s.training.tp = 500; return s; };
const firstPlayer = (s) => s.clubs.find((c) => c.squad.some((p) => p)).squad[0];

test('clinicPrize words per kind', () => {
  assert.equal(clinicPrize(5), 'Medium, +10%'); assert.equal(clinicPrize(0), 'Jackpot, one extra nets roll');
  assert.equal(clinicPrize(1), 'Small, +5%'); assert.equal(clinicPrize(2), 'Large, +20%');
  assert.equal(clinicPrize(99), ''); assert.equal(clinicPrize(null), '');
});

test('clinicCoachVM: ready, nets, course, null', () => {
  const s = fresh(), [a] = coachList(s);
  assert.deepEqual(clinicCoachVM(s, a), { state: 'ready', prize: '', playerName: '' });
  const n = structuredClone(s); n.clinic.netsDone = true;
  assert.equal(clinicCoachVM(n, a).state, 'nets');
  const w = structuredClone(s); w.coaches.find((c) => c.id === a.id).away = 1;
  assert.equal(clinicCoachVM(w, a).state, 'course');
  assert.equal(clinicCoachVM(null, a), null); assert.equal(clinicCoachVM(s, null), null);
  const nb = structuredClone(s); delete nb.clinic; assert.equal(clinicCoachVM(nb, a), null);
});

test('clinicCoachVM: used reads prize from the stored stop and the player name', () => {
  const s = fresh(), [a] = coachList(s), p = firstPlayer(s), key = clinicSpinKey(s, a.id);
  s.clinic.spins.push({ slot: 0, coachId: a.id, playerId: p.id, spinKey: key, spokePaid: false });
  s.wheels = s.wheels || {}; s.wheels.stops = { ...(s.wheels.stops || {}), clinic: { [key]: { sliceId: 5, value: 10 } } };
  assert.deepEqual(clinicCoachVM(s, a), { state: 'used', prize: 'Medium, +10%', playerName: p.name });
  delete s.wheels.stops.clinic[key];
  assert.equal(clinicCoachVM(s, a).prize, '', 'missing stop reads empty prize, no throw');
});

test('clinicBoostMap: clean entries, empties dropped, stale week empty', () => {
  const s = fresh();
  assert.deepEqual(clinicBoostMap(s), {});
  s.clinic.boost = { p1: { pcts: [10, 7, 20], extraRun: true }, p2: { pcts: [], extraRun: false }, p3: { pcts: [5], extraRun: false } };
  assert.deepEqual(clinicBoostMap(s), { p1: { pcts: [10, 20], extraRun: true }, p3: { pcts: [5], extraRun: false } });
  s.clinic.week = 1; assert.deepEqual(clinicBoostMap(s), {});
  assert.deepEqual(clinicBoostMap(null), {}); assert.deepEqual(clinicBoostMap({}), {});
});

test('squadVM rows carry boost (null when none)', () => {
  const s = fresh();
  const vm0 = squadVM(s); assert.ok(vm0.players.length > 0); assert.ok(vm0.players.every((p) => p.boost === null));
  const id = vm0.players[0].id; s.clinic.boost = { [id]: { pcts: [10], extraRun: false } };
  assert.deepEqual(squadVM(s).players[0].boost, { pcts: [10], extraRun: false });
});
