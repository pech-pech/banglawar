import test from 'node:test'; import assert from 'node:assert/strict';
import { planOf, setPlan, pickWeekCoach, coachQuality, coachList, scoutList, signCoach, passScout, releaseCoach, canSign, courseCost, canCourse, runCourse, courseWheel, spinResult, runNets, endWeek, coachFromOld, coachLevel, startCoach, effortOdds } from '../js/core/training.js';
import { treeBoost } from '../js/core/skills.js';
import { game, K, makeRng } from './_tr2-fixture.mjs';

test('start coach is step 4 strong Batting + Bowling', () => { const c = startCoach('k0', 'Mercer'); assert.equal(c.step, 4); assert.deepEqual(c.strong, ['bat', 'bowl']); });

test('quality = 0.95 x step only when the picked coach is strong in the focus', () => {
  const s = game({ coaches: [K({ step: 10, strong: ['bat'] })], plan: { focus: 'bat', effort: 'normal' } });
  assert.equal(coachQuality(s), 0, 'not picked');
  const p = pickWeekCoach(s, 'k1'); assert.ok(Math.abs(coachQuality(p) - 9.5) < 1e-9);
  assert.equal(coachQuality(setPlan(p, { focus: 'bowl' })), 0); assert.equal(coachQuality(setPlan(p, { focus: 'bal' })), 0);
  assert.ok(Math.abs(coachQuality(pickWeekCoach(game({ coaches: [K({ step: 21, strong: ['bal'] })], plan: { focus: 'bal', effort: 'easy' } }), 'k1')) - 19.95) < 1e-9);
  assert.equal(pickWeekCoach(s, 'nobody'), s); assert.equal(planOf(pickWeekCoach(p, null)).coachId, null);
});

test('coach Quality shifts the nets odds (Okay minus Q, Good/Great plus Q/2)', () => {
  const o = effortOdds('normal', 9.5); assert.ok(Math.abs(o.okay - 50.5) < 1e-9); assert.ok(Math.abs(o.great - 14.75) < 1e-9);
  const s = pickWeekCoach(game({ nets: 2, coaches: [K({ step: 10, strong: ['bat'] })], plan: { focus: 'bat', effort: 'normal' } }), 'k1');
  assert.ok(Math.abs(coachQuality(s) - 9.5) < 1e-9);
});

test('scout list counts and centres per league', () => {
  const counts = [2, 2, 3, 3, 3], centre = [5, 8, 11, 14, 17];
  for (let L = 1; L <= 5; L++) {
    const sums = []; let first = null;
    for (let n = 1; n <= 40; n++) {
      const l = scoutList(game({ league: L, n, coaches: [] })); if (!first) first = l;
      assert.equal(l.length, counts[L - 1]);
      for (const c of l) { assert.ok(Math.abs(c.step - centre[L - 1]) <= 2); assert.ok(c.strong.length >= 1 && c.strong.length <= 2); sums.push(c.step); }
    }
    const avg = sums.reduce((a, b) => a + b, 0) / sums.length; assert.ok(Math.abs(avg - centre[L - 1]) < 0.6, `L${L} ${avg}`);
    assert.deepEqual(first, scoutList(game({ league: L, n: 1, coaches: [] })), 'deterministic');
  }
});

test('sign once a season, 3 slots, release to free a slot', () => {
  let s = game({ coaches: [K()], league: 3, n: 2 });
  const l = scoutList(s); assert.equal(l.length, 3);
  s = signCoach(s, l[0].id); assert.equal(coachList(s).length, 2); assert.deepEqual(scoutList(s), []); assert.equal(canSign(s).why, 'closed');
  assert.equal(signCoach(s, l[1].id), s);
  const next = { ...s, season: { n: 3, league: 3 } }, l3 = scoutList(next);
  let f = signCoach(next, l3[0].id); assert.equal(coachList(f).length, 3);
  const full = { ...f, season: { n: 4, league: 3 } }; assert.equal(canSign(full).why, 'full'); assert.equal(signCoach(full, scoutList(full)[0].id), full);
  const rel = releaseCoach(full, 'k1'); assert.equal(coachList(rel).length, 2); assert.equal(canSign(rel).ok, true);
  assert.equal(releaseCoach(full, 'zz'), full);
  const pass = passScout(next); assert.deepEqual(scoutList(pass), []);
});

