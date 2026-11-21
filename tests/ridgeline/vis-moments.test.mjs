// B4 M3 moments: pools, plume cap, reduced motion, shift. No WebGL (three scene objects only).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../pages/ridgeline');
const THREE = await import(root + '/vendor/three.module.js');
const { mulberry32 } = await import(root + '/src/rng.js');
const { createMoments, KEYS, POOL } = await import(root + '/src/vis/moments.js');

const slope = (x, z) => 0.08 * z + Math.sin(x * 0.2) * 0.3;
function make(cfg = {}, seed = 7) {
  const scene = new THREE.Scene();
  const ctx = { THREE, scene, camera: new THREE.PerspectiveCamera(), renderer: null, cfg, crng: mulberry32(seed), look: {}, sunDir: new THREE.Vector3(0, 0.3, 1), root: null, groundY: slope };
  return { ctx, m: createMoments(ctx), scene };
}
const vsOf = (z, o = {}) => Object.assign({ t: 0, dt: 1 / 60, x: 0, y: slope(0, z) + 0.3, z, speed: 30, grounded: true, mode: 'ground', steer: 0.4, boostT: 0, reduced: false }, o);
const land = (z, impact = 20) => ({ type: 'land', grade: 'good', impact, point: { x: 0, y: slope(0, z), z }, normal: { x: 0, y: 1, z: 0 }, dive: false });

test('KEYS well formed, prefixed look', () => {
  for (const [k, v] of Object.entries(KEYS)) {
    assert.ok(k.startsWith('look'));
    assert.ok(v.def >= v.min && v.def <= v.max && v.step > 0 && v.label);
  }
});

test('pool reuse: no growth over 6000 frames of events', () => {
  const { m } = make();
  const evs = ['land', 'launch', 'tumble_start', 'recover_start', 'recover_end', 'boost', 'prop_hit', 'gate', 'milestone'];
  const gc = globalThis.gc;
  let z = 0, heap0 = 0, maxLive = 0, maxPeb = 0;
  for (let f = 0; f < 6000; f++) {
    z += 0.5;
    const vs = vsOf(z, { boostT: f % 300 < 60 ? 1 : 0 });
    if (f % 20 === 0) { const t = evs[(f / 20) % evs.length]; m.fx(t === 'land' ? land(z) : t === 'prop_hit' ? { type: t, pos: { x: 1, y: 0, z } } : { type: t, speed: 40, lipPos: { x: 0, y: 0, z } }); }
    m.update(1 / 60, vs);
    const s = m.stats();
    maxLive = Math.max(maxLive, s.live); maxPeb = Math.max(maxPeb, s.pebbles);
    if (f === 1500) { if (gc) gc(); heap0 = process.memoryUsage().heapUsed; }
  }
  if (gc) gc();
  const grow = process.memoryUsage().heapUsed - heap0;
  assert.ok(maxLive <= POOL.dust && maxPeb <= POOL.peb, `live ${maxLive} peb ${maxPeb}`);
  assert.ok(m.stats().capacity === POOL.dust);
  assert.ok(grow < 6e6, `heap grew ${grow}`);
  assert.ok(m.stats().spawned > POOL.dust, 'pool was exercised and recycled');
});

test('plume cap 1.6 m above local ground, even on huge impact and a slope', () => {
  const { m } = make();
  let z = 100;
  for (let f = 0; f < 600; f++) {
    z += 0.3;
    if (f % 5 === 0) { m.fx(land(z, 80)); m.fx({ type: 'tumble_start', cause: 'x' }); }
    m.update(1 / 60, vsOf(z));
    assert.ok(m.stats().maxTop <= 1.6 + 1e-3, `top ${m.stats().maxTop}`);
  }
  assert.ok(m.stats().live > 20);
  const lo = make({ lookMomPlumeCap: 0.5 }); lo.m.update(1 / 60, vsOf(0)); lo.m.fx(land(0, 80));
  for (let f = 0; f < 120; f++) { lo.m.update(1 / 60, vsOf(0)); assert.ok(lo.m.stats().maxTop <= 0.5 + 1e-3); }
});

