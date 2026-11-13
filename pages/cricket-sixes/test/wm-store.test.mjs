// Wheel meta, store side (Agent B): save v6 -> v7, commands, selectors, new-run carry, flag off = r9.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import { FLAGS } from '../js/data/flags.js';
import { VERSION, wrap, unwrap, migrate, emptyWheelMeta } from '../js/core/save-migrate.js';
import { createSave } from '../js/platform/save.js';
import { wheelSlices, courseWheel, coachStepInUse } from '../js/core/training.js';
import { carryOf, applyCarry } from '../js/core/run.js';
import { WM, NODES } from '../js/data/wheelmeta.js';
import { metaOf, rankOf, tierNow, recordSpin } from '../js/core/wheelmeta.js';
import { newGame, step } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const withFlag = (on, fn) => { const old = FLAGS.wheelMeta; FLAGS.wheelMeta = on; try { return fn(); } finally { FLAGS.wheelMeta = old; } };
const untilTrain = (seed) => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'train' && g++ < 3000 && step(st)); return st.get(); };
const withSinks = (s, sinks) => ({ ...s, econ: { ...s.econ, medals: 20, coins: 100000, sinks: { ...s.econ.sinks, ...sinks } } });
const spotReady = (seed) => { const s0 = untilTrain(seed); return C(s0, 'SetTrainPlan', { spotlightId: s0.clubs[0].squad[0].id }); };
const setMeta = (s, patch) => ({ ...s, wheelMeta: { ...emptyWheelMeta(), ...(s.wheelMeta || {}), ...patch } });
const firstBuyable = () => NODES.find((n) => n.tier <= 1 && n.branch !== 'craft' && !(n.requires || []).length);

test('save: VERSION 7; a new game carries empty wheelMeta and wheelCraft', () => {
  assert.equal(VERSION, 7);
  const g = C(null, 'NewGame', { seed: 'wm1' });
  assert.deepEqual(g.wheelMeta, emptyWheelMeta()); assert.deepEqual(g.wheelCraft, { owned: {} });
  assert.deepEqual(emptyWheelMeta().tokens, { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 });
});

test('save: v6 -> v7 adds both empty blocks, keeps everything else, is idempotent', () => {
  const g = C(null, 'NewGame', { seed: 'wm2' }); const v6 = clone(g); delete v6.wheelMeta; delete v6.wheelCraft; v6.v = 6;
  const r = migrate(v6, 6); assert.equal(r.ok, true); assert.equal(r.state.v, 7);
  assert.deepEqual(r.state.wheelMeta, emptyWheelMeta()); assert.deepEqual(r.state.wheelCraft, { owned: {} });
  const { wheelMeta, wheelCraft, v, ...rest } = r.state; const { wheelMeta: a, wheelCraft: b, v: c, ...rest0 } = g; assert.deepEqual(rest, rest0);
  assert.deepEqual(migrate(r.state, 6).state, r.state, 'blocks already there are kept');
  const kept = clone(v6); kept.wheelMeta = { ...emptyWheelMeta(), spokes: 9 }; assert.equal(migrate(kept, 6).state.wheelMeta.spokes, 9);
  const env = unwrap(JSON.stringify({ v: 6, sum: wrap(v6).sum, data: v6 })); assert.equal(env.ok, true); assert.equal(env.state.v, 7);
});

test('save: wheelMeta and wheelCraft round trip through the save envelope and storage', () => {
  let s = setMeta(C(null, 'NewGame', { seed: 'wm3' }), { tally: 12, spokes: 33, owned: { a: 1 } }); s = { ...s, wheelCraft: { owned: { k_rim: 2 } }, wheelFeatures: false };
  const r = unwrap(JSON.stringify(wrap(s))); assert.equal(r.ok, true); assert.deepEqual(r.state, s);
  const mem = {}, st = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } };
  const sv = createSave(st); assert.equal(sv.save(s), true); assert.deepEqual(sv.load().state, s);
});

