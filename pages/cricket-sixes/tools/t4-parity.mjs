#!/usr/bin/env node
// T4 parity harness (wheels SPEC 2a-2c, 5, 9, 10; test 1, 2, 2b). Pure modules only: Find / Scout / Finals data, find-aim, finals-paid.
// Pulse: js/core/wheel-pulse.js is NOT required; uses the fallback tick in find-aim.js (CONTRACT-A sec 3 / SPEC 2c), W0 scaled for Slow.
// Rows: random / careful / good / full Control (Slow x0.55, Steady x0.7225, Guide sd 0.080). Careful sd 0.110, good 0.070.
// Usage: node tools/t4-parity.mjs [--n 20000] [--seed 1] [--calibrate]
import { fileURLToPath } from 'node:url';
import { FIND_SLICES, FIND_RATES, FIND_J } from '../js/data/wheels/find.js';
import { SCOUT_SLICES } from '../js/data/wheels/scout.js';
import { FINALS_SLICES } from '../js/data/wheels/finals.js';
import { findAimTarget, arrivalNear, tickFallback, FIND_GLOW_CENTER } from '../js/core/find-aim.js';
import { paidAmount } from '../js/core/finals-paid.js';

const CIRC = 10, J0 = 1.2, MIN_W = 0.5, FIND_MIN_W = 0.3;
const SD = { careful: 0.110, good: 0.070, full: 0.080 };
export const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r, sd) => sd * Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());

export const WHEELS = [
  ...FIND_RATES.map((p) => ({ key: 'Find ' + Math.round(p * 100), ring: FIND_SLICES[p], J: FIND_J, find: true, score: (s) => (s.gold ? 1 : 0), unit: 'rate', rand: p })),
  { key: 'Scout steps', ring: SCOUT_SLICES, J: J0, score: (s) => s.value, unit: 'steps', rand: 0.60 },
  { key: 'Finals coin-eq', ring: FINALS_SLICES, J: J0, score: (s) => (s.type === 'Medal' ? s.value : paidAmount(s)), unit: 'coin-eq', rand: 21.6 },
];

const tickFor = (slow) => { const k = slow ? 0.55 : 1; return (e) => k * tickFallback(e); };
const sliceAt = (ring, pos) => { let a = 0; const p = ((pos % CIRC) + CIRC) % CIRC; for (const s of ring) { a += s.w; if (p < a) return s; } return ring[ring.length - 1]; };

/** Mean score of one wheel for a tapper over n spins. who: random | careful | good | full. */
export function simulate(wheel, who, n, seed) {
  const r = mulberry32(seed), { ring } = wheel;
  const full = who === 'full', tick = tickFor(full), J = wheel.J * (full ? 0.7225 : 1), sd = SD[who];
  let sum = 0, target = -1;
  // careful target for non-Find wheels: best-value slice (width >= 0.5), chosen per spin by arrival nearest 3.5 s
  const bestV = wheel.find ? 0 : Math.max(...ring.filter((s) => s.w >= MIN_W).map((s) => s.value));
  for (let i = 0; i < n; i++) {
    const phi = r() * CIRC, wob = (r() * 2 - 1) * J;
    if (who === 'random') { sum += wheel.score(sliceAt(ring, phi + r() * CIRC)); continue; }
    const arr = (id) => arrivalNear(ring, id, phi, tick);
    if (wheel.find) target = findAimTarget(ring, arr, { phi: 0, minW: FIND_MIN_W });
    else { let bd = Infinity; target = -1; for (const s of ring) if (s.value === bestV && s.w >= MIN_W) { const d = Math.abs(arr(s.id) - FIND_GLOW_CENTER); if (d < bd) { bd = d; target = s.id; } } }
    if (target < 0) { sum += wheel.score(sliceAt(ring, phi + r() * CIRC)); continue; }
    const t = Math.max(0.35, arr(target) + gauss(r, sd)); // STOP guard 0.35 s
    sum += wheel.score(sliceAt(ring, phi + tick(t) + wob));
  }
  return sum / n;
}

export function table(n, seed) {
  return WHEELS.map((w) => {
    const row = { key: w.key, unit: w.unit, spec: w.rand };
    for (const who of ['random', 'careful', 'good', 'full']) row[who] = simulate(w, who, who === 'random' ? n * 4 : n, seed + who.length * 101);
    return row;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), arg = (k, d) => (a.includes(k) ? Number(a[a.indexOf(k) + 1]) : d);
  const n = arg('--n', 20000), seed = arg('--seed', 1);
  const f = (x, d = 3) => x.toFixed(d);
  console.log(`T4 parity  n=${n} seed=${seed}  pulse=fallback tick (find-aim.js; wheel-pulse.js absent)`);
  console.log('wheel'.padEnd(16) + ['random', 'careful', 'good', 'full'].map((s) => s.padStart(18)).join(''));
  for (const r of table(n, seed)) console.log(r.key.padEnd(16) + ['random', 'careful', 'good', 'full'].map((k) => (k === 'random' ? f(r[k]) : `${f(r[k])} (${f(r[k] / r.random, 2)}x)`).padStart(18)).join(''));
  if (a.includes('--calibrate')) {
    // smallest n where careful/good/full ratios across 8 seeds spread (max-min) <= 0.1 on every wheel
    for (const m of [500, 1000, 2000, 4000, 8000, 16000]) {
      let worst = 0;
      for (const w of WHEELS) for (const who of ['careful', 'good', 'full']) {
        const xs = Array.from({ length: 8 }, (_, s) => simulate(w, who, m, 7 + s * 13) / w.rand);
        worst = Math.max(worst, Math.max(...xs) - Math.min(...xs));
      }
      console.log(`n=${m} worst ratio spread over 8 seeds ${f(worst)}${worst <= 0.1 ? '  <= 0.1' : ''}`);
      if (worst <= 0.1) break;
    }
  }
}
