import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { DEFAULTS } from '../../pages/ridgeline/src/config.js';
import { mulberry32 } from '../../pages/ridgeline/src/rng.js';

const cfg = { ...DEFAULTS };
const R = await loadRapier();
const MS=[];
const all = { maxUpdateMs: 0, syncBuilds: 0, initMs: 0, firstStepMs: 0, maxStepMs: 0, maxSwapMs: 0, slabs: 0 };
const fold = (s) => {
  MS.push(s.maxStepMs);
  all.firstStepMs = Math.max(all.firstStepMs, s.firstStepMs);
  all.maxStepMs = Math.max(all.maxStepMs, s.maxStepMs);
  all.maxSwapMs = Math.max(all.maxSwapMs, s.maxSwapMs);
  all.slabs = Math.max(all.slabs, s.slabs);
  all.maxUpdateMs = Math.max(all.maxUpdateMs, s.maxUpdateMs);
  all.syncBuilds += s.syncBuilds;
};

test('ray groundDist matches course.height within 1 cm (heightfield layout proof)', () => {
  const course = createCourse(12345, cfg);
  const phys = createPhysics(R, course, cfg);
  phys.update(100); // slabs cover [20, 260]
  phys.step();
  const rnd = mulberry32(99);
  let worst = 0;
  for (let i = 0; i < 500; i++) {
    const z = 30 + rnd() * 220; // spans slabs 0..6 (3+ slabs)
    // inside the course (banks beyond halfWidth are steeper than a 0.5 m grid can follow to 1 cm)
    const x = course.centerX(z) + (rnd() - 0.5) * 2 * (course.halfWidth(z) - 3);
    const h = course.height(x, z);
    const d = phys.groundDist(x, h + 1.0, z);
    assert.ok(Number.isFinite(d), `no hit at ${x},${z}`);
    const err = Math.abs(h + 1.0 - d - h);
    worst = Math.max(worst, Math.abs(d - 1.0));
    assert.ok(Math.abs(d - 1.0) < 0.01, `ray err ${err} at x=${x} z=${z}`);
  }
  // beyond max ray length -> Infinity
  assert.equal(phys.groundDist(course.centerX(100), course.height(course.centerX(100), 100) + 10, 100), Infinity);
  console.log(`  ray worst error ${(worst * 1000).toFixed(2)} mm over 500 points`);
  fold(phys.stats);
  phys.dispose();
});

test('streaming over full course: coverage, slab cap, one build per call', () => {
  const course = createCourse(4242, cfg);
  const phys = createPhysics(R, course, cfg);
  let maxSlabs = 0;
  let steps = 0;
  for (let z = 0; z <= course.length; z += 0.5) {
    const before = phys.stats.slabs;
    phys.update(z);
    maxSlabs = Math.max(maxSlabs, phys.stats.slabs);
    assert.ok(phys.covered(z, 60), `not covered at z=${z}`);
    assert.ok(phys.stats.slabs <= 7, `slabs ${phys.stats.slabs} at z=${z}`);
    if (steps++ % 8 === 0) phys.step();
    if (z > 0) assert.ok(phys.stats.slabs - before <= 1);
  }
  assert.equal(phys.stats.syncBuilds, 0, 'sync builds');
  console.log(`  max live slabs ${maxSlabs}, syncBuilds ${phys.stats.syncBuilds}`);
  fold(phys.stats);
  phys.dispose();
});

