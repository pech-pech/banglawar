// Replay determinism for the B1 physics sled: same seed + same scripted input must give
// identical event logs, Rapier world hash and final sled state across fresh worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { createSled, stepSled, FIXED_DT } from '../../pages/ridgeline/src/sled.js';
import { cfg, resetCfg } from '../../pages/ridgeline/src/config.js';
import { mulberry32, hashSeed } from '../../pages/ridgeline/src/rng.js';

const SEEDS = [1, 2024, hashSeed('replay-b1')];
const MAX_STEPS = Math.round(60 / FIXED_DT); // 60 s of sim time
const R = await loadRapier();

// Round every number to 6 dp so the log is stable JSON, not float noise in the printout.
const roundReplacer = (_k, v) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(6)) : v);

// Scripted input, drawn from its own RNG so it is independent of the sled's RNG.
//   steer: new random value in [-1, 1] every 30 steps
//   down:  toggled every 50 steps (true = held, false = dive)
//   fire:  pulses on the down->up edge (down goes from true to false)
function scriptedInput(seed) {
  const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  let steer = 0, down = true, prevDown = true;
  return (step) => {
    if (step % 30 === 0) steer = rnd() * 2 - 1;
    if (step > 0 && step % 50 === 0) down = !down;
    const fire = prevDown && !down;
    prevDown = down;
    return { steer, down, fire };
  };
}

function runOnce(seed) {
  const course = createCourse(seed, cfg);
  const phys = createPhysics(R, course, cfg);
  try {
    phys.update(0);
    const sled = createSled(course, phys, mulberry32((seed ^ 0x5bd1e995) >>> 0));
    const input = scriptedInput(seed);
    const events = [];
    let steps = 0;
    while (steps < MAX_STEPS && !sled.crashed && !sled.finished) {
      phys.update(sled.z);
      for (const ev of stepSled(sled, course, input(steps), cfg)) events.push(ev);
      steps++;
    }
    const state = {
      steps,
      x: sled.x, y: sled.y, z: sled.z, speed: sled.speed,
      crashed: sled.crashed, finished: sled.finished, launches: sled.launches,
    };
    const hash = phys.hash();
    const log = JSON.stringify({ events, hash, state }, roundReplacer);
    return { log, hash, state, launches: events.filter((e) => e.type === 'launch').length };
  } finally {
    phys.dispose();
  }
}

test('same seed and scripted input replay identically in fresh worlds', { timeout: 10 * 60 * 1000 }, () => {
  for (const seed of SEEDS) {
    const a = runOnce(seed);
    const b = runOnce(seed);
    console.log(`  seed ${seed}: steps=${a.state.steps} events=${a.log.length}B hash=${a.hash} launches=${a.launches}`);
    assert.equal(a.log, b.log, `seed ${seed}: event/state log differs between runs`);
    assert.equal(a.hash, b.hash, `seed ${seed}: phys.hash() differs between runs`);
  }
});

test('at least one launch across seeds with baseSpeed = maxSpeed = 42', { timeout: 10 * 60 * 1000 }, () => {
  cfg.baseSpeed = 42;
  cfg.maxSpeed = 42;
  try {
    let launches = 0;
    for (const seed of SEEDS) launches += runOnce(seed).launches;
    console.log(`  launches across ${SEEDS.length} seeds: ${launches}`);
    assert.ok(launches >= 1, 'expected at least one launch event across the seeds');
  } finally {
    resetCfg();
  }
});
