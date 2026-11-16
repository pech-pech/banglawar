// wa1 slice B2 (wire): tokens + Control on the Hype dial, Toss / Pep reveals, Scout / Finals reels. Store write-back, caps through core, view helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { metaOf } from '../js/core/wheelmeta.js';
import { scoutList } from '../js/core/training.js';
import { tokenLine, tokenNote, goldNearX, cumOf } from '../js/ui/dial-view.js';
import { TOKVAL } from '../js/ui/wm-spins.js';
import { pepSlotsOf, wmTokens } from '../js/store/wmstore.js';
import { newGame, step } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const clone = (x) => JSON.parse(JSON.stringify(x));
const POOL = { respin: 2, nudge: 1, two: 1, wild: 1, lift: 1 };
const withPool = (s, pool = POOL) => ({ ...s, wheelMeta: { ...clone(metaOf(s)), tokens: { ...pool } } });
const open = (seed, pool) => { const s = newGame(seed).get(); return C(withPool({ ...s, econ: { ...s.econ, coins: 5000 } }, pool), 'OpenMatchday'); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/** First seed whose `cmd` result offers token `kind` on `wheel`. */
function seedWith(wheel, cmd, kind, pool, tries = 80) {
  for (let i = 0; i < tries; i++) { const s = C(open('wa1w-' + wheel + i, pool), cmd); if (s.fixture.md.wm[wheel] && wmTokens(s, wheel).some((t) => t.kind === kind)) return s; }
  return null;
}

test('view helpers: outcome line, uses-left note, Aim Zone reach', () => {
  const t = (p) => '+' + p.pts + '%', v = (p) => p.pts;
  assert.equal(tokenLine('respin', { index: 0, pts: 4 }, { index: 3, pts: 6 }, t, v), 'Spin Again: new +6%');
  assert.equal(tokenLine('respin', { index: 0, pts: 4 }, { index: 0, pts: 4 }, t, v), 'Spin Again: kept +4%');
  assert.equal(tokenLine('two', { index: 1, pts: 2 }, { index: 1, pts: 2 }, t, v), 'Pick Two: kept +2%');
  assert.equal(tokenLine('nudge', { index: 1, pts: 2 }, { index: 0, pts: 4 }, t, v), 'Nudge: moved to +4%');
  assert.equal(tokenLine('lift', { index: 1, pts: 2 }, { index: 1, pts: 3 }, t, v), 'Lucky Lift: bonus, now +3%');
  assert.equal(tokenLine('lift', { index: 1, pts: 2 }, { index: 1, pts: 2 }, t, v), 'Lucky Lift: no bonus, kept +2%');
  assert.equal(tokenNote([{ kind: 'respin', left: 1, match: true }], 'Hype'), 'Hype: 1 token use left this season. 1 token a match day.');
  assert.equal(tokenNote([{ kind: 'respin', left: 2 }], 'Scout'), 'Scout: 2 token uses left this season.');
  assert.equal(tokenNote([], 'Hype'), '');
  const cum = cumOf([3.5, 3.5, 1, 2]);
  assert.equal(goldNearX(7.5, 0, cum, [2]), false, 'no zone = never');
  assert.equal(goldNearX(7.5, 0.2 * 16, cum, [2]), true);
  assert.equal(goldNearX(1, 0.2 * 16, cum, [2]), false);
  assert.equal(goldNearX(6.9, 0.2 * 8.8, cum, [2]), true);
  assert.equal(TOKVAL.finals({ coins: 10, tp: 5, fans: 0, medal: 1 }), 75);
  assert.deepEqual(pepSlotsOf({ slots: [4], fx: { pep: 2 } }), [4, 5]);
  assert.deepEqual(pepSlotsOf({ slots: [6], fx: { pep: 2 } }), [6, 1]);
  assert.deepEqual(pepSlotsOf({ slots: [2, 3], fx: { pep: 2 } }), [2, 3]);
});

test('views: dial and reel take the wheel-view token props and replay a short spin; wm-spins passes them for all five wheels', () => {
  const dial = read('js/ui/dial-view.js'), reel = read('js/ui/reel-view.js'), sp = ['hype', 'toss', 'pep', 'scout', 'finals'].map((w) => read('js/ui/wheels/' + w + '.js')).join('\n');
  assert.match(dial, /data-tok/); assert.match(dial, /o\.getTokens \? o\.getTokens\(\)/); assert.match(dial, /o\.onToken\(t\.kind\)/);
  assert.match(dial, /cfg\.replay = replay/); assert.match(reel, /cfg\.replay = replay/);
  assert.match(dial, /reducedNow\(\) \|\| !cfg\.replay/, 'reduced motion: the line only, no replay');
  for (const w of ['hype', 'toss', 'pep', 'scout', 'finals']) assert.match(sp, new RegExp("tokProps\\(get, dispatch, '" + w + "'"));
});

test('flag off: UseToken on the new wheels is refused', () => withFlags({ wheelMeta: false, matchday: true, activities: true }, () => {
  const s = open('wa1w-off');
  for (const w of ['hype', 'toss', 'pep', 'scout', 'finals']) assert.equal(C(s, 'UseToken', { wheel: w, kind: 'respin' }), s, w);
  assert.deepEqual(sel.tokenVM(s, 'hype').options, []);
}));

test('Hype token: kept result written into md (level, perf, fan mult), pool and counters move, then 1-a-match-day stops Toss', () => withFlags(ON, () => {
  const s = seedWith('hype', 'HypeSpin', 'respin'); assert.ok(s, 'a Hype result under 5 with a token offer');
  const vm = sel.matchdayVM(s).wm.hype;
  assert.ok(vm.tokens.length > 0); assert.equal(vm.tokens[0].left, 2); assert.equal(vm.tokens[0].match, true);
  assert.deepEqual(sel.tokenVM(s, 'hype').options, vm.tokens);
  const a = C(s, 'UseToken', { wheel: 'hype', kind: 'respin' });
  assert.notEqual(a, s); assert.deepEqual(a, C(s, 'UseToken', { wheel: 'hype', kind: 'respin' }), 'seeded');
  const md = a.fixture.md, h = md.wm.hype;
  assert.equal(md.hype, h.level); assert.equal(md.hypePerf, h.src.perf); assert.equal(md.hypeIdx, h.src.levelIdx); assert.equal(md.hypeFanMult, h.src.fanMult);
  assert.ok(h.pts >= s.fixture.md.wm.hype.pts, 'never worse'); assert.deepEqual(h.used, ['respin']);
  assert.equal(metaOf(a).tokens.respin, POOL.respin - 1); assert.equal(metaOf(a).tokUsed.hype, 1); assert.equal(metaOf(a).matchTokUsed.n, 1);
  assert.equal(metaOf(a).tally, metaOf(s).tally, 'a token is not a spin');
  assert.deepEqual(sel.matchdayVM(a).wm.hype.tokens, [], 'match cap: no second token');
  const t = C(a, 'TossSpin');
  assert.deepEqual(sel.matchdayVM(t).wm.toss.tokens, [], 'match cap is shared with Toss');
  assert.equal(C(t, 'UseToken', { wheel: 'toss', kind: 'lift' }), t);
  assert.equal(sel.matchdayVM(clone(a)).wm.hype.pending.pts, h.pts, 'reload-safe');
  const go = C(a, 'MatchdayGo'); assert.notEqual(go.stage, 'matchday');
  assert.equal(C(go, 'UseToken', { wheel: 'hype', kind: 'lift' }), go, 'no token once the match starts');
}));

test('Toss lift: boost only, never above the cap; md.tossBoost follows', () => withFlags(ON, () => {
  const s = seedWith('toss', 'TossSpin', 'lift', { respin: 0, nudge: 0, two: 0, wild: 0, lift: 1 }); assert.ok(s);
  const a = C(s, 'UseToken', { wheel: 'toss', kind: 'lift' }), w0 = s.fixture.md.wm.toss, w1 = a.fixture.md.wm.toss;
  assert.equal(w1.index, w0.index, 'lift keeps the face'); assert.ok(w1.boostPct >= w0.boostPct && w1.boostPct <= 4);
  assert.equal(a.fixture.md.tossBoost, w1.boostPct / 100); assert.equal(w1.lifted, true);
  assert.equal(sel.matchdayVM(a).wm.toss.pending.lifted, true);
}));

test('Pep tokens: slots, pep ids and the shown pending always agree', () => withFlags(ON, () => {
  let seen = 0;
  for (let i = 0; i < 40 && seen < 4; i++) {
    const s = C(C(open('wa1w-pep' + i), 'HypeSpin', { careful: true }), 'PepSpin');
    for (const kind of ['nudge', 'respin', 'lift']) {
      if (!wmTokens(s, 'pep').some((t) => t.kind === kind)) continue;
      const a = C(s, 'UseToken', { wheel: 'pep', kind }), md = a.fixture.md; seen++;
      assert.deepEqual(md.pepSlots, md.wm.pep.slots); assert.equal(md.pepSlot, md.pepSlots[0]); assert.equal(md.wm.pep.index, md.pepSlot - 1);
      assert.deepEqual(md.pepIds, md.pepSlots.map((x) => a.clubs[0].six[x - 1]));
      assert.ok(md.pepSlots.length >= s.fixture.md.pepSlots.length, kind + ' never fewer players');
    }
  }
  assert.ok(seen > 0, 'some Pep token was offered');
}));

test('Scout token: updates the waiting reveal (list follows); Finals token pays only the difference', () => withFlags(ON, () => {
  let sc = null;
  for (let i = 0; i < 60 && !sc; i++) { const g = C(withPool(newGame('wa1w-sc' + i).get()), 'ScoutSpin'); if (wmTokens(g, 'scout').length) sc = g; }
  assert.ok(sc, 'a Scout token offer');
  const k = wmTokens(sc, 'scout')[0].kind, a = C(sc, 'UseToken', { wheel: 'scout', kind: k });
  assert.notEqual(a, sc); assert.ok(a.scoutSpin.steps + a.scoutSpin.extra >= 0); assert.equal(metaOf(a).tokUsed.scout, 1);
  assert.equal(scoutList(a).length, scoutList(sc).length - sc.scoutSpin.extra + a.scoutSpin.extra);
  assert.equal(sel.coachPickVM(a).spin.pending.steps, a.scoutSpin.steps);

  let fin = null;
  for (let i = 0; i < 6 && !fin; i++) {
    const st = newGame('wa1w-fin' + i); let g = 0;
    while (g++ < 6000 && step(st)) { const x = st.get(); if (x.stage === 'matchday') st.dispatch('MatchdayGo'); if (x.stage === 'done' && x.fixture && (x.fixture.kind === 'semi' || x.fixture.kind === 'final')) { fin = x; break; } }
  }
  assert.ok(fin, 'reached a finals result screen');
  let f = null;
  for (const pool of [POOL, { respin: 0, nudge: 0, two: 0, wild: 0, lift: 2 }]) { const x = C(withPool(fin, pool), 'FinalsSpin'); if (wmTokens(x, 'finals').length) { f = x; break; } }
  if (!f) return; // the prize landed on gold (Medal): no token, nothing more to check
  const k2 = wmTokens(f, 'finals')[0].kind, b = C(f, 'UseToken', { wheel: 'finals', kind: k2 }), r0 = f.finalsSpin, r1 = b.finalsSpin;
  assert.equal(b.econ.coins - f.econ.coins, r1.coins - r0.coins); assert.equal(b.econ.fans - f.econ.fans, r1.fans - r0.fans); assert.equal(b.training.tp - f.training.tp, r1.tp - r0.tp);
  const row = b.econ.ledger.filter((x) => x.k === 'finalsprize').pop(); assert.equal(row.coins, r1.coins);
  assert.ok(TOKVAL.finals(r1) >= TOKVAL.finals(r0));
}));
