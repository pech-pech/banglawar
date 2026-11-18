// Wheel settings build 2026-11-18 (BUILD-TICKET items 2-5 + Dev tickW / tickL): pace values, Dev tick lead, Dev pulse cycle length.
// Default parity: Dev off, or Dev on with untouched rows, must give today's landings and pulse exactly (strict ===, no epsilon).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_MATCH as WMX, AUTO_PACE, BALL_SPEED, DEV_DEFAULTS, DEV_RANGE } from '../js/data/wheelmatch.js';
import { WHEEL_ENGINE as WE } from '../js/data/wheel-engine.js';
import { matchPhys, devClamp, devVal, devChanged, landingPos, rimAt, stopBucket, pulseWindow } from '../js/core/wheelmatch.js';
import { landSplit } from '../js/core/landtick.js';
import { pulseW, cycleOf, tickAt } from '../js/core/wheel-pulse.js';
import { glowPhase, glowG, ballDelay } from '../js/ui/wheelmatch-view.js';
import { devReset, setDev } from '../js/store/wheelmatch-store.js';
import { devLine } from '../js/report/wmatch.js';
import { DEV_KEYS, DEV_GROUPS, devSectionHtml, devPatch, devFmt, sliderHtml } from '../js/ui/wheelmatch-settings.js';

const on = (patch) => ({ dev: devClamp({ on: true, ...patch }) });
/** Today's match phys, written out by hand (before the Dev lead / cycle keys existed). */
const TODAY = Object.freeze({ W0: 36, TAU: 3, D: 2, J: 1.2, SD: 0.11, glideDeg: Object.freeze([60, 120]) });
const TS = []; for (let ms = 0; ms <= 30000; ms += 7) TS.push(ms / 1000);
const PHI = [0, 1.37, 4.9, 9.99];

// ---------- items 2 + 3: pace for all, no switch (expected values updated deliberately from 0.6 / 0.9 and over 4)
test('item 2: AUTO_PACE is 0.3 a quiet over, 0.45 an event over', () => {
  assert.equal(AUTO_PACE.over, 0.3); assert.equal(AUTO_PACE.event, 0.45);
});
test('item 3: BALL_SPEED fast from over 1; 4 / 6 / W and the last two overs stay 0.4 s', () => {
  assert.equal(BALL_SPEED.fastFrom, 1);
  for (const over of [1, 2, 3, 8]) { for (const o of [0, 1, 2]) assert.equal(ballDelay(o, over), 0.2); for (const o of [4, 6, 'W']) assert.equal(ballDelay(o, over), 0.4); }
  for (const over of [9, 10]) for (const o of [0, 1, 4, 'W']) assert.equal(ballDelay(o, over), 0.4);
});

