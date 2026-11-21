// Ridgeline dunes: authored feature shapes, seeded layout, plain-arithmetic sine. Pure, no THREE.
// Shapes: sections/05-endless.md sec 1. Across-slope w(x): sections/02-terrain-props.md sec 1.
import { mulberry32 } from './rng.js';
import { zoneWeights, pitchTarget, zoneAt, halfWidthAt } from './endless.js';

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

const bladeG = hump(1.6, 26.5, 26.5);
const clampX = (x, c) => (x < -c ? -c : x > c ? c : x);
// bowl envelopes: shift out over s 0..50, hold to 60, return over 60..110
const BOWL_OUT = 50, BOWL_HOLD = 60, BOWL_END = 110;
const BOWL_SHIFT_MAX = 0.12 * 2 * BOWL_OUT / PI; // 3.82 m
const BOWL_WALL = 1.0; // outer bank height (m)
const sq = (v) => v * v;
export function bowlU(s) { // 0..1 lateral fraction of the centre-line shift
  if (s <= 0 || s >= BOWL_END) return 0;
  if (s < BOWL_OUT) return sq(psin(PI * s / (2 * BOWL_OUT)));
  if (s <= BOWL_HOLD) return 1;
  return sq(psin(PI * (BOWL_END - s) / (2 * BOWL_OUT)));
}
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
function bowlWall(s, dx, hw, f) {
  if (s <= 0 || s >= BOWL_END) return 0;
  const sd = f.side; // centre shifts toward +side first; outer wall on the other side, flips on the return
  let v = 0;
  if (s < BOWL_OUT) {
    const e = sq(psin(PI * s / BOWL_OUT));
    const out = -sd * dx;
    v = e * BOWL_WALL * smooth((out - 0.2 * hw) / (0.8 * hw));
  } else if (s > BOWL_HOLD) {
    const e = sq(psin(PI * (s - BOWL_HOLD) / BOWL_OUT));
    const out = sd * dx;
    v = e * BOWL_WALL * smooth((out - 0.2 * hw) / (0.8 * hw));
  }
  return v;
}
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
  // not picked by the B1 layout. kicker: H 3.0 gave raw curvature 0.0257 > cap; 2.94 holds the cap on the safe lane too.
  kicker:   { g: hump(2.94, 24, 24), lead: 24, end: 24, lee: 87, H: 2.94, wEdge: 1.0, hard: true },
  double:   { g: (s) => hump(1.5, 20, 18)(s) + hump(1.4, 17, 28)(s - 44), lead: 20, end: 72, lee: 50, H: 1.5, wEdge: 1.0, hard: true },
  tabletop: { g: knots([[-17, 0], [0, 1.4], [14, 2.2], [35, 0]]), lead: 17, end: 35, lee: 60, H: 2.2, wEdge: 1.0, hard: true },
  gap:      { g: (s) => gapAll(s) - gapDrop(s), drop: gapDrop, lead: 22, end: 46, lee: 40, H: 2.4, wEdge: 1.0, hard: true },
  // blade ridge: crest M with s' = s - x tan(phi) (x clamped to the half width stored on the record).
  // lead/end/lee here are for tan(phi)*hw = 0; the fold widens them by hw*|tan(phi)| per record.
  blade:    { g: hump(1.6, 26.5, 26.5), gx: (s, dx, hw, f) => bladeG(s - clampX(dx, f.xClamp) * f.tanPhi),
              lead: 26.5, end: 26.5, lee: 45, H: 1.6, wEdge: 0.55, hard: true },
  // bowl: lateral S-turn (laneShift moves the centre line) plus a banked outer wall. Support s in [0, 110].
  bowl:     { g: () => 0, gx: (s, dx, hw, f) => bowlWall(s, dx, hw, f), lead: 20, end: 110, lee: 0, H: 1.6, wEdge: 1.0 },
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

// ---- endless: lazy pure fold over feature index (sections/05-endless.md sec 1)
const ORDER = ['roller', 'hopper', 'crestS', 'crestM', 'crestL', 'step', 'kicker', 'double', 'tabletop', 'gap', 'blade', 'bowl'];
const ENDLESS_EASY = ['roller', 'hopper', 'step', 'crestS'];
const COOLDOWN = { gap: 500, tabletop: 350, kicker: 400 };
const KEYMAP = { roller: 'roller', hopper: 'hopper', kick: 'hopper', crests: 'crestS', s: 'crestS', crestm: 'crestM', m: 'crestM',
  crestl: 'crestL', l: 'crestL', step: 'step', stepdown: 'step', kicker: 'kicker', double: 'double', table: 'tabletop',
  tabletop: 'tabletop', gap: 'gap', blade: 'blade', bowl: 'bowl' };
function normWeights(raw) {
  const out = {};
  for (const k in raw) {
    const t = KEYMAP[String(k).toLowerCase().replace(/[^a-z]/g, '')];
    if (t && raw[k] > 0) out[t] = (out[t] || 0) + raw[k];
  }
  return out;
}

