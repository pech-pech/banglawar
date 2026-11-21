// Ridgeline sled (B1 physics sled). Pure, deterministic, no THREE, no config import.
// Modes: ground (hover over the terrain, kinematic in JS), air (ballistic in JS), tumble (Rapier body via phys),
// recover (wreck hold, then back to ground). Rapier gives only the hover ray distance and the tumble body;
// slope, normal and curvature come from course.height (central differences), never from ray normals.
// Without a phys adapter (createSled(course)), ground distance is analytic and tumbles resolve instantly.
import { mulberry32 } from './rng.js';
import { baseSpeed, zoneAt, zoneWind, zoneSand } from './endless.js';

export const FIXED_DT = 1 / 120;

const SLED_R = 0.8;        // sled collision radius (m), 2D x/z
const START_SPEED = 12;
const GATE_LOOKAHEAD = 300;
const ROCK_BEHIND = 10;
const ROCK_AHEAD = 70;
const ROCK_REFRESH = 30;   // refresh when sled is within this of window end
const NORM_D = 1.0;        // central difference half-step for slope / normal (m)
const LOST_STEPS = 3;      // ground-lost steps before going to air
const RECOVER_SCAN = 30;   // m forward scan for a safe recover spot
const RECOVER_CLEAR = 3;   // m from any rock surface
const RECOVER_EDGE = 2.5;  // m inside the course edge
const ROLL_TAU = 0.15;     // visual lean follow (s)

// Endless rules apply only when asked for AND the course really is endless (finite courses keep B1 behaviour).
const endlessOn = (course, cfg) => !!cfg.endless && course.length === Infinity;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createSled(course, phys = null, rng = null) {
  const x = course.centerX(0);
  const y = course.height(x, 0);
  return {
    x, z: 0, y, vx: 0, vy: 0, speed: START_SPEED,
    mode: 'ground', grounded: true, pitch: 0, roll: 0, quat: null, bodyY: y,
    diving: false, tAir: 0, comp: 0,
    boost: 0, boostT: 0, t: 0,
    gatesPassed: 0, gatesMissed: 0, nextGate: 0,
    crashed: false, finished: false, charging: false,
    heading: 0, dist: 0, physZ: 0, zone: 0, lap: 0, _zoneKey: -1, _wind: 1,
    flow: 0, flowT: 0, flowWin: 0, grazeTier: '',
    links: 0, razors: 0, inners: 0, centred: 0, boostLinks: 0, flowPeak: 0, flow5T: 0,
    // B1 stats
    launches: 0, landings: 0, cleans: 0, roughs: 0, slams: 0, wrecks: 0, hops: 0, longestAir: 0,
    kick: 0, wobbleT: 0, graceT: 0, cleanT: -1e9, tumbleCause: '',
    // internals
    boostBonus: 0,
    _gate: null, _gateSearchZ: 0, _gatesDone: false,
    _rocks: [], _rz0: 0, _rz1: -1,
    _graze: new Map(),
    _phys: phys, _rng: rng || mulberry32(((course.seed >>> 0) ^ 0x51ed) >>> 0),
    _ks: 0, _hold: 0, _armed: true, _resetSeen: true, _touchT: -1e9, _lost: 0,
    _hov: 0, _hovV: 0,
    _dive: 0, _diveT: 0, _diveLock: false, _wasDiving: false,
    _crestKey: null, _paidKey: null,
    _tumT: 0, _restT: 0, _tumZ0: 0, _tumT0: 0, _holdT: 0, _holdLeft: 0, _wreckZ: 0, _wreckT: 0,
  };
}