// ---------- item 4: tick lead
test('item 4 parity: Dev off and Dev on untouched give the very same glideDeg and landings as today', () => {
  for (const s of [{}, { dev: { on: false, matchLeadMin: 30, matchLeadMax: 180, matchCycle: 9 } }, on({})]) {
    const P = matchPhys(s);
    assert.equal(P.glideDeg, WMX.GLIDE_DEG, 'the frozen engine array itself');
    assert.deepEqual(P, { ...TODAY, glideDeg: WMX.GLIDE_DEG });
    for (const t of TS) for (const phi of PHI) {
      assert.equal(landingPos(P, { t, phi, e: 0 }), landingPos(TODAY, { t, phi, e: 0 }));
      assert.equal(landingPos(P, { t, phi, e: 0.4 }), landingPos(TODAY, { t, phi, e: 0.4 }));
    }
  }
  assert.equal(DEV_DEFAULTS.matchLeadMin, WMX.GLIDE_DEG[0]); assert.equal(DEV_DEFAULTS.matchLeadMax, WMX.GLIDE_DEG[1]);
});
test('item 4: lead sliders change glideDeg and the tick lead (slow point = min, full speed = max)', () => {
  const P = matchPhys(on({ matchLeadMin: 30, matchLeadMax: 180 }));
  assert.deepEqual([...P.glideDeg], [30, 180]);
  const deg = (u) => u * 360 / WE.CIRC;
  assert.ok(Math.abs(deg(landSplit(P, WE.PULSE_FROM).dist) - 30) < 1e-9, 'slow point: min lead');
  assert.ok(Math.abs(deg(landSplit(P, 0).dist) - 180) < 1e-9, 'full speed: max lead');
  assert.ok(Math.abs(deg(landSplit(matchPhys({}), 0).dist) - 120) < 1e-9);
  let diff = 0; for (const t of TS) if (landingPos(P, { t, phi: 0, e: 0 }) !== landingPos(TODAY, { t, phi: 0, e: 0 })) diff++;
  assert.ok(diff > TS.length * 0.9, 'landings move with the lead');
});
test('item 4: ranges 30-120 / 60-180, min <= max kept (clamp raises max; sliders push the partner)', () => {
  assert.deepEqual(DEV_RANGE.matchLeadMin.slice(0, 2), [30, 120]); assert.deepEqual(DEV_RANGE.matchLeadMax.slice(0, 2), [60, 180]);
  const c = devClamp({ on: true, matchLeadMin: 110, matchLeadMax: 70 });
  assert.equal(c.matchLeadMin, 110); assert.equal(c.matchLeadMax, 110);
  assert.equal(devClamp({ matchLeadMin: 5, matchLeadMax: 999 }).matchLeadMin, 30); assert.equal(devClamp({ matchLeadMax: 999 }).matchLeadMax, 180);
  const d = devClamp({ on: true });
  assert.deepEqual(devPatch(d, 'matchLeadMin', 150), { matchLeadMin: 150, matchLeadMax: 150 });
  assert.deepEqual(devPatch(d, 'matchLeadMax', 40), { matchLeadMax: 40, matchLeadMin: 40 });
  assert.deepEqual(devPatch(d, 'matchLeadMin', 90), { matchLeadMin: 90 });
  const s = setDev({ dev: d }, { patch: devPatch(d, 'matchLeadMax', 70) }); // max 70 pulls min 60 -> stays 60 (<= 70)
  assert.equal(s.dev.matchLeadMax, 70); assert.equal(s.dev.matchLeadMin, 60);
  const s2 = setDev({ dev: d }, { patch: devPatch(d, 'matchLeadMin', 120) });
  assert.equal(s2.dev.matchLeadMin, 120); assert.equal(s2.dev.matchLeadMax, 120);
  for (const k of ['matchLeadMin', 'matchLeadMax']) { const g = matchPhys(on({ matchLeadMin: 120, matchLeadMax: 60 })).glideDeg; assert.ok(g[0] <= g[1], k); }
});

