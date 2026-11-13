// Report v2 Phase 0, LOG part: P0-1 .. P0-9, P0-11, P0-12, P0-13 (log.js, hooks.js, app.js log.error call).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCommand as C } from '../js/store/commands.js';
import { createStore } from '../js/store/store.js';
import { createLog, KEY, CAPS, blank } from '../js/report/log.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };

// ---- a tiny fake browser so hooks.js can run under node
function fakeDom() {
  const listeners = {}, mk = () => ({ addEventListener() {}, removeEventListener() {}, querySelector: () => null });
  const doc = { ...mk(), hidden: false, body: {}, addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
  const win = { localStorage: mem(), innerWidth: 400, innerHeight: 800, devicePixelRatio: 2, addEventListener(t, f) { (listeners['w' + t] = listeners['w' + t] || []).push(f); } };
  globalThis.window = win; globalThis.document = doc; globalThis.location = { search: '' };
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; globalThis.__mo = this; } observe() {} };
  return { listeners, win };
}
async function hooked() {
  const dom = fakeDom();
  const { attachReport } = await import('../js/report/hooks.js?' + Math.random());
  const store = createStore(null); store.dispatch('NewGame', { seed: 'p0log' });
  const el = { querySelector: () => null };
  const rep = attachReport(el, store);
  const data = () => JSON.parse(dom.win.localStorage.getItem(KEY));
  const run = (cmd, p) => { const before = store.get(); store.dispatch(cmd, p); rep.dispatched(cmd, p, before, store.get()); };
  return { dom, rep, store, run, data, el };
}
const toBowl = (h) => { let g = 0; while (h.store.get().stage !== 'bowl' && g++ < 10) { const s = h.store.get(); if (s.stage === 'hub') h.run('StartMatch'); else if (s.stage === 'squad') h.run('SetSix', { ids: s.clubs[0].squad.slice(0, 6).map((p) => p.id) }); else if (s.stage === 'plan') { h.run('SetPlan', { overs: s.plan.overs, fields: s.plan.fields }); h.run('NewMatch'); } } };

test('P0-1: hub StartMatch (lands in bowl), BowlOver gives one record, one over; plain NewMatch still works', async () => {
  const h = await hooked(); toBowl(h);
  assert.equal(h.store.get().stage, 'bowl');
  h.run('BowlOver');
  const ms = h.data().matches; assert.equal(ms.length, 1); assert.equal(ms[0].ov.length, 1);
  // the hub's own StartMatch command (only moves hub -> plan; no record yet)
  const log = createLog({ storage: null });
  const b2 = C(null, 'NewMatch', { seed: 'n1' }); log.matchStart(b2); assert.equal(log.data().matches.length, 1);
});

test('P0-1: a StartMatch that lands in bowl starts a record (hooks)', async () => {
  const h = await hooked(); toBowl(h);
  // fabricate: after state on bowl from StartMatch with a different seed key
  const before = { ...h.store.get(), stage: 'hub' }, after = { ...h.store.get(), seed: 'other-seed', stage: 'bowl' };
  h.rep.dispatched('StartMatch', {}, before, after);
  assert.equal(h.data().matches.length, 2);
});

test('P0-2: resume on break and chase, not only bowl', async () => {
  for (const stage of ['bowl', 'break', 'chase']) {
    const dom = fakeDom(); const s = { ...C(null, 'NewMatch', { seed: 'r' }), stage };
    const { attachReport } = await import('../js/report/hooks.js?' + Math.random());
    attachReport({ querySelector: () => null }, { get: () => s, dispatch() {} });
    assert.equal(JSON.parse(dom.win.localStorage.getItem(KEY)).matches.length, 1, stage);
  }
});

test('P0-5: gloss counts into the open match else the session bucket; never a finished record; 1 s dedupe', () => {
  let t = 1000; const log = createLog({ storage: null, now: () => t, build: 'b' });
  log.gloss('burst'); assert.equal(log.data().sessions.at(-1).gl.burst, 1); // no match yet
  log.matchStart({ seed: 's', stage: 'bowl' }); t = 3000; log.gloss('burst'); assert.equal(log.data().matches[0].gl.burst, 1);
  t = 3500; log.gloss('burst'); assert.equal(log.data().matches[0].gl.burst, 1, 'dedupe within 1 s');
  t = 4600; log.gloss('burst'); assert.equal(log.data().matches[0].gl.burst, 2);
  log.data().matches[0].res = 'won'; t = 9000; log.gloss('line');
  assert.equal(log.data().matches[0].gl.line, undefined); assert.equal(log.data().sessions.at(-1).gl.line, 1);
});

test('P0-5: hooks count a glossary sheet only after a real tap', async () => {
  const h = await hooked(); toBowl(h);
  const node = (cls) => ({ classList: { contains: (c) => c === cls }, querySelector: () => null });
  globalThis.__mo.cb([{ addedNodes: [node('gloss-root')] }]); // no tap: not counted
  assert.deepEqual(h.data().matches[0].gl, {});
  h.dom.listeners.click[0]({ target: { closest: () => ({ getAttribute: () => 'burst' }) } });
  globalThis.__mo.cb([{ addedNodes: [node('gloss-root')] }]);
  assert.equal(h.data().matches[0].gl.burst, 1);
});

