// B4 fix slice F2: tumble/end camera centring, NEW BEST rule, tier pixel ratio, floating-origin shift fan-out.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../pages/ridgeline/vendor/three.module.js';
import { createCamRig } from '../../pages/ridgeline/src/vis/camrig.js';
import { endModel } from '../../pages/ridgeline/src/vis/endcard.js';
import { createQuality, pixelRatioFor } from '../../pages/ridgeline/src/vis/quality.js';
import { createPlanner } from '../../pages/ridgeline/src/vis/sandtracks.js';
import { createMarkers } from '../../pages/ridgeline/src/vis/markers.js';
import { createVis, RENDER_LOCAL, _test } from '../../pages/ridgeline/src/vis/index.js';
import { createCourse } from '../../pages/ridgeline/src/terrain.js';
import { cfg } from '../../pages/ridgeline/src/config.js';

const mkRng = () => { let s = 99; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const mkCtx = () => ({ THREE, scene: new THREE.Scene(), cfg: { camBack: 9, camHeight: 4.5, baseSpeed: 22, maxSpeed: 48 }, crng: mkRng(), groundY: () => 0 });

for (const [W, H] of [[475, 638], [344, 882]]) {
  test(`tumble + end pose keeps the sled horizontally centred at ${W}x${H}`, () => {
    const rig = createCamRig(mkCtx()), cam = new THREE.PerspectiveCamera(58, W / H, 0.1, 1000);
    const body = new THREE.Vector3();
    const vs = (o) => ({ t: 0, x: 0, y: 1, z: 100, speed: 30, boostT: 0, dist: 100, reduced: false, mode: 'tumble', ...o });
    for (let i = 0; i < 60; i++) rig.update(1 / 60, vs({ x: i * 0.02, z: 100 + i * 0.3, mode: 'ground', tumbleP: null }), cam);
    let worst = 0;
    const check = (p) => { cam.updateMatrixWorld(); body.set(p.x, p.y, p.z).project(cam); worst = Math.max(worst, Math.abs(body.x)); };
    // tumble: the body rolls 7 m sideways of the sim x, camera lagging
    rig.fx({ type: 'tumble_start' });
    for (let i = 0; i < 240; i++) { const p = { x: Math.min(7, i * 0.05), y: 0.6, z: 118 + i * 0.01 }; rig.update(1 / 60, vs({ x: 1, z: 118, tumbleP: p }), cam); check(p); }
    // rest, then run_over: tumbleP is gone (mode no longer tumble) and vs.x stays at the sim position
    rig.fx({ type: 'tumble_rest' }); rig.fx({ type: 'run_over' });
    const rest = { x: 7, y: 0.6, z: 120.4 };
    for (let i = 0; i < 400; i++) { rig.update(1 / 60, vs({ x: 1, z: 118, mode: 'recover', tumbleP: null }), cam); if (i > 30) check(rest); }
    cam.updateMatrixWorld(); body.set(rest.x, rest.y, rest.z).project(cam); const settled = Math.abs(body.x);
    assert.ok(worst < 0.6, `max |ndc.x| ${worst.toFixed(3)} (limit 0.6 = middle 60%)`);
    assert.ok(settled < 0.05, `settled end pose |ndc.x| ${settled.toFixed(3)}`);
  });
}

test('NEW BEST only when a previous best existed and was beaten', () => {
  assert.equal(endModel({ cause: 'run_over', dist: 900, best: 0 }).newBest, false, 'first ever run');
  assert.equal(endModel({ cause: 'run_over', dist: 900, best: 0, newBest: true }).newBest, false);
  assert.equal(endModel({ cause: 'run_over', dist: 900, best: 800 }).newBest, true);
  assert.equal(endModel({ cause: 'run_over', dist: 700, best: 800 }).newBest, false);
  assert.equal(endModel({ cause: 'run_over', dist: 800, best: 800 }).newBest, false);
  assert.equal(endModel({ cause: 'run_over', dist: 900 }).newBest, false);
});

test('tier pixel ratio: max = cap, showcase = min(cap, 1.5), lean = 1; logged in probeLine', () => {
  assert.equal(pixelRatioFor('max', 2), 2); assert.equal(pixelRatioFor('max', 1.25), 1.25);
  assert.equal(pixelRatioFor('showcase', 2), 1.5); assert.equal(pixelRatioFor('showcase', 1.25), 1.25);
  assert.equal(pixelRatioFor('lean', 2), 1); assert.equal(pixelRatioFor('lean', 1), 1);
  const q = createQuality({ tier: 'showcase' });
  assert.match(q.probeLine({ dpr: 1.5 }), /, dpr 1\.5$/);
});

function stubRenderer() {
  const calls = [];
  const base = { capabilities: { isWebGL2: false }, extensions: { has: () => false }, info: { render: { calls: 0, triangles: 0 }, reset() {}, autoReset: true },
    domElement: { height: 638 }, getPixelRatio: () => 2, setPixelRatio: (r) => calls.push(r), getContext: () => null, getRenderTarget: () => null, getClearAlpha: () => 1, calls };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => {}) });
}

