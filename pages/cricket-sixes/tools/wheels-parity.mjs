// Wheels parity harness (task A2.4, SPEC 2b + 14 tests 2, 3). Node only, seeded only, no DOM, no network.
// Drives the SHIPPED pure modules (tickAt, wheelWobble, wheel-ring, WHEEL_ENGINE) with the python sim's tapper models.
//   node tools/wheels-parity.mjs [--n 20000] [--seed parity] [--rings rings.json] [--wheel hype] [--patient]
// rings.json = { "<name>": { "rows": [{id,w,value,label,tier,gold}...], "J": 1.2?, "minAim": 0.5? } }  (rows per CONTRACT-A sec 5)
// Without --rings the CLI tries js/data/wheels/<wheel>.js (T2-T4, `RING` or default export rows); nothing is typed in here.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WHEEL_ENGINE } from '../js/data/wheel-engine.js';
import { tickAt } from '../js/core/wheel-pulse.js';
import { checkRing } from '../js/core/wheel-ring.js';
import { makeRng } from '../js/core/rng.js';

// wheelWobble needs js/core/spin-keys.js (written by another helper); same formula as fallback until it lands.
let wheelWobble = (key, J) => (makeRng(key).random() * 2 - 1) * J;
try { ({ wheelWobble } = await import('../js/core/wheel-wobble.js')); } catch { /* spin-keys.js not there yet */ }

// SPEC 2b sim-only numbers (never ported to the game).
export const SIM = Object.freeze({
  SD: Object.freeze({ avg: 0.110, good: 0.070 }),
  GSD: Object.freeze({ avg: 0.080, good: 0.050 }),
  SLOW: 0.55, STEADY: 0.7225, T_MID: 3.5, T_MIN: 0.5, MIN_AIM: 0.5, FIND_MIN_AIM: 0.3, TIE_EPS: 0.05,
});

// Tapper models. who: sd family; control: full Control (Slow + Steady + Guide sd); cycle: patient tapper's cycle (1-based).
export const TAPPERS = Object.freeze({
  random:   { random: true },
  careful:  { who: 'avg',  control: false, cycle: 1 },
  good:     { who: 'good', control: false, cycle: 1 },
  full:     { who: 'avg',  control: true,  cycle: 1 },
  goodfull: { who: 'good', control: true,  cycle: 1 },
  patient:  { who: 'avg',  control: false, cycle: 4 },   // taps at the cycle-4 time nearest 3.5 s (SPEC test 3)
  patientSlow: { who: 'avg', control: false, cycle: 4, waitLo: 3.6, waitHi: 3.8 }, // waits for 3.6-3.8 s of cycle 4
});

const C = WHEEL_ENGINE.CIRC;
const edgesOf = (rows) => { let x = 0; return rows.map((s) => { const a = x; x += s.w; return [a, x]; }); };
const sliceAt = (edges, pos) => { const p = ((pos % C) + C) % C; let lo = 0, hi = edges.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (edges[m][0] <= p) lo = m; else hi = m - 1; } return lo; };
export const exactRandom = (rows) => rows.reduce((a, s) => a + s.w * s.value, 0) / rows.reduce((a, s) => a + s.w, 0);

// Smallest t >= lo with tickAt(t) >= g (tickAt is monotonic).
function invTick(g, P, lo, hi = 40) {
  if (tickAt(hi, P) < g) return null;
  let a = lo, b = hi;
  for (let i = 0; i < 36; i++) { const m = (a + b) / 2; if (tickAt(m, P) < g) a = m; else b = m; }
  return (a + b) / 2;
}

// Tie rule of SPEC 5 (also used for every ring): target = best-value slice whose arrival is nearest tRef;
// arrivals within TIE_EPS of the nearest are tied -> wider block, then first clockwise from the pointer.
function pickTarget(rows, edges, phi, P, tRef, minAim) {
  const cand = rows.map((s, i) => i).filter((i) => rows[i].w >= minAim - 1e-9);
  const pool = cand.length ? cand : rows.map((s, i) => i);
  const vmax = Math.max(...pool.map((i) => rows[i].value));
  const best = pool.filter((i) => rows[i].value === vmax);
  const base = tickAt(tRef, P) + phi, lo = tickAt(SIM.T_MIN, P);
  const arr = [];
  for (const i of best) {
    const c = (edges[i][0] + edges[i][1]) / 2;
    const k0 = Math.round((base - c) / C);
    let bt = null;
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const g = c + k * C - phi;
      if (g < lo) continue;
      const t = invTick(g, P, SIM.T_MIN);
      if (t != null && (bt == null || Math.abs(t - tRef) < Math.abs(bt - tRef))) bt = t;
    }
    if (bt != null) arr.push({ i, t: bt, d: Math.abs(bt - tRef) });
  }
  if (!arr.length) return { i: best[0], t: tRef };
  const dmin = Math.min(...arr.map((a) => a.d));
  const tied = arr.filter((a) => a.d <= dmin + SIM.TIE_EPS).sort((x, y) => (rows[y.i].w - rows[x.i].w) || (x.i - y.i));
  const hit = tied.length > 1 ? tied[0] : arr.find((a) => a.d === dmin);
  return hit;
}

