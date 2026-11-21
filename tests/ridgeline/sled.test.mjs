// B1 physics sled: launch, air, dive, grade, tumble, recover, determinism.
// Uses the real Rapier adapter (src/physics.js) when it loads; otherwise a tiny analytic fake (below).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../pages/ridgeline/src');
const { mulberry32, hashSeed } = await import(src + '/rng.js');
const { DEFAULTS } = await import(src + '/config.js');
const { FIXED_DT, createSled, stepSled } = await import(src + '/sled.js');

let R = null, createPhysics = null;
try {
  const P = await import(src + '/physics.js');
  R = await P.loadRapier();
  createPhysics = P.createPhysics;
} catch (e) {
  console.log('  physics.js not usable, using the fake adapter:', e && e.message);
}
const REAL = !!R;
console.log(`  sled tests run on ${REAL ? 'real Rapier physics.js' : 'fake phys'}`);

// ---- fake phys: analytic ground distance, ballistic point tumble that rests on the surface ----
function fakePhys(course, cfg) {
  let tb = null;
  return {
    stats: {},
    update() {},
    groundDist(x, y, z) {
      const d = y - course.height(x, z);
      return d >= 0 && d <= cfg.hoverRayLen ? d : Infinity;
    },
    startTumble(p, q, v, w) { tb = { p: { ...p }, q: { ...q }, v: { ...v }, w: { ...w } }; },
    tumbleState() { return tb ? { p: { ...tb.p }, q: { ...tb.q }, v: { ...tb.v }, w: { ...tb.w } } : null; },
    endTumble() { tb = null; },
    step() {
      if (!tb) return;
      const dt = 1 / 120;
      tb.v.y -= cfg.airGravity * dt;
      tb.p.x += tb.v.x * dt; tb.p.y += tb.v.y * dt; tb.p.z += tb.v.z * dt;
      const h = course.height(tb.p.x, tb.p.z) + 0.25;
      if (tb.p.y < h) {
        tb.p.y = h; tb.v.y = Math.max(0, -tb.v.y * cfg.tumbleRestitution);
        const f = Math.exp(-4 * dt); tb.v.x *= f; tb.v.z *= f;
        if (Math.hypot(tb.v.x, tb.v.z) < 0.3) { tb.v.x = 0; tb.v.z = 0; }
      }
      const fw = Math.exp(-3 * dt); tb.w.x *= fw; tb.w.y *= fw; tb.w.z *= fw;
    },
    hash() { return 0; },
    dispose() {},
  };
}
const mkPhys = (course, cfg) => (REAL ? createPhysics(R, course, cfg) : fakePhys(course, cfg));

// ---- synthetic course: base slope + raised-cosine crests, crestAt / features, optional rocks and gates ----
function mkCourse({ crests = [], rocks = [], gates = [], length = 1800, seed = 1, slope = 0.28 } = {}) {
  const features = crests.map((c, i) => ({ id: i, type: 'crest', z: c.z, lead: 0, end: c.L, lee: c.L + 40, H: c.H, L: c.L }));
  const bump = (z) => {
    let b = 0;
    for (const c of crests) if (z > c.z && z < c.z + c.L) b += c.H * 0.5 * (1 - Math.cos(2 * Math.PI * (z - c.z) / c.L));
    return b;
  };
  const featureAt = (z) => features.find((f) => z >= f.z - 5 && z <= f.z + f.lee) || null;
  return {
    seed, length, features, featureAt,
    crestAt: (z) => { const f = featureAt(z); return f ? { id: f.id, lipZ: f.z + f.L / 2 } : null; },
    centerX: () => 0, halfWidth: () => 14, safeX: () => 0,
    height: (x, z) => {
      const out = Math.abs(x) - 14;
      return -slope * z + bump(z) + (out > 0 ? 0.12 * out * out + 0.5 * out : 0);
    },
    rocksInRange: (a, b) => rocks.filter((r) => r.z >= a && r.z < b),
    gatesInRange: (a, b) => gates.filter((g) => g.z >= a && g.z < b),
    treesInRange: () => [],
  };
}

