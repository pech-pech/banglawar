import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../pages/ridgeline/vendor/three.module.js';
import { createCamRig, fovFor, KEYS as CK } from '../../pages/ridgeline/src/vis/camrig.js';
import { createMarkers, milestoneDistances, UNLOCKS } from '../../pages/ridgeline/src/vis/markers.js';

const mkCtx = (cfg = {}) => {
  let s = 12345; const crng = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { THREE, scene: new THREE.Scene(), cfg: { camBack: 9, camHeight: 4.5, baseSpeed: 22, maxSpeed: 48, ...cfg }, crng, groundY: () => 0 };
};
const mkVs = (o = {}) => ({ t: 0, x: 0, y: 1, z: 100, speed: 0, boostT: 0, dist: 100, reduced: false, ...o });
const cam = () => new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1000);

test('camrig reproduces default framing at rest and springs converge', () => {
  const ctx = mkCtx(), rig = createCamRig(ctx), c = cam();
  rig.update(1 / 60, mkVs({ x: 5 }), c);
  for (let i = 0; i < 300; i++) rig.update(1 / 60, mkVs({ x: 0 }), c);
  assert.ok(Math.abs(c.position.x) < 1e-3);
  assert.ok(Math.abs(c.position.y - 5.5) < 1e-6 && Math.abs(c.position.z - 91) < 1e-6);
  assert.ok(Math.abs(c.fov - 58) < 0.02);
  c.updateMatrixWorld(); const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
  const want = new THREE.Vector3(0, -1, 116).sub(c.position).normalize();
  assert.ok(fwd.angleTo(want) < 1e-3);
});

test('FOV widens with speed and is capped at 54 m/s', () => {
  const cfg = mkCtx().cfg;
  const f = (s) => fovFor(s, 16 / 9, false, cfg);
  assert.equal(f(10), 58); assert.ok(f(40) > f(30));
  assert.equal(f(54), f(90)); assert.equal(f(54), 58 + CK.lookCamFov.def);
  const ctx = mkCtx(), rig = createCamRig(ctx), c = cam();
  for (let i = 0; i < 300; i++) rig.update(1 / 60, mkVs({ speed: 80 }), c);
  assert.ok(Math.abs(c.fov - (58 + 12)) < 0.05);
});

test('shake only on slam, zero with reduced motion', () => {
  const run = (ev, reduced) => {
    const ctx = mkCtx(reduced ? { lookReducedMotion: 1 } : {}), rig = createCamRig(ctx), c = cam();
    for (let i = 0; i < 30; i++) rig.update(1 / 60, mkVs(), c);
    rig.fx(ev); let mx = 0;
    for (let i = 0; i < 20; i++) { rig.update(1 / 60, mkVs(), c); mx = Math.max(mx, rig.stats().shake); }
    return mx;
  };
  assert.equal(run({ type: 'land', impact: 3 }, false), 0);
  assert.equal(run({ type: 'boost' }, false), 0);
  const s = run({ type: 'land', impact: 14 }, false);
  assert.ok(s >= 2 && s <= 4, 'shake px ' + s);
  assert.equal(run({ type: 'land', impact: 30 }, true), 0);
  // reduced: no FOV change either
  const ctx = mkCtx({ lookReducedMotion: 1 }), rig = createCamRig(ctx), c = cam();
  for (let i = 0; i < 200; i++) rig.update(1 / 60, mkVs({ speed: 60, boostT: 1 }), c);
  assert.ok(Math.abs(c.fov - 58) < 0.02);
});

test('end pull-back raises camera', () => {
  const ctx = mkCtx(), rig = createCamRig(ctx), c = cam();
  for (let i = 0; i < 30; i++) rig.update(1 / 60, mkVs(), c);
  const y0 = c.position.y, z0 = c.position.z; rig.fx({ type: 'caught' });
  for (let i = 0; i < 300; i++) rig.update(1 / 60, mkVs(), c);
  assert.ok(c.position.y > y0 + 3 && c.position.z < z0 - 5);
  rig.reset(); rig.fx({ type: 'run_start' });
});

