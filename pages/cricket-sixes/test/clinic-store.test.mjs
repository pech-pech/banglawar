import test from 'node:test';
import assert from 'node:assert/strict';
import { spinHandler } from '../js/store/spin-registry.js';
import { setClinicDeps } from '../js/store/spins/clinic.js';
import { FLAGS } from '../js/data/flags.js';
import { reportLines } from '../js/report/lines.js';
import '../js/report/clinic.js';

FLAGS.wheelMeta = true;
const recs = [];
setClinicDeps({
  recordStop: (n, wid, key, rec, opts) => { recs.push([wid, key, rec, opts]); ((n.wheels ||= { stops: {} }).stops[wid] ||= {})[key] = rec; return n; },
  canClinic: (s, coachId) => (s.deny ? { ok: false, why: 'no' } : { ok: true, why: '' }),
  pickable: (s) => [{ playerId: 'p1', ok: true, why: '' }, { playerId: 'p2', ok: false, why: 'At cap' }],
  clinicSpinKey: (s, coachId) => `${s.season.n * 100 + s.training.week}:${coachId}`,
});
const coach = (id) => ({ id, step: 4, strong: [], away: 0 });
const base = () => ({ coaches: [coach('c1'), coach('c2')], season: { n: 2 }, training: { week: 5 }, wheelMeta: { spokes: 0 }, clinic: { week: 205, pending: null, spins: [], boost: {} } });
const run = (t, s, a) => spinHandler(t)(s, a, {});
const stop = (sliceId) => ({ stop: { stopT: 4000, cycle: 1, tInCycle: 4, sliceId, value: 10 } });

test('registered', () => { for (const t of ['ClinicSpin', 'ClinicPick', 'ClinicLater']) assert.equal(typeof spinHandler(t), 'function'); });
test('pick sets pending, later clears; refused when canClinic not ok', () => {
  let s = run('ClinicPick', base(), { slot: 9, coachId: 'c1', playerId: 'p1' }); // client slot ignored
  assert.deepEqual(s.clinic.pending, { slot: 0, coachId: 'c1', playerId: 'p1' });
  assert.equal(run('ClinicLater', s, {}).clinic.pending, null);
  const d = base(); d.deny = true;
  assert.equal(run('ClinicPick', d, { slot: 0, coachId: 'c1', playerId: 'p1' }), d);
});
test('stop: one write, spoke once, boost, stats; reload cannot repeat', () => {
  let s = run('ClinicPick', base(), { slot: 1, coachId: 'c1', playerId: 'p1' });
  const n = run('ClinicSpin', s, stop(5)); // M
  assert.equal(recs.at(-1)[1], '205:c1');
  assert.equal(n.wheelMeta.spokes, 1);
  assert.deepEqual(n.clinic.spins, [{ slot: 0, coachId: 'c1', playerId: 'p1', spinKey: '205:c1', spokePaid: true }]);
  assert.deepEqual(n.clinic.boost.p1, { pcts: [10], extraRun: false });
  assert.equal(n.clinic.stats.slices.M, 1);
  assert.equal(n.clinic.pending, null);
  assert.equal(s.wheelMeta.spokes, 0, 'input untouched');
  const again = run('ClinicSpin', { ...n, clinic: { ...n.clinic, pending: { slot: 0, coachId: 'c1', playerId: 'p1' } } }, stop(0));
  assert.equal(again.wheelMeta.spokes, 1);
});
test('jackpot sets extraRun; boosts add; refused without pending or when not ok', () => {
  let s = run('ClinicPick', base(), { slot: 0, coachId: 'c1', playerId: 'p1' });
  s = run('ClinicSpin', s, stop(1)); // S
  s = run('ClinicPick', s, { slot: 1, coachId: 'c2', playerId: 'p1' });
  s = run('ClinicSpin', s, stop(0)); // JP
  assert.deepEqual(s.clinic.boost.p1, { pcts: [5], extraRun: true });
  assert.equal(s.wheelMeta.spokes, 2);
  const b = base();
  assert.equal(run('ClinicSpin', b, stop(1)), b);
  const p = run('ClinicPick', base(), { slot: 0, coachId: 'c1', playerId: 'p1' }); p.deny = true;
  assert.equal(run('ClinicSpin', p, stop(1)), p);
});
test('report lines', () => {
  let s = run('ClinicPick', base(), { slot: 0, coachId: 'c1', playerId: 'p1' });
  s = run('ClinicSpin', s, stop(2));
  const l = reportLines('CLINIC', s);
  assert.match(l[0], /^Clinic: 0 spun\./);
  assert.ok(l.some((x) => x.includes('coach c1, player p1, slice L')));
  assert.ok(l.some((x) => x.startsWith('Wheel points:')));
  assert.ok(!/perk|bond/i.test(l.join('\n')));
});

const stopV = (sliceId, value) => ({ stop: { stopT: 4000, cycle: 1, tInCycle: 4, sliceId, value } });
test('C1: slot derived from coachId, client slot ignored, missing slot works', () => {
  const s = run('ClinicPick', base(), { coachId: 'c2', playerId: 'p1' });
  assert.equal(s.clinic.pending.slot, 1);
  assert.equal(run('ClinicPick', base(), { slot: 0, coachId: 'nobody', playerId: 'p1' }).clinic.pending, null);
  assert.equal(run('ClinicSpin', s, stop(0)).clinic.spins[0].slot, 1);
});
test('M2: pick refused for a player not ok in pickable', () => {
  const b = base();
  assert.equal(run('ClinicPick', b, { coachId: 'c1', playerId: 'p2' }), b, 'at cap / short TP');
  assert.equal(run('ClinicPick', b, { coachId: 'c1', playerId: 'ghost' }), b, 'not in squad');
});
test('M6: value is re-derived from sliceId, client value ignored', () => {
  const s = run('ClinicPick', base(), { coachId: 'c1', playerId: 'p1' });
  run('ClinicSpin', s, stopV(2, 999)); // L = 20
  assert.equal(recs.at(-1)[2].value, 20);
});
test('M2: spin uses the pending playerId, not one in the payload', () => {
  const s = run('ClinicPick', base(), { coachId: 'c1', playerId: 'p1' });
  const n = run('ClinicSpin', s, { stop: { ...stop(1).stop, playerId: 'evil' }, playerId: 'evil' });
  assert.deepEqual(Object.keys(n.clinic.boost), ['p1']);
});
test('L3: no pick or spin outside the train stage', () => {
  for (const stage of ['week', 'end']) {
    const b = { ...base(), stage };
    assert.equal(run('ClinicPick', b, { coachId: 'c1', playerId: 'p1' }), b);
    const p = { ...b, clinic: { ...b.clinic, pending: { slot: 0, coachId: 'c1', playerId: 'p1' } } };
    assert.equal(run('ClinicSpin', p, stop(1)), p);
  }
  const t = run('ClinicPick', { ...base(), stage: 'train' }, { coachId: 'c1', playerId: 'p1' });
  assert.equal(run('ClinicSpin', t, stop(1)).wheelMeta.spokes, 1);
});
test('L6: ClinicLater clears only that coach\'s pick', () => {
  const s = run('ClinicPick', base(), { coachId: 'c1', playerId: 'p1' });
  assert.equal(run('ClinicLater', s, { coachId: 'c2' }), s);
  assert.equal(run('ClinicLater', s, { coachId: 'c1' }).clinic.pending, null);
});
