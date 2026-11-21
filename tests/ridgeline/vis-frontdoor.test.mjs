import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../pages/ridgeline');
const FD = await import(root + '/src/vis/frontdoor.js');
const GR = await import(root + '/src/vis/garage.js');
const THREE = await import(root + '/vendor/three.module.js');

test('camera blend curve 0 -> 1 in 1.1 s, monotonic, eased', () => {
  assert.equal(FD.blendAt(0), 0);
  assert.equal(FD.blendAt(1.1), 1);
  assert.equal(FD.blendAt(5), 1);
  let prev = -1;
  for (let t = 0; t <= 1.1001; t += 0.05) { const b = FD.blendAt(t); assert.ok(b >= prev); prev = b; }
  assert.ok(FD.blendAt(0.55) > 0.49 && FD.blendAt(0.55) < 0.51);
  assert.ok(FD.blendAt(0.1) < 0.05);
  const st = { mode: 'ride', t: 0, blend: 0 };
  let frames = 0;
  while (st.mode === 'ride') { FD.camStep(st, 1 / 60); frames++; assert.ok(frames < 200); }
  assert.ok(frames >= 66 && frames <= 67, 'frames ' + frames);
  assert.equal(st.mode, 'run'); assert.equal(st.blend, 1);
  const h = { mode: 'hold', t: 0, blend: 0 }; FD.camStep(h, 1); assert.equal(h.mode, 'hold'); assert.equal(h.blend, 0);
});

test('reveal haze lifts in 0.8 s; reduced blend is linear', () => {
  assert.equal(FD.revealAt(0), 1); assert.equal(FD.revealAt(0.8), 0); assert.ok(FD.revealAt(0.4) > 0.4 && FD.revealAt(0.4) < 0.6);
  assert.equal(FD.reducedBlend(0.55), 0.5);
});

test('drawer state machine', () => {
  const s = FD.drawerStep;
  assert.deepEqual(s('open', 'toggle'), { state: 'closed', cb: null });
  assert.deepEqual(s('closed', 'toggle'), { state: 'open', cb: null });
  assert.deepEqual(s('open', 'run'), { state: 'riding', cb: 'onRun' });
  assert.deepEqual(s('closed', 'tapWorld'), { state: 'riding', cb: 'onRun' });
  assert.deepEqual(s('open', 'tapWorld'), { state: 'riding', cb: 'onRun' });
  assert.equal(s('closed', 'daily').cb, null);
  assert.equal(s('open', 'daily').cb, 'onDaily');
  assert.deepEqual(s('open', 'garage'), { state: 'open', cb: 'onGarage' });
  assert.deepEqual(s('open', 'settings'), { state: 'open', cb: 'onSettings' });
  assert.equal(s('riding', 'run').cb, null); assert.equal(s('riding', 'toggle').state, 'riding');
  assert.equal(s('riding', 'done').state, 'gone'); assert.equal(s('gone', 'tapWorld').cb, null);
});

test('unlock rules', () => {
  assert.deepEqual(GR.UNLOCK_M, { wren: 0, kite: 2800, anvil: 5500, barge: 8500, spindle: 13500 });
  assert.ok(GR.isUnlocked('wren', 0));
  assert.ok(!GR.isUnlocked('kite', 2799)); assert.ok(GR.isUnlocked('kite', 2800));
  assert.ok(!GR.isUnlocked('anvil', 5499)); assert.ok(GR.isUnlocked('anvil', 5500));
  assert.ok(GR.isUnlocked('barge', 8500)); assert.ok(!GR.isUnlocked('spindle', 13499)); assert.ok(GR.isUnlocked('spindle', 13500));
  assert.ok(!GR.isUnlocked('nope', 1e9));
  assert.equal(GR.unlockText('spindle', 0), 'Reach 13,500 m in one run');
  assert.equal(GR.unlockText('kite', 3000), 'Unlocked');
});

test('swipe index wraps both ways, swipe threshold', () => {
  assert.equal(GR.wrapIndex(4, 1, 5), 0); assert.equal(GR.wrapIndex(0, -1, 5), 4); assert.equal(GR.wrapIndex(2, 7, 5), 4);
  assert.equal(GR.swipeDir(-60, 40), 1); assert.equal(GR.swipeDir(60, 40), -1); assert.equal(GR.swipeDir(20, 40), 0);
});

