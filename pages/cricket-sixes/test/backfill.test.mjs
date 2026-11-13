import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate, unwrap, wrap } from '../js/core/save-migrate.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const res = (round, win) => ({ round, kind: 'league', a: 'c0', b: 'c1', ra: win ? 100 : 80, wa: 3, rb: win ? 80 : 100, wb: 5, winner: win ? 'c0' : 'c1' });
/** Round 7 with 6 wins and 1 loss (the last). */
function atR7(v) {
  const s = clone(C(null, 'NewGame', { seed: 'bf1' }));
  s.season.results = [1, 2, 3, 4, 5, 6].map((r) => res(r, true)).concat([res(7, false)]);
  s.v = v; s.stage = 'hub';
  return s;
}

test('v4 save at round 7, 6W 1L: back-filled once, rows marked, notice shown', () => {
  const s = atR7(4); delete s.econ;
  const n = migrate(s, 4).state;
  assert.equal(n.econ.backfilled, true);
  assert.equal(n.econ.fans, 6 * 45 + 15);
  assert.ok(n.econ.coins > 1300 + 6 * 70 && n.econ.coins < 1300 + 7 * 200, 'coins ' + n.econ.coins);
  assert.equal(n.econ.ledger.filter((r) => r.backfill && r.k === 'match').length, 7);
  assert.equal(n.notice, 'econ-backfill');
  assert.equal(sel.noticeOf(n).line, 'Club accounts caught up for the matches you already played.');
  assert.equal(C(n, 'DismissNotice').notice, undefined);
});

test('r6-migrated v5 save (one paid match): fix-up gives about 285 Fans and 1,626 Coins, idempotent', () => {
  const s = atR7(5);
  delete s.econ.backfilled; s.econ.coins = 1158; s.econ.fans = 15; s.econ.fac.gym = 1; s.econ.fac.scout = 1;
  s.econ.ledger = [{ k: 'match', win: false, gate: 74, winBonus: 0, shop: 0, wages: 61, upkeep: 5, net: 8, fans: 15, arrears: 0 }];
  const a = unwrap(JSON.stringify({ ...wrap(s), v: 5 })).state;
  assert.equal(a.econ.fans, 285);
  assert.ok(Math.abs(a.econ.coins - 1626) <= 70, 'coins ' + a.econ.coins); // report: about 1,626 with a flat gate of 74; the shipped formula lets the gate grow with Fans, and our test squad pays lower wages (57 vs 61)
  assert.equal(a.notice, 'econ-backfill');
  const b = unwrap(JSON.stringify(wrap(a))).state;
  assert.equal(b.econ.coins, a.econ.coins); assert.equal(b.econ.fans, a.econ.fans);
  assert.equal(b.econ.ledger.length, a.econ.ledger.length);
});

test('a v5 save whose rounds are all paid (or round 1) is left alone, no notice', () => {
  const fresh = clone(C(null, 'NewGame', { seed: 'bf2' }));
  const m = migrate(fresh, 5).state;
  assert.equal(m.notice, undefined); assert.equal(m.econ.coins, 1300);
  const s = atR7(5); delete s.econ.backfilled; s.econ.ledger = Array.from({ length: 7 }, () => ({ k: 'match', win: true }));
  const n = migrate(s, 5).state; assert.equal(n.notice, undefined); assert.equal(n.econ.coins, s.econ.coins);
});

test('one plan record: sel / lastPlan fold into focus, effort, spotlight_id, coach_id, last_plan; drillCount dropped', () => {
  const s = clone(C(null, 'NewGame', { seed: 'bf3' }));
  s.training = { ...s.training, sel: { focus: 'bowl', effort: 'push', spotlightId: null, coachId: 'k0' }, lastPlan: { focus: 'bal', effort: 'easy' }, last_plan: null, drillCount: 41 };
  delete s.training.coach_id;
  const t = migrate(s, 5).state.training;
  assert.deepEqual([t.focus, t.effort, t.coach_id, t.last_plan], ['bowl', 'push', 'k0', { focus: 'bal', effort: 'easy' }]);
  for (const k of ['sel', 'lastPlan', 'drillCount']) assert.equal(k in t, false, k);
  const again = migrate(wrap(migrate(s, 5).state).data, 5).state.training; assert.deepEqual(again, t);
});

test('pay.gap is the rival six mean minus our six mean of the four raw ratings (to 0.01)', async () => {
  const { sixGap, gapLetters } = await import('../js/core/season.js');
  const s = clone(C(null, 'NewGame', { seed: 'gap1' }));
  const mean = (club) => club.six.map((id) => club.squad.find((p) => p.id === id)).reduce((a, p) => a + (p.bp + p.bs + p.spd + p.bsk) / 4, 0) / 6;
  const rival = s.clubs[1];
  const six = (c) => (c.six && c.six.length === 6 ? c.six : null);
  const rc = { ...rival, six: six(rival) || rival.squad.slice(0, 6).map((p) => p.id) };
  s.clubs[1] = rc;
  assert.ok(Math.abs(sixGap(s, rc) - (mean(rc) - mean(s.clubs[0]))) < 0.01);
  assert.ok(gapLetters(s, rc).ours);
});
