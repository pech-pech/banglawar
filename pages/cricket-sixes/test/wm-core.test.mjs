import test from 'node:test'; import assert from 'node:assert/strict';
import { FLAGS } from '../js/data/flags.js';
import { WM, NODES } from '../js/data/wheelmeta.js';
import { makeRng } from '../js/core/rng.js';
import { wheelSlices, courseWheel, spinResult, wheelArc } from '../js/core/training.js';
import { metaOf, rankOf, tierOf, tierNow, recordSpin, canBuy, buyNode, effective, metaWheel, afterResult, seasonTokens, tokenOptions, useToken, powerDone, swapSpokes, nextTierUp, dismissTierUp, metaReport } from '../js/core/wheelmeta.js';

const fresh = () => ({ v: 7, seed: 'wm', season: { n: 1 }, wheelMeta: { tally: 0, spokes: 0, spent: 0, owned: {}, tokens: { respin: 0, nudge: 0, two: 0, wild: 0, lift: 0 }, tokSeason: 0, spotTokensUsed: 0, streak: 0, tierSeen: 0, tierUpQueue: [], swapDone: {} }, wheelCraft: { owned: {} }, econ: { coins: 100, ledger: [] } });
const withMeta = (f, o = {}) => { const s = fresh(); Object.assign(s.wheelMeta, o); return s; };
const full = () => { const s = fresh(); for (const n of NODES) { if (n.branch === 'craft') s.wheelCraft.owned[n.id] = n.max_rank; else s.wheelMeta.owned[n.id] = n.max_rank; } s.wheelMeta.tally = 600; return s; };
const on = (f) => { FLAGS.wheelMeta = true; try { return f(); } finally { FLAGS.wheelMeta = false; } };

test('data: 42 nodes, 71 ranks, 3340 Spokes, ids unique', () => {
  assert.equal(NODES.length, 42); assert.equal(NODES.reduce((a, n) => a + n.max_rank, 0), 71);
  assert.equal(NODES.reduce((a, n) => a + n.cost.reduce((x, y) => x + y, 0), 0), 3340); assert.equal(new Set(NODES.map((n) => n.id)).size, 42);
  assert.ok(NODES.every((n) => n.words && n.cost.length === n.max_rank));
});

test('flag off: everything neutral and the input is returned', () => {
  const s = fresh(), w = wheelSlices('normal');
  assert.equal(recordSpin(s, 'spot'), s); assert.equal(metaWheel(w, 'spot', s), w); assert.equal(buyNode(s, 'c_slow'), s);
  assert.equal(canBuy(s, 'c_slow').reason, 'off'); assert.equal(effective(full()).spot.goldAdd, 0); assert.equal(seasonTokens(s), s);
  const r = { index: 1, gain: 2, jackpot: false }; assert.equal(afterResult(s, 'spot', r, makeRng('x')).result, r);
});

test('tiers and Spokes per spin (base + tier reached), twin counts 2, sport slice +1, tier-up queue', () => on(() => {
  assert.deepEqual([9, 10, 24, 25, 49, 50, 99, 100, 199, 200, 349, 350, 499, 500].map(tierOf), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7]);
  let s = recordSpin(fresh(), 'spot'); assert.equal(metaOf(s).spokes, 3); assert.equal(metaOf(s).tally, 1);
  s = recordSpin(fresh(), 'course', { count: 2 }); assert.equal(metaOf(s).spokes, 10); assert.equal(metaOf(s).tally, 2);
  s = recordSpin(fresh(), 'toss', { sportSlice: true }); assert.equal(metaOf(s).spokes, 2);
  s = recordSpin(withMeta(0, { tally: 9 }), 'spot'); assert.equal(metaOf(s).spokes, 3); assert.equal(tierNow(s), 1); assert.equal(nextTierUp(s), 1);
  s = recordSpin(s, 'spot'); assert.equal(metaOf(s).spokes, 3 + 4); // tier 1 now: 3 + 1
  assert.equal(metaOf(recordSpin(withMeta(0, { tally: 9 }), 'hype', { count: 20 })).tierUpQueue.join(), '1,2'); // 9 -> 29: tiers 1 and 2
  s = dismissTierUp(s); assert.equal(nextTierUp(s), null); assert.equal(metaOf(s).tierSeen, 1);
  const f = fresh(); const t = recordSpin(f, 'spot'); assert.equal(f.wheelMeta.tally, 0, 'input never mutated'); assert.notEqual(t, f);
}));

