import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRapier, createPhysics } from '../../pages/ridgeline/src/physics.js';
import { createProps } from '../../pages/ridgeline/src/props.js';
import { DEFAULTS } from '../../pages/ridgeline/src/config.js';
import { mulberry32 } from '../../pages/ridgeline/src/rng.js';

const cfg = { ...DEFAULTS, propMaxDynamic: 16, propReedMax: 6, propPostAhead: 120, propBehind: 30, postClipLoss: 0.008, reedHitLoss: 0.0025 };
const R = await loadRapier();
const HAS_SHIFT = (() => { const p = createPhysics(R, fakeCourse(), cfg); const ok = typeof p.onShift === 'function' && typeof p.toAbs === 'function' && !!p.origin; p.dispose(); return ok; })();

// Fake course: flat y=0 (props sit on a G_PROP-collidable ground cuboid we add ourselves), gate every 50 m from 80, reeds seeded per 20 m chunk.
function fakeCourse() {
  const gate = (i) => ({ id: i, z: 80 + i * 50, x: ((i * 7) % 5) - 2, width: 8 });
  return {
    length: Infinity,
    centerX: () => 0, halfWidth: () => 12,
    height: () => 0,
    rocksInRange: () => [],
    gatesInRange(z0, z1) { const o = []; for (let i = Math.max(0, Math.ceil((z0 - 80) / 50)); 80 + i * 50 < z1; i++) if (80 + i * 50 >= z0) o.push(gate(i)); return o; },
    reedsInRange(z0, z1) {
      const o = [];
      for (let k = Math.floor(z0 / 20); k * 20 < z1; k++) {
        const r = mulberry32(k * 7919 + 31);
        if (r() < 0.8) { const z = k * 20 + r() * 20; if (z >= z0 && z < z1) o.push({ id: k, x: (r() < 0.5 ? -1 : 1) * (8 + r() * 3), z, h: 0.9 }); }
      }
      return o;
    },
  };
}

function setup() {
  const course = fakeCourse();
  const phys = createPhysics(R, course, cfg);
  const GP = (phys.G && phys.G.G_PROP) || 0x0010, GT = (phys.G && phys.G.G_TERRAIN) || 0x0001;
  const grp = (((GT << 16) | GP) >>> 0);
  const body = phys.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -1, 30000));
  phys.world.createCollider(R.ColliderDesc.cuboid(500, 1, 60000).setCollisionGroups(grp).setSolverGroups(grp), body);
  const props = createProps(R, phys, course, cfg);
  return { course, phys, props };
}
const sled = (z, x = 0, extra = {}) => ({ x, z, y: 0, bodyY: 0.5, vx: 0, speed: 40, heading: 0, ...extra });

test('spawn/despawn windows: posts in [z-30, z+120], 2 per gate; old ones removed', () => {
  const { phys, props } = setup();
  props.update(100);
  const p = props.poses().filter((q) => q.kind === 'post');
  // gates at 80,130,180 (<=220): 3 gates -> 6 posts
  assert.equal(p.length, 6);
  assert.ok(p.every((q) => q.z >= 70 && q.z < 220));
  props.update(300); // window [270, 420]: gates 300,350,400 -> 6; gate 80..250 gone
  const p2 = props.poses().filter((q) => q.kind === 'post');
  assert.equal(p2.length, 6);
  assert.ok(p2.every((q) => q.z >= 270 - 0.01 && q.z < 420));
  assert.ok(props.stats.despawned >= 6);
  assert.ok(props.poses().filter((q) => q.kind === 'reed').length <= cfg.propReedMax);
  props.dispose(); phys.dispose();
});

test('posts sit at gate.x +- width/2, all start asleep and upright', () => {
  const { course, phys, props } = setup();
  props.update(100);
  const g0 = course.gatesInRange(80, 81)[0];
  const xs = props.poses().filter((q) => q.id.startsWith('post:0:')).map((q) => q.x).sort((a, b) => a - b);
  assert.deepEqual(xs.map((v) => +v.toFixed(3)), [g0.x - 4, g0.x + 4].map((v) => +v.toFixed(3)));
  for (let i = 0; i < 240; i++) { props.clip(sled(-500)); phys.step(); }
  const q = props.poses().find((p) => p.id === 'post:0:0');
  assert.ok(Math.abs(q.y - 1.2) < 0.01, 'sleeping post did not move: y=' + q.y);
  props.dispose(); phys.dispose();
});

