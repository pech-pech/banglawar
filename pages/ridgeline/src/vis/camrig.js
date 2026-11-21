// B4 M8 camrig: spring-follow chase camera. Cosmetic only; reads the vs snapshot and camera, never the sim.
// At rest (speed <= baseSpeed, no events) it reproduces render.js draw(): pos (camX, y+camHeight, z-camBack),
// lookAt (x*0.85+camX*0.15, groundY(x, z+16)-1, z+16), fov 58 landscape / 68 portrait.
export const KEYS = {
  lookCamFollow: { def: 6, min: 1, max: 20, step: 0.5, label: 'Cam follow (1/s)' },
  lookCamFov: { def: 12, min: 0, max: 25, step: 0.5, label: 'Cam FOV widen (deg)' },
  lookCamFovCap: { def: 54, min: 30, max: 80, step: 1, label: 'Cam FOV cap speed (m/s)' },
  lookCamBoostFov: { def: 5, min: 0, max: 12, step: 0.5, label: 'Cam boost FOV (deg)' },
  lookCamDip: { def: 0.05, min: 0, max: 0.3, step: 0.01, label: 'Cam land dip (m per impact)' },
  lookCamShake: { def: 3, min: 0, max: 4, step: 0.25, label: 'Cam slam shake (px)' },
  lookCamRoll: { def: 0.05, min: 0, max: 0.15, step: 0.01, label: 'Cam roll (rad max)' },
  lookCamSlam: { def: 8, min: 2, max: 30, step: 0.5, label: 'Cam slam impact threshold' },
  lookCamOrbit: { def: 0.3, min: 0, max: 1, step: 0.05, label: 'Cam tumble orbit (rad/s)' },
  lookCamPull: { def: 1.7, min: 1, max: 3, step: 0.1, label: 'Cam end pull-back (x)' },
  lookCamRaise: { def: 3.5, min: 0, max: 10, step: 0.5, label: 'Cam end raise (m)' },
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

// Pure helpers, exported for tests.
export function fovFor(speed, aspect, boosting, cfg) {
  const g = (k) => (cfg && cfg[k] !== undefined ? cfg[k] : KEYS[k].def);
  const base = aspect < 1 ? 68 : 58;
  const b = cfg && cfg.baseSpeed !== undefined ? cfg.baseSpeed : 30;
  const cap = g('lookCamFovCap');
  const k = clamp((Math.min(speed, cap) - b) / Math.max(1, cap - b), 0, 1);
  return base + g('lookCamFov') * k + (boosting ? g('lookCamBoostFov') : 0);
}
export function followAlpha(rate, dt) { return 1 - Math.exp(-rate * dt); }

export function createCamRig(ctx) {
  const THREE = ctx.THREE;
  const cfg = () => ctx.cfg || {};
  const g = (k) => { const v = cfg()[k]; return v === undefined ? KEYS[k].def : v; };
  const reducedOf = (vs) => cfg().lookReducedMotion === 1 || !!(vs && vs.reduced);
  const _look = new THREE.Vector3();
  const _pos = new THREE.Vector3();

  const S = {
    camX: 0, tx: 0, ty: 0, tz: 0, init: false, fov: 58, dipY: 0, dipV: 0,
    roll: 0, shakeAmp: 0, shakeT: 0, shakePh: 0, orbit: 0, orbitW: 0, focusW: 0, hasT: false, endW: 0, ending: false, tumbling: false,
  };
  const cameraStats = { shake: 0, orbitW: 0, endW: 0, dip: 0, fov: 58 };

  function reset() {
    S.init = false; S.roll = 0; S.dipY = 0; S.dipV = 0; S.shakeAmp = 0; S.shakeT = 0;
    S.orbit = 0; S.orbitW = 0; S.focusW = 0; S.hasT = false; S.endW = 0; S.ending = false; S.tumbling = false;
  }

  function fx(ev) {
    if (!ev) return;
    switch (ev.type) {
      case 'land': {
        const imp = ev.impact || 0;
        S.dipV -= imp * g('lookCamDip') * 8; // kick velocity, spring brings it back
        if (imp >= g('lookCamSlam')) {
          S.shakeAmp = clamp((2 + 2 * clamp((imp - g('lookCamSlam')) / g('lookCamSlam'), 0, 1)) * g('lookCamShake') / 3, 0, 4); // 2..4 px at default, 0 = off
          S.shakeT = 0; S.shakePh = ctx.crng() * TAU;
        }
        break;
      }
      case 'tumble_start': S.tumbling = true; break;
      case 'tumble_rest': S.tumbling = false; break;
      case 'recover_start': case 'recover_end': S.tumbling = false; S.hasT = false; break; // sled moves on: stale tumble point must not be refocused
      case 'caught': case 'run_over': S.ending = true; break;
      case 'run_start': reset(); break;
      default: break;
    }
  }

  function update(dt, vs, camera) {
    dt = clamp(dt || 0, 0, 0.1);
    const reduced = reducedOf(vs);
    const camBack = cfg().camBack !== undefined ? cfg().camBack : 11.5;
    const camHeight = cfg().camHeight !== undefined ? cfg().camHeight : 6.5;
    if (!S.init) { S.camX = vs.x; S.tx = vs.x; S.ty = vs.y; S.tz = vs.z; S.fov = fovFor(vs.speed, camera.aspect, vs.boostT > 0, cfg()); S.init = true; }

    // lateral follow: exponential spring (0.12 per 60 Hz frame ~ rate 7.7/s at the old default)
    S.camX += (vs.x - S.camX) * followAlpha(g('lookCamFollow') * 1.28, dt);

    // land dip: damped spring on a vertical offset (zero in reduced motion)
    const kS = 140, cS = 18, nSub = Math.ceil(dt * 120) || 1, h = dt / nSub; // fixed-size substeps: dt-independent
    for (let i = 0; i < nSub; i++) { S.dipV += (-kS * S.dipY - cS * S.dipV) * h; S.dipY += S.dipV * h; }
    if (reduced) { S.dipY = 0; S.dipV = 0; }

    // tumble orbit weight and angle
    const tp = vs.tumbleP || null;
    if (vs.tumbleP !== undefined) S.tumbling = !!tp; // snapshot wins over events when it carries tumbleP
    if (tp) { S.tx = tp.x; S.ty = tp.y; S.tz = tp.z; S.hasT = true; } // keep last for the fade-out and the end pose
    else if (S.tumbling) { S.tx = vs.x; S.ty = vs.y; S.tz = vs.z; S.hasT = true; } // event-driven tumble with no body point
    S.orbitW += ((S.tumbling ? 1 : 0) - S.orbitW) * followAlpha(3, dt);
    // focus weight: the sled rests where the tumble body stopped (not at vs.x), so the end pose keeps focusing it
    S.focusW += (((S.tumbling || (S.ending && S.hasT)) ? 1 : 0) - S.focusW) * followAlpha(3, dt);
    if (S.tumbling && !reduced) S.orbit += g('lookCamOrbit') * dt;
    else S.orbit *= 1 - followAlpha(2, dt);
    const theta = Math.sin(S.orbit) * 0.9 * S.orbitW;

    // end pull-back: snaps in reduced motion
    if (reduced) S.endW = S.ending ? 1 : 0; else S.endW += ((S.ending ? 1 : 0) - S.endW) * followAlpha(2.2, dt);
    const back = camBack * (1 + (g('lookCamPull') - 1) * S.endW);
    const up = camHeight + g('lookCamRaise') * S.endW;

    // orbit focus: the tumbling body (vs.tumbleP) blended in by orbitW, else the sled
    const ow = S.focusW;
    const fx_ = vs.x + (S.tx - vs.x) * ow, fy_ = vs.y + (S.ty - vs.y) * ow, fz_ = vs.z + (S.tz - vs.z) * ow;
    const cx = S.camX * (1 - ow) + fx_ * ow + Math.sin(theta) * back * 0.9; // tumble/end: directly behind the sled, no follow lag
    const cz = fz_ - Math.cos(theta) * back;
    let cy = fy_ + up + S.dipY;
    if (ctx.groundY) { const floor = ctx.groundY(cx, cz) + 0.8; if (cy < floor) cy = floor; } // never under the terrain
    _pos.set(cx, cy, cz);
    camera.position.copy(_pos);

    // look target; end pose looks lower so the sled sits high in frame (above the end card).
    // In tumble/end the lead runs along the camera->sled line, so the sled stays horizontally centred whatever the orbit angle.
    const w = Math.max(ow, S.endW);
    const lead = 16 * (1 - 0.6 * w);
    let ux = 0, uz = 1;
    if (ow > 0) { const dx = fx_ - cx, dz = fz_ - cz, len = Math.hypot(dx, dz); if (len > 1e-3) { ux = dx / len; uz = dz / len; } }
    const lz = fz_ + lead * (uz * ow + (1 - ow));
    const lxT = fx_ + lead * ux * ow;
    const gy = ctx.groundY ? ctx.groundY(fx_, lz) : 0;
    const lx = ((fx_ * 0.85 + S.camX * 0.15) * (1 - w) + fx_ * w) * (1 - ow) + lxT * ow;
    const ly = (gy - 1.0) * (1 - w) + (fy_ - 7 * S.endW) * w;
    _look.set(lx, ly, lz);
    camera.lookAt(_look);

    // small roll into the turn (vs.roll, else steer); scaled by lookCamRoll, 0 in reduced motion
    const rollIn = typeof vs.roll === 'number' ? vs.roll : (vs.steer || 0) * 0.5;
    const rollT = reduced ? 0 : clamp(-rollIn, -1, 1) * g('lookCamRoll');
    S.roll += (rollT - S.roll) * followAlpha(5, dt);
    if (reduced) S.roll = 0;
    if (S.roll !== 0) camera.rotateZ(S.roll);

    // slam shake in screen pixels, converted to a small yaw/pitch
    let sh = 0;
    if (!reduced && S.shakeAmp > 0) {
      S.shakeT += dt;
      sh = S.shakeAmp * Math.exp(-S.shakeT / 0.12);
      if (sh < 0.02) { S.shakeAmp = 0; sh = 0; }
      const hpx = (ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.height) || 720;
      const rad = (camera.fov * Math.PI / 180) / hpx; // radians per pixel
      const ph = S.shakeT * 55 + S.shakePh;
      camera.rotateY(sh * rad * Math.sin(ph));
      camera.rotateX(sh * rad * Math.cos(ph * 1.3));
    } else if (reduced) S.shakeAmp = 0;

    // FOV (no change in reduced motion)
    const tgt = reduced ? (camera.aspect < 1 ? 68 : 58) : fovFor(vs.speed, camera.aspect, vs.boostT > 0, cfg());
    S.fov += (tgt - S.fov) * followAlpha(6, dt);
    if (Math.abs(camera.fov - S.fov) > 0.01) { camera.fov = S.fov; camera.updateProjectionMatrix(); }

    cameraStats.shake = sh; cameraStats.orbitW = S.orbitW; cameraStats.endW = S.endW; cameraStats.dip = S.dipY; cameraStats.fov = S.fov;
  }

  return {
    update, fx, reset,
    shift() { /* camera follows absolute vs positions; nothing stored */ },
    setQuality() {},
    stats: () => cameraStats,
    dispose() {},
  };
}