// ---------- terrain sampling (terrain function only) ----------
function headingDir(s) {
  const sp = Math.max(1, s.speed);
  const l = Math.hypot(s.vx, sp);
  return [s.vx / l, sp / l];
}
// Slope along the heading (dh/ds), central difference 1 m.
function slopeAlong(course, x, z, hx, hz) {
  return (course.height(x + hx * NORM_D, z + hz * NORM_D) - course.height(x - hx * NORM_D, z - hz * NORM_D)) / (2 * NORM_D);
}
// Signed curvature along the heading (concave positive).
function curvAlong(course, x, z, hx, hz, d, sl) {
  const h0 = course.height(x, z);
  const k = (course.height(x + hx * d, z + hz * d) - 2 * h0 + course.height(x - hx * d, z - hz * d)) / (d * d);
  return k / Math.pow(1 + sl * sl, 1.5);
}
function normalAt(course, x, z) {
  const sx = (course.height(x + NORM_D, z) - course.height(x - NORM_D, z)) / (2 * NORM_D);
  const sz = (course.height(x, z + NORM_D) - course.height(x, z - NORM_D)) / (2 * NORM_D);
  const l = Math.sqrt(1 + sx * sx + sz * sz);
  return { x: -sx / l, y: 1 / l, z: -sz / l };
}
// Hover distance: Rapier ray when a phys adapter is present, analytic otherwise.
function groundDist(s, course, cfg, x, yo, z) {
  if (s._phys) return s._phys.groundDist(x, yo, z);
  const d = yo - course.height(x, z);
  return d >= 0 && d <= cfg.hoverRayLen ? d : Infinity;
}

function quatFrom(yaw, pitch, roll) {
  // q = qy(yaw) * qx(-pitch) * qz(roll); pitch positive = nose up, yaw rotates +z toward +x.
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  const cp = Math.cos(-pitch / 2), sp = Math.sin(-pitch / 2);
  const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
  // qy * qx
  const ax = cy * sp, ay = sy * cp, az = -sy * sp, aw = cy * cp;
  // (qy*qx) * qz
  return {
    x: ax * cr + ay * sr,
    y: ay * cr - ax * sr,
    z: aw * sr + az * cr,
    w: aw * cr - az * sr,
  };
}

// ---------- rocks, gates, flow (unchanged rules) ----------
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
  if (course.length !== Infinity && s.z + GATE_LOOKAHEAD >= course.length) s._gatesDone = true;
  else s._gateSearchZ = s.z + GATE_LOOKAHEAD - 1;
}

function flowWindow(cfg, level) {
  return cfg.flowWindow1 + (cfg.flowWindow5 - cfg.flowWindow1) * (level - 1) / 4;
}

// One flow link: +1 level (cap 5) and refresh the window.
function addLink(s, cfg, events, cap = 5) {
  if (s.flow >= cap) return; // capped source pays nothing
  s.links++;
  if (s.flow < 5) {
    s.flow++;
    events.push({ type: 'flowUp', level: s.flow });
    if (s.flow > s.flowPeak) s.flowPeak = s.flow;
  }
  s.flowWin = flowWindow(cfg, s.flow);
  s.flowT = s.flowWin;
}

function setFlow(s, cfg, events, level) {
  level = Math.max(0, level);
  if (level >= s.flow) return;
  s.flow = level;
  events.push({ type: 'flowDrop', level });
  if (level > 0) { s.flowWin = flowWindow(cfg, level); s.flowT = s.flowWin; } else { s.flowT = 0; s.flowWin = 0; }
}

function baseTarget(s, course, cfg) {
  if (endlessOn(course, cfg)) return baseSpeed(Math.max(0, s.dist), cfg); // flow-0 base by distance (max z)
  const prog = Math.min(1, Math.max(0, s.z) / Math.max(1, course.length));
  return cfg.baseSpeed + (cfg.maxSpeed - cfg.baseSpeed) * prog;
}

// Wind blows one way per flight, chosen deterministically from the launching feature id.
function windSign(id) { return (Math.imul(id | 0, 2654435761) >>> 16) & 1 ? 1 : -1; }

// ---------- mode changes ----------
function launch(s, course, cfg, events) {
  if (s.speed > cfg.launchVCap) {
    const f = cfg.launchVCap / s.speed;
    s.speed = cfg.launchVCap; s.vy *= f;
  }
  const crest = course.crestAt ? course.crestAt(s.z) : null;
  s.mode = 'air'; s.grounded = false; s.tAir = 0;
  s._dive = 0; s._diveT = 0; s._wasDiving = false; s.diving = false;
  s._lost = 0; s._hold = 0; s._hov = 0; s._hovV = 0; s.comp = 0;
  s._crestKey = crest ? 'c' + crest.id : 'l' + s.launches;
  s._wind = windSign(crest ? crest.id : s.launches);
  s.launches++;
  events.push({
    type: 'launch', speed: s.speed, crestId: crest ? crest.id : null,
    lipPos: { x: s.x, y: s.y, z: crest && crest.lipZ != null ? crest.lipZ : s.z },
  });
}

