// node tweak.test.js : PL.Tweak registry (ids, defaults, clamp/step, dirty, presets, codes, versioned storage) + PL.store.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const P = path.join(__dirname, '..', 'parts');
function boot(store, extra, customLs) {
  const ls = customLs || (store ? { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } : undefined);
  const ctx = vm.createContext({ console, Math, JSON, localStorage: ls, btoa: globalThis.btoa, atob: globalThis.atob, Buffer });
  ctx.globalThis = ctx;
  if (!store) delete ctx.localStorage;
  for (const f of ['core', 'camera', 'tweak'].concat(extra || [])) vm.runInContext('(function(){' + fs.readFileSync(path.join(P, f + '.js'), 'utf8') + '\n})()', ctx, { filename: f });
  return ctx.PL;
}
let fails = 0, n = 0;
const J = (x) => (x == null ? x : JSON.parse(JSON.stringify(x))); // vm objects are cross-realm
function t(name, fn) { try { fn(); n++; console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ': ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); } }

t('every PL.C value except DT is registered, default = code value, not dirty at load', () => {
  const PL = boot({}), T = PL.Tweak;
  for (const id of Object.keys(PL.C)) {
    if (id === 'DT') { assert(!T.has('DT'), 'DT must not be tweakable'); continue; }
    assert(T.has(id), 'missing ' + id);
    assert.strictEqual(T.def(id).def, PL.C[id], id);
    assert.strictEqual(T.get(id), PL.C[id], id);
  }
  assert.strictEqual(T.isDirty(), false);
  assert.deepStrictEqual(Object.keys(T.diff()), []);
});
t('tweak-tech table ids present with groups and ranges', () => {
  const T = boot({}).Tweak;
  const want = { G: [800, 2400, 100], CAP: [400, 1000, 50], CHARGES: [1, 5, 1], BUFFER: [0, 0.25, 0.01], CRUSHER_PERIOD: [1.2, 4, 0.2], EXIT_R: [12, 32, 2], HALF: [8, 14, 1], MAX_W: [336, 600, 12] };
  for (const id in want) { const d = T.def(id); assert.deepStrictEqual([d.min, d.max, d.step], want[id], id); assert(d.group, id + ' group'); }
  for (const id of ['LOOK_WIDE', 'LOOK_TALL', 'POS_T', 'ZOOM_T', 'BOB_MAX_Y', 'FIT_MIN', 'SHAFT_N', 'PATH_S', 'PAD_KEY', 'PAD_DIVE', 'PAD_GAP', 'HAPTIC_MS']) assert(T.has(id), id);
});
t('every default sits on its step grid inside [min,max]', () => {
  const T = boot({}).Tweak;
  for (const id of T.ids()) {
    const d = T.def(id); if (d.list) { assert(d.list.includes(d.def), id); continue; }
    assert(d.def >= d.min && d.def <= d.max, id + ' range');
    assert.strictEqual(T.set(id, d.def), d.def, id + ' set(default) changes value');
  }
  assert.strictEqual(T.isDirty(), false);
});
t('set clamps, snaps to step, writes PL.C; dirty + diff; reset/resetAll', () => {
  const PL = boot({}), T = PL.Tweak;
  assert.strictEqual(T.set('G', 99999), 2400); assert.strictEqual(PL.C.G, 2400);
  assert.strictEqual(T.set('G', 1234), 1200);
  assert.strictEqual(T.set('DRAG', 0.33), 0.35);
  assert.strictEqual(T.set('BUFFER', 0.1234), 0.12);
  assert(T.isDirty()); assert.deepStrictEqual(Object.keys(T.diff()).sort(), ['BUFFER', 'G']);
  T.reset('G'); assert.strictEqual(PL.C.G, 1500);
  T.resetAll(); assert(!T.isDirty()); assert.strictEqual(PL.C.BUFFER, 0.08);
  assert.strictEqual(T.set('NOPE', 3), undefined);
  assert.strictEqual(T.set('G', 'abc'), 1500, 'non-number ignored');
});
t('camera ids write PL.CAM', () => {
  const PL = boot({}), T = PL.Tweak;
  T.set('FIT_MIN', 0.8); assert.strictEqual(PL.CAM.FIT_MIN, 0.8);
  T.set('MAX_W', 600); assert.strictEqual(PL.CAM.MAX_W, 600);
});
t('register(id, def) for other slices; list ids; onChange', () => {
  const T = boot({}).Tweak; let seen = null;
  T.onChange((id, v) => { seen = [id, v]; });
  T.register('SFX_GAIN', { group: 'Session', label: 'SFX gain', def: 0.1, min: 0, max: 0.15, step: 0.01 });
  assert.strictEqual(T.get('SFX_GAIN'), 0.1); assert(!T.isDirty());
  T.set('SFX_GAIN', 0.05); assert.deepStrictEqual(seen, ['SFX_GAIN', 0.05]); assert(T.isDirty());
  T.register('SKIN', { group: 'Session', label: 'Skin', def: 'starfall', list: ['starfall', 'surveyor'] });
  assert.strictEqual(T.set('SKIN', 'surveyor'), 'surveyor'); assert.strictEqual(T.set('SKIN', 'bogus'), 'surveyor');
  assert.throws(() => T.register('X', { def: 1 }), /min/);
});
t('isDirty(sim) separates sim ids from camera/input ids; simSnapshot', () => {
  const PL = boot({}), T = PL.Tweak;
  T.set('POS_T', 0.5); assert(T.isDirty()); assert(!T.isDirty('sim'));
  T.set('G', 1600); assert(T.isDirty('sim'));
  assert.strictEqual(PL.simSnapshot().G, 1600);
});
t('encode/decode code: round trip, unknown ids dropped, values clamped, junk -> null', () => {
  const T = boot({}).Tweak;
  const code = T.encode({ G: 1700, CAP: 650 });
  assert(/^PLT1:/.test(code));
  assert.deepStrictEqual(J(T.decode(code)), { G: 1700, CAP: 650 });
  const raw = 'PLT1:' + Buffer.from(JSON.stringify({ v: 1, t: { G: 99999, ZZZ: 1, CHARGES: 'x' } })).toString('base64');
  assert.deepStrictEqual(J(T.decode(raw)), { G: 2400 });
  for (const bad of ['', 'hello', 'PLT1:!!!!', 'PLT1:' + Buffer.from('[1]').toString('base64'), 'PLT1:' + Buffer.from(JSON.stringify({ v: 9, t: { G: 1600 } })).toString('base64')]) assert.strictEqual(T.decode(bad), null, bad);
  T.set('G', 1900); const ex = T.exportCode(); T.resetAll();
  assert.strictEqual(T.importCode(ex), 1); assert.strictEqual(T.get('G'), 1900);
  assert.strictEqual(T.importCode('junk'), -1);
});
t('presets: save/load/delete/list, max 12, name <= 24 chars, persisted', () => {
  const store = {}; let PL = boot(store), T = PL.Tweak;
  T.set('G', 1800); assert(T.savePreset('  Heavy  '));
  T.resetAll(); assert(T.loadPreset('Heavy')); assert.strictEqual(T.get('G'), 1800);
  assert(!T.savePreset('')); assert(T.savePreset('x'.repeat(40))); assert(T.listPresets().some((p) => p.name === 'x'.repeat(24)));
  for (let i = 0; i < 20; i++) T.savePreset('p' + i);
  assert.strictEqual(T.listPresets().length, 12);
  assert(T.savePreset('Heavy'), 'overwrite existing name allowed when full');
  assert(T.deletePreset('Heavy')); assert(!T.loadPreset('Heavy'));
  const s = JSON.parse(store['plumbline.presets.v1']); assert.strictEqual(s.v, 1); assert(Array.isArray(s.list));
  PL = boot(store); assert.strictEqual(PL.Tweak.listPresets().length, 11);
});
t('savePresetR/deletePresetR report the real write result and a reason code', () => {
  const store = {}; const PL = boot(store), T = PL.Tweak;
  assert.deepStrictEqual(J(T.savePresetR('a')), { ok: true, reason: null });
  assert.deepStrictEqual(J(T.savePresetR('  ')), { ok: false, reason: 'blank' });
  for (let i = 0; i < 12; i++) T.savePresetR('p' + i);
  assert.deepStrictEqual(J(T.savePresetR('brand new')), { ok: false, reason: 'full' });
  assert.strictEqual(T.savePreset('brand new'), false);
  assert.deepStrictEqual(J(T.deletePresetR('a')), { ok: true, reason: null });
  assert.strictEqual(T.deletePresetR('nope').ok, false);
});
t('preset storage failure -> false/"storage", no phantom preset; read-only newer save -> false/"storage"', () => {
  const store = {}; const PL = boot(store), T = PL.Tweak;
  T.savePreset('keep');
  const ctxStore = { getItem: (k) => (k in store ? store[k] : null), setItem: () => { throw new Error('quota'); }, removeItem() {} };
  const PL2 = boot(store, [], ctxStore), T2 = PL2.Tweak;
  assert.deepStrictEqual(J(T2.savePresetR('x')), { ok: false, reason: 'storage' });
  assert.strictEqual(T2.savePreset('x'), false);
  assert.deepStrictEqual(T2.listPresets().map((p) => p.name), ['keep']);
  assert.deepStrictEqual(J(T2.deletePresetR('keep')), { ok: false, reason: 'storage' });
  assert.deepStrictEqual(T2.listPresets().map((p) => p.name), ['keep']);
  const st = { 'plumbline.presets.v1': JSON.stringify({ v: 9, list: [] }) }, T3 = boot(st).Tweak;
  assert.deepStrictEqual(J(T3.savePresetR('y')), { ok: false, reason: 'storage' });
  assert.strictEqual(st['plumbline.presets.v1'], JSON.stringify({ v: 9, list: [] }));
});
t('inherited keys in codes/stores are ignored (constructor, toString, __proto__)', () => {
  const T = boot({}).Tweak;
  for (const k of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) assert.strictEqual(T.has(k), false, k);
  const mk = (txt) => 'PLT1:' + Buffer.from(txt).toString('base64');
  const code = mk('{"v":1,"t":{"constructor":5,"toString":1,"__proto__":{"G":1700},"valueOf":2}}');
  assert.deepStrictEqual(J(T.decode(code)), {});
  assert.strictEqual(T.importCode(code), 0); assert(!T.isDirty());
  assert.strictEqual(T.apply(JSON.parse('{"constructor":1,"__proto__":{"G":1700}}')), 0);
  assert.strictEqual(T.get('constructor'), undefined); assert.strictEqual(T.set('toString', 1), undefined);
  const st = { 'plumbline.tweaks.v1': '{"v":1,"t":{"constructor":3,"__proto__":{"G":2000}}}' };
  assert(!boot(st).Tweak.isDirty());
});
t('import code: clamp, snap, non-finite rejected, over 8 KB rejected', () => {
  const T = boot({}).Tweak, mk = (o) => 'PLT1:' + Buffer.from(JSON.stringify({ v: 1, t: o })).toString('base64');
  assert.strictEqual(T.importCode(mk({ G: 99999, CAP: 612 })), 2);
  assert.strictEqual(T.get('G'), 2400); assert.strictEqual(T.get('CAP'), 600);
  assert.deepStrictEqual(J(T.decode(mk({ G: null, CAP: '700', DRAG: 1e999 }))), {});
  const big = mk({ G: 1700, pad: 'x'.repeat(9000) });
  assert(big.length > 8192); assert.strictEqual(T.decode(big), null); assert.strictEqual(T.importCode(big), -1);
});
t('isDirty(sim): only physics/rooms/timing ids; input/camera/preview never count', () => {
  const T = boot({}).Tweak;
  const nonSim = ['PAD_KEY', 'PAD_DIVE', 'PAD_GAP', 'HAPTIC_MS', 'PATH_S', 'LOOK_WIDE', 'LOOK_TALL', 'MAX_W', 'POS_T', 'ZOOM_T', 'BOB_MAX_Y', 'FIT_MIN'];
  for (const id of nonSim) { const d = T.def(id); T.set(id, d.max === d.def ? d.min : d.max); }
  assert(T.isDirty()); assert.strictEqual(T.isDirty('sim'), false); T.resetAll();
  const sim = T.ids().filter((id) => T.def(id).sim); assert.strictEqual(sim.length, 23);
  for (const id of sim) { const d = T.def(id); T.set(id, d.max === d.def ? d.min : d.max); assert(T.isDirty('sim'), id); T.reset(id); assert(!T.isDirty('sim'), id); }
  assert(sim.includes('SHAFT_N') && sim.includes('G') && sim.includes('CRUSHER_PERIOD'));
});
t('tweaks persist across reload (versioned key), corrupt store -> defaults', () => {
  const store = {}; let PL = boot(store);
  PL.Tweak.set('CHARGES', 3); PL.Tweak.set('POS_T', 0.3);
  assert.deepStrictEqual(JSON.parse(store['plumbline.tweaks.v1']), { v: 1, t: { CHARGES: 3, POS_T: 0.3 } });
  PL = boot(store); assert.strictEqual(PL.C.CHARGES, 3); assert.strictEqual(PL.CAM.POS_T, 0.3); assert(PL.Tweak.isDirty());
  store['plumbline.tweaks.v1'] = '{oops'; PL = boot(store); assert(!PL.Tweak.isDirty()); assert.strictEqual(PL.C.CHARGES, 2);
  store['plumbline.tweaks.v1'] = JSON.stringify({ v: 1, t: { G: 50, BAD: 3 } }); PL = boot(store); assert.strictEqual(PL.C.G, 800);
});
t('newer stored version is read-only: never overwritten or downgraded', () => {
  const raw = JSON.stringify({ v: 7, t: { G: 2000 }, extra: 'future' });
  const store = { 'plumbline.tweaks.v1': raw }; const PL = boot(store);
  assert(PL.Tweak.readOnly()); assert(!PL.Tweak.isDirty(), 'unknown version not applied');
  PL.Tweak.set('G', 1600); PL.Tweak.resetAll();
  assert.strictEqual(store['plumbline.tweaks.v1'], raw);
});
t('no localStorage: works in memory', () => {
  const PL = boot(null);
  assert.strictEqual(PL.Tweak.set('G', 1600), 1600); assert(PL.Tweak.savePreset('a')); assert(!PL.Tweak.readOnly());
});
t('PL.store get/set/version helpers', () => {
  const store = {}; const S = boot(store).store;
  assert.deepStrictEqual(J(S.load('k', 2)), { v: 0, data: null, readOnly: false });
  assert(S.save('k', 2, { a: 1 })); assert.deepStrictEqual(JSON.parse(store.k), { v: 2, a: 1 });
  assert.deepStrictEqual(J(S.load('k', 2)), { v: 2, data: { v: 2, a: 1 }, readOnly: false });
  store.k = JSON.stringify({ v: 3, a: 9 });
  assert.strictEqual(S.load('k', 2).readOnly, true); assert(!S.save('k', 2, { a: 2 })); assert.strictEqual(JSON.parse(store.k).a, 9);
  store.k = 'nope'; assert.strictEqual(S.load('k', 2).data, null);
});
t('runtime snapshot of tweaks keeps sim determinism: newState uses tweaked C, replay(snap) equal', () => {
  const PL = boot({}); PL.Tweak.set('G', 2000);
  const room = { w: 336, h: 500, start: { x: 100, y: 100, g: 2 }, exit: { x: 300, y: 50 }, walls: [[0, 488, 336, 12]], spikes: [], crumbles: [], gates: [], crushers: [] };
  const s = PL.newState(room); for (let i = 0; i < 50; i++) PL.step(s, []);
  const snap = s.K.snap; PL.Tweak.resetAll();
  assert.strictEqual(PL.replay(room, [{ tick: 49, k: 'dive' }], snap).state.K.G, 2000);
});

// ---- meta.js save versioning (S1) ----
t('meta: 5-room and 7-room bests kept apart; per-room seconds stored', () => {
  const store = {}; const M = boot(store, ['meta']).meta;
  const k5 = M.keyFor('daily', 20261119, 5), k7 = M.keyFor('daily', 20261119, 7);
  assert(M.recordRun(k5, { ticks: 6000, flips: 5, rooms: [10.123, 20, 30] }).isBest);
  assert.strictEqual(M.getBest(k7), null);
  assert(M.recordRun(k7, { ticks: 9000, flips: 5 }).isBest);
  assert.strictEqual(M.getBest(k5).ticks, 6000); assert.strictEqual(M.getBest(k7).ticks, 9000);
  assert.deepStrictEqual(J(M.getBest(k5).rooms), [10.12, 20, 30]);
  assert.strictEqual(JSON.parse(store['plumbline.v1'])._v, 2);
  assert.deepStrictEqual(Object.keys(M.load()).sort(), [k5, k7].sort(), 'load() strips _v');
});
t('meta: a dirty SIM Tweak = never saved as best, even without run.tuned; a pad-size tweak does not block a best', () => {
  const store = {}; const PL = boot(store, ['meta']);
  PL.Tweak.set('G', PL.Tweak.get('G') + 100);
  const r = PL.meta.recordRun('seed:1:5', { ticks: 100, flips: 1 });
  assert(!r.isBest && r.tuned); assert.strictEqual(PL.meta.getBest('seed:1:5'), null);
  PL.Tweak.resetAll();
  PL.Tweak.set('PAD_KEY', 64);
  assert(PL.meta.recordRun('seed:1:5', { ticks: 100, flips: 1 }).isBest);
});
t('meta: old v1 data kept and upgraded in place; newer _v is read-only (never downgraded)', () => {
  const store = { 'plumbline.v1': JSON.stringify({ 'tutorial:1:3': { ticks: 900, flips: 3, medal: 'gold' } }) };
  let M = boot(store, ['meta']).meta;
  assert.strictEqual(M.getBest('tutorial:1:3').ticks, 900);
  M.recordRun('daily:1:7', { ticks: 99999, flips: 1 });
  const o = JSON.parse(store['plumbline.v1']); assert.strictEqual(o._v, 2); assert.strictEqual(o['tutorial:1:3'].ticks, 900);
  const fut = JSON.stringify({ _v: 3, 'tutorial:1:3': { ticks: 800, flips: 2, medal: 'gold', extra: 1 } });
  store['plumbline.v1'] = fut; M = boot(store, ['meta']).meta;
  assert.strictEqual(M.getBest('tutorial:1:3').ticks, 800); assert(M.isReadOnly());
  const r = M.recordRun('tutorial:1:3', { ticks: 10, flips: 1 });
  assert(!r.isBest && r.readOnly); assert.strictEqual(store['plumbline.v1'], fut);
});
t('meta: roomSummary / reportLines give per-room seconds, deaths, causes', () => {
  const M = boot({}, ['meta']).meta;
  const at = [{ room: 1, ticks: 120, result: 'death', cause: 'spike' }, { room: 1, ticks: 240, result: 'win' }, { room: 2, ticks: 60, result: 'death', cause: 'crush' }];
  const s = J(M.roomSummary(at, 3));
  assert.deepStrictEqual(s[0], { room: 1, seconds: 3, clearS: 2, attempts: 2, deaths: 1, causes: { spike: 1 } });
  assert.deepStrictEqual(s[2], { room: 3, seconds: 0, clearS: null, attempts: 0, deaths: 0, causes: {} });
  const L = M.reportLines(at, 3).join('\n');
  assert(/room 1: 3\.00s, clear 2\.00s, 2 att, 1 deaths \(spike 1\)/.test(L), L);
  assert(/room 2: 0\.50s, clear -, 1 att, 1 deaths \(crush 1\)/.test(L), L);
});
t('pad ids: PAD_ALPHA/PAD_SIDE defaults, group Pad, clamp, dirty, preset round trip', () => {
  const store = {}, T = boot(store).Tweak;
  assert.strictEqual(T.get('PAD_ALPHA'), 0.45); assert.strictEqual(T.get('PAD_SIDE'), 0);
  for (const id of ['PAD_ALPHA', 'PAD_SIDE', 'PAD_KEY', 'PAD_DIVE', 'PAD_GAP']) assert.strictEqual(T.def(id).group, 'Pad', id);
  assert.strictEqual(T.def('PAD_KEY').label, 'Arrow key size'); assert.strictEqual(T.def('PAD_DIVE').label, 'Dive key size');
  assert.strictEqual(T.set('PAD_ALPHA', 5), 1); assert.strictEqual(T.set('PAD_ALPHA', 0), 0.2); assert.strictEqual(T.set('PAD_ALPHA', 0.52), 0.5);
  assert.strictEqual(T.set('PAD_SIDE', 2), 0); assert.strictEqual(T.get('PAD_SIDE'), 0);
  T.resetAll(); assert.strictEqual(T.isDirty(), false);
  T.set('PAD_ALPHA', 0.7); assert(T.isDirty()); T.reset('PAD_ALPHA'); assert(!T.isDirty());
  T.set('PAD_SIDE', 1); assert(T.isDirty()); assert.strictEqual(T.diff().PAD_SIDE, 1);
  T.set('PAD_ALPHA', 0.7);
  assert(T.savePreset('lefty')); T.resetAll(); assert(!T.isDirty());
  assert(T.loadPreset('lefty')); assert.strictEqual(T.get('PAD_SIDE'), 1); assert.strictEqual(T.get('PAD_ALPHA'), 0.7);
  const code = T.exportCode(); T.resetAll(); assert(T.importCode(code) >= 0); assert.strictEqual(T.get('PAD_ALPHA'), 0.7);
  T.deletePreset('lefty'); assert.strictEqual(T.listPresets().length, 0);
});
console.log(fails ? fails + ' FAILED' : n + ' passed');
process.exit(fails ? 1 : 0);
