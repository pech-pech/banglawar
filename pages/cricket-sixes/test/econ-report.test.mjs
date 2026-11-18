// Econ report lines are true: week-start Push affordable / pool over 100, coach used = any job, real node count and node TP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLog } from '../js/report/log.js';
import { pushAffordable } from '../js/report/metrics.js';
import { reportParts } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';
import { createStore } from '../js/store/store.js';
import { step } from './_season-bot.mjs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
function driven(seed) {
  const log = createLog({ storage: mem(), now: (() => { let t = 1000; return () => (t += 10); })(), build: 'e1' });
  const store = createStore(null); store.dispatch('NewGame', { seed });
  const run = (cmd, p) => { const before = store.get(); store.dispatch(cmd, p); const after = store.get(); if (cmd === 'NewMatch' || (cmd === 'StartMatch' && after.stage === 'bowl')) log.matchStart(after); else if (cmd === 'FinishMatch') log.finish(before, after); else if (cmd === 'BowlOver' && after !== before) log.over(before, after, { th: 900 }); if (cmd === 'MakeCall') log.touch(before, after); if (cmd !== 'BowlOver') log.command(cmd, p, before, after); };
  return { log, store, run, proxy: { get: store.get, dispatch: run } };
}
const toTrain = (h) => { let g = 0; while (h.store.get().stage !== 'train' && g++ < 4000 && step(h.proxy)); return h.store.get(); };

test('weeks row: nodes and nodeTp are the real buys, tp0 is the week-start pool', () => {
  for (const seed of ['er1', 'er2', 'er3']) {
    const h = driven(seed), s0 = toTrain(h);
    assert.equal(s0.stage, 'train');
    const start = s0.training.tp, affStart = pushAffordable(s0) ? 1 : 0;
    let bought = 0, spent = 0;
    for (const p of s0.clubs.find((c) => c.id === 'c0').squad) for (const side of ['bat', 'bowl']) {
      const b = h.store.get(), tp = b.training.tp; h.run('UnlockNode', { playerId: p.id, side, node: 1 });
      const d = tp - h.store.get().training.tp; if (d > 0) { bought++; spent += d; }
    }
    if (h.store.get().training.netsWeek !== h.store.get().training.week) h.run('RunNets');
    const preEnd = h.store.get(), week = preEnd.training.week;
    h.run('EndWeek');
    const w = h.log.data().weeks.filter((x) => x.wk === week).pop();
    assert.ok(w, 'week row ' + seed);
    assert.equal(w.nodes, bought, 'node count ' + seed);
    assert.equal(w.nodeTp, spent, 'node tp ' + seed);
    assert.equal(w.tpEnd, preEnd.training.tp);
    assert.equal(w.tp0, start, 'tp0 = pool at week start, before nodes and nets ' + seed);
    assert.equal(w.aff, affStart, 'aff measured at week start ' + seed);
  }
});

test('week with no node buys reports 0 nodes and 0 TP', () => {
  const h = driven('er4'), s0 = toTrain(h), start = s0.training.tp;
  h.run('RunNets'); const week = h.store.get().training.week; h.run('EndWeek');
  const w = h.log.data().weeks.filter((x) => x.wk === week).pop();
  assert.equal(w.nodes, 0); assert.equal(w.nodeTp, 0); assert.equal(w.tp0, start);
});

const ENV = { build: 'e1', now: Date.UTC(2026, 10, 17, 12, 0), vp: 'screen 475x638', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 1, save: {} };
const trainLines = (weeks, nets) => reportParts({ matches: [], seasons: [] }, { ...ENV, win: { matches: [], nets, spins: [], weeks, buys: [], club: [], feel: [] } }).secs.find((x) => x.key === 'T').h.join('\n');

test('training line: week-start pool over 100, affordable, nodes and TP as logged; coach used counts any job', () => {
  const W = [
    { s: 1, wk: 1, tp0: 130, tpEnd: 20, aff: 1, nodes: 3, nodeTp: 90, cj: [0, 0, 1, 0] },
    { s: 1, wk: 2, tp0: 90, tpEnd: 180, aff: 0, nodes: 0, nodeTp: 0, cj: [0, 0, 0, 0] },
    { s: 1, wk: 3, tp0: 101, tpEnd: 5, aff: 1, nodes: 1, nodeTp: 25, cj: [0, 0, 0, 1] }];
  const l = trainLines(W, []);
  assert.ok(l.includes('Nodes bought 4 (115 TP)'), l);
  assert.ok(l.includes('Push affordable 2 of 3 weeks'), l);
  assert.ok(l.includes('Pool over 100: 2 of 3'), l); // tpEnd 180 must not count
  assert.ok(l.includes('Coach used 2'), l); // study + scout jobs, no nets coach
});