function goAir(s) { // ground lost: air without a launch event
  s.mode = 'air'; s.grounded = false; s.tAir = 0;
  s._dive = 0; s._diveT = 0; s._wasDiving = false; s.diving = false;
  s._lost = 0; s._hold = 0; s._hov = 0; s._hovV = 0; s.comp = 0;
  s._lostN = (s._lostN || 0) + 1;
  s._crestKey = 'g' + s._lostN;
  s._wind = windSign(1000 + s._lostN);
}

function startTumble(s, course, cfg, cause, events, rock) {
  const rng = s._rng;
  const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(); // always 4 draws, fixed order
  const spin = cfg.tumbleSpin;
  const w = { x: spin * (0.4 + 0.6 * r1), y: spin * 0.4 * (2 * r3 - 1), z: spin * 0.8 * (2 * r2 - 1) };
  const pop = cfg.tumblePop * (0.5 + r4);
  const c = cfg.tumbleCarry;
  const v = { x: s.vx * c, y: s.vy * c + pop, z: s.speed * c };
  if (rock) v.x += (s.x >= rock.x ? 1 : -1) * cfg.tumbleRockKick;
  const vm = Math.hypot(v.x, v.y, v.z);
  if (vm > cfg.tumbleMaxSpeed) { const f = cfg.tumbleMaxSpeed / vm; v.x *= f; v.y *= f; v.z *= f; }
  const h = course.height(s.x, s.z);
  const p = { x: s.x, y: Math.max(s.y, h) + cfg.hoverHeight, z: s.z };
  const q = quatFrom(s.heading, s.pitch, s.roll);
  s.mode = 'tumble'; s.grounded = false; s.diving = false; s._dive = 0; s.charging = false; s.grazeTier = '';
  s.tumbleCause = cause; s._tumT = 0; s._restT = 0; s._tumZ0 = s.z; s._tumT0 = s.t;
  s.quat = q; s.bodyY = p.y; s.comp = 0;
  events.push({ type: 'tumble_start', cause });
  if (cause === 'rock') events.push({ type: 'crash', z: s.z, x: s.x, rockId: rock ? rock.id : -1 });
  if (cause === 'wreck') {
    s.wrecks++;
    s._wreckZ = s.z; s._wreckT = s.t;
    events.push({ type: 'recover_start' });
    setFlow(s, cfg, events, 0);
    s.boost = 0; s.boostT = 0; s.boostBonus = 0; s.kick = 0; s.wobbleT = 0;
  }
  if (s._phys) s._phys.startTumble(p, q, v, w);
  else endTumble(s, course, cfg, events); // no physics adapter: the tumble resolves at once
}

function endTumble(s, course, cfg, events) {
  events.push({ type: 'tumble_rest', dist: s.z - s._tumZ0 });
  if (s._phys) s._phys.endTumble();
  if (s.tumbleCause === 'rock') {
    s.crashed = true; s.charging = false;
    return;
  }
  // Wreck: put back on course, hold so the total time lost is about recoverLostT.
  const spot = recoverSpot(s, course);
  s.x = spot.x; s.z = spot.z; s.y = course.height(s.x, s.z); s.bodyY = s.y + cfg.hoverHeight;
  s.vx = 0; s.vy = 0; s.speed = 0; s.quat = null; s.roll = 0; s.heading = 0;
  s.pitch = Math.atan(slopeAlong(course, s.x, s.z, 0, 1));
  s.mode = 'recover'; s.grounded = true; s.tAir = 0;
  s.boost = 0; s.boostT = 0; s.boostBonus = 0; s.kick = 0;
  setFlow(s, cfg, events, 0);
  const vref = baseTarget(s, course, cfg);
  const lostSoFar = (s.t - s._wreckT) - (s.z - s._wreckZ) / Math.max(1, vref);
  const accelLoss = (1 - cfg.recoverSpeedMul) / Math.max(0.1, cfg.easeK);
  s._holdLeft = clamp(cfg.recoverLostT - lostSoFar - accelLoss, 0.4, cfg.recoverLostT); // 05 sec 5 caps at 2.0; B1 widens so the total stays ~recoverLostT
  s._holdT = 0;
  // gates the tumble or the placement carried us past are skipped (no pass, no miss)
  for (let i = 0; i < 64; i++) {
    findGate(s, course);
    const g = s._gate;
    if (g && g.z <= s.z) { s.nextGate = g.id + 1; s._gate = null; } else break;
  }
  refreshRocks(s, course);
}

