import test from 'node:test';
import assert from 'node:assert/strict';
import { unwrap, wrap } from '../js/core/save-migrate.js';
import { applyCommand as C } from '../js/store/commands.js';
import { medalShop, sinkOptions } from '../js/core/economy.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const load = (s) => unwrap(JSON.stringify(wrap(clone(s)))).state;
const fresh = () => clone(C(null, 'NewGame', { seed: 'mr1' }));
const REMOVED = ['trophy_cabinet', 'clear_sight', 'coach_retreat'];

test('Medal shop lists no Trophy Cabinet, Clear-sight Scout Report or Coach Retreat', () => {
  const s = fresh(); s.econ.medals = 50;
  const ids = medalShop(s).map((m) => m.id);
  for (const id of REMOVED) assert.ok(!ids.includes(id), id);
  for (const id of ['twin_drill', 'wage_holiday', 'master_licence']) assert.ok(ids.includes(id), id);
  const sinks = sinkOptions(s).map((m) => m.id);
  for (const id of REMOVED) assert.ok(!sinks.includes(id), id);
});

test('save that bought removed items is refunded Medals once; second load adds nothing', () => {
  const s = fresh(); s.econ.medals = 2;
  s.econ.sinks = { ...s.econ.sinks, trophy_cabinet: 1, clear_sight: 2, coach_retreat: 1 };
  const a = load(s);
  assert.equal(a.econ.medals, 2 + 1 + 2 * 3);
  for (const id of REMOVED) assert.ok(!(a.econ.sinks[id] > 0), id);
  const b = load(a);
  assert.equal(b.econ.medals, a.econ.medals);
  assert.equal(b.econ.coins, a.econ.coins);
  const c = load(b);
  assert.equal(c.econ.medals, a.econ.medals);
});

test('refunded save can no longer buy the removed items', () => {
  const a = load({ ...fresh(), econ: { ...fresh().econ, medals: 9, sinks: { trophy_cabinet: 1 } } });
  const n = C(a, 'BuyMedal', { id: 'trophy_cabinet' });
  assert.equal((n.econ || a.econ).medals, a.econ.medals);
});

test('a save without removed items is untouched; other items unchanged', () => {
  const s = fresh(); s.econ.medals = 7; s.econ.sinks = { twin_drill: 2, wage_holiday: 1, master_licence: 1, hall_1: 1 };
  const a = load(s);
  assert.equal(a.econ.medals, 7);
  assert.deepEqual(a.econ.sinks, s.econ.sinks);
  assert.equal(a.econ.coins, s.econ.coins);
});

test('mixed save: only removed items refunded, kept items stay', () => {
  const s = fresh(); s.econ.medals = 0; s.econ.sinks = { twin_drill: 1, clear_sight: 1 };
  const a = load(s);
  assert.equal(a.econ.medals, 3);
  assert.equal(a.econ.sinks.twin_drill, 1);
});

test('Medal prices of remaining items are unchanged', () => {
  const s = fresh(); s.econ.medals = 50;
  const p = Object.fromEntries(medalShop(s).map((m) => [m.id, m.medals]));
  assert.deepEqual(p, { twin_drill: 2, wage_holiday: 4, master_licence: 6 });
});
