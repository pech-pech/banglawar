import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS } from '../js/data/flags.js';
import { MD } from '../js/data/matchday.js';
import { ballProbs, outcomeFromX, newInnings, playOver, eligibleBowlers } from '../js/core/match.js';
import { rollMatchday, hypeOdds, teamBoost, roarAt, scaleRatings, roarChance } from '../js/core/matchday.js';
import { makeRng } from '../js/core/rng.js';
import { makeStartState } from '../js/data/m0-fixture.js';

const V = JSON.parse(readFileSync(new URL('./ball-vectors.json', import.meta.url), 'utf8')).vectors;
const withFlags = (f, fn) => { const old = { ...FLAGS }; Object.assign(FLAGS, f); try { return fn(); } finally { Object.assign(FLAGS, old); } };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('flags exist and default off', () => {
  for (const k of ['matchday', 'settled', 'roar', 'activities', 'freePick']) assert.equal(FLAGS[k], false, k);
});

test('11a: 500 vectors unchanged with all flags off, and with an extra faced arg', () => {
  for (const v of V) {
    const b = { bat: v.bat.type, bp: v.bat.bp, bs: v.bat.bs }, w = { bowl: v.bowl.type, spd: v.bowl.spd, bsk: v.bowl.bsk };
    const r = ballProbs(b, w, v.phase, v.intent, v.field, undefined, v.over, v.wk_lost, v.centre, 0, 17);
    for (const k of ['wicket', 'six', 'four', 'two', 'single']) near(r.p[k], v.p[k]);
    assert.equal('settled' in r, false);
    assert.equal(String(outcomeFromX(r.p, r.singleRaw, v.x)), String(v.outcome));
  }
});

test('11b: settled at balls 0, 12, 25, 40 (K 0.42); freed probability falls to dots', () => {
  const b = { bat: 'Middle', bp: 55, bs: 60 }, w = { bowl: 'Medium', spd: 50, bsk: 45 };
  const base = ballProbs(b, w, 1, 'R', 'N', undefined, 4, 0, 50, 0, 0);
  withFlags({ settled: true }, () => {
    for (const [n, s] of [[0, 0], [12, 12 / 25], [25, 1], [40, 1]]) {
      const r = ballProbs(b, w, 1, 'R', 'N', undefined, 4, 0, 50, 0, n);
      near(r.settled, s); near(r.p.wicket, base.p.wicket * (1 - 0.42 * s));
      near(r.p.six, base.p.six); near(r.p.single, base.p.single);
      near(r.dot - base.dot, base.p.wicket - r.p.wicket);
    }
  });
});

test('11b: scale 1.2128 caps at 99', () => {
  const q = scaleRatings({ bp: 50, bs: 90, spd: 99, bsk: 10, id: 'x' }, 0.2128);
  near(q.bp, 60.64); assert.equal(q.bs, 99); assert.equal(q.spd, 99); near(q.bsk, 12.128); assert.equal(q.id, 'x');
  const p = { bp: 50, bs: 50, spd: 50, bsk: 50 }; scaleRatings(p, 0.5); assert.equal(p.bp, 50, 'copy only');
});

test('11c: hype odds sum 100, never negative, for t in [0, .2]', () => {
  for (let fans = 0; fans <= 6000; fans += 250) for (const a of [0, .03, .08, .2]) {
    const { odds, t } = hypeOdds(fans, [a, a, a]);
    near(odds.reduce((x, y) => x + y, 0), 100, 1e-9); assert.ok(odds.every((o) => o >= 0)); assert.ok(t <= 0.2 + 1e-12);
  }
  const o0 = hypeOdds(0, []).odds; assert.deepEqual(o0.map(Math.round), [35, 35, 20, 10]);
  near(hypeOdds(4000, [{ tilt: .08 }, { tilt: .08 }]).t, 0.12 + 0.08 + 0.04 > .2 ? 0.2 : 0.24);
  const o = hypeOdds(0, [0.2]).odds; near(o[0], 35 - 80 * .15 > 0 ? 23 : 0, 1e-9); // activity capped at .15
});

test('roar chance and boost stack', () => {
  near(roarChance(0), .05); near(roarChance(1140), 0.05 + 0.25 * 1140 / 4000); near(roarChance(9999), .30);
  near(teamBoost({ hype: 'nuts', toss: 'won', pepId: 'a', roar: [] }, 'a'), 1.1 * 1.05 * 1.05 - 1);
  near(teamBoost({ hype: 'nuts', toss: 'won', pepId: 'a' }, 'b'), 1.1 * 1.05 - 1);
  near(teamBoost({ hype: 'low', toss: 'lost', pepId: null }, 'b'), .02); assert.equal(teamBoost(null, 'a'), 0);
});

