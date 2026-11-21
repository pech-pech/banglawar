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
  const fcfg = { ...cfg, endless: 0 };
  const course = createCourse(4242, fcfg);
  assert.ok(Number.isFinite(course.length), 'finite course');
  const phys = createPhysics(R, course, fcfg);
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

// ---- B2: floating origin, tumble streaming -------------------------------------------------
function fakeCourse() {
  const slope = DEFAULTS.slope;
  const rocks = (z0, z1) => {
    const out = [];
    for (let k = Math.ceil(z0 / 25); k * 25 < z1; k++) out.push({ id: k, x: ((k * 7) % 9) - 4, z: k * 25 + 3, r: 0.8 });
    return out;
  };
  const h = (x, z) => -slope * z + 1.2 * Math.sin(z * 0.05) + 0.02 * x * x * 0 + 0.3 * Math.sin(z * 0.013 + x * 0.1);
  return { length: Infinity, height: h, centerX: () => 0, halfWidth: () => 20, rocksInRange: rocks };
}

function scripted(shiftAt, withTumble, steps = 900) {
  const c = fakeCourse();
  const phys = createPhysics(R, c, { ...cfg, originShift: shiftAt });
  let shifts = 0;
  phys.onShift(() => shifts++);
  let z = 150;
  const traj = [];
  phys.update(z);
  if (withTumble) {
    phys.startTumble({ x: 0.5, y: c.height(0.5, z) + 2, z }, { x: 0.1, y: 0.2, z: 0.3, w: 0.927 }, { x: 0.5, y: -9, z: 30 }, { x: 2, y: 1, z: -1 });
  }
  for (let i = 0; i < steps; i++) {
    z += 1.2 * (1 / 120) * 100; // sled advances 1.2 m / step
    phys.update(z);
    phys.step();
    if (withTumble) traj.push(phys.tumbleState().p);
  }
  const out = { hash: phys.hash(), traj, shifts, count: phys.origin.count, stats: { ...phys.stats }, z };
  phys.dispose();
  return out;
}

test('forced shift: replay hash equal across two runs (with and without a tumble body)', () => {
  for (const withTumble of [false, true]) {
    const a = scripted(300, withTumble), b = scripted(300, withTumble);
    assert.ok(a.count >= 2, `shifts ${a.count}`);
    assert.equal(a.shifts, a.count);
    assert.equal(a.hash, b.hash, `hash tumble=${withTumble}`);
  }
});

test('hash mixes origin.count', () => {
  const a = createPhysics(R, fakeCourse(), cfg), b = createPhysics(R, fakeCourse(), cfg);
  a.update(100); b.update(100);
  assert.equal(a.hash(), b.hash());
  b.origin.count = 1;
  assert.notEqual(a.hash(), b.hash());
  a.dispose(); b.dispose();
});

test('tumble across a shift keeps the same absolute trajectory (1e-3 m in flight; bounded after contact)', () => {
  function run(shiftAt) {
    const c = fakeCourse();
    c.rocksInRange = () => [];
    const phys = createPhysics(R, c, { ...cfg, originShift: shiftAt });
    let z = 150;
    phys.update(z);
    phys.startTumble({ x: 0.5, y: c.height(0.5, z) + 12, z }, { x: 0.1, y: 0.2, z: 0.3, w: 0.927 }, { x: 0.5, y: 0, z: 30 }, { x: 2, y: 1, z: -1 });
    const traj = [];
    for (let i = 0; i < 480; i++) {
      z += 1; phys.update(z); phys.step();
      const p = phys.tumbleState().p;
      traj.push({ p, clear: p.y - c.height(p.x, p.z) });
    }
    const cnt = phys.origin.count;
    phys.dispose();
    return { traj, cnt };
  }
  const s = run(170), n = run(1e9);
  assert.ok(s.cnt >= 2 && n.cnt === 0, `shifts ${s.cnt}/${n.cnt}`);
  let flight = 0, after = 0, nFlight = 0;
  for (let i = 0; i < s.traj.length; i++) {
    const p = s.traj[i].p, q = n.traj[i].p, d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    if (n.traj[i].clear > 1.0 && after === 0) { flight = Math.max(flight, d); nFlight++; } else after = Math.max(after, d);
  }
  console.log(`  tumble shift vs no-shift: in-flight (${nFlight} steps) drift ${(flight * 1000).toFixed(3)} mm, post-contact ${(after * 1000).toFixed(1)} mm (chaotic contact solver)`);
  assert.ok(nFlight > 80);
  assert.ok(flight < 1e-3, `flight drift ${flight}`);
  assert.ok(after < 0.5, `post-contact drift ${after}`);
});

