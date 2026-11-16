// wa1 slice A (agent "find"): Find big wheel (SPEC 2026-11-14 s1 + s3a, sim/find_fast_sim.py), per-wheel glide D, tree on Find, tokens on Find.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { FIND_WHEEL } from '../js/data/dialreel.js';
import { TRAIN2 } from '../js/data/training.js';
import { findWheel, findWheelResult, neutralMods, pityFind } from '../js/core/dialreel.js';
import { stopDist, stopExtra, wheelSpeed, stopLanding, spinResult, carefulTapTime, wheelSlices } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';
import { metaOf } from '../js/core/wheelmeta.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { findSpinVM, findWheelOf } from '../js/store/wmstore.js';
import { newGame } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const MIX = { coins: 40, player: 30, coach: 30 };
const CTL = { w0Mult: 0.55, jMult: 0.7, guide: true }; // Slow 3, Steady 2, Aim Guide
const rate = (f, stop, mods, ctl, N = 20000, seed = 'wa1f') => {
  const w = findWheel({ find: f, mix: MIX }, mods, ctl), r = makeRng(seed + f + String(stop)); let n = 0;
  for (let i = 0; i < N; i++) n += findWheelResult(r, w, stop).find ? 1 : 0;
  return n / N * 100;
};

test('physics: Spotlight is byte-identical (no phys.D = WS.D); a per-wheel phys.D sets the glide', () => {
  const WS = TRAIN2.wheelStop;
  for (const t of [1, 2.5, 3.5, 6]) {
    assert.equal(stopDist(t), wheelSpeed(t) * WS.D / 3);
    assert.equal(stopDist(t, { W0: 18 }), wheelSpeed(t, { W0: 18 }) * WS.D / 3);
    assert.equal(stopDist(t, { W0: 36, D: 2 }), wheelSpeed(t, { W0: 36 }) * 2 / 3);
  }
  assert.equal(stopExtra(3, 0.2, 0.5), stopExtra(3, 0.2, 0.5, {}));
  assert.equal(stopExtra(3, 0.2, WS.D), 3.2); // WS.D = 2: done at 2 s
  assert.ok(stopExtra(3, 0.2, 1, { D: 2 }) < 3.2 && Math.abs(stopExtra(3, 0.2, 2, { D: 2 }) - 3.2) < 1e-12); // Find: done at 2 s
  const w = wheelSlices('normal'), a = makeRng('spot'), b = makeRng('spot');
  for (let i = 0; i < 50; i++) { const r = spinResult(a, w, i % 2 === 0); const q = spinResult(b, w, i % 2 === 0); assert.deepEqual(r, q); }
  assert.ok(Number.isFinite(carefulTapTime(w, 1.3, 0.5, 0.5)));
});

test('findWheel (SPEC s5): the find rate picks the ring, 2 blocks (3 at 26%), one slice a block, phys W0 36 / D 2 / J 1.5', () => {
  const RING = { 8: 0.08, 14: 0.18, 16: 0.18, 18: 0.18, 22: 0.18, 26: 0.26 }; // nearest ring, a tie to the lower
  for (const f of [8, 14, 16, 18, 22, 26]) {
    const w = findWheel({ find: f, mix: MIX });
    assert.equal(w.C, 10); assert.equal(w.rate, RING[f]); assert.ok(Math.abs(w.widths.reduce((a, b) => a + b, 0) - 10) < 1e-9);
    const nb = f === 26 ? 3 : 2; assert.equal(w.finds.length, nb); assert.equal(w.cells.length, nb * (f === 26 ? 4 : 5));
    assert.deepEqual(w.golds, w.finds); assert.equal(w.aims.length, nb - (f === 26 ? 1 : 0)); // the 2% block is never an aim
    assert.deepEqual(w.phys, { W0: 36, J: 1.5, D: 2, SD: 0.11 });
    assert.deepEqual(w.mix.map((x) => x[0]), ['coach', 'coins', 'player']);
    for (const c of w.cells.filter((c) => c.find)) assert.ok(c.w <= 1.3 + 1e-9);
  }
  assert.deepEqual(findWheel({ find: 8, mix: { coins: 80, player: 20, coach: 0 } }).mix.map((x) => x[0]), ['coins', 'player']);
  assert.deepEqual(FIND_WHEEL.W0 + '|' + FIND_WHEEL.D, '36|2'); // J 1.5 now lives in js/data/wheels/find.js (FIND_J); FIND_WHEEL.J / BLOCKS are unused
});

