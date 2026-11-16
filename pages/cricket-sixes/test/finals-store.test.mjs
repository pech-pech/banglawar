// T4 Wave 2: Finals store + spin handler (wheels SPEC 10, 11a, 13; tests 9, 11, 13c). 12-slice ring, result decided at STOP, paid = label = strip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import * as wm from '../js/store/wmstore.js';
import { spinKeyOf, statsOf, storedStop } from '../js/core/wheel-stops.js';
import { finalsWheelOf } from '../js/store/wheels/finals.js';
import { finalsWheel, finalsRing, FINALS_MULT } from '../js/core/wheels/finals.js';
import { FINALS_SLICES as S } from '../js/data/wheels/finals.js';
import { spinHandler } from '../js/store/spin-registry.js';
import { newGame, step } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const clone = (x) => JSON.parse(JSON.stringify(x));
function finalsScreen() {
  for (let i = 0; i < 8; i++) {
    const st = newGame('f4-' + i); let g = 0;
    while (g++ < 6000 && !(st.get().stage === 'done' && st.get().fixture && st.get().fixture.kind !== 'league') && step(st)) if (st.get().stage === 'matchday') st.dispatch('MatchdayGo');
    const s = st.get(); if (s.stage === 'done' && s.fixture && s.fixture.kind !== 'league') return s;
  }
  throw new Error('no finals screen');
}
const typeKey = { Coins: 'coins', TP: 'tp', Fans: 'fans', Medal: 'medal' };
const stopAt = (i) => ({ stop: { t: 3.5, phi: 0, e: 0, stopT: 3500, cycle: 1, tInCycle: 3.5, sliceId: i, respin: 0 } });

test('old import paths keep working; handler registered; no multipliers exist today so x1', () => {
  for (const n of ['canFinalsSpin', 'finalsSpin', 'finalsSpinVM']) assert.equal(typeof wm[n], 'function', n);
  assert.equal(typeof spinHandler('FinalsSpin'), 'function');
  assert.deepEqual({ ...FINALS_MULT }, { coins: 1, fans: 1 });
});

test('the wheel is the 12-slice table; ring sums 10; labels are paid amounts; Medal M', () => {
  const w = finalsWheel({}), ring = finalsRing(w);
  assert.equal(w.slices.length, 12); assert.ok(Math.abs(w.total - 10) < 1e-3);
  S.forEach((r, i) => { assert.equal(w.slices[i].value, r.value); assert.equal(ring[i].label, r.type === 'Medal' ? 'M' : String(r.amount)); });
  const m = finalsWheel({ nb: 1 }, { coins: 1.25, fans: 1.1 });
  assert.equal(m.slices[4].label, String(Math.floor(Math.round(12.5) * 1.5 + 0.5))); // 10 Coins x1.25 -> 13 -> Prize Pair 20
  assert.equal(m.slices[0].label, 'M');
});

test('13c: paid amount = landed slice label = strip value, for every slice; Medal never doubled', () => withFlags(ON, () => {
  const s = finalsScreen();
  for (let i = 0; i < 12; i++) {
    const a = C(s, 'FinalsSpin', stopAt(i)), r = S[i], row = a.finalsSpin, v = sel.resultVM(a).finals;
    assert.equal(row.index, i); assert.equal(row.sliceId, i);
    if (r.type === 'Medal') { assert.equal(row.medal, 1); assert.equal(row.coins + row.tp + row.fans, 0); assert.equal(v.pending.label, 'M'); assert.equal(row.paid, 1); continue; }
    const k = typeKey[r.type]; assert.equal(row[k], r.amount); assert.equal(String(row[k]), v.pending.label); assert.equal(row.paid, r.amount);
    assert.equal(String(row[k]), v.ring[i].label);
    assert.equal(a.econ.coins - s.econ.coins, row.coins); assert.equal(a.econ.fans - s.econ.fans, row.fans);
  }
}));

test('9: result decided at STOP; reload shows the same slice, no re-spin; unspun reload has nothing paid', () => withFlags(ON, () => {
  const s = finalsScreen(), pre = sel.resultVM(clone(s)).finals; assert.ok(pre.due && pre.pending === null);
  assert.equal(s.finalsSpin, undefined);
  const a = C(s, 'FinalsSpin', stopAt(7));
  assert.equal(a.finalsSpin.index, 7);
  const re = clone(a); assert.equal(sel.resultVM(re).finals.pending.index, 7);
  assert.equal(C(re, 'FinalsSpin', stopAt(2)), re, 'no re-spin');
  assert.equal(C(a, 'FinalsSpin'), a);
  assert.deepEqual(C(s, 'FinalsSpin', stopAt(7)), a, 'deterministic');
  assert.notEqual(C(s, 'FinalsSpin', stopAt(3)).finalsSpin.index, 7);
}));

