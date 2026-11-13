import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import * as sel from '../js/store/selectors.js';
import * as X from '../js/core/economy.js';
import { planOf, canCourse } from '../js/core/training.js';
import { newGame, step } from './_season-bot.mjs';

const untilTrain = (seed) => { const st = newGame(seed); let g = 0; while (st.get().stage !== 'train' && g++ < 3000 && step(st)); return st.get(); };
const withSinks = (s, sinks, medals = 20) => ({ ...s, econ: { ...s.econ, medals, coins: 100000, sinks: { ...s.econ.sinks, ...sinks } } });

test('Medal shop: new names, plain words, prices kept, no rating digits', () => {
  const shop = X.medalShop({ season: { n: 1, league: 1 }, clubs: [{ squad: [] }], econ: X.newEconomy() });
  const t = shop.find((m) => m.id === 'twin_drill'), l = shop.find((m) => m.id === 'master_licence');
  assert.match(t.name, /^Twin Spotlight Pass/); assert.equal(t.medals, 2);
  assert.match(l.name, /^Master Coach Licence/); assert.equal(l.medals, 6);
  assert.doesNotMatch(t.name + l.name, /level|[0-9]/i);
});

test('Twin Spotlight Pass: buy adds one held pass; two buys hold two; old saves keep theirs', () => {
  let s = untilTrain('tw0'); s = withSinks(s, {});
  s = X.buyMedal(s, 'twin_drill'); s = X.buyMedal(s, 'twin_drill'); assert.equal(s.econ.sinks.twin_drill, 2);
  assert.equal(sel.trainingVM(withSinks(s, { twin_drill: 1 })).twin.held, 1);
});

test('Twin pass: second spotlight needs a pass, the first player, and a different player', () => {
  const s0 = untilTrain('tw1'), [a, b] = s0.clubs[0].squad.map((p) => p.id);
  let s = C(s0, 'SetTrainPlan', { spotlightId: a });
  assert.equal(C(s, 'SetTrainPlan', { spotlight2Id: b }), s, 'no pass, no second');
  assert.equal(sel.trainingVM(s).twin.line, '');
  s = withSinks(s, { twin_drill: 1 });
  assert.equal(sel.trainingVM(s).twin.line, 'Twin Spotlight Pass: pick 2');
  const t = C(s, 'SetTrainPlan', { spotlight2Id: b }); assert.equal(planOf(t).spotlight2Id, b);
  assert.equal(planOf(C(t, 'SetTrainPlan', { spotlight2Id: a })).spotlight2Id, undefined, 'same player is not a second one');
  assert.equal(planOf(C(t, 'SetTrainPlan', { spotlightId: null })).spotlight2Id, undefined, 'dropping the first drops the second');
});

test('Twin pass: two separate spins, each replaces that player\'s roll, pass used up on the run', () => {
  const s0 = untilTrain('tw2'), [a, b] = s0.clubs[0].squad.map((p) => p.id);
  let s = withSinks(C(s0, 'SetTrainPlan', { spotlightId: a }), { twin_drill: 2 });
  s = C(s, 'SetTrainPlan', { spotlight2Id: b });
  const one = C(s, 'Spin', { careful: true }); assert.ok(one.training.pending);
  assert.equal(C(one, 'Spin', { slot: 2 }).training.pending2 !== undefined, true);
  const two = C(one, 'Spin', { careful: false, slot: 2 }); assert.ok(two.training.pending2);
  assert.equal(C(two, 'Spin', { slot: 2 }), two, 'one spin each');
  const r = C(two, 'RunNets');
  const la = r.training.nets.lines.find((l) => l.id === a), lb = r.training.nets.lines.find((l) => l.id === b);
  if (la) assert.equal(la.wheelGain, two.training.pending.result.gain);
  assert.ok(lb, 'second player trained'); assert.equal(lb.wheelGain, two.training.pending2.result.gain);
  assert.equal(r.econ.sinks.twin_drill, 1, 'one pass used, one kept');
  assert.equal(r.training.pending2, undefined);
  const e = C(r, 'EndWeek'); assert.equal(planOf(e).spotlight2Id, undefined);
});

test('Twin pass: a run without a second player keeps the pass', () => {
  const s0 = untilTrain('tw3'), a = s0.clubs[0].squad[0].id;
  const s = withSinks(C(s0, 'SetTrainPlan', { spotlightId: a }), { twin_drill: 1 });
  assert.equal(C(C(s, 'Spin', {}), 'RunNets').econ.sinks.twin_drill, 1);
});

test('Master Coach Licence: buy, then one coach may take a 2nd course; consumed on the run', () => {
  const s0 = untilTrain('ml1'); let s = withSinks(s0, {});
  s = X.buyMedal(s, 'master_licence'); assert.equal(s.econ.sinks.master_licence, 1);
  const id = s.coaches[0].id, course = (x) => C(C(x, 'CourseSpin', { coachId: id, careful: true }), 'RunCourse', { coachId: id });
  const first = course(s); assert.equal(first.econ.sinks.master_licence, 1, '1st course is free of the Licence');
  const away = { ...first, coaches: first.coaches.map((c) => ({ ...c, away: 0 })) };
  assert.equal(canCourse(away, id).ok, true, 'Licence allows a 2nd');
  assert.equal(sel.coachesVM(away).licence.line, 'Licence: 2nd course allowed');
  const second = course(away); assert.ok(second.coaches[0].step > away.coaches[0].step);
  assert.equal(second.econ.sinks.master_licence, 0);
  const again = { ...second, coaches: second.coaches.map((c) => ({ ...c, away: 0 })) };
  assert.equal(canCourse(again, id).ok, false, 'Licence used up');
  assert.equal(sel.coachesVM(again).licence.line, '');
});

test('Master Coach Licence: one 2nd course per licence even with two held', () => {
  const s0 = withSinks(untilTrain('ml2'), { master_licence: 2 }), id = s0.coaches[0].id;
  const course = (x) => C(C(x, 'CourseSpin', { coachId: id, careful: true }), 'RunCourse', { coachId: id });
  let s = course(s0); s = { ...s, coaches: s.coaches.map((c) => ({ ...c, away: 0 })) }; s = course(s);
  s = { ...s, coaches: s.coaches.map((c) => ({ ...c, away: 0 })) };
  assert.equal(canCourse(s, id).ok, false, 'a 3rd course in one season is not allowed');
});

test('no licence: 2nd course stays blocked', () => {
  const s0 = untilTrain('ml3'), id = s0.coaches[0].id;
  let s = C(C(s0, 'CourseSpin', { coachId: id, careful: true }), 'RunCourse', { coachId: id });
  s = { ...s, coaches: s.coaches.map((c) => ({ ...c, away: 0 })) };
  assert.deepEqual(canCourse(s, id), { ok: false, why: 'season' });
});
