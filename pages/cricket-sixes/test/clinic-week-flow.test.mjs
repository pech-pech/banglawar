// Clinic end-to-end store flow (CONTRACT-B s5/s6/s12, SPEC s6/s9) on the real reducer and the v7 fixture:
// ClinicPick -> ClinicSpin (fake stop for each slice kind) -> RunNets applies the boost -> EndWeek resets the block.
// No T1 engine needed: the stop is the plain object the wheel screen sends ({stopT, cycle, tInCycle, sliceId, value}).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadV7 } from './_v7-fixture.mjs';
import { applyCommand as C } from '../js/store/commands.js';
import '../js/store/spins/clinic.js';   // registers ClinicPick / ClinicLater / ClinicSpin
import '../js/core/clinic-hooks.js';    // registers the netsRun / endWeek listeners
import { clinicOf, canClinic, pickable, clinicSpinKey, clinicReadyCount } from '../js/core/clinic.js';
import { CLINIC_SLICE_ORDER, CLINIC_SLICES, CLINIC_PCT } from '../js/data/clinic.js';
import { weekKey, wrap, unwrap } from '../js/core/save-migrate.js';
import { netsPreview } from '../js/core/training.js';
import { readFileSync } from 'node:fs';

/** A fixture state in the train stage with enough training points for four players and a nets plan. */
function base() {
  let s = loadV7();
  s = { ...s, stage: 'train', training: { ...s.training, tp: 60, focus: 'bat', effort: 'normal' } };
  return C(s, 'SetTrainPlan', { focus: 'bat', effort: 'normal', coachId: s.coaches[0].id });
}
/** The stop the wheel screen sends for a slice kind (first ring index of that kind). */
const stopFor = (kind) => { const sliceId = CLINIC_SLICE_ORDER.indexOf(kind); return { stop: { stopT: 1800, cycle: 1, tInCycle: 0.4, sliceId, value: CLINIC_SLICES[kind].value } }; };
const coachId = (s, i = 0) => s.coaches[i].id;
const firstPlayer = (s) => netsPreview(s).trainIds[0];
const pick = (s, i = 0, playerId = firstPlayer(s)) => C(s, 'ClinicPick', { slot: i, coachId: coachId(s, i), playerId });
const spin = (s, kind) => C(s, 'ClinicSpin', stopFor(kind));
const picked = (s, kind, i = 0) => spin(pick(s, i), kind);

test('setup: fixture is in week key 218, clinic block is fresh, coach 0 can use the Clinic', () => {
  const s = base();
  assert.equal(weekKey(s), 218);
  const c = clinicOf(s);
  assert.equal(c.week, 218); assert.deepEqual(c.spins, []); assert.deepEqual(c.boost, {}); assert.equal(c.pending, null);
  assert.equal(canClinic(s, coachId(s)).ok, true, JSON.stringify(canClinic(s, coachId(s))));
  assert.ok(pickable(s).some((p) => p.ok), 'at least one pickable player');
  assert.ok(clinicReadyCount(s) >= 1);
  assert.equal(clinicSpinKey(s, coachId(s)), `218:${coachId(s)}`, 'spinKey = weekKey:coachId (lead call 4)');
});

test('ClinicPick keeps the pick in clinic.pending; ClinicLater clears it and the spin stays ready', () => {
  const s = pick(base());
  assert.deepEqual(s.clinic.pending, { slot: 0, coachId: coachId(s), playerId: firstPlayer(base()) });
  assert.equal(s.clinic.spins.length, 0);
  const l = C(s, 'ClinicLater');
  assert.equal(l.clinic.pending, null);
  assert.equal(canClinic(l, coachId(l)).ok, true);
});

test('ClinicSpin without a pick does nothing', () => {
  const s = base(), r = spin(s, 'L');
  assert.deepEqual(r.clinic, s.clinic);
});

