// wa1 slice B2 (wire2): Scout / Finals reveal reels: tokens (separate token rng, Finals Lift never adds a Medal, Kind Floor skipped), result words, reel Control feel helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import { NODES } from '../js/data/wheelmeta.js';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { metaOf, effective, useToken, tokenOptions } from '../js/core/wheelmeta.js';
import { revealWheel, revealResult, modsFor } from '../js/core/dialreel.js';
import { makeRng } from '../js/core/rng.js';
import { goldNearLine, chimeEnters } from '../js/ui/reel-view.js';
import { cumOf } from '../js/ui/dial-view.js';
import { scoutWords, finalsWords } from '../js/ui/wm-spins.js';
import { wmTokens, scoutSpinVM } from '../js/store/wmstore.js';
import { newGame } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { wheelMeta: true, matchday: true, activities: true };
const clone = (x) => JSON.parse(JSON.stringify(x));
const POOL = { respin: 2, nudge: 1, two: 1, wild: 1, lift: 1 };
const withPool = (s, pool = POOL) => ({ ...s, wheelMeta: { ...clone(metaOf(s)), tokens: { ...pool } } });
const fullTree = (s) => { const n = clone(s); n.wheelMeta = { ...clone(metaOf(n)) }; n.wheelMeta.owned = { ...(n.wheelMeta.owned || {}) }; n.wheelCraft = { ...(n.wheelCraft || {}), owned: { ...((n.wheelCraft || {}).owned || {}) } };
  for (const nd of NODES) { if (nd.branch === 'craft') n.wheelCraft.owned[nd.id] = nd.max_rank; else n.wheelMeta.owned[nd.id] = nd.max_rank; } n.wheelMeta.tally = 600; return n; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('reel Control feel: Aim Zone near the line (wraps), Gold Chime on entering gold', () => {
  const cum = cumOf([1, 1, 0.5, 1]), C0 = 3.5, golds = [2]; // gold cell spans 2..2.5
  assert.equal(goldNearLine(2.2, 0, cum, C0, golds), true, 'on the gold cell');
  assert.equal(goldNearLine(1.8, 0.3, cum, C0, golds), true, 'coming up within reach');
  assert.equal(goldNearLine(2.7, 0.3, cum, C0, golds), true, 'just past, within reach');
  assert.equal(goldNearLine(0.5, 0.3, cum, C0, golds), false);
  assert.equal(goldNearLine(0.1, 0.3, cumOf([1, 1, 1, 0.5]), C0, [3]), true, 'wraps round the strip end');
  assert.equal(goldNearLine(1, 5, cum, C0, []), false, 'no gold, no glow');
  assert.equal(chimeEnters(1, 2, golds), true); assert.equal(chimeEnters(2, 2, golds), false); assert.equal(chimeEnters(3, 2, [2, 3]), false);
});

test('result words: Scout after a Lift shows the extra name and the step; Finals says what is paid', () => {
  assert.equal(scoutWords({ steps: 1, extra: 0 }).big, 'Top name +1 step');
  assert.equal(scoutWords({ steps: 2, extra: 0 }).short, '+2 steps');
  assert.equal(scoutWords({ steps: 0, extra: 1 }).big, 'One more name on the list');
  assert.equal(scoutWords({ steps: 1, extra: 1 }).big, 'One more name, top name +1 step');
  assert.equal(finalsWords({ label: '20 TP', coins: 0, tp: 20, fans: 0, medal: 0 }), '20 TP');
  assert.equal(finalsWords({ label: '20 TP', coins: 10, tp: 20, fans: 0, medal: 0 }), '10 Coins + 20 TP', 'a Lift adds Coins to a TP prize');
  assert.equal(finalsWords({ label: '+1 Medal', coins: 0, tp: 0, fans: 0, medal: 1 }), '+1 Medal');
  assert.match(read('js/ui/wheels/scout.js'), /tokText: \(p\) => scoutWords\(p\)\.short/); assert.match(read('js/ui/wheels/finals.js'), /tokText: finalsWords/);
  assert.match(read('js/ui/reel-view.js'), /chimeEnters\(a, b, golds\)/);
});

test('Scout token draws from the separate token stream (seed|wm|tok|scout|...)', () => withFlags(ON, () => {
  let sc = null;
  for (let i = 0; i < 60 && !sc; i++) { const g = C(withPool(newGame('wa1r-sc' + i).get()), 'ScoutSpin'); if (wmTokens(g, 'scout').some((t) => t.kind === 'respin')) sc = g; }
  assert.ok(sc, 'a Scout Spin Again offer');
  const a = C(sc, 'UseToken', { wheel: 'scout', kind: 'respin' });
  const want = useToken(sc, 'scout', 'respin', sc.scoutSpin.src, makeRng(`${sc.season.seed}|wm|tok|scout|${sc.scoutSpin.n}|respin|0`), undefined, {});
  assert.equal(a.scoutSpin.index, want.pending.index); assert.equal(a.scoutSpin.steps, +want.pending.fx.steps || 0);
  assert.deepEqual(a.scoutSpin.used, ['respin']); assert.equal(metaOf(a).tokUsed.scout, 1);
  assert.equal(scoutSpinVM(a).pending.index, a.scoutSpin.index, 'the reel reads the kept result');
  assert.equal(a.season.seed, sc.season.seed); assert.equal(a.salt, sc.salt, 'no other stream moved');
  // a second token on the same result uses n = 1
  if (wmTokens(a, 'scout').length) { const k = wmTokens(a, 'scout')[0].kind, b = C(a, 'UseToken', { wheel: 'scout', kind: k }); assert.equal(metaOf(b).tokUsed.scout, 2); assert.deepEqual(wmTokens(b, 'scout'), [], 'cap 2 a season'); }
}));

test('Scout / Finals: Kind Floor skipped (full tree), Toss keeps it', () => withFlags(ON, () => {
  const E = effective(fullTree(newGame('wa1r-fl').get()));
  assert.equal(modsFor(E, 'scout').floor, 0); assert.equal(modsFor(E, 'finals').floor, 0);
  assert.ok(modsFor(E, 'toss').floor > 0, 'toss still gets Kind Floor (sanity)');
  assert.equal(E.scout.feelOnly, true); assert.equal(E.finals.feelOnly, true);
}));

test('Finals tokens: Lift never adds a Medal or goes over 30 Coins; a Medal gets no token; re-spin keeps the better', () => withFlags(ON, () => {
  const s = withPool(fullTree(newGame('wa1r-fn').get()), { respin: 1, nudge: 1, two: 1, wild: 0, lift: 1 }), w = revealWheel('finals', modsFor(effective(s), 'finals'));
  const val = (p) => (p.fx.coins | 0) + (p.fx.tp | 0) + (p.fx.fans | 0) + 60 * (p.fx.medal | 0);
  let lifts = 0, medalsSeen = 0;
  for (let i = 0; i < 400; i++) {
    const r = { ...revealResult(makeRng('wa1r-f' + i), w), wheel: w }, opts = tokenOptions(s, 'finals', r).map((o) => o.kind);
    if (r.fx.medal) { medalsSeen++; assert.deepEqual(opts, [], 'no token on a Medal'); continue; }
    for (const k of opts) {
      const q = useToken(s, 'finals', k, r, makeRng('wa1r-t' + i + k), undefined, {}).pending;
      assert.ok(val(q) >= val(r), k + ' never worse');
      if (k === 'lift') { lifts++; assert.equal(q.fx.medal | 0, 0, 'Lift never adds a Medal'); assert.ok((q.fx.coins | 0) <= Math.max(30, r.fx.coins | 0)); assert.equal(q.index, r.index); }
    }
  }
  assert.ok(lifts > 50, 'Lift offered often: ' + lifts); assert.ok(medalsSeen > 0);
}));

test('flag off: no Scout token buttons, UseToken scout / finals is a no-op', () => withFlags({ ...ON, wheelMeta: false }, () => {
  const s = withPool(newGame('wa1r-off').get());
  assert.deepEqual(wmTokens(s, 'scout'), []); assert.equal(C(s, 'UseToken', { wheel: 'scout', kind: 'respin' }), s); assert.equal(C(s, 'UseToken', { wheel: 'finals', kind: 'lift' }), s);
  assert.deepEqual(sel.tokenVM(s, 'finals').options, []);
}));