function recoverSpot(s, course) {
  const z0 = s.z;
  const rocks = course.rocksInRange(z0 - 8, z0 + RECOVER_SCAN + 8);
  for (let dz = 0; dz <= RECOVER_SCAN; dz += 1) {
    const z = z0 + dz;
    const cx = course.centerX(z), room = Math.max(0, course.halfWidth(z) - RECOVER_EDGE);
    const x = clamp(s.x, cx - room, cx + room);
    let ok = Math.abs(slopeAlong(course, x, z, 0, 1)) < 0.5;
    for (let i = 0; ok && i < rocks.length; i++) {
      const r = rocks[i];
      if (Math.hypot(r.x - x, r.z - z) - r.r < RECOVER_CLEAR + SLED_R) ok = false;
    }
    if (ok) return { x, z };
  }
  return { x: course.safeX ? course.safeX(z0) : course.centerX(z0), z: z0 };
}

// ---------- the step ----------
export function stepSled(s, course, input, cfg) {
  const events = [];
  if (!(s.crashed || s.finished)) core(s, course, input, cfg, events);
  if (s._phys) {
    s._phys.step();
    if (s.mode === 'tumble' && !s.crashed) readTumble(s, course, cfg, events);
  }
  // physZ: absolute z the physics world must stream for (tumble body while tumbling, else the sled)
  const ts = s.mode === 'tumble' && s._phys && s._phys.tumbleState ? s._phys.tumbleState() : null;
  s.physZ = ts ? ts.p.z : s.z;
  return events;
}

function readTumble(s, course, cfg, events) {
  const st = s._phys.tumbleState();
  const dt = FIXED_DT;
  if (st) {
    s.x = st.p.x; s.z = st.p.z; s.bodyY = st.p.y; s.y = st.p.y - cfg.hoverHeight;
    s.quat = { x: st.q.x, y: st.q.y, z: st.q.z, w: st.q.w };
    s.vx = st.v.x; s.vy = st.v.y; s.speed = st.v.z;
    const lin = Math.hypot(st.v.x, st.v.y, st.v.z), ang = Math.hypot(st.w.x, st.w.y, st.w.z);
    s._restT = lin < cfg.tumbleRestSpeed && ang < cfg.tumbleRestSpeed ? s._restT + dt : 0;
  }
  s._tumT += dt;
  const maxT = Math.min(cfg.tumbleMaxTime, s.tumbleCause === 'rock' ? cfg.rockEndTime : cfg.recoverTumbleMax);
  const rested = s._tumT >= cfg.tumbleMinTime && s._restT >= cfg.tumbleRestTime;
  if (!st || rested || s._tumT >= maxT - 1e-9) endTumble(s, course, cfg, events);
}

