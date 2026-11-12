// P7+P11 bulk drills: Drill all (the Six), Repeat last week, Auto-train bench, and the season-2 bridge (no TP cost, x1.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, player, fixed, makeRng } from './_tr-fixture.mjs';
import { drillAll, repeatWeek, setAutoBench, autoBenchDrills, suggestedDrill, planDrill, planMode, bulkPlan, endWeek, sixOf, benchOf, setDrillPlan } from '../js/core/training.js';
import { applyCommand as C } from '../js/store/commands.js';

const ids = (n) => Array.from({ length: n }, (_, i) => 'p' + (i + 1));
const squad = (n = 8, o = {}) => ids(n).map((id, i) => player({ id, name: 'N' + i, ...o }));
const rngFor = () => fixed(0.5);           // 0.5 -> Good (+2)
const season = (s, n) => ({ ...s, season: { n, seed: 's' } });
const me = (s, id) => s.clubs[0].squad.find((p) => p.id === id);

test('suggested drill: lowest rating with room; tie goes to the tree focus, then drill order', () => {
  assert.equal(suggestedDrill(player({ bp: 40, bs: 30, spd: 35, bsk: 50 })), 'bs');
  assert.equal(suggestedDrill(player({ bat: 'Middle', bowl: 'Medium' })), 'bs');      // all 30: Middle = Technique -> Shot Selection
  assert.equal(suggestedDrill(player({ bat: 'Lower', bowl: 'Fast' })), 'bp');          // Lower = Power
  assert.equal(suggestedDrill(player({ bat: 'Lower', bowl: 'Fast', bp: 31, bs: 31, spd: 30, bsk: 31 })), 'spd');
  assert.equal(suggestedDrill(player({ potential: 20, bp: 4, bs: 4, spd: 4, bsk: 4 })), null);   // at peak: no room
});

test('Drill all: the Six only, one drill each, 15 TP each, bench untouched', () => {
  const s = game({ players: squad(8), tp: 240 });
  assert.deepEqual(sixOf(s), ids(6)); assert.deepEqual(benchOf(s), ['p7', 'p8']);
  const n = drillAll(s, 'suggested', rngFor);
  assert.equal(n.training.tp, 240 - 6 * 15);
  assert.deepEqual(Object.keys(n.training.drilled).sort(), ids(6));
  assert.equal(n.training.bulk.items.length, 6);
  assert.equal(me(n, 'p7').bs, 30);
  assert.equal(n.training.plan, 'suggested');
  assert.equal(drillAll(n, 'suggested', rngFor), n);        // nobody left: same state
});

test('Drill all keeps hand drills and stops when TP runs out', () => {
  let s = game({ players: squad(8), tp: 45 });
  s = { ...s, training: { ...s.training, drilled: { p1: true } } };
  const n = drillAll(s, 'suggested', rngFor);
  assert.equal(n.training.tp, 0);
  assert.deepEqual(Object.keys(n.training.drilled).sort(), ['p1', 'p2', 'p3', 'p4']);   // p1 by hand, 3 paid for
  assert.equal(bulkPlan(s, 'suggested', sixOf(s)).length, 3);
  assert.equal(drillAll(game({ players: squad(8), tp: 14 }), 'suggested', rngFor).training.tp, 14); // < 15 TP: no change
});

test('bulk run rolls the same as drilling by hand in the same order (seeded)', () => {
  const s0 = game({ players: squad(8), tp: 240 });
  const rng = (id) => makeRng('seed|' + id);
  const bulk = drillAll(s0, 'suggested', rng);
  let by = s0;
  for (const st of bulkPlan(s0, 'suggested', sixOf(s0))) by = applyHand(by, st, rng);
  for (const id of ids(8)) assert.deepEqual([me(bulk, id).bp, me(bulk, id).bs, me(bulk, id).spd, me(bulk, id).bsk], [me(by, id).bp, me(by, id).bs, me(by, id).spd, me(by, id).bsk]);
  assert.equal(bulk.training.tp, by.training.tp);
});
import { doDrill } from '../js/core/training.js';
const applyHand = (s, st, rng) => doDrill(s, { playerId: st.playerId, drillId: st.drillId }, rng(st.playerId));

test('Repeat last week: endWeek saves the plan; Repeat uses it; no drill or no room falls back to Suggested (fresh)', () => {
  let s = game({ players: squad(8), tp: 600 });
  assert.equal(repeatWeek(s, rngFor), s);                    // no last week yet
  assert.equal(planMode(s), 'suggested');
  // week 1: hand drills, p1 Power Hitting, p2 Pace Bowling
  s = doDrill(s, { playerId: 'p1', drillId: 'bp' }, fixed(0.5));
  s = doDrill(s, { playerId: 'p2', drillId: 'spd' }, fixed(0.5));
  s = endWeek(s);
  assert.deepEqual(s.training.lastPlan, { p1: 'bp', p2: 'spd' });
  assert.equal(planMode(s), 'repeat');
  assert.deepEqual(planDrill(s, me(s, 'p1'), 'repeat'), { drillId: 'bp', fresh: false });
  assert.deepEqual(planDrill(s, me(s, 'p3'), 'repeat'), { drillId: 'bs', fresh: true });    // no last drill: suggested, marked new
  const n = repeatWeek(s, rngFor);
  const log = n.training.weekLog.filter((e) => e.type === 'Drill');
  assert.equal(log.find((e) => e.playerId === 'p1').drillId, 'bp');
  assert.equal(log.find((e) => e.playerId === 'p2').drillId, 'spd');
  assert.equal(log.length, 6);
  assert.equal(n.training.plan, 'repeat');
  // a locked last drill falls back
  const full = { ...s, clubs: [{ ...s.clubs[0], squad: s.clubs[0].squad.map((p) => (p.id === 'p1' ? { ...p, bp: 60, bs: 30, spd: 30, bsk: 30 } : p)) }] };
  assert.deepEqual(planDrill(full, me(full, 'p1'), 'repeat'), { drillId: 'bs', fresh: true });
  // a skipped week keeps the older plan
  assert.deepEqual(endWeek(s).training.lastPlan, { p1: 'bp', p2: 'spd' });
  assert.equal(setDrillPlan(s, 'suggested').training.plan, 'suggested');
  assert.equal(setDrillPlan(s, 'nope'), s);
});

