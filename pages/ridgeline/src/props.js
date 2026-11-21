// Knockable props as Rapier bodies (B2): gate posts (2 per gate, flag welded as a compound
// collider) and reed tufts. Dynamic bodies that start asleep, group G_PROP (collides terrain
// only). Effects on the sled are scripted (loss fractions), never read from the solver.
// Absolute coordinates outside; Rapier local = absolute - phys.origin (via phys.toLocal/toAbs).

const G_PROP_FALLBACK = 0x0010;
const G_TERRAIN_FALLBACK = 0x0001;
const packFb = (mem, filter) => ((mem << 16) | filter) >>> 0;

const POST_H = 2.4, POST_R = 0.16, POST_MASS = 10;
const REED_H = 0.9, REED_R = 0.3, REED_MASS = 1.5;
const SLED_HALF_W = 0.7, SLED_HALF_L = 1.0, SLED_MASS = 120;
const DT = 1 / 120;

export function createProps(R, phys, course, cfg) {
  const g = (k, d) => cfg[k] ?? d;
  const maxDyn = g('propMaxDynamic', 16);
  const reedMax = g('propReedMax', 6);
  const ahead = g('propPostAhead', 120);
  const behind = g('propBehind', 30);
  const postLoss = g('postClipLoss', 0.008);
  const reedLoss = g('reedHitLoss', 0.0025);
  const world = phys.world;
  const pk = phys.pack || packFb;
  const GP = (phys.G && (phys.G.PROP || phys.G.G_PROP)) || G_PROP_FALLBACK;
  const GT = (phys.G && (phys.G.TERRAIN || phys.G.G_TERRAIN)) || G_TERRAIN_FALLBACK;
  const groups = pk(GP, GT);
  const toLocal = (p) => (phys.toLocal ? phys.toLocal(p) : { x: p.x, y: p.y, z: p.z });
  const toAbs = (p) => (phys.toAbs ? phys.toAbs(p) : { x: p.x, y: p.y, z: p.z });

  const items = new Map(); // id -> item, insertion order = spawn order
  const gateHit = new Set(); // gate ids whose post speed loss was paid
  const spent = new Set(); // ids despawned after being knocked (do not respawn upright)
  const stats = { spawned: 0, despawned: 0, frozen: 0, hits: 0, maxLive: 0 };
  let seq = 0, step = 0, reedBudget = reedLoss, disposed = false;
  const props = { lastLoss: 0, stats };

  function mkBody(id, kind, gateId, x, y, z, r) {
    const p = toLocal({ x, y, z });
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
      .setLinearDamping(0.05).setAngularDamping(0.3));
    const addCol = (cd) => world.createCollider(cd.setFriction(0.6).setRestitution(0.15)
      .setCollisionGroups(groups).setSolverGroups(groups), body);
    if (kind === 'post') {
      addCol(R.ColliderDesc.cylinder(POST_H / 2, POST_R).setMass(POST_MASS * 0.9));
      // flag: thin cuboid welded near the top, as part of the same compound body
      addCol(R.ColliderDesc.cuboid(0.45, 0.25, 0.01).setTranslation(0.45 + POST_R, POST_H / 2 - 0.35, 0).setMass(POST_MASS * 0.1));
    } else {
      addCol(R.ColliderDesc.cylinder(REED_H / 2, REED_R * 0.6).setMass(REED_MASS));
    }
    body.sleep();
    return body;
  }

  function spawnPost(gate, side) {
    const id = `post:${gate.id}:${side}`;
    if (items.has(id) || spent.has(id)) return;
    const x = gate.x + (side ? 1 : -1) * gate.width / 2;
    const y = course.height(x, gate.z) + POST_H / 2;
    const body = mkBody(id, 'post', gate.id, x, y, gate.z);
    items.set(id, { id, kind: 'post', gateId: gate.id, body, r: POST_R + 0.05, hit: false, frozen: false, order: seq++, z0: gate.z, hitSeq: -1 });
    stats.spawned++;
  }
  function spawnReed(rd) {
    const id = `reed:${rd.id}`;
    if (items.has(id) || spent.has(id)) return;
    const y = course.height(rd.x, rd.z) + REED_H / 2;
    const body = mkBody(id, 'reed', -1, rd.x, y, rd.z);
    items.set(id, { id, kind: 'reed', gateId: -1, body, r: REED_R, hit: false, frozen: false, order: seq++, z0: rd.z, hitSeq: -1 });
    stats.spawned++;
  }

  function remove(it, wasSpent) {
    world.removeRigidBody(it.body);
    items.delete(it.id);
    if (it.hit || wasSpent) spent.add(it.id);
    stats.despawned++;
  }

  function dynCount() {
    let n = 0;
    for (const it of items.values()) if (!it.frozen) n++;
    if (phys.tumbleState && phys.tumbleState()) n++;
    return n;
  }
  function freeze(it) {
    it.body.setBodyType(R.RigidBodyType.Fixed, true);
    it.frozen = true;
    stats.frozen++;
  }
  // over cap: oldest awake dynamic freezes; if none awake, oldest dynamic (still asleep) freezes
  function enforceCap() {
    let guard = 64;
    while (dynCount() > maxDyn && guard-- > 0) {
      let pick = null;
      for (const it of items.values()) {
        if (it.frozen || it.body.isSleeping()) continue;
        if (!pick || it.hitSeq < pick.hitSeq) pick = it;
      }
      if (!pick) for (const it of items.values()) if (!it.frozen && (!pick || it.order < pick.order)) pick = it;
      if (!pick) break;
      freeze(pick);
    }
  }
  function curZ(it) { return toAbs(it.body.translation()).z; }

  props.update = function update(z) {
    if (disposed) return;
    // despawn behind (by current body z: knocked posts may have slid)
    for (const it of [...items.values()]) if (curZ(it) < z - behind) remove(it);
    // prune bounded memory
    if (spent.size > 256) for (const id of [...spent]) { const zz = +id.split(':')[1]; if (!(zz >= z - behind)) spent.delete(id); }
    // gate posts in window, sorted by (z, id, side)
    const gates = course.gatesInRange(z - behind, z + ahead);
    for (const gt of gates) {
      for (let side = 0; side < 2; side++) {
        if (dynCount() >= maxDyn && !canFreezeOne()) return;
        spawnPost(gt, side);
        enforceCap();
      }
    }
    // reeds: nearest ahead, at most propReedMax live
    if (course.reedsInRange && reedMax > 0) {
      const rs = course.reedsInRange(z, z + ahead).slice().sort((a, b) => a.z - b.z || a.id - b.id);
      let live = 0;
      for (const it of items.values()) if (it.kind === 'reed') live++;
      for (const rd of rs) {
        if (live >= reedMax) break;
        const id = `reed:${rd.id}`;
        if (items.has(id) || spent.has(id)) continue;
        spawnReed(rd);
        live++;
        enforceCap();
      }
    }
    const n = dynCount();
    if (n > stats.maxLive) stats.maxLive = n;
  };
  function canFreezeOne() { for (const it of items.values()) if (!it.frozen) return true; return false; }

  // sled box (1.4 x 2 m, heading-rotated) vs post/reed circle in the XZ plane
  props.clip = function clip(s) {
    props.lastLoss = 0;
    const events = [];
    step++;
    reedBudget = Math.min(reedLoss, reedBudget + 0.01 * DT); // refill 1%/s, burst of one tuft
    if (disposed || !s) return events;
    const h = s.heading || 0, sh = Math.sin(h), ch = Math.cos(h);
    const sy = s.bodyY ?? s.y ?? 0;
    const speed = Math.hypot(s.vx || 0, s.speed || 0);
    let loss = 0;
    for (const it of items.values()) {
      if (it.hit) continue;
      const t = toAbs(it.body.translation());
      if (Math.abs(t.z - s.z) > 4) continue;
      const dx = t.x - s.x, dz = t.z - s.z;
      const along = dx * sh + dz * ch, across = dx * ch - dz * sh;
      if (Math.abs(along) > SLED_HALF_L + it.r || Math.abs(across) > SLED_HALF_W + it.r) continue;
      const top = t.y + (it.kind === 'post' ? POST_H / 2 : REED_H / 2);
      if (sy > top + 0.3 || sy < t.y - 2.5) continue; // flying over / far below
      // clip: knock it
      it.hit = true; it.hitSeq = step;
      const f = it.kind === 'post' ? 0.02 * SLED_MASS : 0.004 * SLED_MASS;
      let ax = dx, az = dz;
      const al = Math.hypot(ax, az) || 1;
      ax /= al; az /= al;
      // lateral away from the sled plus forward carry, and 30% up
      const lx = (across >= 0 ? 1 : -1) * ch, lz = (across >= 0 ? -1 : 1) * sh;
      const dirx = 0.7 * lx + 0.3 * sh + 0.0 * ax, dirz = 0.7 * lz + 0.3 * ch + 0.0 * az;
      const dl = Math.hypot(dirx, dirz) || 1;
      const mag = f * Math.max(speed, 1);
      const imp = { x: dirx / dl * mag, y: 0.3 * mag, z: dirz / dl * mag };
      const b = it.body;
      if (!it.frozen) {
        b.wakeUp();
        const pos = b.translation();
        b.applyImpulseAtPoint(imp, { x: pos.x, y: pos.y + (it.kind === 'post' ? 0.9 : 0.3), z: pos.z }, true);
      }
      stats.hits++;
      const impulse = Math.hypot(imp.x, imp.y, imp.z);
      events.push({ type: 'prop_hit', kind: it.kind, impulse, pos: { x: t.x, y: t.y, z: t.z } });
      if (it.kind === 'post') {
        if (!gateHit.has(it.gateId)) { gateHit.add(it.gateId); loss += postLoss; }
      } else {
        const l = Math.min(reedLoss, reedBudget);
        reedBudget -= l;
        loss += l;
      }
    }
    props.lastLoss = loss;
    if (gateHit.size > 512) { const keep = [...gateHit].slice(-256); gateHit.clear(); for (const k of keep) gateHit.add(k); }
    return events;
  };

  props.poses = function poses() {
    const out = [];
    for (const it of items.values()) {
      const b = it.body, p = toAbs(b.translation()), q = b.rotation();
      out.push({ id: it.id, kind: it.kind, x: p.x, y: p.y, z: p.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, fallen: it.hit });
    }
    return out;
  };
  props.live = function live() { return dynCount(); };
  props.count = function count() { return items.size; };

  // floating origin: bodies move by (-dz, -dy) without waking
  const onShift = (dz, dy) => {
    for (const it of items.values()) {
      const t = it.body.translation();
      it.body.setTranslation({ x: t.x, y: t.y - dy, z: t.z - dz }, false);
    }
  };
  if (phys.onShift) phys.onShift(onShift);
  props._onShift = onShift;

  props.dispose = function dispose() {
    if (disposed) return;
    disposed = true;
    for (const it of [...items.values()]) world.removeRigidBody(it.body);
    items.clear();
  };
  return props;
}
