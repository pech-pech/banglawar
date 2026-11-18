// Landing tick (2026-11-15 report p13 s1): pure choice of what the aim wheels draw. No rolls, no physics, no state.
// Every aim spin (Spotlight, Course, Find, Hype) shows a plain tick at the predicted no-wobble landing; Aim Guide makes it a gold wedge.
// Reveal wheels (Toss, Pep, Scout, Finals) keep their old feel-only behaviour (gold guide mark late in the reveal, nothing otherwise).
import { pulseW, pulseArc, ARC_PER_CYCLE, cycleOf } from './wheel-pulse.js';
import { WHEEL_ENGINE } from '../data/wheel-engine.js';

export const TICK = Object.freeze({
  PLAIN_PX: 2, // plain tick core width (css px), plus a 1 px outline each side
  WEDGE_TIP_PX: 0.8, // Aim Guide wedge half-width at the inner tip (css px); rim end is wider
});

/** Bold landing tick (2026-11-18, Settings "Tick"): look only. W = core width px, L = length px (Dev tickW / tickL override when Dev is on), HALO = white halo px each side.
 * Normal keeps TICK.PLAIN_PX and the old 15 px reach unchanged; the landing position never reads any of this. */
export const TICK_BOLD = Object.freeze({ W: 5, L: 22, HALO: 2 });
const NORMAL_LEN = 15; // plain tick start: R - 15 on the wheels and dial (as drawn before the Tick setting)
export const tickModeOf = (v) => (v === 'bold' ? 'bold' : 'normal');
const num = (v, d, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** Plain numbers for the four draw sites. Normal = exactly today's marks. Bold = wider, longer, stronger halo.
 * px core width, len reach from the rim, halo px of white each side (wheel/dial/reel); arrow = match wheel gold arrow (css units before the ks scale);
 * reel = {len, h} of the outer side mark (inner is len-1 x h-2). @param {any} mode @param {any} [w] bold width px @param {any} [l] bold length px */
export function tickStyle(mode, w, l) {
  if (tickModeOf(mode) !== 'bold') return { bold: false, px: TICK.PLAIN_PX, len: NORMAL_LEN, halo: 1, arrow: { tip: 2, base: 20, hw: 7, line: 2.5, halo: 0 }, reel: { len: 5, h: 5 }, dial: { px: TICK.PLAIN_PX, len: NORMAL_LEN, halo: 1 } };
  const W = num(w, TICK_BOLD.W, 2, 8), L = num(l, TICK_BOLD.L, 8, 24);
  return { bold: true, px: W, len: L, halo: TICK_BOLD.HALO, arrow: { tip: 2, base: Math.min(25, Math.round(20 * L / NORMAL_LEN * 10) / 10), /* cap 25 (Dev max W8 L24 outline fits): the match canvas margin is ~30 ks, the outline needs the rest */ hw: 7 + (W - TICK.PLAIN_PX) * 3, line: 2.5 + (W - TICK.PLAIN_PX), halo: 4 }, reel: { len: Math.round(L / 2), h: Math.round(W) + 3 }, dial: { px: Math.round(W * 1.6), len: Math.round(L * 1.3), halo: 3 } }; // dial canvas pixels are ~2 css px each (pixel upscale), so Bold is scaled up there to read the same
}

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
 * glideDeg = Dev tick lead min / max on the match wheel (default [60, 120]); the slow point follows a Dev cycle length (P.PULSE_FROM).
 * @param {any} P phys {W0, glideDeg:[lo,hi], PULSE_FROM?} @param {number} w speed units/s at the STOP's cycle time @returns {number} units */
export function glideCap(P, w) {
  const [lo, hi] = P.glideDeg, W0 = P.W0 ?? WHEEL_ENGINE.W0, wMin = pulseW(P.PULSE_FROM ?? WHEEL_ENGINE.PULSE_FROM, P);
  const x = W0 > wMin ? Math.max(0, Math.min(1, (w - wMin) / (W0 - wMin))) : 0, C = WHEEL_ENGINE.CIRC;
  return (lo + (hi - lo) * x) * C / 360;
}
