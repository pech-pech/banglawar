// Wheel match mode engine (js/core/wheelmatch.js, js/data/wheelmatch.js). SPEC 2026-11-15-wheel-match s2, s3, s5, s9, s12, s15.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store/store.js';
import { eligibleBowlers } from '../js/core/match.js';
import { makeRng } from '../js/core/rng.js';
import { FLAGS } from '../js/data/flags.js';
import { WHEEL_MATCH as WMX, DEV_DEFAULTS, WHEEL_RIVAL_BOOST, CLASSIC_RIVAL_OFF, WHEEL_RIVAL_OFF } from '../js/data/wheelmatch.js';
import * as W from '../js/core/wheelmatch.js';

const N = 600; // sample count for most checks (speed); one test runs the full N_SAMP
const EPS = 1e-9;

/** A match after `bowled` overs of innings 1 (classic store path), plus the chase state after innings 1. */
function bowlState(seed, bowled) {
  const st = createStore(null); st.dispatch('NewMatch', { seed });
  for (let i = 0; i < bowled && st.get().stage === 'bowl'; i++) {
    const s = st.get(); st.dispatch('MakeCall', { bowler: eligibleBowlers(s.me.players, s.inn1.over, s.inn1.last)[0], field: 'P' }); st.dispatch('BowlOver', {});
  }
  return st;
}
function chaseState(seed, overs) {
  const st = bowlState(seed, 10);
  if (st.get().stage === 'bowl') throw new Error('inn1 not done');
  st.dispatch('StartChase', {});
  for (let i = 0; i < overs && st.get().stage === 'chase'; i++) st.dispatch('BowlOver', { intent: 'R' });
  return st.get();
}
const ourBowler = (s) => eligibleBowlers(s.me.players, s.inn1.over, s.inn1.last)[0];
const rivalBowler = (s) => eligibleBowlers(s.rival.players, s.inn2.over, s.inn2.last)[0];
/** A spread of live states: [s, side, bowlerIdx]. */
function states() {
  const out = [];
  for (const seed of ['abc', 'xyz', 'w7']) {
    for (const k of [0, 3, 7]) { const s = bowlState(seed, k).get(); if (s.stage === 'bowl') out.push([s, 'bowl', ourBowler(s)]); }
    for (const k of [0, 4, 8]) { const s = chaseState(seed, k); if (s.stage === 'chase') out.push([s, 'bat', rivalBowler(s)]); }
  }
  return out;
}
const ALL = states();
const segsOf = (s, side, bi, n = N) => {
  const samples = W.sampleOvers(s, side, bi, { n });
  const inn = side === 'bowl' ? s.inn1 : s.inn2;
  const ctx = side === 'bat' ? { side, needRuns: inn.target + 1 - inn.runs, ballsLeft: 60 - inn.balls } : { side };
  return { samples, segs: W.buildSegments(samples, ctx) };
};
const innOf = (s, side) => (side === 'bowl' ? s.inn1 : s.inn2);

test('constants: contract values', () => {
  assert.equal(WMX.W0, 36); assert.equal(WMX.J, 1.2); assert.equal(WMX.D, 2.0); assert.equal(WMX.COAST, 6.0); assert.equal(WMX.K_SEG, 10);
  assert.equal(WMX.N_SAMP, 2000); assert.equal(WMX.CIRC, 10); assert.equal(WHEEL_RIVAL_BOOST, CLASSIC_RIVAL_OFF - WHEEL_RIVAL_OFF);
  assert.ok(Object.isFrozen(WMX) && Object.isFrozen(DEV_DEFAULTS));
});

test('matchModeOf: missing = classic', () => {
  assert.equal(W.matchModeOf({}), 'classic'); assert.equal(W.matchModeOf(null), 'classic');
  assert.equal(W.matchModeOf({ matchMode: 'wheel' }), 'wheel'); assert.equal(W.matchModeOf({ matchMode: 'x' }), 'classic');
});