const CRESTS = [
  { z: 150, H: 3, L: 64 }, { z: 330, H: 2, L: 56 }, { z: 500, H: 3, L: 48 },
  { z: 680, H: 1.5, L: 44 }, { z: 850, H: 3, L: 64 }, { z: 1030, H: 2, L: 48 },
];

function mkCfg(over = {}) { return { ...DEFAULTS, ...over }; }

// Ride a course; script(i, s) -> input. Returns {s, ev, phys, under}.
function ride(course, cfg, script, { steps = 120 * 60, setup, stopWhen, keepPhys = false } = {}) {
  const phys = mkPhys(course, cfg);
  const s = createSled(course, phys, mulberry32(course.seed >>> 0));
  if (setup) setup(s);
  const ev = [];
  let under = 0;
  for (let i = 0; i < steps && !s.crashed && !s.finished; i++) {
    phys.update(s.z);
    const e = stepSled(s, course, script(i, s), cfg);
    for (const x of e) { x.i = i; ev.push(x); }
    if (s.mode === 'ground' || s.mode === 'air') {
      const h = course.height(s.x, s.z);
      if (s.y < h - 1e-6) under = Math.max(under, h - s.y);
    }
    if (stopWhen && stopWhen(s, e)) break;
  }
  if (!keepPhys) phys.dispose();
  return { s, ev, phys, under };
}
const of = (ev, type) => ev.filter((e) => e.type === type);
const floatIn = () => ({ steer: 0, fire: false, down: true });
const diveIn = () => ({ steer: 0, fire: false, down: false });

test('launch on crests at speed, never at 22 m/s; at most one launch per feature', () => {
  const course = mkCourse({ crests: CRESTS, length: 1200 });
  const slow = ride(course, mkCfg({ baseSpeed: 22, maxSpeed: 22 }), floatIn);
  assert.equal(of(slow.ev, 'launch').length, 0, 'launches at 22 m/s: ' + JSON.stringify(of(slow.ev, 'launch')));
  assert.ok(slow.s.finished);

  const fast = ride(course, mkCfg({ baseSpeed: 40, maxSpeed: 40 }), floatIn);
  const L = of(fast.ev, 'launch');
  console.log('  launches at 40:', L.map((e) => `${e.crestId}@${e.speed.toFixed(1)}`).join(' '));
  const per = new Map();
  for (const e of L) {
    assert.notEqual(e.crestId, null, 'launch off a crest');
    per.set(e.crestId, (per.get(e.crestId) || 0) + 1);
  }
  for (const [id, n] of per) assert.ok(n <= 1, `crest ${id} launched ${n} times (strobe)`);
  assert.ok(per.size >= 4, `only ${per.size} crests launched at 40 m/s`);
  for (const e of L) assert.ok(e.speed <= DEFAULTS.launchVCap + 1e-9);
});

test('dive shortens flight vs float', () => {
  const course = mkCourse({ crests: [{ z: 150, H: 3, L: 64 }], length: 400 });
  const cfg = mkCfg({ baseSpeed: 40, maxSpeed: 40 });
  const firstLand = (r) => of(r.ev, 'land')[0];
  const f = firstLand(ride(course, cfg, floatIn));
  const d = firstLand(ride(course, cfg, diveIn));
  console.log(`  3/64 @40: float ${f.flight.toFixed(2)} s impact ${f.impact.toFixed(1)} ${f.grade}; dive ${d.flight.toFixed(2)} s impact ${d.impact.toFixed(1)} ${d.grade}`);
  assert.ok(f && d);
  assert.ok(d.flight < f.flight - 0.1, `dive ${d.flight} vs float ${f.flight}`);
});