test('findWheel tree: Slow / Steady / Guide phys, Widener + Sharp Eyes on each block, Extra Gold = 3rd block at 0.75, no re-split', () => {
  const w = findWheel({ find: 18, mix: MIX }, { ...neutralMods(), goldAdd: 0.06, rareAdd: 0.06, extra: 1 }, CTL);
  assert.ok(Math.abs(w.phys.W0 - 19.8) < 1e-9); assert.ok(Math.abs(w.phys.J - 1.05) < 1e-9); assert.equal(w.phys.SD, 0.08); assert.equal(w.phys.D, 2);
  const f = w.finds.map((i) => w.cells[i]); assert.equal(f.length, 3);
  for (const c of f.filter((c) => !c.second)) assert.ok(Math.abs(c.w - (0.9 + 0.12)) < 1e-9);
  assert.ok(Math.abs(f.find((c) => c.second).w - 0.75 * 1.02) < 1e-9); assert.equal(w.aims.length, 3);
  assert.ok(Math.abs(w.widths.reduce((a, b) => a + b, 0) - 10) < 1e-9);
  const big = findWheel({ find: 26, mix: MIX }, { ...neutralMods(), goldAdd: 0.5 }); assert.ok(Math.max(...big.widths) <= 1.3 + 1e-9, 'ceiling 13.0%'); assert.equal(big.finds.length, 3);
});

test('findWheelResult: seeded, always 8 draws, explicit stop = landing, pity = sure find', () => {
  const w = findWheel({ find: 18, mix: MIX }), a = makeRng('d'), b = makeRng('d');
  findWheelResult(a, w, true); findWheelResult(b, w, { t: 2, phi: 1, e: 0 }); assert.equal(a.random(), b.random());
  const r = findWheelResult(makeRng('q'), w, { t: 3, phi: 2, e: 0.1 }), L = stopLanding(w, { t: 3, phi: 2, e: 0.1 });
  assert.equal(r.index, L.index); assert.equal(r.find, w.cells[L.index].find);
  const p = makeRng('pity'); for (let i = 0; i < 100; i++) { const x = pityFind(p, w); assert.ok(w.cells[x.index].find); assert.ok(['coins', 'player', 'coach'].includes(x.type)); }
  // Second Cheer is its own aimed spin now (store FindCheer): the result never re-picks a Nothing landing
  const wc = findWheel({ find: 18, mix: MIX }, { ...neutralMods(), cheer: 1 }), q = makeRng('ch');
  for (let i = 0; i < 500; i++) { const x = findWheelResult(q, wc, false); assert.equal(x.find, wc.cells[x.index].find); assert.ok(!x.cheered); assert.equal(x.type !== null, x.find); }
});

test('parity (SPEC s5): random ~ rate, avg careful 11.7 / 26.0 / 35.1 (1.46 / 1.44 / 1.35x), Control + Widener + Extra Gold under 55% at 18%', () => {
  const r18 = rate(18, false), c18 = rate(18, true), c8 = rate(8, true), c26 = rate(26, true);
  assert.ok(Math.abs(r18 - 18) < 0.8, 'random ' + r18);
  assert.ok(Math.abs(c18 - 26.0) < 1.2, 'careful 18 ' + c18);
  assert.ok(Math.abs(c8 - 11.7) < 1.0, 'careful 8 ' + c8);
  assert.ok(Math.abs(c26 - 35.1) < 1.5, 'careful 26 ' + c26);
  const ctl = rate(18, true, neutralMods(), CTL); assert.ok(Math.abs(ctl - 40.2) < 3, 'control only ' + ctl);
  const full = rate(18, true, { ...neutralMods(), goldAdd: 0.06, extra: 1 }, CTL); assert.ok(full > 40 && full <= 55, 'full ' + full);
  const fr = rate(18, false, { ...neutralMods(), goldAdd: 0.06, extra: 1 }, CTL); assert.ok(Math.abs(fr - 26.2) < 1.5, 'full random ' + fr);
});