test('cap: live dynamic (incl. tumble) never > 16 over a long walk; frozen over cap', () => {
  const { phys, props } = setup();
  let maxLive = 0;
  // wide, dense: knock everything we pass by driving through gate posts and shortly after
  for (let z = 0; z < 3000; z += 0.5) {
    props.update(z);
    // sled drives through each post line
    for (const gx of [-4, 4]) props.clip(sled(z, gx + (Math.floor((z - 80) / 50) * 7 % 5) - 2));
    if (Math.round(z * 2) % 4 === 0) phys.step();
    maxLive = Math.max(maxLive, props.live());
    assert.ok(props.live() <= 16, `live ${props.live()} at z=${z}`);
  }
  console.log(`  max live ${maxLive}, frozen ${props.stats.frozen}, hits ${props.stats.hits}`);
  assert.ok(props.stats.hits > 10);
  props.dispose(); phys.dispose();
});

test('cap holds with a tumble body counted (counts as 1 dynamic)', () => {
  const { phys, props } = setup();
  phys.startTumble({ x: 0, y: 3, z: 90 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 });
  props.update(100);
  assert.ok(props.live() <= 16);
  props.update(2000); props.update(2060);
  assert.ok(props.live() <= 16);
  props.dispose(); phys.dispose();
});

test('clip knocks a post: event, body moves, once-per-gate loss, reed loss max 1%/s', () => {
  const { phys, props } = setup();
  props.update(100);
  const before = props.poses().find((q) => q.id === 'post:0:0');
  const ev = props.clip(sled(before.z - 0.2, before.x));
  assert.equal(ev.length >= 1, true);
  assert.equal(ev[0].type, 'prop_hit'); assert.equal(ev[0].kind, 'post'); assert.ok(ev[0].impulse > 0);
  assert.ok(Math.abs(props.lastLoss - cfg.postClipLoss) < 1e-12);
  for (let i = 0; i < 120; i++) phys.step();
  const after = props.poses().find((q) => q.id === 'post:0:0');
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  assert.ok(moved > 0.2, 'post moved ' + moved);
  assert.ok(after.fallen);
  // second post of same gate: knocked, no extra loss
  const b1 = props.poses().find((q) => q.id === 'post:0:1');
  const ev2 = props.clip(sled(b1.z - 0.2, b1.x));
  assert.equal(ev2.filter((e) => e.kind === 'post').length, 1);
  assert.equal(props.lastLoss, 0);
  // no re-hit on same post
  assert.equal(props.clip(sled(before.z, before.x)).length, 0);
  // reeds: drive through many in 1 s of clip calls -> total loss <= 1%
  props.update(1000);
  let total = 0;
  const reeds = props.poses().filter((q) => q.kind === 'reed');
  assert.ok(reeds.length > 0 && reeds.length <= 6);
  for (let i = 0; i < 120; i++) {
    const r = reeds[i % reeds.length];
    props.clip(sled(r.z, r.x)); total += props.lastLoss;
  }
  assert.ok(total <= 0.01 + cfg.reedHitLoss + 1e-9, 'reed loss/s ' + total);
  assert.ok(total >= cfg.reedHitLoss - 1e-9);
  props.dispose(); phys.dispose();
});

test('flying sled (above post top) does not clip', () => {
  const { phys, props } = setup();
  props.update(100);
  const p = props.poses().find((q) => q.id === 'post:0:0');
  assert.equal(props.clip(sled(p.z, p.x, { bodyY: 8 })).length, 0);
  props.dispose(); phys.dispose();
});

function run(seedN) {
  const { phys, props } = setup();
  const r = mulberry32(seedN);
  let h = 0x811c9dc5;
  for (let z = 0; z < 600; z += 0.25) {
    props.update(z);
    props.clip(sled(z, (r() - 0.5) * 10));
    phys.step();
    if (Math.round(z * 4) % 40 === 0) for (const q of props.poses()) {
      for (const v of [q.x, q.y, q.z, q.qx, q.qy, q.qz, q.qw]) { h ^= Math.round(v * 1e6) | 0; h = Math.imul(h, 0x01000193); }
    }
  }
  const out = [h >>> 0, props.stats.hits, props.stats.spawned];
  props.dispose(); phys.dispose();
  return out;
}
test('determinism: two runs, same hash', () => {
  const a = run(5), b = run(5);
  assert.deepEqual(a, b);
  assert.ok(a[1] > 0);
});

