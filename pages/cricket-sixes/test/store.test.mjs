import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store/store.js';
import { applyCommand } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { unwrap, wrap } from '../js/core/save-migrate.js';
import { newGame } from './_season-bot.mjs';

test('NewGame: top-level v, salt, stage, season, 10 clubs (mine 8, AI 10), the start coach', () => {
  const s = newGame('g1').get();
  assert.equal(s.v, 7); assert.equal(s.salt, ''); assert.equal(typeof s.stage, 'string'); assert.equal(s.stage, 'hub');
  assert.equal(s.clubs.length, 10); assert.equal(s.clubs[0].squad.length, 8); assert.ok(s.clubs.slice(1).every((c) => c.squad.length === 10));
  assert.deepEqual(s.clubs[0].squad.map((p) => p.id), ['c0p0', 'c0p1', 'c0p2', 'c0p3', 'c0p4', 'c0p5', 'c0p8', 'c0p9']); assert.equal(s.clubs[0].six.length, 6);
  assert.equal(s.clubs[0].id, 'c0'); assert.equal(s.clubs[0].name, 'Fernhill');
  assert.equal(s.season.fixtures.length, 9); assert.equal(s.season.round, 1); assert.equal(s.season.phase, 'league');
  assert.equal(s.coaches.length, 1); assert.equal(s.coaches[0].step, 4); assert.deepEqual(s.coaches[0].strong, ['bat', 'bowl']);
  assert.equal(s.coachPicked, true); assert.equal(s.training.tp, 450); assert.ok(s.econ && s.econ.coins > 0);
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
  assert.ok(r.ok); assert.equal(r.state.v, 7); assert.ok(r.state.season); assert.ok(r.state.run); assert.equal(r.state.stage, 'hub');
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
  const s = { ...newGame('i').get(), stage: 'coach' };
  for (const [c, p] of [['OpenSquad', {}], ['SetSix', { ids: [] }], ['NewMatch', {}], ['FinishMatch', {}], ['EndWeek', {}], ['NextWeek', {}], ['RunNets', {}], ['PickWeekCoach', { coachId: 'k0' }], ['Spin', {}], ['Nope', {}]]) {
    assert.equal(applyCommand(s, c, p), s, c);
  }
});

test('selectors: coachPickVM, hubVM, tableVM shapes', () => {
  const s = newGame('v').get();
  const cp = sel.coachPickVM(s);
  assert.ok(cp.cands.length >= 2); assert.ok(cp.cands.every((c) => c.id && /^[A-FS][-+]?$/.test(c.letter) && c.strong.length >= 1 && c.strongWords.length === c.strong.length));
  assert.equal(cp.picked, null); assert.equal(cp.open, true);
  const h = sel.hubVM(s);
  assert.equal(h.round, 1); assert.ok(['Weaker', 'Even', 'Stronger'].includes(h.next.oppStrength));
  assert.equal(h.table5.length, 5); assert.equal(typeof h.tp, 'number'); assert.equal(typeof h.cta, 'string');
  const t = sel.tableVM(s);
  assert.equal(t.rows.length, 10); assert.ok(t.rows.some((r) => r.me)); assert.deepEqual(Object.keys(t.rows[0]).sort(), ['l', 'me', 'name', 'p', 'pos', 'pts', 'rd', 't', 'tag', 'w'].sort());
});

test('a non-season NewMatch still works exactly as step 0 (no season key)', () => {
  const s = applyCommand(null, 'NewMatch', { seed: 'abc' });
  assert.equal(s.stage, 'bowl'); assert.equal(s.me.players.length, 6); assert.equal(s.season, undefined);
  const r = sel.resultVM({ ...s, stage: 'done', result: 'won', inn2: { ...s.inn1, wk: 2 } });
  assert.equal(r.inSeason, false); assert.equal(r.seed, 'abc');
});