function core(s, course, input, cfg, events) {
  const dt = FIXED_DT;
  const steerIn = clamp((input && input.steer) || 0, -1, 1);
  const fire = !!(input && input.fire);
  const down = !input || input.down === undefined ? true : !!input.down;

  if (s.mode === 'tumble') {
    if (s.tumbleCause !== 'rock') s.t += dt; // rock: time frozen at contact
    flowDecay(s, cfg, events, dt);
    return;
  }
  s.t += dt;
  if (s.kick > 0) s.kick = Math.max(0, s.kick - cfg.landKickDecay * dt);
  if (s.wobbleT > 0) s.wobbleT = Math.max(0, s.wobbleT - dt);

  if (s.mode === 'recover') {
    s._holdT += dt;
    if (s._holdT >= s._holdLeft) {
      s.mode = 'ground'; s.grounded = true;
      s.speed = cfg.recoverSpeedMul * baseTarget(s, course, cfg);
      s.graceT = cfg.recoverGrace;
      s._armed = false; s._resetSeen = false; s._touchT = s.t; s._ks = 0; s._hold = 0;
      events.push({ type: 'recover_end', speed: s.speed });
    }
    flowDecay(s, cfg, events, dt);
    return;
  }
  if (s.graceT > 0) s.graceT = Math.max(0, s.graceT - dt);
  if (down) s._diveLock = false;

  // Boost fire: ground, or air within the coyote window (then no dive from this lift). Blocked in slam wobble.
  const air = s.mode === 'air';
  if (fire && s.boost >= cfg.boostMinCharge && s.wobbleT <= 0 && (!air || s.tAir <= cfg.boostCoyote)) {
    const mul = s.t - s.cleanT <= cfg.boostCleanWindow ? cfg.boostCleanMul : 1;
    s.boostBonus = cfg.boostPower * s.boost * mul;
    s.boostT = cfg.boostTime;
    events.push({ type: 'boost', amount: s.boost, bonus: s.boostBonus });
    if (s.boost >= cfg.flowBoostMin) { s.boostLinks++; addLink(s, cfg, events); }
    s.boost = 0;
    if (air) s._diveLock = true;
  }
  if (s.boostT > 0) {
    s.boostT -= dt;
    if (s.boostT <= 0) { s.boostT = 0; s.boostBonus = 0; }
  }

  const prevZ = s.z;
  const wob = s.wobbleT > 0 ? 0.5 : 1;
  const target = Math.min(cfg.speedHardCap, baseTarget(s, course, cfg) * (1 + cfg.flowStep * s.flow) + s.boostBonus + s.kick);

  if (s.mode === 'ground') {
    const [hx, hz] = headingDir(s);
    const sl = slopeAlong(course, s.x, s.z, hx, hz);
    const sinTh = -sl / Math.sqrt(1 + sl * sl);
    const sinTh0 = cfg.slope / Math.sqrt(1 + cfg.slope * cfg.slope);
    const ek = cfg.easeK * (s.boostT > 0 ? cfg.boostEaseMul : 1) * wob;
    const a = ek * (target - s.speed) + cfg.slopeGravityMul * 9.8 * (sinTh - sinTh0);
    s.speed = clamp(s.speed + a * dt, 1, cfg.speedHardCap);
    if (endlessOn(course, cfg) && cfg.sandDrag > 0) { // zone sand drag: ground on bowl floors and gap pits only
      const sd = zoneSand(s.z, cfg);
      if (sd > 0) {
        const f = course.featureAt ? course.featureAt(s.z) : null;
        if (f && (f.type === 'bowl' || f.type === 'gap')) s.speed = Math.max(1, s.speed * (1 - sd * dt));
      }
    }
    s.vx += steerIn * cfg.steerAccel * wob * dt;
    s.vx -= s.vx * cfg.steerDamp * dt;
  } else {
    // AIR: gravity (+dive), quadratic drag, weak steer
    s.tAir += dt;
    const diveWant = !down && !s._diveLock && s.tAir >= cfg.diveDelay;
    const rate = dt / Math.max(1e-3, cfg.diveRamp);
    s._dive = diveWant ? Math.min(1, s._dive + rate) : Math.max(0, s._dive - rate);
    if (diveWant !== s._wasDiving) {
      events.push({ type: diveWant ? 'dive_start' : 'dive_end' });
      s._wasDiving = diveWant;
    }
    s.diving = diveWant;
    if (diveWant) s._diveT += dt;
    const g = cfg.airGravity * (1 + cfg.diveGravityMul * s._dive);
    const vm = Math.hypot(s.vx, s.vy, s.speed);
    s.vy += (-g - cfg.airDrag * vm * s.vy) * dt;
    s.speed += -cfg.airDrag * vm * s.speed * dt;
    s.vx += steerIn * cfg.steerAccel * cfg.airSteerMul * dt;
    if (endlessOn(course, cfg)) s.vx += s._wind * zoneWind(s.z, cfg) * dt; // zone wind, airborne lateral push
    s.vx -= s.vx * cfg.steerDamp * cfg.airSteerDampMul * dt;
  }

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
  s.vx = clamp(s.vx, -cfg.maxLateral, cfg.maxLateral);

  const prevY = s.y;
  s.x += s.vx * dt;
  s.z += s.speed * dt;
  if (s.z > s.dist) s.dist = s.z;
  s.heading = Math.atan2(s.vx, Math.max(1, s.speed));
  s.roll += (clamp(-s.vx * 0.035, -0.6, 0.6) - s.roll) * Math.min(1, dt / ROLL_TAU);

  if (s.mode === 'ground') groundAfterMove(s, course, cfg, events, prevY, dt);
  else airAfterMove(s, course, cfg, events, dt);
  if (s.mode === 'tumble') return; // wreck landing

  // zone crossing
  if (endlessOn(course, cfg)) {
    const zi = course.zoneAt ? course.zoneAt(s.z) : zoneAt(s.z, cfg);
    const key = zi.lap * 8 + zi.zone;
    if (s._zoneKey < 0) { s._zoneKey = key; s.zone = zi.zone; s.lap = zi.lap; }
    else if (key !== s._zoneKey) {
      s._zoneKey = key; s.zone = zi.zone; s.lap = zi.lap;
      events.push({ type: 'zone_enter', zone: zi.zone, lap: zi.lap });
    }
  }

  // Knockable props (set by main): clip, loss, events
  if (s._props) {
    const pe = s._props.clip(s);
    if (pe && pe.length) for (let i = 0; i < pe.length; i++) events.push(pe[i]);
    if (s._props.lastLoss > 0) s.speed *= 1 - s._props.lastLoss;
  }

  if (!s.grounded && s.tAir > s.longestAir) s.longestAir = s.tAir;

  // Rocks (2D x/z): only while grounded or below the rock top in the air; none during recover grace
  if (s.z > s._rz1 - ROCK_REFRESH || s.z < s._rz0) refreshRocks(s, course);
  const outerR = Math.max(cfg.chargeRange, cfg.grazeInner);
  let tier = 0; // 0 none, 1 outer, 2 inner, 3 razor
  const rocks = s.graceT > 0 ? [] : s._rocks;
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    const dz = r.z - s.z;
    const reach = r.r + SLED_R + outerR;
    if (dz > reach || dz < -reach) continue;
    const dx = r.x - s.x;
    const d = Math.sqrt(dx * dx + dz * dz) - r.r - SLED_R;
    if (d > outerR) continue;
    if (!s.grounded && s.y >= course.height(r.x, r.z) + r.r) continue; // flying over it
    if (d <= 0) {
      startTumble(s, course, cfg, 'rock', events, r);
      return;
    }
    let t = 1;
    if (d <= cfg.grazeRazor) t = 3;
    else if (d <= cfg.grazeInner) t = 2;
    if (t > tier) tier = t;
    if (t >= 2) {
      const paid = s._graze.get(r.id) || 0;
      if (t === 3 && paid < 2) {
        s._graze.set(r.id, 2);
        s.razors++;
        events.push({ type: 'graze', tier: 'razor', rockId: r.id, x: s.x, z: s.z });
        for (let k = paid; k < 2; k++) addLink(s, cfg, events);
      } else if (t === 2 && paid < 1) {
        s._graze.set(r.id, 1);
        s.inners++;
        events.push({ type: 'graze', tier: 'inner', rockId: r.id, x: s.x, z: s.z });
        addLink(s, cfg, events);
      }
    }
  }
  s.charging = tier > 0 && s.grounded;
  s.grazeTier = tier === 3 ? 'razor' : tier === 2 ? 'inner' : tier === 1 ? 'outer' : '';
  if (s.charging) { // no charge in air
    const mul = tier === 3 ? cfg.grazeRazorMul : tier === 2 ? cfg.grazeInnerMul : cfg.grazeOuterMul;
    s.boost = Math.min(1, s.boost + cfg.chargeRate * mul * dt);
  }

  // Gates (2D x/z)
  findGate(s, course);
  const g = s._gate;
  if (g && prevZ < g.z && s.z >= g.z) {
    if (Math.abs(s.x - g.x) <= g.width / 2) {
      s.gatesPassed++;
      const centred = Math.abs(s.x - g.x) <= g.width * cfg.gateCentreFrac;
      events.push({ type: 'gate', id: g.id, z: g.z, x: s.x, centred });
      if (centred) { s.centred++; addLink(s, cfg, events, cfg.flowGateCap); }
    } else {
      s.gatesMissed++;
      s.t += cfg.missPenalty;
      events.push({ type: 'miss', id: g.id, z: g.z, x: s.x, penalty: cfg.missPenalty });
      if (s.flow > 0) {
        s.flow = 0; s.flowT = 0; s.flowWin = 0;
        events.push({ type: 'flowDrop', level: 0 });
      }
    }
    s.nextGate = g.id + 1;
    s._gate = null;
  }

  flowDecay(s, cfg, events, dt);

  // Finish
  if (s.z >= course.length && course.length !== Infinity) {
    s.finished = true;
    s.charging = false;
    events.push({ type: 'finish', t: s.t, z: s.z });
  }
}

