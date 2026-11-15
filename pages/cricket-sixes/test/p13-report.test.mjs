// P13 Agent B: call-hint read count in the report (log.hint, panelDone hook, MATCH line, JSON hint, flags). The Why sheet is gone: nothing counts it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLog, KEY } from '../js/report/log.js';
import { buildText, buildData } from '../js/report/report.js';
import { FLAG_DEFAULTS } from '../js/report/build.js';
import { FLAGS } from '../js/data/flags.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const B = 'sixes-p13', ENV = { build: B, now: Date.UTC(2026, 10, 15, 10, 0), vp: 'screen 344x780', errors: 0, flags: { ...FLAG_DEFAULTS }, rid: 1 };
const open = () => { const log = createLog({ storage: mem(), build: B }); log.matchStart({ seed: 's1', stage: 'bowl' }); const m = log.data().matches[0]; m.ov.push({ o: 1 }, { o: 2 }); return { log, m }; };
const closed = (ovs) => ({ id: 1, build: B, res: 'won', ab: 0, seed: 's', k: 'L', r: 1, us: 50, them: 40, m: { k: 'wk', n: 2 }, t0: 0, t1: 60000, gl: {}, sk: 0, feel: {}, ov: ovs });

test('log.hint writes ha/hd on the last over row of the open match', () => {
  const { log, m } = open();
  log.hint('P', 2340);
  assert.equal(m.ov[1].ha, 'P'); assert.equal(m.ov[1].hd, 2300); assert.equal(m.ov[0].ha, undefined);
});
test('log.hint: hidden hint is null/null; dwell capped at 60000 and rounded to 100', () => {
  const { log, m } = open();
  log.hint(null, 5000); assert.equal(m.ov[1].ha, null); assert.equal(m.ov[1].hd, null);
  log.hint('A', 999999); assert.equal(m.ov[1].hd, 60000);
  log.hint('R', 1549); assert.equal(m.ov[1].hd, 1500);
  log.hint('D', 0); assert.equal(m.ov[1].hd, 0);
});
test('log.hint with no open match or no over row does nothing and does not throw', () => {
  const log = createLog({ storage: mem(), build: B });
  assert.doesNotThrow(() => log.hint('A', 1000));
  log.matchStart({ seed: 'x', stage: 'bowl' }); assert.doesNotThrow(() => log.hint('A', 1000));
  assert.equal(log.data().errors.n, 0);
});
test('log.why is gone and match records carry no why counter', () => {
  const { log, m } = open();
  assert.equal(log.why, undefined); assert.equal('why' in m, false);
});
test('MATCH line and JSON: hint read r/s', () => {
  const ovs = [{ o: 1, hd: 1500 }, { o: 2, hd: 800 }, { o: 3, hd: null }, { o: 4, hd: 0 }, { o: 5, hd: 4000 }, { o: 6 }];
  const data = { ...{ matches: [closed(ovs)], builds: [B], nets: [], spins: [], weeks: [], buys: [], feelLog: [], club: [], seasons: [], sessions: [], errors: { n: 0, last: [] }, marker: null, rid: 0, seq: 1, eseq: 0 } };
  const txt = buildText(data, ENV);
  assert.match(txt, /Calls: hint read 2\/3 overs \(>=1\.5 s\)\./);
  assert.deepEqual(JSON.parse(buildData(data, ENV)).hint, [2, 3]);
});
test('old logs without hd print 0/0 and do not throw', () => {
  const data = { matches: [closed([{ o: 1 }, { o: 2 }])], builds: [B], nets: [], spins: [], weeks: [], buys: [], feelLog: [], club: [], seasons: [], sessions: [], errors: { n: 0, last: [] }, marker: null, rid: 0, seq: 1, eseq: 0 };
  assert.match(buildText(data, ENV), /Calls: hint read 0\/0 overs/);
  assert.deepEqual(JSON.parse(buildData(data, ENV)).hint, [0, 0]);
});
test('FLAG_DEFAULTS mirrors whyInline and callHint', () => {
  assert.equal(FLAG_DEFAULTS.whyInline, true); assert.equal(FLAG_DEFAULTS.callHint, true);
  assert.deepEqual(FLAG_DEFAULTS, FLAGS);
});

// hooks: a fake browser as in report-p0-log
function fakeDom() {
  const mk = () => ({ addEventListener() {}, querySelector: () => null });
  globalThis.window = { localStorage: mem(), innerWidth: 400, innerHeight: 800, devicePixelRatio: 2, addEventListener() {} };
  globalThis.document = { ...mk(), hidden: false, body: {} };
  globalThis.location = { search: '' };
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; globalThis.__mo = this; } observe() {} };
}
async function hooked() {
  fakeDom();
  const { createStore } = await import('../js/store/store.js');
  const { attachReport } = await import('../js/report/hooks.js?p13' + Math.random());
  const store = createStore(null); store.dispatch('NewGame', { seed: 'p13' });
  const rep = attachReport({ querySelector: () => null }, store);
  return rep;
}
const node = (cls, title) => ({ classList: { contains: (c) => c === cls }, querySelector: (q) => (q === '.c-sheet__title' ? { textContent: title } : null) });
const logOf = () => JSON.parse(globalThis.window.localStorage.getItem(KEY));

test('hooks: panelDone(info) calls log.hint; number/undefined tolerated; a sheet titled Why counts nothing', async () => {
  const rep = await hooked();
  rep.dispatched('StartMatch', {}, { stage: 'hub' }, { stage: 'bowl', seed: 'a', fixture: null, season: null });
  const mt = logOf().matches; assert.equal(mt.length, 1);
  assert.doesNotThrow(() => { rep.panelDone(5000); rep.panelDone(); rep.panelDone({ hint: true, alt: 'A', dwell: 1000 }); });
  globalThis.__mo.cb([{ addedNodes: [node('c-sheet', 'Why that happened')] }]);
  const m = logOf().matches[0]; assert.equal(m.gl && Object.keys(m.gl).length, 0); assert.equal('why' in m, false);
});
