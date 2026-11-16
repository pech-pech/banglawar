// T1 K1: recordStop / spinKeyOf / statsOf / storedStop (CONTRACT-A s6/s7, Lead calls 6/9, wheels SPEC s13).
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordStop, markSpent, spinKeyOf, statsOf, storedStop, TAPS_MAX, WHEEL_MEDIAN } from '../js/core/wheel-stops.js';
import { runCourse } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';
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
  assert.equal(storedStop(n, 'spot', k).kept, 3, 'bad kept index: the earlier Pick Two choice stays'); assert.equal(storedStop(n, 'spot', k).spent, true, 'spent stays true');
  assert.equal(storedStop(n, 'spot', k).stops.length, 5);
});

test('stats: n always; careful > median (rec or opts); early < 3.2, late > 3.8; auto counts n only', () => {
  const n = {};
  recordStop(n, 'pep', 'a', rec({ value: 7.5, tInCycle: 3.1 }), { median: 5 }); // careful + early
  recordStop(n, 'pep', 'b', rec({ value: 5, tInCycle: 3.9, median: 5 })); // equal median: not careful; late
  recordStop(n, 'pep', 'c', rec({ value: 10, tInCycle: 3.2, median: 5 })); // careful; 3.2 is in the glow
  recordStop(n, 'pep', 'd', rec({ value: 10, tInCycle: 3.8, cycle: 4 })); // built-in Pep median 5: careful; 3.8 in glow
  recordStop(n, 'pep', 'e', rec({ value: 10, tInCycle: 1, auto: true }), { median: 5 }); // auto: n only, no tap
  assert.deepEqual(statsOf(n, 'pep'), { n: 5, careful: 3, early: 1, late: 1, taps: [{ cycle: 1, tInCycle: 3.1 }, { cycle: 1, tInCycle: 3.9 }, { cycle: 1, tInCycle: 3.2 }, { cycle: 4, tInCycle: 3.8 }] });
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
  assert.equal(spinKeyOf(s, 'match'), '', 'no ball: no occasion (never one shared entry for every ball)');
  for (const ball of [-1, 1.5, '3', null]) assert.equal(spinKeyOf(s, 'match', { ball: /** @type {any} */ (ball) }), '');
  assert.equal(spinKeyOf(s, 'match', { ball: 0 }), '2|league|8|z|0');
  for (const w of ['hype', 'toss', 'pep']) assert.equal(spinKeyOf(s, w), '2|league|8|z');
  assert.equal(spinKeyOf(s, 'scout'), '2');
  assert.equal(spinKeyOf({ ...s, fixture: { kind: 'semi', round: 10 } }, 'finals'), '2|semi|10');
  assert.notEqual(spinKeyOf({ ...s, fixture: { kind: 'semi', round: 10 } }, 'finals'), spinKeyOf({ ...s, fixture: { kind: 'final', round: 11 } }, 'finals'));
  assert.equal(spinKeyOf(s, 'spot'), '218|p1');
  assert.equal(spinKeyOf(s, 'course', { coachId: 'c1' }), '2|c1|1');
  assert.equal(spinKeyOf(s, 'course', { coachId: 'c1', k: 2 }), '2|c1|2');
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

const fourArg = (w, value, key = 'k') => { const n = {}; recordStop(n, w, key, { stopT: 1, cycle: 1, tInCycle: 3.5, sliceId: 0, value, auto: false, respin: 0 }); return statsOf(n, w).careful; };

test('H1: four-argument recordStop counts careful from the SPEC 13 median table (strictly greater)', () => {
  assert.deepEqual({ ...WHEEL_MEDIAN }, { spot: 1.0, course: 1, hype: 4, toss: 2.5, pep: 5, scout: 0.5, finals: 20 });
  assert.ok(Object.isFrozen(WHEEL_MEDIAN));
  const careful = { spot: [3, 1.5, 1.2], course: [4, 3, 2], hype: [6, 8], toss: [5], pep: [7.5, 10], scout: [1, 2], finals: [25, 30, 60] };
  const not = { spot: [1, 0.8], course: [1, 0], hype: [4, 2], toss: [2.5, 0], pep: [5, 2.5], scout: [0.5, 0, -1], finals: [20, 10] };
  for (const [w, vs] of Object.entries(careful)) for (const v of vs) assert.equal(fourArg(w, v), 1, `${w} ${v} careful`);
  for (const [w, vs] of Object.entries(not)) for (const v of vs) assert.equal(fourArg(w, v), 0, `${w} ${v} not careful`);
  assert.equal(fourArg('find', 1), 1, 'Find: FIND block'); assert.equal(fourArg('find', 0), 0, 'Find: CHEER');
  assert.equal(fourArg('match', 99), 0, 'match: caller passes careful (wheel-match SPEC 14)'); assert.equal(fourArg('clinic', 99), 0);
  const n = {}; // overrides: careful boolean, then median
  recordStop(n, 'spot', 'a', rec({ value: 3 }), { careful: false });
  recordStop(n, 'spot', 'b', rec({ value: 1.2 }), { median: 2 });
  recordStop(n, 'spot', 'c', rec({ value: 0.5, careful: true }));
  recordStop(n, 'find', 'd', rec({ value: 1 }), { careful: false });
  assert.equal(statsOf(n, 'spot').careful, 1); assert.equal(statsOf(n, 'find').careful, 0);
});

test('H2: the Course key is the same before and after runCourse in one dispatch; the Licence 2nd course is distinct via k', () => {
  const s = { season: { n: 2 }, coaches: [{ id: 'c1', name: 'A', step: 1, strong: ['bat'], away: 0, courseSeason: null }] };
  const before = spinKeyOf(s, 'course', { coachId: 'c1' });
  assert.equal(before, '2|c1|1');
  const n = structuredClone(s);
  recordStop(n, 'course', before, rec({ value: 2 }));
  const after = runCourse(n, makeRng('t'), 'c1', { gain: 2 }, true);
  assert.equal(after.coaches[0].courseSeason, 2, 'runCourse ran');
  assert.equal(spinKeyOf(after, 'course', { coachId: 'c1' }), before, 'same key after the course');
  assert.equal(storedStop(after, 'course', spinKeyOf(after, 'course', { coachId: 'c1' })).stops[0].value, 2, 'stored result found again');
  const k2 = spinKeyOf(after, 'course', { coachId: 'c1', k: 2 });
  assert.equal(k2, '2|c1|2'); assert.equal(storedStop(after, 'course', k2), null, 'Licence 2nd course spins fresh');
  const lic = { ...after, coaches: [{ ...after.coaches[0], away: 0, licenceSeason: 2 }] };
  assert.equal(spinKeyOf(lic, 'course', { coachId: 'c1', k: 2 }), k2, 'licenceSeason does not move k either');
});

test('M1: Finals key = season|kind|round of the semi / final, never a second shape; ctx override', () => {
  const s = { season: { n: 2 }, fixture: { kind: 'final', round: 11, extra: 1 } };
  assert.equal(spinKeyOf(s, 'finals'), '2|final|11');
  assert.equal(spinKeyOf({ ...s, fixture: { kind: 'final', round: 11, played: true, salt: 'q' } }, 'finals'), '2|final|11', 'other fixture fields do not move it');
  assert.notEqual(spinKeyOf({ ...s, fixture: { kind: 'semi', round: 10 } }, 'finals'), spinKeyOf(s, 'finals'));
  for (const fx of [null, undefined, {}, { kind: 'league', round: 8 }, { kind: 'final' }, { kind: 'final', round: '11' }]) assert.equal(spinKeyOf({ season: { n: 2 }, fixture: fx }, 'finals'), '');
  assert.equal(spinKeyOf({ season: { n: 2 }, fixture: null }, 'finals', { kind: 'semi', round: 10 }), '2|semi|10');
});

test('M2/L7: match key reads the season like the match-day wheels; recordStop no-ops on an empty key', () => {
  const s = { season: { n: -1 }, fixture: { kind: 'league', round: 3 }, salt: 'z' };
  assert.equal(spinKeyOf(s, 'match', { ball: 4 }), spinKeyOf(s, 'hype') + '|4');
  assert.ok(spinKeyOf(s, 'match', { ball: 4 }).startsWith('1|'));
  const n = {}; recordStop(n, 'match', spinKeyOf(s, 'match'), rec()); assert.equal('wheels' in n, false);
});

test('M3: markSpent writes spent at the press; a Pick Two choice survives a later stop', () => {
  const n = {};
  assert.equal(markSpent(n, 'spot', 'P'), n);
  assert.deepEqual(n.wheels.stops.spot.P, { stops: [], kept: 0, spent: true });
  assert.deepEqual(statsOf(n, 'spot'), ZERO, 'no stats on a press');
  recordStop(n, 'spot', 'P', rec({ value: 1.5 }));
  assert.equal(storedStop(n, 'spot', 'P').spent, true);
  for (const [w, k] of [['nope', 'k'], ['spot', '']]) { const m = {}; markSpent(m, w, k); assert.equal('wheels' in m, false); }
  assert.equal(markSpent(null, 'spot', 'k'), null);
  const t = {}; // the review's failing input
  recordStop(t, 'spot', 'T', rec({ value: 1 })); recordStop(t, 'spot', 'T', rec({ value: 2, kept: 0 })); recordStop(t, 'spot', 'T', rec({ value: 0.5 }));
  assert.equal(storedStop(t, 'spot', 'T').kept, 0, 'player pick kept');
  recordStop(t, 'spot', 'T', rec({ value: 9, kept: 3 }));
  assert.equal(storedStop(t, 'spot', 'T').kept, 3, 'a new explicit pick moves it');
  const a = {}; // Spin Again without a pick: higher value rule, tie keeps the first
  markSpent(a, 'toss', 'A'); recordStop(a, 'toss', 'A', rec({ value: 0 })); recordStop(a, 'toss', 'A', rec({ value: 5, respin: 1 }));
  assert.equal(storedStop(a, 'toss', 'A').kept, 1); assert.equal('keptBy' in storedStop(a, 'toss', 'A'), false);
});

test('M5: Spot / Course with no player / coach: empty key, nothing recorded', () => {
  const s = { season: { n: 2 }, training: { week: 18 }, coaches: [{ id: 'c1' }] };
  assert.equal(spinKeyOf(s, 'spot'), ''); assert.equal(spinKeyOf(s, 'course'), ''); assert.equal(spinKeyOf(s, 'course', { coachId: '' }), '');
  const n = {}; recordStop(n, 'spot', spinKeyOf(s, 'spot'), rec()); assert.equal('wheels' in n, false);
});

test('L8: StopRec fields clamped', () => {
  const n = {};
  recordStop(n, 'spot', 'k', { stopT: -5, cycle: -2, tInCycle: 9.5, sliceId: -3, value: 1, auto: false, respin: 7 });
  recordStop(n, 'spot', 'k', { stopT: NaN, cycle: 2.7, tInCycle: -1, sliceId: 4.6, value: 1, auto: false, respin: 0 });
  assert.deepEqual(n.wheels.stops.spot.k.stops, [
    { stopT: 0, cycle: 1, tInCycle: 6, sliceId: 0, value: 1, auto: false, respin: 1 },
    { stopT: 0, cycle: 2, tInCycle: 0, sliceId: 4, value: 1, auto: false, respin: 0 }]);
});
