// Wheel meta w2 in the store: Hype dial, Toss and Pep reveals, Find reel, Scout list spin, Finals prize reel. Flag off = r9; flag on = seeded, never blocks, reload-safe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { applyCommand as C, mdFor } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { metaOf } from '../js/core/wheelmeta.js';
import { teamBoost } from '../js/core/matchday.js';
import { scoutList } from '../js/core/training.js';
import { makeRng } from '../js/core/rng.js';
import { hypeDialFor, dialResult, modsFor } from '../js/core/dialreel.js';
import { effective } from '../js/core/wheelmeta.js';
import { newGame, step } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const clone = (x) => JSON.parse(JSON.stringify(x));
const until = (st, pred, max = 4000) => { let g = 0; while (g++ < max && !pred(st.get()) && step(st)) { if (st.get().stage === 'matchday') st.dispatch('MatchdayGo'); } return st.get(); };
const open = (seed) => { const st = newGame(seed); const s = st.get(); return C({ ...s, econ: { ...s.econ, coins: 5000 } }, 'OpenMatchday'); };
const tally = (s) => metaOf(s).tally, spokes = (s) => metaOf(s).spokes;

test('flag off: every w2 command is refused and the match day / activity state is r9', () => withFlags({ wheelMeta: false, matchday: true, activities: true }, () => {
  const s = open('w2-off');
  assert.equal(s.stage, 'matchday');
  for (const c of ['HypeSpin', 'TossSpin', 'PepSpin', 'ScoutSpin', 'FinalsSpin']) assert.equal(C(s, c, { careful: true }), s, c);
  assert.equal(s.fixture.md.wm, undefined);
  assert.equal(sel.matchdayVM(s).wm, null);
  const p = C({ ...s, stage: 'hub' }, 'PickActivity', { id: 'banner', stop: { t: 2, phi: 1, e: 0 } });
  assert.equal(p.findSpin, undefined);
  assert.equal(sel.activitiesVM(p).options.every((o) => o.reel === null), true);
}));

test('Hype: the dial result is the seeded dialResult, written to md, tallied (Hype = 1 Spoke at tier 0)', () => withFlags(ON, () => {
  const s = open('w2-hype');
  const a = C(s, 'HypeSpin', { careful: true }), b = C(s, 'HypeSpin', { careful: true });
  assert.deepEqual(a, b, 'deterministic');
  const fx = s.fixture, key = `${fx.kind}|${fx.round}|${s.salt}`;
  const dial = hypeDialFor(s.econ.fans, [], modsFor(effective(s), 'hype'));
  const want = dialResult(makeRng(`${s.season.seed}|wm|hype|${key}`), dial, true);
  const md = a.fixture.md;
  assert.equal(md.hype, want.level); assert.equal(md.hypeIdx, want.levelIdx); assert.equal(md.hypeFanMult, want.fanMult); assert.equal(md.hypePerf, want.perf);
  assert.equal(md.wm.hype.index, want.index);
  assert.equal(tally(a), 1); assert.equal(spokes(a), 1);
  assert.equal(C(a, 'HypeSpin', { careful: true }), a, 'one spin per match day');
  assert.ok(Math.abs(teamBoost(md, null) - (want.perf)) < 1e-9 || teamBoost(md, null) > 0);
  const stop = C(s, 'HypeSpin', { stop: { t: 2, phi: 3, e: 0.1 } }); assert.ok(stop.fixture.md.wm.hype, 'a view stop is taken');
  const pend = sel.matchdayVM(a).wm.hype.pending; assert.equal(pend.index, want.index);
}));

test('Toss and Pep reveals: results in md, boost numbers, Spokes from each wheel', () => withFlags(ON, () => {
  let s = open('w2-tp');
  s = C(s, 'TossSpin'); const md1 = s.fixture.md;
  assert.ok(md1.wm.toss); assert.equal(md1.tossBoost, md1.wm.toss.boostPct / 100);
  assert.equal(md1.toss, md1.wm.toss.id === 'won' ? 'won' : 'lost');
  const sport = md1.wm.toss.id === 'sport';
  assert.equal(spokes(s), sport ? 2 : 1, 'Toss base 1, +1 on a good-sport slice');
  s = C(s, 'PepSpin'); const md2 = s.fixture.md;
  assert.ok(md2.wm.pep.slots.length >= 1); assert.equal(md2.pepSlot, md2.wm.pep.slots[0]);
  assert.equal(md2.pepId, s.clubs[0].six[md2.pepSlot - 1]);
  assert.equal(tally(s), 2); assert.equal(spokes(s), (sport ? 2 : 1) + 1);
  assert.equal(C(s, 'TossSpin'), s); assert.equal(C(s, 'PepSpin'), s);
  const six = s.clubs[0].six;
  assert.ok(teamBoost(mdFor(s, six), six[md2.pepSlot - 1]) >= teamBoost(mdFor(s, six), null));
}));

