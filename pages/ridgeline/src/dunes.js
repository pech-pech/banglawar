// Ridgeline dunes: authored feature shapes, seeded layout, plain-arithmetic sine. Pure, no THREE.
// Shapes: sections/05-endless.md sec 1. Across-slope w(x): sections/02-terrain-props.md sec 1.
import { mulberry32 } from './rng.js';

// ---- psin: sine without Math.sin/cos (range reduction + odd Taylor polynomial, |err| < 1e-8)
const TWO_PI_HI = 6.283185307179586;      // double nearest 2*pi
const TWO_PI_LO = 2.4492935982947064e-16; // 2*pi - TWO_PI_HI
const INV_2PI = 0.15915494309189535;
const HALF_PI = 1.5707963267948966;
const PI = 3.141592653589793;
export function psin(x) {
  const k = Math.round(x * INV_2PI);
  let r = (x - k * TWO_PI_HI) - k * TWO_PI_LO; // [-pi, pi]
  if (r > HALF_PI) r = PI - r; else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  // r - r^3/6 + r^5/120 - ... up to r^15/15! (next term < 1e-11 on [-pi/2, pi/2])
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880
    + r2 * (-1 / 39916800 + r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000))))))));
}
// pexp: exp without Math.exp. x = k ln2 + r, |r| <= ln2/2, Taylor to r^13, scale by exact 2^k.
const LN2_HI = 0.6931471803691238, LN2_LO = 1.9082149292705877e-10, INV_LN2 = 1.4426950408889634;
export function pexp(x) {
  if (x < -700) return 0;
  const k = Math.round(x * INV_LN2);
  const r = (x - k * LN2_HI) - k * LN2_LO;
  let t = 1;
  for (let n = 13; n >= 1; n--) t = 1 + r * t / n;
  let p = 1, b = 2;
  const e = k < 0 ? -k : k;
  for (let i = 0; i < e; i++) p *= b;
  return k < 0 ? t / p : t * p;
}
export const pcos = (x) => psin(x + HALF_PI);

