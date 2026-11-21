import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const M = await import(path.resolve(here, '../../pages/ridgeline/src/vis/sandtracks.js'));
const { SIZE_X, SIZE_Z, wrap, createPlanner, createSandTracks, KEYS, groundChunk } = M;

const mkv = (x, z, o = {}) => ({ x, z, heading: 0, speed: 30, comp: 0.5, latAcc: 0, boostT: 0, grounded: true, mode: 'ground', dt: 1 / 60, ...o });
const K = { depth: 1, width: 1 };

test('torus keying: wrap is periodic and positive', () => {
  assert.equal(wrap(-1, 96), 95);
  assert.equal(wrap(96 * 5 + 3, 96), 3);
  const p = createPlanner();
  assert.deepEqual(p.texel(10, 20, 512), p.texel(10 + SIZE_X, 20 + SIZE_Z, 512));
  assert.deepEqual(p.texel(-5, -5, 512), p.texel(SIZE_X - 5, SIZE_Z - 5, 512));
});

test('absolute-distance rekey across a 2000 m shift', () => {
  const p = createPlanner();
  const before = p.texel(3, 1990, 512);
  p.shift(-2000); // world moved back 2000: the same ground is now at z = -10
  assert.deepEqual(p.texel(3, -10, 512), before);
  p.shift(-2000);
  assert.deepEqual(p.texel(3, -2010, 512), before);
  // marks stamped before the shift land on the same texels after it
  const a = createPlanner(), b = createPlanner();
  a.sweep(mkv(0, 1990), K); a.sweep(mkv(0, 1991), K);
  b.sweep(mkv(0, 1990), K); b.shift(-2000); b.sweep(mkv(0, -9), K);
  assert.equal(a.P.n, b.P.n);
  for (let i = 0; i < a.P.n * 2; i++) assert.ok(Math.abs(a.aC[i] - b.aC[i]) < 1e-3, 'dab ' + i);
});

test('sweep stamping count', () => {
  const p = createPlanner();
  assert.equal(p.sweep(mkv(24, 40), K), 0, 'first frame has no previous point');
  const n = p.sweep(mkv(24, 41.2), K); // 1.2 m: 10 steps + 6 lead per skid, x2 skids (mid-torus: no wrap copies)
  assert.equal(n, 2 * (10 + 6));
  assert.equal(p.sweep(mkv(24, 42.4, { grounded: false }), K), 0, 'no stamping in air');
  assert.equal(p.sweep(mkv(24, 43.6), K), 0, 'chain restarts after air');
  assert.equal(p.sweep(mkv(24, 44.8, { mode: 'tumble' }), K), 0);
  p.sweep(mkv(24, 45), K); assert.equal(p.sweep(mkv(24, 95), K), 0, 'teleport ignored');
  p.sweep(mkv(24, 60), K); p.sweep(mkv(24, 61), K);
  assert.ok(p.P.n <= 320);
  // on the torus seam each dab is duplicated into wrap copies
  const q = createPlanner(); q.sweep(mkv(0, 40), K);
  assert.ok(q.sweep(mkv(0, 41.2), K) > 32);
});

test('boost flag, width by latAcc, depth by comp', () => {
  const p = createPlanner(); p.sweep(mkv(0, 0), K);
  p.sweep(mkv(0, 1, { boostT: 1, latAcc: 12, comp: 1 }), K);
  assert.equal(p.aP[3], 1); assert.ok(p.aP[0] > 1.1); const hiS = p.aP[2];
  p.sweep(mkv(0, 2, { comp: 0 }), K);
  assert.equal(p.aP[3], 0); assert.ok(p.aP[2] < hiS);
});

test('fade accumulates sub-level steps (6 s life)', () => {
  const p = createPlanner(); let tot = 0;
  for (let i = 0; i < 360; i++) tot += p.fadeStep(1 / 60, 6);
  assert.ok(tot >= 254 && tot <= 255, 'total ' + tot);
});

test('clear plan covers wraps and stays in range', () => {
  const p = createPlanner();
  assert.equal(p.planClear(0, SIZE_X, 90, 100, 512, true), 2); // wraps in z
  assert.equal(p.planClear(40, 56, 90, 100, 512, true), 4);
  for (let i = 0; i < p.out.n; i++) { const o = i * 4; assert.ok(p.out.rects[o] + p.out.rects[o + 2] <= 513 && p.out.rects[o + 1] + p.out.rects[o + 3] <= 513); }
  assert.ok(p.planWindow(0, 500, 512) >= 1);
});

test('no per-frame allocation in pure sweep/fade/plan', () => {
  const p = createPlanner(); const v = mkv(0, 0), A = p.aC, R = p.out.rects;
  for (let i = 0; i < 200; i++) { v.z = i * 0.5; p.sweep(v, K); p.fadeStep(1 / 60, 6); p.planWindow(v.x, v.z, 512); }
  if (global.gc) global.gc();
  const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 20000; i++) { v.z = 100 + i * 0.5; p.sweep(v, K); p.fadeStep(1 / 60, 6); p.planWindow(v.x, v.z, 512); }
  const grow = process.memoryUsage().heapUsed - h0;
  assert.ok(grow < 2e6, 'heap grew ' + grow);
  assert.equal(p.aC, A); assert.equal(p.out.rects, R);
});

test('module runs headless; KEYS and groundChunk shape', () => {
  const m = createSandTracks({ cfg: {} });
  m.update(1 / 60, { x: 0, z: 0, grounded: true, mode: 'ground', speed: 30, heading: 0 });
  m.update(1 / 60, { x: 0, z: 1, grounded: true, mode: 'ground', speed: 30, heading: 0 });
  assert.ok(m.stats().dabs > 0 && typeof m.lastMs === 'number');
  m.fx({ type: 'land', impact: 10 }); m.setQuality('lean'); assert.equal(m.stats().res, 256);
  m.shift(-2000, 0); m.dispose();
  for (const k of Object.keys(KEYS)) assert.ok(k.startsWith('look') && 'def' in KEYS[k] && 'label' in KEYS[k]);
  const g = groundChunk();
  assert.ok(g.fragBody.includes('vW') && g.fragBody.includes('col') && g.fragBody.includes('vFogDepth') && g.uniforms.uTrk);
  assert.ok(g.bandFadeGlsl.includes('cameraPosition'));
});
