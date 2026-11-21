// B3 hull balance sweep (maker T). Bots: idle (steer 0), careful (safe-lane follower, no boost),
// mid (lane + rock/gate aware, boosts when charged, dives in the air). Runs spread over worker_threads.
// CLI: node tests/ridgeline/hull-sweep.mjs [--runs N] [--hulls wren,kite,..] [--bots idle,careful,mid] [--workers W] [--json out.json]
// Not part of the node --test glob (no .test suffix); hull-sweep.test.mjs imports runSweep for a 40-run smoke.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { createSled, stepSled } from '../../pages/ridgeline/src/sled.js';
import { cfg, resetCfg } from '../../pages/ridgeline/src/config.js';
import { mulberry32, hashSeed } from '../../pages/ridgeline/src/rng.js';

export const HULLS = ['wren', 'kite', 'anvil', 'barge', 'spindle'];
export const BOTS = ['idle', 'careful', 'mid'];
const SELF = fileURLToPath(import.meta.url);
const MAXSTEPS = 120 * 900; // 15 min of sim; far above any expected run
export const median = (a) => { const b = a.slice().sort((x, y) => x - y); const n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function laneTarget(course, s) {
  const la = s.mode === 'air' ? Math.max(12, 0.6 * s.speed) : Math.max(12, 0.3 * s.speed);
  return course.safeX(s.z + la);
}
export function makeBot(kind, course, rng) {
  if (kind === 'idle') return () => ({ steer: 0, fire: false, down: true });
  if (kind === 'careful') return (s) => ({ steer: clamp(0.5 * (laneTarget(course, s) - s.x), -1, 1), fire: false, down: true });
  // mid: skill noise from the seeded rng (reaction offset in m, refreshed every ~1 s)
  let off = 0, nextN = 0, diveOn = false;
  return (s) => {
    if (s.t >= nextN) { off = (rng() * 2 - 1) * 1.2; nextN = s.t + 1; }
    const lane = laneTarget(course, s);
    let tx = lane;
    const look = Math.max(14, 0.9 * s.speed);
    const gates = course.gatesInRange(s.z + 3, s.z + look);
    if (gates.length) tx = clamp(gates[0].x, lane - 2.5, lane + 2.5); // thread the next gate, never far from the safe lane
    tx += off * 0.5;
    // keep >= 2.2 m clear of rocks near the target line (graze charge still comes from the lane passing them)
    for (const r of course.rocksInRange(s.z + 3, s.z + look)) {
      const need = r.r + 2.2;
      if (Math.abs(r.x - tx) < need && !(s.mode === 'air' && s.y >= course.height(r.x, r.z) + r.r)) tx = r.x + (tx >= r.x ? need : -need);
    }
    const hw = course.halfWidth(s.z), cx = course.centerX(s.z);
    tx = clamp(tx, cx - hw + 1.2, cx + hw - 1.2);
    const grounded = s.mode !== 'air';
    const fire = grounded && s.boost >= 0.5;
    // dive early in a long air time only while well above ground
    let down = true;
    if (!grounded) {
      const clear = s.y - course.height(s.x, s.z);
      if (clear > 5 && s.tAir > 0.25) diveOn = true; else if (clear < 3) diveOn = false;
      down = !diveOn;
    } else diveOn = false;
    return { steer: clamp(0.5 * (tx - s.x), -1, 1), fire, down };
  };
}

// One run to the end of the run. Returns {dist, cause, steps, wrecks}.
export function oneRun(R, seed, hull, botKind) {
  resetCfg(); cfg.endless = 1;
  const course = createCourse(seed, cfg);
  const phys = createPhysics(R, course, cfg);
  try {
    phys.update(0);
    const sled = createSled(course, phys, mulberry32((seed ^ 0x5bd1e995) >>> 0), { hull });
    const bot = makeBot(botKind, course, mulberry32((seed ^ 0x9e3779b9) >>> 0));
    let steps = 0;
    while (!sled.crashed && !sled.runOver && steps < MAXSTEPS) {
      phys.update(sled.physZ ?? sled.z);
      stepSled(sled, course, bot(sled), cfg);
      steps++;
    }
    return { dist: sled.dist ?? sled.z, cause: sled.runOverCause || (steps >= MAXSTEPS ? 'cap' : 'unknown'), steps, wrecks: sled.wrecks };
  } finally { phys.dispose(); }
}

if (!isMainThread && workerData && workerData.sweep) {
  const R = await loadRapier();
  const out = [];
  for (const j of workerData.jobs) out.push({ hull: j.hull, bot: j.bot, i: j.i, ...oneRun(R, j.seed, j.hull, j.bot) });
  parentPort.postMessage(out);
  process.exit(0);
}

// Same seed i for every hull (paired comparison). Jobs interleaved across workers.
export async function runSweep({ runs = 40, hulls = HULLS, bots = ['mid'], workers = os.cpus().length, onProgress } = {}) {
  const jobs = [];
  for (let i = 0; i < runs; i++) for (const bot of bots) for (const hull of hulls) jobs.push({ hull, bot, i, seed: hashSeed('hull-sweep-' + i) });
  const W = Math.max(1, Math.min(workers, jobs.length));
  const parts = Array.from({ length: W }, (_, w) => jobs.filter((_, k) => k % W === w));
  const res = await Promise.all(parts.map((p) => new Promise((ok, bad) => {
    const w = new Worker(SELF, { workerData: { sweep: true, jobs: p } });
    w.once('message', (m) => { if (onProgress) onProgress(m.length); ok(m); });
    w.once('error', bad);
    w.once('exit', (c) => { if (c) bad(new Error('worker exit ' + c)); });
  })));
  return res.flat();
}

export function summarise(rows, hulls = HULLS, bots = BOTS) {
  const out = {};
  for (const bot of bots) {
    out[bot] = {};
    for (const hull of hulls) {
      const r = rows.filter((x) => x.bot === bot && x.hull === hull);
      if (!r.length) continue;
      const d = r.map((x) => x.dist);
      out[bot][hull] = {
        n: r.length, median: median(d), mean: d.reduce((a, b) => a + b, 0) / d.length,
        night: r.filter((x) => x.cause === 'night').length / r.length, rock: r.filter((x) => x.cause === 'rock').length / r.length,
        other: r.filter((x) => x.cause !== 'night' && x.cause !== 'rock').length / r.length,
      };
    }
  }
  return out;
}

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runs = +arg('runs', 100), hulls = arg('hulls', HULLS.join(',')).split(','), bots = arg('bots', 'mid').split(',');
  const workers = +arg('workers', os.cpus().length), jsonOut = arg('json', '');
  const t0 = Date.now();
  const rows = await runSweep({ runs, hulls, bots, workers });
  const sum = summarise(rows, hulls, bots);
  for (const bot of bots) {
    console.log(`bot ${bot} (${runs} runs/hull, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    const w = sum[bot].wren;
    for (const h of hulls) {
      const s = sum[bot][h];
      console.log(`  ${h.padEnd(8)} median ${s.median.toFixed(0).padStart(6)} m  ratio ${w ? (s.median / w.median).toFixed(3) : '-'}  night ${(100 * s.night).toFixed(0)}%  rock ${(100 * s.rock).toFixed(0)}%  other ${(100 * s.other).toFixed(0)}%`);
    }
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ runs, sum, rows }));
}