test('new run: wheelMeta resets, wheelCraft carries, wheelFeatures choice stays', () => {
  const g = C(null, 'NewGame', { seed: 'wm4' });
  const s = { ...setMeta(g, { tally: 80, spokes: 40, spent: 300, owned: { x: 2 } }), wheelCraft: { owned: { k_rim: 3, k_hub: 1 } } };
  const co = carryOf(s); assert.deepEqual(co.wheelCraft, { owned: { k_rim: 3, k_hub: 1 } });
  const n = applyCarry(C(null, 'NewGame', { seed: 'wm4b' }), co);
  assert.deepEqual(n.wheelCraft, { owned: { k_rim: 3, k_hub: 1 } }); assert.deepEqual(n.wheelMeta, emptyWheelMeta());
  assert.notEqual(n.wheelCraft, co.wheelCraft, 'a copy, not the same object');
  const old = { ...g, stage: 'runend', run: { ...g.run, ended: true }, wheelMeta: s.wheelMeta, wheelCraft: s.wheelCraft, wheelFeatures: false };
  const m = C(old, 'NewRun', {}); assert.equal(m.run.no, 2); assert.deepEqual(m.wheelMeta, emptyWheelMeta()); assert.deepEqual(m.wheelCraft, s.wheelCraft); assert.equal(m.wheelFeatures, false);
  const legacy = { ...g, stage: 'runend', run: { ...g.run, ended: true } }; delete legacy.wheelCraft; delete legacy.wheelMeta;
  const l = C(legacy, 'NewRun', {}); assert.deepEqual(l.wheelCraft, { owned: {} });
});

test('SetWheelFeatures: boolean only, no-op when unchanged, missing = on, survives a rebuilt state', () => {
  const g = C(null, 'NewGame', { seed: 'wm5' });
  assert.equal(C(g, 'SetWheelFeatures', { on: true }), g); assert.equal(C(g, 'SetWheelFeatures', { on: 'no' }), g); assert.equal(C(g, 'SetWheelFeatures', {}), g);
  const off = C(g, 'SetWheelFeatures', { on: false }); assert.equal(off.wheelFeatures, false);
  assert.equal(C(off, 'SetWheelFeatures', { on: false }), off);
  assert.notEqual(C(off, 'SetWheelFeatures', { on: true }).wheelFeatures, false);
  assert.equal(C(off, 'SetFeatures', { on: false }).wheelFeatures, false, 'other switches keep it');
});

