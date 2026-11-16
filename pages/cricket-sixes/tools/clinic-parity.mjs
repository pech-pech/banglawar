#!/usr/bin/env node
// Clinic wheel parity (coach-weekly 2026-11-16). Node port of coach-weekly/sim/clinic_pulse_sim.py, pulse model only, stdlib only.
// Prints EV of careful / good / full-Control tappers over a random tapper on the SPEC rim. Expect about 1.33 / 1.46 / 1.70.
// JP counts as 0.67 of a roll (sim value; the shipped JP is a nets run). Usage: node tools/clinic-parity.mjs [trials=200000] [seed=11]
// Tool only, not shipped. Pulse: W0 36, TAU 3, D 2, J 1.2, decay to 3.8 s, smoothstep ramp back to W0 by 6.0 s, repeat; no auto-stop.
import { fileURLToPath } from 'node:url';

const T = { W0: 36, TAU: 3, D: 2, J: 1.2, CIRC: 10, PERIOD: 6, FROM: 3.8, T_MID: 3.5, T_MIN: 0.5, T_MAX: 60, DT: 0.0005,
  SLOW: 0.55, STEADY: 0.7225, SD: { careful: 0.110, good: 0.070, full: 0.080 }, PROBE_N: 4000 };
const ORDER = ['JP', 'S', 'L', 'S', 'L', 'M', 'S', 'L', 'S', 'M'];
const LAB = { JP: [0.67, 0.05], L: [0.20, 0.09], M: [0.10, 0.12], S: [0.05, 0.11] };
const segs = ORDER.map((l) => ({ l, v: LAB[l][0], w: LAB[l][1] }));
const edges = []; { let a = 0; for (const s of segs) { edges.push(a); a += s.w * T.CIRC; } }

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function makeProf(w0) {
  const n = Math.floor(T.T_MAX / T.DT) + 2, w = new Float64Array(n), th = new Float64Array(n), L = new Float64Array(n);
  const w38 = w0 * Math.exp(-T.FROM / T.TAU);
  for (let i = 0; i < n; i++) {
    const tau = (i * T.DT) % T.PERIOD;
    if (tau < T.FROM) w[i] = w0 * Math.exp(-tau / T.TAU);
    else { const x = (tau - T.FROM) / (T.PERIOD - T.FROM), s = x * x * (3 - 2 * x); w[i] = w38 + (w0 - w38) * s; }
    if (i) th[i] = th[i - 1] + 0.5 * (w[i] + w[i - 1]) * T.DT;
  }
  for (let i = 0; i < n; i++) L[i] = th[i] + w[i] * T.D / 3;
  const pl = (t) => { const i = Math.floor(t / T.DT), f = t / T.DT - i; return L[i] * (1 - f) + L[i + 1] * f; };
  const inv = (tg) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m] < tg) lo = m + 1; else hi = m; } const i = lo; if (i <= 0 || i >= n) return null; return (i - 1 + (tg - L[i - 1]) / (L[i] - L[i - 1])) * T.DT; };
  return { pl, inv };
}
function tapTime(prof, c, phi) {
  const base = prof.pl(T.T_MID) + phi, lo = prof.pl(T.T_MIN); let best = null;
  const k0 = Math.round((base - c) / T.CIRC);
  for (let k = k0 - 2; k <= k0 + 2; k++) {
    const tg = c + k * T.CIRC - phi; if (tg < lo) continue;
    const t = prof.inv(tg); if (t == null) continue;
    if (best == null || Math.abs(t - T.T_MID) < Math.abs(best - T.T_MID)) best = t;
  }
  return best == null ? T.T_MID : best;
}
function probs(tp, n, seed) {
  const m = segs.length;
  if (tp === 'random') return segs.map((s) => s.w);
  let w0 = T.W0, J = T.J; if (tp === 'full') { w0 *= T.SLOW; J *= T.STEADY; }
  const prof = makeProf(w0), sd = T.SD[tp], cen = segs.map((s, i) => edges[i] + s.w * T.CIRC / 2);
  const sample = (c, k, r) => {
    const cnt = new Array(m).fill(0);
    for (let q = 0; q < k; q++) {
      const phi = r() * T.CIRC, t0 = tapTime(prof, c, phi), t = Math.max(T.T_MIN, t0 + gauss(r) * sd);
      const pos = (((phi + prof.pl(t) + (r() * 2 - 1) * J) % T.CIRC) + T.CIRC) % T.CIRC;
      let i = 0; while (i + 1 < m && edges[i + 1] <= pos) i++; cnt[i]++;
    }
    return cnt;
  };
  let best = null;
  for (let i = 0; i < m; i++) {
    const cnt = sample(cen[i], T.PROBE_N, mulberry(seed + 100 + i)), ev = cnt.reduce((a, c, j) => a + c * segs[j].v, 0);
    if (best == null || ev > best[0]) best = [ev, i];
  }
  return sample(cen[best[1]], n, mulberry(seed)).map((c) => c / n);
}
export function clinicParity(n = 200000, seed = 11) {
  const ev = (p) => p.reduce((a, x, i) => a + x * segs[i].v, 0), base = ev(probs('random'));
  return ['careful', 'good', 'full'].map((tp) => { const e = ev(probs(tp, n, seed)); return { tapper: tp, ev: e, ratio: e / base }; });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const n = +process.argv[2] || 200000, seed = +process.argv[3] || 11;
  for (const r of clinicParity(n, seed)) console.log(`${r.tapper.padEnd(8)} EV ${r.ev.toFixed(4)}  x random ${r.ratio.toFixed(3)}`);
}