test('segments: p sums to 1, widths sum to CIRC, <= K_SEG, starts contiguous, one WIN / one AO at most', () => {
  for (const [s, side, bi] of ALL) {
    const { segs } = segsOf(s, side, bi);
    assert.ok(segs.length >= 1 && segs.length <= WMX.K_SEG, `count ${segs.length}`);
    assert.ok(Math.abs(segs.reduce((a, g) => a + g.p, 0) - 1) < EPS);
    assert.ok(Math.abs(segs.reduce((a, g) => a + g.width, 0) - WMX.CIRC) < EPS);
    let x = 0; for (const g of segs) { assert.ok(Math.abs(g.start - x) < EPS); assert.ok(Math.abs(g.width - g.p * WMX.CIRC) < EPS); x += g.width; }
    assert.ok(segs.filter((g) => g.end === 'WIN').length <= 1); assert.ok(segs.filter((g) => g.end === 'AO').length <= 1);
    assert.equal(new Set(segs.map((g) => g.id)).size, segs.length, 'ids unique');
    for (const g of segs) {
      if (!g.end) { assert.equal(g.id, `${g.runs}w${g.wk}`); assert.equal(g.label, String(g.runs)); assert.ok(g.p >= WMX.MIN_P - EPS || segs.filter((q) => !q.end).length === 1, `${g.id} under MIN_P`); }
      assert.equal(g.stars, g.wk); assert.ok(['good', 'so', 'bad'].includes(g.tone));
      if (side === 'bowl') assert.notEqual(g.end, 'WIN');
    }
  }
});

test('every segment label outcome has >= 1 sample; pickSample returns a matching sample', () => {
  for (const [s, side, bi] of ALL) {
    const { samples, segs } = segsOf(s, side, bi);
    const rng = makeRng('pick');
    for (const g of segs) {
      const hit = samples.filter((x) => (g.end ? x.end === g.end : !x.end && x.runs === g.runs && x.wk === g.wk));
      assert.ok(hit.length >= 1, `${g.id} has no sample`);
      assert.ok(g.members.includes(g.end ? hit[0].key : g.id));
      for (let r = 0; r < 5; r++) {
        const x = W.pickSample(rng, samples, g);
        if (g.end) assert.equal(x.end, g.end); else { assert.equal(x.end, ''); assert.equal(x.runs, g.runs); assert.equal(x.wk, g.wk); }
      }
    }
  }
});

test('T3/T16 sample-vs-label: replaying the picked sample on the live state reproduces the label runs/wk', () => {
  for (const [s, side, bi] of ALL) {
    const { samples, segs } = segsOf(s, side, bi);
    const rng = makeRng('replay');
    for (const g of segs) {
      const x = W.pickSample(rng, samples, g), n = structuredClone(s), inn = innOf(n, side), r0 = inn.runs, w0 = inn.wk;
      const balls = W.replayOver(n, side, bi, x.k);
      assert.equal(inn.runs - r0, x.runs); assert.equal(inn.wk - w0, x.wk);
      assert.ok(balls.length >= 1 && balls.length <= 6);
      if (!g.end) { assert.equal(inn.runs - r0, g.runs); assert.equal(inn.wk - w0, g.wk); }
      if (g.end === 'WIN') assert.ok(inn.runs > inn.target && inn.done);
      if (g.end === 'AO') assert.ok(inn.done);
    }
  }
});

test('sampling never touches the live state', () => {
  const [s, side, bi] = ALL[1]; const before = JSON.stringify(s);
  W.sampleOvers(s, side, bi, { n: 50 }); assert.equal(JSON.stringify(s), before);
});

