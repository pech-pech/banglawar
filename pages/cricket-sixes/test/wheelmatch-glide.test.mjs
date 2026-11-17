// Match wheel glide cap (2026-11-17, M): phys.glideDeg = [60, 120] keeps the landing tick 60..120 degrees ahead of the pointer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/core/rng.js';
import * as W from '../js/core/wheelmatch.js';
import { WHEEL_MATCH as WMX } from '../js/data/wheelmatch.js';
import { WHEEL_ENGINE as WE } from '../js/data/wheel-engine.js';
import { pulseW, cycleOf, tickAt } from '../js/core/wheel-pulse.js';
import { landSplit, glideCap } from '../js/core/landtick.js';

const C = WE.CIRC, toDeg = (u) => u * 360 / C, EPS = 1e-9;
const modC = (x) => ((x % C) + C) % C;
/** Tick offset ahead of the pointer in degrees: landingPos(e=0) - rimAt, mod the ring. */
const offDeg = (P, t, phi) => toDeg(modC(W.landingPos(P, { t, phi, e: 0 }) - W.rimAt(P, t, phi)));
// Control ranks: base, Slow 1..3 (W0 x (1 - 0.15/rank)), Steady 1..2 (J only, W0 unchanged)
const physes = [['base', W.matchPhys({})]];
for (const sl of [0, 1, 2, 3]) physes.push([`slow${sl}`, { ...W.matchPhys({}), W0: WE.W0 * (1 - WMX.SLOW_PER_RANK * sl) }]);
for (const st of [1, 2]) physes.push([`steady${st}`, { ...W.matchPhys({}), J: WE.J * Math.pow(0.85, st) }]);

test('match phys carries glideDeg [60,120]', () => { assert.deepEqual(W.matchPhys({}).glideDeg, [60, 120]); });

test('tick offset stays within 60..120 degrees for t = 0..60 s (step 0.01), all Slow / Steady ranks, seeded phi', () => {
  const rng = makeRng('glide-sweep');
  for (const [name, P] of physes) for (let i = 0; i <= 6000; i++) {
    const t = i / 100, d = offDeg(P, t, rng.random() * C);
    assert.ok(d >= 60 - 1e-6 && d <= 120 + 1e-6, `${name} t ${t}: ${d} deg`);
  }
});

test('glideCap is monotone non-decreasing in pulse speed and spans 60..120 degrees', () => {
  for (const [name, P] of physes) {
    const wMin = pulseW(WE.PULSE_FROM, P);
    let prev = -Infinity;
    for (let i = 0; i <= 1000; i++) { const w = wMin + (P.W0 - wMin) * i / 1000, g = toDeg(glideCap(P, w)); assert.ok(g >= prev - EPS, `${name} i ${i}`); prev = g; }
    assert.ok(Math.abs(toDeg(glideCap(P, wMin)) - 60) < 1e-9 && Math.abs(toDeg(glideCap(P, P.W0)) - 120) < 1e-9, `${name} endpoints`);
    assert.ok(Math.abs(toDeg(glideCap(P, wMin - 5)) - 60) < 1e-9 && Math.abs(toDeg(glideCap(P, P.W0 + 5)) - 120) < 1e-9, `${name} clamped outside range`);
    // along the cycle: a faster pulse never gives a smaller glide
    const pts = []; for (let i = 0; i <= 600; i++) { const tc = i / 100, w = pulseW(tc, P); pts.push([w, landSplit(P, tc).dist]); }
    pts.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i][1] >= pts[i - 1][1] - EPS, `${name} dist monotone in speed`);
  }
});

test('honesty: landing with e = 0 equals the tick (phi + arc + dist), 10000 seeded taps', () => {
  const rng = makeRng('glide-honest');
  for (let i = 0; i < 10000; i++) {
    const P = physes[rng.int(physes.length)][1], t = rng.random() * 60, phi = rng.random() * C, u = landSplit(P, t);
    const tick = modC(phi + u.arc + u.dist), L = W.landingPos(P, { t, phi, e: 0 });
    assert.ok(Math.abs(((L - tick + C / 2) % C + C) % C - C / 2) < EPS, `tap ${i} t ${t}`);
    assert.equal(W.glidePos(P, { t, phi, e: 0 }, P.D), L, 'glide ends on the landing');
  }
});

test('a phys with no glideDeg (other wheels) is unchanged: glide = w*D/3 and landing = phi + tickAt', () => {
  const rng = makeRng('glide-other');
  for (const P0 of [{ W0: 36, TAU: 3, D: 2, J: 1.2 }, { ...W.matchPhys({}), glideDeg: undefined }, { W0: 36 * 0.55, TAU: 3, D: 2 }]) for (let i = 0; i < 2000; i++) {
    const t = rng.random() * 60, phi = rng.random() * C, u = landSplit(P0, t), w = pulseW(cycleOf(t, P0).tInCycle, P0);
    assert.ok(Math.abs(u.dist - w * (P0.D ?? WE.D) / 3) < EPS, `dist = w*D/3 at t ${t}`);
    assert.ok(Math.abs(u.arc + u.dist - tickAt(t, P0)) < EPS, 'arc + dist = tickAt');
  }
});