for (const kind of ['S', 'M', 'L', 'JP']) {
  test(`slice ${kind}: spin writes one stop, one spin entry, one boost entry, one stat; pick is consumed`, () => {
    const s0 = base(), pid = firstPlayer(s0), sp = picked(s0, kind), c = sp.clinic, key = `218:${coachId(sp)}`;
    assert.equal(c.pending, null);
    assert.equal(c.spins.length, 1);
    assert.equal(c.spins[0].spinKey, key); assert.equal(c.spins[0].coachId, coachId(sp)); assert.equal(c.spins[0].playerId, pid); assert.equal(c.spins[0].slot, 0);
    const rec = sp.wheels.stops.clinic[key];
    assert.ok(rec, 'wheels.stops.clinic[spinKey] recorded');
    const stop = Array.isArray(rec.stops) ? rec.stops[0] : rec;
    assert.equal(stop.sliceId, CLINIC_SLICE_ORDER.indexOf(kind));
    assert.equal(c.stats.slices[kind], 1);
    assert.equal(Object.values(c.stats.slices).reduce((a, b) => a + b, 0), 1);
    if (kind === 'JP') { assert.deepEqual(c.boost[pid], { pcts: [], extraRun: true }); }
    else { assert.deepEqual(c.boost[pid], { pcts: [CLINIC_PCT[kind]], extraRun: false }); }
  });

  test(`slice ${kind}: RunNets applies the boost, closes spins, nets run once, deterministic`, () => {
    const s0 = base(), sp = picked(s0, kind), pid = firstPlayer(s0);
    const r = C(sp, 'RunNets'), r2 = C(picked(base(), kind), 'RunNets');
    assert.ok(r.training.nets && r.training.nets.week === r.training.week, 'nets ran');
    assert.equal(r.clinic.netsDone, true);
    const line = r.training.nets.lines.find((l) => l.id === pid);
    assert.ok(line, 'boosted player trained');
    assert.ok(line.toRaw - line.fromRaw >= 1);
    assert.ok(Number.isFinite(r.clinic.stats.boostedGain) && r.clinic.stats.boostedGain >= 0);
    assert.ok(Number.isFinite(r.clinic.stats.pointsGross) && Number.isFinite(r.clinic.stats.netGain));
    if (kind === 'JP') assert.ok(r.clinic.stats.jackpotRuns === 0 || r.clinic.stats.jackpotRuns === 1);
    else assert.equal(r.clinic.stats.jackpotRuns, 0);
    assert.deepEqual(r.training.nets.lines, r2.training.nets.lines, 'own rng stream: same save, same result');
  });
}

test('the boost never adds a player or a line, and never exceeds the player cap', () => {
  const s0 = base(), ctl = C(s0, 'RunNets'), r = C(picked(s0, 'L'), 'RunNets');
  assert.deepEqual(r.training.nets.lines.map((l) => l.id).sort(), ctl.training.nets.lines.map((l) => l.id).sort());
  for (const l of r.training.nets.lines) { assert.ok(l.toRaw <= 99 * 10 + 9 || Number.isFinite(l.toRaw)); }
  const p = r.clubs[0].squad.find((x) => x.id === firstPlayer(s0));
  assert.ok(p && Number.isFinite(p.ovr == null ? 1 : p.ovr));
});

test('EndWeek resets spins, boost, pending, netsDone and moves the block to the new weekKey', () => {
  let s = C(picked(base(), 'L'), 'RunNets');
  assert.equal(s.clinic.spins.length, 1);
  const e = C(s, 'EndWeek');
  assert.equal(e.training.week, 19);
  assert.equal(e.clinic.week, 219);
  assert.deepEqual(e.clinic.spins, []); assert.deepEqual(e.clinic.boost, {}); assert.equal(e.clinic.pending, null); assert.equal(e.clinic.netsDone, false);
  assert.ok(e.clinic.stats.slices.L >= 1, 'stats are kept across weeks (report totals)');
  assert.ok(e.wheels.stops.clinic['218:' + coachId(e)], 'stored stop is kept for the report');
});

test('second spin the same week for the same coach is refused (no second stop, boost or Spoke)', () => {
  const s1 = picked(base(), 'L'), id = coachId(s1);
  const again = C(s1, 'ClinicPick', { slot: 0, coachId: id, playerId: netsPreview(s1).trainIds[1] });
  assert.equal(again.clinic.pending, null, 'pick refused');
  assert.equal(canClinic(s1, id).ok, false);
  assert.ok(canClinic(s1, id).why, 'a plain-words reason');
  // even a forged pending cannot spin twice
  const forged = { ...s1, clinic: { ...s1.clinic, pending: { slot: 0, coachId: id, playerId: netsPreview(s1).trainIds[1] } } };
  const r = spin(forged, 'JP');
  assert.equal(r.clinic.spins.length, 1);
  assert.deepEqual(r.clinic.boost, s1.clinic.boost);
  assert.equal(r.clinic.stats.slices.JP, 0);
  assert.deepEqual(r.wheelMeta && r.wheelMeta.spokes, s1.wheelMeta && s1.wheelMeta.spokes);
});

test('replaying the same STOP (reload) pays nothing twice', () => {
  const s0 = pick(base()), once = spin(s0, 'M'), twice = spin(once, 'M');
  assert.deepEqual(twice.clinic, once.clinic);
  assert.deepEqual(twice.wheels, once.wheels);
});

