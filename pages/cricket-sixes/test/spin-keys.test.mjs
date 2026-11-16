// T1 K1: spin key accessors (CONTRACT-A s7, Lead call 5). Pure, deterministic, never throw on partial saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, weekOf, seasonIdOf, matchDayIdOf, occasionIdOf } from '../js/core/spin-keys.js';
import { matchKeyOf } from '../js/core/wheelmeta.js';
import { roundKey } from '../js/core/activities.js';
import { weekKey } from '../js/core/week-key.js';
import { loadV7 } from './_v7-fixture.mjs';

const GARBAGE = [undefined, null, 0, 'x', [], {}, { season: null }, { season: 'x', training: 5 }, { season: { n: -3 }, training: { week: 'q' } },
  { fixture: 'bad' }, { fixture: {}, season: { n: NaN } }, { training: { sel: null } }, { coaches: 'x' }, { coaches: [null, 1] }];

test('seasonOf: s.season.n, default 1', () => {
  assert.equal(seasonOf({ season: { n: 3 } }), 3);
  assert.equal(seasonOf({ season: { n: '2' } }), 2);
  for (const s of [undefined, null, {}, { season: {} }, { season: { n: 0 } }, { season: { n: -1 } }, { season: { n: 'z' } }]) assert.equal(seasonOf(s), 1);
});

test('weekOf: s.training.week, default 0', () => {
  assert.equal(weekOf({ training: { week: 18 } }), 18);
  for (const s of [undefined, {}, { training: {} }, { training: { week: null } }, { training: { week: -2 } }]) assert.equal(weekOf(s), 0);
});

test('seasonIdOf / matchDayIdOf', () => {
  const s = { season: { n: 2 }, fixture: { kind: 'league', round: 8 }, salt: 'ab' };
  assert.equal(seasonIdOf(s), '2');
  assert.equal(seasonIdOf({}), '1');
  assert.equal(matchDayIdOf(s), '2|league|8|ab');
  assert.equal(matchDayIdOf(s), matchKeyOf(s));
  assert.equal(matchDayIdOf({ season: { n: 2 } }), '');
  assert.notEqual(matchDayIdOf(s), matchDayIdOf({ ...s, salt: 'cd' }), 'a reseed is a new match day');
  assert.notEqual(matchDayIdOf(s), matchDayIdOf({ ...s, fixture: { kind: 'semi', round: 10 } }));
});

test('occasionIdOf spot: weekKey + player, slot 2 marked; reads the plan when ctx has no player', () => {
  const s = { season: { n: 2 }, training: { week: 18, spotlight_id: 'p1', spotlight2_id: 'p2' } };
  assert.equal(occasionIdOf(s, 'spot'), '218|p1');
  assert.equal(occasionIdOf(s, 'spot', { slot: 2 }), '218|p2|2');
  assert.equal(occasionIdOf(s, 'spot', { playerId: 'p9' }), '218|p9');
  assert.equal(occasionIdOf({ season: { n: 2 }, training: { week: 18, sel: { spotlightId: 'p3' } } }, 'spot'), '218|p3');
  assert.notEqual(occasionIdOf(s, 'spot'), occasionIdOf({ ...s, training: { ...s.training, week: 19 } }, 'spot'));
});

test('occasionIdOf course: season + coach + nth course this season', () => {
  const s = { season: { n: 2 }, coaches: [{ id: 'c1', courseSeason: null }, { id: 'c2', courseSeason: 2 }, { id: 'c3', courseSeason: 1 }] };
  assert.equal(occasionIdOf(s, 'course', { coachId: 'c1' }), '2|c1|1');
  assert.equal(occasionIdOf(s, 'course', { coachId: 'c2' }), '2|c2|2', 'Master Licence 2nd course gets its own key');
  assert.equal(occasionIdOf(s, 'course', { coachId: 'c3' }), '2|c3|1');
  assert.equal(occasionIdOf(s, 'course', { coachId: 'c2', k: 1 }), '2|c2|1');
});

test('occasionIdOf find: the round key; other wheels empty', () => {
  const s = { season: { n: 2, round: 8, phase: 'league' } };
  assert.equal(occasionIdOf(s, 'find'), roundKey(s));
  assert.equal(occasionIdOf(s, 'find'), '2.20');
  assert.equal(occasionIdOf({ season: { n: 2, phase: 'final' } }, 'find'), '2.23');
  for (const w of ['hype', 'match', 'nope', undefined]) assert.equal(occasionIdOf(s, /** @type {any} */ (w)), '');
});

test('never throws on partial saves; always strings; deterministic', () => {
  for (const s of GARBAGE) {
    assert.equal(typeof seasonOf(s), 'number'); assert.equal(typeof weekOf(s), 'number');
    assert.equal(typeof seasonIdOf(s), 'string'); assert.equal(typeof matchDayIdOf(s), 'string');
    for (const w of ['spot', 'course', 'find', 'x']) for (const ctx of [undefined, null, {}, { slot: 2, coachId: 5, playerId: {} }]) {
      const a = occasionIdOf(s, w, /** @type {any} */ (ctx));
      assert.equal(typeof a, 'string'); assert.equal(a, occasionIdOf(s, w, /** @type {any} */ (ctx)));
    }
  }
});

test('v7 fixture: keys from the migrated save', () => {
  const s = loadV7();
  assert.equal(seasonOf(s), 2); assert.equal(weekOf(s), 18); assert.equal(seasonIdOf(s), '2');
  assert.equal(matchDayIdOf(s), matchKeyOf(s));
  assert.equal(matchDayIdOf(s), '2|league|8|');
  assert.equal(occasionIdOf(s, 'find'), roundKey(s));
  assert.ok(occasionIdOf(s, 'spot').startsWith(String(weekKey(s)) + '|'));
});
