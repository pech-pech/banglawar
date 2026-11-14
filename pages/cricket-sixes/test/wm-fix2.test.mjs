// Wheel meta w1 fix round 2: Aim Zone + Gold Chime, capped Spotlight, overlay inert safety + tier-up guard, Booster / Hot Streak shown,
// spun wheel passed on, swap at season end and run end, switch off/on refills tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { FLAGS } from '../js/data/flags.js';
import { RUN } from '../js/data/run.js';
import { NODES } from '../js/data/wheelmeta.js';
import { emptyWheelMeta } from '../js/core/save-migrate.js';
import { effective, metaWheel } from '../js/core/wheelmeta.js';
import { wheelSlices, netsPreview } from '../js/core/training.js';
import { goldNearPointer, chimeEnters } from '../js/ui/wheel-view.js';
import { releaseInert, OVERLAYS } from '../js/ui/inert.js';
import { swapCardHtml } from '../js/ui/swap-offer.js';
import { render as renderRunEnd } from '../js/ui/runend-view.js';
import { newGame, step } from './_season-bot.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const withFlag = (on, fn) => { const old = FLAGS.wheelMeta; FLAGS.wheelMeta = on; try { return fn(); } finally { FLAGS.wheelMeta = old; } };
const untilTrain = (seed) => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'train' && g++ < 3000 && step(st)); return st.get(); };
const withOwned = (s, owned, extra = {}) => ({ ...s, wheelMeta: { ...emptyWheelMeta(), ...(s.wheelMeta || {}), owned, ...extra } });
const allPower = () => Object.fromEntries(NODES.filter((n) => n.branch !== 'craft').map((n) => [n.id, n.max_rank]));

// ---- 2. Aim Zone, Gold Chime
test('effective: Aim Zone adds 0.2 s and Gold Chime sets the cue, on Spotlight and Course only, only when owned', () => {
  withFlag(true, () => {
    const s = untilTrain('f2a'), none = effective(s);
    for (const w of ['spot', 'course']) { assert.equal(none[w].zone, 0); assert.equal(none[w].chime, false); }
    const e = effective(withOwned(s, { c_zone: 1, c_chime: 1 }));
    for (const w of ['spot', 'course']) { assert.equal(e[w].zone, 0.2); assert.equal(e[w].chime, true); }
    for (const w of ['hype', 'toss', 'pep', 'find', 'scout', 'finals']) { assert.equal(e[w].zone, 0, w); assert.equal(e[w].chime, false, w); }
    const z = effective(withOwned(s, { c_zone: 1 })); assert.equal(z.spot.zone, 0.2); assert.equal(z.spot.chime, false);
    const base = metaWheel(wheelSlices('normal'), 'spot', s), wz = metaWheel(wheelSlices('normal'), 'spot', withOwned(s, { c_zone: 1, c_chime: 1 }));
    assert.deepEqual(wz, base, 'no odds change: the wheel itself is identical');
  });
  withFlag(false, () => { const e = effective({ wheelMeta: { owned: { c_zone: 1 } } }); assert.equal(e.spot.zone, 0); });
});

test('selectors carry zone and chime to the Spotlight and Course wheel props', () => {
  withFlag(true, () => {
    const s0 = untilTrain('f2b'), id = s0.clubs[0].squad[0].id;
    const s = C(withOwned(s0, { c_zone: 1, c_chime: 1 }), 'SetTrainPlan', { spotlightId: id });
    const sp = sel.trainingVM(s).spotlight; assert.equal(sp.zone, 0.2); assert.equal(sp.chime, true);
    assert.ok(sel.trainingVM(s).coaches.every((c) => c.course.zone === 0.2 && c.course.chime === true), 'course rows carry them');
    const off = sel.trainingVM(C(s0, 'SetTrainPlan', { spotlightId: id })).spotlight; assert.equal(off.zone, 0); assert.equal(off.chime, false);
  });
  withFlag(false, () => { const s = untilTrain('f2b'); assert.equal(sel.trainingVM(s).spotlight.zone, undefined, 'flag off: no meta props'); });
  for (const f of ['training-view', 'coaches-sheet']) assert.match(read('js/ui/' + f + '.js'), /zone:.*chime:/, f + ' passes zone and chime to openWheel');
});

