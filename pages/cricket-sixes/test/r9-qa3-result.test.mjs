// r9 QA3 M1: the result screen's Match day money preview equals what FinishMatch then writes to the economy ledger; the card has icons + signed words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { createStore } from '../js/store/store.js';
import * as sel from '../js/store/selectors.js';
import { moneyCard, payCard } from '../js/ui/result-view.js';
import { step } from './_season-bot.mjs';

const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const ON = { matchday: true, settled: true, roar: true, activities: true, freePick: true };
function toDone(seed) {
  const store = createStore(null); store.dispatch('NewGame', { seed });
  const proxy = { get: store.get, dispatch: (c, p) => store.dispatch(c, p) };
  for (let g = 0; g < 3000 && store.get().stage !== 'done'; g++) {
    const s = store.get();
    if (s.stage === 'freepick') store.dispatch('TakeFreePick', { what: 'gym' });
    else if (s.stage === 'plan') { store.dispatch('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); store.dispatch('StartMatch'); if (store.get().stage === 'plan') store.dispatch('NewMatch'); }
    else if (s.stage === 'matchday') store.dispatch('MatchdayGo');
    else if (!step(proxy)) break;
  }
  return store;
}

test('QA3 M1: money preview on the result screen = the ledger row FinishMatch writes (several seeds, features on)', () => withFlags(ON, () => {
  for (const seed of ['q3r', 'q3m', 'q3s1', 'mm4']) {
    const store = toDone(seed); assert.equal(store.get().stage, 'done', seed);
    const before = store.get(), vm = sel.resultVM(before), m = vm.money;
    assert.ok(m, seed + ': money card data with the features on');
    store.dispatch('FinishMatch');
    const after = store.get(), row = after.econ.ledger.filter((r) => r.k === 'match').slice(-1)[0];
    assert.deepEqual([m.gate, m.wages, m.fans, m.net, m.winBonus, m.shop, m.upkeep], [row.gate, row.wages, row.fans, row.net, row.winBonus, row.shop, row.upkeep], seed);
    assert.equal(after.econ.fans - before.econ.fans, m.fans, seed);
    if (!row.arrears) assert.equal(after.econ.coins, m.coinsAfter, seed);
    assert.ok(m.crowd && /crowd/i.test(m.crowd.word), seed + ': crowd word from match day');
  }
}));

test('QA3 M1: no money card with the features off', () => withFlags({ matchday: false, activities: false }, () => {
  const store = toDone('q3r'); assert.equal(sel.resultVM(store.get()).money, null); assert.equal(moneyCard(null), '');
}));

test('QA3 M1: money card shows icons plus signed words, never colour alone', () => {
  const h = moneyCard({ crowd: { level: 'high', word: 'Big crowd' }, fans: 32, gate: 120, wages: 58, winBonus: 70, shop: 0, upkeep: 1, net: 131, coinsAfter: 900, short: 0 });
  const t = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(t, /Match day money/); assert.match(t, /Big crowd/);
  assert.match(t, /\+32 Fans new/); assert.match(t, /\+120 Gate in/); assert.match(t, /-58 Wages out/); assert.match(t, /Net \+131 Coins \(win \+70, upkeep -1\)/);
  assert.match(h, /aria-label="Wages -58 Coins out"/);
  const short = moneyCard({ crowd: null, fans: 5, gate: 40, wages: 90, winBonus: 0, shop: 0, upkeep: 2, net: -52, coinsAfter: 0, short: 30 });
  assert.match(short, /Wages short by 30 Coins/); assert.match(short.replace(/<[^>]+>/g, ' '), /Net -52 Coins/); assert.doesNotMatch(short, /rm-crowd/);
});

test('QA3 m6: every Stars line carries its count; the counts add up to starsRaw; a cap line when more were earned than pay', () => {
  for (const seed of ['q3r', 'q3m', 'mm4']) {
    const store = toDone(seed), pay = sel.resultVM(store.get()).pay;
    assert.ok(pay.starList.every((w) => Number.isInteger(w.n) && w.n >= 1), seed);
    assert.equal(pay.starList.reduce((a, w) => a + w.n, 0), pay.starsRaw, seed);
  }
  const pay = { kind: 'league', base: 45, win: 0, stars: 8, starsRaw: 9, starsTp: 32, total: 77, starList: [{ name: 'Ferrara', why: '66 runs', n: 2 }, { name: 'Ravi', why: '3 wickets', n: 1 }] };
  const h = payCard(pay), t = h.replace(/<[^>]+>/g, '');
  assert.match(h, /<span class="pay-n" aria-hidden="true">★★<\/span> <b>Ferrara<\/b>: 66 runs<span class="ss-sr"> \(2 Stars\)<\/span>/);
  assert.match(h, /aria-hidden="true">★<\/span> <b>Ravi<\/b>: 3 wickets<span class="ss-sr"> \(1 Star\)/);
  assert.match(t, /9 Stars earned: 8 is the most that pay\./);
  assert.doesNotMatch(payCard({ ...pay, stars: 3, starsRaw: 3 }), /most that pay/);
});
