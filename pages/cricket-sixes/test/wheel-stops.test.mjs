// T1 K1: recordStop / spinKeyOf / statsOf / storedStop (CONTRACT-A s6/s7, Lead calls 6/9, wheels SPEC s13).
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordStop, spinKeyOf, statsOf, storedStop, TAPS_MAX } from '../js/core/wheel-stops.js';
import { normWheels, fillSaveDefaults } from '../js/core/save-migrate.js';
import { WHEELS_DEFAULT } from '../js/data/save-defaults.js';
import { WHEEL_STOP_IDS } from '../js/data/wheel-engine.js';
import { matchKeyOf } from '../js/core/wheelmeta.js';
import { roundKey } from '../js/core/activities.js';
import { loadV7, v7Text } from './_v7-fixture.mjs';

const rec = (o = {}) => ({ stopT: 4100, cycle: 1, tInCycle: 3.5, sliceId: 3, value: 1.5, auto: false, respin: 0, ...o });
const ZERO = { n: 0, careful: 0, early: 0, late: 0, taps: [] };

test('recordStop creates wheels and the entry with the normWheels defaults; returns the same draft', () => {
  const n = {};
  const out = recordStop(n, 'spot', '218|p1', rec(), { median: 1 });
  assert.equal(out, n);
  assert.deepEqual(Object.keys(n.wheels).sort(), Object.keys(WHEELS_DEFAULT).sort());
  const ref = normWheels({}); for (const k of Object.keys(WHEELS_DEFAULT)) if (k !== 'stops' && k !== 'stats') assert.deepEqual(n.wheels[k], ref.wheels[k]);
  assert.deepEqual(n.wheels.stops.spot['218|p1'], { stops: [rec()], kept: 0, spent: false });
  const m = { wheels: { stops: 'bad', pepSlot: { x: 3 } } };
  recordStop(m, 'pep', 'k', rec());
  assert.deepEqual(m.wheels.pepSlot, { x: 3 }, 'present sub-maps untouched');
  assert.ok(m.wheels.stops.pep.k);
});

test('StopRec cleaned: types, paid kept only when a number, helper fields not stored', () => {
  const n = {};
  recordStop(n, 'finals', '2|final|11', { stopT: 12.7, cycle: 0, tInCycle: '3', sliceId: 2.9, value: 25, paid: 30, auto: 1, respin: 5, median: 20, kept: 0, spent: false, careful: true, junk: 1 });
  assert.deepEqual(n.wheels.stops.finals['2|final|11'].stops[0], { stopT: 12, cycle: 1, tInCycle: 0, sliceId: 2, value: 25, paid: 30, auto: true, respin: 1 });
  recordStop(n, 'toss', 'k', rec({ paid: 'x' }));
  assert.equal('paid' in n.wheels.stops.toss.k.stops[0], false);
});

test('kept = highest value, tie keeps the first; rec.kept wins when valid; spent sticky', () => {
  const n = {}, k = 'K';
  recordStop(n, 'spot', k, rec({ value: 1.2 }));
  recordStop(n, 'spot', k, rec({ value: 3, respin: 1 }));
  assert.equal(storedStop(n, 'spot', k).kept, 1);
  recordStop(n, 'spot', k, rec({ value: 3, respin: 1 }));
  assert.equal(storedStop(n, 'spot', k).kept, 1, 'tie keeps first');
  const t = {}; recordStop(t, 'hype', 'h', rec({ value: 4 })); recordStop(t, 'hype', 'h', rec({ value: 4 }));
  assert.equal(storedStop(t, 'hype', 'h').kept, 0);
  recordStop(n, 'spot', k, rec({ value: 0.5, kept: 3, spent: true }));
  assert.equal(storedStop(n, 'spot', k).kept, 3); assert.equal(storedStop(n, 'spot', k).spent, true);
  recordStop(n, 'spot', k, rec({ value: 0.1, kept: 99, spent: false }));
  assert.equal(storedStop(n, 'spot', k).kept, 1, 'bad kept index -> highest'); assert.equal(storedStop(n, 'spot', k).spent, true, 'spent stays true');
  assert.equal(storedStop(n, 'spot', k).stops.length, 5);
});

