// T2 parity sim: Spotlight and Course wheels, seeded, pulse engine (CONTRACT-A sec 2/3). Reports, never tunes.
// Run: node tools/t2-parity.mjs [spins=20000] [--write]   (writes PARITY-T2.md with --write)
import { SPOT_SLICES, COURSE_SLICES } from '../js/data/wheel-slices-train.js';
import { applyKindFloor, KIND_FLOOR_SPOT, KIND_FLOOR_SPOT_FALLBACK } from '../js/core/perks/kind-floor.js';

// ---- constants copied from CONTRACT-A sec 2 (WHEEL_ENGINE). NOT the old 24 / 1 / 0.6 numbers. ----
export const ENGINE = Object.freeze({ W0: 36, TAU: 3.0, D: 2.0, J: 1.2, CIRC: 10, PULSE_PERIOD: 6.0, PULSE_FROM: 3.8, STOP_GUARD_S: 0.35 });
// ---- sim-only numbers, SPEC sec 2b ----
export const SIM = Object.freeze({
  SD_CAREFUL: 0.110, SD_GOOD: 0.070, SD_GUIDE: 0.080, SD_GUIDE_GOOD: 0.050, // tap sd, seconds
  SLOW_FULL: 0.55, STEADY_FULL: 0.7225, AIM_MIN_W: 0.5, AIM_T: 3.5,
});

// ---- pulse (CONTRACT-A sec 3), P = {W0, D} ----
const sstep = (x) => x * x * (3 - 2 * x);
export const pulseW = (t, P) => {
  if (t < ENGINE.PULSE_FROM) return P.W0 * Math.exp(-t / ENGINE.TAU);
  const w38 = P.W0 * Math.exp(-ENGINE.PULSE_FROM / ENGINE.TAU);
  return w38 + (P.W0 - w38) * sstep((t - ENGINE.PULSE_FROM) / 2.2);
};
export const pulseArc = (t, P) => {
  const w38 = P.W0 * Math.exp(-ENGINE.PULSE_FROM / ENGINE.TAU);
  const dec = P.W0 * ENGINE.TAU * (1 - Math.exp(-Math.min(t, ENGINE.PULSE_FROM) / ENGINE.TAU));
  if (t < ENGINE.PULSE_FROM) return dec;
  const u = t - ENGINE.PULSE_FROM, x = u / 2.2;
  return dec + w38 * u + (P.W0 - w38) * 2.2 * (x ** 3 - x ** 4 / 2);
};
export const arcPerCycle = (P) => {
  const w38 = P.W0 * Math.exp(-ENGINE.PULSE_FROM / ENGINE.TAU);
  return P.W0 * ENGINE.TAU * (1 - Math.exp(-ENGINE.PULSE_FROM / ENGINE.TAU)) + 2.2 * (w38 + (P.W0 - w38) / 2);
};
export const tickAt = (el, P) => {
  const k = Math.floor(el / ENGINE.PULSE_PERIOD), t = el - ENGINE.PULSE_PERIOD * k;
  return k * arcPerCycle(P) + pulseArc(t, P) + pulseW(t, P) * ENGINE.D / ENGINE.TAU;
};

// ---- seeded rng ----
export function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  u.norm = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  return u;
}

const layout = (ring) => { let a = 0; return ring.map((s) => { const r = { ...s, a0: a, c: a + s.w / 2 }; a += s.w; return r; }); };
const sliceAt = (L, pos) => { const p = ((pos % 10) + 10) % 10; for (const s of L) if (p < s.a0 + s.w) return s; return L[L.length - 1]; };

// time in [0.35, 6) nearest AIM_T when tick(t) = x (mod 10); null if none
function arrival(x, P) {
  const t0 = SIM.AIM_T; let best = null;
  const k0 = Math.round((tickAt(t0, P) - x) / 10);
  for (let k = k0 - 2; k <= k0 + 2; k++) {
    const goal = x + 10 * k; let lo = 0, hi = 6 - 1e-9;
    if (tickAt(lo, P) > goal || tickAt(hi, P) < goal) continue;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (tickAt(m, P) < goal) lo = m; else hi = m; }
    const t = (lo + hi) / 2;
    if (t >= ENGINE.STOP_GUARD_S && (best === null || Math.abs(t - t0) < Math.abs(best - t0))) best = t;
  }
  return best;
}