/** Run n spins of one tapper on one ring. Returns {n, mean, ratio, random, hits[]}. Same seed + n => same numbers. */
export function runTapper(rows, tapperName, { n = 2000, seed = 'parity', name = 'ring', J, minAim, stratify = true } = {}) {
  const T = TAPPERS[tapperName];
  if (!T) throw new Error(`unknown tapper ${tapperName}`);
  const edges = edgesOf(rows), rnd = exactRandom(rows);
  const J0 = J ?? WHEEL_ENGINE.J, ma = minAim ?? SIM.MIN_AIM;
  // Common random numbers: stream depends on seed + ring + n only, not on tapper, so careful / patient / full share phases and noise.
  const rng = makeRng(`${seed}|tap|${name}|${n}`);
  const hits = new Array(rows.length).fill(0);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const phi = rng.random() * C, z = rng.normalish(0, 1), u = rng.random();
    let pos;
    if (T.random) {
      pos = stratify ? ((i + u) / n) * C : phi;   // random tapper lands by width (stratified: low-variance, still seeded)
    } else {
      const ctl = T.control;
      const P = { W0: WHEEL_ENGINE.W0 * (ctl ? SIM.SLOW : 1), D: WHEEL_ENGINE.D };
      const sd = (ctl ? SIM.GSD : SIM.SD)[T.who], Jt = J0 * (ctl ? SIM.STEADY : 1);
      const tRef = SIM.T_MID + WHEEL_ENGINE.PULSE_PERIOD * (T.cycle - 1);
      let t0 = pickTarget(rows, edges, phi, P, tRef, ma).t;
      if (T.waitLo != null) { // waits for an arrival inside [3.6, 3.8] of its cycle if one exists, else the normal tap
        const hit = waitWindow(rows, edges, phi, P, T);
        if (hit != null) t0 = hit;
      }
      const t = Math.max(SIM.T_MIN, t0 + z * sd);
      pos = phi + tickAt(t, P) + wheelWobble(`${seed}|wob|${name}|${tapperName}|${i}|0`, Jt);
    }
    const s = sliceAt(edges, pos);
    hits[s]++; sum += rows[s].value;
  }
  return { n, mean: sum / n, ratio: sum / n / rnd, random: rnd, hits };
}

// Patient variant: first of cycles 1..cycle whose tick window [3.6, 3.8] covers the centre of a best slice.
function waitWindow(rows, edges, phi, P, T) {
  const PER = WHEEL_ENGINE.PULSE_PERIOD, vmax = Math.max(...rows.filter((s) => s.w >= SIM.MIN_AIM).map((s) => s.value));
  for (let j = 0; j < T.cycle; j++) {
    const a = tickAt(j * PER + T.waitLo, P) + phi, b = tickAt(j * PER + T.waitHi, P) + phi;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].value !== vmax || rows[i].w < SIM.MIN_AIM) continue;
      const c = (edges[i][0] + edges[i][1]) / 2, k = Math.ceil((a - c) / C);
      if (c + k * C <= b) return invTick(c + k * C - phi, P, SIM.T_MIN);
    }
  }
  return null;
}

/** One table row set for a ring: random + every tapper in `tappers`. */
export function parityRow(rows, opts = {}, tappers = ['random', 'careful', 'good', 'full', 'goodfull']) {
  const out = {};
  for (const t of tappers) out[t] = runTapper(rows, t, opts);
  return out;
}

export function formatTable(results) {
  const cols = Object.keys(Object.values(results)[0]);
  const lines = [`${'wheel'.padEnd(10)} ${cols.map((c) => c.padStart(18)).join(' ')}`];
  for (const [w, r] of Object.entries(results)) {
    lines.push(`${w.padEnd(10)} ${cols.map((c) => `${r[c].mean.toFixed(3)} (${r[c].ratio.toFixed(2)}x)`.padStart(18)).join(' ')}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const n = Number(arg('n', 20000)), seed = arg('seed', 'parity'), only = arg('wheel', null);
  const patient = process.argv.includes('--patient');
  let rings = {};
  const file = arg('rings', null);
  if (file) rings = JSON.parse(readFileSync(file, 'utf8'));
  else {
    for (const w of ['spot', 'course', 'find', 'hype', 'toss', 'pep', 'scout', 'finals']) {
      const p = fileURLToPath(new URL(`../js/data/wheels/${w}.js`, import.meta.url));
      if (!existsSync(p)) continue;
      const m = await import(pathToFileURL(p).href);
      const rows = m.RING ?? m.default;
      if (Array.isArray(rows)) rings[w] = { rows, J: m.J };
    }
  }
  const names = Object.keys(rings).filter((k) => !only || k === only);
  if (!names.length) { console.log('no rings: pass --rings file.json (see header) or add js/data/wheels/<wheel>.js'); process.exit(0); }
  const res = {};
  for (const nm of names) {
    const { rows, J, minAim } = rings[nm];
    const bad = checkRing(rows, { allowEqual: true, cap: 0.13 });
    if (bad.length) console.log(`warn ${nm}: ${bad.join('; ')}`);
    const o = { n, seed, name: nm, J, minAim: minAim ?? (nm.startsWith('find') ? SIM.FIND_MIN_AIM : undefined) };
    res[nm] = parityRow(rows, o, patient ? ['careful', 'patient', 'patientSlow'] : ['random', 'careful', 'good', 'full', 'goodfull']);
  }
  console.log(`wheels parity, n ${n}, seed ${seed}; cell = mean (ratio over exact random)`);
  console.log(formatTable(res));
}
