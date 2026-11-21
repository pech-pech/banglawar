import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SAVE_KEY, BAK_KEY, BAD_KEY, LEGACY, TOAST_RESET, TOAST_RULES } from '../../pages/ridgeline/src/save2.js';

function mk(opts = {}) {
  const m = opts.map || new Map();
  const ctx = { day: opts.day || '2026-11-21', dev: false, rules: opts.rules || 1 };
  const storage = { get: k => (m.has(k) ? m.get(k) : null), set: (k, v) => { if (opts.fail) throw new Error('quota'); m.set(k, v); } };
  const s = createSave({ storage, rulesVersion: ctx.rules, today: () => ctx.day, dev: () => ctx.dev });
  return { m, ctx, s };
}
const run = (dist, extra = {}) => ({ dist, hull: 'wren', zone: 1, lap: 0, seed: 'abc', cause: 'night', wrecks: 1, clean: 2, longestFlightS: 1.5, ...extra });

test('fresh load gives defaults, record then reload round-trips', () => {
  const { m, ctx, s } = mk();
  s.load();
  assert.equal(s.get().best, null);
  const r = s.recordRun(run(1200));
  assert.ok(r.saved && r.newBest && r.delta === 1200);
  s.unlockMark('first_light'); s.unlockHull('kite'); s.noteZone(1, 0);
  const b = mk({ map: m });
  b.s.load();
  assert.equal(b.s.get().best.dist, 1200);
  assert.deepEqual(b.s.get().marks, ['first_light']);
  assert.ok(b.s.get().hulls.includes('kite'));
  assert.deepEqual(b.s.get().zones, { '1.0': 1 });
  assert.equal(b.s.get().stats.runs, 1);
  void ctx;
});

test('never downgrade best', () => {
  const { s } = mk(); s.load();
  s.recordRun(run(3000));
  const r = s.recordRun(run(900));
  assert.equal(r.newBest, false);
  assert.equal(r.delta, -2100);
  assert.equal(s.get().best.dist, 3000);
  assert.equal(s.get().stats.runs, 2);
  assert.equal(s.recordRun(run(3000)).newBest, false);
});

test('corrupt JSON -> .bad copy, recover from .bak, toast', () => {
  const { m, s } = mk(); s.load();
  s.recordRun(run(500)); s.recordRun(run(700)); // second write backs up first
  const good = m.get(BAK_KEY);
  assert.ok(good);
  m.set(SAVE_KEY, '{not json');
  const b = mk({ map: m }); const res = b.s.load();
  assert.equal(m.get(BAD_KEY), '{not json');
  assert.equal(res.toast, TOAST_RESET);
  assert.equal(b.s.get().best.dist, 500);
  assert.equal(JSON.parse(m.get(SAVE_KEY)).best.dist, 500); // repaired
});

test('corrupt with no backup -> defaults; wrong shape also caught', () => {
  const m = new Map([[SAVE_KEY, JSON.stringify({ v: 1, best: 'x' })]]);
  const b = mk({ map: m }); const res = b.s.load();
  assert.equal(res.toast, TOAST_RESET);
  assert.equal(b.s.get().best, null);
  assert.ok(m.get(BAD_KEY));
  const m2 = new Map([[SAVE_KEY, JSON.stringify({ v: 2, rulesVersion: 1, marks: 'no', hulls: [], zones: [], stats: {}, daily: {} })]]);
  const c = mk({ map: m2 }); c.s.load();
  assert.equal(m2.has(BAD_KEY), true);
});

test('rulesVersion bump clears bests and daily, keeps the rest', () => {
  const a = mk(); a.s.load();
  a.s.recordRun(run(4000, { daily: true }));
  a.s.unlockMark('dune_crown'); a.s.unlockHull('kite'); a.s.noteZone(2, 1); a.s.setPresets([{ name: 'p', values: { g: 1 } }]);
  const b = mk({ map: a.m, rules: 2 }); const res = b.s.load();
  const st = b.s.get();
  assert.equal(res.toast, TOAST_RULES);
  assert.equal(st.rulesVersion, 2);
  assert.equal(st.best, null); assert.deepEqual(st.bestByHull, {});
  assert.equal(st.daily.best, 0);
  assert.deepEqual(st.marks, ['dune_crown']);
  assert.ok(st.hulls.includes('kite'));
  assert.deepEqual(st.zones, { '2.1': 1 });
  assert.equal(st.stats.runs, 1);
  assert.equal(st.presets.length, 1);
  assert.equal(b.s.recordRun(run(100)).newBest, true);
});