test('marker positions: 1000 m steps plus unlock distances', () => {
  const l = milestoneDistances(0, 14000, 1000);
  assert.equal(l.length, 14 + 4); // 14 km marks + 4 hull unlock marks
  assert.deepEqual(l.filter((e) => e.dist % 1000 === 0).map((e) => e.dist), Array.from({ length: 14 }, (_, i) => (i + 1) * 1000));
  assert.deepEqual(l.filter((e) => e.hull).map((e) => [e.dist, e.hull]), [[2800, 'kite'], [5500, 'anvil'], [8500, 'barge'], [13500, 'spindle']]);
});

test('unlock marks appear and are shift-stable', () => {
  const r = milestoneDistances(2000, 6000, 1000).map((e) => e.dist);
  assert.deepEqual(r, [2000, 2800, 3000, 4000, 5000, 5500, 6000]);
  const ctx = mkCtx(), mk = createMarkers(ctx);
  const vs = mkVs({ z: 2700, dist: 2700, x: 0 });
  mk.update(1 / 60, vs);
  const st = () => mk.state().ms.filter((m) => m.on).map((m) => [m.D, m.z - (m.D + mk.state().zOff)]);
  const before = mk.state().ms.filter((m) => m.on).map((m) => m.D).sort((a, b) => a - b);
  assert.deepEqual(before.slice(0, 2), [2800, 3000]);
  assert.ok(mk.stats().solid > 0 && mk.stats().glow > 0);
  const zBefore = mk.state().ms.find((m) => m.D === 2800).z;
  mk.shift(-2000, 0);
  const vs2 = mkVs({ z: 700, dist: 2700 });
  mk.update(1 / 60, vs2);
  const m2 = mk.state().ms.find((m) => m.on && m.D === 2800);
  assert.equal(m2.z, zBefore - 2000);
  assert.equal(m2.z - vs2.z, zBefore - vs.z); // same relative gap = same absolute distance
  for (const [, err] of st()) assert.ok(Math.abs(err) < 1e-9);
  assert.equal(mk.state().ms.filter((m) => m.on).length, before.length);
  mk.fx({ type: 'zone_enter', zone: 'brass' }); mk.update(1 / 60, vs2);
  assert.equal(mk.stats().zones, 1);
  mk.fx({ type: 'recover_end' }); mk.update(1 / 60, vs2);
  assert.ok(mk.stats().sparks > 0);
  mk.dispose();
});

