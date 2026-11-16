// @ts-check
// Pulse math for every wheel (CONTRACT-A sec 3, wheels SPEC 2c). Pure: no DOM, no clock, no rng.
// P = phys { W0, D } (TAU / PULSE_FROM / PULSE_PERIOD optional), default WHEEL_ENGINE. Slow scales W0, which also scales the ramp peak.
import { WHEEL_ENGINE } from '../data/wheel-engine.js';

const E = WHEEL_ENGINE;
/** @param {any} [P] */
const prm = (P) => {
  const p = P || E;
  const W0 = p.W0 ?? E.W0, TAU = p.TAU ?? E.TAU, FROM = p.PULSE_FROM ?? E.PULSE_FROM, PER = p.PULSE_PERIOD ?? E.PULSE_PERIOD;
  return { W0, D: p.D ?? E.D, TAU, FROM, PER, RAMP: PER - FROM, w38: W0 * Math.exp(-FROM / TAU) };
};
const clampT = (t, PER) => (t > 0 ? (t < PER ? t : PER) : 0);

/** Speed in units/s at cycle time t (0..6): decay W0*exp(-t/TAU) to 3.8 s, then smoothstep back to W0 at 6.0 s. */
export function pulseW(t, P) {
  const q = prm(P), tt = clampT(t, q.PER);
  if (tt < q.FROM) return q.W0 * Math.exp(-tt / q.TAU);
  const x = (tt - q.FROM) / q.RAMP;
  return q.w38 + (q.W0 - q.w38) * x * x * (3 - 2 * x);
}

/** Arc in units travelled within one cycle up to cycle time t (integral of pulseW). */
export function pulseArc(t, P) {
  const q = prm(P), tt = clampT(t, q.PER);
  if (tt < q.FROM) return q.W0 * q.TAU * (1 - Math.exp(-tt / q.TAU));
  const u = tt - q.FROM, x = u / q.RAMP;
  return q.W0 * q.TAU * (1 - q.w38 / q.W0) + q.w38 * u + (q.W0 - q.w38) * q.RAMP * (x * x * x - x * x * x * x / 2);
}

/** Arc of one full cycle at P (scales with W0). Computed, never hard-coded. */
export function ARC_PER_CYCLE(P) {
  const q = prm(P);
  return q.W0 * q.TAU * (1 - Math.exp(-q.FROM / q.TAU)) + q.RAMP * (q.w38 + (q.W0 - q.w38) / 2);
}

/** Cycle (from 1) and time within it for seconds since SPIN. */
export function cycleOf(elapsed, P) {
  const PER = prm(P).PER, e = elapsed > 0 ? elapsed : 0, k = Math.floor(e / PER);
  return { cycle: k + 1, tInCycle: e - k * PER };
}

/** Tick position in rim units, unwrapped and monotonic: k*ARC + arc(t) + w(t)*D/3. Landing = phi + tickAt(stopS) + wobble, mod ring C. */
export function tickAt(elapsed, P) {
  const q = prm(P), { cycle, tInCycle } = cycleOf(elapsed, P);
  return (cycle - 1) * ARC_PER_CYCLE(P) + pulseArc(tInCycle, P) + pulseW(tInCycle, P) * q.D / 3;
}