export function createFold(seed, cfg = {}) {
  seed = seed >>> 0;
  const first = cfg.featureFirstZ ?? 170;
  const leeCap = cfg.leeCapM ?? 100;
  const features = [];
  const cum = [0]; // cum[i] = sum of final permanent drops of features 0..i-1
  let prev = null, prev2 = null;
  const lastZ = { gap: -1e9, tabletop: -1e9, kicker: -1e9 };

  function next() {
    const i = features.length;
    const r = mulberry32(mix(seed, 10, i));
    const pick = r(), jit = r(), variant = r(), side = r() < 0.5 ? -1 : 1;
    let est, d;
    if (prev) { d = prev.z; est = prev.z + pitchTarget(d, cfg) * (0.9 + 0.2 * jit); } else { d = first; est = first; }
    const wts = normWeights(zoneWeights(est, cfg));
    let pool = ORDER.filter((t) => {
      if (!(wts[t] > 0)) return false;
      if (est < EASY_UNTIL && !ENDLESS_EASY.includes(t)) return false;
      if (SHAPES[t].hard && prev && prev.hard) return false;
      if (prev2 && prev.type === t && prev2.type === t) return false;
      if (COOLDOWN[t] && est - lastZ[t] < COOLDOWN[t]) return false;
      return true;
    });
    if (!pool.length) pool = ['roller'];
    const type = pickType(pool, wts, pick);
    const S = SHAPES[type];
    let lead = S.lead, end = S.end, lee = S.lee;
    let tanPhi = 0, xClamp = 0, shift = 0;
    if (type === 'blade' || type === 'bowl') {
      const hw = halfWidthAt(est, cfg);
      xClamp = hw;
      if (type === 'blade') {
        tanPhi = side * Math.max(0.30, 3 / hw);
        const sh = hw * Math.abs(tanPhi);
        lead += sh; end += sh; lee += sh;
      } else {
        // peak |d shift/dz| = |shift| * pi / (2 * BOWL_OUT) <= 0.12 (lane follows at 0.2) and |shift| <= 0.45 hw
        shift = side * Math.min(BOWL_SHIFT_MAX, 0.45 * hw);
      }
    }
    if (lee > leeCap) lee = leeCap;
    let fz = first;
    if (prev) fz = prev.z + Math.max(pitchTarget(d, cfg) * (0.9 + 0.2 * jit), Math.max(prev.end, prev.lee) + lead);
    const za = zoneAt(fz, cfg);
    const f = { id: i, type, z: fz, lead, end, lee, H: S.H, side, variant, hard: !!S.hard, wEdge: S.wEdge,
      zone: za.zone, lap: za.lap, tanPhi, xClamp, shift };
    features.push(f);
    cum.push(cum[i] + (S.drop ? S.drop(1e9) : 0));
    if (COOLDOWN[type]) lastZ[type] = fz;
    prev2 = prev; prev = f;
  }
  let covered = -Infinity;
  const fold = {
    seed, features, cum,
    extend(z) {
      const t = z + 400;
      if (t <= covered) return fold;
      while (!prev || prev.z - prev.lead <= t) next();
      covered = t;
      return fold;
    },
    // last feature with z - lead <= zq, or -1 (supports never overlap, so it is the only candidate)
    index(zq) {
      if (zq + 400 > covered) fold.extend(zq);
      let lo = 0, hi = features.length - 1, r = -1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (features[m].z - features[m].lead <= zq) { r = m; lo = m + 1; } else hi = m - 1;
      }
      return r;
    },
    featureAt(zq) {
      const i = fold.index(zq);
      return i >= 0 && zq <= features[i].z + features[i].end ? features[i] : null;
    },
    // permanent drop (step, gap far lip) at z: prefix sum + the one feature in progress. O(log n).
    cumDrop(zq) {
      if (zq + 400 > covered) fold.extend(zq);
      let lo = 0, hi = features.length - 1, r = -1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (features[m].z < zq) { r = m; lo = m + 1; } else hi = m - 1;
      }
      if (r < 0) return 0;
      const S = SHAPES[features[r].type];
      return cum[r] + (S.drop ? S.drop(zq - features[r].z) : 0);
    },
    // lateral centre-line shift of the bowl in progress (0 elsewhere); terrain adds it to centerX
    laneShift(zq) {
      const f = fold.featureAt(zq);
      return f && f.type === 'bowl' ? f.shift * bowlU(zq - f.z) : 0;
    },
    // rock-free stretch at each zone entry (60 m)
    zoneGuard(zq) {
      const za = zoneAt(zq, cfg);
      const loc = za.local ?? (zq - za.start);
      return loc < 60;
    },
  };
  return fold;
}

// ---- evaluation (accept a plain features array or a fold)
const isFold = (x) => x && !Array.isArray(x) && x.features && typeof x.index === 'function';
export function laneShift(src, z) {
  if (isFold(src)) return src.laneShift(z);
  for (const f of src) {
    if (z < f.z - f.lead) break;
    if (f.type === 'bowl' && z <= f.z + f.end) return f.shift * bowlU(z - f.z);
  }
  return 0;
}
function activeOf(src, z) {
  if (isFold(src)) {
    const f = src.featureAt(z);
    return f;
  }
  return null;
}
// Raw dune value at z (x-independent, no across-slope weight): sum of bump parts.
export function duneAt(features, z) {
  if (isFold(features)) {
    const f = activeOf(features, z);
    return f ? SHAPES[f.type].g(z - f.z) : 0;
  }
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
  if (isFold(features)) return features.cumDrop(z);
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
function fieldOne(f, z, dx, hw) {
  const S = SHAPES[f.type];
  const g = S.gx ? S.gx(z - f.z, dx, hw, f) : S.g(z - f.z);
  return g !== 0 ? g * w(dx, hw, f.wEdge) : 0;
}
// Dune height at one point: sum of w * g per active feature (supports never overlap, so 0 or 1 terms).
// dx is relative to the (bowl-shifted) centre line.
export function duneField(features, z, dx, hw) {
  if (isFold(features)) {
    const f = features.featureAt(z);
    return f ? fieldOne(f, z, dx, hw) : 0;
  }
  let v = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (z < f.z - f.lead) break;
    if (z > f.z + f.end) continue;
    v += fieldOne(f, z, dx, hw);
  }
  return v;
}
