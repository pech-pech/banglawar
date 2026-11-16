// T3: match-day Hype/Toss/Pep decided at the STOP (sliceId) via the store; old no-sliceId path unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { applyCommand as C } from '../js/store/commands.js';
import { teamBoost } from '../js/core/matchday.js';
import { mdRingOf, pepOffsetOf } from '../js/store/wheels/md.js';
import { mdSpinVM } from '../js/store/wmstore.js';
import { newGame } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const open = (seed) => { const st = newGame(seed); const s = st.get(); return C({ ...s, econ: { ...s.econ, coins: 5000 } }, 'OpenMatchday'); };

test('hype: result is the landed ring slice; old path still works', () => withFlags(ON, () => {
  const s = open('t3stop-h'), ring = mdRingOf(s, 'hype');
  for (const i of [0, ring.length - 1]) {
    const o = C(s, 'HypeSpin', { stop: { sliceId: ring[i].id, stopT: 1000, cycle: 0, tInCycle: 0.3 } });
    assert.equal(o.fixture.md.wm.hype.index, ring[i].id); assert.equal(o.fixture.md.wm.hype.pts, ring[i].value);
  }
  const old = C(s, 'HypeSpin', { stop: { t: 2, phi: 1, e: 0 } });
  assert.ok(old.fixture.md.wm.hype && old.fixture.md.wm.hype.src.ring === undefined);
  assert.ok(C(s, 'HypeSpin', { careful: true }).fixture.md.wm.hype);
  const vm = mdSpinVM(C(s, 'HypeSpin', { stop: { sliceId: ring[0].id } })).hype;
  assert.equal(vm.wheelId, 'hype'); assert.equal(vm.ring.length, ring.length); assert.equal(typeof vm.spinKey, 'string');
}));

test('toss: No-boost slice gives sport, paying row gives won', () => withFlags(ON, () => {
  const s = open('t3stop-t'), ring = mdRingOf(s, 'toss');
  const no = ring.findIndex((r) => r.value === 0), yes = ring.findIndex((r) => r.value > 0);
  const a = C(s, 'TossSpin', { stop: { sliceId: no } }), b = C(s, 'TossSpin', { stop: { sliceId: yes } });
  assert.equal(a.fixture.md.wm.toss.id, 'sport'); assert.equal(b.fixture.md.wm.toss.id, 'won');
  assert.equal(b.fixture.md.wm.toss.boostPct, ring[yes].value);
  assert.equal(C(s, 'TossSpin', {}).fixture.md.wm.toss.src.ring, undefined);
}));

test('pep: slot from ring offset, boostPct reaches the matchday multiplier', () => withFlags(ON, () => {
  const s = open('t3stop-p'), ring = mdRingOf(s, 'pep');
  const lo = ring.findIndex((r) => r.value === 2.5), hi = ring.findIndex((r) => r.value === 10);
  const a = C(s, 'PepSpin', { stop: { sliceId: lo } }), b = C(s, 'PepSpin', { stop: { sliceId: hi } });
  assert.equal(a.fixture.md.pepBoost, 0.025); assert.equal(b.fixture.md.pepBoost, 0.1);
  assert.equal(a.fixture.md.pepSlot, ring[lo].slot);
  const off = pepOffsetOf(s); assert.ok(off >= 0 && off < 6);
  assert.ok(Object.values(a.wheels.pepRingOffset).includes(off));
  const pid = b.fixture.md.pepId; assert.notEqual(pid, null);
  const mA = { ...a.fixture.md, pepIds: [pid], pepId: pid }, mB = { ...b.fixture.md, pepIds: [pid], pepId: pid };
  assert.ok(teamBoost(mB, pid) > teamBoost(mA, pid));
  const vm = mdSpinVM(b).pep; assert.equal(vm.boostPct, 10); assert.equal(vm.names.length, ring.length); assert.equal(vm.wheelId, 'pep');
  const old = C(s, 'PepSpin', {}); assert.equal(old.fixture.md.pepBoost, undefined);
}));

test('teamBoost: no pepBoost uses MD.PEP_BOOST constant', () => {
  const md = { hype: 'med', toss: 'lost', pepId: 7, pepIds: [7] };
  assert.ok(teamBoost(md, 7) > teamBoost({ ...md, pepBoost: 0.025 }, 7));
});