test('quality tier drives renderer pixel ratio via vis (max 2 -> showcase 1.5 -> lean 1)', () => {
  const course = createCourse(7, cfg), renderer = stubRenderer();
  const vis = createVis({ THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(66, 475 / 638, 0.5, 300), renderer, cfg: { ...cfg, lookTier: 0 }, look: {},
    sunDir: new THREE.Vector3(0, 1, 0), root: null, groundY: (x, z) => course.height(x, z), course, seed: 7, hooks: { getPhase: () => 'run' } });
  try {
    assert.equal(vis.pixelRatio(2), 2);
    vis.quality.setUser('showcase'); assert.equal(renderer.calls.at(-1), 1.5);
    vis.quality.setUser('lean'); assert.equal(renderer.calls.at(-1), 1);
    assert.equal(vis.pixelRatio(2), 1);
    assert.match(vis.probeLine(), /, dpr 1$/);
  } finally { vis.dispose(); }
});

function mkVis() {
  const course = createCourse(7, cfg);
  const vis = createVis({ THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(66, 475 / 638, 0.5, 300), renderer: stubRenderer(), cfg, look: {},
    sunDir: new THREE.Vector3(0, 1, 0), root: null, groundY: (x, z) => course.height(x, z), course, seed: 7, hooks: { getPhase: () => 'run' } });
  return vis;
}
function spyShifts(vis) {
  const seen = new Map();
  for (const m of vis.mods) { const orig = m.shift.bind(m); m.shift = (dz, dy) => { seen.set(m, [dz, dy]); return orig(dz, dy); }; }
  const fr = vis.front, origF = fr.shift.bind(fr); const f = { args: null }; fr.shift = (dz, dy) => { f.args = [dz, dy]; return origF(dz, dy); };
  return { seen, f };
}

test('RENDER_LOCAL is false; render absolute: onShift(2000, -560) leaves modules untouched and records the shift', () => {
  assert.equal(RENDER_LOCAL, false);
  _test.renderLocal = null;
  let cb = null;
  const vis = mkVis();
  try {
    vis.attachPhys({ onShift(f) { cb = f; } });
    assert.equal(typeof cb, 'function');
    const { seen, f } = spyShifts(vis);
    const sky0 = vis.sky.stats();
    cb(2000, -560);
    assert.equal(seen.size, 0, 'no module shift() calls');
    assert.equal(f.args, null);
    assert.deepEqual(vis.sky.stats(), sky0);
    assert.deepEqual(vis.shiftInfo(), { n: 1, z: 2000, y: -560 });
    cb(2000, 0);
    assert.deepEqual(vis.shiftInfo(), { n: 2, z: 4000, y: -560 });
  } finally { vis.dispose(); }
});

test('RENDER_LOCAL forced on via _test hook: every module shift(-2000, 560), frontdoor gets the raw move', () => {
  _test.renderLocal = true;
  let cb = null;
  const vis = mkVis();
  try {
    vis.attachPhys({ onShift(f) { cb = f; } });
    const { seen, f } = spyShifts(vis);
    cb(2000, -560);
    assert.equal(seen.size, vis.mods.length);
    for (const [m, a] of seen) assert.deepEqual(a, [-2000, 560], 'module ' + vis.mods.indexOf(m));
    assert.deepEqual(f.args, [2000, -560], 'frontdoor gets the raw origin move (it subtracts)');
    assert.equal(vis.shiftInfo().n, 1);
  } finally { _test.renderLocal = null; vis.dispose(); }

  // absolute-render markers: milestone posts keyed by absolute distance stay put with no shift call
  const mk0 = createMarkers({ THREE, scene: new THREE.Scene(), cfg: { ...cfg }, crng: mkRng(), groundY: () => 0 });
  mk0.update(1 / 60, { t: 0, dt: 1 / 60, x: 0, y: 1, z: 1990, speed: 30, dist: 1990, boostT: 0, mode: 'ground', n: 0, reduced: false }, null);
  assert.equal(mk0.state().zOff || 0, 0);

  // sandtracks: the same ground maps to the same texel before and after the shift
  const p = createPlanner(), before = p.texel(3, 1990, 512);
  p.shift(-2000);
  assert.deepEqual(p.texel(3, -10, 512), before);

  // markers: keyed by absolute distance; world z moves by -2000, y by +560, (z - zOff) is unchanged
  const mk = createMarkers({ THREE, scene: new THREE.Scene(), cfg: { ...cfg }, crng: mkRng(), groundY: () => 0 });
  mk.update(1 / 60, { t: 0, dt: 1 / 60, x: 0, y: 1, z: 900, speed: 30, dist: 900, boostT: 0, mode: 'ground', n: 0, reduced: false }, null);
  const live = () => mk.state().ms.filter((m) => m.on).map((m) => ({ D: m.D, z: m.z, y: m.y }));
  const abs0 = live(), zo0 = mk.state().zOff || 0;
  assert.ok(abs0.length > 0, 'a milestone post is live near 1000 m');
  mk.shift(-2000, 560);
  const after = live(), zo1 = mk.state().zOff;
  assert.equal(zo1 - zo0, -2000);
  abs0.forEach((a, i) => { assert.equal(after[i].D, a.D); assert.equal(after[i].z - zo1, a.z - zo0); assert.equal(after[i].y, a.y + 560); });
});
