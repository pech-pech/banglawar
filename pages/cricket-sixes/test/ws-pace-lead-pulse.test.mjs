// Black-box spec tests from BUILD-TICKET 2026-11-18 wheel settings, items 2-5 (+ Dev keys tickW / tickL). Written from the ticket, not from maker tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand as C } from '../js/store/commands.js';
import { AUTO_PACE, BALL_SPEED, DEV_DEFAULTS, DEV_RANGE } from '../js/data/wheelmatch.js';
import { WHEEL_ENGINE as E } from '../js/data/wheel-engine.js';
import { devClamp, devVal, devChanged, matchPhys } from '../js/core/wheelmatch.js';
import { glideCap, landSplit } from '../js/core/landtick.js';
import { pulseW, pulseArc, tickAt, cycleOf, ARC_PER_CYCLE } from '../js/core/wheel-pulse.js';
import { autoPace, ballDelay, ballTimes, glowPhase, glowG } from '../js/ui/wheelmatch-view.js';

const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);
const game = (seed = 'ws-1') => C(null, 'NewGame', { seed });
const dev = (s, patch) => C(s, 'SetDev', { patch });
const on = (patch) => dev(dev(game(), { on: true }), patch);

// ---- item 2
test('AUTO_PACE is {over 0.3, event 0.45}', () => {
  assert.equal(AUTO_PACE.over, 0.3); assert.equal(AUTO_PACE.event, 0.45);
});
test('autoPace: 0.3 plain over; 0.45 for wicket, innings end, last over', () => {
  assert.equal(autoPace([{ o: 1 }, { o: 4 }, { o: 0 }]), 0.3);
  assert.equal(autoPace([]), 0.3);
  assert.equal(autoPace([{ o: 1 }, { o: 'W' }]), 0.45);
  assert.equal(autoPace([{ o: 1 }], { end: true }), 0.45);
  assert.equal(autoPace([{ o: 1 }], { lastOver: true }), 0.45);
});

// ---- item 3
test('BALL_SPEED.fastFrom is 1, full 0.4, plain 0.2', () => {
  assert.equal(BALL_SPEED.fastFrom, 1); assert.equal(BALL_SPEED.full, 0.4); assert.equal(BALL_SPEED.plain, 0.2);
});
test('ballDelay: dot/1/2 0.2 s from over 1; 4/6/W 0.4; last two overs of 10 all 0.4', () => {
  for (let over = 1; over <= 8; over++) {
    for (const o of [0, 1, 2]) assert.equal(ballDelay(o, over, 10), 0.2, `plain ${o} over ${over}`);
    for (const o of [4, 6, 'W']) assert.equal(ballDelay(o, over, 10), 0.4, `event ${o} over ${over}`);
  }
  for (const over of [9, 10]) for (const o of [0, 1, 2, 4, 6, 'W']) assert.equal(ballDelay(o, over, 10), 0.4);
});
test('ballTimes: cumulative per over', () => {
  const balls = [0, 1, 4, 2, 'W', 6].map((o) => ({ o }));
  const t = ballTimes(balls, 2, 10);
  [0.2, 0.4, 0.8, 1.0, 1.4, 1.8].forEach((w, i) => near(t[i], w, 1e-9, 'over 2 ball ' + i));
  const t9 = ballTimes(balls, 9, 10);
  [0.4, 0.8, 1.2, 1.6, 2.0, 2.4].forEach((w, i) => near(t9[i], w, 1e-9, 'over 9 ball ' + i));
});

// ---- item 4 + keys
test('Dev keys exist with ticket ranges and defaults', () => {
  const want = { matchLeadMin: [30, 120, 60], matchLeadMax: [60, 180, 120], matchCycle: [3, 10, 6], tickW: [2, 8, 5], tickL: [8, 24, 22] }; // lead 2026-11-18: tickL default 16 -> 22
  for (const [k, [lo, hi, d]] of Object.entries(want)) {
    assert.ok(k in DEV_RANGE, k + ' in DEV_RANGE'); assert.equal(DEV_RANGE[k][0], lo); assert.equal(DEV_RANGE[k][1], hi);
    assert.equal(DEV_DEFAULTS[k], d);
  }
});
test('devClamp: out of range clamps, bad values default, min <= max enforced', () => {
  for (const k of ['matchLeadMin', 'matchLeadMax', 'matchCycle', 'tickW', 'tickL']) {
    const [lo, hi] = DEV_RANGE[k];
    assert.equal(devClamp({ [k]: lo - 100 })[k], k === 'matchLeadMax' ? lo : lo);
    assert.equal(devClamp({ [k]: hi + 100 })[k], hi);
    for (const bad of [NaN, 'x', null, undefined, Infinity]) assert.equal(devClamp({ [k]: bad })[k], DEV_DEFAULTS[k], k + ' ' + String(bad));
  }
  const c = devClamp({ matchLeadMin: 110, matchLeadMax: 70 });
  assert.ok(c.matchLeadMin <= c.matchLeadMax, `${c.matchLeadMin} <= ${c.matchLeadMax}`);
  const s = on({ matchLeadMin: 110, matchLeadMax: 70 });
  assert.ok(devVal(s, 'matchLeadMin') <= devVal(s, 'matchLeadMax'));
  assert.ok(matchPhys(s).glideDeg[0] <= matchPhys(s).glideDeg[1]);
});
test('defaults reproduce today glide exactly (60..120 deg, same landSplit as the old formula)', () => {
  const P = matchPhys(game());
  assert.deepEqual([...P.glideDeg], [60, 120]);
  for (const s of [on({}), dev(on({ matchLeadMin: 90, matchLeadMax: 150, matchCycle: 4 }), { on: false })]) assert.deepEqual([...matchPhys(s).glideDeg], [60, 120]);
  const wMin = pulseW(3.8, { W0: 36 });
  for (let t = 0; t < 13; t += 0.137) {
    const w = pulseW(cycleOf(t).tInCycle, P);
    const x = Math.max(0, Math.min(1, (w - wMin) / (36 - wMin)));
    near(landSplit(P, t).dist, (60 + 60 * x) * 10 / 360, 1e-9, 'dist t=' + t);
  }
});
test('lead min/max feed glideDeg and glideCap bounds', () => {
  const s = on({ matchLeadMin: 90, matchLeadMax: 150 }), P = matchPhys(s);
  assert.deepEqual([...P.glideDeg], [90, 150]);
  const w0 = P.W0, wMin = pulseW(3.8, P);
  near(glideCap(P, w0), 150 * 10 / 360, 1e-9, 'fast end = max');
  near(glideCap(P, wMin), 90 * 10 / 360, 1e-9, 'slow end = min');
  near(glideCap(P, (w0 + wMin) / 2), 120 * 10 / 360, 1e-9, 'mid');
  for (let t = 0; t < 12; t += 0.2) { const d = landSplit(P, t).dist * 36; assert.ok(d >= 90 - 1e-9 && d <= 150 + 1e-9); }
});