test('Aim Zone glow: on while a gold slice is under or within 0.2 s of the pointer; off far away; none with zone 0', () => {
  const cum = [0, 2, 4, 6, 8, 10], C = 10, golds = [0]; // slice 0 (gold) = 0..2
  assert.equal(goldNearPointer(1, 10, 0.2, cum, C, golds), true, 'pointer inside gold');
  assert.equal(goldNearPointer(9, 10, 0.2, cum, C, golds), true, '1 unit before gold at 10 u/s = 0.1 s away');
  assert.equal(goldNearPointer(7, 10, 0.2, cum, C, golds), false, '3 units before = 0.3 s away');
  assert.equal(goldNearPointer(2.5, 10, 0.2, cum, C, golds), true, 'just past the gold edge (0.05 s)');
  assert.equal(goldNearPointer(5, 10, 0.2, cum, C, golds), false, 'opposite side');
  assert.equal(goldNearPointer(5, 24, 0.2, cum, C, golds), true, 'fast wheel: 0.2 s is further');
  assert.equal(goldNearPointer(9, 10, 0, cum, C, golds), false, 'zone 0 = never');
  assert.equal(goldNearPointer(5, 10, 0.2, cum, C, [0, 2]), true, 'any gold slice counts (Extra Gold)');
});

test('Gold Chime: only when the pointer enters a gold slice from a non-gold one', () => {
  assert.equal(chimeEnters(3, 0, [0]), true); assert.equal(chimeEnters(0, 1, [0]), false); assert.equal(chimeEnters(2, 2, [0]), false);
  assert.equal(chimeEnters(0, 4, [0, 4]), false, 'gold to gold is not a new pass');
  assert.equal(chimeEnters(3, 4, [0, 4]), true, 'the extra gold chimes too');
  const js = read('js/ui/wheel-view.js');
  assert.match(js, /chime: true/, 'onTick gets {chime:true}'); assert.match(js, /is-chime/, 'the pointer flashes');
  assert.match(js, /ZONE = !reduced/, 'no zone with reduced motion'); assert.match(js, /CHIME = !reduced/, 'no chime with reduced motion');
  assert.match(read('css/training2.css'), /\.wh-ov \.wh-ptr\.is-chime/);
});

// ---- 3. capped Spotlight
const capPlayer = (s, id) => { const n = JSON.parse(JSON.stringify(s)); const p = n.clubs[0].squad.find((x) => x.id === id); for (const k of ['bp', 'bs', 'spd', 'bsk']) p[k] = 99; return n; };
test('Spotlight on a player who cannot gain: no wheel, no tally, no Spokes (02 section 7)', () => {
  withFlag(true, () => {
    const s0 = untilTrain('f2c'), id = netsPreview(s0).trainIds[0], cap = C(capPlayer(s0, id), 'SetTrainPlan', { spotlightId: id }); // a player who can gain until capped (s1 skew can lock squad[0])
    assert.ok(sel.trainingVM(cap).rows.find((r) => r.id === id).status === 'skip', 'fixture: the player cannot gain');
    assert.equal(sel.trainingVM(cap).spotlight.wheel, null, 'the wheel is not offered');
    const after = C(cap, 'Spin', { careful: true });
    assert.equal(after, cap, 'Spin does nothing'); assert.equal(after.wheelMeta.tally, cap.wheelMeta.tally); assert.equal(after.wheelMeta.spokes, cap.wheelMeta.spokes);
    const ok = C(s0, 'SetTrainPlan', { spotlightId: id }), spun = C(ok, 'Spin', { careful: true });
    assert.equal(spun.wheelMeta.tally, ok.wheelMeta.tally + 1, 'a player who can gain still counts');
  });
  withFlag(false, () => { // r9 behaviour is untouched with the flag off
    const s0 = untilTrain('f2c'), id = netsPreview(s0).trainIds[0], cap = C(capPlayer(s0, id), 'SetTrainPlan', { spotlightId: id });
    assert.ok(sel.trainingVM(cap).spotlight.wheel, 'flag off: wheel as before');
  });
});