test('buy rules: tier gate per rank, requires, cost, spokes, max, craft carry', () => on(() => {
  let s = withMeta(0, { spokes: 500, tally: 10 }); // tier 1
  assert.deepEqual(canBuy(s, 'c_slow'), { ok: true, reason: '', cost: 10, need: 10, have: 500 });
  assert.equal(canBuy(s, 'f_wide').reason, 'locked'); assert.equal(canBuy(s, 'f_wide').need, 2);
  assert.equal(canBuy(s, 'c_slow').cost, 10);
  s = buyNode(s, 'c_slow'); assert.equal(rankOf(s, 'c_slow'), 1); assert.equal(metaOf(s).spokes, 490); assert.equal(metaOf(s).spent, 10);
  assert.equal(canBuy(s, 'c_slow').reason, 'locked', 'rank 2 opens at tier 2'); assert.equal(canBuy(s, 'c_slow').need, 2);
  s.wheelMeta.tally = 25; assert.equal(canBuy(s, 'c_slow').cost, 25); s = buyNode(s, 'c_slow');
  s.wheelMeta.tally = 49; assert.equal(canBuy(s, 'c_slow').reason, 'locked'); s.wheelMeta.tally = 50; s = buyNode(s, 'c_slow');
  assert.equal(canBuy(s, 'c_slow').reason, 'max'); assert.equal(buyNode(s, 'c_slow'), s);
  s.wheelMeta.tally = 100; assert.equal(canBuy(s, 'f_bigb').reason, 'needs'); assert.equal(canBuy(s, 'f_bigb').need, 'f_boost');
  s = buyNode(s, 'f_boost'); assert.equal(canBuy(s, 'f_bigb').ok, true);
  const poor = withMeta(0, { spokes: 12, tally: 50 }); const c = canBuy(poor, 'c_guide'); assert.equal(c.reason, 'locked');
  poor.wheelMeta.tally = 350; const c2 = canBuy(poor, 'c_guide'); assert.equal(c2.reason, 'spokes'); assert.equal(c2.need, 130); assert.equal(c2.have, 12);
  // craft goes to wheelCraft and counts as owned; carried ranks are never re-bought
  let k = withMeta(0, { spokes: 100, tally: 10 }); k = buyNode(k, 'k_rim'); assert.equal(k.wheelCraft.owned.k_rim, 1); assert.equal(metaOf(k).owned.k_rim, undefined); assert.equal(rankOf(k, 'k_rim'), 1);
  const carried = { ...fresh(), wheelCraft: { owned: { k_rim: 3 } } }; assert.equal(canBuy({ ...carried, wheelMeta: { ...carried.wheelMeta, spokes: 99, tally: 99 } }, 'k_rim').reason, 'max');
}));