test('fx (skill effects) read through copies: samples and replay agree, and fx changes the odds', () => {
  const [s, side, bi] = ALL[1];
  const origs = new WeakSet([...s.me.players, ...s.rival.players]);
  const eff = { bat: { bad: 0, eff: [{ k: 'six', v: 0.15 }] }, bowl: { great: 0, eff: [] } };
  const mk = () => { const seen = new WeakSet(); return { of: (p) => (origs.has(p) || seen.has(p) ? eff : undefined), seen }; };
  const fx = mk();
  const samples = W.sampleOvers(s, side, bi, { n: 200, fx, centre: 50, pairing: false, roar: undefined });
  const plain = W.sampleOvers(s, side, bi, { n: 200, fx: undefined, centre: 50, pairing: false, roar: undefined });
  assert.ok(W.expectOf(samples).xr > W.expectOf(plain).xr + 1, 'six boost raises runs');
  for (const x of samples.slice(0, 40)) {
    const n = structuredClone(s), inn = innOf(n, side), r0 = inn.runs, w0 = inn.wk;
    const live = new WeakSet([...n.me.players, ...n.rival.players]);
    W.replayOver(n, side, bi, x.k, { fx: { of: (p) => (live.has(p) ? eff : undefined) }, centre: 50, pairing: false, roar: undefined });
    assert.equal(inn.runs - r0, x.runs); assert.equal(inn.wk - w0, x.wk);
  }
});

test('WIN and ALL OUT are single segments that replay to a win / all out', () => {
  const s0 = chaseState('abc', 3);
  const win = structuredClone(s0); win.inn2.target = win.inn2.runs + 4; // 5 to win
  const { samples, segs } = segsOf(win, 'bat', rivalBowler(win));
  const w = segs.filter((g) => g.end === 'WIN'); assert.equal(w.length, 1); assert.equal(w[0].label, 'WIN'); assert.equal(w[0].tone, 'good');
  assert.ok(samples.filter((x) => x.end === 'WIN').every((x) => x.runs >= 5));
  const x = W.pickSample(makeRng('w'), samples, w[0]), n = structuredClone(win); W.replayOver(n, 'bat', rivalBowler(win), x.k);
  assert.ok(n.inn2.runs > n.inn2.target);
  // last wicket standing: any wicket = ALL OUT
  const ao = structuredClone(bowlState('xyz', 4).get()); ao.inn1.wk = 4;
  const r = segsOf(ao, 'bowl', ourBowler(ao), 1000);
  const a = r.segs.filter((g) => g.end === 'AO'); assert.equal(a.length, 1); assert.equal(a[0].label, 'ALL OUT'); assert.equal(a[0].tone, 'good', 'bowling: all out is good for us');
  assert.ok(r.segs.filter((g) => !g.end).every((g) => g.wk === 0), 'no normal wicket labels left at 4 down');
  const y = W.pickSample(makeRng('a'), r.samples, a[0]), m = structuredClone(ao); W.replayOver(m, 'bowl', ourBowler(ao), y.k);
  assert.ok(m.inn1.done && m.inn1.wk >= 5);
  // batting: ALL OUT is bad for us
  const ab = structuredClone(s0); ab.inn2.wk = 4;
  const b = segsOf(ab, 'bat', rivalBowler(ab), 1000).segs.find((g) => g.end === 'AO'); assert.ok(b); assert.equal(b.tone, 'bad');
});

test('determinism: same state -> same samples and segments; different seed differs', () => {
  const [s, side, bi] = ALL[2];
  const a = segsOf(s, side, bi), b = segsOf(structuredClone(s), side, bi);
  assert.deepEqual(a.samples, b.samples); assert.deepEqual(a.segs, b.segs);
  const t = structuredClone(s); t.seed = 'other';
  assert.notDeepEqual(segsOf(t, side, bi).samples, a.samples);
});

test('wickets kept: label wicket mass vs sampled (normal outcomes) drops < 0.03 an over on average', () => {
  let drop = 0, k = 0;
  for (const [s, side, bi] of ALL) {
    const { samples, segs } = segsOf(s, side, bi, 2000);
    const nrm = samples.filter((x) => !x.end);
    const raw = nrm.reduce((a, x) => a + x.wk, 0) / samples.length;
    const lab = segs.filter((g) => !g.end).reduce((a, g) => a + g.p * g.wk, 0);
    drop += raw - lab; k++;
  }
  assert.ok(Math.abs(drop / k) < 0.03, `avg dropped wicket mass ${(drop / k).toFixed(4)}`);
});