// ---- checker additions (M8 check)
const run = (dt, secs, mk) => {
  const ctx = mkCtx(), rig = createCamRig(ctx), c = cam();
  const vs = mkVs({ x: 0, speed: 40 }); rig.update(dt, vs, c);
  rig.fx({ type: 'land', impact: 6 }); vs.x = 4;
  for (let t = 0; t < secs; t += dt) rig.update(dt, vs, c);
  return { p: c.position.clone(), fov: c.fov, dip: rig.stats().dip };
};
test('springs are frame-rate independent (1/30 vs 1/144)', () => {
  for (const secs of [0.4, 3]) {
    const a = run(1 / 30, secs), b = run(1 / 144, secs);
    assert.ok(a.p.distanceTo(b.p) < 0.25, `pos diff @${secs}s ${a.p.distanceTo(b.p)}`);
    assert.ok(Math.abs(a.fov - b.fov) < 0.6);
  }
  const a = run(1 / 30, 6), b = run(1 / 144, 6);
  assert.ok(a.p.distanceTo(b.p) < 1e-2);
});
test('camera stays above ground', () => {
  const ctx = mkCtx(); ctx.groundY = () => 20;
  const rig = createCamRig(ctx), c = cam();
  for (let i = 0; i < 60; i++) rig.update(1 / 60, mkVs({ y: 1 }), c);
  assert.ok(c.position.y >= 20.8 - 1e-9);
});
test('tumble orbit follows vs.tumbleP and is calm', () => {
  const ctx = mkCtx(), rig = createCamRig(ctx), c = cam();
  for (let i = 0; i < 30; i++) rig.update(1 / 60, mkVs(), c);
  const tp = { x: 6, y: 3, z: 130 };
  for (let i = 0; i < 300; i++) rig.update(1 / 60, mkVs({ tumbleP: tp }), c);
  assert.ok(rig.stats().orbitW > 0.95);
  assert.ok(Math.abs(c.position.z - 130) < 15 && Math.abs(c.position.z - 100) > 0 && c.position.z > 110, 'cam z ' + c.position.z);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
  const to = new THREE.Vector3(tp.x, tp.y, tp.z).sub(c.position).normalize();
  assert.ok(f.angleTo(to) < 0.5);
  for (let i = 0; i < 400; i++) rig.update(1 / 60, mkVs({ tumbleP: null }), c);
  assert.ok(rig.stats().orbitW < 0.02);
});
test('end pull-back keeps sled in upper half; shake scale; roll', () => {
  const ctx = mkCtx(), rig = createCamRig(ctx), c = cam();
  rig.fx({ type: 'caught' });
  const vs = mkVs({ y: 1 });
  for (let i = 0; i < 400; i++) rig.update(1 / 60, vs, c);
  c.updateMatrixWorld(); c.updateProjectionMatrix();
  const ndc = new THREE.Vector3(vs.x, vs.y, vs.z).project(c);
  assert.ok(ndc.y > 0.05 && ndc.y < 1, 'sled ndc y ' + ndc.y);
  const shakeOf = (v) => { const x = mkCtx({ lookCamShake: v }), r = createCamRig(x), cc = cam();
    for (let i = 0; i < 5; i++) r.update(1 / 60, mkVs(), cc);
    r.fx({ type: 'land', impact: 30 }); let m = 0;
    for (let i = 0; i < 20; i++) { r.update(1 / 60, mkVs(), cc); m = Math.max(m, r.stats().shake); } return m; };
  assert.equal(shakeOf(0), 0); assert.ok(shakeOf(3) >= 2 && shakeOf(3) <= 4); assert.ok(shakeOf(1.5) < shakeOf(3));
  const rollOf = (cfg) => { const x = mkCtx(cfg), r = createCamRig(x), cc = cam();
    for (let i = 0; i < 120; i++) r.update(1 / 60, mkVs({ steer: 1, roll: 0.4 }), cc);
    const e = new THREE.Euler().setFromQuaternion(cc.quaternion, 'YXZ'); return e.z; };
  assert.ok(Math.abs(rollOf({})) > 0.01 && Math.abs(rollOf({})) <= 0.051);
  assert.equal(rollOf({ lookReducedMotion: 1 }), 0);
});
test('markers: pooled, no cool colours, banner texture once', () => {
  const ctx = mkCtx(), mk = createMarkers(ctx);
  const vs = mkVs({ z: 2700, dist: 2700 });
  for (let i = 0; i < 300; i++) mk.update(1 / 60, { ...vs, dist: 2700 + i * 3, z: 2700 + i * 3 });
  assert.ok(mk.state().ms.length === 6);
  const src = readFileSync(new URL('../../pages/ridgeline/src/vis/markers.js', import.meta.url), 'utf8');
  assert.equal((src.match(/new THREE\.CanvasTexture/g) || []).length, 1);
  const cols = [...src.matchAll(/'#([0-9a-fA-F]{6})'/g)].map((m) => m[1]);
  for (const h of cols) { const r = parseInt(h.slice(0, 2), 16), b = parseInt(h.slice(4, 6), 16); assert.ok(r >= b - 8, 'cool colour #' + h); }
  mk.dispose();
});
