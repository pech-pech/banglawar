// B3 loop: seeded idle bot is caught by the night (run_over cause night, 1.0 s glide, over at 1.4 s),
// rock run_over timing, wreck/miss gap hooks, determinism (two runs, same hash).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { createSled, stepSled, FIXED_DT } from '../../pages/ridgeline/src/sled.js';
import { cfg, resetCfg } from '../../pages/ridgeline/src/config.js';
import { mulberry32, hashSeed } from '../../pages/ridgeline/src/rng.js';

const R = await loadRapier();
const SEEDS = [907567659, 924345278, hashSeed('loop-run-a'), hashSeed('loop-run-b')];
const MAXSTEPS = 120 * 400;

// Idle: follows the safe lane, never fires, never dives (finger stays down). Pure function of state.
const idle = (course) => (i, s) => {
  const la = Math.max(12, (s.mode === 'air' ? 0.6 : 0.3) * s.speed);
  return { steer: Math.max(-1, Math.min(1, 0.5 * (course.safeX(s.z + la) - s.x))), fire: false, down: true };
};
// Rock seeker: steers at the next rock ahead.
const seeker = (course) => (i, s) => {
  let best = null;
  for (const r of course.rocksInRange(s.z + 5, s.z + 80)) if (!best || r.z < best.z) best = r;
  return { steer: best ? Math.max(-1, Math.min(1, 0.6 * (best.x - s.x))) : 0, fire: false, down: true };
};

function run(seed, botOf, opts = {}) {
  resetCfg(); cfg.endless = 1;
  const course = createCourse(seed, cfg);
  const phys = createPhysics(R, course, cfg);
  try {
    phys.update(0);
    const sled = createSled(course, phys, mulberry32((seed ^ 0x5bd1e995) >>> 0), opts);
    const bot = botOf(course);
    const ev = [];
    let steps = 0;
    while (!sled.crashed && steps < MAXSTEPS) {
      phys.update(sled.physZ ?? sled.z);
      for (const e of stepSled(sled, course, bot(steps, sled), cfg)) ev.push({ step: steps, ...e });
      steps++;
    }
    return { sled, ev, steps, hash: phys.hash(), dist: sled.dist };
  } finally { phys.dispose(); }
}
const of = (ev, t) => ev.filter((e) => e.type === t);

test('idle bot: caught by night, glide 1.0 s, run_over cause night at 1.4 s, states exposed', () => {
  let nights = 0;
  for (const seed of SEEDS) {
    const r = run(seed, idle);
    assert.equal(of(r.ev, 'run_start').length, 1);
    assert.equal(of(r.ev, 'run_start')[0].hull, 'wren');
    const ro = of(r.ev, 'run_over');
    assert.equal(ro.length, 1, `seed ${seed}: one run_over`);
    assert.ok(r.sled.runOver && r.sled.crashed);
    if (ro[0].cause !== 'night') continue; // rock first: legal, checked in the rock test
    nights++;
    const c = of(r.ev, 'caught')[0];
    assert.ok(c, 'caught event precedes run_over');
    assert.equal(ro[0].dist, c.dist);
    assert.equal(ro[0].step - c.step, Math.round(1.4 / FIXED_DT), 'run_over 1.4 s after caught');
    assert.ok(r.sled.gap <= 0.01 || r.sled.gap < 1, 'gap at the catch is ~0');
    assert.ok(of(r.ev, 'night_stage').length >= 1, 'stage events fired');
    assert.ok(c.dist > 300 && c.dist < 6000, `caught dist ${c.dist}`);
    assert.equal(r.sled.runOverCause, 'night');
    assert.ok(typeof r.sled.vf === 'number' && ['far', 'near', 'heels'].includes(r.sled.nightStage));
  }
  assert.ok(nights >= 2, `idle bot caught by night on >= 2 of ${SEEDS.length} seeds (got ${nights})`);
});

test('rock: run_over cause rock at tumble_rest or 2.2 s after tumble_start; crash event kept; no night hook', () => {
  let rocks = 0;
  for (const seed of SEEDS) {
    const r = run(seed, seeker);
    const ro = of(r.ev, 'run_over')[0];
    assert.ok(ro, `seed ${seed}: run_over`);
    if (ro.cause !== 'rock') continue;
    rocks++;
    const ts = of(r.ev, 'tumble_start')[0];
    assert.equal(ts.cause, 'rock');
    assert.equal(of(r.ev, 'crash').length, 1, 'crash event name kept');
    assert.equal(of(r.ev, 'recover_start').length, 0, 'rock tumble is not a wreck');
    const rest = of(r.ev, 'tumble_rest')[0];
    assert.equal(ro.step, rest.step, 'run_over on the tumble_rest step');
    const dt = (ro.step - ts.step) * FIXED_DT;
    assert.ok(dt <= 2.2 + 0.02, `rock run_over after ${dt.toFixed(2)} s`);
    assert.ok(dt >= 1.2 - 0.02, 'not before tumbleMinTime');
    assert.equal(ro.dist, r.sled.dist);
    assert.equal(r.sled.runOverCause, 'rock');
  }
  assert.ok(rocks >= 2, `rock seeker hit rocks on >= 2 seeds (got ${rocks})`);
});

test('determinism: same seed twice -> same events, steps and physics hash', () => {
  for (const seed of SEEDS.slice(0, 2)) {
    const a = run(seed, idle), b = run(seed, idle);
    assert.equal(a.steps, b.steps);
    assert.equal(a.hash, b.hash);
    assert.equal(JSON.stringify(a.ev), JSON.stringify(b.ev));
    assert.equal(a.sled.gap, b.sled.gap);
  }
});

test('hull option: Anvil run reports hull, differs from Wren, still deterministic', () => {
  const seed = SEEDS[0];
  const a = run(seed, idle, { hull: 'anvil', seed, daily: true });
  const b = run(seed, idle, { hull: 'anvil', seed, daily: true });
  const w = run(seed, idle);
  assert.equal(a.sled.hull, 'anvil');
  const rs = of(a.ev, 'run_start')[0];
  assert.deepEqual([rs.seed, rs.hull, rs.daily], [seed, 'anvil', true]);
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, w.hash);
});

test('milestone events fire in distance order via injected reached set', () => {
  const reached = new Set();
  const r = run(SEEDS[0], idle, { reached });
  const ms = of(r.ev, 'milestone');
  if (r.dist > 500) assert.equal(ms[0].id, 'first_light');
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i].dist >= ms[i - 1].dist);
  assert.equal(reached.has('first_light'), r.dist >= 500);
});

test('finite mode (endless 0) has no night: no caught, miss keeps the time penalty', () => {
  resetCfg(); cfg.endless = 0;
  const course = createCourse(SEEDS[0], cfg);
  const sled = createSled(course, null, mulberry32(1));
  const ev = [];
  for (let i = 0; i < 120 * 60 && !sled.crashed && !sled.finished; i++) ev.push(...stepSled(sled, course, { steer: 0, fire: false, down: true }, cfg));
  assert.equal(of(ev, 'caught').length, 0);
  for (const m of of(ev, 'miss')) assert.equal(m.penalty, cfg.missPenalty);
  resetCfg();
});