test('zigzag rim order: normal segs best, worst, 2nd best, 2nd worst ... (value for us); WIN first, ALL OUT last', () => {
  let sawAO = 0;
  for (const [s0, side, bi] of ALL) for (const wk of [null, 4]) {
    const s = structuredClone(s0); if (wk != null) innOf(s, side).wk = wk;
    const { segs } = segsOf(s, side, bi);
    const win = segs.findIndex((g) => g.end === 'WIN'); if (win >= 0) assert.equal(win, 0, 'WIN at the top end');
    const ao = segs.findIndex((g) => g.end === 'AO'); if (ao >= 0) { assert.equal(ao, segs.length - 1, 'AO at the bottom end'); sawAO++; }
    const nrm = segs.filter((g) => !g.end), rest = nrm.slice();
    for (let i = 0; i < nrm.length; i++) {
      const vals = rest.map((g) => g.value), want = i % 2 === 0 ? Math.max(...vals) : Math.min(...vals);
      assert.equal(nrm[i].value, want, `pos ${i}`); rest.splice(rest.indexOf(nrm[i]), 1);
    }
  }
  assert.ok(sawAO > 0);
});

test('wicket value: bowl 7, bat clamp(14 - 1.2 x req rate, 3, 10)', () => {
  assert.equal(W.wkValue({ side: 'bowl' }), 7);
  assert.ok(Math.abs(W.wkValue({ side: 'bat', needRuns: 36, ballsLeft: 36 }) - (14 - 1.2 * 6)) < EPS);
  assert.equal(W.wkValue({ side: 'bat', needRuns: 100, ballsLeft: 12 }), 3);
  assert.equal(W.wkValue({ side: 'bat', needRuns: 1, ballsLeft: 60 }), 10);
});

test('segAt, isCareful, unaimedPos, expectOf, stopBucket', () => {
  const [s, side, bi] = ALL[0]; const { samples, segs } = segsOf(s, side, bi);
  segs.forEach((g, i) => { const c = g.start + g.width / 2; assert.equal(W.segAt(segs, c), i); assert.equal(W.segAt(segs, c + WMX.CIRC), i); assert.equal(W.segAt(segs, c - 2 * WMX.CIRC), i); });
  assert.equal(W.isCareful(segs, 0), true); assert.equal(W.isCareful(segs, 1), segs.length === 1 || segs[1].value >= segs[0].value);
  const rng = makeRng('u'); for (let i = 0; i < 200; i++) { const p = W.unaimedPos(rng); assert.ok(p >= 0 && p < WMX.CIRC); }
  const e = W.expectOf(samples); assert.ok(e.xr > 0 && e.xw >= 0);
  assert.deepEqual(W.expectOf([{ runs: 4, wk: 0 }, { runs: 8, wk: 1 }]), { xr: 6, xw: 0.5 });
  assert.equal(W.stopBucket(3.1), 'e'); assert.equal(W.stopBucket(3.2), 'c'); assert.equal(W.stopBucket(3.8), 'c'); assert.equal(W.stopBucket(3.9), 'l');
  assert.equal(W.stopBucket(6.0), 'o'); assert.equal(W.stopBucket(2, true), 'o'); assert.equal(W.stopBucket(NaN), 'o');
});