// tapper: 'random' (lands by width), or {sd, slow, steady}. Returns the landed slice.
function spinOnce(L, u, who) {
  if (who.random) return sliceAt(L, u() * 10);
  const P = { W0: ENGINE.W0 * who.slow, D: ENGINE.D };
  const phi = u() * 10, J = ENGINE.J * who.steady;
  const cand = L.filter((s) => s.w >= SIM.AIM_MIN_W);
  const top = Math.max(...cand.map((s) => s.value));
  let tAim = null;
  for (const s of cand) {
    if (s.value !== top) continue;
    const t = arrival((s.c - phi + 100) % 10, P);
    if (t !== null && (tAim === null || Math.abs(t - SIM.AIM_T) < Math.abs(tAim - SIM.AIM_T))) tAim = t;
  }
  let t = tAim + who.sd * u.norm();
  t = Math.min(Math.max(t, ENGINE.STOP_GUARD_S), 6 * 4); // guard; late taps just ride later cycles
  const wob = (u() * 2 - 1) * J;
  return sliceAt(L, phi + tickAt(t, P) + wob);
}

export const TAPPERS = {
  random: { random: true },
  careful: { sd: SIM.SD_CAREFUL, slow: 1, steady: 1 },
  good: { sd: SIM.SD_GOOD, slow: 1, steady: 1 },
  full: { sd: SIM.SD_GUIDE, slow: SIM.SLOW_FULL, steady: SIM.STEADY_FULL },
  goodfull: { sd: SIM.SD_GUIDE_GOOD, slow: SIM.SLOW_FULL, steady: SIM.STEADY_FULL },
};

export const exactRandomMean = (ring) => ring.reduce((a, s) => a + (s.w / 10) * s.value, 0);

export function simMean(ring, who, n, seed, key = 'value') {
  const L = layout(ring), u = rng(seed); let sum = 0, sq = 0;
  for (let i = 0; i < n; i++) { const v = spinOnce(L, u, who)[key]; sum += v; sq += v * v; }
  const m = sum / n; return { mean: m, se: Math.sqrt(Math.max(0, sq / n - m * m) / n) };
}

export function table(ring, n, seed) {
  const out = {};
  for (const k of Object.keys(TAPPERS)) out[k] = simMean(ring, TAPPERS[k], n, seed + k.length * 7919 + k.charCodeAt(0));
  const base = exactRandomMean(ring); // random is analytic (width x value): use it as the denominator, no sampling noise
  for (const k of Object.keys(out)) out[k].ratio = out[k].mean / base;
  out.exactRandom = base;
  return out;
}

export function report(n = 20000, seed = 20261116) {
  const kf = (s) => applyKindFloor(SPOT_SLICES, true, s);
  const rows = {
    spot: table(SPOT_SLICES, n, seed), course: table(COURSE_SLICES, n, seed + 1),
    spotKF2: table(kf(KIND_FLOOR_SPOT), n, seed + 2), spotKF1: table(kf(KIND_FLOOR_SPOT_FALLBACK), n, seed + 3),
  };
  rows.exact = { spot: exactRandomMean(SPOT_SLICES), course: exactRandomMean(COURSE_SLICES), kf2: exactRandomMean(kf(KIND_FLOOR_SPOT)), kf1: exactRandomMean(kf(KIND_FLOOR_SPOT_FALLBACK)) };
  return rows;
}

