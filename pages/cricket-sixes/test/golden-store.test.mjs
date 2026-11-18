import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { goldenVM } from '../js/store/selectors.js';
import { suggestedBowler } from '../js/store/wheelmatch-store.js';
import { previewBalls } from '../js/core/golden-over.js';

const quick = (seed) => C(null, 'NewMatch', { seed, mode: 'wheel' });
const G = (s, grades, bowler) => { let n = s; for (const e of grades) n = C(n, 'GoldenTap', e === null ? { err: null, miss: true } : { err: e }); return n; };
const ERR = { P: 0, G: 100, M: 400 };

test('GoldenStart: once per innings, locks, rejects WheelOver while active, rejects outside pick', () => {
  const s0 = quick('gs1');
  assert.equal(C(null, 'GoldenStart', {}), null);
  const vm0 = goldenVM(s0); assert.ok(vm0.available && !vm0.active && vm0.needCal);
  const s1 = C(s0, 'GoldenStart', {});
  assert.notEqual(s1, s0); assert.ok(goldenVM(s1).active && !goldenVM(s1).available);
  assert.equal(C(s1, 'GoldenStart', {}), s1);
  assert.equal(C(s1, 'WheelOver', { auto: true }), s1);
  assert.equal(C(s0, 'GoldenStart', { bowler: 99 }), s0);
  assert.equal(C(s0, 'GoldenTap', { err: 0 }), s0); // not started: nothing to tap
  const brk = { ...s0, stage: 'break' }; assert.equal(C(brk, 'GoldenStart', {}), brk);
});
test('commit after 6 taps: gold flags, last.golden, runs, once per innings', () => {
  let s = C(quick('gs2'), 'GoldenStart', {});
  const bowler = s.golden.inn1.bowler;
  s = G(s, [ERR.P, ERR.G, ERR.M, ERR.P, ERR.P, ERR.G]);
  assert.equal(s.last.golden, true); assert.equal(s.last.taps.length, 6); assert.equal(s.last.balls.length, 6);
  assert.deepEqual(s.last.taps.map((t) => t.g), ['P', 'G', 'M', 'P', 'P', 'G']);
  assert.equal(s.last.bowler, bowler);
  assert.equal(s.inn1.overs[s.inn1.overs.length - 1].gold, true);
  assert.equal(s.inn1.over, 2); assert.ok(s.golden.inn1.done);
  assert.equal(goldenVM(s).available, false);
  assert.equal(C(s, 'GoldenStart', {}), s);
  assert.notEqual(C(s, 'WheelOver', { auto: true }), s); // normal overs resume
});
test('no tap (miss) grades M; offset is subtracted', () => {
  let s = C(quick('gs3'), 'GoldenStart', {});
  s = C(s, 'GoldenCal', { offset: 40, n: 10 });
  s = C(s, 'GoldenTap', { err: 40 }); assert.equal(s.golden.inn1.taps[0].g, 'P'); assert.equal(s.golden.inn1.taps[0].e, 0);
  s = C(s, 'GoldenTap', { err: null, miss: true }); assert.equal(s.golden.inn1.taps[1].g, 'M');
  assert.deepEqual(s.goldCal, { offset: 40, n: 10 });
});
test('fixed rng consumption: an earlier ball never changes when later grades change', () => {
  const s = C(quick('gs4'), 'GoldenStart', {}), bowler = s.golden.inn1.bowler, ctx = { bowler };
  const a = previewBalls(s, ['G', 'G', 'G', 'G', 'G', 'G'], ctx), b = previewBalls(s, ['G', 'P', 'M', 'P', 'M', 'P'], ctx);
  assert.equal(a[0].o, b[0].o);
  const c = previewBalls(s, ['P', 'M', 'M', 'M', 'M', 'M'], ctx), d = previewBalls(s, ['P', 'P', 'G', 'P', 'P', 'P'], ctx);
  assert.equal(c[0].o, d[0].o);
  const e = previewBalls(s, ['G', 'M'], ctx); assert.equal(e.length, 2);
  // grades chosen at ball i fix ball i only: full-over G balls equal ball i of the same grade prefix
  assert.deepEqual(previewBalls(s, ['P', 'G', 'M'], ctx).map((x) => x.o), previewBalls(s, ['P', 'G', 'M', 'P', 'P', 'P'], ctx).slice(0, 3).map((x) => x.o));
});
test('reload mid-over: serialised state after 3 taps finishes with the same balls', () => {
  const s0 = C(quick('gs5'), 'GoldenStart', {});
  const plan = [ERR.P, ERR.G, ERR.M, ERR.P, ERR.G, ERR.P];
  const straight = G(s0, plan);
  const mid = JSON.parse(JSON.stringify(G(s0, plan.slice(0, 3))));
  const resumed = G(mid, plan.slice(3));
  assert.deepEqual(resumed.last, straight.last);
  assert.deepEqual(resumed.inn1.overs, straight.inn1.overs);
  assert.equal(resumed.inn1.runs, straight.inn1.runs);
});
test('chase: golden over in innings 2 commits; innings can end early', () => {
  let s = C(quick('gs6'), 'GoldenStart', {});
  s = G(s, Array(6).fill(ERR.G));
  while (s.stage === 'bowl') s = C(s, 'WheelOver', { auto: true });
  s = C(s, 'StartChase');
  const vm = goldenVM(s); assert.equal(vm.side, 'bat'); assert.ok(vm.available);
  s = C(s, 'GoldenStart', {});
  let g = 0; while (goldenVM(s) && goldenVM(s).active && g++ < 8) s = C(s, 'GoldenTap', { err: 0 });
  assert.equal(s.last.golden, true); assert.ok(s.last.balls.length >= 1 && s.last.balls.length <= 6);
  assert.equal(s.golden.inn2.done, true);
});
test('golden record of an old match is ignored by a new seed', () => {
  const s = C(quick('gs7'), 'GoldenStart', {});
  const t = quick('gs8'); const mixed = { ...t, golden: s.golden };
  assert.ok(goldenVM(mixed).available);
});
test('GoldenCal keeps value across and ignores garbage', () => {
  const s = quick('gs9');
  assert.equal(C(s, 'GoldenCal', { offset: 'x' }), s);
  assert.deepEqual(C(s, 'GoldenCal', { offset: 12.5, n: 10 }).goldCal, { offset: 12.5, n: 10 });
});
test('commit pushes a golden wheelLog entry (not careful), Spokes with wheelMeta; BowlOver / MakeCall / WheelOver refused while active', async () => {
  const { FLAGS } = await import('../js/data/flags.js');
  const s0 = quick('gs10'), n0 = (s0.wheelLog || []).length;
  let s = C(s0, 'GoldenStart', {});
  assert.equal(C(s, 'BowlOver', {}), s); assert.equal(C(s, 'MakeCall', { bowler: 0 }), s); assert.equal(C(s, 'WheelOver', { auto: true }), s);
  s = G(s, Array(6).fill(ERR.G));
  assert.equal(s.wheelLog.length, n0 + 1);
  const e = s.wheelLog[s.wheelLog.length - 1];
  assert.deepEqual({ ...e, runs: 0, wk: 0, xr: 0 }, { inn: 1, over: 1, segId: null, label: 'Captain', t: null, auto: false, bucket: null, careful: false, runs: 0, wk: 0, xr: 0, xw: null, guide: false, golden: true });
  assert.equal(e.runs, s.inn1.runs); assert.equal(e.wk, s.inn1.wk); assert.ok(Number.isFinite(e.xr));
  const old = FLAGS.wheelMeta; FLAGS.wheelMeta = true;
  try { const t = C(quick('gs11'), 'GoldenStart', {}); const u = G(t, Array(6).fill(ERR.G)); assert.ok(u.season ? u.wheelMeta.spokes > 0 : true); } finally { FLAGS.wheelMeta = old; }
});
