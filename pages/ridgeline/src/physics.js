// Ridgeline physics: Rapier world, streamed heightfield slabs, rocks, tumble body.
// Works in browser and node (no node imports). Timing via performance.now().
// Heightfield layout (proved by tests/ridgeline/physics.test.mjs):
//   ColliderDesc.heightfield(nrows, ncols, heights, scale) with nrows = z cells, ncols = x cells,
//   heights column-major: heights[c * (nrows + 1) + r], c = x index, r = z index,
//   scale {x: width, y: 1, z: length}; shape is centred on the body origin.

const SLAB_LEN = 40;        // m along z
const BEHIND = 80;          // keep this far behind z
const AHEAD = 160;          // cover this far ahead of z
const G_TERRAIN = 0x0001;
const G_ROCKS = 0x0002;
const G_TUMBLE = 0x0004;
const G_QUERY = 0x0008;
const pack = (mem, filter) => ((mem << 16) | filter) >>> 0;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let lastInitMs = 0;

export async function loadRapier() {
  const t0 = now();
  const mod = await import('../vendor/rapier.mjs');
  const R = mod.default ?? mod;
  await R.init();
  try { // warm-up: JIT/wasm first-use cost lands on the loading screen
    const w = new R.World({ x: 0, y: -10, z: 0 });
    const hh = new Float32Array(25);
    for (let i = 0; i < 25; i++) hh[i] = (i % 5) * 0.1;
    w.createCollider(R.ColliderDesc.heightfield(4, 4, hh, { x: 4, y: 1, z: 4 }, R.HeightFieldFlags.FIX_INTERNAL_EDGES));
    const b = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 1, 0));
    w.createCollider(R.ColliderDesc.cuboid(0.7, 0.25, 1.0), b);
    w.castRay(new R.Ray({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }), 4, true);
    for (let i = 0; i < 5; i++) w.step();
    w.takeSnapshot();
    w.free();
  } catch (e) { /* warm-up is best effort */ }
  lastInitMs = now() - t0;
  return R;
}

