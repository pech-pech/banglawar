// T6 B2.3: Clinic boost + jackpot extra run (js/core/clinic-boost.js). SPEC s6, s7, s10; CONTRACT-B s5, s6.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { onHook, clearHooks } from '../js/core/hooks.js';
import { runNets, drillRoom, focusRating } from '../js/core/training.js';
import { weekKey } from '../js/core/week-key.js';
import { CLINIC_PCT, ODDS_EASY } from '../js/data/clinic.js';
import {
  boostPctFor, normBoost, stackBoost, boostSum, roundBoost, jackpotOdds, applyBoost, jackpotRun,
  boostsOf, countSlice, normStats, emptyStats, clinicRng,
} from '../js/core/clinic-boost.js';
import { game, P, me, makeRng } from './_tr2-fixture.mjs';

const clone = (x) => structuredClone(x);
const counted = (seed) => { const r = makeRng(seed); const c = { draws: 0, random: () => { c.draws += 1; return r.random(); } }; return c; };
const withClinic = (s, boost, week = weekKey(s)) => ({ ...s, clinic: { week, slots: 3, netsDone: false, pending: null, spins: [], boost, stats: emptyStats() } });
const listen = () => onHook('netsRun', (n, info) => { applyBoost(n, info.lines); jackpotRun(n, info); });
const gainOf = (l) => l.toRaw - l.fromRaw;

test('boostPctFor: S 5, M 10, L 20 from CLINIC_PCT; JP and junk 0', () => {
  assert.deepEqual(['S', 'M', 'L', 'JP', 'X', undefined, 'toString'].map(boostPctFor), [5, 10, 20, 0, 0, 0, 0]);
  assert.deepEqual(CLINIC_PCT, { S: 5, M: 10, L: 20 });
});

test('stacking: two spins on one player add their pcts; JP sets extraRun; corrupt entries drop, never throw', () => {
  let e = stackBoost(undefined, 'M'); e = stackBoost(e, 'S');
  assert.deepEqual(e, { pcts: [10, 5], extraRun: false }); assert.equal(boostSum(e), 15);
  e = stackBoost(e, 'JP'); assert.deepEqual(e, { pcts: [10, 5], extraRun: true });
  assert.deepEqual(stackBoost(e, 'JP'), e, 'second JP: still one extra run (extraRun is a bool, SPEC s9)');
  assert.deepEqual(stackBoost(e, 'nope'), e);
  assert.deepEqual(normBoost({ pcts: [5, 'x', NaN, 7, -10, 20, null], extraRun: 'yes' }), { pcts: [5, 20], extraRun: false });
  for (const bad of [null, 3, 'a', [], { pcts: 'x' }]) assert.deepEqual(normBoost(bad), { pcts: [], extraRun: false });
  const frozen = Object.freeze({ pcts: Object.freeze([5]), extraRun: false });
  assert.deepEqual(stackBoost(frozen, 'L'), { pcts: [5, 20], extraRun: false }, 'pure: input not mutated');
});

test('roundBoost: exact integer stochastic rounding, mean = gain x (1 + pct)', () => {
  assert.equal(roundBoost(1, 5, 0.04), 2); assert.equal(roundBoost(1, 5, 0.05), 1); // frac exactly 0.05
  assert.equal(roundBoost(2, 20, 0.39), 3); assert.equal(roundBoost(2, 20, 0.4), 2);
  assert.equal(roundBoost(3, 0, 0), 3); assert.equal(roundBoost(0, 20, 0), 0, 'no gain: nothing to boost');
  assert.equal(roundBoost(3, 35, 0.999), 4); assert.equal(roundBoost(3, 35, 0), 5); // 4.05
  assert.equal(roundBoost(-2, 20, 0), 0); assert.equal(roundBoost(NaN, 20, 0), 0);
  for (const [g, p] of [[1, 5], [2, 10], [3, 20], [2, 35]]) {
    const N = 4000; let sum = 0; for (let i = 0; i < N; i++) sum += roundBoost(g, p, (i + 0.5) / N);
    assert.ok(Math.abs(sum / N - g * (1 + p / 100)) < 1e-9, `mean ${g}x${p}`);
  }
});