export function mix(a, b, c) {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(c + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// ---- profile helpers (s = metres downhill from feature origin)
export const ch = (u) => (u <= 0 ? 1 : u >= 1 ? 0 : 0.5 * (1 + pcos(PI * u)));
export const hump = (H, Lu, Ld) => (s) => (s <= -Lu ? 0 : s < 0 ? H * ch(-s / Lu) : s < Ld ? H * ch(s / Ld) : 0);
export const knots = (k) => (s) => {
  if (s <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (s <= k[i][0]) {
      const u = (s - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (1 - pcos(PI * u)) / 2;
    }
  }
  return k[k.length - 1][1];
};

// drop: permanent part (goes into baseOffset, applied across the whole width). g: bump part (scaled by w).
const stepDrop = knots([[0, 0], [22, -2.2]]);
const gapAll = knots([[0, 0], [22, -2.4], [26, -2.4], [38, -1.8], [46, -1.8]]);
const gapDrop = knots([[0, 0], [22, -1.8]]);
// lead = metres before origin where the feature starts; end = metres after origin where it ends.
export const SHAPES = {
  roller:   { g: hump(0.40, 26, 26), lead: 26, end: 26, lee: 0, H: 0.40, wEdge: 0.7 },
  hopper:   { g: hump(1.6, 20, 20), lead: 20, end: 20, lee: 60, H: 1.6, wEdge: 0.55 },
  crestS:   { g: hump(1.2, 25, 25), lead: 25, end: 25, lee: 40, H: 1.2, wEdge: 0.55 },
  crestM:   { g: hump(1.6, 26.5, 26.5), lead: 26.5, end: 26.5, lee: 45, H: 1.6, wEdge: 0.55 },
  crestL:   { g: hump(2.0, 28, 28), lead: 28, end: 28, lee: 55, H: 2.0, wEdge: 0.55, hard: true },
  // step: spec 20 m ramp has raw d2h/dz2 0.0271 > cap 0.0255; 22 m ramp gives 0.0224.
  step:     { g: () => 0, drop: stepDrop, lead: 10, end: 22, lee: 40, H: 2.2, wEdge: 0.7 },
  // not picked by the B1 layout:
  kicker:   { g: hump(3.0, 24, 24), lead: 24, end: 24, lee: 80, H: 3.0, wEdge: 0.55, hard: true },
  double:   { g: (s) => hump(1.5, 20, 18)(s) + hump(1.4, 17, 28)(s - 44), lead: 20, end: 72, lee: 50, H: 1.5, wEdge: 0.7, hard: true },
  tabletop: { g: knots([[-17, 0], [0, 1.4], [14, 2.2], [35, 0]]), lead: 17, end: 35, lee: 60, H: 2.2, wEdge: 0.7, hard: true },
  gap:      { g: (s) => gapAll(s) - gapDrop(s), drop: gapDrop, lead: 22, end: 46, lee: 40, H: 2.4, wEdge: 1.0, hard: true },
};

const B1_TYPES = ['roller', 'hopper', 'crestS', 'crestM', 'crestL', 'step'];
const B1_WEIGHTS = { roller: 15, hopper: 20, crestS: 20, crestM: 20, crestL: 15, step: 10 };
const EASY_TYPES = ['roller', 'hopper', 'step', 'crestS'];
const EASY_UNTIL = 600;

export const pitchAt = (d) => 70 + 30 * pexp(-d / 2500);

// ---- layout: pure fold over feature index
export function layoutDunes(seed, length, cfg = {}) {
  const first = cfg.featureFirstZ ?? 170;
  const tail = cfg.featureTail ?? 110;
  const weights = cfg.duneWeights || B1_WEIGHTS;
  const features = [];
  let z = first, prev = null, prev2 = null;
  for (let i = 0; ; i++) {
    const r = mulberry32(mix(seed >>> 0, 10, i));
    const pick = r(), jit = r(), variant = r(), side = r() < 0.5 ? -1 : 1;
    let fz = z, type;
    if (prev) {
      // early-zone test uses the pitch-only estimate (own lead is not known before the pick)
      const est = prev.z + pitchAt(prev.z) * (0.9 + 0.2 * jit);
      const pool = (est < EASY_UNTIL ? EASY_TYPES : B1_TYPES).filter((t) => {
        if (SHAPES[t].hard && prev.hard) return false;
        if (prev2 && prev.type === t && prev2.type === t) return false;
        return weights[t] > 0;
      });
      type = pickType(pool, weights, pick);
      const S = SHAPES[type];
      fz = prev.z + Math.max(pitchAt(prev.z) * (0.9 + 0.2 * jit), Math.max(prev.end, prev.lee) + S.lead);
    } else {
      type = pickType(EASY_TYPES, weights, pick);
    }
    if (fz > length - tail) break;
    const S = SHAPES[type];
    const f = { id: i, type, z: fz, lead: S.lead, end: S.end, lee: S.lee, H: S.H, side, variant, hard: !!S.hard, wEdge: S.wEdge };
    features.push(f);
    prev2 = prev; prev = f; z = fz;
  }
  return features;
}
function pickType(pool, weights, u) {
  let tot = 0;
  for (const t of pool) tot += weights[t];
  let a = u * tot;
  for (const t of pool) { a -= weights[t]; if (a < 0) return t; }
  return pool[pool.length - 1];
}

// ---- evaluation
// Raw dune value at z (x-independent, no across-slope weight): sum of bump parts.
export function duneAt(features, z) {
  let v = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (z < f.z - f.lead) break;
    if (z > f.z + f.end) continue;
    v += SHAPES[f.type].g(z - f.z);
  }
  return v;
}
// Permanent drops (step, gap far lip): applies across the full width.
export function baseOffset(features, z) {
  let v = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const S = SHAPES[f.type];
    if (!S.drop) continue;
    if (z <= f.z) break;
    v += S.drop(z - f.z);
  }
  return v;
}
// Across-slope weight: 1 for |dx| <= hw-3, cosine to wEdge over the next 6 m, wEdge beyond.
// `type` may be a type name or a wEdge number.
export function w(dx, hw, type) {
  const we = typeof type === 'number' ? type : SHAPES[type].wEdge;
  const a = (dx < 0 ? -dx : dx) - (hw - 3);
  if (a <= 0) return 1;
  if (a >= 6) return we;
  return we + (1 - we) * 0.5 * (1 + pcos(PI * a / 6));
}
// Dune height at one point: sum of w * g per active feature (supports never overlap, so 0 or 1 terms).
export function duneField(features, z, dx, hw) {
  let v = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (z < f.z - f.lead) break;
    if (z > f.z + f.end) continue;
    const g = SHAPES[f.type].g(z - f.z);
    if (g !== 0) v += g * w(dx, hw, f.wEdge);
  }
  return v;
}
