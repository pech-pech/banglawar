import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store/store.js';
import { applyCommand } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { unwrap, wrap } from '../js/core/save-migrate.js';
import { newGame } from './_season-bot.mjs';

test('NewGame: top-level v, salt, stage, season, 10 clubs of 10, 3 coach candidates', () => {
  const s = newGame('g1').get();
  assert.equal(s.v, 2); assert.equal(s.salt, ''); assert.equal(typeof s.stage, 'string'); assert.equal(s.stage, 'coach');
  assert.equal(s.clubs.length, 10); assert.ok(s.clubs.every((c) => c.squad.length === 10));
  assert.equal(s.clubs[0].id, 'c0'); assert.equal(s.clubs[0].name, 'Fernhill');
  assert.equal(s.season.fixtures.length, 9); assert.equal(s.season.round, 1); assert.equal(s.season.phase, 'league');
  assert.equal(s.coaches.filter((c) => c.candidate).length, 3);
  assert.equal(s.coachPicked, false); assert.equal(s.training.tp, 450);
  assert.equal(s.fixture.kind, 'league'); assert.equal(s.fixture.round, 1);
});

test('NewGame is deterministic per seed and differs across seeds', () => {
  assert.equal(JSON.stringify(newGame('a').get()), JSON.stringify(newGame('a').get()));
  assert.notEqual(JSON.stringify(newGame('a').get()), JSON.stringify(newGame('b').get()));
});

test('save-migrate: a bare step-0 state migrates through deps.newGame to a v1 season game', () => {
  const t = createStore(null); t.dispatch('NewMatch', { seed: 'old' });
  const deps = { newGame: (seed) => { const x = createStore(null); x.dispatch('NewGame', { seed: String(seed) }); return x.get(); } };
  const r = unwrap(JSON.stringify(t.get()), deps);
  assert.ok(r.ok); assert.equal(r.state.v, 2); assert.ok(r.state.season); assert.ok(r.state.run); assert.equal(r.state.stage, 'coach');
  const again = unwrap(JSON.stringify(wrap(newGame('x').get())), deps);
  assert.ok(again.ok);
});

test('Reseed sets salt, same salt is a no-op (same object)', () => {
  const s = newGame('r').get();
  const a = applyCommand(s, 'Reseed', { salt: 'zz' });
  assert.equal(a.salt, 'zz'); assert.equal(s.salt, '');
  assert.equal(applyCommand(a, 'Reseed', { salt: 'zz' }), a);
  assert.equal(applyCommand(null, 'Reseed', { salt: 'q' }), null);
});

test('invalid commands return the same state', () => {
  const s = newGame('i').get();
  for (const [c, p] of [['OpenSquad', {}], ['SetSix', { ids: [] }], ['NewMatch', {}], ['FinishMatch', {}], ['EndWeek', {}], ['NextWeek', {}], ['Drill', { playerId: 'c0p0', drillId: 'bp' }], ['PickCoach', { coachId: 'nope' }], ['Nope', {}]]) {
    assert.equal(applyCommand(s, c, p), s, c);
  }
});

test('PickCoach: once, moves to hub, keeps only the picked coach', () => {
  const s = newGame('c').get();
  const id = s.coaches.find((c) => c.candidate).id;
  const a = applyCommand(s, 'PickCoach', { coachId: id });
  assert.equal(a.stage, 'hub'); assert.equal(a.coachPicked, true); assert.equal(a.coaches.length, 1); assert.equal(a.coaches[0].id, id);
  assert.equal(applyCommand(a, 'PickCoach', { coachId: id }), a);
});

test('selectors: coachPickVM, hubVM, tableVM shapes', () => {
  const s = newGame('v').get();
  const cp = sel.coachPickVM(s);
  assert.equal(cp.cands.length, 3); assert.ok(cp.cands.every((c) => c.id && c.focus && c.drill && c.odds3 >= c.odds2 && Array.isArray(c.trees)));
  assert.equal(cp.picked, null);
  const h = sel.hubVM(s);
  assert.equal(h.round, 1); assert.ok(['Weaker', 'Even', 'Stronger'].includes(h.next.oppStrength));
  assert.equal(h.table5.length, 5); assert.equal(typeof h.tp, 'number'); assert.equal(typeof h.cta, 'string');
  const t = sel.tableVM(s);
  assert.equal(t.rows.length, 10); assert.ok(t.rows.some((r) => r.me)); assert.deepEqual(Object.keys(t.rows[0]).sort(), ['l', 'me', 'name', 'p', 'pos', 'pts', 'rd', 't', 'w'].sort());
});

test('a non-season NewMatch still works exactly as step 0 (no season key)', () => {
  const s = applyCommand(null, 'NewMatch', { seed: 'abc' });
  assert.equal(s.stage, 'bowl'); assert.equal(s.me.players.length, 6); assert.equal(s.season, undefined);
  const r = sel.resultVM({ ...s, stage: 'done', result: 'won', inn2: { ...s.inn1, wk: 2 } });
  assert.equal(r.inSeason, false); assert.equal(r.seed, 'abc');
});