test('store: flag off = no wheel; flag on = big-wheel VM, PickActivity {stop} is seeded and lands where the stop says', () => {
  withFlags({ wheelMeta: false, matchday: true, activities: true }, () => { const s = newGame('wa1f-off').get(); assert.equal(findSpinVM(s, 'banner'), null); });
  withFlags(ON, () => {
    const st = newGame('wa1f-on'); const s = { ...st.get(), econ: { ...st.get().econ, coins: 5000 } };
    const vm = findSpinVM(s, 'banner'); assert.equal(vm.slices.length, 12); assert.equal(vm.golds.length, 3); // banner = 26%: 12 / 12 / 2 ring assert.equal(vm.phys.D, 2); assert.equal(vm.pending, null);
    assert.ok(vm.labels.filter((l) => l === 'FIND').length === 2 && vm.labels.filter((l) => l === 'F').length === 1); assert.ok(vm.rows.every((r) => r.w >= 0.7 || r.label.length === 1));
    const stop = { t: 3.1, phi: 2.2, e: 0.05 }, a = C(s, 'PickActivity', { id: 'banner', stop }), b = C(s, 'PickActivity', { id: 'banner', stop });
    assert.deepEqual(a, b); assert.equal(metaOf(a).tally, 1);
    assert.equal(a.findSpin.index, stopLanding(findWheelOf(s, 'banner'), stop).index);
    const o = sel.activitiesVM(a).options.find((x) => x.id === 'banner'); assert.equal(o.reel.pending.index, a.findSpin.index);
  });
});

test('tokens on Find: offered only on a no-find, a re-spin find replaces the pending result and is paid once; cap 2 a season', () => withFlags(ON, () => {
  let checked = 0, found = 0;
  for (let i = 0; i < 40 && checked < 12; i++) {
    const st = newGame('wa1f-tok' + i), s0 = st.get();
    const s = { ...s0, econ: { ...s0.econ, coins: 5000 }, wheelMeta: { ...metaOf(s0), tokens: { respin: 3, nudge: 0, two: 0, wild: 0, lift: 0 } } };
    const a = C(s, 'PickActivity', { id: 'banner', stop: { t: 1.2 + i * 0.11, phi: i * 0.37, e: 0 } });
    const vm = findSpinVM(a, 'banner');
    if (a.findSpin.find) { assert.deepEqual(vm.tokens, [], 'no token on a find'); continue; }
    checked++;
    assert.ok(vm.tokens.some((t) => t.kind === 'respin'), 'Spin Again offered on a no-find');
    assert.ok(!vm.tokens.some((t) => t.kind === 'lift'), 'no Lift on Find');
    const b = C(a, 'UseToken', { wheel: 'find', kind: 'respin', careful: true });
    assert.notEqual(b, a); assert.equal(metaOf(b).tokens.respin, 2); assert.equal(b.findSpin.tokUsed, 1);
    assert.deepEqual(b, C(a, 'UseToken', { wheel: 'find', kind: 'respin', careful: true }), 'seeded');
    const h = b.econ.act.hist; assert.equal(h.filter((x) => x.id === 'banner' && x.idx === a.econ.act.hist[0].idx).length, 1, 'one activity record');
    assert.equal(b.econ.fans, a.econ.fans, 'Fans paid once');
    if (b.findSpin.find) {
      found++; assert.ok(h[0].find); assert.equal(b.findSpin.type, h[0].find.type);
      if (h[0].find.type === 'coins') assert.equal(b.econ.coins, a.econ.coins + h[0].find.coins + (b.findSpin.bonus | 0));
      assert.equal(b.econ.act.dry, 0);
      assert.equal(C(b, 'UseToken', { wheel: 'find', kind: 'respin' }), b, 'no token after a find');
    } else {
      assert.equal(b.econ.coins, a.econ.coins);
      const c = C(b, 'UseToken', { wheel: 'find', kind: 'respin' });
      if (!c.findSpin.find) assert.equal(C(c, 'UseToken', { wheel: 'find', kind: 'respin' }), c, 'cap 2 a season');
    }
  }
  assert.ok(checked >= 6, 'enough no-finds: ' + checked); assert.ok(found >= 1, 'a token found something: ' + found);
}));

