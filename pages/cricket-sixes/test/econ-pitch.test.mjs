// ECON pitch lock: Pitch is "Coming soon", cannot be bought; owned Pitch levels are kept but cost no upkeep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import * as X from '../js/core/economy.js';
import { migrate } from '../js/core/save-migrate.js';

const P = (id, r) => ({ id, name: id, bat: 'Middle', bowl: 'Medium', bp: r, bs: r, spd: r, bsk: r, potential: 117, drillsHere: 0, nodes: { bat: 0, bowl: 0 } });
const mk = (over = {}, fac = {}) => {
  const squad = Array.from({ length: 8 }, (_, i) => P('p' + i, 40 + i));
  const base = X.newEconomy();
  return { seed: 'e1', season: { league: 1, n: 1, round: 1, phase: 'league' }, coaches: [],
    clubs: [{ id: 'c0', squad, six: squad.slice(0, 6).map((p) => p.id) }], econ: { ...base, coins: 1e6, fans: 1e6, stadium: 5, ...over, fac: { ...base.fac, ...fac } } };
};
const withFlags = (flags, fn) => { const old = {}; for (const k of Object.keys(flags)) { old[k] = FLAGS[k]; FLAGS[k] = flags[k]; } try { return fn(); } finally { for (const k of Object.keys(old)) FLAGS[k] = old[k]; } };
const pitchOpt = (s) => X.buildOptions(s).find((o) => o.what === 'pitch');

test('pitch option is locked with Coming soon, even when rich and at top stadium', () => {
  for (const ff of [false, true]) withFlags({ freePick: ff }, () => {
    const o = pitchOpt(mk());
    assert.equal(o.ok, false); assert.equal(o.why, 'Coming soon');
  });
});

test('startBuild pitch is refused: state unchanged', () => {
  const s = mk();
  assert.equal(X.startBuild(s, 'pitch'), s);
  assert.equal(s.econ.fac.pitch, 0); assert.equal(s.econ.coins, 1e6);
});

test('other facilities still buildable at top stadium', () => {
  const o = X.buildOptions(mk()).find((x) => x.what === 'shop');
  assert.equal(o.ok, true);
});

test('owned Pitch levels are kept but add no upkeep', () => {
  const none = X.matchIncome(mk(), { win: true }), owned = X.matchIncome(mk({}, { pitch: 3 }), { win: true });
  assert.equal(owned.upkeep, none.upkeep); assert.equal(owned.net, none.net);
  const o2 = mk({}, { pitch: 3 }); assert.equal(o2.econ.fac.pitch, 3);
  // a non-locked facility level still costs upkeep
  assert.ok(X.matchIncome(mk({}, { gym: 3 }), { win: true }).upkeep > none.upkeep);
});

test('applyMatch keeps the Pitch level and charges no Pitch upkeep', () => {
  const a = X.applyMatch(mk({}, { pitch: 4 }), { win: true }), b = X.applyMatch(mk(), { win: true });
  assert.equal(a.econ.fac.pitch, 4);
  assert.equal(a.econ.coins, b.econ.coins);
});

test('free pick: Pitch is not offered or takeable', () => {
  withFlags({ freePick: true }, () => {
    const s = mk({ freePick: { done: false, pick: null } }, { stands: 0, shop: 0, nets: 0, gym: 0, pitch: 0, academy: 0, scout: 0 });
    assert.equal(X.freePickOptions(s).find((o) => o.what === 'pitch').ok, false);
    assert.equal(X.takeFreePick(s, 'pitch'), s);
  });
});

test('migrate keeps a save that owns Pitch levels', () => {
  const s = mk({}, { pitch: 2 });
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal((m.econ || s.econ).fac.pitch, 2);
});