export function createPhysics(R, course, cfg) {
  const g = (k, d) => cfg[k] ?? d;
  const cell = g('hfCell', 0.5);
  const width = g('hfWidth', 64);
  const rayLen = g('hoverRayLen', 2.0);
  const nrows = Math.round(SLAB_LEN / cell);
  const ncols = Math.round(width / cell);

  const world = new R.World({ x: 0, y: -g('airGravity', 13), z: 0 });
  world.timestep = 1 / 120;

  const stats = { initMs: lastInitMs, firstStepMs: 0, maxStepMs: 0, maxSwapMs: 0, maxUpdateMs: 0, syncBuilds: 0, fillMs: 0, slabs: 0, cells: 0 };
  const slabs = new Map(); // k -> {body, rocks: [colliders]}
  let filled = false;
  let stepped = false;
  let tumble = null; // {body, collider}
  let disposed = false;

  const terrainGroups = pack(G_TERRAIN, G_TUMBLE | G_QUERY);
  const rockGroups = pack(G_ROCKS, G_TUMBLE);
  const tumbleGroups = pack(G_TUMBLE, G_TERRAIN | G_ROCKS);
  const queryGroups = pack(G_QUERY, G_TERRAIN);

  const rowsPerStep = Math.max(1, Math.floor(g('hfRowsPerStep', 5)));
  let pending = null; // {k, xo, xl, heights, row}

  function startPending(k) {
    const xo = Math.round(course.centerX(k * SLAB_LEN + SLAB_LEN / 2) / cell) * cell;
    pending = { k, xo, xl: xo - width / 2, heights: new Float32Array((nrows + 1) * (ncols + 1)), row: 0 };
  }

  // sample up to `max` z-rows of the pending slab
  function sampleRows(max) {
    const P = pending, z0 = P.k * SLAB_LEN;
    const end = Math.min(nrows + 1, P.row + max);
    for (let r = P.row; r < end; r++) {
      const z = z0 + r * cell;
      for (let c = 0; c <= ncols; c++) P.heights[c * (nrows + 1) + r] = Math.fround(course.height(P.xl + c * cell, z));
    }
    P.row = end;
  }

  function finishPending() {
    const t0 = now();
    const { k, xo, heights } = pending;
    pending = null;
    const z0 = k * SLAB_LEN;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(xo, 0, z0 + SLAB_LEN / 2));
    const desc = R.ColliderDesc.heightfield(nrows, ncols, heights, { x: width, y: 1, z: SLAB_LEN },
      R.HeightFieldFlags.FIX_INTERNAL_EDGES)
      .setFriction(g('tumbleFriction', 0.5)).setRestitution(g('tumbleRestitution', 0.2))
      .setCollisionGroups(terrainGroups).setSolverGroups(terrainGroups);
    world.createCollider(desc, body);
    const rocks = [];
    for (const rk of course.rocksInRange(z0, z0 + SLAB_LEN)) {
      const rr = rk.r ?? rk.s ?? 1;
      const rd = R.ColliderDesc.ball(rr)
        .setTranslation(rk.x, course.height(rk.x, rk.z) + rr * 0.5, rk.z)
        .setFriction(g('tumbleFriction', 0.5)).setRestitution(g('tumbleRestitution', 0.2))
        .setCollisionGroups(rockGroups).setSolverGroups(rockGroups);
      rocks.push(world.createCollider(rd));
    }
    slabs.set(k, { body, rocks });
    return now() - t0;
  }

  function buildSlab(k) { // synchronous
    if (!pending || pending.k !== k) startPending(k);
    sampleRows(nrows + 1);
    return finishPending();
  }

  function removeSlab(k) {
    const s = slabs.get(k);
    for (const c of s.rocks) world.removeCollider(c, false);
    world.removeRigidBody(s.body);
    slabs.delete(k);
  }

  const phys = {
    world,
    stats,
    update(z) {
      const t0 = now();
      const kLo = Math.floor((z - BEHIND) / SLAB_LEN);
      const kHi = Math.floor((z + AHEAD) / SLAB_LEN);
      for (const k of [...slabs.keys()]) if (k < kLo || k > kHi) removeSlab(k);
      if (pending && (pending.k < kLo || pending.k > kHi)) pending = null;
      const first = !filled;
      let swap = 0;
      if (first) {
        for (let k = kLo; k <= kHi; k++) if (!slabs.has(k)) swap += buildSlab(k);
        filled = true;
        stats.fillMs = now() - t0;
      } else {
        // safety: coverage must reach z+60 (cadence depends only on z)
        const kSafe = Math.floor((z + 60) / SLAB_LEN);
        for (let k = kLo; k <= kSafe; k++) {
          if (!slabs.has(k)) { buildSlab(k); stats.syncBuilds++; }
        }
        if (pending) {
          if (pending.row <= nrows) sampleRows(rowsPerStep);
          else swap = finishPending();
        } else {
          for (let k = kLo; k <= kHi; k++) {
            if (!slabs.has(k)) { startPending(k); sampleRows(rowsPerStep); break; }
          }
        }
      }
      stats.slabs = slabs.size;
      stats.cells = slabs.size * nrows * ncols;
      if (!first) {
        if (swap > stats.maxSwapMs) stats.maxSwapMs = swap;
        const d = now() - t0;
        if (d > stats.maxUpdateMs) stats.maxUpdateMs = d;
      }
    },
    // true when [z-BEHIND, z+AHEAD] is fully covered
    covered(z, ahead = AHEAD) {
      const kLo = Math.floor((z - BEHIND) / SLAB_LEN), kHi = Math.floor((z + ahead) / SLAB_LEN);
      for (let k = kLo; k <= kHi; k++) if (!slabs.has(k)) return false;
      return true;
    },
    groundDist(x, y, z) {
      const ray = new R.Ray({ x, y, z }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, rayLen, true, undefined, queryGroups);
      return hit ? hit.timeOfImpact ?? hit.toi : Infinity;
    },
    startTumble(p, q, v, w) {
      if (tumble) this.endTumble();
      const bd = R.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel(v.x, v.y, v.z).setAngvel({ x: w.x, y: w.y, z: w.z })
        .setLinearDamping(g('tumbleLinDamp', 0.15)).setAngularDamping(g('tumbleAngDamp', 0.5))
        .setGravityScale(1).setCcdEnabled(g('tumbleCcd', false) === true);
      const body = world.createRigidBody(bd);
      const cd = R.ColliderDesc.cuboid(0.7, 0.25, 1.0)
        .setFriction(g('tumbleFriction', 0.5)).setRestitution(g('tumbleRestitution', 0.2))
        .setCollisionGroups(tumbleGroups).setSolverGroups(tumbleGroups);
      const collider = world.createCollider(cd, body);
      tumble = { body, collider };
    },
    tumbleState() {
      if (!tumble) return null;
      const b = tumble.body, p = b.translation(), q = b.rotation(), v = b.linvel(), w = b.angvel();
      return {
        p: { x: p.x, y: p.y, z: p.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w },
        v: { x: v.x, y: v.y, z: v.z }, w: { x: w.x, y: w.y, z: w.z },
      };
    },
    endTumble() {
      if (!tumble) return;
      world.removeRigidBody(tumble.body);
      tumble = null;
    },
    step() {
      const t0 = now();
      world.step();
      const d = now() - t0;
      if (!stepped) { stepped = true; stats.firstStepMs = d; } else if (d > stats.maxStepMs) stats.maxStepMs = d;
    },
    hash() {
      const snap = world.takeSnapshot();
      let h = 0x811c9dc5;
      for (let i = 0; i < snap.length; i++) { h ^= snap[i]; h = Math.imul(h, 0x01000193); }
      h ^= slabs.size; h = Math.imul(h, 0x01000193);
      return h >>> 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      tumble = null;
      slabs.clear();
      world.free();
    },
  };
  return phys;
}