test('jackpotOdds: ODDS_EASY at Q 0, the week Q shifts it like effortOdds, Balanced halves Good/Great', () => {
  assert.deepEqual(ODDS_EASY, { okay: 80, good: 18, great: 2 });
  const o = jackpotOdds(0, false); assert.ok(Math.abs(o.okay - 80) < 1e-9 && Math.abs(o.good - 18) < 1e-9 && Math.abs(o.great - 2) < 1e-9);
  const q = jackpotOdds(6, false); assert.ok(Math.abs(q.okay - 74) < 1e-9 && Math.abs(q.good - 21) < 1e-9 && Math.abs(q.great - 5) < 1e-9);
  const b = jackpotOdds(0, true); assert.ok(Math.abs(b.good - 9) < 1e-9 && Math.abs(b.great - 1) < 1e-9 && Math.abs(b.okay - 90) < 1e-9);
  const big = jackpotOdds(200, false); assert.equal(big.okay, 0); assert.ok(Math.abs(big.good + big.great - 100) < 1e-9);
  assert.deepEqual(jackpotOdds(NaN, false), jackpotOdds(0, false));
});

test('netsRun: boost only touches boosted lines; nets rng draws, other players and TP unchanged', (t) => {
  t.after(clearHooks);
  const s = withClinic(game(), { p2: { pcts: [20, 10], extraRun: false } });
  const r0 = counted('n1'), base = runNets(s, r0, {});
  listen();
  const r1 = counted('n1'), r = runNets(s, r1, {});
  assert.equal(r1.draws, r0.draws, 'never draws from the nets rng');
  assert.equal(r.state.training.tp, base.state.training.tp, 'boost costs no TP');
  for (const l of r.lines) {
    const b = base.lines.find((x) => x.id === l.id);
    assert.equal(l.fromRaw, b.fromRaw);
    if (l.id !== 'p2') { assert.deepEqual(l, b, `${l.id} untouched`); assert.deepEqual(me(r.state, l.id), me(base.state, l.id)); }
  }
  const l2 = r.lines.find((l) => l.id === 'p2'), b2 = base.lines.find((l) => l.id === 'p2');
  assert.equal(l2.clinic.pct, 30); assert.deepEqual(l2.clinic.pcts, [20, 10]);
  assert.equal(gainOf(l2), gainOf(b2) + l2.clinic.extra);
  assert.ok(l2.clinic.extra === Math.floor(gainOf(b2) * 1.3) - gainOf(b2) || l2.clinic.extra === Math.ceil(gainOf(b2) * 1.3) - gainOf(b2));
  assert.equal(me(r.state, 'p2')[l2.rating], l2.toRaw);
  assert.equal(r.state.training.last.lines, r.lines, 'same line objects as the Nets Day result');
  const st = r.state.clinic.stats;
  assert.equal(st.boostedGain, l2.clinic.extra); assert.equal(st.netGain, l2.clinic.extra); assert.equal(st.jackpotRuns, 0);
  assert.equal(st.pointsGross, l2.clinic.extra, 'room not hit: gross = net');
  assert.deepEqual(st.slices, { S: 0, M: 0, L: 0, JP: 0 }, 'slices are counted at STOP (countSlice), not here');
  assert.equal(s.clinic.stats.boostedGain, 0, 'input state not mutated');
});

