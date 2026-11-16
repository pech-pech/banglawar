// T2 SPEC test 3 (patient tapper) repro, Spotlight + Course, pulse engine, seeded. Reports, never tunes.
// Run: node tools/t2-test3.mjs [spins=20000] [--ring spot|course]
// Tappers (careful sd 0.110, no Control): c1 = cycle 1, arrival nearest 3.5 s (the t2-parity careful); g32 / g36 = cycle 4, top slice arrival inside 3.2-3.8 / 3.6-3.8 s if it has one, else nearest 3.5;
//  c4 = cycle 4, arrival nearest 3.5 s of that cycle; w4 = cycle 4, tap clamped into 3.6-3.8 s, aim = slice whose arrival is nearest 3.7 s;
//  w4o = cycle 4, tap time chosen in 3.6-3.8 s (grid) to maximise expected value over the sd (oracle patient, upper bound).
import { SPOT_SLICES, COURSE_SLICES } from '../js/data/wheel-slices-train.js';
import { ENGINE, SIM, tickAt, rng, exactRandomMean } from './t2-parity.mjs';

const P = { W0: ENGINE.W0, D: ENGINE.D };
const layout = (ring) => { let a = 0; return ring.map((s) => { const r = { ...s, a0: a, c: a + s.w / 2 }; a += s.w; return r; }); };
const sliceAt = (L, pos) => { const p = ((pos % 10) + 10) % 10; for (const s of L) if (p < s.a0 + s.w) return s; return L[L.length - 1]; };
// absolute time in [lo,hi] nearest tNear where tick(t) = x (mod 10)
function arrive(x, tNear, lo, hi) {
  let best = null; const k0 = Math.round((tickAt(tNear, P) - x) / 10);
  for (let k = k0 - 3; k <= k0 + 3; k++) {
    const goal = x + 10 * k; let a = lo, b = hi;
    if (tickAt(a, P) > goal || tickAt(b, P) < goal) continue;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (tickAt(m, P) < goal) a = m; else b = m; }
    const t = (a + b) / 2; if (best === null || Math.abs(t - tNear) < Math.abs(best - tNear)) best = t;
  }
  return best;
}
const GH = [-1.5, -0.75, 0, 0.75, 1.5], GW = [0.0556, 0.2444, 0.4, 0.2444, 0.0556]; // 5-point normal quadrature
function spin(L, u, who, SD = SIM.SD_CAREFUL) {
  const phi = u() * 10, cand = L.filter((s) => s.w >= SIM.AIM_MIN_W), top = Math.max(...cand.map((s) => s.value));
  const base = who.cycle * ENGINE.PULSE_PERIOD - ENGINE.PULSE_PERIOD; // cycle start, absolute s
  const lo = Math.max(base, ENGINE.STOP_GUARD_S), hi = base + ENGINE.PULSE_PERIOD - 1e-9;
  let t;
  if (who.mode === 'oracle') {
    let bestEV = -1, bestT = base + 3.7;
    for (let i = 0; i <= 10; i++) {
      const T = base + 3.6 + 0.02 * i; let ev = 0;
      for (let j = 0; j < GH.length; j++) ev += GW[j] * sliceAt(L, phi + tickAt(T + GH[j] * SD * 1.2, P)).value;
      if (ev > bestEV) { bestEV = ev; bestT = T; }
    }
    t = bestT;
  } else {
    let tAim = null;
    for (const s of cand) {
      if (s.value !== top) continue;
      const a = arrive((s.c - phi + 100) % 10, base + who.near, lo, hi);
      if (a !== null && (tAim === null || Math.abs(a - base - who.near) < Math.abs(tAim - base - who.near))) tAim = a;
    }
    if (who.win) { // slow-end rule: take the top slice's arrival inside the window (latest = slowest) if it has one, else the nearest-3.5 arrival
      let tw = null;
      for (const sl of cand) {
        if (sl.value !== top) continue;
        const a = arrive((sl.c - phi + 100) % 10, base + who.win[1], base + who.win[0], base + who.win[1]);
        if (a !== null && (tw === null || a > tw)) tw = a;
      }
      if (tw !== null) tAim = tw; else { tAim = null; for (const sl of cand) { if (sl.value !== top) continue; const a = arrive((sl.c - phi + 100) % 10, base + 3.5, lo, hi); if (a !== null && (tAim === null || Math.abs(a - base - 3.5) < Math.abs(tAim - base - 3.5))) tAim = a; } }
    }
    t = tAim;
    if (who.clamp) t = Math.min(Math.max(t, base + 3.6), base + 3.8);
  }
  t += SD * u.norm();
  t = Math.max(t, ENGINE.STOP_GUARD_S);
  return sliceAt(L, phi + tickAt(t, P) + (u() * 2 - 1) * ENGINE.J).value;
}
export const WHO = {
  c1: { cycle: 1, near: 3.5 }, c4: { cycle: 4, near: 3.5 },
  g32: { cycle: 4, near: 3.5, win: [3.2, 3.8] }, g36: { cycle: 4, near: 3.5, win: [3.6, 3.8] },
  w4: { cycle: 4, near: 3.7, clamp: true }, w4o: { cycle: 4, mode: 'oracle' },
};
export function run(ring, n, seed) {
  const L = layout(ring), base = exactRandomMean(ring), out = {};
  for (const k of Object.keys(WHO)) {
    const u = rng(seed + Object.keys(WHO).indexOf(k) * 7919), v = []; let sum = 0, sq = 0;
    for (let i = 0; i < n; i++) { const x = spin(L, u, WHO[k]); sum += x; sq += x * x; }
    const m = sum / n; out[k] = { ratio: m / base, se: Math.sqrt(Math.max(0, sq / n - m * m) / n) / base };
  }
  return { out, base };
}
import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const n = Number(process.argv.find((a) => /^\d+$/.test(a))) || 20000;
  for (const [name, ring] of [['spot', SPOT_SLICES], ['course', COURSE_SLICES]]) {
    const { out } = run(ring, n, 20261116);
    const c1 = out.c1.ratio;
    console.log(`${name}: n=${n} ` + Object.keys(out).map((k) => `${k} ${out[k].ratio.toFixed(3)}(+-${out[k].se.toFixed(3)})${k === 'c1' ? '' : ' d=' + (out[k].ratio - c1 >= 0 ? '+' : '') + (out[k].ratio - c1).toFixed(3)}`).join('  '));
  }
}