test('main.js drives FLAGS.wheelMeta from s.wheelFeatures (missing = on), same pattern as applyFeatures', () => {
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(src, /FLAGS\.wheelMeta = !s \|\| s\.wheelFeatures !== false/);
  assert.match(src, /store\.subscribe\(\(s\) => \{ if \(s && s\.wheelFeatures !== lastWheel\)/);
  assert.equal(FLAGS.wheelMeta, false, 'data/flags.js stays off for tests');
});

test('flag off = r9: Spin and CourseSpin leave no tally, no Spokes, the wheel is the r9 wheel', () => {
  withFlag(false, () => {
    const s = spotReady('wm6'), sp = C(s, 'Spin', { careful: true });
    assert.ok(sp.training.pending); assert.deepEqual(sp.training.pending.wheel, wheelSlices(sp.training.pending.wheel && 'normal', coachStepInUse(s))); assert.equal('phys' in sp.training.pending.wheel, false);
    assert.deepEqual(sp.wheelMeta, s.wheelMeta); assert.equal(metaOf(sp).tally, 0); assert.equal(metaOf(sp).spokes, 0);
    const id = s.coaches[0].id, cs = C(s, 'CourseSpin', { coachId: id, careful: true });
    assert.deepEqual(cs.training.coursePending.wheel, courseWheel(s.coaches[0].step)); assert.equal(metaOf(cs).tally, 0);
    const vm = sel.trainingVM(sp); for (const k of ['guide', 'tokens', 'look']) assert.equal(k in vm.spotlight, false, k);
    assert.equal('wheel' in sel.coachesVM(s).coaches[0].course, false);
    assert.equal(sel.workshopVM(s).visible, false); assert.equal(sel.tierUpVM(s), null);
    // the other commands do nothing
    for (const [cmd, p] of [['BuyNode', { id: firstBuyable().id }], ['SwapSpokes', {}], ['DismissTierUp', {}], ['UseToken', { wheel: 'spot', kind: 'respin' }]]) assert.equal(C(sp, cmd, p), sp, cmd);
  });
});

test('flag on: Spin counts 1 spin with its Spokes, stores the meta wheel in pending, same seed same result', () => {
  withFlag(true, () => {
    const s = spotReady('wm7'), sp = C(s, 'Spin', { careful: true });
    const m = metaOf(sp); assert.equal(m.tally, 1); assert.equal(m.spokes, WM.SPOKE_BASE.spot + 0);
    assert.ok(sp.training.pending.wheel.phys, 'meta wheel carries phys'); assert.deepEqual(C(s, 'Spin', { careful: true }), sp, 'deterministic');
    assert.equal(C(sp, 'Spin', { careful: true }), sp, 'one spin a week');
    // reload: JSON round trip shows the same wheel in the VM, whatever the tree says now
    const back = unwrap(JSON.stringify(wrap(sp))).state, vm = sel.trainingVM(back);
    assert.deepEqual(vm.spotlight.wheel.slices, sp.training.pending.wheel.slices); assert.deepEqual(vm.spotlight.wheel.phys, sp.training.pending.wheel.phys);
    assert.equal(vm.spotlight.pending.index, sp.training.pending.result.index);
    assert.ok(Array.isArray(vm.spotlight.tokens) && vm.spotlight.look && typeof vm.spotlight.guide === 'boolean');
    // the nets run still takes the stored result
    const done = C(sp, 'RunNets', {}); assert.ok(done.training.nets); assert.equal(done.training.pending, undefined);
  });
});

test('flag on: Twin pass is two spins in all (each counts 1)', () => {
  withFlag(true, () => {
    const s0 = untilTrain('wm8'), [a, b] = s0.clubs[0].squad.map((p) => p.id);
    let s = C(withSinks(C(s0, 'SetTrainPlan', { spotlightId: a }), { twin_drill: 1 }), 'SetTrainPlan', { spotlight2Id: b });
    s = C(C(s, 'Spin', { careful: true }), 'Spin', { careful: true, slot: 2 });
    assert.ok(s.training.pending && s.training.pending2); assert.equal(metaOf(s).tally, 2); assert.equal(metaOf(s).spokes, 2 * WM.SPOKE_BASE.spot);
    const vm = sel.trainingVM(s); assert.ok(vm.twin.wheel.phys); assert.ok(vm.twin.look);
  });
});

test('flag on: CourseSpin counts 1 Course spin; the course row carries wheel, guide, tokens, look', () => {
  withFlag(true, () => {
    const s = untilTrain('wm9'), id = s.coaches[0].id, cs = C(s, 'CourseSpin', { coachId: id, careful: true });
    assert.ok(cs.training.coursePending); assert.equal(metaOf(cs).tally, 1); assert.equal(metaOf(cs).spokes, WM.SPOKE_BASE.course);
    assert.ok(cs.training.coursePending.wheel.phys);
    const row = sel.coachesVM(cs).coaches.find((c) => c.id === id).course; assert.ok(row.wheel && row.wheel.phys); assert.ok(Array.isArray(row.tokens)); assert.ok(row.look);
    assert.equal(C(cs, 'CourseSpin', { coachId: id, careful: true }), cs);
    const fresh = sel.coachesVM(s).coaches.find((c) => c.id === id).course; assert.deepEqual(fresh.tokens, [], 'no result, no token buttons');
  });
});

test('tier-up: ten spins reach tier 1; the card shows once and DismissTierUp clears it', () => {
  withFlag(true, () => {
    let s = C(null, 'NewGame', { seed: 'wm10' });
    assert.equal(sel.tierUpVM(s), null); assert.equal(sel.workshopVM(s).visible, false);
    s = recordSpin(s, 'spot', { count: WM.TIERS[0] });
    assert.equal(tierNow(s), 1); const t = sel.tierUpVM(s); assert.ok(t && t.tier === 1 && t.material && t.line);
    const d = C(s, 'DismissTierUp', {}); assert.notEqual(d, s); assert.equal(sel.tierUpVM(d), null); assert.equal(C(d, 'DismissTierUp', {}), d);
    assert.equal(sel.workshopVM(s).visible, true);
  });
});

test('Workshop: shape, BuyNode spends Spokes, short and locked say why, no respec', () => {
  withFlag(true, () => {
    let s = setMeta(C(null, 'NewGame', { seed: 'wm11' }), { tally: 10, spokes: 0 });
    let w = sel.workshopVM(s); assert.equal(w.visible, true); assert.equal(w.tier, 1); assert.equal(w.material, WM.MATERIALS[0]);
    assert.deepEqual(w.branches.map((b) => b.id), ['control', 'fortune', 'specialist', 'craft']);
    assert.equal(w.branches.reduce((a, b) => a + b.nodes.length, 0), NODES.length);
    const n0 = w.branches.flatMap((b) => b.nodes).find((n) => n.id === firstBuyable().id);
    assert.deepEqual(Object.keys(n0).sort(), ['confirm', 'cost', 'id', 'max', 'name', 'note', 'rank', 'state', 'tier', 'words']);
    assert.equal(n0.state, 'short'); assert.match(n0.note, /^Need \d+ Spokes, you have 0/);
    assert.ok(w.branches.flatMap((b) => b.nodes).some((n) => n.state === 'locked' && /Opens later/.test(n.note)));
    assert.equal(C(s, 'BuyNode', { id: n0.id }), s, 'short: nothing happens'); assert.equal(C(s, 'BuyNode', { id: 'nope' }), s);
    s = setMeta(s, { spokes: 1000 });
    const b = C(s, 'BuyNode', { id: n0.id }); assert.equal(rankOf(b, n0.id), 1); assert.equal(metaOf(b).spokes, 1000 - n0.cost); assert.equal(metaOf(b).spent, n0.cost);
    const after = sel.workshopVM(b).branches.flatMap((x) => x.nodes).find((n) => n.id === n0.id); assert.ok(['owned', 'max', 'buy'].includes(after.state)); assert.equal(after.rank, 1);
  });
});

test('Swap: closed until the whole power tree is owned; Craft ranks live in wheelCraft and look comes from them', () => {
  withFlag(true, () => {
    const s = setMeta(C(null, 'NewGame', { seed: 'wm12' }), { tally: 10, spokes: 50 });
    assert.equal(sel.workshopVM(s).swap.open, false); assert.equal(C(s, 'SwapSpokes', {}), s);
    const look0 = sel.craftLook(s); assert.deepEqual(Object.keys(look0).sort(), ['burst', 'crystal', 'hub', 'material', 'name', 'pal', 'ptr', 'rim', 'spoke', 'stand', 'tick', 'trail']);
    assert.equal(look0.rim, 0);
    const k = { ...s, wheelCraft: { owned: { k_rim: 2, k_crystal: 1 } } }; const l = sel.craftLook(k); assert.equal(l.rim, 2); assert.equal(l.crystal, true); assert.equal(l.name, false);
  });
});

test('UseToken: spends a token on the waiting result; guards leave the state alone', () => {
  withFlag(true, () => {
    const s0 = setMeta(spotReady('wm13'), { tokens: { respin: 2, nudge: 0, two: 0, wild: 0, lift: 0 } });
    assert.equal(C(s0, 'UseToken', { wheel: 'spot', kind: 'respin' }), s0, 'no result waiting');
    const sp = C(s0, 'Spin', { careful: true }), opts = sel.tokenVM(sp, 'spot');
    assert.ok(opts.counts.respin === 2 && opts.spotLeft === WM.SPOT_TOKEN_CAP);
    assert.ok(sel.trainingVM(sp).spotlight.tokens.every((o) => o.kind && o.label));
    assert.equal(C(sp, 'UseToken', { wheel: 'spot', kind: 'bogus' }), sp);
    if (opts.options.some((o) => o.kind === 'respin')) {
      const u = C(sp, 'UseToken', { wheel: 'spot', kind: 'respin', careful: true });
      assert.equal(metaOf(u).tokens.respin, 1); assert.equal(metaOf(u).spotTokensUsed, 1); assert.equal(u.training.pending.tokUsed, 1); assert.equal(u.training.pending.week, sp.training.pending.week);
      assert.deepEqual(C(sp, 'UseToken', { wheel: 'spot', kind: 'respin', careful: true }), u, 'seeded: same again, same result');
    }
  });
});

test('season start refills tokens (seasonTokens runs on NewSeason when the flag is on)', () => {
  const src = readFileSync(new URL('../js/store/commands.js', import.meta.url), 'utf8');
  assert.match(src, /FLAGS\.wheelMeta \? seasonTokens\(n\) : n/);
  assert.match(src, /\|wm\|/);
});

test('Copy report: hooks pass metaReport lines and buildFull appends them only when given', async () => {
  const { buildFull } = await import('../js/report/report.js');
  const data = { matches: [], sessions: [] }, env = { build: 'b', now: 1, vp: 'v', errors: 0 };
  const plain = buildFull(data, env), withMeta = buildFull(data, { ...env, meta: ['Wheel: tier 2, 30 Spokes'] });
  assert.ok(!plain.includes('Wheel: tier 2')); assert.ok(withMeta.includes('\nWheel: tier 2, 30 Spokes\nJSON:')); assert.equal(buildFull(data, { ...env, meta: [] }), plain);
  assert.match(readFileSync(new URL('../js/report/hooks.js', import.meta.url), 'utf8'), /FLAGS\.wheelMeta && store\.get\(\) \? metaReport\(store\.get\(\)\)/);
});

test('Settings: the Wheel upgrades row mounts and dispatches SetWheelFeatures', async () => {
  const { wheelRowHtml } = await import('../js/ui/matchday-settings.js');
  const h = wheelRowHtml(true); assert.match(h, /Wheel upgrades/); assert.match(h, /data-md-wheel/); assert.match(h, /aria-checked="true"/);
  assert.match(wheelRowHtml(false), /aria-checked="false"/); assert.match(wheelRowHtml(false), />Off</);
});