test('tier adds a Spoke per spin: tier 1 Hype = 2', () => withFlags(ON, () => {
  let s = open('w2-tier'); s = { ...s, wheelMeta: { ...s.wheelMeta, tally: 10 } };
  const a = C(s, 'HypeSpin', { careful: true }); assert.equal(spokes(a) - spokes(s), 2); assert.equal(tally(a), 11);
}));

test('never blocks: skipping the screen resolves all three with random taps at match start; whole flow still runs', () => withFlags(ON, () => {
  const st = newGame('w2-skip');
  const s = until(st, (x) => x.stage === 'bowl');
  const md = s.match.md;
  assert.ok(md.wm && md.wm.hype && md.wm.toss && md.wm.pep, 'all three settled');
  assert.equal(tally(s), 3); assert.equal(spokes(s), 3);
  // a hand-spun hype is kept, the others settle
  const t = open('w2-skip2'), h = C(t, 'HypeSpin', { careful: true }), go = C(h, 'MatchdayGo');
  assert.equal(go.fixture.md.hypeIdx, h.fixture.md.hypeIdx); assert.equal(tally(go), 3);
}));

test('reload-safe: pending results survive a JSON round trip and read the same from the selectors', () => withFlags(ON, () => {
  let s = open('w2-reload'); s = C(C(C(s, 'HypeSpin', { careful: true }), 'TossSpin'), 'PepSpin');
  const r = clone(s);
  assert.deepEqual(sel.matchdayVM(r).wm, sel.matchdayVM(s).wm);
  assert.equal(sel.matchdayVM(r).wm.hype.spun && sel.matchdayVM(r).wm.toss.spun && sel.matchdayVM(r).wm.pep.spun, true);
  assert.equal(C(r, 'HypeSpin', { careful: true }), r);
}));

test('Find: the reel decides the find, tallies (Find = 2 Spokes), keeps the pending result; rest has no reel', () => withFlags(ON, () => {
  const st = newGame('w2-find'); let s = st.get(); s = { ...s, econ: { ...s.econ, coins: 5000 } };
  const vm = sel.activitiesVM(s), o = vm.options.find((x) => x.id === 'banner');
  assert.ok(o.reel && o.reel.cells.length === 8, 'eight cells, pending null'); assert.equal(o.reel.pending, null);
  assert.equal(o.reel.cells.reduce((a, c) => a + c.w, 0).toFixed(6), '12.000000');
  const a = C(s, 'PickActivity', { id: 'banner', stop: { t: 2, phi: 1.5, e: 0.1 } }), b = C(s, 'PickActivity', { id: 'banner', stop: { t: 2, phi: 1.5, e: 0.1 } });
  assert.deepEqual(a, b); assert.equal(tally(a), 1); assert.equal(spokes(a), 2);
  assert.equal(a.findSpin.id, 'banner');
  const fs = a.findSpin; assert.equal(fs.find, a.econ.act.hist[0].find != null);
  if (fs.find) assert.equal(a.econ.act.hist[0].find.type, fs.type);
  assert.equal(sel.activitiesVM(a).options.find((x) => x.id === 'banner').reel.pending.index, fs.index);
  const rest = C(s, 'PickActivity', { id: 'rest' }); assert.equal(tally(rest), 0); assert.equal(rest.findSpin, undefined);
  // random tap (no stop) never blocks
  assert.ok(C(s, 'PickActivity', { id: 'banner' }).findSpin);
}));