test('course: price, one per coach per season, away one week, wheel adds steps, cap 21', () => {
  const s = game({ coaches: [K({ step: 8 })], league: 4 });
  assert.equal(courseCost(s, 'k1'), Math.round((24 + 48) * 1.95));
  assert.equal(courseCost(game({ coaches: [K({ step: 1 })], league: 1 }), 'k1'), 30); assert.equal(courseCost(game({ coaches: [K({ step: 21 })], league: 1 }), 'k1'), 150);
  assert.equal(courseCost(game({ coaches: [K({ step: 8 })], league: 2 }), 'k1'), 90);
  assert.deepEqual(canCourse(s, 'k1'), { ok: true, why: '' });
  const t = runCourse(s, makeRng('c'), 'k1', { gain: 2 });
  const c = coachList(t)[0]; assert.equal(c.step, 10); assert.equal(c.away, 1);
  assert.equal(canCourse(t, 'k1').ok, false);
  const wk = pickWeekCoach(t, 'k1'); assert.equal(wk, t, 'away coach cannot be picked');
  const e = endWeek(t); assert.equal(coachList(e)[0].away, 0); assert.equal(canCourse(e, 'k1').why, 'season');
  assert.equal(canCourse({ ...e, season: { n: 2, league: 4 } }, 'k1').ok, true);
  assert.equal(coachList(runCourse(game({ coaches: [K({ step: 20 })] }), makeRng('c'), 'k1', { gain: 3 }))[0].step, 21);
  assert.equal(canCourse(game({ coaches: [K({ step: 21 })] }), 'k1').why, 'max');
  assert.equal(runCourse(s, makeRng('c'), 'zz', { gain: 2 }), s);
});

test('course with Coins: needs coins, deducts the price', () => {
  const s = { ...game({ coaches: [K({ step: 8 })], league: 1 }), econ: { coins: 71 } };
  assert.equal(canCourse(s, 'k1').why, 'coins');
  const t = { ...s, econ: { coins: 100 } }, r = runCourse(t, makeRng('c'), 'k1', { gain: 1 });
  assert.equal(r.econ.coins, 100 - 72); assert.equal(t.econ.coins, 100);
});

test('course wheel spin without a given result uses the rng', () => {
  const s = game({ coaches: [K({ step: 8 })] }), r = runCourse(s, makeRng('x'), 'k1', null);
  const g = coachList(r)[0].step - 8; assert.ok(g >= 1 && g <= 3);
  const cw = courseWheel(8); assert.equal(spinResult({ random: () => 0 }, cw, { t: 3, phi: 0.2, e: 0 }).gain, spinResult({ random: () => 0 }, cw, { t: 3, phi: 0.325, e: 0 }).gain); // the stop decides, not an aim roll
});

test('away coach does not help; wheel uses the coach step', () => {
  const s = game({ coaches: [K({ step: 12, strong: ['bat'], away: 1 })], plan: { focus: 'bat', effort: 'normal' } });
  assert.equal(coachQuality(pickWeekCoach(s, 'k1')), 0);
});

test('old coach maps to the new shape; skills boost reads it', () => {
  const old = { id: 'k9', name: 'Old', candidate: false, lv: { Power: 3, Technique: 0, Pace: 1, Craft: 0 }, xp: {} };
  const n = coachFromOld(old); assert.equal(n.step, 13); assert.deepEqual(n.strong, ['bat']);
  assert.equal(coachFromOld({ ...old, lv: { Power: 0, Technique: 0, Pace: 5, Craft: 0 } }).step, 19);
  assert.equal(coachFromOld({ ...old, lv: { Power: 9, Technique: 0, Pace: 9, Craft: 0 } }).step, 21);
  assert.deepEqual(coachFromOld({ ...old, lv: { Power: 2, Technique: 0, Pace: 2, Craft: 0 } }).strong, ['bat', 'bowl']);
  assert.equal(coachLevel([K({ step: 13, strong: ['bat'] })], 'Power'), 3);
  assert.equal(treeBoost([K({ step: 13, strong: ['bat'] })], 'Opener'), 1.5);
  assert.equal(treeBoost([K({ step: 13, strong: ['bat'] })], 'Fast'), 1);
  assert.equal(treeBoost([K({ step: 10, strong: ['bat'] })], 'Opener'), 1);
  assert.equal(treeBoost([K({ step: 21, strong: ['bat'], away: 1 })], 'Opener'), 1);
});