// ---------- item 5: pulse cycle length
test('item 5 parity: default cycle adds no pulse keys; bucket, glow and pulse exactly as today', () => {
  for (const s of [{}, on({})]) {
    const P = matchPhys(s);
    for (const k of ['PULSE_PERIOD', 'PULSE_FROM', 'GLOW', 'GLOW_BEAT']) assert.equal(k in P, false, k);
    assert.equal(glowG(P), WMX);
    for (const t of TS) {
      assert.equal(stopBucket(t, false, P), stopBucket(t));
      assert.deepEqual(glowPhase(t, glowG(P)), glowPhase(t));
      assert.equal(rimAt(P, t, 0.5), rimAt(TODAY, t, 0.5));
      assert.equal(tickAt(t, P), tickAt(t, TODAY));
    }
  }
  const w = pulseWindow(6);
  assert.equal(w.PULSE_PERIOD, WE.PULSE_PERIOD); assert.equal(w.PULSE_FROM, WE.PULSE_FROM); assert.deepEqual([...w.GLOW], [...WE.GLOW]); assert.equal(w.GLOW_BEAT, WMX.GLOW_BEAT);
  assert.equal(DEV_DEFAULTS.matchCycle, WE.PULSE_PERIOD);
});
test('item 5: a 10 s cycle scales the slow point (3.8/6) and the STOP glow (3.2-3.8 of 6)', () => {
  const P = matchPhys(on({ matchCycle: 10 })), k = 10 / 6;
  assert.equal(P.PULSE_PERIOD, 10);
  assert.ok(Math.abs(P.PULSE_FROM - 3.8 * k) < 1e-12); assert.ok(Math.abs(P.GLOW[0] - 3.2 * k) < 1e-12 && Math.abs(P.GLOW[1] - 3.8 * k) < 1e-12);
  assert.equal(cycleOf(12, P).cycle, 2); assert.equal(cycleOf(12).cycle, 3);
  // slowest at the scaled slow point, back to W0 at the cycle end
  assert.ok(pulseW(P.PULSE_FROM, P) < pulseW(P.PULSE_FROM - 0.5, P) && pulseW(P.PULSE_FROM, P) < pulseW(P.PULSE_FROM + 0.5, P));
  assert.ok(Math.abs(pulseW(9.999999, P) - P.W0) < 1e-3);
  // glow + bucket follow the scaled window: 5.5 s is careful at 10 s, late at 6 s
  assert.equal(stopBucket(5.5, false, P), 'c'); assert.equal(stopBucket(5.5), 'l'); assert.equal(stopBucket(3.3, false, P), 'e'); assert.equal(stopBucket(3.3), 'c');
  assert.equal(glowPhase(5.5, glowG(P)).on, true); assert.equal(glowPhase(5.5).on, false); assert.equal(glowPhase(3.5, glowG(P)).on, false);
  assert.equal(glowPhase(15.5, glowG(P)).on, true, 'every cycle');
  assert.deepEqual([5.4, 5.75, 6.1].map((t) => glowPhase(t, glowG(P)).beat), [0, 1, 2], 'three half-beats across the scaled window');
  // the tick lead window uses the scaled slow point: min lead there
  assert.ok(Math.abs(landSplit(P, P.PULSE_FROM).dist * 36 - 60) < 1e-9);
  let diff = 0; for (const t of TS) if (rimAt(P, t, 0) !== rimAt(TODAY, t, 0)) diff++;
  assert.ok(diff > TS.length * 0.5, 'the wheel turns differently (the first 3.8 s decay is the same)');
  const P3 = matchPhys(on({ matchCycle: 3 })); assert.equal(P3.PULSE_PERIOD, 3); assert.equal(stopBucket(1.75, false, P3), 'c');
  assert.equal(devClamp({ matchCycle: 99 }).matchCycle, 10); assert.equal(devClamp({ matchCycle: 1 }).matchCycle, 3); assert.equal(devClamp({ matchCycle: 6.04 }).matchCycle, 6);
});

// ---------- tickW / tickL (maker B reads them via devVal when Dev on AND Tick = Bold)
test('tickW / tickL: defaults are the Bold tick size (5 x 22 px), ranges 2-8 / 8-24 step 1, off = defaults', () => {
  assert.equal(DEV_DEFAULTS.tickW, 5); assert.equal(DEV_DEFAULTS.tickL, 22); // lead 2026-11-18: 16 -> 22 (updated deliberately)
  assert.deepEqual([...DEV_RANGE.tickW], [2, 8, 1]); assert.deepEqual([...DEV_RANGE.tickL], [8, 24, 1]);
  assert.equal(devVal({ dev: { on: false, tickW: 8 } }, 'tickW'), 5); assert.equal(devVal(on({ tickW: 8, tickL: 9.6 }), 'tickW'), 8); assert.equal(devVal(on({ tickL: 9.6 }), 'tickL'), 10);
  assert.deepEqual(devChanged(on({})), {});
});

