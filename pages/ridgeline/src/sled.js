// Ridgeline sled physics. Pure, deterministic, no THREE, no config import.
export const FIXED_DT = 1 / 120;

const SLED_R = 0.8;        // sled collision radius (m)
const HOVER = 0.5;         // ride height above terrain (m)
const START_SPEED = 12;
const GATE_LOOKAHEAD = 300;
const ROCK_BEHIND = 10;
const ROCK_AHEAD = 70;
const ROCK_REFRESH = 30;   // refresh when sled is within this of window end

export function createSled(course) {
  const x = course.centerX(0);
  return {
    x, z: 0, y: course.height(x, 0) + HOVER,
    vx: 0, speed: START_SPEED,
    boost: 0, boostT: 0, t: 0,
    gatesPassed: 0, gatesMissed: 0, nextGate: 0,
    crashed: false, finished: false, charging: false,
    heading: 0,
    // internals
    boostBonus: 0,
    _gate: null, _gateSearchZ: 0, _gatesDone: false,
    _rocks: [], _rz0: 0, _rz1: -1,
  };
}

function refreshRocks(s, course) {
  s._rz0 = s.z - ROCK_BEHIND;
  s._rz1 = s.z + ROCK_AHEAD;
  s._rocks = course.rocksInRange(s._rz0, s._rz1);
}

function findGate(s, course) {
  if (s._gatesDone || s._gate || s.z < s._gateSearchZ) return;
  const list = course.gatesInRange(s.z - 1, s.z + GATE_LOOKAHEAD);
  for (let i = 0; i < list.length; i++) {
    if (list[i].id >= s.nextGate) { s._gate = list[i]; return; }
  }
  if (s.z + GATE_LOOKAHEAD >= course.length) s._gatesDone = true;
  else s._gateSearchZ = s.z + GATE_LOOKAHEAD - 1;
}

export function stepSled(s, course, input, cfg) {
  const events = [];
  if (s.crashed || s.finished) return events;
  const dt = FIXED_DT;
  const steer = Math.max(-1, Math.min(1, (input && input.steer) || 0));

  s.t += dt;

  // Boost fire
  if (input && input.fire && s.boost >= 0.25) {
    s.boostBonus = cfg.boostPower * s.boost;
    s.boostT = cfg.boostTime;
    events.push({ type: 'boost', amount: s.boost, bonus: s.boostBonus });
    s.boost = 0;
  }
  if (s.boostT > 0) {
    s.boostT -= dt;
    if (s.boostT <= 0) { s.boostT = 0; s.boostBonus = 0; }
  }

  // Forward speed: ease toward target, which grows slowly with progress
  const prog = Math.min(1, s.z / Math.max(1, course.length));
  const target = cfg.baseSpeed + (cfg.maxSpeed - cfg.baseSpeed) * prog + s.boostBonus;
  const dv = target - s.speed;
  const step = cfg.accel * dt * (s.boostT > 0 ? 4 : 1);
  s.speed += Math.abs(dv) <= step ? dv : Math.sign(dv) * step;

  // Lateral
  s.vx += steer * cfg.steerAccel * dt;
  s.vx -= s.vx * cfg.steerDamp * dt;

  // Course edge: hard slowdown and push back
  const cx = course.centerX(s.z);
  const hw = course.halfWidth(s.z);
  const off = s.x - cx;
  if (Math.abs(off) > hw) {
    const sgn = off > 0 ? 1 : -1;
    s.vx -= sgn * 90 * dt;
    if (s.vx * sgn > 0) s.vx *= 0.8;
    s.speed = Math.max(cfg.baseSpeed * 0.3, s.speed * Math.exp(-3 * dt));
  }
  s.vx = Math.max(-cfg.maxLateral, Math.min(cfg.maxLateral, s.vx));

  const prevZ = s.z;
  s.x += s.vx * dt;
  s.z += s.speed * dt;
  s.y = course.height(s.x, s.z) + HOVER;
  s.heading = Math.atan2(s.vx, Math.max(1, s.speed));

  // Rocks: crash on touch, charge when close
  if (s.z > s._rz1 - ROCK_REFRESH || s.z < s._rz0) refreshRocks(s, course);
  let near = false;
  const rocks = s._rocks;
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    const dz = r.z - s.z;
    const reach = r.r + SLED_R + cfg.chargeRange;
    if (dz > reach || dz < -reach) continue;
    const dx = r.x - s.x;
    const d = Math.sqrt(dx * dx + dz * dz) - r.r - SLED_R;
    if (d <= 0) {
      s.crashed = true;
      s.charging = false;
      events.push({ type: 'crash', z: s.z, x: s.x, rockId: r.id });
      return events;
    }
    if (d <= cfg.chargeRange) near = true;
  }
  s.charging = near;
  if (near) s.boost = Math.min(1, s.boost + cfg.chargeRate * dt);

  // Gates
  findGate(s, course);
  const g = s._gate;
  if (g && prevZ < g.z && s.z >= g.z) {
    if (Math.abs(s.x - g.x) <= g.width / 2) {
      s.gatesPassed++;
      events.push({ type: 'gate', id: g.id, z: g.z, x: s.x });
    } else {
      s.gatesMissed++;
      s.t += cfg.missPenalty;
      events.push({ type: 'miss', id: g.id, z: g.z, x: s.x, penalty: cfg.missPenalty });
    }
    s.nextGate = g.id + 1;
    s._gate = null;
  }

  // Finish
  if (s.z >= course.length) {
    s.finished = true;
    s.charging = false;
    events.push({ type: 'finish', t: s.t, z: s.z });
  }
  return events;
}
