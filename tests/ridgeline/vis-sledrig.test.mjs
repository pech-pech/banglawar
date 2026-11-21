// B4 M1: sled rig math/state (no WebGL).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../pages/ridgeline/src');
const THREE = await import(path.resolve(src, '../vendor/three.module.js'));
const { mulberry32 } = await import(src + '/rng.js');
const M = await import(src + '/vis/sledrig.js');

const mkctx = (cfg = {}, seed = 7) => ({ THREE, scene: new THREE.Scene(), cfg, crng: mulberry32(seed), sunDir: new THREE.Vector3(0, 0.1, 1), groundY: () => 0 });
const vsBase = (o = {}) => Object.assign({ t: 0, dt: 1 / 60, x: 0, y: 0.6, z: 0, speed: 30, vx: 0, vy: 0, mode: 'ground', grounded: true, comp: 0.35, steer: 0, latAcc: 0, diving: false, boostT: 0, quat: { x: 0, y: 0, z: 0, w: 1 }, reduced: false }, o);
const run = (rig, n, vs) => { for (let i = 0; i < n; i++) rig.update(1 / 60, vs); };
const scarfPos = (rig) => Array.from(rig.parts.scarf.geometry.getAttribute('position').array);

test('KEYS are look-prefixed with full metadata', () => {
  for (const [k, v] of Object.entries(M.KEYS)) {
    assert.ok(k.startsWith('look'), k);
    for (const f of ['def', 'min', 'max', 'step', 'label']) assert.ok(v[f] !== undefined, k + '.' + f);
    assert.ok(v.def >= v.min && v.def <= v.max, k);
  }
});

test('HULLS table: 5 hulls with name, line, stats, unlock', () => {
  assert.deepEqual(Object.keys(M.HULLS), ['wren', 'kite', 'anvil', 'barge', 'spindle']);
  assert.deepEqual(M.HULL_IDS.map((i) => M.HULLS[i].unlock), [0, 2800, 5500, 8500, 13500]);
  for (const h of Object.values(M.HULLS)) { assert.ok(h.name && h.line); assert.equal(h.stats.length, 3); }
});

test('budget: <= 11 calls, tris 1.4K..3.2K, all hulls', () => {
  const rig = M.createSledRig(mkctx());
  for (const id of M.HULL_IDS) {
    rig.setHull(id); rig.update(1 / 60, vsBase());
    const s = rig.stats(); assert.ok(s.calls <= 11, id + ' calls ' + s.calls); assert.ok(s.tris > 1400 && s.tris < 3200, id + ' tris ' + s.tris); assert.equal(s.hull, id);
  }
  rig.dispose();
});

test('hull variants change part sizes (baked geometry)', () => {
  const rig = M.createSledRig(mkctx()); const size = (m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.getSize(new THREE.Vector3()); };
  rig.setHull('wren'); const w = size(rig.parts.body), fw = size(rig.parts.fins);
  rig.setHull('barge'); const b = size(rig.parts.body);
  rig.setHull('kite'); const kf = size(rig.parts.fins);
  assert.ok(b.x > w.x * 1.2 && b.z > w.z * 1.2); assert.ok(kf.x > fw.x * 1.5);
  assert.equal(rig.hull.id, 'kite');
});

test('struts follow comp; skid y drops with compression', () => {
  const rig = M.createSledRig(mkctx());
  run(rig, 90, vsBase({ comp: 0.1 })); const hi = rig.parts.skidL.position.y;
  run(rig, 90, vsBase({ comp: 0.95 })); const lo = rig.parts.skidL.position.y;
  assert.ok(lo > hi, 'skid moves up into hull as comp rises'); assert.ok(Math.abs(lo - hi) > 0.05);
});

test('land impact: duck and splay spike then relax; stronger impact = more', () => {
  const peak = (impact) => { const r = M.createSledRig(mkctx()); run(r, 60, vsBase()); r.fx({ type: 'land', impact }); r.update(1 / 60, vsBase()); const p = { ...r.params }; run(r, 240, vsBase()); return [p, r.params]; };
  const [lo] = peak(3), [hi, after] = peak(12);
  assert.ok(hi.splay > lo.splay && hi.duck > lo.duck);
  assert.ok(after.splay < hi.splay * 0.3, 'relaxes');
});

test('steer drives fin tilt and rider lean (opposite fin sign), symmetric', () => {
  const r = M.createSledRig(mkctx()); run(r, 120, vsBase({ steer: 1 })); const a = r.parts.rider.rotation.z, f = r.parts.fins.rotation.z;
  run(r, 240, vsBase({ steer: -1 })); const b = r.parts.rider.rotation.z;
  assert.ok(a > 0.2 && b < -0.2); assert.ok(f < 0);
});

test('dive folds fins; releases after', () => {
  const r = M.createSledRig(mkctx()); run(r, 120, vsBase({ diving: true })); const fold = r.parts.fins.scale.x;
  run(r, 120, vsBase()); assert.ok(fold < 0.4); assert.ok(r.parts.fins.scale.x > 0.95);
});

test('lantern pendulum swings on latAcc then damps out', () => {
  const r = M.createSledRig(mkctx()); const L = r.parts.lantern;
  let mx = 0; for (let i = 0; i < 40; i++) { r.update(1 / 60, vsBase({ latAcc: 15 })); mx = Math.max(mx, Math.abs(L.rotation.z)); }
  assert.ok(mx > 0.1, 'swing ' + mx);
  run(r, 300, vsBase()); assert.ok(Math.abs(L.rotation.z) < 0.02, 'damped');
});