test('grade sanity: float at mid speed lands clean, impact >= 13 wrecks', () => {
  const cfg = mkCfg({ baseSpeed: 36, maxSpeed: 36 });
  for (const c of [{ z: 150, H: 1.5, L: 44 }, { z: 150, H: 2, L: 56 }]) {
    const r = ride(mkCourse({ crests: [c], length: 400 }), cfg, floatIn);
    const land = of(r.ev, 'land').filter((e) => !e.hop);
    console.log(`  float ${c.H}/${c.L} @36:`, land.map((e) => `${e.grade} B ${e.B.toFixed(2)} imp ${e.impact.toFixed(1)} t ${e.flight.toFixed(2)}`).join('; '));
    assert.ok(land.length >= 1, 'no real flight');
    assert.equal(land[0].grade, 'clean');
    assert.ok(r.s.speed > 0);
  }
  // forced hard landing: flat-ish ground, sled in the air falling at 14 m/s
  const course = mkCourse({ length: 600 });
  const r = ride(course, mkCfg(), floatIn, {
    steps: 240,
    setup: (s) => { s.z = 100; s.x = 0; s.speed = 30; s.mode = 'air'; s.grounded = false; s.tAir = 0.8; s.y = course.height(0, 100) + 0.05; s.vy = -14 - 0.28 * 30; s.pitch = Math.atan(-0.28); },
  });
  const land = of(r.ev, 'land')[0];
  assert.ok(land.impact >= 13, 'impact ' + land.impact);
  assert.equal(land.grade, 'wreck');
  assert.equal(of(r.ev, 'tumble_start')[0].cause, 'wreck');
});

test('touchdown never under the surface (float and dive, many speeds)', () => {
  const course = mkCourse({ crests: CRESTS, length: 1200 });
  for (const v of [30, 40, 50, 58]) {
    for (const inp of [floatIn, diveIn]) {
      const r = ride(course, mkCfg({ baseSpeed: v, maxSpeed: v }), inp);
      assert.ok(r.under < 1e-6, `under surface by ${r.under} at ${v}`);
      for (const e of of(r.ev, 'land')) assert.ok(e.point.y >= course.height(e.point.x, e.point.z) - 1e-6);
    }
  }
});

test('rock contact: tumble_start rock + crash, time frozen, run ends at rest or 2.2 s', () => {
  const rock = { id: 5, x: 0, z: 200, r: 1.2 };
  const course = mkCourse({ rocks: [rock], length: 600 });
  const r = ride(course, mkCfg(), floatIn);
  const ts = of(r.ev, 'tumble_start');
  assert.equal(ts.length, 1);
  assert.equal(ts[0].cause, 'rock');
  const crash = of(r.ev, 'crash')[0];
  assert.ok(crash && crash.i === ts[0].i && crash.rockId === 5);
  assert.ok(r.s.crashed && !r.s.finished);
  const rest = of(r.ev, 'tumble_rest')[0];
  assert.ok(rest, 'tumble_rest');
  const dtSteps = (rest.i - ts[0].i) * FIXED_DT;
  assert.ok(dtSteps <= DEFAULTS.rockEndTime + 2 * FIXED_DT, 'run ended after ' + dtSteps);
  const tAtContact = (ts[0].i + 1) * FIXED_DT;
  assert.ok(Math.abs(r.s.t - tAtContact) < 1e-9, `t ${r.s.t} vs contact ${tAtContact}`);
  // flying over the rock clears it
  const course2 = mkCourse({ rocks: [rock], length: 400 });
  const r2 = ride(course2, mkCfg(), floatIn, {
    setup: (s) => { s.z = 190; s.speed = 30; s.mode = 'air'; s.grounded = false; s.tAir = 0.5; s.y = course2.height(0, 190) + 6; s.vy = -0.28 * 30; },
  });
  assert.equal(of(r2.ev, 'tumble_start').filter((e) => e.cause === 'rock').length, 0, 'cleared the rock in the air');
  assert.equal(of(r2.ev, 'crash').length, 0);
});

