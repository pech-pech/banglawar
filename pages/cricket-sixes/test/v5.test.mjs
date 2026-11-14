import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate, VERSION, wrap, unwrap, refundValue } from '../js/core/save-migrate.js';
import { keepV4Copy } from '../js/store/store.js';
import { applyCommand as C, canAddPlayer, canSell } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
/** A v4-shaped save: 10 players, old coach, old training fields, candidate coaches left over. */
function v4save(seed = 'v5a') {
  const s = clone(C(null, 'NewGame', { seed }));
  const mk = (i) => ({ ...clone(s.clubs[0].squad[0]), id: `c0p${i}`, name: `Extra${i}`, bp: 5, bs: 5, spd: 5, bsk: 5, potential: 40 });
  s.clubs[0].squad.push(mk(6), mk(7));
  s.clubs[0].squad.sort((a, b) => (a.id < b.id ? -1 : 1));
  s.v = 4; delete s.econ; delete s.releaseLedger;
  s.coaches = [{ id: 'k9', name: 'Old', candidate: false, xp: { Power: 190, Technique: 0, Pace: 0, Craft: 70 }, lv: { Power: 5, Technique: 0, Pace: 0, Craft: 3 } }, { id: 'k1', name: 'Cand', candidate: true, xp: {}, lv: { Power: 3 } }];
  s.training = { tp: 100, week: 3, drilled: { c0p0: 1 }, nodeBought: {}, last: null, weekLog: [], weekStart: {}, drillCount: 4, autoBench: true, lastPlan: { a: 1 }, bulk: { items: [] } };
  return s;
}

test('VERSION 5: players over 8 are released outside the Six, lowest refund first, ledger written, notice set', () => {
  const s = v4save(); const six = s.clubs[0].six.slice();
  const m = migrate(s, 4); assert.equal(m.ok, true);
  const n = m.state, sq = n.clubs[0].squad;
  assert.equal(n.v, 7); assert.equal(VERSION, 7); assert.equal(sq.length, 8);
  assert.ok(six.every((id) => sq.some((p) => p.id === id)), 'the Six stays');
  assert.deepEqual(n.releaseLedger.map((r) => r.player_id).sort(), ['c0p6', 'c0p7']);
  for (const r of n.releaseLedger) { assert.deepEqual(Object.keys(r).sort(), ['name', 'player_id', 'rule', 'value_at_release']); assert.equal(typeof r.value_at_release, 'number'); }
  assert.equal(n.notice, 'squad8'); assert.equal(sel.noticeOf(n).line, 'The squad is now 8. 2 players moved on.');
  assert.equal(C(n, 'DismissNotice').notice, undefined);
  assert.ok(n.econ && n.econ.coins > 0);
});

test('migration never goes below 6, never releases a Six player, leaves an 8 or fewer alone', () => {
  const s = v4save('v5b'); s.clubs[0].squad = s.clubs[0].squad.slice(0, 7); s.clubs[0].six = s.clubs[0].squad.slice(0, 6).map((p) => p.id);
  const n = migrate(s, 4).state; assert.equal(n.clubs[0].squad.length, 7); assert.equal(n.notice, undefined); assert.deepEqual(n.releaseLedger, []);
  const t = v4save('v5c'); t.clubs[0].six = t.clubs[0].squad.slice(2, 8).map((p) => p.id); // the Six are the last six: the bench is the weakest two
  const out = migrate(t, 4).state.releaseLedger.map((r) => r.player_id);
  assert.ok(out.every((id) => !t.clubs[0].six.includes(id)));
});

test('refund value: half the fee, fee from ability while hidden and from potential once shown', () => {
  const p = { bp: 40, bs: 40, spd: 40, bsk: 40, bat: 'Middle', bowl: 'Medium', potential: 150, drillsHere: 0 };
  const hidden = refundValue(p), shown = refundValue({ ...p, drillsHere: 5 });
  assert.equal(shown, 75); assert.ok(hidden < shown);
});

