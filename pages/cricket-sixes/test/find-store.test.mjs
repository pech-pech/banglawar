// Find store + spin handler (wheels-like-match SPEC s5, 11a, 11b, 13): rate ring, STOP written to wheels.stops.find, result kept across a reload,
// FIND offers no token and no Nudge, Second Cheer = one free aimed re-spin after a no-find (FindCheer), max 1 a season, no token; widening ceiling 13.0%.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { makeRng } from '../js/core/rng.js';
import { metaOf } from '../js/core/wheelmeta.js';
import { findWheel, findWheelResult, neutralMods, findReel } from '../js/core/dialreel.js';
import * as WS from '../js/store/wmstore.js';
import { findWheelOf, findSpinVM, cheerOffer } from '../js/store/wheels/find.js';
import { spinHandler, spinTypes } from '../js/store/spin-registry.js';
import { applyCommand as C } from '../js/store/commands.js';
import { newGame } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const MIX = { coins: 40, player: 30, coach: 30 };
const rich = (id, own = {}, tokens = {}) => { const s0 = newGame(id).get(); return { ...s0, econ: { ...s0.econ, coins: 5000 }, wheelMeta: { ...metaOf(s0), owned: own, tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0, ...tokens } } }; };
const stopAt = (i) => ({ t: 1.2 + i * 0.11, phi: i * 0.37, e: 0 });
const keyOf = (a) => Object.keys(a.wheels.stops.find)[0];

test('old import paths keep working; FindCheer and PickActivity are registered spins', () => {
  for (const n of ['findWheelOf', 'findReelOf', 'cheerLeft', 'findForce', 'afterFind', 'findTokens', 'useFindToken', 'findSpinVM']) assert.equal(typeof WS[n], 'function', n);
  assert.equal(typeof findReel, 'function');
  assert.ok(spinTypes().includes('FindCheer') && spinTypes().includes('PickActivity')); assert.equal(typeof spinHandler('FindCheer'), 'function');
});

test('store: the activity find rate picks the ring (8 / 18 / 26), the VM carries rows with FIND / CHEER labels', () => withFlags(ON, () => {
  const s = rich('fs-ring');
  const want = { street: 0.08, clinic: 0.18, signing: 0.18, tea: 0.18, sixhit: 0.18, banner: 0.26 };
  for (const [id, rate] of Object.entries(want)) { const w = findWheelOf(s, id); assert.equal(w.rate, rate, id); assert.ok(Math.abs(w.widths.reduce((a, b) => a + b, 0) - 10) < 1e-9); }
  const vm = findSpinVM(s, 'tea');
  assert.equal(vm.rows.length, 10); assert.equal(vm.rows.filter((r) => r.label === 'FIND').length, 2); assert.equal(vm.rows.filter((r) => r.label === 'CHEER').length, 8);
  assert.equal(vm.phys.J, 1.5);
}));

test('STOP is written on disk: wheels.stops.find[spinKey] + wheels.stats.find, and a reload shows the same slice', () => withFlags(ON, () => {
  let checked = 0;
  for (let i = 0; i < 12 && checked < 4; i++) {
    const s = rich('fs-stop' + i), a = C(s, 'PickActivity', { id: 'banner', stop: stopAt(i) });
    if (a.findSpin.pity) continue;
    checked++;
    const rec = a.wheels.stops.find[keyOf(a)]; assert.equal(rec.stops.length, 1);
    const st = rec.stops[0]; assert.equal(st.sliceId, a.findSpin.index); assert.equal(st.value, a.findSpin.find ? 1 : 0); assert.equal(st.respin, 0); assert.equal(st.auto, false);
    assert.ok(st.cycle >= 1 && Number.isFinite(st.tInCycle) && Number.isInteger(st.stopT));
    const stats = a.wheels.stats.find; assert.equal(stats.n, 1); assert.equal(stats.taps.length, 1); assert.equal(stats.careful, st.value);
    const b = JSON.parse(JSON.stringify(a)); // reload
    assert.equal(findSpinVM(b, 'banner').pending.index, a.findSpin.index); assert.deepEqual(b.findSpin, a.findSpin); assert.deepEqual(b.wheels.stops.find, a.wheels.stops.find);
    assert.deepEqual(C(s, 'PickActivity', { id: 'banner', stop: stopAt(i) }), a, 'seeded: the same STOP gives the same result');
  }
  assert.ok(checked >= 3, 'checked ' + checked);
}));

test('a FIND result offers no token; a no-find offers Spin Again / Pick Two but never Nudge', () => withFlags(ON, () => {
  let finds = 0, misses = 0;
  for (let i = 0; i < 60 && (finds < 3 || misses < 3); i++) {
    const s = rich('fs-tok' + i, {}, { respin: 1, nudge: 2, two: 1, wild: 0, lift: 2 }), a = C(s, 'PickActivity', { id: 'banner', stop: stopAt(i) }), kinds = findSpinVM(a, 'banner').tokens.map((t) => t.kind);
    if (a.findSpin.find) { finds++; assert.deepEqual(kinds, []); assert.equal(C(a, 'UseToken', { wheel: 'find', kind: 'respin' }), a); continue; }
    misses++; assert.ok(kinds.includes('respin') && kinds.includes('two')); assert.ok(!kinds.includes('nudge') && !kinds.includes('lift'));
    assert.equal(C(a, 'UseToken', { wheel: 'find', kind: 'nudge' }), a, 'Nudge refused');
    const b = C(a, 'UseToken', { wheel: 'find', kind: 'respin', careful: true });
    if (b !== a) { const rec = b.wheels.stops.find[keyOf(b)]; assert.equal(rec.stops.length, 2); assert.equal(rec.stops[1].respin, 1); assert.equal(rec.spent, true); assert.equal(rec.kept, rec.stops[1].value > rec.stops[0].value ? 1 : 0); }
  }
  assert.ok(finds >= 3 && misses >= 3, `finds ${finds} misses ${misses}`);
}));