test('wreck: tumble, recover with Flow 0 and 0.75 base speed, about 3 s lost, run continues', () => {
  const course = mkCourse({ length: 900, rocks: [{ id: 1, x: 0, z: 235, r: 1 }] });
  const cfg = mkCfg({ baseSpeed: 30, maxSpeed: 30 });
  const r = ride(course, cfg, floatIn, {
    setup: (s) => {
      s.z = 200; s.x = 0; s.speed = 30; s.mode = 'air'; s.grounded = false; s.tAir = 1; s.flow = 3; s.flowWin = 2; s.flowT = 2; s.boost = 0.8;
      s.y = course.height(0, 200) + 0.02; s.vy = -15 - 0.28 * 30;
    },
  });
  const order = r.ev.filter((e) => /land|tumble|recover/.test(e.type)).map((e) => e.type + (e.grade ? ':' + e.grade : '') + (e.cause ? ':' + e.cause : ''));
  assert.deepEqual(order.slice(0, 5), ['land:wreck', 'tumble_start:wreck', 'recover_start', 'tumble_rest', 'recover_end']);
  const ts = of(r.ev, 'tumble_start')[0], end = of(r.ev, 'recover_end')[0], rest = of(r.ev, 'tumble_rest')[0];
  assert.ok(Math.abs(end.speed - 0.75 * 30) < 1e-9, 'speed ' + end.speed);
  assert.ok(r.s.finished, 'run went on to the finish');
  assert.equal(r.s.crashed, false);
  assert.equal(of(r.ev, 'crash').length, 0);
  // time lost vs riding at the Flow-0 base: about recoverLostT
  const restI = rest.i;
  const zWreck = 200 + 30 * FIXED_DT;
  const lost = (end.i - ts.i) * FIXED_DT - 0 - (r.ev.find((e) => e.i === restI) ? 0 : 0);
  console.log(`  wreck: tumble ${((rest.i - ts.i) * FIXED_DT).toFixed(2)} s, hold to recover_end ${((end.i - rest.i) * FIXED_DT).toFixed(2)} s, wreck->recover ${lost.toFixed(2)} s`);
  assert.ok(lost > 1.5 && lost < 5, 'wreck to recover ' + lost);
  // flow and boost reset at the wreck, and the placement avoided the rock at 235
  const flowAfter = r.ev.filter((e) => e.i >= ts.i && e.type === 'flowDrop').map((e) => e.level);
  assert.equal(flowAfter[0], 0);
  assert.equal(of(r.ev, 'tumble_start').length, 1, 'no rock hit after recover');
  assert.ok(zWreck > 0);
});

test('wreck recover: total time lost about recoverLostT vs a clean ride', () => {
  const course = mkCourse({ length: 700 });
  const cfg = mkCfg({ baseSpeed: 30, maxSpeed: 30 });
  const setupAir = (wreck) => (s) => {
    s.z = 200; s.x = 0; s.speed = 30; s.mode = 'air'; s.grounded = false; s.tAir = 1;
    s.y = course.height(0, 200) + 0.02; s.vy = (wreck ? -15 : 0) - 0.28 * 30;
    s.pitch = Math.atan(-0.28);
  };
  const a = ride(course, cfg, floatIn, { setup: setupAir(false) });
  const b = ride(course, cfg, floatIn, { setup: setupAir(true) });
  assert.ok(a.s.finished && b.s.finished);
  const lost = b.s.t - a.s.t;
  console.log(`  wreck time lost ${lost.toFixed(2)} s (target ${DEFAULTS.recoverLostT})`);
  assert.ok(Math.abs(lost - DEFAULTS.recoverLostT) < 0.5, 'lost ' + lost);
});

