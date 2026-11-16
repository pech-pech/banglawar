// T8 helper D: Hype token cap 1 (single source), wmstore cap, Study/Scout coach gives no match boost, Find check data, shims.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import { WM } from '../js/data/wheelmeta.js';
import { HYPE_TOKEN_CAP as DATA_CAP } from '../js/data/wheels/hype.js';
import { HYPE_TOKEN_CAP as WC_CAP, hypeTokenAllowed } from '../js/core/perks/warm-crowd.js';
import { applyCommand as C } from '../js/store/commands.js';
import { metaOf, tokenLeft } from '../js/core/wheelmeta.js';
import { wmTokens } from '../js/store/wmstore.js';
import { matchCoachOf } from '../js/core/training.js';
import { matchCoachBoost } from '../js/core/matchday.js';
import { FIND_CHECK } from '../js/report/wm.js';
import { TRAIN2 } from '../js/data/training.js';
import { newGame } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const clone = (x) => JSON.parse(JSON.stringify(x));
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('Hype token cap is 1, one source (data/wheels/hype.js), no duplicated literal', () => {
  assert.equal(DATA_CAP, 1); assert.equal(WC_CAP, 1); assert.equal(WM.TOKEN_CAP_WHEEL_SEASON.hype, 1);
  assert.match(read('js/data/wheelmeta.js'), /hype: HYPE_TOKEN_CAP/);
  assert.doesNotMatch(read('js/core/perks/warm-crowd.js'), /HYPE_TOKEN_CAP = \d/);
  assert.equal(hypeTokenAllowed(0), true); assert.equal(hypeTokenAllowed(1), false);
});

test('wmstore: a second Hype token in a season is refused, no buttons, pool untouched', () => withFlags(ON, () => {
  const POOL = { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 };
  let s = null;
  for (let i = 0; i < 80 && !s; i++) {
    const g = newGame('t8d-' + i).get(), m = { ...g, econ: { ...g.econ, coins: 5000 } };
    const o = C({ ...m, wheelMeta: { ...clone(metaOf(m)), tokens: { ...POOL } } }, 'OpenMatchday'), r = C(o, 'HypeSpin');
    if (r.fixture.md.wm.hype && wmTokens(r, 'hype').some((t) => t.kind === 'respin')) s = r;
  }
  assert.ok(s, 'a Hype result that offers a token');
  assert.equal(tokenLeft(s, 'hype').wheelLeft, 1, 'one use a season on Hype');
  const used = { ...s, wheelMeta: { ...clone(metaOf(s)), tokUsed: { hype: 1 }, matchTokUsed: { key: '', n: 0 } } };
  assert.equal(tokenLeft(used, 'hype').wheelLeft, 0);
  assert.deepEqual(wmTokens(used, 'hype'), [], 'cap reached: no token buttons');
  assert.equal(C(used, 'UseToken', { wheel: 'hype', kind: 'respin' }), used, 'cap reached: refused');
  const a = C(s, 'UseToken', { wheel: 'hype', kind: 'respin' });
  assert.notEqual(a, s); assert.equal(metaOf(a).tokUsed.hype, 1);
  assert.deepEqual(wmTokens(a, 'hype'), [], 'after the one use: none left');
  assert.equal(C(a, 'UseToken', { wheel: 'hype', kind: 'respin' }), a);
}));

test('match coach +3% boost: off on Study or Scout in a 2-slot week, on for Match job, legacy and 3-slot', () => {
  assert.deepEqual(matchCoachBoost(['bat'], 'study'), { bat: 0, bowl: 0 });
  assert.deepEqual(matchCoachBoost(['bat', 'bowl'], 'scout'), { bat: 0, bowl: 0 });
  assert.deepEqual(matchCoachBoost(['bat'], 'match'), { bat: 0.03, bowl: 0 });
  assert.deepEqual(matchCoachBoost(['bat']), { bat: 0.03, bowl: 0 }, 'legacy: no job');
  const co = (job) => ({ id: 'a', name: 'A', step: 8, strong: ['bat', 'bowl'], away: 0, courseSeason: null, ...(job ? { job } : {}) });
  const st = (job, slots) => ({ coaches: [co(job)], training: { coach_id: null, week: 1 }, ...(slots != null ? { clinic: { slots } } : {}) });
  assert.deepEqual(matchCoachOf(st('study', 2)).boost, { bat: 0, bowl: 0 });
  assert.deepEqual(matchCoachOf(st('scout', 2)).boost, { bat: 0, bowl: 0 });
  assert.deepEqual(matchCoachOf(st('match', 2)).boost, { bat: 0.03, bowl: 0.03 });
  assert.deepEqual(matchCoachOf(st(undefined, 2)).boost, { bat: 0.03, bowl: 0.03 }, 'legacy: jobs absent');
  assert.deepEqual(matchCoachOf(st('study', 3)).boost, { bat: 0.03, bowl: 0.03 }, '3 slots: the idle coach is the Match coach');
  assert.deepEqual(matchCoachOf(st('study')).boost, { bat: 0.03, bowl: 0.03 }, 'no clinic block: 3 slots');
});