test('stats: n always; careful > median (rec or opts); early < 3.2, late > 3.8; auto counts n only', () => {
  const n = {};
  recordStop(n, 'pep', 'a', rec({ value: 7.5, tInCycle: 3.1 }), { median: 5 }); // careful + early
  recordStop(n, 'pep', 'b', rec({ value: 5, tInCycle: 3.9, median: 5 })); // equal median: not careful; late
  recordStop(n, 'pep', 'c', rec({ value: 10, tInCycle: 3.2, median: 5 })); // careful; 3.2 is in the glow
  recordStop(n, 'pep', 'd', rec({ value: 10, tInCycle: 3.8, cycle: 4 })); // no median: careful not counted; 3.8 in glow
  recordStop(n, 'pep', 'e', rec({ value: 10, tInCycle: 1, auto: true }), { median: 5 }); // auto: n only, no tap
  assert.deepEqual(statsOf(n, 'pep'), { n: 5, careful: 2, early: 1, late: 1, taps: [{ cycle: 1, tInCycle: 3.1 }, { cycle: 1, tInCycle: 3.9 }, { cycle: 1, tInCycle: 3.2 }, { cycle: 4, tInCycle: 3.8 }] });
});

test('Find: careful boolean (FIND block) wins over the median', () => {
  const n = {};
  recordStop(n, 'find', 'f1', rec({ value: 0 }), { careful: true });
  recordStop(n, 'find', 'f2', rec({ value: 9, careful: false }), { median: 1 });
  recordStop(n, 'find', 'f3', rec({ value: 0, careful: true, auto: true }));
  assert.equal(statsOf(n, 'find').careful, 1); assert.equal(statsOf(n, 'find').n, 3);
});

test('taps keep the last 200', () => {
  const n = {};
  for (let i = 0; i < 230; i++) recordStop(n, 'match', 'm|' + i, rec({ cycle: 1 + (i % 5), tInCycle: i / 100 }));
  const st = statsOf(n, 'match');
  assert.equal(st.n, 230); assert.equal(st.taps.length, TAPS_MAX);
  assert.deepEqual(st.taps[0], { cycle: 1 + (30 % 5), tInCycle: 0.3 });
  assert.deepEqual(st.taps[199], { cycle: 1 + (229 % 5), tInCycle: 2.29 });
  assert.equal(n.wheels.stats.match.taps.length, TAPS_MAX);
});

test('records nothing on bad input; never throws', () => {
  for (const [w, k] of [['nope', 'k'], ['spot', ''], ['spot', 5], [undefined, 'k']]) { const n = {}; assert.equal(recordStop(n, /** @type {any} */ (w), /** @type {any} */ (k), rec()), n); assert.equal('wheels' in n, false); }
  for (const n of [null, undefined, 3, 'x']) assert.equal(recordStop(/** @type {any} */ (n), 'spot', 'k', rec()), n);
  const n = { wheels: { stats: { spot: { n: 'x', taps: 'y' } }, stops: { spot: { k: { stops: 'bad' } } } } };
  recordStop(n, 'spot', 'k', null);
  assert.equal(n.wheels.stops.spot.k.stops.length, 1); assert.equal(n.wheels.stats.spot.n, 1);
});