function dropTest(label, mkVel, mkY) {
  let worstClear = Infinity;
  for (let seed = 1; seed <= 50; seed++) {
    const course = createCourse(seed, cfg);
    const phys = createPhysics(R, course, cfg);
    const z0 = 150 + (seed % 7) * 10;
    const x0 = course.centerX(z0);
    phys.update(z0);
    const gz = course.height(x0, z0 + 1) - course.height(x0, z0);
    phys.startTumble({ x: x0, y: course.height(x0, z0) + mkY, z: z0 }, { x: 0, y: 0, z: 0, w: 1 }, mkVel(gz), { x: 2, y: 0.5, z: 1 });
    for (let i = 0; i < 360; i++) {
      phys.update(phys.tumbleState().p.z);
      phys.step();
      const t = phys.tumbleState();
      const clear = t.p.y - course.height(t.p.x, t.p.z);
      worstClear = Math.min(worstClear, clear);
      assert.ok(clear >= -0.05, `${label} seed ${seed} step ${i}: clearance ${clear}`);
    }
    fold(phys.stats);
    phys.dispose();
  }
  console.log(`  ${label}: worst tumble centre clearance ${worstClear.toFixed(3)} m`);
}

test('tumble body (CCD off) at 45 m/s down-slope never sinks below terrain on 50 seeds', () => {
  dropTest('down-slope', (gz) => { const n = Math.hypot(1, gz); return { x: 0, y: (45 * gz) / n, z: 45 / n }; }, 1.5);
});

test('wreck at 45 m/s into the up-slope back face never tunnels (50 seeds)', () => {
  dropTest('back-face', () => ({ x: 0, y: -2, z: -45 }), 1.0);
});

test('ray ignores rocks; bank-edge ray within 6 cm', () => {
  const course = createCourse(31, cfg);
  const phys = createPhysics(R, course, cfg);
  const rocks = course.rocksInRange(100, 1000);
  assert.ok(rocks.length > 0);
  const rk = rocks[0];
  phys.update(rk.z);
  phys.step();
  const h = course.height(rk.x, rk.z);
  assert.ok(Math.abs(phys.groundDist(rk.x, h + 1.0, rk.z) - 1.0) < 0.01);
  for (let z = rk.z - 30; z < rk.z + 50; z += 3.7) {
    const x = course.centerX(z) + course.halfWidth(z) - 0.5, hh = course.height(x, z);
    assert.ok(Math.abs(phys.groundDist(x, hh + 1.0, z) - 1.0) < 0.06, `bank edge z=${z}`);
  }
  phys.dispose();
});

test('determinism: same scripted sequence twice gives same hash', () => {
  function run() {
    const course = createCourse(777, cfg);
    const phys = createPhysics(R, course, cfg);
    const z0 = 160, x0 = course.centerX(z0);
    phys.update(z0);
    phys.startTumble({ x: x0, y: course.height(x0, z0) + 2, z: z0 }, { x: 0.1, y: 0.2, z: 0.3, w: 0.927 }, { x: 1, y: -5, z: 40 }, { x: 3, y: 1, z: -2 });
    for (let i = 0; i < 240; i++) { phys.update(phys.tumbleState().p.z); phys.step(); }
    const h = phys.hash();
    fold(phys.stats);
    phys.dispose();
    return h;
  }
  const a = run(), b = run();
  assert.equal(a, b);
  assert.ok(a > 0);
});

test('stats', () => {
  all.initMs = R && cfg ? undefined : 0;
  const c = createCourse(1, cfg);
  const p = createPhysics(R, c, cfg);
  all.initMs = p.stats.initMs;
  p.dispose();
  console.log('  step maxes', MS.map((v) => v.toFixed(2)).join(' '));
  const med = [...MS].sort((a, b) => a - b)[MS.length >> 1];
  assert.ok(med < 6, `median per-world maxStepMs ${med} (CCD regression?)`);
  console.log('  step maxes', MS.map((v) => v.toFixed(2)).join(' '));
  console.log(`  STATS initMs=${all.initMs.toFixed(1)} firstStepMs=${all.firstStepMs.toFixed(1)} maxStepMs=${all.maxStepMs.toFixed(2)} maxSwapMs=${all.maxSwapMs.toFixed(2)} maxUpdateMs=${all.maxUpdateMs.toFixed(2)} syncBuilds=${all.syncBuilds} slabs<=${all.slabs}`);
});