test('toLocal/toAbs round-trip, groundDist and tumbleState absolute after shift', () => {
  const c = fakeCourse();
  const phys = createPhysics(R, c, { ...cfg, originShift: 200 });
  phys.update(300);
  assert.equal(phys.origin.count, 1);
  assert.equal(phys.origin.z, 200);
  assert.equal(phys.origin.y, Math.round(-cfg.slope * 200));
  const p = { x: 1, y: -80.5, z: 301 };
  assert.deepEqual(phys.toAbs(phys.toLocal(p)), p);
  phys.step();
  const h = c.height(1, 301);
  assert.ok(Math.abs(phys.groundDist(1, h + 1, 301) - 1) < 0.01);
  phys.startTumble({ x: 1, y: h + 3, z: 301 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  const t = phys.tumbleState().p;
  assert.ok(Math.abs(t.z - 301) < 1e-4 && Math.abs(t.y - (h + 3)) < 1e-4);
  phys.dispose();
});

test('tumble body survives streaming when update gets the sled z (not the tumble z)', () => {
  const course = createCourse(5, cfg);
  const phys = createPhysics(R, course, cfg);
  const z0 = 200, x0 = course.centerX(z0);
  phys.update(z0);
  phys.startTumble({ x: x0, y: course.height(x0, z0) + 1.5, z: z0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 40 }, { x: 1, y: 0, z: 0 });
  for (let i = 0; i < 480; i++) {
    phys.update(z0); // wrong z on purpose
    phys.step();
    const t = phys.tumbleState();
    assert.ok(t.p.y - course.height(t.p.x, t.p.z) >= -0.05, `fell through at step ${i}, z=${t.p.z}`);
  }
  assert.ok(phys.tumbleState().p.z > z0 + 80, 'body travelled past the old 80 m window');
  phys.dispose();
});

test('5 km streaming with default shift: stats, coverage, slab cap', () => {
  const c = fakeCourse();
  const phys = createPhysics(R, c, { ...cfg, originShift: 2000 });
  const shifts = [];
  phys.onShift((dz, dy) => shifts.push([dz, dy]));
  let steps = 0;
  for (let z = 0; z <= 5000; z += 0.5) {
    phys.update(z);
    assert.ok(phys.covered(z, 60), `not covered at ${z}`);
    assert.ok(phys.stats.slabs <= 7, `slabs ${phys.stats.slabs}`);
    if (steps++ % 16 === 0) phys.step();
  }
  assert.equal(phys.origin.count, 2);
  assert.equal(phys.origin.z, 4000);
  assert.deepEqual(shifts.map((s) => s[0]), [2000, 2000]);
  assert.equal(phys.stats.syncBuilds, 0);
  console.log(`  5km: shifts ${phys.origin.count}, slabs ${phys.stats.slabs}, maxUpdateMs ${phys.stats.maxUpdateMs.toFixed(2)}, maxSwapMs ${phys.stats.maxSwapMs.toFixed(2)}, maxStepMs ${phys.stats.maxStepMs.toFixed(2)}`);
  phys.dispose();
});

test('G_PROP group exported, collides terrain only', () => {
  const phys = createPhysics(R, fakeCourse(), cfg);
  assert.equal(phys.G.PROP, 0x0010);
  const g = phys.pack(phys.G.PROP, phys.G.TERRAIN);
  assert.equal(g >>> 16, 0x10);
  assert.equal(g & 0xffff, phys.G.TERRAIN);
  phys.dispose();
});

test('G_PROP body dropped on terrain rests on it, ignores tumble group', () => {
  const c = fakeCourse();
  const phys = createPhysics(R, c, { ...cfg, originShift: 100 });
  phys.update(150); // forces a shift first: prop spawned in local coords
  const o = phys.origin;
  const x = 0, z = 150, h = c.height(x, z);
  const body = phys.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, h + 1.5 - o.y, z - o.z));
  const g = phys.pack(phys.G.PROP, phys.G.TERRAIN);
  phys.world.createCollider(R.ColliderDesc.cuboid(0.15, 0.9, 0.15).setCollisionGroups(g).setSolverGroups(g), body);
  for (let i = 0; i < 360; i++) { phys.update(150); phys.step(); }
  const t = body.translation(), hh = c.height(t.x, t.z + o.z);
  const clear = t.y + o.y - hh;
  assert.ok(clear > 0.1 && clear < 1.2, `prop centre ${clear} above terrain`);
  phys.dispose();
});