test('Auto-train bench: setting is kept; at End week bench players not drilled get Suggested while TP lasts', () => {
  const s0 = game({ players: squad(8), tp: 30 });
  assert.equal(autoBenchDrills(s0, rngFor), s0);             // off by default: nothing
  const s1 = setAutoBench(s0, true);
  assert.equal(s1.training.autoBench, true); assert.equal(setAutoBench(s1, true), s1);
  assert.equal(setAutoBench(s1).training.autoBench, false);  // flip
  const n = autoBenchDrills(s1, rngFor);
  assert.deepEqual(Object.keys(n.training.drilled).sort(), ['p7', 'p8']);
  assert.equal(n.training.tp, 0);
  assert.equal(me(n, 'p1').bs, 30);                          // the Six are not touched
  const hand = { ...s1, training: { ...s1.training, drilled: { p7: true } } };
  assert.deepEqual(Object.keys(autoBenchDrills(hand, rngFor).training.drilled).sort(), ['p7', 'p8']);
  assert.equal(autoBenchDrills({ ...s1, training: { ...s1.training, tp: 15 } }, rngFor).training.tp, 0);   // TP covers one only
  assert.equal(endWeek(n).training.autoBench, true);         // survives the week
});

test('season 2 bridge: Drill all costs no TP and rolls x1.1 (floor + chance of one more)', () => {
  const base = season(game({ players: squad(8), tp: 0 }), 2);
  const none = drillAll(base, 'suggested', () => fixed(0.5));          // 0.5 >= 0.1: one rep each
  assert.equal(none.training.tp, 0);                                    // no TP needed, none spent
  assert.deepEqual(Object.keys(none.training.drilled).sort(), ids(6));
  assert.equal(none.training.drillCount, 6);
  const extra = drillAll(base, 'suggested', () => fixed(0.05, 0.99));   // 0.05 < 0.1: the extra rep
  assert.equal(extra.training.tp, 0);
  assert.equal(extra.training.drillCount, 12);                          // 2 reps each
  assert.equal(extra.training.weekLog.filter((e) => e.type === 'Drill').length, 12);
  assert.equal(extra.training.bulk.items.length, 6);
  // season 1 for contrast: 0 TP means nothing happens
  const s1 = game({ players: squad(8), tp: 0 });
  assert.equal(drillAll(s1, 'suggested', rngFor), s1);
  // Auto-train bench is free in season 2 too
  const ab = autoBenchDrills(setAutoBench(base, true), () => fixed(0.5));
  assert.deepEqual(Object.keys(ab.training.drilled).sort(), ['p7', 'p8']); assert.equal(ab.training.tp, 0);
});

test('commands: DrillAll / RepeatWeek / AutoBench / SetDrillPlan / TipsSeen, only in the train stage', () => {
  let s = C(null, 'NewGame', { seed: 'p7' });
  assert.equal(C(s, 'DrillAll'), s);                         // not the train stage
  s = { ...s, stage: 'train' };
  const tp0 = s.training.tp;
  const d = C(s, 'DrillAll', { plan: 'suggested' });
  assert.equal(d.training.tp, tp0 - 6 * 15);
  assert.equal(Object.keys(d.training.drilled).length, 6);
  assert.equal(C(d, 'DrillAll', {}), d);
  assert.equal(C(s, 'RepeatWeek'), s);                       // no last week
  const w = C(C(s, 'DrillAll', { plan: 'suggested' }), 'EndWeek');
  assert.ok(w.training.lastPlan && Object.keys(w.training.lastPlan).length === 6);
  const r = C({ ...w, stage: 'train' }, 'RepeatWeek');
  assert.equal(Object.keys(r.training.drilled).length, 6);
  const ab = C(s, 'AutoBench', { on: true });
  assert.equal(ab.training.autoBench, true);
  const ew = C(ab, 'EndWeek');                               // auto bench drills ran at End week
  assert.equal(ew.training.weekSummary.gains.length > 0, true);
  assert.equal(ew.training.tp, tp0 - 4 * 15);
  assert.equal(C(s, 'SetDrillPlan', { plan: 'suggested' }).training.plan, 'suggested');
  assert.equal(C(s, 'TipsSeen').training.tipsSeen, true);
  // same command twice from the same state gives the same result (seeded)
  assert.deepEqual(C(s, 'DrillAll', { plan: 'suggested' }), C(s, 'DrillAll', { plan: 'suggested' }));
});

test('commands: season 2 DrillAll through the store spends no TP', () => {
  let s = C(null, 'NewGame', { seed: 'p7b' });
  s = { ...s, stage: 'train', season: { ...s.season, n: 2 }, training: { ...s.training, tp: 5 } };
  const d = C(s, 'DrillAll', { plan: 'suggested' });
  assert.equal(d.training.tp, 5);
  assert.equal(Object.keys(d.training.drilled).length, 6);
  assert.ok(d.training.drillCount >= 6);
  const ew = C(C(s, 'AutoBench', { on: true }), 'EndWeek');
  assert.equal(ew.training.tp, 5);
});