test('Find: across many seeds the reel finds about the table rate and pity is a reveal pick (sure find)', () => withFlags(ON, () => {
  let finds = 0, N = 60;
  for (let i = 0; i < N; i++) { const st = newGame('w2-fr' + i); const s = st.get(); const a = C({ ...s, econ: { ...s.econ, coins: 5000 } }, 'PickActivity', { id: 'banner' }); if (a.findSpin.find) finds++; }
  assert.ok(finds > 2 && finds < N, 'some, not all: ' + finds);
  const st = newGame('w2-pity'); let s = st.get(); s = { ...s, econ: { ...s.econ, coins: 5000, act: { hist: [], dry: 99, doneKey: null } } };
  const a = C(s, 'PickActivity', { id: 'banner' }); assert.equal(a.findSpin.pity, true); assert.equal(a.findSpin.find, true);
}));

test('Scout: one spin a season; Extra name adds a candidate, Top name raises the best; Scout = 4 Spokes', () => withFlags(ON, () => {
  const st = newGame('w2-scout'); const s = st.get();
  const before = scoutList(s); assert.ok(before.length > 0);
  const vm0 = sel.coachPickVM(s); assert.ok(vm0.spin && !vm0.spin.spun);
  let seenExtra = false, seenTop = false;
  for (let i = 0; i < 40 && !(seenExtra && seenTop); i++) {
    const g = newGame('w2-scout' + i).get(), l0 = scoutList(g), a = C(g, 'ScoutSpin');
    assert.equal(tally(a), 1); assert.equal(spokes(a), 4); assert.equal(C(a, 'ScoutSpin'), a, 'once a season');
    const l1 = scoutList(a), sp = a.scoutSpin;
    assert.equal(l1.length, l0.length + sp.extra);
    if (sp.extra) { seenExtra = true; assert.deepEqual(l1.slice(0, l0.length).map((c) => c.step), l0.map((c) => c.step).map((x, j) => (sp.steps && x === Math.max(...l0.map((c) => c.step)) ? l1[j].step : x))); }
    if (sp.steps) { seenTop = true; assert.ok(Math.max(...l1.map((c) => c.step)) >= Math.max(...l0.map((c) => c.step))); }
    assert.equal(sel.coachPickVM(a).spin.spun, true);
  }
  assert.ok(seenExtra && seenTop, 'both kinds of slice show up');
  assert.deepEqual(scoutList(clone(C(s, 'ScoutSpin'))), scoutList(C(s, 'ScoutSpin')), 'reload-safe');
}));

test('Finals: a semi or final result screen has one prize reel; pays at once, ledger row, Finals = 5 Spokes', () => withFlags(ON, () => {
  let found = null;
  for (let i = 0; i < 6 && !found; i++) {
    const st = newGame('w2-fin' + i);
    const s = until(st, (x) => x.stage === 'done' && x.fixture && (x.fixture.kind === 'semi' || x.fixture.kind === 'final'), 6000);
    if (s.stage === 'done' && s.fixture && s.fixture.kind !== 'league') found = s;
  }
  assert.ok(found, 'reached a finals result screen');
  const s = found, v = sel.resultVM(s).finals; assert.ok(v && v.due && v.pending === null);
  const t0 = tally(s), sp0 = spokes(s), a = C(s, 'FinalsSpin');
  assert.equal(tally(a) - t0, 1); assert.ok(spokes(a) - sp0 >= 5);
  const fsn = a.finalsSpin, row = a.econ.ledger[a.econ.ledger.length - 1];
  assert.equal(row.k, 'finalsprize'); assert.equal(row.coins, fsn.coins);
  assert.equal(a.econ.coins - s.econ.coins, fsn.coins); assert.equal(a.econ.fans - s.econ.fans, fsn.fans); assert.equal(a.training.tp - s.training.tp, fsn.tp);
  assert.equal(C(a, 'FinalsSpin'), a, 'once'); assert.deepEqual(a, C(s, 'FinalsSpin'));
  assert.equal(sel.resultVM(a).finals.due, false); assert.equal(sel.resultVM(clone(a)).finals.pending.index, fsn.index);
  const fin = C(a, 'FinishMatch'); assert.equal(fin.stage, 'train'); assert.ok(fin.econ.coins >= a.econ.coins);
  assert.equal(C({ ...s, fixture: { ...s.fixture, kind: 'league' } }, 'FinalsSpin').finalsSpin, undefined, 'league matches have no prize reel');
}));
