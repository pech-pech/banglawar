#!/usr/bin/env node
// T3 parity sim for the pure ring tables Hype, Toss, Pep (wheels-like-match SPEC 2b/2c/6/7/8, tests 1, 2, 3, 7, port line 13).
// Pure math, no DOM, no clock. Tool only (not shipped). Run: node tools/t3-parity.mjs [--n 20000] [--seed t3] [--json]
// swap to wheel-pulse.js after T1 merges: the pulse math below is copied from origin/claude/project-thread-2dbsu2
// js/core/wheel-pulse.js + js/data/wheel-engine.js (W0 36, TAU 3, D 2, J 1.2, period 6, ramp from 3.8).
// Model: ring rotation phi uniform; landing = phi + tick(tStop) + wobble U(-J,J), mod 10, then the slice that holds it.
//   random   taps at a uniform time in the cycle (landing uniform by width)
//   careful  best-value slice (width >= 0.5 unit), tap time whose honest landing is its centre with arrival nearest 3.5 s
//            of the cycle (ties: nearest to 3.5), then t + N(0, 0.110) (SPEC 2b average tapper)
//   patient  same careful aimer but in cycle 4 (first sentence of SPEC test 3), and two readings of "waits for 3.6-3.8 s":
//     window   best-value slice whose centre passes AIM inside [3.6, 3.8] s of cycle 4 (tie: nearest 3.7 s), aimed at its arrival
//     near37   the careful aimer with target time 3.7 s instead of 3.5 s, cycle 4 (arrival may fall outside the window)
import { fileURLToPath } from 'node:url';
import { makeRng } from '../js/core/rng.js';
import { HYPE_SLICES } from '../js/data/wheels/hype.js';
import { TOSS_SLICES } from '../js/data/wheels/toss.js';
import { PEP_SLICES } from '../js/data/wheels/pep.js';

// ---- pulse math (copy of wheel-pulse.js, default engine) ----
export const ENGINE = Object.freeze({ W0: 36, TAU: 3.0, D: 2.0, J: 1.2, PER: 6.0, FROM: 3.8 });
const { W0, TAU, D, PER, FROM } = ENGINE;
const RAMP = PER - FROM, W38 = W0 * Math.exp(-FROM / TAU), RING = 10;
const clampT = (t) => (t > 0 ? (t < PER ? t : PER) : 0);
export function pulseW(t) {
  const tt = clampT(t);
  if (tt < FROM) return W0 * Math.exp(-tt / TAU);
  const x = (tt - FROM) / RAMP;
  return W38 + (W0 - W38) * x * x * (3 - 2 * x);
}
export function pulseArc(t) {
  const tt = clampT(t);
  if (tt < FROM) return W0 * TAU * (1 - Math.exp(-tt / TAU));
  const u = tt - FROM, x = u / RAMP;
  return W0 * TAU * (1 - W38 / W0) + W38 * u + (W0 - W38) * RAMP * (x * x * x - x * x * x * x / 2);
}
export const ARC_PER_CYCLE = W0 * TAU * (1 - Math.exp(-FROM / TAU)) + RAMP * (W38 + (W0 - W38) / 2);
export function tickAt(elapsed) {
  const e = elapsed > 0 ? elapsed : 0, k = Math.floor(e / PER), t = e - k * PER;
  return k * ARC_PER_CYCLE + pulseArc(t) + pulseW(t) * D / 3;
}

// ---- rings ----
export const RINGS = Object.freeze({ hype: HYPE_SLICES[0], toss: TOSS_SLICES, pep: PEP_SLICES });
export const TARGETS = Object.freeze({ hype: { random: 4.300, careful: 5.851 }, toss: { random: 2.50, careful: 3.42 }, pep: { random: 5.2745, careful: 7.16 } });
export const SD_CAREFUL = 0.110, AIM_MIN_W = 0.5, T_AIM = 3.5, WINDOW = [3.6, 3.8];
const mod = (x, m) => ((x % m) + m) % m;
const edgesOf = (ring) => { let a = 0; return ring.map((s) => { const e = { lo: a, mid: a + s.w / 2, hi: a + s.w }; a += s.w; return e; }); };
export function sliceAt(ring, pos) { // first slice whose [lo,hi) holds pos (mod ring); last slice takes rounding slack
  const x = mod(pos, RING); let a = 0;
  for (let i = 0; i < ring.length; i++) { a += ring[i].w; if (x < a) return i; }
  return ring.length - 1;
}
export const meanOf = (ring) => ring.reduce((s, r) => s + r.w * r.value, 0) / ring.reduce((s, r) => s + r.w, 0);