// ---------------------------------------------------------------- wa1 find2: parity at 8 / 18 / 26 %, Nudge guard, flag off
const FULL = { ...neutralMods(), goldAdd: 0.06, extra: 1 }; // SPEC 3a full tree: Control + Widener + Extra Gold (no Sharp Eyes / Second Cheer)
test('find2 parity (20k seeds each): random ~ rate at 8/18/26; careful 11.7/26.0/35.1 (SPEC s5); full tree no tokens; never > 55% at 18%', () => {
  const want = { 8: [11.7, 21.5], 18: [26.0, 43.0], 26: [35.1, 55.2] }; // SPEC s5 careful; full = Control + Widener + Extra Gold on the new rings
  for (const f of [8, 18, 26]) {
    const r = rate(f, false, neutralMods(), {}, 20000, 'f2r'), c = rate(f, true, neutralMods(), {}, 20000, 'f2c'), full = rate(f, true, FULL, CTL, 20000, 'f2f');
    assert.ok(Math.abs(r - f) < 0.9, f + ' random ' + r);
    assert.ok(Math.abs(c - want[f][0]) < 1.2, f + ' careful ' + c);
    assert.ok(Math.abs(full - want[f][1]) < 4, f + ' full tree ' + full);
    if (f === 18) assert.ok(full <= 55, 'full tree at 18% over the 55% bug line: ' + full);
  }
});

test('find2 tokens: every find cell is gold for the guards, so Nudge is never offered on Find (no sure find from Nothing); Lift never', () => withFlags(ON, () => {
  let checked = 0;
  for (let i = 0; i < 60 && checked < 10; i++) {
    const s0 = newGame('wa1f2-nudge' + i).get();
    const s = { ...s0, econ: { ...s0.econ, coins: 5000 }, wheelMeta: { ...metaOf(s0), tokens: { respin: 1, nudge: 2, two: 1, wild: 2, lift: 2 } } };
    const a = C(s, 'PickActivity', { id: 'banner', stop: { t: 1.3 + i * 0.13, phi: i * 0.41, e: 0 } });
    if (a.findSpin.find) continue;
    checked++;
    const kinds = findSpinVM(a, 'banner').tokens.map((t) => t.kind);
    assert.ok(!kinds.includes('nudge') && !kinds.includes('lift'), 'offers ' + kinds);
    assert.ok(kinds.includes('respin') && kinds.includes('two'));
    assert.equal(C(a, 'UseToken', { wheel: 'find', kind: 'nudge' }), a, 'Nudge refused');
    assert.equal(C(a, 'UseToken', { wheel: 'find', kind: 'lift' }), a, 'Lift refused');
  }
  assert.ok(checked >= 5, 'no-finds checked: ' + checked);
}));

test('find2 flag off: UseToken {wheel:find} and the old activity pick are unchanged (no findSpin, no tokens)', () => withFlags({ wheelMeta: false, matchday: true, activities: true }, () => {
  const s0 = newGame('wa1f2-off').get(), s = { ...s0, econ: { ...s0.econ, coins: 5000 } };
  assert.equal(C(s, 'UseToken', { wheel: 'find', kind: 'respin' }), s);
  const a = C(s, 'PickActivity', { id: 'banner' }); assert.equal(a.findSpin, s.findSpin);
  assert.equal(C(a, 'UseToken', { wheel: 'find', kind: 'respin' }), a);
  const o = sel.activitiesVM(s).options.find((x) => x.id === 'banner'); assert.equal(o.reel, null);
}));

