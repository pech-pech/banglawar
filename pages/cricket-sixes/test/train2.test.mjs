import test from 'node:test'; import assert from 'node:assert/strict';
import { planOf, setPlan, netsPreview, runNets, endWeek, effortOdds, meanGain, EFFORTS, FOCUSES } from '../js/core/training.js';
import { game, P, K, me, makeRng } from './_tr2-fixture.mjs';

test('plan defaults and remembered last plan', () => {
  assert.deepEqual(planOf(game()), { focus: 'bat', effort: 'normal', spotlightId: null, coachId: null });
  const s = game({ plan: { focus: 'bowl', effort: 'push' } });
  assert.equal(planOf(s).focus, 'bowl'); assert.equal(planOf(s).effort, 'push');
  const t = setPlan(s, { effort: 'easy', spotlightId: 'p2' });
  assert.equal(planOf(t).effort, 'easy'); assert.equal(planOf(t).focus, 'bowl'); assert.equal(planOf(t).spotlightId, 'p2');
  assert.equal(planOf(s).effort, 'push', 'input not mutated');
  assert.equal(setPlan(s, { focus: 'nope' }), s); assert.equal(setPlan(s, { spotlightId: 'zz' }), s);
  assert.deepEqual(EFFORTS, ['easy', 'normal', 'push']); assert.deepEqual(FOCUSES, ['bat', 'bowl', 'bal']);
});

test('effort odds and means', () => {
  const m = (e) => meanGain(effortOdds(e));
  assert.ok(Math.abs(m('easy') - 1.22) < 1e-9 && Math.abs(m('normal') - 1.5) < 1e-9 && Math.abs(m('push') - 2) < 1e-9);
  const o = effortOdds('normal', 6); assert.deepEqual([o.okay, o.good, o.great], [54, 33, 13]);
  assert.ok(Math.abs(meanGain(effortOdds('normal', 0, true)) - 1.25) < 0.005);
});

test('all 8 train at effort cost; Run charges only trained', () => {
  const s = game({ plan: { focus: 'bat', effort: 'normal' } });
  const pv = netsPreview(s); assert.equal(pv.trainIds.length, 8); assert.equal(pv.cost, 104); assert.equal(pv.hint, null);
  const r = runNets(s, makeRng('a'), {}); assert.equal(r.cost, 104); assert.equal(r.state.training.tp, 450 - 104); assert.equal(r.lines.length, 8);
  for (const l of r.lines) { assert.ok(l.toRaw > l.fromRaw); assert.ok(['Okay', 'Good', 'Great'].includes(l.word)); assert.ok(['Power', 'Technique'].includes(l.stat)); }
  assert.equal(s.training.tp, 450);
  assert.equal(runNets(r.state, makeRng('a'), {}).state, r.state, 'one run a week');
});

test('focus rules: Batting rolls on lower of BP/BS, Bowling lower of SPD/BSK, Balanced lowest of four', () => {
  const pl = [P(1, { bp: 32, bs: 28, spd: 30, bsk: 20 }), ...[2, 3, 4, 5, 6, 7, 8].map((i) => P(i))];
  const go = (focus) => runNets(game({ players: pl, plan: { focus, effort: 'normal' } }), makeRng('f'), {}).lines.find((l) => l.id === 'p1').rating;
  assert.equal(go('bat'), 'bs'); assert.equal(go('bowl'), 'bsk'); assert.equal(go('bal'), 'bsk');
});

test('skip and do not charge a player with no legal gain; locked hint under 4', () => {
  const capped = (i) => P(i, { potential: 60 }); // cap sum low: 4*(1+40*98/180)=~91 ; ratings 30x4=120 -> no room
  const pl = [1, 2, 3, 4, 5, 6].map(capped).concat([P(7), P(8)]);
  const pv = netsPreview(game({ players: pl, plan: { focus: 'bat', effort: 'easy' } }));
  assert.equal(pv.skippedIds.length, 6); assert.equal(pv.trainIds.length, 2); assert.equal(pv.cost, 20);
  assert.match(pv.hint, /Only 2 can train\. Try Balanced or the other focus\./);
  const r = runNets(game({ players: pl, plan: { focus: 'bat', effort: 'easy' } }), makeRng('s'), {});
  assert.equal(r.cost, 20); assert.equal(r.skipped, 6);
  // balance rule: bat stats 15+ above his lowest are locked for Batting
  const lock = P(1, { bp: 50, bs: 50, spd: 30, bsk: 30 });
  assert.deepEqual(netsPreview(game({ players: [lock, ...[2, 3, 4, 5, 6, 7, 8].map((i) => P(i))], plan: { focus: 'bat', effort: 'easy' } })).skippedIds, ['p1']);
  assert.equal(netsPreview(game({ players: [lock, ...[2, 3, 4, 5, 6, 7, 8].map((i) => P(i))], plan: { focus: 'bal', effort: 'easy' } })).skippedIds.length, 0);
});