test('garage: select wraps, locked flag, callbacks (no DOM)', () => {
  const sel = [];
  const g = GR.createGarage({ cfg: {}, root: null }, { onSelect: (id, lk) => sel.push([id, lk]), bestM: 3000 });
  assert.equal(g.hulls.length, 5); assert.deepEqual(g.hulls.map((h) => h.id), ['wren', 'kite', 'anvil', 'barge', 'spindle']);
  g.open('wren'); assert.equal(g.hullId, 'wren'); assert.equal(g.locked, false);
  g.step(-1); assert.equal(g.hullId, 'spindle'); assert.equal(g.locked, true);
  g.step(1); g.step(1); assert.equal(g.hullId, 'kite'); assert.equal(g.locked, false);
  g.step(1); assert.deepEqual(sel[sel.length - 1], ['anvil', true]);
  for (const h of g.hulls) assert.equal(h.stats.length, 3);
  let closed = 0; const g2 = GR.createGarage({ cfg: {} }, { onClose: () => closed++ }); g2.open('wren'); g2.close(); g2.close(); assert.equal(closed, 1);
});

function mkCtx() {
  const added = [];
  return { THREE, scene: { add: (m) => added.push(m), remove: () => {} }, cfg: {}, groundY: () => 0, root: null, renderer: null, added };
}

test('frontdoor: title builds 2 meshes, haze reveal, blend into run, shift', () => {
  const ctx = mkCtx(); let ran = 0;
  const fd = FD.createFrontDoor(ctx, { onRun: () => ran++ });
  fd.init({ x: 0, y: 0, z: 0 });
  const st = fd.stats(); assert.equal(st.calls, 2); assert.ok(st.tris > 500 && st.tris < 3000, 'tris ' + st.tris);
  const cam = new THREE.PerspectiveCamera(60, 0.5, 0.1, 2000);
  const run = { position: new THREE.Vector3(0, 5, -20), quaternion: new THREE.Quaternion(), fov: 70 };
  const sled = new THREE.Vector3(0, 0, 0);
  assert.equal(fd.homeCam(1 / 60, cam, sled, run), 0);
  const heroPos = cam.position.clone();
  const lift0 = ctx.added[0].material.uniforms.uLift.value; assert.ok(lift0 > 0.9);
  for (let i = 0; i < 60; i++) fd.homeCam(1 / 60, cam, sled, run);
  assert.equal(ctx.added[0].material.uniforms.uLift.value, 0);
  fd.dispatch('tapWorld'); assert.equal(ran, 1); assert.equal(fd.mode, 'ride'); assert.equal(fd.drawerState, 'riding');
  let prev = 0, last = 0;
  for (let i = 0; i < 80 && fd.mode !== 'run'; i++) { last = fd.homeCam(1 / 60, cam, sled, run); assert.ok(last >= prev); prev = last; }
  assert.equal(fd.mode, 'run'); assert.equal(last, 1);
  assert.ok(cam.position.distanceTo(run.position) < 1e-6); assert.equal(cam.fov, 70);
  assert.equal(fd.drawerState, 'gone'); assert.ok(heroPos.z < sled.z);
  const z0 = ctx.added[0].position.z; fd.shift(2000, 0); assert.equal(ctx.added[0].position.z, z0 - 2000);
  fd.dispose();
});

test('frontdoor: reduced motion has no drift', () => {
  const ctx = mkCtx(); ctx.cfg.lookReducedMotion = 1;
  const fd = FD.createFrontDoor(ctx, {}); fd.init({ x: 0, y: 0, z: 0 });
  const cam = new THREE.PerspectiveCamera(60, 0.5, 0.1, 2000); const sled = new THREE.Vector3();
  fd.homeCam(0.1, cam, sled, null); const a = cam.position.x;
  for (let i = 0; i < 100; i++) fd.homeCam(0.1, cam, sled, null);
  assert.equal(cam.position.x, a);
});

test('skirt profile smooth and monotone falling in front, KEYS shape', () => {
  let prev = Infinity;
  for (let dz = 0; dz >= -74; dz -= 1) { const y = FD.skirtY(10, dz, 74); assert.ok(y <= prev + 1e-9); prev = y; }
  for (const M of [FD, GR]) for (const [k, v] of Object.entries(M.KEYS)) { assert.ok(k.startsWith('look')); assert.ok(v.min <= v.def && v.def <= v.max && v.step > 0 && v.label); }
});