// ---------- report stamp, Reset all, rows
test('report dev: line stamps the new keys by itself (devChanged loops DEV_RANGE)', () => {
  const s = on({ matchLeadMin: 45, matchCycle: 8, tickW: 7 });
  assert.deepEqual(devChanged(s), { matchLeadMin: 45, matchCycle: 8, tickW: 7 });
  assert.equal(devLine(devChanged(s)), 'dev: matchLeadMin=45 matchCycle=8 tickW=7');
  assert.equal(devLine(devChanged({ dev: { ...s.dev, on: false } })), null);
});
test('G3: Reset all returns EVERY DEV_RANGE key to its default (keeps on)', () => {
  /** @type {any} */ const off = { on: true };
  for (const [k, [lo, hi]] of Object.entries(DEV_RANGE)) off[k] = DEV_DEFAULTS[k] === hi ? lo : hi;
  const s = { dev: devClamp(off) };
  for (const k of Object.keys(DEV_RANGE)) assert.notEqual(s.dev[k], DEV_DEFAULTS[k], k + ' set off default');
  const r = devReset(s, { all: true });
  assert.deepEqual(r.dev, { ...devClamp({}), on: true });
  for (const k of Object.keys(DEV_RANGE)) assert.equal(r.dev[k], DEV_DEFAULTS[k], k);
  assert.deepEqual(devChanged(r), {});
  const one = devReset(s, { key: 'matchCycle' }); assert.equal(one.dev.matchCycle, 6); assert.equal(one.dev.tickW, s.dev.tickW);
});
test('settings rows: every new key is a labelled 56 px slider in a named fold, readouts in words', () => {
  for (const k of ['matchLeadMin', 'matchLeadMax', 'matchCycle', 'tickW', 'tickL']) assert.ok(DEV_KEYS.includes(k), k);
  const sec = devSectionHtml({ on: true }, true);
  for (const g of DEV_GROUPS) {
    const i = sec.indexOf('data-wm-group="' + g.id + '"'); assert.ok(i > 0, g.id);
    assert.match(sec.slice(i), new RegExp('^data-wm-group="' + g.id + '"><summary>[^<]{3,}</summary>'));
    for (const k of g.keys) assert.match(sec, new RegExp(`data-wm-key="${k}" min="${DEV_RANGE[k][0]}" max="${DEV_RANGE[k][1]}" step="${DEV_RANGE[k][2]}"`));
  }
  assert.match(sec, /class="wms-adv" data-wm-group="tick"><summary>Tick size \(Bold tick\)<\/summary><p class="wms-note">Only with Tick set to Bold\.<\/p>/);
  assert.equal(devFmt('matchLeadMin', 60), '60 deg'); assert.equal(devFmt('matchCycle', 6), '6.0 s'); assert.equal(devFmt('tickW', 5), '5 px');
  assert.match(sliderHtml('matchCycle', 6), /data-wm-chip="matchCycle" hidden>tweaked/); assert.match(sliderHtml('matchCycle', 7.5), /data-wm-chip="matchCycle">tweaked/);
  assert.match(sec, /aria-label="Reset all Dev values">Reset all</);
});

// ---------- checker fix: StopRec cycle / tInCycle follow the Dev cycle length (store fallback + wheel-stops clamp)
test('Dev cycle 10 s: a stop at 18.5 s is cycle 2 at 8.5 s, stored unclamped; default still the 6 s grid', async () => {
  const { stopTiming } = await import('../js/store/spins/match.js');
  const { recordStop } = await import('../js/core/wheel-stops.js');
  const P = matchPhys(on({ matchCycle: 10 }));
  const tm = stopTiming({ t: 18.5, phi: 0 }, P);
  assert.deepEqual(tm, { stopT: 18500, cycle: 2, tInCycle: 8.5 });
  assert.deepEqual(stopTiming({ t: 18.5, phi: 0 }, matchPhys({})), stopTiming({ t: 18.5, phi: 0 }), 'default phys = the old fallback');
  assert.deepEqual(stopTiming({ t: 18.5, phi: 0 }), { stopT: 18500, cycle: 4, tInCycle: 0.5 });
  const n = {}; recordStop(n, 'match', 'k', { ...tm, sliceId: 3, value: 4, auto: false, respin: 0 });
  const r = n.wheels.stops.match.k.stops[0];
  assert.equal(r.tInCycle, 8.5, 'not clamped to 6'); assert.equal(r.cycle, 2);
  assert.ok(Math.abs((r.cycle - 1) * P.PULSE_PERIOD + r.tInCycle - r.stopT / 1000) < 1e-9, 'record matches its stop time');
  const m = {}; recordStop(m, 'match', 'k', { ...tm, tInCycle: 12, sliceId: 0, value: 0 }); assert.equal(m.wheels.stops.match.k.stops[0].tInCycle, 10, 'cap = Dev cycle max');
});