test('migrate v1 keys once', () => {
  const m = new Map([[LEGACY.bestdist, '2345.7'], [LEGACY.best, '{"a":1,"b":2}'], [LEGACY.medal, '{"a":"gold"}'],
    [LEGACY.presets, JSON.stringify([{ name: 'mine', values: { x: 1 } }, { bad: 1 }])]]);
  const b = mk({ map: m }); b.s.load();
  const st = b.s.get();
  assert.equal(st.best.dist, 2345);
  assert.equal(st.legacy.best, 2); assert.equal(st.legacy.medal, 1);
  assert.deepEqual(st.presets, [{ name: 'mine', values: { x: 1 } }]);
  assert.ok(m.has(SAVE_KEY));
  m.set(LEGACY.bestdist, '9999'); // second load must not re-migrate
  const c = mk({ map: m }); c.s.load();
  assert.equal(c.s.get().best.dist, 2345);
});

test('DEV blocks writes of marks and bests', () => {
  const { m, ctx, s } = mk(); s.load();
  s.recordRun(run(800));
  const before = m.get(SAVE_KEY);
  ctx.dev = true;
  const r = s.recordRun(run(9000, { daily: true }));
  assert.equal(r.newBest, false);
  assert.equal(s.unlockMark('x'), false); assert.equal(s.unlockHull('kite'), false);
  assert.equal(s.addDailyRun(), false);
  assert.equal(s.get().best.dist, 800); assert.equal(s.get().daily.best, 0); assert.deepEqual(s.get().marks, []);
  // F4: stats and zones still count in DEV
  assert.equal(s.get().stats.runs, 2);
  assert.equal(s.noteZone(1, 0), true);
  assert.notEqual(m.get(SAVE_KEY), before);
  assert.deepEqual(JSON.parse(m.get(SAVE_KEY)).zones, { '1.0': 1 });
  ctx.dev = false;
  assert.equal(s.recordRun(run(900)).newBest, true);
});

test('storage quota errors never throw', () => {
  const { s } = mk({ fail: true });
  s.load();
  const r = s.recordRun(run(100));
  assert.equal(r.saved, false);
  assert.equal(s.get().best.dist, 100);
  assert.ok(s.errors.length > 0);
});

test('daily best, runs, and midnight rollover into log', () => {
  const { m, ctx, s } = mk(); s.load();
  s.addDailyRun('daily:2026-11-21:r1'); s.addDailyRun();
  assert.equal(s.get().daily.runs, 2);
  const r = s.recordRun(run(3000, { daily: true, hull: 'kite' }));
  assert.ok(r.dailyBest);
  assert.equal(s.recordRun(run(2000, { daily: true })).dailyBest, false);
  assert.equal(s.get().daily.best, 3000);
  // normal run does not touch daily
  s.recordRun(run(7000));
  assert.equal(s.get().daily.best, 3000);
  ctx.day = '2026-11-22'; // midnight passes mid-session
  const d = s.dailyToday();
  assert.equal(d.date, '2026-11-22'); assert.equal(d.best, 0); assert.equal(d.runs, 0);
  assert.deepEqual(d.log['2026-11-21'], { best: 3000, hull: 'kite' });
  // and on load
  ctx.day = '2026-11-22';
  s.recordRun(run(10, { daily: true }));
  const b = mk({ map: m, day: '2026-11-23' }); b.s.load();
  assert.equal(b.s.get().daily.date, '2026-11-23');
  assert.ok(b.s.get().daily.log['2026-11-22']);
  assert.ok(b.s.get().daily.log['2026-11-21']);
});