function flowDecay(s, cfg, events, dt) {
  if (s.flow > 0) {
    if (s.flow === 5) s.flow5T += dt;
    s.flowT -= dt;
    if (s.flowT <= 0) {
      s.flow--;
      events.push({ type: 'flowDrop', level: s.flow });
      if (s.flow > 0) { s.flowWin = flowWindow(cfg, s.flow); s.flowT = s.flowWin; }
      else { s.flowT = 0; s.flowWin = 0; }
    }
  }
}

function groundAfterMove(s, course, cfg, events, prevY, dt) {
  const h = course.height(s.x, s.z);
  const [hx, hz] = headingDir(s);
  const sl = slopeAlong(course, s.x, s.z, hx, hz);
  const k = curvAlong(course, s.x, s.z, hx, hz, cfg.curvSample, sl);
  s.y = h;
  s.vy = (h - prevY) / dt;
  s.pitch = Math.atan(sl);
  s.tAir = 0;

  // Hover trim (visual compression): spring around hoverHeight, forced by path curvature. Never moves the ride base.
  const vt2 = (s.speed * s.speed + s.vx * s.vx) * (1 + sl * sl);
  const ha = clamp(-cfg.hoverSpring * s._hov - cfg.hoverDamp * s._hovV - vt2 * k, -cfg.hoverMaxAccel, cfg.hoverMaxAccel);
  s._hovV += ha * dt;
  s._hov = clamp(s._hov + s._hovV * dt, -0.9 * cfg.hoverHeight, cfg.hoverHeight);
  s.comp = clamp(-s._hov / cfg.hoverHeight, 0, 1);
  s.bodyY = h + cfg.hoverHeight + s._hov;

  // Ground lost (ray miss or too far): air without a launch event
  const d = groundDist(s, course, cfg, s.x, s.bodyY, s.z);
  if (d > cfg.hoverHeight + s._hov + cfg.groundLostDist || d === Infinity) {
    if (++s._lost >= LOST_STEPS) { goAir(s); return; }
  } else s._lost = 0;

  // Launch: smoothed convex curvature ratio with hold, lock and reset band
  const kc = Math.max(0, -k);
  s._ks = cfg.launchSmooth > 0 ? s._ks + (kc - s._ks) * (1 - Math.exp(-dt / cfg.launchSmooth)) : kc;
  const cosTh = 1 / Math.sqrt(1 + sl * sl);
  const R = s.speed * s.speed * (1 + sl * sl) * s._ks / (9.8 * cosTh);
  const ratio = Math.max(cfg.launchRatio, cfg.airGravity / 9.8 * 1.05);
  s.launchR = R;
  if (!s._armed) {
    if (R < ratio * cfg.relaunchReset) s._resetSeen = true;
    if (s._resetSeen && s.t - s._touchT >= cfg.relaunchLock) s._armed = true;
  }
  if (s._armed && R > ratio) s._hold++; else s._hold = 0;
  if (s._hold >= cfg.launchHold) { s._hold = 0; s._armed = false; launch(s, course, cfg, events); }
}