test('tree effects ported: Slow, Steady, Guide, gold width, extra gold, floor', () => on(() => {
  const s = full(), E = effective(s);
  assert.ok(Math.abs(E.spot.w0Mult - 0.55) < 1e-9); assert.ok(Math.abs(E.spot.jMult - 0.7) < 1e-9); assert.equal(E.spot.guide, true);
  assert.ok(Math.abs(E.spot.goldAdd - (0.06 + 0.04)) < 1e-9); assert.ok(Math.abs(E.course.goldAdd - 0.10) < 1e-9);
  assert.equal(E.spot.extraGold, 1); assert.equal(E.toss.extraGold, 0); assert.equal(E.spot.floor, 1); assert.equal(E.pep.neighbourMult, 1.5); assert.equal(E.finals.neighbourMult, 1.5);
  assert.ok(Math.abs(E.spot.booster.chance - 0.6) < 1e-9); assert.equal(E.spot.booster.count, 3); assert.equal(E.pep.booster.value, 1.5);
  assert.deepEqual(E.tokens, { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 });
  const w = metaWheel(wheelSlices('normal'), 'spot', s);
  assert.equal(w.slices.length, 11); assert.deepEqual(w.golds, [0, 4]); assert.equal(w.slices[4], 5);
  assert.ok(Math.abs(w.widths[0] - 0.45) < 1e-9); assert.ok(Math.abs(w.widths[4] - 0.45 * 0.75) < 1e-9);
  assert.ok(w.slices.every((v, i) => v >= 2 || w.golds.includes(i)), 'floor: no 1s left'); assert.ok(Math.abs(w.phys.SD - 0.11 * 0.727) < 1e-9);
  assert.ok(Math.abs(w.phys.W0 - 13.2) < 1e-9); assert.ok(Math.abs(w.phys.J - 0.42) < 1e-9);
  const n = metaWheel(wheelSlices('normal'), 'spot', fresh()); assert.deepEqual(n.slices, wheelSlices('normal').slices); assert.ok(n.phys);
}));

test('physics reads wheel.phys; without it the old numbers hold', () => {
  const w = wheelSlices('normal'), a = spinResult(makeRng('p'), w, true), b = spinResult(makeRng('p'), { ...w, phys: { W0: 24, J: 0.6, SD: 0.11 } }, true);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(wheelArc(2, { W0: 12 }) - wheelArc(2) / 2) < 1e-9);
  const slow = spinResult(makeRng('p'), { ...w, phys: { W0: 12, J: 0.6, SD: 0.11 } }, { t: 3, phi: 0, e: 0 }), norm = spinResult(makeRng('p'), w, { t: 3, phi: 0, e: 0 });
  assert.notEqual(slow.index === norm.index && slow.t === norm.t && JSON.stringify(slow) === JSON.stringify(norm), 'x');
});

// A season of tokens the way the sim spends them (spin_full): Pick Two is committed blind on a season's first Spotlight (every Course spin),
// then Spin Again / Wild (else Nudge) below the sim's limit, Lift on the last two Spotlights. Wild only stands in as Spin Again, as in the sim.
function play(s, id, n, seed) {
  const rng = makeRng(seed); const wheel = metaWheel(id === 'spot' ? wheelSlices('normal') : courseWheel(), id, s); let tot = 0, gold = 0;
  const burn = (k) => { s = JSON.parse(JSON.stringify(s)); s.wheelMeta.tokens[k]--; if (id === 'spot') s.wheelMeta.spotTokensUsed++; };
  for (let i = 0; i < n; i++) {
    if (i % 10 === 0) { s = JSON.parse(JSON.stringify(s)); s.season.n = 1 + i / 10; s = seasonTokens(s); }
    const raw = spinResult(rng, wheel, true), a = afterResult(s, id, raw, rng, { wheel }); s = a.s; let p = { ...a.result, wheel };
    const use = (k) => { const q = useToken(s, id, k, p, rng); s = q.s; p = q.pending; };
    const can = (k) => tokenOptions(s, id, p).some((o) => o.kind === k), tk = () => metaOf(s).tokens, capOk = () => id !== 'spot' || metaOf(s).spotTokensUsed < WM.SPOT_TOKEN_CAP;
    if ((id === 'spot' ? i % 10 === 0 : true) && tk().two > 0 && capOk()) { if (can('two')) use('two'); else burn('two'); }
    if (p.gain < WM.RESPIN_BELOW[id]) { if (tk().respin > 0 || tk().wild > 0) { if (can('respin')) use('respin'); } else if (can('nudge')) use('nudge'); }
    if ((id === 'course' || i % 10 >= 8) && tk().lift > 0 && can('lift')) use('lift');
    tot += p.gain; gold += p.jackpot ? 1 : 0;
  }
  return { mean: tot / n, gold: gold / n };
}