test('11d: same seed same rolls; ball rng untouched; different seed differs somewhere', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const a = rollMatchday('s1', { fans: 800, sixIds: ids }), b = rollMatchday('s1', { fans: 800, sixIds: ids });
  assert.deepEqual(a, b);
  assert.equal(a.roar.length, 20); assert.ok(['low', 'med', 'high', 'nuts'].includes(a.hype)); assert.ok(ids.includes(a.pepId));
  assert.equal(a.pepId, ids[a.pepSlot - 1]);
  const seen = new Set(); for (let i = 0; i < 60; i++) { const m = rollMatchday('k' + i, { fans: 0 }); seen.add(m.hype + m.toss + m.pepSlot); assert.equal(m.pepId, null); }
  assert.ok(seen.size > 10);
  const r1 = makeRng('ball'); const x1 = r1.random(); rollMatchday('ball', { fans: 5 }); const r2 = makeRng('ball'); assert.equal(r2.random(), x1);
  assert.equal(roarAt(a, 3), a.roar[3]); assert.equal(roarAt(null, 3), false);
});

function inningsPlay(seed, flags, opts) {
  return withFlags(flags, () => {
    const rng = makeRng(seed); const { me, rival } = makeStartState(makeRng(seed + '|t'));
    const bat = rival.players, bowl = me.players; const inn = newInnings(bat, bowl, null); let last = null;
    while (!inn.done) { const el = eligibleBowlers(bowl, inn.over, last); const bi = el[0]; last = bi; playOver(rng, inn, bat, bowl, bi, 'R', 'A', undefined, 50, false, opts); }
    return inn;
  });
}

test('flags off: opts and extra fields change nothing; no report fields appear', () => {
  const md = rollMatchday('z', { fans: 4000 });
  const a = inningsPlay('f1', {}, undefined), b = inningsPlay('f1', {}, { ours: 'bowl', md });
  assert.deepEqual(a, b); assert.equal(a.wkLog, undefined); assert.equal(a.roarOvers, undefined);
});

test('settled on: wkLog entries and ball faced; roar on: roarOvers + over.roar, our bowler scaled', () => {
  const md = { ...rollMatchday('z', { fans: 4000 }), roar: Array(20).fill(true) };
  const inn = inningsPlay('f2', { settled: true, roar: true }, { ours: 'bowl', md });
  assert.deepEqual(inn.roarOvers, inn.overs.map((_, i) => i + 1)); assert.ok(inn.overs.every((o) => o.roar));
  assert.ok(inn.wkLog.length === inn.wk && inn.wkLog.every((e) => e.side === 'rival' && e.settled >= 0 && e.settled <= 1 && Number.isInteger(e.balls)));
  assert.ok(inn.overs[0].balls.every((b) => typeof b.faced === 'number' && b.pr.settled !== undefined));
  const inn2 = inningsPlay('f2', { roar: true }, { ours: 'bowl', md: { ...md, roar: Array(20).fill(false) } });
  assert.equal(inn2.roarOvers, undefined);
  // chase innings reads overs 10-19
  const mdc = { ...md, roar: [...Array(10).fill(false), ...Array(10).fill(true)] };
  assert.equal(inningsPlay('f3', { roar: true }, { ours: 'bowl', md: mdc }).roarOvers, undefined);
  assert.ok(inningsPlay('f3', { roar: true }, { ours: 'bowl', md: mdc, innIdx: 1 }).roarOvers.length > 0);
});

test('11f: bot sweep, settled is win-neutral and lowers all-outs; full boost design lifts our win rate', () => {
  const N = 1500;
  function sweep(flags, boost) {
    return withFlags(flags, () => {
      let win = 0, allOut = 0, runs = 0, inns = 0;
      for (let k = 0; k < N; k++) {
        const seed = `sw${k}`; const { me, rival } = makeStartState(makeRng(seed + '|t'));
        let mine = me.players;
        if (boost) { const md = rollMatchday(seed, { fans: 310, actLedger: [], sixIds: me.players.map((p) => p.id) }); mine = me.players.map((p) => scaleRatings(p, teamBoost(md, p.id))); }
        const rng = makeRng(seed);
        const i1 = newInnings(rival.players, mine, null); let last = null;
        while (!i1.done) { const el = eligibleBowlers(mine, i1.over, last); last = el[0]; playOver(rng, i1, rival.players, mine, el[0], 'R', 'A'); }
        const i2 = newInnings(mine, rival.players, i1.runs); last = null;
        while (!i2.done) { const el = eligibleBowlers(rival.players, i2.over, last); last = el[0]; playOver(rng, i2, mine, rival.players, el[0], 'R', 'A'); }
        if (i2.runs > i1.runs) win++;
        for (const i of [i1, i2]) { inns++; runs += i.runs; if (i.wk >= 5) allOut++; }
      }
      return { win: win / N, allOut: allOut / inns, runs: runs / inns };
    });
  }
  const base = sweep({}, false), set = sweep({ settled: true }, false), full = sweep({ settled: true }, true);
  console.log('sweep', JSON.stringify({ base, set, full }));
  assert.ok(set.allOut < base.allOut, 'settled cuts all-outs');
  assert.ok(Math.abs(set.win - base.win) < 0.04, 'settled is about win-neutral');
  assert.ok(set.runs > base.runs);
  assert.ok(full.win - base.win > 0.03, 'boosts lift the win rate');
});
