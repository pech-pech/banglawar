import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { scoutSpin } from '../js/store/spins/scout.js';
import { canScoutSpin } from '../js/store/wmstore.js';
import { scoutSliceRow } from '../js/store/wheels/scout.js';
import { scoutList, passScout, signCoach, canSign, scoutCandidates } from '../js/core/training.js';

FLAGS.wheelMeta = true;
const base = () => ({ seed: 'abc', season: { n: 2, league: 3, seed: 'abc|s2', results: [] }, scout: null, wheelMeta: null, training: { week: 1 }, clubs: [], coaches: [] });
const stop = (sliceId) => ({ stop: { sliceId, stopT: 3500, cycle: 1, tInCycle: 3.5 } });
const played = (s) => ({ ...s, season: { ...s.season, results: [...s.season.results, { kind: 'league' }] } });

test('pass: closed now, open after one match, can spin again with a fresh card', () => {
  let s = scoutSpin(base(), stop(0));
  assert.ok(scoutSliceRow(s));
  s = passScout(s);
  assert.equal(canSign(s).ok, false); assert.equal(canSign(s).why, 'closed');
  assert.deepEqual(scoutList(s), []);
  assert.equal(canScoutSpin(s, () => scoutList(s)), false);
  s = played(s);
  assert.equal(canSign(s).ok, true);
  assert.ok(scoutList(s).length > 0);
  assert.equal(scoutSliceRow(s), null); // landed card reset
  assert.equal(canScoutSpin(s, () => scoutList(s)), true);
  const t = scoutSpin(s, stop(1));
  assert.equal(scoutSliceRow(t).sliceId, 1);
  const again = passScout(t); // pass again: shut again until the next match
  assert.equal(canSign(again).ok, false);
  assert.equal(canSign(played(again)).ok, true);
});

test('hire: shut after the next match too, open next season', () => {
  let s = base();
  const id = scoutCandidates(s)[0].id;
  s = signCoach(s, id);
  assert.equal(canSign(s).ok, false);
  s = played(played(s));
  assert.equal(canSign(s).ok, false);
  assert.equal(passScout(s), s);
  s = { ...s, season: { ...s.season, n: 3, results: [] } };
  assert.equal(canSign(s).ok, true);
});

test('pass then reopen then hire: shut for the season', () => {
  let s = played(passScout(base()));
  s = signCoach(s, scoutCandidates(s)[0].id);
  assert.equal(canSign(played(played(s))).ok, false);
});

test('old save (passed:true, no passAt) stays shut for the season, loads without error', () => {
  const s = { ...base(), scout: { n: 2, signed: null, passed: true, bonusNames: 0, extraThisSeason: 0 } };
  assert.equal(canSign(played(played(s))).ok, false);
  assert.equal(canSign({ ...s, season: { ...s.season, n: 3 } }).ok, true);
  const bad = { ...base(), scout: 'junk', season: { n: 2 } };
  assert.doesNotThrow(() => canSign(bad));
  assert.doesNotThrow(() => passScout(bad));
});
