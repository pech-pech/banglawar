// D1: after STOP the stored pending index is the ring slice the wheel landed on (hype, toss, pep), payout fields match the ring row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { applyCommand as C } from '../js/store/commands.js';
import { matchDayIdOf } from '../js/core/spin-keys.js';
import { mdRingOf, pepOffsetOf } from '../js/store/wheels/md.js';
import { mdSpinVM } from '../js/store/wmstore.js';
import { newGame } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const open = (seed) => { const s = newGame(seed).get(); return C({ ...s, econ: { ...s.econ, coins: 5000 } }, 'OpenMatchday'); };

test('hype: pending.index === sliceId for every row', () => withFlags(ON, () => {
  const s = open('d1-h'), ring = mdRingOf(s, 'hype');
  ring.forEach((row) => {
    const o = C(s, 'HypeSpin', { stop: { sliceId: row.id, stopT: 1000, cycle: 0, tInCycle: 0.3 } }), w = o.fixture.md.wm.hype;
    assert.equal(w.index, row.id); assert.equal(w.pts, row.value);
    assert.equal(mdSpinVM(o).hype.pending.index, row.id);
  });
}));

test('toss: pending.index === sliceId for every row', () => withFlags(ON, () => {
  const s = open('d1-t'), ring = mdRingOf(s, 'toss');
  ring.forEach((row, i) => {
    const o = C(s, 'TossSpin', { stop: { sliceId: i } }), w = o.fixture.md.wm.toss;
    assert.equal(w.index, i); assert.equal(w.boostPct, row.value); assert.equal(w.id, row.value > 0 ? 'won' : 'sport');
    assert.equal(o.fixture.md.tossBoost, row.value / 100);
    assert.equal(mdSpinVM(o).toss.pending.index, i);
  });
}));

test('pep: pending.index === sliceId for every row, offsets 0 and 3', () => withFlags(ON, () => {
  for (const off of [0, 3]) {
    const s0 = open('d1-p' + off), s = { ...s0, wheels: { ...(s0.wheels || {}), pepRingOffset: { [matchDayIdOf(s0)]: off } } };
    assert.equal(pepOffsetOf(s), off);
    const ring = mdRingOf(s, 'pep');
    ring.forEach((row, i) => {
      const o = C(s, 'PepSpin', { stop: { sliceId: i } }), w = o.fixture.md.wm.pep, md = o.fixture.md;
      assert.equal(w.index, i, 'off ' + off + ' slice ' + i); assert.equal(w.slots[0], row.slot); assert.equal(md.pepSlot, row.slot);
      assert.equal(md.pepBoost, row.value / 100); assert.equal(mdSpinVM(o).pep.pending.index, i);
    });
  }
}));

test('old no-sliceId path keeps coin-face / slot-1 index', () => withFlags(ON, () => {
  const s = open('d1-old'), t = C(s, 'TossSpin', {}).fixture.md.wm.toss, p = C(s, 'PepSpin', {}).fixture.md;
  assert.equal(t.index, t.id === 'won' ? 0 : 1); assert.equal(p.wm.pep.index, p.pepSlot - 1);
}));
