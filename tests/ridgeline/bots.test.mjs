// B2 endless bots on 20 seeds. Runtime note: Rapier + props run ~2000 steps/s, so the lane bot stops the moment it reaches
// 2000 m (hard cap 120*90 steps) and the tumble drop test is reduced to 40 drops (B1 used 200/50); lane/idle seeds run in 4 worker_threads (serial lane bot was ~80 s).
// Idle bot dies early (cheap).
import { test } from 'node:test';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { createProps } from '../../pages/ridgeline/src/props.js';
import { createSled, stepSled } from '../../pages/ridgeline/src/sled.js';
import { cfg, resetCfg } from '../../pages/ridgeline/src/config.js';
import { mulberry32, hashSeed } from '../../pages/ridgeline/src/rng.js';

const R = await loadRapier();
const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('bot-seed-' + i));
const GOAL = 2000;
const STEP_BUDGET = 120 * 90;
const median = (a) => { const b = a.slice().sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };

// Lane bot copied from unit.test.mjs: steer toward safeX a look-ahead away (0.6 s in the air, 0.3 s on the ground, min 12 m).
function laneBot(course) {
  return (s) => {
    const la = s.mode === 'air' ? Math.max(12, 0.6 * s.speed) : Math.max(12, 0.3 * s.speed);
    return { steer: Math.max(-1, Math.min(1, 0.5 * (course.safeX(s.z + la) - s.x))), fire: false };
  };
}
const idleBot = () => ({ steer: 0, fire: false });

// Ride exactly as main.js loop does. stopAt: end when sled.z >= stopAt. After a crash, optionally keep stepping the
// physics only (tumble body) for `tail` steps, sampling the tumble body against the surface.
function ride(seed, bot, { stopAt = Infinity, tail = 0 } = {}) {
  resetCfg(); cfg.endless = 1;
  const course = createCourse(seed, cfg);
  const phys = createPhysics(R, course, cfg);
  try {
    phys.update(0);
    const props = createProps(R, phys, course, cfg);
    const sled = createSled(course, phys, mulberry32((seed ^ 0x5bd1e995) >>> 0));
    sled._props = props;
    const bot_ = bot(course);
    let steps = 0, minClear = Infinity, tumbleSamples = 0, minAt = '';
    const sample = (tag) => {
      const t = phys.tumbleState();
      if (!t) return;
      const clear = t.p.y - course.height(t.p.x, t.p.z);
      tumbleSamples++;
      if (clear < minClear) { minClear = clear; minAt = `${tag} step ${steps} p(${t.p.x.toFixed(2)},${t.p.y.toFixed(2)},${t.p.z.toFixed(2)})`; }
    };
    while (steps < STEP_BUDGET && !sled.crashed && sled.z < stopAt) {
      phys.update(sled.physZ ?? sled.z);
      props.update(sled.z);
      stepSled(sled, course, bot_(sled), cfg);
      steps++;
      if (sled.mode === 'tumble') sample('ride');
    }
    const crashedAt = sled.z;
    for (let i = 0; i < tail && phys.tumbleState(); i++) {
      phys.update(phys.tumbleState().p.z);
      props.update(phys.tumbleState().p.z);
      phys.step();
      steps++;
      sample('tail');
    }
    return { dist: sled.dist ?? crashedAt, z: crashedAt, crashed: sled.crashed, steps, minClear, tumbleSamples, minAt, shifts: phys.origin.count };
  } finally { phys.dispose(); }
}

// Runtime: seeds are spread over 4 worker_threads (each re-imports this file and loads its own Rapier), ~4x faster.
if (!isMainThread) {
  const { kind, seeds } = workerData;
  const out = seeds.map((s) => ({ seed: s, ...(kind === 'lane' ? ride(s, laneBot, { stopAt: GOAL, tail: 300 }) : ride(s, () => idleBot, { stopAt: GOAL, tail: 300 })) }));
  parentPort.postMessage(out);
  process.exit(0);
}
function runPool(kind) {
  const W = 4;
  const parts = Array.from({ length: W }, (_, w) => SEEDS.filter((_, i) => i % W === w));
  return Promise.all(parts.map((seeds) => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { kind, seeds } });
    w.once('message', res); w.once('error', rej);
    w.once('exit', (c) => { if (c) rej(new Error('worker exit ' + c)); });
  }))).then((a) => a.flat().sort((x, y) => SEEDS.indexOf(x.seed) - SEEDS.indexOf(y.seed)));
}