test('PARITY: full tree Spotlight average careful = 2.57x +-0.05 (sim); no tree 1.56x', () => on(() => {
  const f = play(full(), 'spot', 7000, 'par-a'), z = play(fresh(), 'spot', 7000, 'par-b');
  console.log('parity spot full', (f.mean / 1.5).toFixed(3), 'gold', f.gold.toFixed(3), '| none', (z.mean / 1.5).toFixed(3), z.gold.toFixed(3));
  assert.ok(Math.abs(f.mean / 1.5 - 2.57) <= 0.05, `full ${f.mean / 1.5}`); assert.ok(Math.abs(z.mean / 1.5 - 1.56) <= 0.05, `none ${z.mean / 1.5}`);
}));

test('PARITY: full tree Course gold 70% +-3 (sim), none about 23%', () => on(() => {
  const f = play(full(), 'course', 6000, 'par-c'), z = play(fresh(), 'course', 6000, 'par-d');
  console.log('parity course full gold', f.gold.toFixed(3), 'steps', f.mean.toFixed(3), '| none', z.gold.toFixed(3), z.mean.toFixed(3));
  assert.ok(Math.abs(f.gold * 100 - 70) <= 3, `gold ${f.gold}`); assert.ok(Math.abs(z.gold * 100 - 22.9) <= 3);
}));

test('tokens: refill from ranks, Spotlight cap 2, Course no cap, guards, Wild, nudge never onto gold, lift never above gold', () => on(() => {
  let s = full(); s = seasonTokens(s); assert.deepEqual(metaOf(s).tokens, { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 }); assert.equal(seasonTokens(s), s, 'once a season');
  const w = metaWheel(wheelSlices('normal'), 'spot', s), pend = { index: 2, gain: 1, jackpot: false, wheel: w, streak0: 0 };
  assert.deepEqual(tokenOptions(s, 'spot', pend).map((o) => o.kind), ['respin', 'two', 'nudge', 'lift']);
  assert.equal(tokenOptions(s, 'hype', pend).length, 0); assert.equal(tokenOptions(s, 'toss', pend).length, 0);
  assert.equal(tokenOptions(s, 'spot', { ...pend, index: 0, jackpot: true }).length, 0, 'no tool on gold');
  const rng = makeRng('tk'); let r = useToken(s, 'spot', 'respin', pend, rng); assert.equal(metaOf(r.s).tokens.respin, 2); assert.equal(metaOf(r.s).spotTokensUsed, 1); assert.ok(r.pending.gain >= pend.gain);
  r = useToken(r.s, 'spot', 'respin', { ...pend, gain: 1 }, rng); assert.equal(metaOf(r.s).spotTokensUsed, 2);
  assert.equal(tokenOptions(r.s, 'spot', pend).length, 0, 'cap of 2 a Spotlight season'); const same = useToken(r.s, 'spot', 'respin', pend, rng); assert.equal(same.s, r.s);
  assert.ok(tokenOptions(r.s, 'course', { index: 1, gain: 1, jackpot: false, wheel: metaWheel(courseWheel(), 'course', r.s) }).length > 0, 'Course has no cap');
  const s2 = seasonTokens({ ...r.s, season: { n: 2 } }); assert.equal(metaOf(s2).spotTokensUsed, 0);
  // Wild stands in; nudge target never gold; lift capped at gold
  let t = fresh(); t.wheelMeta.tokens.wild = 1; t.wheelMeta.tally = 600; const pw = { index: 2, gain: 1, jackpot: false, wheel: wheelSlices('normal') };
  t = { ...t, wheelMeta: t.wheelMeta }; assert.deepEqual(tokenOptions(t, 'spot', pw).map((o) => o.label), ['Spin Again (Wild)', 'Pick Two (Wild)', 'Nudge (Wild)', 'Lucky Lift (Wild)']);
  const pn = { index: 2, gain: 1, jackpot: false, wheel: wheelSlices('normal') }, nd = useToken(t, 'spot', 'nudge', pn, rng); assert.equal(nd.pending.index, 3); assert.equal(nd.pending.gain, 3); assert.equal(nd.s.wheelMeta.tokens.wild, 0);
  assert.equal(useToken(t, 'spot', 'nudge', { index: 1, gain: 2, jackpot: false, wheel: wheelSlices('normal') }, rng).s, t, 'no better neighbour: no token spent');
  for (let i = 0; i < 40; i++) { const q = useToken(t, 'spot', 'lift', { index: 2, gain: 4, jackpot: false, wheel: wheelSlices('normal') }, makeRng('l' + i)); assert.ok(q.pending.gain <= 5 && q.pending.gain >= 4); assert.equal(tokenOptions(q.s, 'spot', q.pending).some((o) => o.kind === 'lift'), false); }
}));