test('determinism: same seed/week/player -> same result; rng key is seed|clinic|weekKey|playerId', (t) => {
  t.after(clearHooks); listen();
  const s = withClinic(game(), { p1: { pcts: [5], extraRun: true }, p3: { pcts: [20], extraRun: true } });
  const a = runNets(s, makeRng('d'), {}), b = runNets(clone(s), makeRng('d'), {});
  assert.deepEqual(a.state, b.state); assert.deepEqual(a.lines, b.lines);
  assert.equal(clinicRng(s, 'p1').random(), makeRng(`g|clinic|${weekKey(s)}|p1`).random());
  assert.equal(clinicRng({}, 'p1', 101).random(), makeRng('sixes|clinic|101|p1').random(), 'no seed reads sixes, like the other streams');
  // boost rounding over many weeks: mean lift ~ +20% on the gain, not a fixed ceil/floor
  let base = 0, boosted = 0;
  for (let w = 1; w <= 400; w++) {
    const n = withClinic({ ...game(), training: { ...game().training, week: w } }, { p1: { pcts: [20], extraRun: false } });
    const line = { id: 'p1', rating: 'bp', fromRaw: 30, toRaw: 32 }; me(n, 'p1').bp = 32;
    applyBoost(n, [line]); base += 2; boosted += gainOf(line);
  }
  assert.ok(Math.abs(boosted / base - 1.2) < 0.04, `lift ${boosted / base}`);
});

test('edge: boost on a player who cannot gain is wasted, never charged; jackpot skips him, no run counted', () => {
  const s = withClinic(game(), { p1: { pcts: [20], extraRun: true } });
  const n = clone(s), p = me(n, 'p1');
  p.bp = 99; p.bs = 99; p.spd = 99; p.bsk = 99; p.potential = 200; // 99 limit: no room on any stat
  const line = { id: 'p1', rating: 'bp', fromRaw: 97, toRaw: 99 };
  for (let w = 1; w <= 20; w++) {
    const m = clone(n); m.training.week = w; m.clinic.week = weekKey(m); const l = clone(line);
    const out = applyBoost(m, [l]); jackpotRun(m, { lines: [l], q: 0, plan: { focus: 'bat' } });
    assert.equal(l.clinic.extra, 0); assert.equal(me(m, 'p1').bp, 99); assert.equal(l.toRaw, 99);
    assert.deepEqual(l.clinic.extraRun, { skipped: true });
    assert.equal(m.clinic.stats.netGain, 0); assert.equal(m.clinic.stats.boostedGain, 0); assert.equal(m.clinic.stats.jackpotRuns, 0);
    assert.equal(m.clinic.stats.pointsGross, out[0].target - out[0].base, 'gross keeps what the wheel offered');
    assert.equal(m.training.tp, n.training.tp);
  }
});

test('edge: boost clamps to room (cap sum and balance rule)', () => {
  // balance rule: bp may rise at most 15 above his lowest stat
  const s = withClinic(game(), { p1: { pcts: [20], extraRun: false } });
  let hit = 0;
  for (let w = 1; w <= 60; w++) {
    const n = clone(s); n.training.week = w; n.clinic.week = weekKey(n);
    const p = me(n, 'p1'); p.bp = 45; p.bs = 30; p.spd = 30; p.bsk = 30; // bp 45 = lowest 30 + 15: bal room 0
    const line = { id: 'p1', rating: 'bp', fromRaw: 42, toRaw: 45 };
    applyBoost(n, [line]); assert.equal(line.clinic.extra, 0); assert.equal(p.bp, 45);
    hit += n.clinic.stats.pointsGross;
  }
  assert.ok(hit > 0, 'some weeks offered +1 that the room ate');
  const n = clone(s), p = me(n, 'p1'); p.potential = 74; // capSum 122, ratings 121 -> room 1
  p.bp = 31; const line = { id: 'p1', rating: 'bp', fromRaw: 28, toRaw: 31 }; p.bp = 31; p.bs = 30; p.spd = 30; p.bsk = 30;
  assert.equal(drillRoom(p, 'bp').room, 1);
  for (let w = 1; w <= 40; w++) { const m = clone(n); m.training.week = w; m.clinic.week = weekKey(m); const l = clone(line); applyBoost(m, [l]); assert.ok(l.clinic.extra <= 1); assert.ok(me(m, 'p1').bp <= 32); }
});

