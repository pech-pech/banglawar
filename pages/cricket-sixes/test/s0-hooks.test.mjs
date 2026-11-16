// S0 seam Z3: event hooks (js/core/hooks.js) fired from training.js (netsRun, endWeek) and run.js (seasonClose).
import test from 'node:test';
import assert from 'node:assert/strict';
import { onHook, fireHook, clearHooks, HOOK_NAMES } from '../js/core/hooks.js';
import { runNets, endWeek } from '../js/core/training.js';
import { closeSeason } from '../js/core/run.js';
import { weekKey, weekKeyOf } from '../js/core/week-key.js';
import { game, makeRng } from './_tr2-fixture.mjs';
import { newGame, playSeason } from './_season-bot.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const counted = (seed) => { const r = makeRng(seed); const c = { draws: 0, random: () => { c.draws += 1; return r.random(); } }; return c; };

test('hooks: names, unknown name throws, unregister, order, errors are warned not thrown', (t) => {
  t.after(clearHooks);
  assert.deepEqual([...HOOK_NAMES], ['netsRun', 'matchEnd', 'endWeek', 'seasonClose']);
  assert.throws(() => onHook('nope', () => {}), /unknown hook/);
  const seen = [];
  const off = onHook('matchEnd', (n, info) => seen.push(['a', info.won]));
  onHook('matchEnd', () => { throw new Error('feature bug'); });
  onHook('matchEnd', (n) => { n.touched = true; seen.push(['c']); });
  const warn = console.warn; let warned = 0; console.warn = () => { warned += 1; };
  try {
    const d = {}; assert.equal(fireHook('matchEnd', d, { won: true }), d);
    assert.deepEqual(seen, [['a', true], ['c']]); assert.equal(d.touched, true); assert.equal(warned, 1);
  } finally { console.warn = warn; }
  off(); off();
  seen.length = 0; console.warn = () => {}; try { fireHook('matchEnd', {}, { won: false }); } finally { console.warn = warn; }
  assert.deepEqual(seen, [['c']]);
  clearHooks(); const d2 = {}; fireHook('matchEnd', d2, {}); assert.deepEqual(d2, {});
  assert.doesNotThrow(() => fireHook('unknown', {}, {}));
});

test('netsRun fires once with the draft (the returned state); no listener = identical result and rng draws', (t) => {
  t.after(clearHooks);
  const s = game({ plan: { focus: 'bat', effort: 'normal' } });
  const r0g = counted('h'), base = runNets(s, r0g, {});
  const calls = [];
  onHook('netsRun', (n, info) => { calls.push({ n, info }); });
  const r1g = counted('h'), r = runNets(s, r1g, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].n, r.state, 'listener got the draft that is returned');
  assert.notEqual(calls[0].n, s, 'not the input state');
  const info = calls[0].info;
  assert.deepEqual(info.trainIds, base.state.training.last.lines.map((l) => l.id));
  assert.equal(info.week, s.training.week); assert.equal(info.weekKey, weekKey(s));
  assert.deepEqual(info.plan, { focus: 'bat', effort: 'normal', coachId: null });
  assert.equal(typeof info.q, 'number'); assert.deepEqual(info.lines, r.lines);
  assert.ok(Array.isArray(info.shortIds) && Array.isArray(info.skippedIds));
  assert.deepEqual(r.state, base.state); assert.equal(r1g.draws, r0g.draws);
  clearHooks(); calls.length = 0;
  onHook('netsRun', (n) => { n.training.tp += 1; });
  assert.equal(runNets(s, makeRng('h'), {}).state.training.tp, base.state.training.tp + 1, 'draft mutation sticks');
  assert.equal(s.training.tp, 450, 'input untouched');
});

test('endWeek fires once with the draft', (t) => {
  t.after(clearHooks);
  const s = runNets(game(), makeRng('w'), {}).state;
  const base = endWeek(s), calls = [];
  onHook('endWeek', (n, info) => calls.push({ n, info }));
  const e = endWeek(s);
  assert.equal(calls.length, 1); assert.equal(calls[0].n, e); assert.equal(calls[0].info.week, s.training.week);
  assert.equal(calls[0].info.weekKey, weekKeyOf(s.season.n, s.training.week)); assert.equal(calls[0].info.weekKey, weekKey(s));
  assert.notEqual(weekKey(e), calls[0].info.weekKey, 'closing week, not the new one');
  assert.deepEqual(e, base);
});

test('seasonClose fires once in closeSeason with the draft; a closed season does not fire again', (t) => {
  t.after(clearHooks);
  const s = clone(playSeason(newGame('hk'))); s.run.last = null;
  const base = closeSeason(s), calls = [];
  onHook('seasonClose', (n, info) => calls.push({ n, info }));
  const c = closeSeason(s);
  assert.equal(calls.length, 1); assert.equal(calls[0].n, c); assert.equal(calls[0].info.season, s.season.n);
  assert.deepEqual(c, base);
  assert.equal(closeSeason(c), c); assert.equal(calls.length, 1);
});
