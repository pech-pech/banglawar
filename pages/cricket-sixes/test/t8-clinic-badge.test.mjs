// T8: the home Match Plan Clinic badge count must not depend on the current screen (QA-V2 MED #6). Real v7 save, no stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadV7 } from './_v7-fixture.mjs';
import { clinicReadyCount, canClinic, clinicSpinKey } from '../js/core/clinic.js';
import { coachList } from '../js/core/training.js';
import { weekKey } from '../js/core/week-key.js';

const ready = (stage) => { const s = loadV7(); s.clinic.week = weekKey(s); s.clinic.netsDone = false; s.clinic.slots = 3; s.clinic.spins = []; s.training.netsWeek = null; s.training.tp = 500; s.stage = stage; return s; };

test('hub stage: badge count equals the train-stage count and is > 0', () => {
  const h = ready('hub'), t = ready('train');
  assert.ok(clinicReadyCount(t) > 0, 'fixture has ready spins');
  assert.equal(clinicReadyCount(h), clinicReadyCount(t));
  assert.equal(h.stage, 'hub', 'state not mutated');
  assert.equal(canClinic(h, coachList(h)[0].id).why, 'stage', 'spinning still gated to train');
});
test('hub stage: spent spins, away coaches and nets drop it to 0', () => {
  const s = ready('hub'), ids = coachList(s).map((c) => c.id);
  s.clinic.spins = ids.map((id) => ({ coachId: id, playerId: 'x', spinKey: clinicSpinKey(s, id) }));
  assert.equal(clinicReadyCount(s), 0);
  const n = ready('hub'); n.clinic.netsDone = true;
  assert.equal(clinicReadyCount(n), 0);
});
