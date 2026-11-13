import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { newGame } from './_season-bot.mjs';

const atSquad = (seed = 'sq') => {
  let s = newGame(seed).get();
  return C(s, 'OpenSquad');
};
const ids = (s, n = 6, from = 0) => s.clubs[0].squad.slice(from, from + n).map((p) => p.id);

test('squad has 8; squadVM lists all 8 with role, type, order', () => {
  const s = atSquad(); assert.equal(s.stage, 'squad');
  const v = sel.squadVM(s);
  assert.equal(v.players.length, 8); assert.equal(v.bench.length, 2); assert.deepEqual(v.bench.map((b) => b.label), ['Bench batter', 'Bench bowler']); assert.equal(v.full, true); assert.equal(v.count, 6); assert.equal(v.valid, true);
  assert.ok(v.players.every((p) => p.role && p.type && 'grade' in p && 'pips' in p && (p.order === null) === !s.clubs[0].six.includes(p.id)));
});

test('SetSix: exactly 6 distinct squad ids; others rejected', () => {
  const s = atSquad();
  for (const bad of [ids(s, 5), ids(s, 7), [...ids(s, 5), ids(s, 1)[0]], [...ids(s, 5), 'zz'], 'abc', null]) assert.equal(C(s, 'SetSix', { ids: bad }), s);
  const ok = C(s, 'SetSix', { ids: ids(s, 6, 2) });
  assert.equal(ok.stage, 'plan'); assert.deepEqual(ok.clubs[0].six, ids(s, 6, 2));
});

test('SetSix only in stage squad; pick order is batting order and persists in squadVM', () => {
  const s = atSquad(); const order = ids(s, 6).reverse();
  const p = C(s, 'SetSix', { ids: order });
  assert.equal(C(p, 'SetSix', { ids: order }), p);
  const v = sel.squadVM(C(p, 'OpenSquad'));
  assert.deepEqual(v.players.filter((x) => x.order != null).sort((a, b) => a.order - b.order).map((x) => x.id), order);
  assert.equal(v.count, 6); assert.equal(v.valid, true);
});

test('SetPlan rules: 10 overs, each of six 1-2 overs, never two in a row, fields A/P x3', () => {
  const s = C(atSquad(), 'SetSix', { ids: ids(atSquad(), 6) });
  const good = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3];
  assert.ok(s.plan.overs.length === 10);
  const a = C(s, 'SetPlan', { overs: good, fields: ['A', 'P', 'A'] });
  assert.notEqual(a, s); assert.deepEqual(a.plan.overs, good); assert.deepEqual(a.plan.fields, ['A', 'P', 'A']);
  for (const bad of [[0, 0, 1, 2, 3, 4, 5, 1, 2, 3], [0, 1, 2, 3, 4, 0, 1, 2, 3, 0], [0, 1, 2, 0, 1, 2, 0, 1, 2, 0], good.slice(0, 9), [0, 1, 2, 3, 4, 6, 0, 1, 2, 3], [0, 1, 0, 1, 0, 2, 3, 4, 5, 3]])
    assert.equal(C(s, 'SetPlan', { overs: bad, fields: ['A', 'A', 'A'] }), s, JSON.stringify(bad));
  assert.equal(C(s, 'SetPlan', { overs: good, fields: ['A', 'X', 'A'] }), s);
});

test('planVM: 10 overs with phase and bowler index, 6 bowlers', () => {
  const s = C(atSquad(), 'SetSix', { ids: ids(atSquad(), 6) });
  const v = sel.planVM(s);
  assert.equal(v.overs.length, 10); assert.equal(v.bowlers.length, 6); assert.equal(v.valid, true);
  assert.ok(v.overs.every((o, i) => o.over === i + 1 && Number.isInteger(o.bowler)));
  assert.ok(v.sub);
});

test('NewMatch in a season uses the plan: six v six, planned bowler is the default call', () => {
  let s = C(atSquad(), 'SetSix', { ids: ids(atSquad(), 6) });
  s = C(s, 'SetPlan', { overs: [5, 4, 3, 2, 1, 0, 5, 4, 3, 2], fields: ['P', 'A', 'P'] });
  const m = C(s, 'NewMatch');
  assert.equal(m.stage, 'bowl'); assert.equal(m.me.players.length, 6); assert.equal(m.rival.players.length, 6);
  assert.deepEqual(m.me.players.map((p) => p.id), s.clubs[0].six);
  assert.deepEqual(m.call, { bowler: 5, field: 'P' });
  const o = C(m, 'BowlOver');
  assert.deepEqual(o.call, { bowler: 4, field: 'P' });
  assert.equal(C(s, 'NewMatch').season.round, 1);
  assert.equal(C(m, 'NewMatch'), m); // not from the bowl stage
});