function airAfterMove(s, course, cfg, events, dt) {
  s.y += s.vy * dt;
  // pitch follows the flight path (nose trim while diving)
  const trim = cfg.divePitch * s._dive;
  s.pitch += (Math.atan2(s.vy, Math.max(1, s.speed)) - trim - s.pitch) * Math.min(1, dt / cfg.pitchTau);
  s.bodyY = s.y + cfg.hoverHeight;
  events.push({ type: 'air', t: s.tAir, diving: s.diving });

  const h = course.height(s.x, s.z);
  const d = groundDist(s, course, cfg, s.x, s.bodyY, s.z);
  if (!(d <= cfg.hoverHeight) && s.y >= h) return;
  const n = normalAt(course, s.x, s.z);
  const vn = s.vx * n.x + s.vy * n.y + s.speed * n.z;
  if (s.tAir < cfg.touchGuard || (vn >= -0.5 && s.y >= h)) {
    if (s.y < h) { // never under the surface; slide along it
      s.y = h; s.bodyY = h + cfg.hoverHeight;
      if (vn < 0) { s.vx -= vn * n.x; s.vy -= vn * n.y; s.speed -= vn * n.z; }
    }
    return;
  }
  touchdown(s, course, cfg, events, n, vn, h);
}

function touchdown(s, course, cfg, events, n, vn, h) {
  const impact = Math.max(0, -vn);
  // read impact, then remove the normal velocity
  s.vx -= vn * n.x; s.vy -= vn * n.y; s.speed -= vn * n.z;
  s.vx = clamp(s.vx, -cfg.maxLateral, cfg.maxLateral);
  s.y = h; s.bodyY = h + cfg.hoverHeight;
  const [hx, hz] = headingDir(s);
  const sl = slopeAlong(course, s.x, s.z, hx, hz);
  const thg = Math.atan(sl);
  const slopeMatch = 1 - clamp(Math.abs(thg - s.pitch) / cfg.gradeMatchRange, 0, 1);
  const flight = s.tAir;
  const dived = s._diveT >= cfg.diveMinT;
  if (s._wasDiving) events.push({ type: 'dive_end' });
  s._wasDiving = false; s.diving = false; s._dive = 0;
  s.mode = 'ground'; s.grounded = true;
  s._ks = 0; s._hold = 0; s._armed = false; s._resetSeen = false; s._touchT = s.t; s._lost = 0;
  s._hov = 0; s._hovV = 0;
  s.pitch = thg;
  s.landings++;
  const point = { x: s.x, y: h, z: s.z };
  const normal = { x: n.x, y: n.y, z: n.z };
  if (flight < cfg.minFlight) {
    s.hops++;
    events.push({ type: 'land', grade: 'clean', hop: true, impact, slopeMatch, point, normal, flight, dive: false });
    s.tAir = 0;
    return;
  }
  const B = cfg.gradeWImpact * impact / cfg.gradeImpactRef + cfg.gradeWSlope * (1 - slopeMatch);
  let grade;
  if (impact >= cfg.gradeImpactWreck || B >= cfg.gradeSlam) grade = 'wreck';
  else if (B >= cfg.gradeRough) grade = 'slam';
  else if (B >= cfg.gradeClean) grade = 'rough';
  else grade = 'clean';
  events.push({ type: 'land', grade, hop: false, impact, slopeMatch, B, point, normal, flight, dive: dived });
  s.tAir = 0;
  const floor = cfg.speedFloor * cfg.baseSpeed;
  const lose = (f) => { s.speed = Math.max(s.speed * (1 - f), Math.min(s.speed, floor)); };
  if (grade === 'clean') {
    s.cleans++;
    s.cleanT = s.t;
    // kick and links: flight >= cleanLinkMinAir, once per crest
    if (flight >= cfg.cleanLinkMinAir && s._crestKey !== s._paidKey) {
      s._paidKey = s._crestKey;
      const kick = dived ? cfg.landKickDive : cfg.landKick;
      s.speed = Math.min(cfg.speedHardCap, s.speed + kick);
      s.kick = kick;
      if (dived) { addLink(s, cfg, events, cfg.flowDiveCap); addLink(s, cfg, events, cfg.flowDiveCap); }
      else addLink(s, cfg, events, cfg.flowLandCap);
      if (dived && flight >= cfg.flowLongAir && slopeMatch >= cfg.flowLongMatch) addLink(s, cfg, events, cfg.flowLongCap);
    }
  } else if (grade === 'rough') {
    s.roughs++;
    lose(cfg.roughLoss);
  } else if (grade === 'slam') {
    s.slams++;
    lose(cfg.slamLoss);
    setFlow(s, cfg, events, s.flow - cfg.slamFlowDrop);
    s.wobbleT = cfg.slamWobble;
  } else {
    startTumble(s, course, cfg, 'wreck', events, null);
  }
}
