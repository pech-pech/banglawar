// Clinic coach button states: 'none' for nobody/slots, stage check, used before away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadV7 } from './_v7-fixture.mjs';
import { clinicCoachVM } from '../js/core/clinic-vm.js';
import { canClinic, clinicReadyCount, clinicSpinKey } from '../js/core/clinic.js';
import { weekKey } from '../js/core/week-key.js';
import { coachList } from '../js/core/training.js';
import { slotClinicBtn as sheetBtn } from '../js/ui/coaches-sheet.js';
import { slotClinicBtn as viewBtn } from '../js/ui/training-view.js';

const fresh = () => { const s = loadV7(); s.clinic.week = weekKey(s); s.clinic.netsDone = false; s.training.netsWeek = null; s.training.tp = 500; s.stage = 'train'; return s; };

test('slots spent reads none, not course', () => {
  const s = fresh(), [a] = coachList(s); s.clinic.slots = 0;
  assert.equal(canClinic(s, a.id).why, 'slots');
  assert.equal(clinicCoachVM(s, a).state, 'none');
});

test('nobody can gain reads none', () => {
  const s = fresh(), [a] = coachList(s); s.training.tp = 0;
  const r = canClinic(s, a.id);
  if (r.why === 'nobody') assert.equal(clinicCoachVM(s, a).state, 'none');
  else assert.equal(r.ok, true); // fixture still has a pickable player: nothing to assert
});

test('away reads course; used wins over away', () => {
  const s = fresh(), [a] = coachList(s);
  s.coaches.find((c) => c.id === a.id).away = 1;
  assert.equal(canClinic(s, a.id).why, 'away'); assert.equal(clinicCoachVM(s, a).state, 'course');
  s.clinic.spins = [{ coachId: a.id, playerId: 'x', spinKey: clinicSpinKey(s, a.id) }];
  assert.equal(canClinic(s, a.id).why, 'used'); assert.equal(clinicCoachVM(s, a).state, 'used');
});

test('stage: only train spins; no stage string passes', () => {
  const s = fresh(), [a] = coachList(s);
  assert.equal(canClinic(s, a.id).ok, true);
  for (const st of ['week', 'end']) {
    const n = structuredClone(s); n.stage = st;
    assert.deepEqual(canClinic(n, a.id), { ok: false, why: 'stage' }); assert.equal(clinicReadyCount(n), 0);
    assert.notEqual(clinicCoachVM(n, a) && clinicCoachVM(n, a).state, 'ready');
  }
  const t = structuredClone(s); t.stage = 'train'; assert.equal(canClinic(t, a.id).ok, true);
  const u = structuredClone(s); delete u.stage; assert.equal(canClinic(u, a.id).ok, true);
});

test('renderers: none button text, aria, class, disabled', () => {
  const coach = { id: 'c1', name: 'Rafi', away: 0, clinic: { state: 'none', prize: '', playerName: '' } };
  for (const f of [sheetBtn, viewBtn]) {
    const h = f({}, coach);
    assert.match(h, /cn-btn-none/); assert.match(h, /Nobody can gain/); assert.match(h, /aria-label="[^"]*nobody can gain/);
    assert.match(h, /aria-disabled="true"/); assert.doesNotMatch(h, /On course/);
    assert.match(f({}, { ...coach, away: 1, clinic: { state: 'used', prize: 'Small, +5%', playerName: 'Ali' } }), /cn-btn-used/);
  }
});

test('css: cn-btn-none grey with 56 px tap', () => {
  const css = readFileSync(new URL('../css/clinic.css', import.meta.url), 'utf8');
  assert.match(css, /\.cn-btn-none[^{]*\{[^}]*grayscale/); assert.match(css, /\.cn-btn-none[^{]*\{ min-height: 56px/);
});