// ---- aimer ----
// Elapsed time in [c0, c0+PER] at which (phi + tick) is slice centre `mid`, nearest to c0 + tAim. Returns time or null.
function arrival(mid, phi, c0, tAim) {
  const base = mod(mid - phi, RING), p0 = tickAt(c0 + tAim), pLo = tickAt(c0), pHi = tickAt(c0 + PER);
  const m0 = Math.round((p0 - base) / RING);
  let best = null;
  for (let m = m0 - 1; m <= m0 + 1; m++) {
    const p = base + m * RING;
    if (p < pLo || p > pHi) continue;
    let lo = c0, hi = c0 + PER;
    for (let i = 0; i < 48; i++) { const md = (lo + hi) / 2; if (tickAt(md) < p) lo = md; else hi = md; }
    const t = (lo + hi) / 2;
    if (best === null || Math.abs(t - c0 - tAim) < Math.abs(best - c0 - tAim)) best = t;
  }
  return best;
}
function aimCareful(ring, edges, phi, c0, tAim) {
  let top = -Infinity;
  for (const s of ring) if (s.w >= AIM_MIN_W && s.value > top) top = s.value;
  let bt = null;
  for (let i = 0; i < ring.length; i++) {
    if (ring[i].value !== top || ring[i].w < AIM_MIN_W) continue;
    const t = arrival(edges[i].mid, phi, c0, tAim);
    if (t !== null && (bt === null || Math.abs(t - c0 - tAim) < Math.abs(bt - c0 - tAim))) bt = t;
  }
  return bt;
}
function aimWindow(ring, edges, phi, c0) {
  const pLo = tickAt(c0 + WINDOW[0]), pHi = tickAt(c0 + WINDOW[1]);
  let bv = -Infinity, bt = null;
  for (let i = 0; i < ring.length; i++) {
    if (ring[i].w < AIM_MIN_W) continue;
    const base = mod(edges[i].mid - phi, RING), m = Math.ceil((pLo - base) / RING), p = base + m * RING;
    if (p > pHi) continue;
    const t = arrival(edges[i].mid, phi, c0, 3.7);
    if (t === null || t - c0 < WINDOW[0] - 1e-6 || t - c0 > WINDOW[1] + 1e-6) continue;
    const v = ring[i].value;
    if (v > bv || (v === bv && Math.abs(t - c0 - 3.7) < Math.abs(bt - c0 - 3.7))) { bv = v; bt = t; }
  }
  return bt;
}

/** One tapper kind on one ring. Returns { mean, se, n }. kind: random | careful | cycle4 | window | near37. */
export function simulate(ring, kind, n, seed, J = ENGINE.J, tAim) {
  const rng = makeRng(`${seed}|${kind === 'random' ? 'random' : 'aim'}`), edges = edgesOf(ring); // aimed kinds share one stream (paired draws: a gain is physics only)
  let sum = 0, sq = 0;
  for (let k = 0; k < n; k++) {
    const phi = rng.random() * RING, wob = (rng.random() * 2 - 1) * J;
    let t;
    if (kind === 'random') t = rng.random() * PER;
    else {
      const c0 = kind === 'careful' ? 0 : 3 * PER;
      const tt = kind === 'window' ? (aimWindow(ring, edges, phi, c0) ?? c0 + 3.7) : aimCareful(ring, edges, phi, c0, kind === 'near37' ? (tAim ?? 3.7) : T_AIM);
      t = Math.max(c0 + 0.35, tt + rng.normalish(0, SD_CAREFUL));
    }
    const v = ring[sliceAt(ring, phi + tickAt(t) + wob)].value;
    sum += v; sq += v * v;
  }
  const mean = sum / n;
  return { mean, se: Math.sqrt(Math.max(0, sq / n - mean * mean) / n), n };
}