test('short of TP: Six first, Run never blocked', () => {
  const s = game({ tp: 50, plan: { focus: 'bat', effort: 'normal' } });
  const pv = netsPreview(s); assert.deepEqual(pv.trainIds, ['p1', 'p2', 'p3']); assert.deepEqual(pv.shortIds, ['p4', 'p5', 'p6', 'p7', 'p8']); assert.equal(pv.cost, 39);
  const r = runNets(s, makeRng('t'), {}); assert.equal(r.lines.length, 3); assert.equal(r.state.training.tp, 11);
  const z = runNets(game({ tp: 3 }), makeRng('t'), {}); assert.equal(z.lines.length, 0); assert.equal(z.cost, 0);
});

test('spotlight: wheel replaces the roll, same cost, wheelGain on the line, jackpot is a breakthrough', () => {
  const s = setPlan(game({ plan: { focus: 'bat', effort: 'normal' } }), { spotlightId: 'p3' });
  const r = runNets(s, makeRng('w'), { wheel: { index: 0, gain: 5, jackpot: true } });
  const l = r.lines.find((x) => x.id === 'p3'); assert.equal(l.wheelGain, 5); assert.equal(l.toRaw - l.fromRaw, 5); assert.equal(l.breakthrough, true); assert.equal(l.word, 'Great');
  assert.equal(r.cost, 104); assert.equal(r.lines.filter((x) => x.wheelGain !== undefined).length, 1);
  const cut = runNets(setPlan(game({ players: [P(1, { potential: 120 }), ...[2, 3, 4, 5, 6, 7, 8].map((i) => P(i))], plan: { focus: 'bat', effort: 'normal' } }), { spotlightId: 'p1' }), makeRng('w'), { wheel: { gain: 5, jackpot: true } });
  const c = cut.lines.find((x) => x.id === 'p1'); assert.ok(c.toRaw - c.fromRaw <= 5);
});

test('Great roll and letter step are breakthroughs; deterministic per seed; gains within 1..3', () => {
  const s = game({ plan: { focus: 'bat', effort: 'push' } });
  const a = runNets(s, makeRng('d'), {}), b = runNets(s, makeRng('d'), {}); assert.deepEqual(a.lines, b.lines);
  for (const l of a.lines) { const g = l.toRaw - l.fromRaw; assert.ok(g >= 1 && g <= 3); if (l.word === 'Great') assert.ok(l.breakthrough); }
  const edge = P(1, { bp: 26, bs: 26 }); // raw 26 -> 27 is E- to E
  const r = runNets(game({ players: [edge, ...[2, 3, 4, 5, 6, 7, 8].map((i) => P(i))], plan: { focus: 'bat', effort: 'easy' } }), { random: () => 0 }, {});
  assert.equal(r.lines[0].breakthrough, true);
});

test('long-run roll mix matches Normal 60/30/10', () => {
  const rng = makeRng('mix'); let ok = 0, good = 0, great = 0, n = 0;
  for (let k = 0; k < 400; k++) {
    const pl = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => P(i, { potential: 200 }));
    const r = runNets(game({ players: pl, plan: { focus: 'bat', effort: 'normal' } }), rng, {});
    for (const l of r.lines) { n++; if (l.word === 'Okay') ok++; else if (l.word === 'Good') good++; else great++; }
  }
  assert.ok(Math.abs(ok / n - 0.6) < 0.03 && Math.abs(good / n - 0.3) < 0.03 && Math.abs(great / n - 0.1) < 0.03);
});

test('endWeek remembers focus+effort, clears spotlight and week coach, week+1, grade reveal logged', () => {
  const pl = [P(1, { drillsHere: 0 }), ...[2, 3, 4, 5, 6, 7, 8].map((i) => P(i))];
  let s = setPlan(game({ players: pl, plan: null }), { focus: 'bowl', effort: 'easy', spotlightId: 'p2', coachId: 'k1' });
  const r = runNets(s, makeRng('e'), {});
  const e = endWeek(r.state);
  assert.equal(e.training.week, 2); assert.deepEqual(e.training.last_plan, { focus: 'bowl', effort: 'easy' }); assert.equal(e.training.lastPlan, undefined); assert.equal(e.training.sel, undefined);
  assert.deepEqual(planOf(e), { focus: 'bowl', effort: 'easy', spotlightId: null, coachId: null });
  assert.equal(e.training.weekSummary.reveals.length, 1); assert.equal(e.training.weekSummary.gains.length, 8);
  assert.equal(runNets(e, makeRng('e2'), {}).lines.length, 8, 'new week runs again');
});