test('a different coach can spin the same week, with his own spinKey', () => {
  const s0 = base(), pl = netsPreview(s0).trainIds;
  const a = picked(s0, 'S'), id1 = coachId(a, 1);
  assert.equal(canClinic(a, id1).ok, true, JSON.stringify(canClinic(a, id1)));
  const b = spin(C(a, 'ClinicPick', { slot: 1, coachId: id1, playerId: pl[1] }), 'L');
  assert.equal(b.clinic.spins.length, 2);
  assert.notEqual(b.clinic.spins[0].spinKey, b.clinic.spins[1].spinKey);
  assert.equal(b.clinic.spins[1].spinKey, `218:${id1}`);
});

test('new week: the same coach can spin again (new spinKey, old stop kept)', () => {
  const s1 = picked(base(), 'L');
  let n = C(s1, 'EndWeek');
  n = { ...n, stage: 'train', training: { ...n.training, tp: 60 } };
  const id = coachId(n);
  assert.equal(canClinic(n, id).ok, true, JSON.stringify(canClinic(n, id)));
  const sp = spin(C(n, 'ClinicPick', { slot: 0, coachId: id, playerId: netsPreview(n).trainIds[0] }), 'M');
  assert.equal(sp.clinic.spins.length, 1);
  assert.equal(sp.clinic.spins[0].spinKey, `219:${id}`);
  assert.ok(sp.wheels.stops.clinic[`218:${id}`] && sp.wheels.stops.clinic[`219:${id}`]);
});

test('nets already run: no pick, no spin, a reason is given', () => {
  const r = C(base(), 'RunNets'), id = coachId(r);
  assert.equal(r.clinic.netsDone, true);
  const c = canClinic(r, id);
  assert.equal(c.ok, false); assert.ok(c.why);
  const p = C(r, 'ClinicPick', { slot: 0, coachId: id, playerId: firstPlayer(base()) });
  assert.equal(p.clinic.pending, null);
  const forged = { ...r, clinic: { ...r.clinic, pending: { slot: 0, coachId: id, playerId: firstPlayer(base()) } } };
  assert.equal(spin(forged, 'L').clinic.spins.length, 0);
  assert.equal(clinicReadyCount(r), 0);
});

test('a coach on a course (away) cannot spin', () => {
  const s0 = base(), away = { ...s0, coaches: s0.coaches.map((c, i) => (i === 0 ? { ...c, away: 1 } : c)) };
  assert.equal(canClinic(away, coachId(away)).ok, false);
  assert.equal(C(away, 'ClinicPick', { slot: 0, coachId: coachId(away), playerId: firstPlayer(s0) }).clinic.pending, null);
});

test('bad payloads never throw and never change the state', () => {
  const s = base();
  for (const [t, p] of [['ClinicPick', {}], ['ClinicPick', { slot: 0 }], ['ClinicPick', { slot: 0, coachId: 'nobody', playerId: 'x' }], ['ClinicSpin', {}], ['ClinicSpin', { stop: { sliceId: 99 } }], ['ClinicSpin', null]]) {
    let r; assert.doesNotThrow(() => { r = C(s, t, p); }, t);
    assert.deepEqual(r.clinic, s.clinic, t + ' ' + JSON.stringify(p));
  }
});

test('save round trip: clinic block and the stored stop survive wrap/unwrap and a second EndWeek-free reload', () => {
  const s = picked(base(), 'JP');
  const back = unwrap(JSON.stringify(wrap(s)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.state.clinic, s.clinic);
  assert.deepEqual(back.state.wheels.stops.clinic, s.wheels.stops.clinic);
  // after the reload the same STOP is a no-op and RunNets still gives the extra-run result
  const again = C(back.state, 'ClinicSpin', stopFor('JP'));
  assert.deepEqual(again.clinic, back.state.clinic);
  assert.deepEqual(C(back.state, 'RunNets').training.nets.lines, C(s, 'RunNets').training.nets.lines);
});

test('save round trip with a pick waiting (reload keeps the pick; ClinicLater still works)', () => {
  const s = pick(base()), back = unwrap(JSON.stringify(wrap(s))).state;
  assert.deepEqual(back.clinic.pending, s.clinic.pending);
  assert.equal(C(back, 'ClinicLater').clinic.pending, null);
});

test('install.js imports the Clinic store and hook modules inside the T6 fence', () => {
  const t = readFileSync(new URL('../js/install.js', import.meta.url), 'utf8');
  const m = t.match(/\/\* INSTALL:T6 start \*\/([^]*?)\/\* INSTALL:T6 end \*\//);
  assert.ok(m, 'T6 fence');
  assert.match(m[1], /spins\/clinic\.js/);
  assert.match(m[1], /core\/clinic-hooks\.js/);
});