// ---- item 5
test('pulse cycle 6 (default) gives today wheel exactly', () => {
  for (const P of [matchPhys(game()), matchPhys(on({ matchCycle: 6 }))]) {
    for (let t = 0; t < 14; t += 0.173) {
      assert.equal(pulseW(cycleOf(t, P).tInCycle, P), pulseW(cycleOf(t).tInCycle));
      assert.equal(pulseArc(cycleOf(t, P).tInCycle, P), pulseArc(cycleOf(t).tInCycle));
    }
    near(ARC_PER_CYCLE(P), 128.327, 0.01, 'arc/cycle');
    assert.equal(cycleOf(12.5, P).cycle, 3);
  }
});
test('pulse cycle N scales slow point (3.8/6) and STOP glow (3.2-3.8 of 6)', () => {
  for (const n of [3, 4.5, 8, 10]) {
    const P = matchPhys(on({ matchCycle: n })), k = n / 6;
    near(P.PULSE_PERIOD, n, 1e-9, 'period'); near(P.PULSE_FROM, 3.8 * k, 1e-9, 'slow point');
    near(P.GLOW[0], 3.2 * k, 1e-9, 'glow lo'); near(P.GLOW[1], 3.8 * k, 1e-9, 'glow hi');
    assert.equal(cycleOf(n * 2 + 0.5, P).cycle, 3);
    near(pulseW(3.8 * k, P), 36 * Math.exp(-3.8 * k / 3), 1e-9, 'w at slow point');
    near(pulseW(n, P), 36, 1e-9, 'w at cycle end');
    assert.equal(glowPhase(3.0 * k, glowG(P)).on, false);
    assert.equal(glowPhase(3.5 * k, glowG(P)).on, true);
    assert.equal(glowPhase(4.2 * k, glowG(P)).on, false);
    assert.equal(glowPhase(n + 3.5 * k, glowG(P)).on, true, 'every cycle');
  }
});
test('default glowPhase unchanged (3.2-3.8 s of 6)', () => {
  assert.equal(glowPhase(3.0).on, false); assert.equal(glowPhase(3.5).on, true); assert.equal(glowPhase(9.5).on, true);
  assert.equal(glowPhase(3.5, glowG(matchPhys(game()))).on, true);
});

// ---- Dev off / stamps
test('Dev off ignores saved values; on uses them', () => {
  const s = dev(on({ matchLeadMin: 100, matchLeadMax: 170, matchCycle: 9, tickW: 7, tickL: 20 }), { on: false });
  assert.equal(s.dev.matchCycle, 9);
  for (const k of ['matchLeadMin', 'matchLeadMax', 'matchCycle', 'tickW', 'tickL']) assert.equal(devVal(s, k), DEV_DEFAULTS[k]);
  const P = matchPhys(s);
  assert.deepEqual([...P.glideDeg], [60, 120]); assert.ok(P.PULSE_PERIOD === undefined || P.PULSE_PERIOD === 6);
  assert.deepEqual(devChanged(s), {});
  const o = dev(s, { on: true });
  assert.equal(devVal(o, 'matchCycle'), 9); assert.deepEqual([...matchPhys(o).glideDeg], [100, 170]);
});
test('devChanged stamps only changed new keys when on', () => {
  assert.deepEqual(devChanged(on({})), {});
  const ch = devChanged(on({ matchLeadMin: 80, matchCycle: 8, tickW: 6, tickL: 12 }));
  assert.deepEqual(ch, { matchLeadMin: 80, matchCycle: 8, tickW: 6, tickL: 12 });
  assert.equal('matchLeadMax' in devChanged(on({ matchLeadMax: 150 })), true);
});
test('DevReset all returns the new keys to defaults', () => {
  const s = C(on({ matchLeadMin: 80, matchLeadMax: 170, matchCycle: 9, tickW: 7, tickL: 20 }), 'DevReset', { all: true });
  for (const k of ['matchLeadMin', 'matchLeadMax', 'matchCycle', 'tickW', 'tickL']) assert.equal(s.dev[k], DEV_DEFAULTS[k], k);
  assert.equal(s.dev.on, true);
});