test('scarf: >= 6 segments, wave grows with speed', () => {
  const r = M.createSledRig(mkctx()); assert.ok(scarfPos(r).length / 6 >= 7);
  const amp = (speed) => { const rr = M.createSledRig(mkctx()); run(rr, 30, vsBase({ speed })); let mn = 1e9, mx = -1e9; for (let i = 0; i < 120; i++) { rr.update(1 / 60, vsBase({ speed })); const p = scarfPos(rr), k = p.length - 6; mn = Math.min(mn, p[k]); mx = Math.max(mx, p[k]); } return mx - mn; };
  assert.ok(amp(50) > amp(5));
});

test('deterministic: same seed + inputs = identical scarf and lantern', () => {
  const a = M.createSledRig(mkctx({}, 3)), b = M.createSledRig(mkctx({}, 3));
  for (let i = 0; i < 200; i++) { const v = vsBase({ steer: Math.sin(i / 20), latAcc: 5 * Math.cos(i / 9) }); if (i === 100) { a.fx({ type: 'tumble_start' }); b.fx({ type: 'tumble_start' }); } a.update(1 / 60, v); b.update(1 / 60, v); }
  assert.deepEqual(scarfPos(a), scarfPos(b)); assert.equal(a.parts.lantern.position.y, b.parts.lantern.position.y);
});

test('tumble detaches scarf+lantern as free bodies, recover_end re-attaches', () => {
  const ctx = mkctx(); const r = M.createSledRig(ctx); run(r, 30, vsBase({ vy: 5, speed: 30 }));
  r.fx({ type: 'tumble_start', cause: 'x' }); assert.equal(r.stats().detached, true);
  assert.equal(r.parts.lantern.parent, ctx.scene); assert.equal(r.parts.scarf.parent, ctx.scene);
  const y0 = r.parts.lantern.position.y; run(r, 120, vsBase({ mode: 'tumble', grounded: false, y: 1 }));
  assert.ok(r.parts.lantern.position.y !== y0); assert.ok(r.parts.lantern.position.y >= 0.09, 'rests on ground');
  for (let i = 0; i < NPOINTS(r); i++) assert.ok(Number.isFinite(scarfPos(r)[i]));
  r.fx({ type: 'recover_end' }); assert.equal(r.stats().detached, false);
  assert.ok(r.group.getObjectById(r.parts.lantern.id)); assert.ok(r.group.getObjectById(r.parts.scarf.id));
  r.fx({ type: 'tumble_start' }); r.fx({ type: 'run_start' }); assert.equal(r.stats().detached, false);
});
function NPOINTS(r) { return scarfPos(r).length; }

test('shift moves detached bodies only', () => {
  const r = M.createSledRig(mkctx()); r.shift(-100, 0); r.fx({ type: 'tumble_start' }); run(r, 5, vsBase({ mode: 'tumble' }));
  const z = r.parts.lantern.position.z; r.shift(-50, 0); assert.ok(Math.abs(r.parts.lantern.position.z - (z - 50)) < 1e-6);
});

test('reduced motion: no wave, no steer tilt, no pendulum; still ducks on land', () => {
  const r = M.createSledRig(mkctx({ lookReducedMotion: 1 })); run(r, 90, vsBase({ steer: 1, latAcc: 20 }));
  assert.equal(r.parts.rider.rotation.z, 0); assert.equal(r.parts.lantern.rotation.z, 0); assert.equal(r.stats().scarfWave, 0);
  r.fx({ type: 'land', impact: 12 }); r.update(1 / 60, vsBase({ steer: 1 })); assert.ok(r.params.duck > 0.4);
  const r2 = M.createSledRig(mkctx()); run(r2, 90, vsBase({ steer: 1, reduced: true })); assert.equal(r2.parts.rider.rotation.z, 0);
});

test('silhouette swaps to plum shader, hides glow/scarf; restores', () => {
  const r = M.createSledRig(mkctx()); const m0 = r.parts.body.material;
  r.silhouette(true); assert.equal(r.parts.body.material.type, 'ShaderMaterial'); assert.equal(r.parts.scarf.visible, false); assert.equal(r.stats().silhouette, true);
  r.silhouette(false); assert.equal(r.parts.body.material, m0); assert.equal(r.parts.scarf.visible, true);
});

test('blob shadow: on ground under sled, shrinks and fades with height', () => {
  const ctx = mkctx(); ctx.groundY = (x, z) => 2; const r = M.createSledRig(ctx);
  r.update(1 / 60, vsBase({ x: 5, y: 2.6, z: 9 })); const s0 = r.shadow.scale.x, o0 = r.shadow.material.opacity;
  assert.equal(r.shadow.position.y > 2, true); assert.equal(r.shadow.position.x, 5);
  r.update(1 / 60, vsBase({ x: 5, y: 8, z: 9, grounded: false, mode: 'air' }));
  assert.ok(r.shadow.scale.x < s0 * 0.7 && r.shadow.material.opacity < o0 * 0.6);
  assert.equal(ctx.scene.children.includes(r.shadow), true); r.dispose(); assert.equal(ctx.scene.children.includes(r.shadow), false);
});

test('no per-frame growth: scene children and geometry attrs stable over 2000 updates', () => {
  const ctx = mkctx(); const r = M.createSledRig(ctx); const n = ctx.scene.children.length; const attr = r.parts.scarf.geometry.getAttribute('position');
  for (let i = 0; i < 2000; i++) r.update(1 / 60, vsBase({ steer: Math.sin(i / 30), latAcc: Math.cos(i / 7) * 8 }));
  assert.equal(ctx.scene.children.length, n); assert.equal(r.parts.scarf.geometry.getAttribute('position'), attr);
});
