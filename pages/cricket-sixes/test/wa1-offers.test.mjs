// wa1 fixreel: how often a Toss / Pep token is offered with the FULL tree (all power + Craft nodes at max, a full token pool), through the real store commands.
// QA (QA-VISUAL.md, "Not captured") saw Toss always "Won +5%" and Pep always Gold over 8 harness tries. This checks the game over 600 seeds:
// Toss must be lost (Good sport, boost < TOKEN_BELOW 5) about a third of the time or more even with Coin Weight, and Pep must land below 2 players often.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { NODES, WM } from '../js/data/wheelmeta.js';
import { applyCommand as C } from '../js/store/commands.js';
import { metaOf } from '../js/core/wheelmeta.js';
import { wmTokens, finalsSpinVM } from '../js/store/wmstore.js';
import { newGame } from './_season-bot.mjs';

const ON = { wheelMeta: true, matchday: true, activities: true };
const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const clone = (x) => JSON.parse(JSON.stringify(x));
const POOL = { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 };
/** A long-time player's save: every node at max rank, a full token pool, 6000 Coins (the QA harness save). */
function fullSave(seed) {
  const s = newGame(seed).get(), wm = clone(metaOf(s)), craft = clone(s.wheelCraft || { owned: {} }); craft.owned = { ...(craft.owned || {}) }; wm.owned = { ...(wm.owned || {}) };
  for (const n of NODES) { if (n.branch === 'craft') craft.owned[n.id] = n.max_rank; else wm.owned[n.id] = n.max_rank; }
  wm.tokens = { ...POOL }; wm.tally = 600;
  return { ...s, wheelMeta: wm, wheelCraft: craft, econ: { ...s.econ, coins: 6000 } };
}
const N = 600;
function rates() {
  let toss = 0, tossLost = 0, pep = 0, pepLow = 0, tossN = 0, pepN = 0; const keys = new Set();
  for (let i = 0; i < N; i++) {
    const s = C(fullSave('wa1o-' + i), 'OpenMatchday'); if (!s.fixture || !s.fixture.md) continue;
    const t = C(s, 'TossSpin'), wt = t.fixture.md.wm.toss; if (wt) { tossN++; keys.add(wt.id + ':' + wt.boostPct); if (wt.boostPct < WM.TOKEN_BELOW.toss) tossLost++; if (wmTokens(t, 'toss').length) toss++; }
    const p = C(s, 'PepSpin'), wp = p.fixture.md.wm.pep; if (wp) { pepN++; if (wp.slots.length < WM.TOKEN_BELOW.pep) pepLow++; if (wmTokens(p, 'pep').length) pep++; }
  }
  return { tossN, pepN, toss: toss / tossN, tossLost: tossLost / tossN, pep: pep / pepN, pepLow: pepLow / pepN, keys: [...keys] };
}

test('full tree: Toss and Pep token offers show often over 600 seeds (QA saw none in 8 tries)', () => withFlags(ON, () => {
  const r = rates();
  console.log('offers full tree', JSON.stringify({ ...r, toss: +r.toss.toFixed(3), tossLost: +r.tossLost.toFixed(3), pep: +r.pep.toFixed(3), pepLow: +r.pepLow.toFixed(3) }));
  assert.ok(r.tossN >= N * 0.95 && r.pepN >= N * 0.95, 'spins ' + r.tossN + '/' + r.pepN);
  assert.ok(r.tossLost >= 0.33 && r.tossLost <= 0.55, 'toss lost ' + r.tossLost); // Coin Weight 1.3 vs 1.0 a slice: lost = 3 / 6.9 = 43%
  assert.ok(r.toss >= 0.3, 'toss offer ' + r.toss);
  assert.ok(r.pepLow >= 0.3, 'pep below 2 ' + r.pepLow);
  assert.ok(r.pep >= 0.3, 'pep offer ' + r.pep);
}));

test('Finals (QA V7): Prize Pair line explains 20 -> 30 Fans; Lucky Lift line is plain; the due card sits under the hero', async () => {
  const { finalsPairLine, finalsTokLine, finalsWords } = await import('../js/ui/wm-spins.js');
  const p = { index: 2, label: '20 Fans', coins: 0, tp: 0, fans: 30, medal: 0, pair: true, base: { coins: 0, tp: 0, fans: 20 } };
  assert.equal(finalsPairLine(p), 'Prize Pair: 20 Fans x1.5 = 30');
  assert.equal(finalsPairLine({ ...p, pair: false }), '');
  assert.equal(finalsTokLine('lift', p, { ...p, coins: 10 }), 'Lucky Lift: +10 Coins');
  assert.equal(finalsTokLine('lift', p, p), 'Lucky Lift: no bonus');
  assert.equal(finalsTokLine('respin', p, p), null);
  assert.equal(finalsWords({ ...p, coins: 10 }), '10 Coins + 30 Fans');
  const fs = await import('node:fs'), src = fs.readFileSync(new URL('../js/ui/result-view.js', import.meta.url), 'utf8');
  assert.ok(src.indexOf("vm.finals.due ? finalsCard") < src.indexOf('payCard(vm.pay)'), 'due Finals card before the pay card');
});

test('Finals VM: pending carries base / pair / lift from the real store (full tree has Prize Pair)', () => withFlags(ON, () => {
  let seen = 0;
  for (let i = 0; i < 40 && seen < 5; i++) {
    const s = fullSave('wa1fin-' + i); const fin = { ...s, stage: 'done', fixture: { ...(s.fixture || {}), kind: 'semi', round: 1 } };
    const x = C(fin, 'FinalsSpin'); if (!x.finalsSpin || x.finalsSpin.medal) continue;
    const vm = finalsSpinVM(x); const q = vm.pending; seen++;
    assert.equal(q.pair, true); for (const k of ['coins', 'tp', 'fans']) assert.equal(q[k] - (k === 'coins' ? q.lift : 0), q.base[k] ? Math.floor(q.base[k] * 1.5 + 0.5) : 0, k + ' ' + JSON.stringify(q));
  }
  assert.ok(seen > 0);
}));
