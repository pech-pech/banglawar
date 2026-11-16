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
  assert.ok(Math.abs(E.spot.w0Mult - 0.55) < 1e-9); assert.ok(Math.abs(E.spot.jMult - 0.7225) < 1e-9); assert.equal(E.spot.guide, true);
  assert.ok(Math.abs(E.spot.goldAdd - (0.06 + 0.04)) < 1e-9); assert.ok(Math.abs(E.course.goldAdd - 0.10) < 1e-9);
  assert.equal(E.spot.extraGold, 1); assert.equal(E.toss.extraGold, 0); assert.equal(E.spot.kindFloor, 1); assert.equal(E.course.kindFloor, 1); assert.equal(E.spot.floor, 0); assert.equal(E.hype.floor, 1); assert.equal(E.pep.neighbourMult, 1.5); assert.equal(E.finals.neighbourMult, 1.5);
  assert.ok(Math.abs(E.spot.booster.chance - 0.6) < 1e-9); assert.equal(E.spot.booster.count, 3); assert.equal(E.pep.booster.value, 1.5);
  assert.deepEqual(E.tokens, { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 });
  const w = metaWheel(wheelSlices('normal'), 'spot', s);
  // SPOT_SLICES ring (SPEC 3): gold x3.0 at 1.2 units + 0.10 widening = 1.3; Extra Gold (x0.75) goes farthest from the first gold (SPEC 11a) = index 5.
  // SPEC 11b: the ring still sums 10 (the extra width comes from the other pieces pro rata): gold 13 / 110.75 = 11.74% (06-OPEN-ITEMS item 2)
  const k = 10 / (10.1 + 1.3 * 0.75);
  assert.equal(w.slices.length, 11); assert.deepEqual(w.golds, [0, 5]); assert.equal(w.slices[5], 3);
  assert.ok(Math.abs(w.C - 10) < 1e-9 && Math.abs(w.widths.reduce((a, b) => a + b, 0) - 10) < 1e-9, 'ring sums 10');
  assert.ok(Math.abs(w.widths[0] - 1.3 * k) < 1e-9); assert.ok(Math.abs(w.widths[5] - 1.3 * 0.75 * k) < 1e-9); assert.ok(Math.abs(w.widths[0] / 10 - 0.1174) < 1e-4);
  assert.ok(w.slices.some((v, i) => v === 1 && !w.golds.includes(i)), 'Kind Floor pays nothing here (flag only; T2 perks/kind-floor.js pays)'); assert.equal(w.phys.SD, 0.08);
  assert.ok(Math.abs(w.phys.W0 - 36 * 0.55) < 1e-9); assert.ok(Math.abs(w.phys.J - 1.2 * 0.7225) < 1e-9); assert.equal(w.phys.D, 2); // engine (was W0 13.2 / J 0.42 on W0 24 / J 0.6)
  const n = metaWheel(wheelSlices('normal'), 'spot', fresh()); assert.deepEqual(n.slices, wheelSlices('normal').slices); assert.deepEqual(n.phys, { W0: 36, J: 1.2, SD: 0.11, D: 2 });
  const kf = effective({ ...fresh(), wheelMeta: { ...fresh().wheelMeta, owned: { f_floor: 1 } } }); assert.equal(kf.spot.kindFloor, 1); assert.equal(kf.course.kindFloor, 1); assert.equal(effective(fresh()).spot.kindFloor, 0);
}));

test('physics reads wheel.phys; without it the engine numbers (SPEC 2a: W0 36, J 1.2) hold', () => {
  const w = wheelSlices('normal'), a = spinResult(makeRng('p'), w, true), b = spinResult(makeRng('p'), { ...w, phys: { W0: 36, J: 1.2, SD: 0.11 } }, true);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(wheelArc(2, { W0: 18 }) - wheelArc(2) / 2) < 1e-9);
  const slow = spinResult(makeRng('p'), { ...w, phys: { W0: 18, J: 1.2, SD: 0.11 } }, { t: 3, phi: 0, e: 0 }), norm = spinResult(makeRng('p'), w, { t: 3, phi: 0, e: 0 });
  assert.notEqual(slow.index === norm.index && slow.t === norm.t && JSON.stringify(slow) === JSON.stringify(norm), 'x');
});