test('boost: coyote lift fires boost and blocks dive; no charge in air; slam wobble blocks boost', () => {
  const course = mkCourse({ crests: [{ z: 150, H: 3, L: 64 }], length: 400 });
  const cfg = mkCfg({ baseSpeed: 40, maxSpeed: 40 });
  let lifted = false;
  const r = ride(course, cfg, (i, s) => {
    if (s.mode === 'air' && !lifted) { lifted = true; return { steer: 0, fire: true, down: false }; }
    return { steer: 0, fire: false, down: s.mode !== 'air' };
  }, { setup: (s) => { s.boost = 0.6; } });
  assert.equal(of(r.ev, 'boost').length, 1, 'boost in coyote');
  assert.equal(of(r.ev, 'dive_start').length, 0, 'diveLock');
  // slam wobble blocks boost
  const c2 = mkCourse({ length: 400 });
  const phys = mkPhys(c2, cfg);
  const s = createSled(c2, phys, mulberry32(1));
  phys.update(0);
  s.boost = 0.9; s.wobbleT = 0.3;
  assert.equal(of(stepSled(s, c2, { steer: 0, fire: true, down: true }, cfg), 'boost').length, 0);
  phys.dispose();
});

test('determinism: same seed + scripted input -> identical events and final state', () => {
  const run = () => {
    const course = mkCourse({ crests: CRESTS, length: 1200, seed: hashSeed('sled-det'), rocks: [{ id: 3, x: 3, z: 420, r: 1 }, { id: 4, x: -2, z: 760, r: 1.3 }] });
    const cfg = mkCfg({ baseSpeed: 44, maxSpeed: 52 });
    const r = ride(course, cfg, (i, s) => ({ steer: Math.sin(i / 80) * 0.7, fire: s.boost >= 0.5 && i % 50 === 0, down: (i >> 6) % 2 === 0 }), { keepPhys: true });
    const h = r.phys.hash();
    r.phys.dispose();
    const o = { ...r.s, _graze: [...r.s._graze.entries()], _rocks: r.s._rocks.length, _phys: null, _gate: null };
    return { fin: JSON.stringify(o), ev: JSON.stringify(r.ev), n: r.ev.length, h, s: r.s };
  };
  const a = run(), b = run();
  assert.equal(a.fin, b.fin);
  assert.equal(a.ev, b.ev);
  assert.equal(a.h, b.h);
  assert.ok(a.n > 100 && a.s.launches > 0);
  console.log(`  det: ${a.n} events, launches ${a.s.launches}, clean ${a.s.cleans} rough ${a.s.roughs} slam ${a.s.slams} wreck ${a.s.wrecks}, end ${a.s.crashed ? 'crash' : a.s.finished ? 'finish' : 'tmo'} z ${a.s.z.toFixed(1)}`);
});

test('real course (dunes): no launch at 22 m/s, at most one launch per crest at default speeds, never under surface', async (t) => {
  const { createCourse } = await import(src + '/terrain.js');
  const probe = createCourse(1, { ...DEFAULTS });
  if (!probe.crestAt) { t.skip('terrain has no crestAt yet'); return; }
  for (let i = 0; i < 3; i++) {
    for (const v of [22, null]) {
      const cfg = mkCfg({ rockDensity: 0 });
      if (v) { cfg.baseSpeed = v; cfg.maxSpeed = v; }
      const k = createCourse(hashSeed('sled-real-' + i), cfg);
      const r = ride(k, cfg, (j, s) => ({ steer: Math.max(-1, Math.min(1, 0.5 * (k.safeX(s.z + 12) - s.x))), fire: false, down: (j >> 7) % 2 === 0 }), { steps: 120 * 200 });
      const L = of(r.ev, 'launch');
      if (v) assert.equal(L.length, 0, `seed ${i}: ${L.length} launches at 22`);
      const per = new Map();
      for (const e of L) per.set(e.crestId, (per.get(e.crestId) || 0) + 1);
      for (const [id, n] of per) assert.ok(n <= 1, `seed ${i} crest ${id} launched ${n} times`);
      assert.ok(r.under < 1e-6, 'under surface ' + r.under);
      assert.ok(r.s.finished, `seed ${i} finished`);
      if (!v) console.log(`  real seed ${i}: launches ${L.length} on ${k.features.length} features, grades ${of(r.ev, 'land').map((e) => (e.hop ? 'h' : e.grade[0])).join('')}`);
    }
  }
});