test('physics: landingPos(e=0) is the honest predicted tick; glide ends on it; wobble shifts by e; coast at 6.0', () => {
  const P = W.matchPhys({});
  assert.deepEqual(P, { W0: 36, TAU: 3, D: 2, J: 1.2, SD: 0.11, COAST: 6, STOP_FROM: 1 });
  const mod = (x) => ((x % 10) + 10) % 10;
  for (const t of [1, 2.5, 3.5, 4.2, 5.9]) for (const phi of [0, 3.3, 9.9]) {
    const pred = mod(phi + 36 * 3 * (1 - Math.exp(-t / 3)) + 36 * Math.exp(-t / 3) * 2 / 3);
    const L = W.landingPos(P, { t, phi, e: 0 });
    assert.ok(Math.abs(L - pred) < 1e-9, `t ${t}`);
    assert.equal(W.glidePos(P, { t, phi, e: 0 }, P.D), L);
    assert.ok(Math.abs(W.glidePos(P, { t, phi, e: 0 }, 0) - W.rimAt(P, t, phi)) < 1e-9, 'glide starts at the pointer');
    assert.ok(Math.abs(mod(W.landingPos(P, { t, phi, e: 0.7 }) - L) - 0.7) < 1e-9);
  }
  assert.equal(W.landingPos(P, { t: 7.5, phi: 1, e: 0 }), W.landingPos(P, { t: 6.0, phi: 1, e: 0 }), 'coast at 6.0');
  assert.equal(W.landingPos(P, { t: 6.0, phi: 1, e: 5 }), W.landingPos(P, { t: 6.0, phi: 1, e: 1.2 }), 'wobble clamped to J');
  assert.equal(W.landingPos(P, { t: 6.0, phi: 1 }), W.landingPos(P, { t: 6.0, phi: 1, e: 0 }));
  const r = W.rimAt(P, 2, 1); assert.ok(r >= 0 && r < 10);
});

test('devClamp: NaN, strings, negatives, out of range, missing', () => {
  assert.deepEqual(W.devClamp(undefined), { ...DEV_DEFAULTS });
  assert.deepEqual(W.devClamp({ on: true, matchW0: NaN, matchJ: 'abc', matchD: -3, otherMult: 99 }), { on: true, matchW0: 36, matchJ: 1.2, matchD: 0.5, otherMult: 3 });
  assert.deepEqual(W.devClamp({ on: 'yes', matchW0: 5, matchJ: 9, matchD: 100, otherMult: -1 }), { on: false, matchW0: 12, matchJ: 3, matchD: 4, otherMult: 0.25 });
  assert.equal(W.devClamp({ matchW0: 1000 }).matchW0, 90); assert.equal(W.devClamp({ matchW0: '50' }).matchW0, 36); assert.equal(W.devClamp({ matchW0: Infinity }).matchW0, 36);
  assert.equal(W.devClamp({ matchJ: 0.73 }).matchJ, 0.7); assert.equal(W.devClamp({ otherMult: 1.37 }).otherMult, 1.35);
});

test('devVal: off ignores saved values; devChanged lists changed keys only when on', () => {
  assert.equal(W.devVal({ dev: { on: false, matchW0: 50 } }, 'matchW0'), 36);
  assert.equal(W.devVal({}, 'matchJ'), 1.2);
  assert.equal(W.devVal({ dev: { on: true, matchW0: 50 } }, 'matchW0'), 50);
  assert.equal(W.devVal({ dev: { on: true, matchW0: 500 } }, 'matchW0'), 90);
  assert.equal(W.devVal({ dev: { on: true } }, 'matchD'), 2.0);
  assert.deepEqual(W.devChanged({ dev: { on: false, matchW0: 50 } }), {});
  assert.deepEqual(W.devChanged({ dev: { on: true, matchW0: 50, matchJ: 1.2, otherMult: 2 } }), { matchW0: 50, otherMult: 2 });
  assert.deepEqual(W.matchPhys({ dev: { on: false, matchW0: 50, matchD: 3 } }).W0, 36);
});