test('edge: two coaches spin the same player: boosts add; one entry per player', (t) => {
  t.after(clearHooks); listen();
  let e = stackBoost(null, 'L'); e = stackBoost(e, 'L');
  const s = withClinic(game(), { p1: e });
  const r = runNets(s, makeRng('two'), {}), l = r.lines.find((x) => x.id === 'p1');
  assert.equal(l.clinic.pct, 40); assert.deepEqual(l.clinic.pcts, [20, 20]);
});

test('edge: stale week, missing or corrupt clinic block: no boost, no throw', (t) => {
  t.after(clearHooks);
  const base = runNets(game(), makeRng('st'), {});
  listen();
  for (const s of [withClinic(game(), { p1: { pcts: [20], extraRun: true } }, 99), game(), { ...game(), clinic: 'junk' }, { ...game(), clinic: { week: 101, boost: 'x' } }]) {
    const r = runNets(s, makeRng('st'), {});
    assert.deepEqual(r.lines, base.lines);
    for (const pl of r.state.clubs[0].squad) assert.deepEqual(pl, me(base.state, pl.id));
  }
  assert.deepEqual(boostsOf({ ...game(), clinic: { week: 1, boost: { p1: {} } } }), {});
  assert.deepEqual(applyBoost({}, null), []); assert.deepEqual(applyBoost({}, [null, 3, {}]), []);
  assert.deepEqual(jackpotRun({}, {}), []);
});

test('edge: TP-short or skipped boosted player has no line: nothing gained, no free jackpot', (t) => {
  t.after(clearHooks); listen();
  const s0 = game({ tp: 26 }); // normal effort costs 13: only p1, p2 train
  const s = withClinic(s0, { p8: { pcts: [20], extraRun: true } });
  const base = runNets(s0, makeRng('tp'), {}), r = runNets(s, makeRng('tp'), {});
  assert.ok(!r.lines.some((l) => l.id === 'p8'));
  assert.deepEqual(me(r.state, 'p8'), me(base.state, 'p8'));
  assert.deepEqual(normStats(r.state.clinic.stats), emptyStats());
});

test('jackpot: extra roll after the main run, same focus, 0 TP, not boosted, ODDS_EASY + Q', (t) => {
  t.after(clearHooks); listen();
  const s = withClinic(game(), { p1: { pcts: [20], extraRun: true } });
  const base = runNets(s.clinic ? { ...s, clinic: undefined } : s, makeRng('jp'), {});
  const r = runNets(s, makeRng('jp'), {}), l = r.lines.find((x) => x.id === 'p1');
  const x = l.clinic.extraRun;
  assert.equal(r.state.training.tp, base.state.training.tp, '0 TP');
  assert.equal(r.lines.length, base.lines.length, 'no extra line object; result lives on line.clinic.extraRun');
  assert.ok([1, 2, 3].includes(x.rolled)); assert.equal(x.gain, Math.min(x.rolled, 99));
  assert.equal(x.rating, focusRating({ ...me(r.state, 'p1'), [x.rating]: x.fromRaw }, 'bat'), 'same focus, lowest stat of the set at roll time');
  assert.equal(x.toRaw - x.fromRaw, x.gain, 'not boosted');
  const p = me(r.state, 'p1'), pb = me(base.state, 'p1');
  const total = ['bp', 'bs', 'spd', 'bsk'].reduce((a, k) => a + p[k] - pb[k], 0);
  assert.equal(total, l.clinic.extra + x.gain);
  assert.equal(p.drillsHere, pb.drillsHere, 'extra run does not count as a drill');
  const st = r.state.clinic.stats;
  assert.equal(st.jackpotRuns, 1); assert.equal(st.netGain, l.clinic.extra + x.gain); assert.equal(st.boostedGain, l.clinic.extra);
  // idempotent: a second call does nothing
  const again = clone(r.state); applyBoost(again, again.training.last.lines); jackpotRun(again, {});
  assert.deepEqual(again, r.state);
});

