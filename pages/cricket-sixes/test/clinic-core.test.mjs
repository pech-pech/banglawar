// T6 Clinic core (B2.2): clinicOf, canClinic, pickable, clinicSpinKey, clinicReadyCount, and the endWeek / netsRun listeners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadV7 } from './_v7-fixture.mjs';
import { clinicOf, canClinic, pickable, clinicSpinKey, clinicReadyCount } from '../js/core/clinic.js';
import { weekKey } from '../js/core/week-key.js';
import { coachList, runNets, endWeek, netsPreview } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';

const fresh = () => { const s = loadV7(); s.clinic.week = weekKey(s); s.clinic.netsDone = false; s.training.netsWeek = null; s.training.tp = 500; return s; };
const ids = (s) => coachList(s).map((c) => c.id);

test('clinicOf: current week returns the block, stale or missing reads default', () => {
  const s = fresh(); assert.equal(clinicOf(s), s.clinic);
  s.clinic.week = 1; s.clinic.spins = [{ slot: 0, coachId: 'x', playerId: 'p', spinKey: 'k', spokePaid: 1 }];
  const d = clinicOf(s); assert.deepEqual(d.spins, []); assert.equal(d.week, weekKey(s)); assert.equal(d.slots, 3); assert.deepEqual(d.boost, {});
  assert.deepEqual(clinicOf({}).spins, []); assert.deepEqual(clinicOf(null).boost, {});
  d.spins.push(1); assert.deepEqual(clinicOf({}).spins, [], 'default is a fresh copy');
});

test('clinicSpinKey = weekKey:coachId', () => {
  const s = fresh(); assert.equal(clinicSpinKey(s, 'k0'), `${weekKey(s)}:k0`);
});

test('canClinic: ok, then each refusal', () => {
  const s = fresh(), [a, b] = ids(s);
  assert.deepEqual(canClinic(s, a), { ok: true, why: '' });
  assert.equal(canClinic(s, 'nope').why, 'unknown');
  const away = structuredClone(s); away.coaches.find((c) => c.id === a).away = 1; assert.equal(canClinic(away, a).why, 'away');
  const used = structuredClone(s); used.clinic.spins.push({ slot: 0, coachId: a, playerId: 'p', spinKey: clinicSpinKey(s, a), spokePaid: 1 }); assert.equal(canClinic(used, a).why, 'used');
  assert.equal(canClinic(used, b).ok, true, 'other coach unaffected');
  const slotUsed = structuredClone(s); slotUsed.clinic.spins.push({ slot: 0, coachId: 'gone', playerId: 'p', spinKey: 'k', spokePaid: 1 }); assert.equal(canClinic(slotUsed, a).ok, true, 'M1: another coach in the same slot index is not refused');
  const spent = structuredClone(s); spent.clinic.slots = 1; spent.clinic.spins.push({ slot: 0, coachId: 'gone', playerId: 'p', spinKey: 'k', spokePaid: 1 }); assert.equal(canClinic(spent, a).why, 'slots', 'M1: slot count spent');
  const nd = structuredClone(s); nd.clinic.netsDone = true; assert.equal(canClinic(nd, a).why, 'nets');
  const nw = structuredClone(s); nw.training.netsWeek = nw.training.week; assert.equal(canClinic(nw, a).why, 'nets');
  const sl = structuredClone(s); sl.clinic.slots = 1; assert.equal(canClinic(sl, a).ok, true); assert.equal(canClinic(sl, b).why, 'slots');
  const stale = structuredClone(s); stale.clinic.week = 1; stale.clinic.spins = [{ slot: 0, coachId: a }]; assert.equal(canClinic(stale, a).ok, true, 'stale spins ignored');
});

test('pickable: covered players ok, cap and short TP greyed; none ok = no spin', () => {
  const s = fresh(), pv = netsPreview(s), pk = pickable(s);
  assert.ok(pv.trainIds.length > 0);
  assert.deepEqual(pk.filter((p) => p.ok).map((p) => p.playerId), pv.trainIds);
  const low = structuredClone(s); low.training.tp = 0;
  const pl = pickable(low); assert.ok(pl.every((p) => !p.ok)); assert.ok(pl.some((p) => p.why === 'No TP'));
  assert.equal(canClinic(low, ids(low)[0]).why, 'nobody');
  assert.equal(clinicReadyCount(low), 0);
  for (const p of pk) assert.equal(typeof p.why, 'string');
  const capped = structuredClone(s);
  for (const c of capped.clubs[0].squad) { c.bp = c.bs = c.spd = c.bsk = 99; }
  const pc = pickable(capped); assert.ok(pc.every((p) => !p.ok && p.why === 'At cap'));
  assert.deepEqual(pickable(null), []); assert.deepEqual(pickable({}), []);
});

test('clinicReadyCount: counts ready coaches, drops used, away, nets done; no coaches = 0', () => {
  const s = fresh(), n = coachList(s).length;
  assert.equal(clinicReadyCount(s), Math.min(3, n));
  const u = structuredClone(s); u.clinic.spins.push({ slot: 0, coachId: ids(s)[0], playerId: 'p', spinKey: 'k', spokePaid: 1 });
  assert.equal(clinicReadyCount(u), Math.min(3, n) - 1);
  const aw = structuredClone(s); for (const c of aw.coaches) c.away = 1; assert.equal(clinicReadyCount(aw), 0);
  const nd = structuredClone(s); nd.training.netsWeek = nd.training.week; assert.equal(clinicReadyCount(nd), 0);
  const none = structuredClone(s); none.coaches = []; assert.equal(clinicReadyCount(none), 0);
  for (const x of [null, undefined, {}, 5]) assert.equal(clinicReadyCount(x), 0);
});

test('hooks: netsRun sets netsDone, endWeek resets and stamps the new weekKey', async (t) => {
  if (!existsSync(new URL('../js/core/clinic-boost.js', import.meta.url))) return t.skip('clinic-boost.js not on disk yet');
  await import('../js/core/clinic-hooks.js');
  const s = fresh(); s.clinic.boost = { z: { pcts: [5], extraRun: false } }; s.clinic.spins = [{ slot: 0, coachId: ids(s)[0], playerId: 'p', spinKey: 'k', spokePaid: 1 }];
  const r = runNets(s, makeRng('clinic-hook'));
  assert.equal(r.state.clinic.netsDone, true);
  const e = endWeek(r.state);
  assert.deepEqual(e.clinic.spins, []); assert.deepEqual(e.clinic.boost, {}); assert.equal(e.clinic.pending, null); assert.equal(e.clinic.netsDone, false);
  assert.equal(e.clinic.week, weekKey(e)); assert.equal(e.clinic.week, weekKey(s) + 1);
});