// A season of tokens the way the sim spends them (spin_full): Pick Two is committed blind on a season's first Spotlight (every Course spin),
// then Spin Again / Wild (else Nudge) below the sim's limit, Lift on the last two Spotlights. Wild only stands in as Spin Again, as in the sim.
function play(s, id, n, seed, ring) {
  const rng = makeRng(seed); const wheel = metaWheel(ring ? ring() : id === 'spot' ? wheelSlices('normal') : courseWheel(), id, s); let tot = 0, gold = 0;
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

// SPEC rings (wheels SPEC 3 / 4; T2 ships them as game data, here they are test fixtures). Slices are the PAY itself: Spotlight x multipliers,
// Course steps. SPEC rule: ratio = value over that row's own random (no more "/ 1.5" of the old points wheel). Physics = the engine (metaWheel).
const X1 = 7.4 / 7, P1 = 7.3 / 7;
const SPOT_RING = () => ({ slices: [3, 1, 1, 1.5, 1, 1, 1.2, 1, 1, 1], jackpotIndex: 0, widths: [1.2, X1, X1, 0.8, X1, X1, 0.6, X1, X1, X1] });
const COURSE_RING = () => ({ slices: [4, 1, 3, 1, 2, 1, 2, 1, 1, 1, 1], jackpotIndex: 0, widths: [1.2, P1, 0.8, P1, 0.35, P1, 0.35, P1, P1, P1, P1] });
const ev = (w) => w.slices.reduce((a, v, i) => a + v * w.widths[i], 0) / w.widths.reduce((a, b) => a + b, 0);
const CTL = { c_slow: 3, c_steady: 2, c_guide: 1 };
const owning = (o) => { const s = fresh(); s.wheelMeta.owned = { ...o }; s.wheelMeta.tally = 600; return s; };
const carefulMean = (ring, id, s, n, seed) => { const w = metaWheel(ring(), id, s), rng = makeRng(seed); let t = 0; for (let i = 0; i < n; i++) t += spinResult(rng, w, true).gain; return t / n; };

test('PARITY Spotlight (SPEC 3, x multipliers): random 1.292, careful 1.713, full Control 2.129; full tree under the 3.0x bug line', () => on(() => {
  const R = ev(SPOT_RING()); assert.ok(Math.abs(R - 1.292) < 1e-9, 'random EV ' + R);
  const c = carefulMean(SPOT_RING, 'spot', fresh(), 20000, 'sp-c'), k = carefulMean(SPOT_RING, 'spot', owning(CTL), 20000, 'sp-k');
  const f = play(full(), 'spot', 7000, 'par-a', SPOT_RING), z = play(fresh(), 'spot', 7000, 'par-b', SPOT_RING);
  console.log('parity spot careful', c.toFixed(3), `(${(c / R).toFixed(2)}x)`, '| full Control', k.toFixed(3), `(${(k / R).toFixed(2)}x)`, '| tokens none', z.mean.toFixed(3), '| full tree', f.mean.toFixed(3), 'gold', f.gold.toFixed(3));
  // training.js careful tapper (exp decay, IDEAL 3.5) runs a little above the SPEC pulse sim: bands, not +-0.05
  assert.ok(Math.abs(c - 1.713) <= 0.08, 'careful ' + c); assert.ok(Math.abs(k - 2.129) <= 0.15, 'full Control ' + k);
  assert.ok(f.mean < 3.0 && f.mean > k, 'full tree ' + f.mean); // one-wheel token play; the SPEC 11c season (2.60x, 2.52x without Kind Floor, shared pool) is test/t2-fulltree.test.mjs
}));

test('PARITY Course (SPEC 4, steps): random 1.590, careful 2.206, full Control 2.722; full tree above Control, more gold', () => on(() => {
  const R = ev(COURSE_RING()); assert.ok(Math.abs(R - 1.590) < 1e-9, 'random EV ' + R);
  const c = carefulMean(COURSE_RING, 'course', fresh(), 20000, 'co-c'), k = carefulMean(COURSE_RING, 'course', owning(CTL), 20000, 'co-k');
  const f = play(full(), 'course', 6000, 'par-c', COURSE_RING), z = play(fresh(), 'course', 6000, 'par-d', COURSE_RING);
  console.log('parity course careful', c.toFixed(3), `(${(c / R).toFixed(2)}x)`, '| full Control', k.toFixed(3), '| full tree gold', f.gold.toFixed(3), 'steps', f.mean.toFixed(3), '| none', z.gold.toFixed(3), z.mean.toFixed(3));
  assert.ok(Math.abs(c - 2.206) <= 0.08, 'careful ' + c); assert.ok(Math.abs(k - 2.722) <= 0.2, 'full Control ' + k);
  assert.ok(f.mean > k && f.gold > z.gold, 'full tree ' + f.mean); // SPEC 11c 3.76 / 75% gold is the season with the shared token pool: test/t2-fulltree.test.mjs
}));

test('tokens: refill from ranks, Spotlight cap 2, Course no cap, guards, Wild, nudge never onto gold, lift never above gold', () => on(() => {
  let s = full(); s = seasonTokens(s); assert.deepEqual(metaOf(s).tokens, { respin: 3, nudge: 1, two: 1, wild: 1, lift: 1 }); assert.equal(seasonTokens(s), s, 'once a season');
  const w = metaWheel(wheelSlices('normal'), 'spot', s), pend = { index: 2, gain: 1, jackpot: false, wheel: w, streak0: 0 };
  assert.deepEqual(tokenOptions(s, 'spot', pend).map((o) => o.kind), ['respin', 'two', 'nudge', 'lift']);
  assert.equal(tokenOptions(s, 'hype', pend).length, 0); assert.equal(tokenOptions(s, 'toss', pend).length, 0); // wa1: a Spotlight-shaped result on a dial/reveal wheel gets nothing (Hype/Toss tokens: test/wa1-core.test.mjs)
  assert.equal(tokenOptions(s, 'spot', { ...pend, index: 0, jackpot: true }).length, 0, 'no tool on gold');
  const rng = makeRng('tk'); let r = useToken(s, 'spot', 'respin', pend, rng); assert.equal(metaOf(r.s).tokens.respin, 2); assert.equal(metaOf(r.s).spotTokensUsed, 1); assert.ok(r.pending.gain >= pend.gain);
  r = useToken(r.s, 'spot', 'respin', { ...pend, gain: 1 }, rng); assert.equal(metaOf(r.s).spotTokensUsed, 2);
  assert.equal(tokenOptions(r.s, 'spot', pend).length, 0, 'cap of 2 a Spotlight season'); const same = useToken(r.s, 'spot', 'respin', pend, rng); assert.equal(same.s, r.s);
  assert.ok(tokenOptions(r.s, 'course', { index: 1, gain: 1, jackpot: false, wheel: metaWheel(courseWheel(), 'course', r.s) }).length > 0, 'Course has no cap');
  const s2 = seasonTokens({ ...r.s, season: { n: 2 } }); assert.equal(metaOf(s2).spotTokensUsed, 0);
  // Wild stands in; nudge target never gold; lift capped at gold
  let t = fresh(); t.wheelMeta.tokens.wild = 1; t.wheelMeta.tally = 600; const pw = { index: 2, gain: 1, jackpot: false, wheel: wheelSlices('normal') };
  t = { ...t, wheelMeta: t.wheelMeta }; assert.deepEqual(tokenOptions(t, 'spot', pw).map((o) => o.label), ['Spin Again (Wild)', 'Pick Two (Wild)', 'Nudge (Wild)', 'Lucky Lift (Wild)']);
  const pn = { index: 2, gain: 1, jackpot: false, wheel: wheelSlices('normal') }, nd = useToken(t, 'spot', 'nudge', pn, rng); assert.equal(nd.pending.index, 3); assert.equal(nd.pending.gain, 1.5); assert.equal(nd.s.wheelMeta.tokens.wild, 0); // SPOT ring: x1.0 -> x1.5
  assert.equal(useToken(t, 'spot', 'nudge', { index: 6, gain: 1.2, jackpot: false, wheel: wheelSlices('normal') }, rng).s, t, 'no better neighbour: no token spent'); // x1.2 between two x1.0
  // Lucky Lift on Spotlight: +1/+2/+3 points in x units (1/1.5 x a point), never above the gold x3.0
  const lifts = new Set();
  for (let i = 0; i < 40; i++) { const q = useToken(t, 'spot', 'lift', { index: 3, gain: 1.5, jackpot: false, wheel: wheelSlices('normal') }, makeRng('l' + i)); assert.ok(q.pending.gain <= 3 && q.pending.gain > 1.5); lifts.add(+q.pending.gain.toFixed(4)); assert.equal(tokenOptions(q.s, 'spot', q.pending).some((o) => o.kind === 'lift'), false); }
  assert.deepEqual([...lifts].sort(), [2.1667, 2.8333, 3], 'x1.5 + 0.667 / 1.333 / 2 (capped at 3)');
}));

test('Hot Streak (+1 gold after gold), booster only on its slice, Second Opinion keeps the better', () => on(() => {
  // Spotlight units (SPEC 3, gaps_sim TT): Hot Streak +1 point = +1/1.5 x; Booster 3 points (Booster 3 ranks + Big Boost 2) = +2.0x; Kind Floor x1.0 -> x1.2
  const w = metaWheel(wheelSlices('normal'), 'spot', full()), gold = { index: 0, gain: 3, jackpot: true, t: 3, phi: 0, e: 0 };
  let s = full(); s.wheelMeta.streak = 0; let a = afterResult(s, 'spot', gold, { random: () => 0.99 }, { wheel: w });
  assert.equal(a.result.gain, 3); assert.equal(metaOf(a.s).streak, 1); a = afterResult(a.s, 'spot', gold, { random: () => 0.99 }, { wheel: w }); assert.ok(Math.abs(a.result.gain - (3 + 1 / 1.5)) < 1e-9); assert.equal(metaOf(a.s).streak, 2);
  a = afterResult(a.s, 'spot', { index: 2, gain: 1, jackpot: false }, { random: () => 0.99 }, { wheel: w }); assert.equal(metaOf(a.s).streak, 0); assert.equal(a.result.gain, 1.2, 'Kind Floor: x1.0 pays x1.2');
  const b = afterResult(s, 'spot', { index: 3, gain: 1.5, jackpot: false }, { random: () => 0 }, { wheel: w }); // booster fires, shining slice = first non-gold (index 1)
  assert.equal(b.result.gain, 1.5); const c = afterResult(s, 'spot', { index: 1, gain: 1, jackpot: false }, { random: () => 0 }, { wheel: w }); assert.ok(Math.abs(c.result.gain - (1.2 + 2)) < 1e-9); assert.equal(c.result.boosted, true);
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