// ---- 4. overlays and inert
const fakeDoc = (open) => ({ querySelector: (q) => { assert.equal(q, OVERLAYS); return open.length ? {} : null; } });
test('inert: a closing overlay restores #app from what is still open, never from a saved value', () => {
  const app = { inert: true }, open = ['tu-ov'], old = globalThis.document; globalThis.document = fakeDoc(open);
  try {
    releaseInert(app); assert.equal(app.inert, true, 'another overlay still up: stay inert');
    open.length = 0; releaseInert(app); assert.equal(app.inert, false, 'nothing left: the app is live again');
    releaseInert(null);
  } finally { globalThis.document = old; }
});
test('inert: every overlay type uses it, none saves and restores a stale value, and the guard covers them all', () => {
  for (const f of readdirSync(new URL('../js/ui', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    const src = read('js/ui/' + f); assert.ok(!/app\.inert = wasInert/.test(src), f + ' restores a saved inert value');
  }
  for (const f of ['wheel-view', 'dial-view', 'tierup-card', 'workshop-view', 'nets-scene', 'sheet']) assert.match(read('js/ui/' + f + '.js'), /releaseInert\(app\)/, f);
  for (const c of ['wh-ov', 'tu-ov', 'wk-ov', 'ns-scene', 'sheet-fixed']) assert.ok(OVERLAYS.includes('.' + c), c);
  for (const f of ['dial-view', 'reel-view', 'wm-spins']) { const src = read('js/ui/' + f + '.js'); if (/inert/.test(src)) assert.match(src, /releaseInert/, f); }
  const app = read('js/ui/app.js');
  assert.match(app, /overlayOpen\(\)/, 'maybeTierUp waits for any overlay'); assert.match(app, /MutationObserver/, 'and tries again when it closes');
  assert.ok(!/querySelector\('\.wh-ov, \.tu-ov, \.wk-ov'\)/.test(app), 'the old narrow guard is gone');
});

// ---- 5. Booster / Hot Streak shown
test('result card data: Booster and Hot Streak come through the Spotlight and Course pending', () => {
  withFlag(true, () => {
    const s0 = untilTrain('f2d'), id = s0.clubs[0].squad[0].id;
    let s = C(withOwned(s0, { f_boost: 1, f_bigb: 1, sp_spot_r: 1 }, { tokSeason: 1 }), 'SetTrainPlan', { spotlightId: id });
    s = C(s, 'Spin', { careful: true });
    const r = s.training.pending.result;
    const setR = (x) => ({ ...s, training: { ...s.training, pending: { ...s.training.pending, result: { ...r, ...x } } } });
    const b = sel.trainingVM(setR({ boosted: true, jackpot: false })).spotlight.pending;
    assert.equal(b.boosted, true); assert.equal(b.boostBy, 2, 'Big Boost: value 2'); assert.equal(b.hot, false);
    const h = sel.trainingVM(setR({ boosted: false, jackpot: true, streak0: 1 })).spotlight.pending;
    assert.equal(h.hot, true); assert.equal(h.hotBy, 1); assert.equal(h.boosted, false);
    const plain = sel.trainingVM(setR({ boosted: false, jackpot: true, streak0: 0 })).spotlight.pending; assert.equal(plain.hot, false);
    const cid = sel.trainingVM(s).coaches[0].id, cp = { coachId: cid, careful: true, wheel: s.training.pending.wheel, result: { ...r, boosted: true, jackpot: false } };
    const row = sel.trainingVM({ ...s, training: { ...s.training, coursePending: cp } }).coaches.find((c) => c.id === cid);
    assert.equal(row.course.pending.boosted, true); assert.equal(row.course.pending.hot, false); assert.equal(row.course.pending.boostBy, 2);
  });
  const js = read('js/ui/wheel-view.js');
  assert.match(js, /Booster '/); assert.match(js, /Hot Streak '/); assert.match(js, /wh-chip' \+ \(p\.boosted \|\| p\.hot \? ' is-boost'/);
});

// ---- 6. the spun wheel goes to afterResult
test('commands pass the spun wheel to afterResult at Spin and CourseSpin', () => {
  const src = read('js/store/commands.js');
  assert.match(src, /afterResult\(n, 'spot', result, WM_RNG\([^)]*\), \{ wheel \}\)/); assert.match(src, /afterResult\(n, 'course', result, WM_RNG\([^)]*\), \{ wheel \}\)/);
});

// ---- 7. swap at season end and run end
const atEnd = (seed, n) => { const s = untilTrain(seed); return { ...s, stage: 'end', season: { ...s.season, n } }; };
test('season end: the swap offer is open with the power tree done and 2+ Spokes; once it is taken it closes; not offered on the last season', () => {
  withFlag(true, () => {
    const s = withOwned(atEnd('f2e', 3), allPower(), { spokes: 9 });
    const vm = sel.endVM(s);
    assert.deepEqual({ open: vm.swap.open, spokes: vm.swap.spokes, coins: vm.swap.coins }, { open: true, spokes: 8, coins: 4 });
    const after = C(s, 'SwapSpokes'); assert.equal(after.wheelMeta.spokes, 1); assert.equal(after.econ.coins, s.econ.coins + 4);
    assert.equal(sel.endVM(after).swap.open, false);
    assert.equal(sel.endVM(withOwned(atEnd('f2e', 3), {}, { spokes: 9 })).swap.open, false, 'power tree not done: Workshop rules');
    assert.equal(sel.endVM(withOwned(atEnd('f2e', 3), allPower(), { spokes: 1 })).swap.open, false, 'under 2 Spokes');
    assert.equal(sel.endVM(withOwned(atEnd('f2e', RUN.seasons), allPower(), { spokes: 9 })).swap.open, false, 'last season: it swaps by itself at run end');
    assert.equal(sel.workshopVM(s).swap.open, true, 'the Workshop still offers it any time');
  });
  withFlag(false, () => assert.equal(sel.endVM(withOwned(atEnd('f2e', 3), allPower(), { spokes: 9 })).swap.open, false));
  const card = swapCardHtml({ open: true, spokes: 8, coins: 4, rate: 2 }, '');
  assert.match(card, /data-swap-open/); assert.match(card, /Swap 8 Spokes for 4 Coins/); assert.equal(swapCardHtml({ open: false }, ''), '');
  assert.match(swapCardHtml({ open: false }, 'Swapped 8 Spokes for 4 Coins.'), /Swapped 8 Spokes for 4 Coins\./);
});
test('run end: leftover Spokes swap by themselves before the reset and the run-end screen says so (coins do not carry)', () => {
  withFlag(true, () => {
    const s = withOwned(atEnd('f2f', RUN.seasons), allPower(), { spokes: 7 });
    const r = C(s, 'RunEnd'); assert.equal(r.stage, 'runend');
    assert.deepEqual(r.run.spokeSwap, { spokes: 6, coins: 3 }); assert.equal(r.wheelMeta.spokes, 1); assert.equal(r.econ.coins, s.econ.coins + 3);
    const vm = sel.runEndVM(r); assert.deepEqual(vm.swapped, { spokes: 6, coins: 3 });
    const el = { innerHTML: '' }; renderRunEnd(el, vm, () => {});
    assert.match(el.innerHTML, /Spare Spokes swapped: \+3 Coins/); assert.match(el.innerHTML, /Coins do not carry/);
    const next = C(r, 'NewRun', {}); assert.equal(next.wheelMeta.spokes, 0); assert.equal(sel.runEndVM(r).swapped.coins, 3);
    const no = C(withOwned(atEnd('f2f', RUN.seasons), {}, { spokes: 7 }), 'RunEnd'); assert.equal(no.run.spokeSwap, undefined, 'power tree not done: nothing swaps'); assert.equal(sel.runEndVM(no).swapped, null);
    const el2 = { innerHTML: '' }; renderRunEnd(el2, sel.runEndVM(no), () => {}); assert.ok(!/Spare Spokes swapped/.test(el2.innerHTML));
  });
  withFlag(false, () => { const r = C(withOwned(atEnd('f2f', RUN.seasons), allPower(), { spokes: 7 }), 'RunEnd'); assert.equal(r.run.spokeSwap, undefined); });
});

// ---- 8. switch off then on mid-season
test('Wheel upgrades off then on mid-season: this season\'s tokens refill if they were not, and are not refilled twice', () => {
  withFlag(false, () => { // the real switch: main.js flips the flag AFTER the command, so it is still off while SetWheelFeatures runs
    const s0 = untilTrain('f2g'), n = s0.season.n;
    const off = C({ ...withOwned(s0, { f_respin: 2 }, { tokSeason: n - 1, tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 } }), wheelFeatures: false }, 'SetWheelFeatures', { on: false });
    const on = C(off, 'SetWheelFeatures', { on: true });
    assert.equal(on.wheelFeatures, true); assert.equal(on.wheelMeta.tokens.respin, 2); assert.equal(on.wheelMeta.tokSeason, n); assert.equal(FLAGS.wheelMeta, false, 'the flag is left as it was');
    const used = { ...on, wheelMeta: { ...on.wheelMeta, tokens: { ...on.wheelMeta.tokens, respin: 1 } } };
    const again = C({ ...used, wheelFeatures: false }, 'SetWheelFeatures', { on: true });
    assert.equal(again.wheelMeta.tokens.respin, 1, 'already refilled this season: a spent token stays spent');
  });
});