test('statsOf defaults and copies; storedStop null when unspun', () => {
  for (const s of [undefined, null, {}, { wheels: null }, { wheels: { stats: 'x' } }, { wheels: { stats: { spot: 3 } } }]) assert.deepEqual(statsOf(s, 'spot'), ZERO);
  const n = {}; recordStop(n, 'toss', 'k', rec());
  const a = statsOf(n, 'toss'); a.n = 99; a.taps.push({}); assert.equal(statsOf(n, 'toss').n, 1);
  assert.equal(storedStop(n, 'toss', 'k'), n.wheels.stops.toss.k);
  for (const [s, w, k] of [[n, 'toss', 'other'], [n, 'pep', 'k'], [{}, 'toss', 'k'], [null, 'toss', 'k'], [{ wheels: { stops: { toss: { k: 1 } } } }, 'toss', 'k']]) assert.equal(storedStop(s, w, k), null);
});

test('spinKeyOf per CONTRACT-A s7', () => {
  const s = { season: { n: 2, round: 8, phase: 'league' }, fixture: { kind: 'league', round: 8 }, salt: 'z', training: { week: 18, spotlight_id: 'p1' }, coaches: [{ id: 'c1' }] };
  assert.equal(spinKeyOf(s, 'match', { ball: 7 }), matchKeyOf(s) + '|7');
  assert.equal(spinKeyOf(s, 'match'), '2|league|8|z|0');
  for (const w of ['hype', 'toss', 'pep']) assert.equal(spinKeyOf(s, w), '2|league|8|z');
  assert.equal(spinKeyOf(s, 'scout'), '2');
  assert.equal(spinKeyOf({ ...s, fixture: { kind: 'semi', round: 10 } }, 'finals'), '2|semi|10');
  assert.notEqual(spinKeyOf({ ...s, fixture: { kind: 'semi', round: 10 } }, 'finals'), spinKeyOf({ ...s, fixture: { kind: 'final', round: 11 } }, 'finals'));
  assert.equal(spinKeyOf(s, 'spot'), '218|p1');
  assert.equal(spinKeyOf(s, 'course', { coachId: 'c1' }), '2|c1|1');
  assert.equal(spinKeyOf(s, 'find'), roundKey(s));
  assert.equal(spinKeyOf(s, 'clinic', { slot: 1 }), '218:1');
  assert.equal(spinKeyOf(s, 'clinic'), '218:0');
  assert.equal(spinKeyOf(s, 'clinic', { coachId: 'c3', slot: 1 }), '218:c3');
  const bare = { season: { n: 2 } };
  for (const w of ['match', 'hype', 'toss', 'pep']) assert.equal(spinKeyOf(bare, w), '');
  for (const s2 of [undefined, null, {}, { fixture: 'x' }, { season: 'q', training: null }]) for (const w of [...WHEEL_STOP_IDS, 'zzz']) assert.equal(typeof spinKeyOf(s2, w, /** @type {any} */ (null)), 'string');
});

test('v7 fixture: unspun, default stats; recordStop on a migrated draft leaves old fields byte-equal', () => {
  const s = loadV7();
  for (const w of WHEEL_STOP_IDS) { assert.deepEqual(statsOf(s, w), ZERO); assert.equal(storedStop(s, w, spinKeyOf(s, w)), null); }
  const n = structuredClone(s), before = structuredClone(s);
  const key = spinKeyOf(n, 'toss');
  assert.equal(key, '2|league|8|');
  recordStop(n, 'toss', key, rec({ value: 5 }), { median: 2.5 });
  assert.equal(storedStop(n, 'toss', key).stops[0].value, 5);
  assert.equal(statsOf(n, 'toss').careful, 1);
  const strip = (x) => { const o = structuredClone(x); delete o.wheels; return JSON.stringify(o); };
  assert.equal(strip(n), strip(before));
  assert.deepEqual(s, before, 'input not mutated');
  const raw = JSON.parse(v7Text()).data; assert.equal('wheels' in raw, false);
  const r = structuredClone(raw); recordStop(r, 'pep', spinKeyOf(r, 'pep'), rec());
  assert.deepEqual(Object.keys(r.wheels).sort(), Object.keys(fillSaveDefaults(structuredClone(raw)).wheels).sort());
});