test('matchPhys: Control ranks (Slow 3 x0.55, Steady 2 x0.7225, Aim Guide sd 0.080); T-dev-4 dev 50 + Slow 3 = 27.5', (t) => {
  const was = FLAGS.wheelMeta; t.after(() => { FLAGS.wheelMeta = was; });
  const st = (owned, dev) => ({ wheelMeta: { owned, tally: 0, spokes: 0, spent: 0, tokens: {} }, ...(dev ? { dev } : {}) });
  FLAGS.wheelMeta = false;
  assert.equal(W.matchPhys(st({ c_slow: 3 })).W0, 36, 'flag off: no Control');
  assert.deepEqual(W.ctrlOf(st({ c_slow: 3, c_guide: 1 })), { slowRank: 0, steadyRank: 0, guide: false, zone: false, chime: false });
  FLAGS.wheelMeta = true;
  assert.ok(Math.abs(W.matchPhys(st({ c_slow: 3 })).W0 - 36 * 0.55) < EPS);
  assert.ok(Math.abs(W.matchPhys(st({ c_slow: 1 })).W0 - 36 * 0.85) < EPS);
  assert.ok(Math.abs(W.matchPhys(st({ c_slow: 2 })).W0 - 36 * 0.70) < EPS);
  assert.ok(Math.abs(W.matchPhys(st({ c_steady: 1 })).J - 1.2 * 0.85) < EPS);
  assert.ok(Math.abs(W.matchPhys(st({ c_steady: 2 })).J - 1.2 * WMX.STEADY_FULL) < EPS);
  const g = W.matchPhys(st({ c_guide: 1 })); assert.equal(g.SD, WMX.SD_GUIDE_AVG); assert.equal(W.matchPhys(st({})).SD, WMX.SD_AVG);
  assert.deepEqual(W.ctrlOf(st({ c_slow: 2, c_steady: 1, c_guide: 1, c_zone: 1, c_chime: 1 })), { slowRank: 2, steadyRank: 1, guide: true, zone: true, chime: true });
  assert.ok(Math.abs(W.matchPhys(st({ c_slow: 3 }, { on: true, matchW0: 50 })).W0 - 27.5) < EPS, 'T-dev-4');
  assert.ok(Math.abs(W.matchPhys(st({ c_steady: 2 }, { on: true, matchJ: 2 })).J - 2 * 0.7225) < EPS);
});

test('T-dev-6: segment widths bit-equal at match W0 12 / 36 / 90 (speed never changes odds)', () => {
  const [s, side, bi] = ALL[4];
  const json = [12, 36, 90].map((w0) => {
    const x = { ...s, dev: { on: true, matchW0: w0 } };
    assert.equal(W.matchPhys(x).W0, w0);
    return JSON.stringify(segsOf(x, side, bi).segs.map((g) => [g.id, g.width, g.start]));
  });
  assert.equal(json[0], json[1]); assert.equal(json[1], json[2]);
});

test('wheelOverModel: memoised, Expected line, need in a chase', () => {
  const s = chaseState('xyz', 2), bi = rivalBowler(s);
  const m = W.wheelOverModel(s, 'bat', bi, { n: 300 });
  assert.equal(W.wheelOverModel(s, 'bat', bi, { n: 300 }), m, 'memo hit');
  assert.deepEqual(m.need, { runs: s.inn2.target + 1 - s.inn2.runs, balls: 60 - s.inn2.balls });
  assert.deepEqual(m.expect, W.expectOf(m.samples)); assert.equal(m.samples.length, 300);
  const b = bowlState('xyz', 2).get(), mb = W.wheelOverModel(b, 'bowl', ourBowler(b), { n: 300 });
  assert.equal(mb.need, undefined);
});

test('timing: full N_SAMP build per over', (t) => {
  const [s, side, bi] = ALL[4];
  W.sampleOvers(s, side, bi, { n: 200 }); // warm up
  const ms = [];
  for (const [x, sd, b] of ALL.slice(0, 6)) {
    const t0 = performance.now();
    const samples = W.sampleOvers(x, sd, b);
    W.buildSegments(samples, { side: sd, needRuns: 30, ballsLeft: 30 });
    ms.push(performance.now() - t0);
  }
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  t.diagnostic(`build n=${WMX.N_SAMP}: avg ${avg.toFixed(1)} ms, max ${Math.max(...ms).toFixed(1)} ms`);
  assert.ok(avg < 500, `avg ${avg} ms`);
});
