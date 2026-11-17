// Landing tick (2026-11-15 report p13 s1): pure choice of what the aim wheels draw. No rolls, no physics, no state.
// Every aim spin (Spotlight, Course, Find, Hype) shows a plain tick at the predicted no-wobble landing; Aim Guide makes it a gold wedge.
// Reveal wheels (Toss, Pep, Scout, Finals) keep their old feel-only behaviour (gold guide mark late in the reveal, nothing otherwise).
import { pulseW, pulseArc, ARC_PER_CYCLE, cycleOf } from './wheel-pulse.js';
import { WHEEL_ENGINE } from '../data/wheel-engine.js';

export const TICK = Object.freeze({
  PLAIN_PX: 2, // plain tick core width (css px), plus a 1 px outline each side
  WEDGE_TIP_PX: 0.8, // Aim Guide wedge half-width at the inner tip (css px); rim end is wider
});

/** What a spin draws for the landing tick: 'none' | 'plain' | 'wedge' | 'feel' (reveal wheel with Aim Guide: the old late gold mark).
 * @param {{reveal?:boolean, guide?:boolean, reduced?:boolean}} p */
export function tickKind(p) {
  if (p.reduced) return 'none'; // reduced motion: no spin, so no tick
  if (p.reveal) return p.guide ? 'feel' : 'none'; // reveal wheels are feel only
  return p.guide ? 'wedge' : 'plain';
}

/** Report JSON stamp: the free landing tick is in this build. */
export const REPORT_TICK = 1;

// ---- Pulse landing tick (wheels SPEC 2c / port line 2, CONTRACT-A sec 3). Pure: no clock, no rng. No coast, no STOP_FROM clamp.
// A STOP at `elapsed` seconds after SPIN splits the tick into the arc already turned (where the pointer is) and the glide still to come
// (w(t) x D/3); arc + dist === tickAt(elapsed, P). Landing = phi + arc + dist + wobble, mod ring C.

/** Seconds since SPIN as used by the landing: non-finite or negative -> 0; never clamped above (the wheel spins until STOP). @param {any} t */
export const stopTime = (t) => (typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : 0);

/** Arc already turned (unwrapped units) and glide distance left for a STOP at `elapsed`.
 * @param {any} P phys {W0, D, TAU?} @param {number} elapsed @returns {{t:number, cycle:number, tInCycle:number, arc:number, dist:number}} */
export function landSplit(P, elapsed) {
  const t = stopTime(elapsed), { cycle, tInCycle } = cycleOf(t, P), D = (P && P.D) ?? WHEEL_ENGINE.D;
  const w = pulseW(tInCycle, P), arc = (cycle - 1) * ARC_PER_CYCLE(P) + pulseArc(tInCycle, P);
  return { t, cycle, tInCycle, arc, dist: P && P.glideDeg ? glideCap(P, w) : w * D / 3 };
}

/** Tick window (2026-11-17, M): when phys.glideDeg = [lo, hi] (degrees), the glide still to come is mapped from the pulse speed range
 * [w(3.8 s), W0] onto lo..hi degrees, so the tick always sits lo..hi degrees ahead of the pointer (never whips round the wheel). Pure.
 * @param {any} P phys {W0, glideDeg:[lo,hi]} @param {number} w speed units/s at the STOP's cycle time @returns {number} units */
export function glideCap(P, w) {
  const [lo, hi] = P.glideDeg, W0 = P.W0 ?? WHEEL_ENGINE.W0, wMin = pulseW(WHEEL_ENGINE.PULSE_FROM, P);
  const x = W0 > wMin ? Math.max(0, Math.min(1, (w - wMin) / (W0 - wMin))) : 0, C = WHEEL_ENGINE.CIRC;
  return (lo + (hi - lo) * x) * C / 360;
}