test('Hot Streak (+1 gold after gold), booster only on its slice, Second Opinion keeps the better', () => on(() => {
  const w = metaWheel(wheelSlices('normal'), 'spot', full()), gold = { index: 0, gain: 5, jackpot: true, t: 3, phi: 0, e: 0 };
  let s = full(); s.wheelMeta.streak = 0; let a = afterResult(s, 'spot', gold, { random: () => 0.99 }, { wheel: w });
  assert.equal(a.result.gain, 5); assert.equal(metaOf(a.s).streak, 1); a = afterResult(a.s, 'spot', gold, { random: () => 0.99 }, { wheel: w }); assert.equal(a.result.gain, 6); assert.equal(metaOf(a.s).streak, 2);
  a = afterResult(a.s, 'spot', { index: 2, gain: 1, jackpot: false }, { random: () => 0.99 }, { wheel: w }); assert.equal(metaOf(a.s).streak, 0);
  const b = afterResult(s, 'spot', { index: 3, gain: 3, jackpot: false }, { random: () => 0 }, { wheel: w }); // booster fires, shining slice = first non-gold (index 1)
  assert.equal(b.result.gain, 3); const c = afterResult(s, 'spot', { index: 1, gain: 2, jackpot: false }, { random: () => 0 }, { wheel: w }); assert.equal(c.result.gain, 2 + 3);
  const cw = metaWheel(courseWheel(), 'course', full()); let better = 0;
  for (let i = 0; i < 50; i++) { const rng = makeRng('so' + i), r1 = spinResult(rng, cw, false), r = afterResult(full(), 'course', r1, rng, { wheel: cw }).result; assert.ok(r.gain >= r1.gain); better += r.gain > r1.gain; }
  assert.ok(better > 3);
}));

test('swap: only after the power tree, 2 Spokes = 1 Coin, ledger row', () => on(() => {
  let s = full(); s.wheelMeta.spokes = 101; assert.equal(powerDone(s), true);
  const n = swapSpokes(s); assert.equal(n.econ.coins, 150); assert.equal(metaOf(n).spokes, 1); assert.deepEqual(n.econ.ledger.at(-1), { k: 'swap', spokes: 100, coins: 50 });
  const half = full(); delete half.wheelMeta.owned.c_guide; half.wheelMeta.spokes = 500; assert.equal(powerDone(half), false); assert.equal(swapSpokes(half), half);
  const craftOnly = full(); craftOnly.wheelCraft.owned = {}; craftOnly.wheelMeta.spokes = 4; assert.equal(powerDone(craftOnly), true, 'Craft can wait');
}));

test('determinism: same seed same spins; metaReport is plain text', () => on(() => {
  const a = play(full(), 'spot', 200, 'det'), b = play(full(), 'spot', 200, 'det'); assert.deepEqual(a, b);
  const lines = metaReport(full()); assert.ok(lines.length >= 4 && lines.every((l) => typeof l === 'string'));
}));
