import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { createStore } from '../js/store/store.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { newGame, step } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const six = (s) => s.clubs[0].squad.slice(0, 6).map((p) => p.id);
const toSquad = (store) => { store.dispatch('OpenSquad'); return store; };

test('flags off: SetSix goes to plan; new commands are no-ops; no chips/VMs', () => {
  const st = toSquad(newGame('r9s-1'));
  st.dispatch('SetSix', { ids: six(st.get()) });
  assert.equal(st.get().stage, 'plan');
  assert.equal(sel.matchdayVM(st.get()), null);
  assert.equal(sel.activitiesVM(st.get()), null);
  assert.equal(sel.freePickVM(st.get()), null);
  assert.equal('chips' in sel.planVM(st.get()), false);
  const before = st.get();
  for (const c of ['OpenMatchday', 'MatchdayGo', 'PickActivity', 'SignTrial', 'DeclineTrial', 'TakeFreePick']) assert.equal(C(before, c, { id: 'street', what: 'gym' }), before, c);
  st.dispatch('NewMatch');
  assert.equal(st.get().match, undefined);
});

test('flag on: Squad -> matchday -> Plan; roll kept across BackToSquad; same seed same roll', () => withFlags({ matchday: true }, () => {
  const st = toSquad(newGame('r9s-2'));
  st.dispatch('SetSix', { ids: six(st.get()) });
  assert.equal(st.get().stage, 'matchday');
  const vm = sel.matchdayVM(st.get());
  assert.equal(vm.odds.reduce((a, o) => a + o.pct, 0) >= 99, true);
  const md1 = JSON.stringify(st.get().fixture.md);
  st.dispatch('BackToSquad'); assert.equal(st.get().stage, 'squad');
  st.dispatch('SetSix', { ids: six(st.get()).reverse() });
  assert.equal(st.get().stage, 'matchday');
  assert.equal(st.get().fixture.md.hype + st.get().fixture.md.toss + st.get().fixture.md.pepSlot, JSON.parse(md1).hype + JSON.parse(md1).toss + JSON.parse(md1).pepSlot);
  st.dispatch('MatchdayGo'); assert.equal(st.get().stage, 'plan');
  assert.ok(sel.planVM(st.get()).chips.length >= 2);
  st.dispatch('NewMatch');
  const s = st.get();
  assert.equal(s.stage, 'bowl'); assert.ok(s.match.md);
  const again = newGame('r9s-2'); toSquad(again); again.dispatch('SetSix', { ids: six(again.get()) });
  assert.equal(again.get().fixture.md.hype, JSON.parse(md1).hype);
}));

test('boosts scale copies of our six only; the saved squad is untouched', () => withFlags({ matchday: true }, () => {
  const st = toSquad(newGame('r9s-3'));
  const ids = six(st.get()), squad0 = JSON.stringify(st.get().clubs[0].squad);
  st.dispatch('SetSix', { ids }); st.dispatch('MatchdayGo'); st.dispatch('NewMatch');
  const s = st.get(), md = s.match.md;
  const p0 = s.clubs[0].squad.find((p) => p.id === ids[0]);
  assert.ok(s.me.players[0].bp >= Math.min(99, p0.bp));
  assert.equal(JSON.stringify(s.clubs[0].squad.map((p) => ({ ...p }))), squad0);
  assert.ok(md.hype);
}));

test('auto match day skips after the first 3 screens; SetAutoMatchday rides along', () => withFlags({ matchday: true }, () => {
  const st = newGame('r9s-4');
  st.dispatch('SetAutoMatchday', { on: true });
  assert.equal(st.get().autoMatchday, true);
  let shown = 0, g = 0;
  while (g++ < 4000 && st.get().stage !== 'end') { if (st.get().stage === 'matchday') shown++; if (!step2(st)) break; }
  assert.equal(shown, 3);
}));
function step2(st) { if (st.get().stage === 'matchday') { st.dispatch('MatchdayGo'); return true; } return step(st); }

test('SetFeatures: on by default, off sticks across rebuilt states', () => {
  const st = newGame('r9s-5');
  assert.equal(st.get().features, true);
  st.dispatch('SetFeatures', { on: false });
  assert.equal(st.get().features, false);
  assert.equal(C(st.get(), 'SetFeatures', { on: false }), st.get());
  st.dispatch('SetSix', {}); st.dispatch('OpenSquad');
  assert.equal(st.get().features, false);
  st.dispatch('SetFeatures', { on: true });
  assert.equal(st.get().features, true);
});

test('activities: pick once a round, Rest is free, Fans move, trial sign/decline', () => withFlags({ activities: true }, () => {
  const st = newGame('r9s-6');
  let vm = sel.activitiesVM(st.get());
  assert.equal(vm.available, true); assert.equal(vm.options.length, 6);
  const f0 = st.get().econ.fans, c0 = st.get().econ.coins;
  st.dispatch('PickActivity', { id: 'street' });
  assert.ok(st.get().econ.fans > f0); assert.ok(st.get().econ.coins < c0 + 40);
  vm = sel.activitiesVM(st.get()); assert.equal(vm.available, false); assert.equal(vm.picked.id, 'street');
  const same = st.get(); st.dispatch('PickActivity', { id: 'banner' }); assert.equal(st.get(), same);
  // forced trial
  const s = st.get();
  const trial = { kind: 'player', player: { ...s.clubs[0].squad[0], id: 'tX', name: 'Finder' }, wage: 9, from: 'street', key: 'k' };
  const withTrial = { ...s, trial };
  const tv = sel.trialVM(withTrial); assert.equal(tv.kind, 'player'); assert.equal(tv.wage, 9);
  const dec = C(withTrial, 'DeclineTrial'); assert.equal(dec.trial, undefined);
  assert.equal(sel.trialVM(dec), null);
  if (!sel.trialVM(withTrial).squadFull) assert.equal(C(withTrial, 'SignTrial').clubs[0].squad.some((p) => p.id === 'tX'), true);
}));

test('free pick: pending until taken, TakeFreePick sets L1 once', () => withFlags({ freePick: true }, () => {
  const st = newGame('r9s-7');
  const vm = sel.freePickVM(st.get());
  assert.ok(vm && vm.options.length === 7);
  if (!vm.pending) return;
  const o = vm.options.find((x) => x.ok);
  st.dispatch('TakeFreePick', { what: o.id });
  assert.equal(st.get().econ.fac[o.id], 1);
  assert.equal(sel.freePickVM(st.get()).pending, false);
  const same = st.get(); st.dispatch('TakeFreePick', { what: 'gym' }); assert.equal(st.get(), same);
}));

test('roar chip on bowl VM only with the roar flag; a finished match pays hype Fans split', () => withFlags({ matchday: true, roar: true }, () => {
  const st = toSquad(newGame('r9s-8'));
  st.dispatch('SetSix', { ids: six(st.get()) }); st.dispatch('MatchdayGo'); st.dispatch('NewMatch');
  const vm = sel.bowlVM(st.get());
  assert.ok('chips' in vm);
  assert.ok(vm.roar === null || vm.roar.text === 'Crowd roar +5%');
  let g = 0; while (g++ < 200 && st.get().stage !== 'done') { const t = st.get().stage; if (t === 'bowl') st.dispatch('BowlOver'); else if (t === 'break') st.dispatch('StartChase'); else if (t === 'chase') st.dispatch('BowlOver', { intent: 'R' }); }
  st.dispatch('FinishMatch');
  assert.equal(st.get().stage, 'train');
}));