const laneRes = [], idleRes = [];

test('lane bot reaches >= 2000 m on >= 18 of 20 seeds, no throws', { timeout: 10 * 60 * 1000 }, async () => {
  let ok = 0;
  const fails = [];
  for (const r of await runPool('lane')) {
    const s = r.seed;
    laneRes.push(r);
    if (r.z >= GOAL) ok++; else fails.push(`seed ${s}: ${r.crashed ? 'crashed' : 'timeout'} at ${r.z.toFixed(0)} m step ${r.steps}`);
    if (Number.isFinite(r.minClear)) assert.ok(r.minClear >= -0.05, `seed ${s}: tumble below surface ${r.minClear} at ${r.minAt}`);
  }
  console.log(`  lane bot: ${ok}/20 reached ${GOAL} m; median z ${median(laneRes.map((r) => r.z)).toFixed(0)} m; failures: ${fails.join(' | ') || 'none'}`);
  assert.ok(ok >= 18, `lane bot reached ${GOAL} m on ${ok}/20: ${fails.join(' | ')}`);
});

test('idle bot dies before 2000 m on most seeds, tumble body never below surface', { timeout: 10 * 60 * 1000 }, async () => {
  let died = 0, samples = 0, worst = Infinity, worstAt = '';
  for (const r of await runPool('idle')) {
    const s = r.seed;
    idleRes.push(r);
    if (r.crashed && r.z < GOAL) died++;
    samples += r.tumbleSamples;
    if (r.minClear < worst) { worst = r.minClear; worstAt = `seed ${s} ${r.minAt}`; }
  }
  console.log(`  idle bot: died before ${GOAL} m on ${died}/20; median z ${median(idleRes.map((r) => r.z)).toFixed(0)} m; tumble samples ${samples}, worst clearance ${worst.toFixed(3)} m (${worstAt})`);
  assert.ok(died >= 11, `idle bot died on only ${died}/20`);
  assert.ok(samples > 100, 'tumble sampled');
  assert.ok(worst >= -0.05, `tumble below surface: ${worst} at ${worstAt}`);
});

// B1 drop pattern on endless courses: wreck-like tumble dropped at various z (including across forced origin shifts),
// 240 steps each, clearance to course.height sampled every step.
test('tumble body never below surface: 40 drops on endless courses (originShift 300)', { timeout: 10 * 60 * 1000 }, () => {
  let worst = Infinity, worstAt = '';
  for (let k = 0; k < 40; k++) {
    resetCfg(); cfg.endless = 1; cfg.originShift = 300;
    const seed = hashSeed('drop-' + (k % 20));
    const course = createCourse(seed, cfg);
    const phys = createPhysics(R, course, cfg);
    try {
      const z0 = 150 + k * 41;
      const x0 = course.centerX(z0);
      phys.update(z0);
      const gz = course.height(x0, z0 + 1) - course.height(x0, z0);
      const v = 20 + (k % 5) * 8;
      phys.startTumble({ x: x0, y: course.height(x0, z0) + 0.5 + (k % 4), z: z0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: (k % 3 - 1) * 2, y: gz * v, z: v }, { x: 2, y: 0.5, z: 1 });
      for (let i = 0; i < 240; i++) {
        phys.update(phys.tumbleState().p.z);
        phys.step();
        const t = phys.tumbleState();
        const clear = t.p.y - course.height(t.p.x, t.p.z);
        if (clear < worst) { worst = clear; worstAt = `drop ${k} seed ${seed} step ${i}`; }
      }
    } finally { phys.dispose(); }
  }
  console.log(`  40 drops: worst clearance ${worst.toFixed(3)} m (${worstAt})`);
  assert.ok(worst >= -0.05, `tumble below surface: ${worst} at ${worstAt}`);
});