// ---------------------------------------------------------------- wa1 find2 (review H2): REAL full tree via effective() -> modsFor(E,'find') -> findWheel(row, mods, E.find)
import { NODES } from '../js/data/wheelmeta.js';
import { effective, } from '../js/core/wheelmeta.js';
import { modsFor } from '../js/core/dialreel.js';
const allOwned = () => withFlags(ON, () => {
  const s = newGame('wa1f2-all').get(), wm = { ...metaOf(s), owned: {}, tally: 600 }, wc = { ...(s.wheelCraft || {}), owned: {} };
  for (const n of NODES) (n.branch === 'craft' ? wc.owned : wm.owned)[n.id] = n.max_rank;
  const E = effective({ ...s, wheelMeta: wm, wheelCraft: wc });
  return { mods: modsFor(E, 'find'), ctl: E.find || {} };
});
const realFull = (cheer) => { const { mods, ctl } = allOwned(); return rate(18, true, { ...mods, ...(cheer ? {} : { cheer: 0 }) }, ctl, 20000, 'f2all' + cheer); };
// wa1 findtune (NUMBERS ruling, SPEC 3a BUILD Q 16:55): Sharp Eyes +0.02 a block a rank; Second Cheer 1 a season (no token, never chains); no Nudge on Find
const FIND_SPINS_SEASON = 6; // season model for the 1-a-season Second Cheer
const realSeason = () => { const { mods, ctl } = allOwned(); const w = findWheel({ find: 18, mix: MIX }, { ...mods, cheer: 0 }, ctl), r = makeRng('ftseason');
  let h = 0, n = 0; for (let s = 0; s < 20000 / FIND_SPINS_SEASON; s++) { let used = false; for (let k = 0; k < FIND_SPINS_SEASON; k++) { let x = findWheelResult(r, w, true); if (!x.find && !used) { used = true; x = findWheelResult(r, w, true); } h += x.find ? 1 : 0; n++; } } return 100 * h / n; }; // Second Cheer = one free aimed re-spin after the first no-find
test('findtune H2: every node owned (effective -> modsFor) at 18%: ~47% a spin, ~51% with Second Cheer 1 a season, both < 55% (bug line)', () => {
  const { mods } = allOwned(); assert.equal(+mods.rareAdd.toFixed(3), 0.04, 'Sharp Eyes 2 ranks = +0.04 a block');
  const spin = realFull(false), season = realSeason();
  console.log(`# findtune real full tree @18% avg careful: ${spin.toFixed(1)}% a spin (Sharp Eyes in), ${season.toFixed(1)}% with Second Cheer 1 a season (${FIND_SPINS_SEASON} Find spins)`);
  assert.ok(spin > 44 && spin < 51, 'full tree a spin ' + spin); assert.ok(season > spin && season < 55, 'with Second Cheer ' + season);
});
import { findForce } from '../js/store/wmstore.js';
test('findtune: Second Cheer is a separate FindCheer spin once a season (wheelMeta.cheerUsed{season}, missing = 0), no token, no Nudge on Find', () => withFlags(ON, () => {
  const s0 = newGame('wa1ft-cheer').get(), wm = { ...metaOf(s0), owned: { sp_fnd_r: 1 }, tokens: { respin: 0, nudge: 2, two: 0, wild: 0, lift: 0 } };
  const s = { ...s0, econ: { ...s0.econ, coins: 5000 }, wheelMeta: wm }, sn = (s.season && s.season.n) || 1; let hits = 0;
  for (let i = 0; i < 60 && hits < 4; i++) {
    const stop = { t: 1.1 + i * 0.13, phi: i * 0.41, e: 0 }, a = C(s, 'PickActivity', { id: 'banner', stop }); if (a.findSpin.find) continue;
    hits++; assert.equal(findForce(s, 'banner', { stop }).second, false); assert.equal(metaOf(a).cheerUsed, undefined, 'the pick alone spends no cheer');
    const b = C(a, 'FindCheer', { careful: true }); assert.equal(metaOf(b).cheerUsed[sn], 1, 'cheer marked used'); assert.deepEqual(metaOf(b).tokens, wm.tokens, 'no token');
    assert.equal(C(b, 'FindCheer', { careful: true }), b, 'once');
    assert.ok(!findSpinVM(a, 'banner').tokens.some((t) => t.kind === 'nudge'), 'no Nudge on Find');
  }
  assert.ok(hits >= 2, 'cheer cases: ' + hits);
  const t = Object.values(findWheelOf(s, 'banner').mods).length; assert.ok(t > 0);
}));