test('Find check data is the current SPEC figures; legacy wheelStop fields are gone', () => {
  assert.equal(FIND_CHECK.none, 26.0); assert.equal(FIND_CHECK.full, 48.7); assert.equal(FIND_CHECK.bug, 55);
  assert.ok(!('STOP_FROM' in TRAIN2.wheelStop) && !('COAST' in TRAIN2.wheelStop));
});

// ---- Find aim tie rule (SPEC s5: FIND_TIE_EPS 0.05 s, wider block, then first clockwise)
import { carefulTapTime, scoutCandidates, scoutList, signCoach, canSign, coachList } from '../js/core/training.js';
import { scoutSpin as scoutSliceStore } from '../js/store/spins/scout.js';
import { makeScoutCards } from '../js/core/scout-cards.js';
test('Find aim: arrivals within 0.05 s tie to the wider block, then the earlier (first clockwise); a clearly nearer block still wins', () => {
  const mk = (aims) => ({ widths: [1, 1, 6, 1, 1], slices: [0, 0, 0, 0, 0], jackpotIndex: 0, aims });
  const one = (a, phi) => carefulTapTime(mk([a]), phi, 0.5, 0.25); // z = 0: the aimed time itself
  const phi = 6.2, wide = one(5, phi), narrow = one(0.5, phi);
  assert.ok(Math.abs(narrow - 3.5) < Math.abs(wide - 3.5) && Math.abs(Math.abs(narrow - 3.5) - Math.abs(wide - 3.5)) < 0.05, 'setup: narrow is nearer but inside eps');
  assert.equal(carefulTapTime(mk([0.5, 5]), phi, 0.5, 0.25), wide); assert.equal(carefulTapTime(mk([5, 0.5]), phi, 0.5, 0.25), wide, 'order of aims does not matter');
  assert.equal(carefulTapTime(mk([0.5, 5]), 0, 0.5, 0.25), one(0.5, 0), 'outside eps the nearest wins');
  const p = 3.0, a = one(0.5, p), b = one(1.5, p); // equal widths: the earlier arrival (first clockwise) wins in a tie
  if (Math.abs(Math.abs(a - 3.5) - Math.abs(b - 3.5)) <= 0.05) assert.equal(carefulTapTime(mk([1.5, 0.5]), p, 0.5, 0.25), Math.min(a, b));
});

test('Scout: the landed card is a candidate sc<n>-c and can be signed', () => withFlags({ wheelMeta: true }, () => {
  const s0 = { seed: 'abc', season: { n: 2, league: 3, seed: 'abc|s2' }, scout: null, wheelMeta: null, training: { week: 1 }, clubs: [], coaches: [] };
  const sp = scoutSliceStore(s0, { stop: { sliceId: 0, stopT: 3500, cycle: 1, tInCycle: 3.5 } }), card = makeScoutCards('abc', 2, 3)[0];
  const c = scoutCandidates(sp); assert.equal(c.length, scoutList(sp).length + 1); assert.equal(c[0].id, 'sc2-c'); assert.equal(c[0].name, card.surname);
  assert.deepEqual(c[0].strong, [card.focus]); assert.equal(scoutList(sp).some((x) => x.id === 'sc2-c'), false, 'scoutList itself unchanged');
  assert.equal(canSign(sp, 'sc2-c').ok, true); assert.equal(canSign(sp, 'sc2-zz').why, 'unknown');
  const n = signCoach(sp, 'sc2-c'); assert.notEqual(n, sp);
  const k = coachList(n).find((x) => x.id === 'sc2-c'); assert.ok(k); assert.equal(k.name, card.surname); assert.equal(n.scout.signed, 'sc2-c');
  assert.equal(scoutCandidates(n).length, 0, 'closed after signing');
  assert.equal(scoutCandidates(s0).length, scoutList(s0).length, 'no spin: no landed card');
}));