test('jackpot odds over many weeks match ODDS_EASY (Q 0) and shift with Q', () => {
  const freq = (q, focus) => {
    const c = [0, 0, 0, 0], N = 3000;
    for (let w = 0; w < N; w++) {
      const n = withClinic({ ...game(), training: { ...game().training, week: w } }, { p1: { pcts: [], extraRun: true } });
      const line = { id: 'p1', rating: 'bp', fromRaw: 30, toRaw: 30 };
      jackpotRun(n, { lines: [line], q, plan: { focus } }); c[line.clinic.extraRun.rolled] += 1;
    }
    return c.map((v) => v * 100 / N);
  };
  const e = freq(0, 'bat'); assert.ok(Math.abs(e[1] - 80) < 2.5 && Math.abs(e[2] - 18) < 2.5 && Math.abs(e[3] - 2) < 1.2, e.join());
  const q = freq(20, 'bat'); assert.ok(q[1] < 74 && q[3] > 7, q.join());
  const b = freq(0, 'bal'); assert.ok(Math.abs(b[1] - 90) < 2.5, b.join());
});

test('jackpot q and focus fall back to the state when info is missing', () => {
  const n = withClinic(game({ plan: { focus: 'bowl', effort: 'easy' } }), { p1: { pcts: [], extraRun: true } });
  const line = { id: 'p1', rating: 'spd', fromRaw: 30, toRaw: 30 };
  n.training.last = { lines: [line] };
  const out = jackpotRun(n); assert.equal(out.length, 1);
  assert.ok(['spd', 'bsk'].includes(line.clinic.extraRun.rating));
});

test('breakthrough flag set when the boost crosses a letter step', () => {
  const found = [];
  for (let w = 1; w <= 200 && !found.length; w++) {
    const n = withClinic({ ...game(), training: { ...game().training, week: w } }, { p1: { pcts: [20, 20, 20, 20, 20], extraRun: false } });
    for (let from = 30; from < 60; from++) {
      const m = clone(n), p = me(m, 'p1'); p.bp = from + 1; p.bs = 50; p.spd = 50; p.bsk = 50;
      const line = { id: 'p1', rating: 'bp', fromRaw: from, toRaw: from + 1, breakthrough: false };
      applyBoost(m, [line]);
      if (line.clinic.extra > 0 && line.breakthrough) { found.push(from); break; }
    }
  }
  assert.ok(found.length, 'a boosted gain that crosses a step marks a breakthrough');
});

test('countSlice and normStats: honest counters, corrupt reads 0', () => {
  const n = {}; countSlice(n, 'S'); countSlice(n, 'JP'); countSlice(n, 'JP'); countSlice(n, 'zz');
  assert.deepEqual(n.clinic.stats.slices, { S: 1, M: 0, L: 0, JP: 2 });
  assert.deepEqual(normStats({ slices: { S: -1, M: 'a', L: 3 }, boostedGain: NaN, jackpotRuns: 2, pointsGross: Infinity, netGain: 4 }),
    { slices: { S: 0, M: 0, L: 3, JP: 0 }, boostedGain: 0, jackpotRuns: 2, pointsGross: 0, netGain: 4 });
});

test('module draws nothing at import, registers no listener, and frozen vectors are byte-equal to BASELINE-S0', () => {
  const src = readFileSync(new URL('../js/core/clinic-boost.js', import.meta.url), 'utf8');
  assert.ok(!/onHook\(|Math\.random|Date\.now|fetch\(|TRAIN_RNG/.test(src));
  const banned = new RegExp(['pe' + 'rk', 'bo' + 'nd'].join('|'), 'i'); // spelled in parts so this file stays clean too
  assert.ok(!banned.test(src) && !banned.test(readFileSync(new URL(import.meta.url), 'utf8')));
  const md5 = (p) => createHash('md5').update(readFileSync(new URL(p, import.meta.url))).digest('hex');
  assert.equal(md5('./ball-vectors-pair.json'), '21cb036ef79bb769c4f7a2f0084e0e6b');
  assert.equal(md5('./ball-vectors.json'), 'e4325c773b7f8eef076eda7c49a13496');
  assert.equal(md5('./fixtures/wheelmatch-segx.json'), '566fe02ab12a97cb5dbe3effd3ba15bf');
});
