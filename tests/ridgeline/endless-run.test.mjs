// B2 endless course: 20 seeds x 30 km determinism (two builds, reversed query order), curvature cap, zone order,
// and the props dynamic-body cap over scripted 3 km rides on 3 seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { createProps } from '../../pages/ridgeline/src/props.js';
import { createSled, stepSled } from '../../pages/ridgeline/src/sled.js';
import { zoneAt as zoneAtD } from '../../pages/ridgeline/src/endless.js';
import { cfg, resetCfg } from '../../pages/ridgeline/src/config.js';
import { mulberry32, hashSeed } from '../../pages/ridgeline/src/rng.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('endless-run-' + i));
const KM = 30000;
const J = JSON.stringify;
const mk = (s) => { resetCfg(); cfg.endless = 1; return createCourse(s, cfg); };

// Sample the whole course. forward=true walks z upward, false walks the same z set downward, so the lazy
// lane grid / fold / chunk caches are filled in the opposite order.
function sample(course, forward) {
  const zs = [];
  for (let z = 0; z <= KM; z += 7.3) zs.push(z);
  if (!forward) zs.reverse();
  const h = new Map();
  for (const z of zs) {
    h.set(z, [course.height(-3, z), course.height(course.centerX(z), z), course.safeX(z), course.halfWidth(z)]);
  }
  const rocks = [], reeds = [], gates = [];
  const blocks = [];
  for (let z0 = 0; z0 < KM; z0 += 1000) blocks.push(z0);
  if (!forward) blocks.reverse();
  for (const z0 of blocks) {
    rocks[z0 / 1000] = course.rocksInRange(z0, z0 + 1000);
    reeds[z0 / 1000] = course.reedsInRange(z0, z0 + 1000);
    gates[z0 / 1000] = course.gatesInRange(z0, z0 + 1000);
  }
  const hs = J(zs.slice().sort((a, b) => a - b).map((z) => h.get(z)));
  // course.features keeps growing with queries; compare only the part below KM so both orders agree.
  const feats = course.features.filter((f) => f.z < KM).map((f) => ({ ...f }));
  return { hs, rocks: J(rocks), reeds: J(reeds), gates: J(gates), feats: J(feats) };
}

test('20 seeds x 30 km: two builds and reversed query order are identical', { timeout: 10 * 60 * 1000 }, () => {
  for (const s of SEEDS) {
    const a = sample(mk(s), true);
    const b = sample(mk(s), true);
    const c = sample(mk(s), false);
    for (const k of Object.keys(a)) {
      assert.equal(a[k], b[k], `seed ${s}: ${k} differs between two builds`);
      assert.equal(a[k], c[k], `seed ${s}: ${k} differs in reversed query order`);
    }
    assert.ok(JSON.parse(a.rocks).flat().length > 50, `seed ${s}: rocks present`);
    assert.ok(JSON.parse(a.gates).flat().length > 100, `seed ${s}: gates present`);
  }
});

test('20 seeds x 30 km: curvature <= 0.0255 along the course centre line (1 m second difference)', { timeout: 10 * 60 * 1000 }, () => {
  let worst = 0, worstAt = '';
  for (const s of SEEDS) {
    const c = mk(s);
    let h0 = null, h1 = null, h2 = null;
    for (let z = 0; z <= KM; z += 1) {
      h2 = h1; h1 = h0;
      h0 = c.height(c.centerX(z), z);
      if (h2 !== null) {
        const k = Math.abs(h0 - 2 * h1 + h2);
        if (k > worst) { worst = k; worstAt = `seed ${s} z ${z - 1}`; }
        assert.ok(k <= 0.0255 + 1e-9, `seed ${s} z ${z - 1}: curvature ${k}`);
      }
    }
  }
  console.log(`  max curvature ${worst.toFixed(5)} at ${worstAt}`);
});

test('20 seeds: course.zoneAt matches endless.zoneAt and zones advance in order 0..4 then lap+1', { timeout: 5 * 60 * 1000 }, () => {
  for (const s of SEEDS) {
    const c = mk(s);
    let prev = null;
    for (let z = 0; z <= KM; z += 25) {
      const a = c.zoneAt(z), b = zoneAtD(z, cfg);
      assert.deepEqual(a, b, `seed ${s} z ${z}`);
      if (prev) {
        const stepOk = a.zone === prev.zone && a.lap === prev.lap
          || (a.zone === prev.zone + 1 && a.lap === prev.lap)
          || (prev.zone === 4 && a.zone === 0 && a.lap === prev.lap + 1);
        assert.ok(stepOk, `seed ${s} z ${z}: zone ${prev.zone}/${prev.lap} -> ${a.zone}/${a.lap}`);
      }
      prev = a;
    }
    assert.ok(prev.lap >= 3, `30 km covers laps (lap ${prev.lap})`);
  }
});

test('props: live dynamic bodies never exceed 16 over a scripted 3 km ride (3 seeds)', { timeout: 5 * 60 * 1000 }, async () => {
  const R = await loadRapier();
  for (const s of SEEDS.slice(0, 3)) {
    resetCfg(); cfg.endless = 1;
    const course = createCourse(s, cfg);
    const phys = createPhysics(R, course, cfg);
    try {
      phys.update(0);
      const props = createProps(R, phys, course, cfg);
      const sled = createSled(course, phys, mulberry32((s ^ 0x5bd1e995) >>> 0));
      sled._props = props;
      let maxLive = 0, steps = 0;
      // Same per-step order as main.js: phys.update(physZ), props.update(z), stepSled.
      while (sled.z < 3000 && !sled.crashed && steps < 120 * 150) {
        phys.update(sled.physZ ?? sled.z);
        props.update(sled.z);
        const la = Math.max(12, (sled.mode === 'air' ? 0.6 : 0.3) * sled.speed);
        stepSled(sled, course, { steer: Math.max(-1, Math.min(1, 0.5 * (course.safeX(sled.z + la) - sled.x))), fire: false }, cfg);
        maxLive = Math.max(maxLive, props.live());
        steps++;
      }
      const rode = sled.z;
      // If the bot wrecked early, finish the 3 km by walking the props window (physics stepping) so the cap is exercised.
      for (let z = rode; z < 3000; z += 0.5) {
        phys.update(z); props.update(z); phys.step();
        maxLive = Math.max(maxLive, props.live());
      }
      console.log(`  seed ${s}: rode ${rode.toFixed(0)} m (${sled.crashed ? 'crashed' : 'ok'}), maxLive ${maxLive}, stats ${J(props.stats)}`);
      assert.ok(maxLive <= 16, `seed ${s}: live ${maxLive}`);
      assert.ok(props.stats.maxLive <= 16, `seed ${s}: stats.maxLive ${props.stats.maxLive}`);
      assert.ok(props.stats.spawned > 20, 'props spawned');
      props.dispose();
    } finally { phys.dispose(); }
  }
});