test('no payload (Auto / leave) = seeded width-weighted draw, still reload-safe, auto:true recorded', () => withFlags(ON, () => {
  const s = finalsScreen();
  const a = C(s, 'FinalsSpin'); assert.ok(a.finalsSpin.index >= 0 && a.finalsSpin.index < 12);
  const e = a.wheels.stops.finals[a.finalsSpin.key];
  assert.equal(e.stops[0].auto, true); assert.equal(e.stops[0].sliceId, a.finalsSpin.index);
  assert.equal(a.wheels.stats.finals.n, 1); assert.equal(a.wheels.stats.finals.taps.length, 0, 'auto leaves no tap');
}));

test('recordStop: real wheel-stops write, keyed season|kind|round, with the paid field', () => withFlags(ON, () => {
  const s = finalsScreen();
  const a = C(s, 'FinalsSpin', stopAt(10));
  assert.equal(a.finalsSpin.key, spinKeyOf(s, 'finals'));
  const e = storedStop(a, 'finals', a.finalsSpin.key); assert.equal(e.stops.length, 1);
  assert.deepEqual(e.stops[0], { stopT: 3500, cycle: 1, tInCycle: 3.5, sliceId: 10, value: 25, paid: 25, auto: false, respin: 0 });
  assert.equal(statsOf(a, 'finals').n, 1); assert.equal(statsOf(a, 'finals').taps.length, 1);
  C(a, 'FinalsSpin', stopAt(1)); assert.equal(statsOf(C(a, 'FinalsSpin', stopAt(1)), 'finals').n, 1, 'refused spin records nothing');
  const z = C(s, 'FinalsSpin', stopAt(0)); const z0 = storedStop(z, 'finals', z.finalsSpin.key).stops[0]; assert.equal(z0.paid, 1); assert.equal(z0.value, 60);
  assert.equal(statsOf(z, 'finals').careful, 1, 'value 60 is above the wheel median');
}));

test('11: tokens: Medal (gold) offers none; token Spin Again keeps pay in sync with the ledger', () => withFlags(ON, () => {
  const s0 = finalsScreen();
  const s = { ...s0, wheelMeta: { ...(s0.wheelMeta || {}), tokens: { respin: 3, nudge: 3, two: 3, wild: 0, lift: 3 } } };
  const m = C(s, 'FinalsSpin', stopAt(0));
  assert.deepEqual(sel.resultVM(m).finals.pending.medal, 1);
  assert.equal(wm.wmTokens(m, 'finals').length, 0, 'no token on a gold result');
  const a = C(s, 'FinalsSpin', stopAt(4)), t = wm.wmTokens(a, 'finals'); assert.ok(t.length > 0);
  const b = C(a, 'UseToken', { wheel: 'finals', kind: 'respin', careful: true });
  if (b !== a) { assert.equal(b.econ.coins - s.econ.coins, b.finalsSpin.coins); assert.equal(b.econ.fans - s.econ.fans, b.finalsSpin.fans); }
}));

test('frozen vectors md5 unchanged', () => {
  const md5 = (f) => createHash('md5').update(readFileSync(new URL(f, import.meta.url))).digest('hex');
  const m = { v: md5('./ball-vectors.json'), p: md5('./ball-vectors-pair.json') };
  assert.equal(m.v, 'e4325c773b7f8eef076eda7c49a13496'); assert.equal(m.p, '21cb036ef79bb769c4f7a2f0084e0e6b');
  assert.equal(finalsWheelOf(finalsScreen()).slices.length, 12);
});

test('finalsSpinVM carries spinKey and stored (same sliceId) after STOP', () => withFlags(ON, () => {
  const s = finalsScreen(), pre = sel.resultVM(clone(s)).finals; assert.equal(pre.spinKey, spinKeyOf(s, 'finals')); assert.equal(pre.stored, null);
  const a = C(s, 'FinalsSpin', stopAt(7)), vm = sel.resultVM(clone(a)).finals;
  assert.equal(vm.stored.stops[vm.stored.kept].sliceId, 7); assert.equal(vm.spinKey, spinKeyOf(s, 'finals'));
}));