test('daily log keeps 30 days', () => {
  const { ctx, s } = mk(); s.load();
  for (let i = 1; i <= 40; i++) {
    ctx.day = `2026-10-${String(i).padStart(2, '0')}`.replace('2026-10-3', '2026-10-3');
    ctx.day = `2026-${i <= 28 ? '10' : '11'}-${String(i <= 28 ? i : i - 28).padStart(2, '0')}`;
    s.recordRun(run(100 + i, { daily: true }));
  }
  s.rollover(); ctx.day = '2027-01-01'; s.rollover();
  assert.ok(Object.keys(s.get().daily.log).length <= 30);
});

test('setHull only to unlocked hulls', () => {
  const { s } = mk(); s.load();
  assert.equal(s.setHull('kite'), false);
  s.unlockHull('kite');
  assert.equal(s.setHull('kite'), true);
  assert.equal(s.get().hull, 'kite');
});

test('F1: older build never overwrites a newer save', () => {
  const a = mk({ rules: 2 }); a.s.load(); a.s.recordRun(run(9000, { daily: true })); a.s.unlockMark('m');
  const before = a.m.get(SAVE_KEY);
  const b = mk({ map: a.m, rules: 1 }); b.s.load();
  assert.equal(b.s.get().best.dist, 9000);
  const r = b.s.recordRun(run(500, { daily: true }));
  assert.equal(r.saved, false);
  assert.equal(b.s.unlockMark('z'), false); assert.equal(b.s.noteZone(1, 0), false); assert.equal(b.s.addDailyRun(), false);
  assert.equal(a.m.get(SAVE_KEY), before);
  assert.equal(b.s.get().rulesVersion, 2);
});

test('F2: wrong-typed fields go to .bad / .bak, not silent coercion', () => {
  const a = mk(); a.s.load(); a.s.recordRun(run(500)); a.s.recordRun(run(600));
  const good = JSON.parse(a.m.get(SAVE_KEY));
  for (const mut of [o => { o.stats.runs = 'x'; }, o => { o.daily.best = 'NaN'; }, o => { o.best.dist = null; }, o => { o.marks = [1]; }, o => { o.hull = 5; }]) {
    const bad = JSON.parse(JSON.stringify(good)); mut(bad);
    const m = new Map([[SAVE_KEY, JSON.stringify(bad)], [BAK_KEY, JSON.stringify(good)]]);
    const b = mk({ map: m }); const res = b.s.load();
    assert.equal(res.toast, TOAST_RESET);
    assert.ok(m.has(BAD_KEY));
    assert.equal(b.s.get().best.dist, 600);
  }
});

test('F3: spec-shaped save (rules, zones object, zoneCount) loads and round-trips', () => {
  const spec = { v: 2, rules: 1, hull: 'kite', hulls: ['wren', 'kite'], best: { dist: 9125, hull: 'kite', zone: 0, lap: 1, seed: 'c91f3a', rules: 1 },
    bestByHull: { wren: 6020, kite: 9125 }, marks: ['first_light'], zones: { '0.0': 1, '1.0': 1 }, zoneCount: { 0: 9, 1: 8 },
    daily: { date: '2026-11-21', best: 3410, hull: 'kite', runs: 4, log: {} }, stats: { runs: 57, dist: 131204, wrecks: 88, night: 41, rock: 16, clean: 402, longestFlightS: 2.1 }, legacy: { best: 14, medal: 9 } };
  const m = new Map([[SAVE_KEY, JSON.stringify(spec)]]);
  const b = mk({ map: m }); const res = b.s.load();
  assert.equal(res.toast, ''); assert.equal(m.has(BAD_KEY), false);
  assert.equal(b.s.get().best.dist, 9125); assert.equal(b.s.get().zoneCount[1], 8);
  b.s.noteZone(1, 0);
  const out = JSON.parse(m.get(SAVE_KEY));
  assert.equal(out.rules, 1); assert.equal(out.rulesVersion, 1); assert.equal(out.zoneCount['1'], 9); assert.deepEqual(Object.keys(out.zones).sort(), ['0.0', '1.0']);
});
