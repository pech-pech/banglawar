// S0 (A1.6 + B1.2): new save keys with defaults, no VERSION bump. Wheels SPEC s13, coach-weekly SPEC s9, CONTRACT-A s6, CONTRACT-B s1-s2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadV7, v7Text } from './_v7-fixture.mjs';
import { VERSION, migrate, unwrap, wrap, fillSaveDefaults, normWheels, weekKey as wkReexport } from '../js/core/save-migrate.js';
import { weekKey, weekKeyOf } from '../js/core/week-key.js';
import { MAX_COACHES } from '../js/core/training.js';
import { WHEELS_DEFAULT, CLINIC_DEFAULT, SCOUT_DEFAULT, COACH_FIELDS_DEFAULT, REPORT_JOBS_DEFAULT } from '../js/data/save-defaults.js';

const NEW_TOP = ['wheels', 'clinic', 'report'];
const raw = () => JSON.parse(v7Text()).data;
/** Old view of a state: the new top-level keys removed, the new fields taken out of each staff coach and of s.scout. */
function oldView(s) {
  const o = structuredClone(s);
  for (const k of NEW_TOP) delete o[k];
  delete o.golden; delete o.goldCal; o.v = 7; // v7 -> v8 additions
  if (Array.isArray(o.coaches)) for (const c of o.coaches) if (c && !c.candidate) for (const k of Object.keys(COACH_FIELDS_DEFAULT)) delete c[k];
  if (o.scout) { for (const k of Object.keys(SCOUT_DEFAULT)) delete o.scout[k]; }
  return o;
}

test('VERSION is 8', () => { assert.equal(VERSION, 8); });

test('weekKey = season.n x 100 + training.week; pure; re-exported from save-migrate', () => {
  assert.equal(weekKeyOf(2, 18), 218);
  assert.equal(weekKey({ season: { n: 3 }, training: { week: 25 } }), 325);
  assert.equal(weekKey(raw()), 218, 'v7 fixture: season 2, week 18');
  assert.equal(wkReexport, weekKey);
  for (const bad of [null, undefined, 5, 'x', {}, { season: null, training: 'x' }, { season: { n: 'abc' }, training: { week: NaN } }]) assert.equal(typeof weekKey(bad), 'number');
  assert.equal(weekKey({}), 100, 'missing season reads 1, missing week 0');
});

test('v7 fixture loads; every new key has its default', () => {
  const s = loadV7();
  assert.equal(s.v, 8);
  assert.deepEqual(s.wheels, { stops: {}, pepRingOffset: {}, pepSlot: {}, scoutCards: {}, stats: {} });
  assert.deepEqual(s.clinic, { ...structuredClone(CLINIC_DEFAULT), week: 218, slots: MAX_COACHES, netsDone: s.training.netsWeek === s.training.week });
  assert.equal(s.clinic.slots, 3);
  assert.deepEqual(s.report, { jobs: structuredClone(REPORT_JOBS_DEFAULT) });
  assert.equal(s.scout.bonusNames, 0); assert.equal(s.scout.extraThisSeason, 0);
  assert.ok(s.coaches.length >= 1);
  for (const c of s.coaches) for (const [k, v] of Object.entries(COACH_FIELDS_DEFAULT)) assert.deepEqual(c[k], v, `${c.id}.${k}`);
});

test('old fields are byte-equal after load (top level and inside coaches / scout)', () => {
  const before = raw(), after = loadV7();
  for (const k of Object.keys(before)) assert.equal(JSON.stringify(oldView(after)[k]), JSON.stringify(before[k]), k);
  assert.deepEqual(Object.keys(oldView(after)).sort(), Object.keys(before).sort(), 'no other key added or removed');
  assert.deepEqual({ n: after.scout.n, signed: after.scout.signed, passed: after.scout.passed }, before.scout);
});

test('defaults are deep clones (no shared references with the constants or between coaches)', () => {
  const a = loadV7(), b = loadV7();
  a.wheels.stops.x = 1; a.clinic.spins.push(1); a.clinic.stats.slices.S = 9; a.report.jobs.xp.nets = 5;
  assert.deepEqual(b.wheels.stops, {}); assert.deepEqual(b.clinic.spins, []); assert.equal(b.clinic.stats.slices.S, 0); assert.equal(b.report.jobs.xp.nets, 0);
  assert.deepEqual(WHEELS_DEFAULT.stops, {}); assert.deepEqual(CLINIC_DEFAULT.spins, []); assert.equal(CLINIC_DEFAULT.stats.slices.S, 0); assert.equal(REPORT_JOBS_DEFAULT.xp.nets, 0);
});

test('fill is idempotent and the save round-trips through the envelope', () => {
  const s = loadV7(), again = fillSaveDefaults(structuredClone(s));
  assert.deepEqual(again, s);
  const r = unwrap(JSON.stringify(wrap(s)));
  assert.equal(r.ok, true); assert.deepEqual(r.state, s);
});