const f = (x, d = 3) => x.toFixed(d);
function md(r, n) {
  const chk = (v, lo, hi) => (v >= lo && v <= hi ? 'ok' : 'MISS');
  const L = [];
  L.push('# PARITY-T2: Spotlight and Course wheel parity (T2 sim, JS)', '',
    `Sim: \`tools/t2-parity.mjs\`, seeded, n = ${n} spins per cell. Physics from CONTRACT-A sec 2/3 (W0 36, D 2, J 1.2, pulse 6.0 s, ramp 3.8 s), NOT the old 24 / 1 / 0.6. Tappers per SPEC 2b: careful sd 0.110 s, good 0.070 s, full Control = Slow x0.55 + Steady x0.7225 + Guide sd 0.080 s, good+full sd 0.050 s. Aim = centre of best-value slice, arrival nearest 3.5 s of cycle 1, slices under 0.5 unit ignored. Ring phase uniform per spin. Random tapper lands by width. Nothing tuned; a MISS is a report. ARC_PER_CYCLE check: ${f(arcPerCycle({ W0: 36, D: 2 }), 3)} (expect 128.327).`, '');
  const block = (name, t, ex, lines) => {
    L.push(`## ${name}`, '', '| tapper | mean | s.e. | ratio vs random |', '|---|---|---|---|');
    for (const k of Object.keys(TAPPERS)) L.push(`| ${k} | ${f(t[k].mean)} | ${f(t[k].se, 4)} | ${k === 'random' ? '1.000' : f(t[k].ratio, 3)} |`);
    L.push('', `Exact random mean (width x value): ${f(ex, 4)}.`, '', ...lines, '');
  };
  const s = rows_.spot, c = rows_.course, k2 = rows_.spotKF2, k1 = rows_.spotKF1;
  block('Spotlight, no perk', s, rows_.exact.spot, [
    `- random mean target 1.292: ${f(rows_.exact.spot)} exact, ${f(s.random.mean)} sim -> ${chk(rows_.exact.spot, 1.2915, 1.2925)}`,
    `- careful ratio band 1.30-1.41: ${f(s.careful.ratio, 3)} -> ${chk(s.careful.ratio, 1.30, 1.41)}`,
    `- full Control at most 1.65: ${f(s.full.ratio, 3)} -> ${s.full.ratio <= 1.65 ? 'ok' : 'MISS'}`,
    `- SPEC exact table for comparison: careful 1.713 (1.33x), good 1.874 (1.45x), full 2.129 (1.65x), good+full 2.277 (1.76x)`]);
  block('Course (steps), no perk', c, rows_.exact.course, [
    `- random mean target 1.590: ${f(rows_.exact.course)} exact, ${f(c.random.mean)} sim -> ${chk(rows_.exact.course, 1.5895, 1.5905)}`,
    `- careful ratio band 1.30-1.41: ${f(c.careful.ratio, 3)} -> ${chk(c.careful.ratio, 1.30, 1.41)}`,
    `- full Control at most 1.71: ${f(c.full.ratio, 3)} -> ${c.full.ratio <= 1.71 ? 'ok' : 'MISS'}`,
    `- SPEC exact table: careful 2.206 (1.39x), good 2.393 (1.50x), full 2.722 (1.71x), good+full 2.921 (1.84x, flagged)`]);
  block('Spotlight with Kind Floor +0.2x (default)', k2, rows_.exact.kf2, [
    `- random target 1.440 +-0.015: ${f(rows_.exact.kf2)} exact, ${f(k2.random.mean)} sim -> ${chk(rows_.exact.kf2, 1.425, 1.455)}`,
    `- careful target 1.28 +-0.015: ${f(k2.careful.ratio, 3)} -> ${chk(k2.careful.ratio, 1.265, 1.295)} (SPEC says 1.28 sits under the 1.30 band by design)`,
    `- good target 1.38 +-0.015: ${f(k2.good.ratio, 3)} -> ${chk(k2.good.ratio, 1.365, 1.395)}`,
    `- full Control target 1.54 +-0.015: ${f(k2.full.ratio, 3)} -> ${chk(k2.full.ratio, 1.525, 1.555)}`,
    `- full Control at most 1.65: ${k2.full.ratio <= 1.65 ? 'ok' : 'MISS'}`]);
  block('Spotlight with Kind Floor +0.1x (fallback)', k1, rows_.exact.kf1, [
    `- SPEC exact: random 1.366, careful 1.30x, good 1.41x, full 1.59x. Sim: random ${f(rows_.exact.kf1)}, careful ${f(k1.careful.ratio, 3)}, good ${f(k1.good.ratio, 3)}, full ${f(k1.full.ratio, 3)}.`]);
  L.push('## Bug line: Spotlight under 3.0x at the full tree', '',
    'The full-tree number (SPEC 11c, 2.60x with Kind Floor, 2.52x without) needs tokens, Extra Gold, Widener, Booster, Specialist and the 10-match-day season loop (sim/gaps_sim.py, 100k seasons). This tool does not model those, so that number is NOT recomputed here and the bug line is not checked directly.', '',
    'What is computable here, single-spin, no tokens:',
    `- Spotlight careful + Kind Floor + full Control, mean multiplier: ${f(k2.full.mean)} (good+full ${f(k2.goodfull.mean)}). Both under 3.0.`,
    '- Ceiling: with no value-raising node (Booster, Widener-to-value), a spin pays at most 3.0, so the mean reaches 3.0 only if gold lands every spin. Tokens, Extra Gold and Widener raise the gold rate, not the 3.0 value.',
    '- Ratios use the exact random mean as denominator (random is analytic); a sampled random mean is shown only as a sim sanity check (s.e. about 0.004). Course full Control sits within about one s.e. of its 1.71 cap, so a MISS there is within noise.',
    '', 'Verdict: bug line not testable in this tool; SPEC-quoted 2.60x is carried over, unverified.', '');
  return L.join('\n');
}
let rows_ = null;

import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const n = Number(process.argv.find((a) => /^\d+$/.test(a))) || 20000;
  rows_ = report(n);
  const text = md(rows_, n);
  console.log(text);
  if (process.argv.includes('--write')) {
    const out = '/mnt/project-files/games-design/cricket-sixes/2026-11-16-combined-handoff/t2/PARITY-T2.md';
    mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, text + '\n'); console.log('wrote', out);
  }
}