test('P0-6: record has k, r, season, league; FinishMatch stores pay and coins/fans before and after', async () => {
  const h = await hooked(); toBowl(h);
  const m0 = h.data().matches[0]; assert.equal(m0.k, 'L'); assert.equal(m0.r, 1); assert.equal(m0.season, 1); assert.equal(m0.league, 1);
  let g = 0; while (h.store.get().stage !== 'done' && g++ < 80) { const s = h.store.get(); if (s.stage === 'break') h.run('StartChase'); else h.run('BowlOver', s.stage === 'chase' ? { intent: 'R' } : undefined); }
  assert.equal(h.store.get().stage, 'done');
  const coins = h.store.get().econ.coins, fans = h.store.get().econ.fans;
  h.run('FinishMatch');
  const m = h.data().matches[0]; assert.deepEqual(Object.keys(m.pay).sort(), ['base', 'stars', 'total', 'win']);
  assert.equal(m.pay.total, h.store.get().pay.total);
  assert.equal(m.coins0, coins); assert.equal(m.fans0, fans); assert.equal(m.coins1, h.store.get().econ.coins); assert.equal(m.fans1, h.store.get().econ.fans);
});

test('P0-7: stage changes only touch the open match', () => {
  const log = createLog({ storage: null, build: 'b' });
  log.matchStart({ seed: 's', stage: 'bowl' }); log.data().matches[0].res = 'won'; log.data().matches[0].stage = 'done';
  log.stage('hub'); log.stage('train'); assert.equal(log.data().matches[0].stage, 'done'); assert.equal(log.data().sessions.at(-1).end, 'train');
});

test('P0-8: caps are applied (matches 24, sessions 8 even with custom caps)', () => {
  assert.deepEqual([CAPS.matches, CAPS.nets, CAPS.spins, CAPS.buys, CAPS.feel, CAPS.sessions], [24, 24, 60, 40, 40, 8]);
  const log = createLog({ storage: null, build: 'b', caps: { matches: 3 } });
  for (let i = 0; i < 6; i++) log.matchStart({ seed: 's' + i, stage: 'bowl' }); assert.equal(log.data().matches.length, 3);
  const st = mem(); for (let i = 0; i < 12; i++) createLog({ storage: st, build: 'b', caps: { sessions: 3 } }).matchStart({ seed: 'z', stage: 'bowl' });
  assert.equal(JSON.parse(st.getItem(KEY)).sessions.length, 3);
});

test('P0-9: storage full trims in order, sets trimmed, keeps marker and last text, still writes', () => {
  const st = mem(); let limit = Infinity; const real = st.setItem; st.setItem = (k, v) => { if (v.length > limit) throw new Error('quota'); real(k, v); };
  const log = createLog({ storage: st, build: 'b' });
  for (let i = 0; i < 6; i++) { log.matchStart({ seed: 's' + i, stage: 'bowl' }); log.data().matches.at(-1).ov = Array.from({ length: 12 }, (_, o) => ({ o, str: 'x'.repeat(200) })); }
  const d = log.data(); d.marker = { id: 5 }; d.last = 'text'; d.nets = Array.from({ length: 24 }, () => ({ a: 'y'.repeat(50) }));
  limit = JSON.stringify(d).length - 3000; log.why();
  const saved = JSON.parse(st.getItem(KEY)); assert.equal(saved.trimmed, 1); assert.equal(log.data().trimmed, 1);
  assert.equal(saved.matches.length, 6, 'matches kept: older overs went first');
  assert.equal(saved.matches[0].ov.length, 0); assert.equal(saved.matches[5].ov.length, 12);
  assert.deepEqual(saved.marker, { id: 5 }); assert.equal(saved.last, 'text');
});

test('P0-12: app.js render catch reports the error to the log', () => {
  const src = readFileSync(new URL('../js/ui/app.js', import.meta.url), 'utf8');
  assert.match(src, /catch \(err\) \{[^}]*rep\.error\(err\)/s);
  const hooks = readFileSync(new URL('../js/report/hooks.js', import.meta.url), 'utf8'); assert.match(hooks, /error\(/);
});

test('P0-11: gear stages and selector', () => {
  const src = readFileSync(new URL('../js/report/hooks.js', import.meta.url), 'utf8');
  for (const s of ['hub', 'semi', 'final', 'break', 'done', 'train', 'week', 'end', 'runend', 'squad', 'plan']) assert.match(src, new RegExp('\\b' + s + ': 1'), s);
  assert.ok(!/GEAR_STAGES[^;]*\b(bowl|chase): 1/.test(src)); assert.match(src, /querySelector\('\.strip'\) \|\| el\.querySelector\('\.c-strip'\)/);
});

test('P0-13: no events trail, no first-session stat, no retry timer, no BALL_MS copy; old logs still load', async () => {
  const log = createLog({ storage: null, now: () => 5000, build: 'b' }); log.matchStart({ seed: 's', stage: 'bowl' });
  assert.equal(log.data().events, undefined); assert.equal(log.data().sessions.at(-1).first, undefined); assert.equal(log.data().matches[0].rt, undefined);
  assert.equal(log.event, undefined); assert.equal(log.retry, undefined);
  const hooks = readFileSync(new URL('../js/report/hooks.js', import.meta.url), 'utf8'); assert.ok(!/BALL_MS|retry\(/.test(hooks));
  const st = mem(); st.setItem(KEY, JSON.stringify({ ...blank(), events: [[1, 'x', 0]], v: 1 }));
  assert.equal(createLog({ storage: st }).data().events, undefined);
});

test('P0-3 support: d.trimmed absent on a fresh log', () => { assert.equal(createLog({ storage: null }).data().trimmed, undefined); });
