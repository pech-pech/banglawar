// B2 endless replay determinism: same seed + scripted inputs for 3 km -> identical phys.hash() at 10 checkpoints
// across two runs, and across a forced floating-origin shift (cfg.originShift = 500 in both runs of that pair).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { createProps } from '../../pages/ridgeline/src/props.js';
import { createSled, stepSled } from '../../pages/ridgeline/src/sled.js';
import { cfg, resetCfg } from '../../pages/ridgeline/src/config.js';
import { mulberry32, hashSeed } from '../../pages/ridgeline/src/rng.js';

const R = await loadRapier();
const SEEDS = [907567659, 924345278, hashSeed('endless-replay-a')];
const reached = new Map(); // seed -> max z reached, for the >=1500 m requirement
const GOAL = 3000;
const J = JSON.stringify;

// Scripted input: a pure function of (step, sled state): lane-follow toward course.safeX at a look-ahead plus a
// boost pulse every 600 steps and a slow tuck toggle. No RNG, so it is identical in every run.
function scripted(course) {
  return (i, s) => {
    const la = Math.max(12, (s.mode === 'air' ? 0.6 : 0.3) * s.speed);
    const steer = Math.max(-1, Math.min(1, 0.5 * (course.safeX(s.z + la) - s.x)));
    return { steer, fire: i % 600 === 599, down: (i >> 7) % 2 === 0 };
  };
}

function run(seed, originShift) {
  resetCfg(); cfg.endless = 1;
  if (originShift) cfg.originShift = originShift;
  const course = createCourse(seed, cfg);
  const phys = createPhysics(R, course, cfg);
  try {
    phys.update(0);
    const props = createProps(R, phys, course, cfg);
    const sled = createSled(course, phys, mulberry32((seed ^ 0x5bd1e995) >>> 0));
    sled._props = props;
    const inp = scripted(course);
    const events = [];
    const marks = [];
    let steps = 0;
    const MAX = 120 * 200;
    // Checkpoint k (1..10) is taken the first step the sled passes k*GOAL/10 m; hash and state recorded there.
    while (sled.z < GOAL && !sled.crashed && steps < MAX) {
      phys.update(sled.physZ ?? sled.z);
      props.update(sled.z);
      for (const e of stepSled(sled, course, inp(steps, sled), cfg)) events.push(e.type + ':' + (e.id ?? e.zone ?? ''));
      steps++;
      while (marks.length < 10 && sled.z >= (marks.length + 1) * GOAL / 10) {
        marks.push({ step: steps, hash: phys.hash(), shifts: phys.origin.count, x: sled.x, y: sled.y, z: sled.z, speed: sled.speed });
      }
    }
    const endHash = phys.hash();
    return { marks, endHash, events, steps, z: sled.z, crashed: sled.crashed, shifts: phys.origin.count, props: props.stats.hits };
  } finally { phys.dispose(); }
}

// Determinism is the point, not survival: an early crash is fine provided both runs end at the same step with the same hash.
function sameEnd(label, a, b) {
  assert.equal(a.steps, b.steps, `${label}: end step`);
  assert.equal(a.crashed, b.crashed, `${label}: crashed flag`);
  assert.equal(a.endHash, b.endHash, `${label}: final phys.hash`);
}

function checkpoints(label, a, b, withHash = true) {
  assert.equal(a.marks.length, b.marks.length, `${label}: checkpoint count`);
  a.marks.forEach((m, k) => {
    const n = b.marks[k];
    if (withHash) assert.equal(m.hash, n.hash, `${label}: phys.hash differs at checkpoint ${k + 1} (step ${m.step})`);
    assert.equal(J(m), J(n), `${label}: state differs at checkpoint ${k + 1}`);
  });
  assert.equal(J(a.events), J(b.events), `${label}: event log differs`);
}

for (const seed of SEEDS) {
  test(`seed ${seed}: 3 km, 10 checkpoints, two default-origin runs identical`, { timeout: 5 * 60 * 1000 }, () => {
    const a = run(seed, 0), b = run(seed, 0);
    console.log(`  seed ${seed}: z ${a.z.toFixed(0)} steps ${a.steps} shifts ${a.shifts} hits ${a.props} ${a.crashed ? 'CRASHED' : 'ok'}`);
    reached.set(seed, a.z);
    sameEnd('default', a, b);
    checkpoints('default', a, b);
    if (a.z >= 2100) assert.ok(a.shifts >= 1, 'default originShift 2000 shifts at least once');
  });

  test(`seed ${seed}: 3 km with forced origin shift (originShift 500), two runs identical, state close to unshifted`, { timeout: 5 * 60 * 1000 }, () => {
    const a = run(seed, 500), b = run(seed, 500);
    sameEnd('shift500', a, b);
    if (a.marks.length === 10) assert.ok(a.shifts >= 5, `forced shifts ${a.shifts}`);
    checkpoints('shift500', a, b);
    // Positions are absolute doubles; a shift must not change the ride. Hash differs by design (mixes origin.count).
    const base = run(seed, 0);
    const n = Math.min(a.marks.length, base.marks.length);
    const worst = a.marks.slice(0, n).reduce((w, m, k) => Math.max(w, Math.hypot(m.x - base.marks[k].x, m.y - base.marks[k].y, m.z - base.marks[k].z)), 0);
    console.log(`  seed ${seed}: shifts ${a.shifts} vs ${base.shifts}, worst checkpoint position drift ${worst.toExponential(2)} m`);
    // Slab heights are f32 relative to the origin, so a different origin rounds the ground differently (mm) and the ride
    // amplifies it (measured 3 mm .. 0.23 m by 3 km). Not exact by design; only bound it. Exact equality is asserted
    // between runs that use the same originShift.
    assert.ok(worst < 1.0, `shifted vs unshifted position drift ${worst}`);
  });
}

test('at least 2 of 3 seeds reach 1500 m (default origin)', () => {
  const ok = SEEDS.filter(sd => reached.get(sd) >= 1500).length;
  assert.ok(ok >= 2, `seeds reaching 1500 m: ${ok} of ${SEEDS.length} (${[...reached].map(([k, z]) => k + ':' + z.toFixed(0))})`);
});