/** Test 7: tick honesty, J = 0. Tick slice from an independent edge walk of the unwrapped tick at the frame before the tap. */
export function tickHonesty(ring, n, seed, frameLagS = 0) {
  const rng = makeRng(`${seed}|tick`), edges = edgesOf(ring);
  let bad = 0, wrap = 0;
  for (let k = 0; k < n; k++) {
    const phi = rng.random() * RING, t = 0.35 + rng.random() * (4 * PER - 0.35); // cycles 1-4
    const landed = sliceAt(ring, phi + tickAt(t));
    const p = phi + tickAt(Math.max(0, t - frameLagS)), r = p - Math.floor(p / RING) * RING;
    let shown = ring.length - 1;
    for (let i = 0; i < edges.length; i++) if (r >= edges[i].lo - 1e-12 && r < edges[i].hi - 1e-12) { shown = i; break; }
    if (landed === 0 || landed === ring.length - 1) wrap++;
    if (shown !== landed) bad++;
  }
  return { n, bad, wrapLandings: wrap };
}

/** Smallest n of the ladder where every random and careful mean, on every seed, is within tol of the SPEC value. */
export function smallestN(ladder = [250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000], seeds = 8, tol = 0.1) {
  for (const n of ladder) {
    let worst = 0;
    for (const w of Object.keys(RINGS)) for (let sd = 0; sd < seeds; sd++) for (const k of ['random', 'careful'])
      worst = Math.max(worst, Math.abs(simulate(RINGS[w], k, n, `n${sd}`).mean - TARGETS[w][k]));
    if (worst <= tol) return { n, seeds, worst };
  }
  return null;
}

export function ratios(wheel, n, seed) {
  const ring = RINGS[wheel], r = simulate(ring, 'random', n, seed), c = simulate(ring, 'careful', n, seed);
  const c4 = simulate(ring, 'cycle4', n, seed), w = simulate(ring, 'window', n, seed), p = simulate(ring, 'near37', n, seed);
  return { wheel, random: r, careful: c, cycle4: c4, window: w, near37: p, ratio: c.mean / r.mean, ratioC4: c4.mean / r.mean,
    gainC4: (c4.mean - c.mean) / r.mean, gainWindow: (w.mean - c.mean) / r.mean, gainNear37: (p.mean - c.mean) / r.mean };
}

// ---- CLI ----
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  if (process.argv.includes('--find-n')) { console.log(JSON.stringify(smallestN())); process.exit(0); }
  const n = +arg('n', 20000), seed = arg('seed', 't3'), out = [];
  for (const w of ['hype', 'toss', 'pep']) {
    const r = ratios(w, n, seed), T = TARGETS[w], th = tickHonesty(RINGS[w], 10000, seed), tl = tickHonesty(RINGS[w], 10000, seed, 1 / 60);
    out.push({ wheel: w, n, exactRandom: meanOf(RINGS[w]), random: r.random.mean, targetRandom: T.random, careful: r.careful.mean, targetCareful: T.careful,
      ratio: r.ratio, ratioCycle4: r.ratioC4, gainCycle4: r.gainC4, gainWindow: r.gainWindow, gainNear37: r.gainNear37, tickBad: th.bad, tickBad60fps: tl.bad });
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
  else {
    console.log(`n ${n} seed ${seed}  ARC_PER_CYCLE ${ARC_PER_CYCLE.toFixed(3)}`);
    console.log('wheel  rand(exact) rand(sim)  carefulSim  careful(SPEC)  ratio  gain c4   gain win3.6-3.8  gain near3.7  tick bad/10k  (60fps lag)');
    for (const o of out) console.log(`${o.wheel.padEnd(6)} ${o.exactRandom.toFixed(4).padStart(9)} ${o.random.toFixed(4).padStart(9)} ${o.careful.toFixed(3).padStart(11)} ${String(o.targetCareful).padStart(10)}  ${o.ratio.toFixed(3)}  ${o.gainCycle4.toFixed(3).padStart(7)} ${o.gainWindow.toFixed(3).padStart(14)} ${o.gainNear37.toFixed(3).padStart(13)}  ${String(o.tickBad).padStart(6)} ${String(o.tickBad60fps).padStart(10)}`);
  }
}