test('Second Cheer: a free aimed re-spin after a no-find, max 1 a season, no token, never chains', () => withFlags(ON, () => {
  let done = 0, won = 0;
  for (let i = 0; i < 80 && done < 6; i++) {
    const s = rich('fs-cheer' + i, { sp_fnd_r: 1 }, { respin: 2 }), a = C(s, 'PickActivity', { id: 'banner', stop: stopAt(i) });
    if (a.findSpin.find) { assert.equal(cheerOffer(a), false, 'no cheer on a find'); assert.equal(C(a, 'FindCheer', { careful: true }), a); continue; }
    assert.equal(cheerOffer(a), true); assert.equal(findSpinVM(a, 'banner').pending.cheer, true);
    done++;
    const sn = (a.season && a.season.n) || 1, tokens = { ...metaOf(a).tokens };
    const b = C(a, 'FindCheer', { stop: { t: 3.5, phi: i * 0.9, e: 0 } });
    assert.notEqual(b, a); assert.equal(metaOf(b).cheerUsed[sn], 1, 'marked used'); assert.deepEqual(metaOf(b).tokens, tokens, 'no token spent');
    assert.equal(cheerOffer(b), false); assert.equal(C(b, 'FindCheer', { careful: true }), b, 'never chains');
    const rec = b.wheels.stops.find[keyOf(b)]; assert.equal(rec.stops.length, 2); assert.equal(rec.stops[1].respin, 1);
    assert.deepEqual(C(a, 'FindCheer', { stop: { t: 3.5, phi: i * 0.9, e: 0 } }), b, 'seeded');
    assert.equal(findSpinVM(b, 'banner').pending.cheerDone, true);
    if (b.findSpin.find) { won++; assert.ok(b.econ.act.hist[0].find, 'the find is paid'); assert.equal(b.econ.act.hist.filter((x) => x.idx === a.econ.act.hist[0].idx).length, 1, 'one activity record'); assert.equal(b.econ.fans, a.econ.fans, 'Fans paid once'); }
    else assert.equal(b.econ.coins, a.econ.coins);
    // used already this season: no offer on the next no-find
    const used = { ...s, wheelMeta: { ...s.wheelMeta, cheerUsed: { [sn]: 1 } } }, c = C(used, 'PickActivity', { id: 'banner', stop: stopAt(i) });
    assert.equal(cheerOffer(c), false); assert.equal(C(c, 'FindCheer', { careful: true }), c);
  }
  assert.ok(done >= 4 && won >= 1, `no-finds ${done}, cheer finds ${won}`);
  // not owned: never offered
  const s = rich('fs-nocheer'), a = C(s, 'PickActivity', { id: 'banner', stop: stopAt(1) }); assert.equal(cheerOffer(a), false); assert.equal(C(a, 'FindCheer', { careful: true }), a);
}));

test('widening (SPEC 11b): Widener + Sharp Eyes add to every block, one piece each, ceiling 13.0%, ring stays 10; Extra Gold = one more block', () => {
  const m = { ...neutralMods(), goldAdd: 0.06, rareAdd: 0.04 };
  for (const f of [8, 18, 26]) {
    const base = findWheel({ find: f, mix: MIX }), w = findWheel({ find: f, mix: MIX }, m);
    assert.equal(w.finds.length, base.finds.length, 'never re-splits'); assert.ok(Math.abs(w.widths.reduce((a, b) => a + b, 0) - 10) < 1e-9);
    base.finds.forEach((i) => assert.ok(Math.abs(w.cells[i].w - (base.cells[i].w + 0.1)) < 1e-9, f + ' +0.10 a block'));
    const cap = findWheel({ find: f, mix: MIX }, { ...neutralMods(), goldAdd: 2 }); assert.ok(Math.max(...cap.widths) <= 1.3 + 1e-9);
    const x = findWheel({ find: f, mix: MIX }, { ...m, extra: 1 }), ex = x.cells.filter((c) => c.second);
    assert.equal(ex.length, 1); assert.equal(x.finds.length, base.finds.length + 1); assert.ok(ex[0].w <= 1.3 + 1e-9);
    assert.ok(x.cells.every((c, i) => i === 0 || !(c.find && x.cells[i - 1].find)), 'no two FIND blocks touch');
  }
});

test('result is decided at STOP: same rng + same stop = same slice, type drawn only on a FIND, Steady scales J 1.5', () => {
  const w = findWheel({ find: 18, mix: MIX }), stop = { t: 3.5, phi: 4.1, e: 0.3 };
  const a = findWheelResult(makeRng('x'), w, stop), b = findWheelResult(makeRng('x'), w, stop); assert.deepEqual(a, b);
  assert.equal(a.type === null, !a.find);
  assert.equal(findWheel({ find: 18, mix: MIX }, neutralMods(), { jMult: 0.7225 }).phys.J, 1.5 * 0.7225);
});