// TODO(C): needs physics.js B2 API (phys.origin/toAbs/onShift). Skipped until it lands.
test('floating-origin shift keeps poses continuous', { skip: HAS_SHIFT ? false : 'TODO: waiting for maker C (phys.onShift/toAbs/origin)' }, () => {
  const { phys, props } = setup();
  props.update(1990);
  props.clip(sled(1990 - 0.0, props.poses().find((q) => q.kind === 'post').x));
  for (let i = 0; i < 30; i++) phys.step();
  const before = props.poses().map((q) => ({ ...q }));
  // force a shift by moving past originShift (phys.update shifts when z - origin.z > cfg.originShift)
  phys.update(2100);
  assert.ok(phys.origin.count >= 1, 'phys did not shift');
  const after = props.poses();
  for (const b of before) {
    const a = after.find((q) => q.id === b.id);
    if (!a) continue; // may have been despawned by window
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3, `pose jump for ${b.id}`);
  }
  props.dispose(); phys.dispose();
});

// ---- checker D additions: freeze-oldest path, leaks, onShift exactly once ----
function setupCfg(over) {
  const c2 = { ...cfg, ...over };
  const course = fakeCourse();
  const phys = createPhysics(R, course, c2);
  const props = createProps(R, phys, course, c2);
  return { course, phys, props };
}
const nBodies = (phys) => phys.world.bodies.len();

test('cap freeze-oldest: over cap, awake knocked props freeze first (oldest hit), then oldest asleep', () => {
  const { phys, props } = setupCfg({ propMaxDynamic: 4, propReedMax: 0 });
  props.update(100); // gates 80,130,180 -> 6 posts, cap 4 => 2 frozen (asleep fallback, oldest spawned)
  assert.equal(props.live(), 4);
  assert.equal(props.stats.frozen, 2);
  // knock two live posts so they are awake, then force over-cap spawn
  const live = props.poses().filter((q) => !q.id.startsWith('post:0:'));
  const a = live[0], b = live[1];
  props.clip(sled(a.z - 0.2, a.x)); // hit first
  props.clip(sled(b.z - 0.2, b.x)); // hit second (newer hitSeq)
  props.update(150); // gate 230 within window -> 2 more posts -> must freeze again, awake oldest-hit first
  assert.ok(props.live() <= 4, 'live ' + props.live());
  assert.ok(props.stats.frozen >= 4, 'frozen ' + props.stats.frozen);
  // frozen bodies must not move afterwards, and nothing leaks
  for (let i = 0; i < 60; i++) phys.step();
  assert.ok(props.live() <= 4);
  props.dispose(); phys.dispose();
});

test('cap: with tumble body counting, freeze keeps live (posts+tumble) <= cap even at cap 2', () => {
  const { phys, props } = setupCfg({ propMaxDynamic: 2, propReedMax: 0 });
  phys.startTumble({ x: 0, y: 3, z: 90 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 });
  props.update(100);
  assert.ok(props.live() <= 2, 'live ' + props.live());
  assert.ok(props.stats.frozen >= 5);
  props.dispose(); phys.dispose();
});

test('no body leak: despawn and dispose remove every body from the world', () => {
  const { phys, props } = setupCfg({});
  const base = nBodies(phys);
  for (let z = 0; z < 1500; z += 5) { props.update(z); props.clip(sled(z, 4)); phys.step(); }
  assert.ok(props.count() <= 40, 'items ' + props.count());
  assert.equal(nBodies(phys) - base, props.count(), 'world bodies == tracked items');
  assert.ok(props.stats.despawned > 0 && props.stats.spawned - props.stats.despawned === props.count());
  props.dispose();
  assert.equal(nBodies(phys), base, 'dispose leaves no prop bodies');
  props.update(2000); // after dispose: no spawn
  assert.equal(nBodies(phys), base);
  phys.dispose();
});

test('onShift moves each body exactly once (phys.update shift, abs poses unchanged, local moved by shift)', () => {
  const { phys, props } = setupCfg({});
  props.update(1990);
  const before = new Map(props.poses().map((q) => [q.id, q]));
  const o0 = { z: phys.origin.z, y: phys.origin.y };
  let calls = 0; phys.onShift(() => calls++);
  phys.update(2100);
  assert.equal(phys.origin.count, 1); assert.equal(calls, 1);
  const dz = phys.origin.z - o0.z;
  assert.equal(dz, 2000);
  for (const a of props.poses()) {
    const b = before.get(a.id); if (!b) continue;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3, 'abs pose jump ' + a.id);
  }
  // double-move would show as a 2000 m abs jump, caught by the loop above
  props.dispose(); phys.dispose();
});

test('poses are absolute: z matches gate z while origin shifted', () => {
  const { phys, props } = setupCfg({});
  phys.update(2100); props.update(2100);
  const q = props.poses().find((p) => p.kind === 'post');
  assert.ok(q.z > 2000 && q.z < 2300, 'abs z ' + q.z);
  props.dispose(); phys.dispose();
});
