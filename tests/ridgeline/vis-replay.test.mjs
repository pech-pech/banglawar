// B4: the cosmetic vis layer must never touch the sim. Same seed + scripted input with every vis module ON (fed the
// vs snapshot + every sim event each step) gives the identical Rapier hash, event log and final state as vis OFF.
// Also: config.js carries a literal copy of every vis module's look keys; it must match vis/index.js VIS_KEYS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../pages/ridgeline/vendor/three.module.js';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { createSled, stepSled, FIXED_DT } from '../../pages/ridgeline/src/sled.js';
import { cfg, DEFAULTS, META } from '../../pages/ridgeline/src/config.js';
import { mulberry32 } from '../../pages/ridgeline/src/rng.js';
import { createVis, VIS_KEYS } from '../../pages/ridgeline/src/vis/index.js';

const R = await loadRapier();
const STEPS = Math.round(25 / FIXED_DT);
const round = (_k, v) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(6)) : v);

// WebGL-free renderer stub: every method is a no-op; post chain sees no WebGL2 and falls back to plain render.
function stubRenderer() {
  const base = { capabilities: { isWebGL2: false }, extensions: { has: () => false }, info: { render: { calls: 0, triangles: 0 }, reset() {}, autoReset: true },
    domElement: { height: 638 }, getPixelRatio: () => 1, getContext: () => null, getRenderTarget: () => null, getClearAlpha: () => 1 };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => {}) });
}

function input(seed) {
  const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  let steer = 0, down = true, prev = true;
  return (i) => { if (i % 30 === 0) steer = rnd() * 2 - 1; if (i > 0 && i % 50 === 0) down = !down; const fire = prev && !down; prev = down; return { steer, down, fire }; };
}

function run(seed, withVis) {
  const course = createCourse(seed, cfg);
  const phys = createPhysics(R, course, cfg);
  let vis = null;
  try {
    phys.update(0);
    const s = createSled(course, phys, mulberry32((seed ^ 0x5bd1e995) >>> 0));
    if (withVis) {
      const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xffb070, 0.01); scene.background = new THREE.Color(0xffb070);
      const camera = new THREE.PerspectiveCamera(66, 475 / 638, 0.5, 300);
      vis = createVis({ THREE, scene, camera, renderer: stubRenderer(), cfg, look: {}, sunDir: new THREE.Vector3(-0.5, 0.6, 1).normalize(),
        root: null, groundY: (x, z) => course.height(x, z), course, seed, hooks: { getPhase: () => 'run', hull: () => 'kite', bestM: () => 0 } });
      vis.attachPhys(phys);
      vis.fx({ type: 'run_start' });
    }
    const inp = input(seed), events = [];
    let i = 0;
    while (i < STEPS && !s.crashed && !s.finished) {
      phys.update(s.z);
      const ip = inp(i);
      const evs = stepSled(s, course, ip, cfg);
      for (const ev of evs) { events.push(ev); if (vis) vis.fx(ev); }
      if (vis && i % 2 === 0) { vis.setInput(ip.steer); vis.frame(s, FIXED_DT * 2, null); vis.render(null, null); }
      i++;
    }
    if (vis) vis.fx({ type: 'run_over' });
    return JSON.stringify({ events, hash: phys.hash(), x: s.x, y: s.y, z: s.z, speed: s.speed, steps: i }, round);
  } finally { if (vis) vis.dispose(); phys.dispose(); }
}

test('replay hash + event log identical with vis ON vs OFF', () => {
  for (const seed of [7, 2024]) {
    const off = run(seed, false), on = run(seed, true);
    assert.ok(off.length > 100);
    assert.equal(on, off, 'seed ' + seed);
  }
});

test('config.js look keys match every vis module KEYS (Look FX group)', () => {
  for (const [k, v] of Object.entries(VIS_KEYS)) {
    assert.ok(k in DEFAULTS, 'DEFAULTS missing ' + k);
    assert.ok(META[k] && META[k].group === 'Look FX', 'META missing ' + k);
    if (k !== 'lookReducedMotion') assert.equal(DEFAULTS[k], v.def, k);
    assert.equal(META[k].min, v.min, k); assert.equal(META[k].max, v.max, k); assert.equal(META[k].step, v.step, k);
  }
});