test('coach map: step = min(21, 4 + 3 x max level); strong from the top ratings; candidates dropped', () => {
  const n = migrate(v4save(), 4).state;
  assert.equal(n.coaches.length, 1); const c = n.coaches[0];
  assert.equal(c.id, 'k9'); assert.equal(c.step, 19); assert.deepEqual(c.strong, ['bat']);
  assert.equal(c.lv, undefined); assert.equal(c.xp, undefined); assert.equal(c.candidate, undefined);
  assert.equal(n.coachPicked, true);
  const both = v4save(); both.coaches[0].lv = { Power: 2, Technique: 0, Pace: 2, Craft: 0 };
  assert.deepEqual(migrate(both, 4).state.coaches[0].strong, ['bat', 'bowl']);
});

test('training fields: focus, effort, spotlight_id, last_plan added; drill-pick fields dropped', () => {
  const T = migrate(v4save(), 4).state.training;
  assert.deepEqual([T.focus, T.effort, T.spotlight_id, T.last_plan], ['bat', 'normal', null, null]);
  for (const k of ['drilled', 'autoBench', 'bulk', 'lastPlan']) assert.equal(k in T, false, k);
  assert.equal(T.tp, 100); assert.equal(T.week, 3);
});

test('v5 migration is deterministic, pure, and idempotent; the migrated save plays on', () => {
  const s = v4save(); const before = JSON.stringify(s);
  const a = migrate(s, 4).state; assert.equal(JSON.stringify(s), before);
  assert.deepEqual(migrate(s, 4).state, a);
  assert.deepEqual(migrate(a, 5).state, a);
  const r = unwrap(JSON.stringify({ v: 4, sum: wrap(s).sum, data: s }));
  assert.equal(r.ok, true); assert.equal(r.from, 4);
});

test('store keeps one .v4bak copy of the raw v4 save', () => {
  const m = new Map(); const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  const raw = JSON.stringify({ v: 4, sum: 'x', data: { stage: 'hub' } }); m.set('cs.save.1', raw);
  assert.equal(keepV4Copy(st, 'cs.save.1', 4), true); assert.equal(m.get('cs.save.1.v4bak'), raw);
  m.set('cs.save.1', JSON.stringify({ v: 5 }));
  assert.equal(keepV4Copy(st, 'cs.save.1', 4), false, 'never replaced'); assert.equal(m.get('cs.save.1.v4bak'), raw);
  assert.equal(keepV4Copy(st, 'cs.save.1', 5), false); assert.equal(keepV4Copy(null, 'k', 4), false);
});

test('squad full (old-rules save, cap 8): sign / academy is refused with the plain line; starter sale only at season end', () => {
  const s = (({ rules, ...rest }) => rest)(C(null, 'NewGame', { seed: 'sf' })); // s1: no rules = old save
  assert.deepEqual(canAddPlayer(s), { ok: false, why: 'Squad full: release one first' });
  const extra = { ...clone(s.clubs[0].squad[0]), id: 'new1', name: 'New' };
  assert.equal(C(s, 'AddPlayer', { player: extra }), s);
  const starter = s.clubs[0].six[0], bench = s.clubs[0].squad.find((p) => !s.clubs[0].six.includes(p.id)).id;
  assert.equal(canSell(s, starter).ok, false); assert.equal(C(s, 'SellPlayer', { id: starter }), s);
  const sold = C(s, 'SellPlayer', { id: bench }); assert.equal(sold.clubs[0].squad.length, 7);
  const added = C(sold, 'AddPlayer', { player: extra }); assert.equal(added.clubs[0].squad.length, 8);
  assert.equal(canSell({ ...s, stage: 'end' }, starter).ok, true);
  const six6 = clone(s); six6.clubs[0].squad = six6.clubs[0].squad.slice(0, 6); assert.equal(canSell({ ...six6, stage: 'end' }, starter).ok, false, 'never below 6');
});
