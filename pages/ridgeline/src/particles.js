// Ridgeline ambient particles: one THREE.Points per theme, wrapped around the camera.
import * as THREE from '../vendor/three.module.js';

const BOX = { x: 40, y: 25, zBack: 15, zFwd: 45 }; // 40 x 25 x 60, biased ahead (+Z)

// kind -> { n, size, opacity, vel:[x,y,z], jitter, speedK (how much sled speed streaks them), colors }
const CFG = {
  snow:      { n: 400, size: 0.22, opacity: 0.9,  vel: [0.3, -1.6, 0],  jit: 0.5, wob: 0.6, vc: false },
  sprinkles: { n: 260, size: 0.28, opacity: 1.0,  vel: [0, -0.9, 0],    jit: 0.6, wob: 0.8, vc: true },
  spores:    { n: 160, size: 0.30, opacity: 0.7,  vel: [0, 0.25, 0],    jit: 0.3, wob: 0.5, vc: false },
  mist:      { n: 36,  size: 14,   opacity: 0.16, vel: [0.8, 0.05, 0],  jit: 0.4, wob: 0.2, vc: false },
  ink:       { n: 300, size: 0.20, opacity: 0.85, vel: [0, 1.6, 0],     jit: 0.5, wob: 0.3, vc: true },
  embers:    { n: 240, size: 0.20, opacity: 1.0,  vel: [0, 2.2, 0],     jit: 0.8, wob: 0.9, vc: true },
  sand:      { n: 400, size: 0.16, opacity: 0.7,  vel: [-26, -0.2, 0],  jit: 3.0, wob: 0.1, vc: false },
};

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSprite() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function reducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { return false; }
}

function noop() {
  return { object3D: new THREE.Group(), update() {}, setEnabled() {}, dispose() {} };
}

function paint(kind, base, i, rng, out) {
  const c = new THREE.Color(base);
  if (kind === 'sprinkles') {
    const hsl = {}; c.getHSL(hsl);
    c.setHSL((hsl.h + rng()) % 1, 0.75, 0.62);
  } else if (kind === 'ink') {
    const v = 0.02 + rng() * 0.18;
    c.setRGB(v, v, v * 1.2);
  } else if (kind === 'embers') {
    c.setHSL(0.04 + rng() * 0.08, 1, 0.5 + rng() * 0.15);
  }
  out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
}

export function createParticles(kind, colorHex = 0xffffff) {
  const cfg = CFG[kind];
  if (!cfg) return noop();

  const reduced = reducedMotion();
  const count = Math.max(1, Math.floor(cfg.n * (reduced ? 0.25 : 1)));
  const motion = reduced ? 0.3 : 1;
  const rng = makeRng(0x51d3 + kind.length * 977 + kind.charCodeAt(0));

  const pos = new Float32Array(count * 3);
  const col = cfg.vc ? new Float32Array(count * 3) : null;
  const vel = new Float32Array(count * 3);   // per-particle world velocity
  const phase = new Float32Array(count);
  const bias = kind === 'sand' ? 1 : 0;

  // Initial positions are relative to origin; first update() re-bases them around the camera.
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rng() - 0.5) * BOX.x;
    pos[i * 3 + 1] = (rng() - 0.5) * BOX.y;
    pos[i * 3 + 2] = -BOX.zBack + rng() * (BOX.zBack + BOX.zFwd);
    const k = 1 + (rng() - 0.5) * cfg.jit * (kind === 'sand' ? 0.3 : 1);
    vel[i * 3] = cfg.vel[0] * k + (rng() - 0.5) * cfg.jit;
    vel[i * 3 + 1] = cfg.vel[1] * k + (rng() - 0.5) * cfg.jit * 0.5;
    vel[i * 3 + 2] = cfg.vel[2] + (rng() - 0.5) * cfg.jit * 0.5;
    phase[i] = rng() * Math.PI * 2;
    if (col) paint(kind, colorHex, i, rng, col);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const tex = makeSprite();
  const mat = new THREE.PointsMaterial({
    size: cfg.size,
    sizeAttenuation: true,
    transparent: true,
    opacity: cfg.opacity,
    depthWrite: false,
    map: tex,
    vertexColors: !!col,
    color: col ? 0xffffff : colorHex,
    blending: kind === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;

  let enabled = true;
  let t = 0;
  let placed = false;
  const hx = BOX.x / 2, hy = BOX.y / 2;

  function update(camPos, dtSec, speed) {
    if (!enabled) return;
    const dt = Math.min(dtSec, 0.1);
    t += dt;
    const cx = camPos.x, cy = camPos.y, cz = camPos.z;
    if (!placed) {
      // Re-base the seeded box around the camera once.
      for (let i = 0; i < count; i++) {
        pos[i * 3] += cx; pos[i * 3 + 1] += cy; pos[i * 3 + 2] += cz;
      }
      placed = true;
    }
    const m = motion * dt;
    const wob = cfg.wob;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      const ph = phase[i];
      let x = pos[j] + (vel[j] + Math.sin(t * 1.3 + ph) * wob) * m;
      let y = pos[j + 1] + vel[j + 1] * m;
      let z = pos[j + 2] + (vel[j + 2] + Math.cos(t * 1.1 + ph) * wob * 0.5) * m;
      // wrap relative to camera so the field is endless and streaks past with speed
      let dx = x - cx, dy = y - cy, dz = z - cz;
      if (dx < -hx) dx += BOX.x; else if (dx > hx) dx -= BOX.x;
      if (dy < -hy) dy += BOX.y; else if (dy > hy) dy -= BOX.y;
      if (dz < -BOX.zBack) dz += BOX.zBack + BOX.zFwd; else if (dz > BOX.zFwd) dz -= BOX.zBack + BOX.zFwd;
      pos[j] = cx + dx; pos[j + 1] = cy + dy; pos[j + 2] = cz + dz;
    }
    geo.attributes.position.needsUpdate = true;
    void speed; void bias;
  }

  return {
    object3D: points,
    update,
    setEnabled(v) { enabled = !!v; points.visible = enabled; },
    dispose() {
      geo.dispose();
      mat.dispose();
      if (tex) tex.dispose();
    },
  };
}