test('reduced motion: puffs do not move, fewer spawned, no skid fan', () => {
  const run = (cfg, vsx) => {
    const { m } = make(cfg); m.update(1 / 60, vsOf(0, vsx)); m.fx(land(0, 12));
    const a = m.stats().spawned; m.update(1 / 60, vsOf(0, vsx));
    let pos0 = m.group.children[0].instanceMatrix.array.slice(12, 15);
    for (let f = 0; f < 20; f++) m.update(1 / 60, vsOf(0, vsx));
    const pos1 = m.group.children[0].instanceMatrix.array.slice(12, 15);
    return { a, d: Math.hypot(pos1[0] - pos0[0], pos1[2] - pos0[2]), s: m.stats() };
  };
  const full = run({}, {}), red = run({ lookReducedMotion: 1 }, {}), red2 = run({}, { reduced: true });
  assert.ok(full.d > 0.05, 'normal puffs drift');
  assert.ok(red.d < 1e-4 && red2.d < 1e-4, 'reduced puffs stay put');
  assert.ok(red.a < full.a, 'fewer puffs');
  assert.ok(red.s.live > 0, 'state still shown');
  const f2 = make({ lookReducedMotion: 1 }); for (let f = 0; f < 120; f++) f2.m.update(1 / 60, vsOf(f));
  assert.equal(f2.m.stats().spawned, 0, 'no skid fan in reduced motion');
  const f3 = make(); for (let f = 0; f < 120; f++) f3.m.update(1 / 60, vsOf(f));
  assert.ok(f3.m.stats().spawned > 0, 'skid fan on when grounded');
});

test('skid fan x2 on boost, nothing in air', () => {
  const cnt = (o) => { const { m } = make(); for (let f = 0; f < 300; f++) m.update(1 / 60, vsOf(f, o)); return m.stats().spawned; };
  const a = cnt({}), b = cnt({ boostT: 1 }), air = cnt({ grounded: false, mode: 'air' });
  assert.ok(b > a * 1.6, `${a} vs ${b}`);
  assert.equal(air, 0);
});

test('shift moves live particles, pebbles and pennants', () => {
  const { m } = make();
  m.update(1 / 60, vsOf(50)); m.fx(land(50, 20)); m.fx({ type: 'gate' });
  m.update(1 / 60, vsOf(50));
  const mesh = m.group.children[0], arr = mesh.instanceMatrix.array, n = mesh.count;
  assert.ok(n > 5);
  const before = []; for (let i = 0; i < n; i++) before.push([arr[i * 16 + 13], arr[i * 16 + 14]]);
  const pen0 = m.group.children[2].geometry.attributes.position.array.slice();
  m.shift(-30, 2);
  m.update(0, vsOf(20)); // dt 0: pure repositioning
  const arr2 = mesh.instanceMatrix.array;
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(arr2[i * 16 + 14] - (before[i][1] - 30)) < 0.01, 'z moved');
  }
  const pen1 = m.group.children[2].geometry.attributes.position.array;
  let moved = 0; for (let i = 2; i < pen0.length; i += 3) if (pen0[i] !== 0) { assert.ok(Math.abs(pen1[i] - pen0[i] + 30) < 0.2); moved++; }
  assert.ok(moved > 0, 'pennant verts shifted');
});

test('deterministic with same crng seed; lean tier hides pebbles/pennants', () => {
  const sig = () => { const { m } = make({}, 3); for (let f = 0; f < 200; f++) { if (f % 40 === 0) m.fx(land(f)); m.update(1 / 60, vsOf(f)); } return JSON.stringify(m.stats()); };
  assert.equal(sig(), sig());
  const { m } = make(); m.setQuality('lean'); m.fx(land(0)); m.update(1 / 60, vsOf(0));
  assert.equal(m.stats().pebbles, 0); assert.equal(m.stats().draws, 1);
  m.dispose();
});