test('partial objects fill without throwing; present non-default values are kept', () => {
  const d = raw();
  d.wheels = { stats: { toss: { n: 4, careful: 1, early: 0, late: 2, taps: [{ cycle: 2, tInCycle: 3.5 }] } }, pepSlot: { md1: 4 } }; // no stops
  d.clinic = { week: 217, spins: [{ slot: 0, coachId: 'k0', playerId: 'c0p1', spinKey: '217:k0', spokePaid: 1 }], stats: { boostedGain: 3 } }; // stats.slices missing
  d.report = { other: 1 }; // no jobs
  d.scout = { ...d.scout, bonusNames: 2 };
  d.coaches[0].xp = 40; d.coaches[0].job = 'nets'; d.coaches[0].jobWeek = 217;
  const s = migrate(d, 7).state;
  assert.deepEqual(s.wheels.stops, {}); assert.deepEqual(s.wheels.stats.toss.taps, [{ cycle: 2, tInCycle: 3.5 }]); assert.equal(s.wheels.pepSlot.md1, 4);
  assert.equal(s.clinic.week, 217, 'stored week kept (reader ignores a stale week)'); assert.equal(s.clinic.spins.length, 1);
  assert.equal(s.clinic.stats.boostedGain, 3); assert.deepEqual(s.clinic.stats.slices, { S: 0, M: 0, L: 0, JP: 0 }); assert.equal(s.clinic.netsDone, s.training.netsWeek === s.training.week);
  assert.equal(s.report.other, 1); assert.deepEqual(s.report.jobs, REPORT_JOBS_DEFAULT);
  assert.equal(s.scout.bonusNames, 2); assert.equal(s.scout.extraThisSeason, 0); assert.equal(s.scout.n, d.scout.n);
  assert.equal(s.coaches[0].xp, 40); assert.equal(s.coaches[0].job, 'nets'); assert.equal(s.coaches[0].jobWeek, 217); assert.equal(s.coaches[0].stepsXp, 0);
});

test('garbage types are replaced by the default; right-typed odd values are left for the reader to clamp', () => {
  const d = raw();
  d.wheels = { stops: [], stats: 'x', pepRingOffset: null, scoutCards: 5 };
  d.clinic = { week: 'soon', slots: NaN, netsDone: 'yes', spins: {}, boost: [], stats: { slices: 7, netGain: Infinity }, pending: 'p' };
  d.report = { jobs: [] };
  d.scout = 'gone';
  d.coaches[0].xp = 'lots'; d.coaches[0].job = 'clinic'; d.coaches[0].stepUpPending = -2; d.coaches[0].xpTotal = null;
  let r; assert.doesNotThrow(() => { r = migrate(d, 7); }); const s = r.state;
  assert.equal(r.ok, true);
  assert.deepEqual(s.wheels, { stops: {}, stats: {}, pepRingOffset: {}, scoutCards: {}, pepSlot: {} });
  assert.equal(s.clinic.week, 218); assert.equal(s.clinic.slots, MAX_COACHES); assert.equal(typeof s.clinic.netsDone, 'boolean');
  assert.deepEqual(s.clinic.spins, []); assert.deepEqual(s.clinic.boost, {}); assert.deepEqual(s.clinic.stats.slices, { S: 0, M: 0, L: 0, JP: 0 }); assert.equal(s.clinic.stats.netGain, 0);
  assert.equal(s.clinic.pending, 'p', 'null default: any present value kept, the reader clamps');
  assert.deepEqual(s.report.jobs, REPORT_JOBS_DEFAULT);
  assert.deepEqual(s.scout, { bonusNames: 0, extraThisSeason: 0 });
  assert.equal(s.coaches[0].xp, 0); assert.equal(s.coaches[0].xpTotal, 0, 'null where a number belongs is a wrong type');
  assert.equal(s.coaches[0].job, 'clinic', 'a string job is kept; the reader maps unknown jobs to study');
  assert.equal(s.coaches[0].stepUpPending, -2, 'a number is kept; the reader clamps');
});

test('candidates get no coach fields; non-object coaches and a missing coaches list do not throw', () => {
  const d = raw(); d.coaches = [...d.coaches, { id: 'kc', name: 'Cand', candidate: true }, null, 7];
  const s = migrate(d, 7).state;
  assert.equal('xp' in s.coaches[2], false); assert.equal(s.coaches[3], null); assert.equal(s.coaches[4], 7);
  const e = raw(); delete e.coaches; assert.doesNotThrow(() => migrate(e, 7));
  assert.equal(normWheels(null), null); assert.equal(fillSaveDefaults('x'), 'x');
});

test('the migrate input is never mutated', () => {
  const d = raw(), before = JSON.stringify(d);
  migrate(d, 7); assert.equal(JSON.stringify(d), before);
});

test('v4-save-10.json still migrates to 7 with every new key', () => {
  const env = JSON.parse(readFileSync(new URL('./fixtures/v4-save-10.json', import.meta.url), 'utf8'));
  const r = unwrap(JSON.stringify(env));
  assert.equal(r.ok, true, r.reason); assert.equal(r.from, 4); assert.equal(r.state.v, 8);
  const s = r.state;
  assert.deepEqual(s.wheels, { stops: {}, pepRingOffset: {}, pepSlot: {}, scoutCards: {}, stats: {} });
  assert.equal(s.clinic.week, weekKey(s)); assert.deepEqual(s.report.jobs, REPORT_JOBS_DEFAULT);
  assert.equal(s.scout.bonusNames, 0);
  for (const c of s.coaches) assert.equal(c.xp, 0, 'old xp map dropped, new xp 0');
  assert.deepEqual(migrate(s, 7).state, s, 'idempotent after the old steps');
});
