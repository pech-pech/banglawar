// Ridgeline terrain: pure, deterministic, no THREE. Slice 2.
import { mulberry32 } from './rng.js';
import { psin, mix, layoutDunes, baseOffset, duneField } from './dunes.js';

const CHUNK = 20; // metres of z per hash chunk
const ROCK_START = 90;
const ROCK_FULL = 200;     // rock density reaches 100% here
const LANE_STEP = 0.5;
const LANE_SLOPE = 0.2;    // max |dx/dz| of safeX (limit 0.22)
const LANE_CLEAR = 2.4;    // min rock surface distance from safeX
const FIRST_GATE = 80;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createCourse(seedInt, cfg) {
  const seed = seedInt >>> 0;
  const length = cfg.runLength;
  const ph = mulberry32(mix(seed, 1, 0));
  const P = [];
  for (let i = 0; i < 10; i++) P.push(ph() * Math.PI * 2);
  const slope = cfg.slope;
  const baseHW = cfg.courseHalfWidth;

  function centerX(z) {
    // ramp amplitude in so the start is near x=0
    const a = Math.min(1, z / 120);
    return a * (9 * psin(z * 0.011 + P[0]) + 4 * psin(z * 0.027 + P[1]) + 1.5 * psin(z * 0.06 + P[2]));
  }
  function halfWidth(z) {
    return baseHW * (1 - 0.35 * clamp01(z / length));
  }
  // Safe lane: slope-limited follower of (centre + weave), precomputed on a grid.
  const laneN = Math.ceil((length + 60) / LANE_STEP) + 2;
  const lane = new Float64Array(laneN);
  {
    const lim = LANE_SLOPE * LANE_STEP;
    lane[0] = centerX(0);
    for (let i = 1; i < laneN; i++) {
      const z = i * LANE_STEP;
      const ramp = Math.min(1, z / 80);
      const weave = ramp * (2.6 * psin(z * 0.045 + P[7]) + 1.1 * psin(z * 0.097 + P[8]));
      const c = centerX(z), room = Math.max(0, halfWidth(z) - 3.6);
      let t = c + weave;
      t = t < c - room ? c - room : t > c + room ? c + room : t;
      const d = t - lane[i - 1];
      lane[i] = lane[i - 1] + (d > lim ? lim : d < -lim ? -lim : d);
    }
  }
  function safeX(z) {
    const f = Math.max(0, z) / LANE_STEP;
    const i = Math.min(laneN - 2, Math.floor(f));
    const u = Math.min(1, f - i);
    return lane[i] + (lane[i + 1] - lane[i]) * u;
  }
  const features = layoutDunes(seed, length, cfg);
  function featureAt(z) {
    for (const f of features) {
      if (z < f.z - f.lead) break;
      if (z <= f.z + f.end) return f;
    }
    return null;
  }
  function crestAt(z) {
    const f = featureAt(z);
    return f && f.type !== 'roller' ? { id: f.id, lipZ: f.z } : null;
  }
  function height(x, z) {
    const dx = x - centerX(z);
    const out = Math.abs(dx) - halfWidth(z);
    const bank = out > 0 ? 0.12 * out * out + 0.5 * out : 0;
    // gentle texture only: z-frequencies kept low so |d2h/dz2| < 0.0015
    const bumps = 0.5 * psin(x * 0.21 + z * 0.02 + P[3]) + 0.35 * psin(z * 0.04 + P[4] - x * 0.07)
      + 0.2 * psin(x * 0.5 + P[5]) * psin(z * 0.05 + P[6]);
    return -slope * z + baseOffset(features, z) + bumps + duneField(features, z, dx, halfWidth(z)) + bank;
  }

  function gateAt(id) {
    const z = FIRST_GATE + id * cfg.gateSpacing;
    if (z >= length) return null;
    const r = mulberry32(mix(seed, 2, id));
    const w = cfg.gateWidth;
    const room = Math.max(0, halfWidth(z) - w / 2 - 1);
    const c = centerX(z);
    let x = safeX(z) + (r() * 2 - 1) * 3.2;
    x = Math.max(c - room, Math.min(c + room, x));
    return { id, z, x, width: w };
  }
  function gatesInRange(z0, z1) {
    const out = [];
    const s = cfg.gateSpacing;
    let i = Math.max(0, Math.ceil((z0 - FIRST_GATE) / s));
    for (;; i++) {
      const g = gateAt(i);
      if (!g || g.z >= z1) break;
      if (g.z >= z0) out.push(g);
    }
    return out;
  }

  function nearGateBlocked(x, z, r) {
    const s = cfg.gateSpacing;
    const i0 = Math.max(0, Math.floor((z - FIRST_GATE) / s));
    for (let i = i0; i <= i0 + 1; i++) {
      const g = gateAt(i);
      if (!g) continue;
      if (Math.abs(z - g.z) < r + 3 && Math.abs(x - g.x) < g.width / 2 + r + 1) return true;
    }
    return false;
  }

  // lee zone [origin, origin+lee] and 3 m before an up-face start (origin - lead) stay rock-free
  function rockBlocked(z, rad) {
    for (const f of features) {
      if (z + rad < f.z - f.lead - 3) break;
      if (z - rad <= f.z + f.lee && z + rad >= f.z) return true;
      if (z - rad <= f.z - f.lead && z + rad >= f.z - f.lead - 3) return true;
    }
    return false;
  }
  const rockCache = new Map();
  function rockChunk(c) {
    let arr = rockCache.get(c);
    if (arr) return arr;
    arr = [];
    const r = mulberry32(mix(seed, 3, c));
    const n = Math.floor(cfg.rockDensity * 5 + r()); // expected ~ density*5 per chunk
    const zBase = c * CHUNK;
    for (let k = 0; k < n; k++) {
      // fixed draw order per rock keeps ids and layout stable
      const z = zBase + r() * CHUNK;
      const u = r(), rad = 0.8 + r() * 1.4;
      const keep = r(), sideR = r(), extra = r() * 1.5;
      if (z < ROCK_START || z >= length) continue;
      if (rockBlocked(z, rad)) continue;
      if (z < ROCK_FULL) {
        const t = (z - ROCK_START) / (ROCK_FULL - ROCK_START);
        if (keep >= 0.12 + 0.88 * t * t) continue;
      }
      const hw = halfWidth(z) - rad - 0.5;
      if (hw <= 0) continue;
      const cx = centerX(z);
      let x = cx + (u * 2 - 1) * hw;
      // lane check over the rock's whole z extent
      let lo = Infinity, hi = -Infinity;
      for (let zz = z - rad; zz <= z + rad + 1e-6; zz += 0.25) {
        const sx = safeX(zz);
        if (sx < lo) lo = sx;
        if (sx > hi) hi = sx;
      }
      const need = rad + LANE_CLEAR + 0.05;
      if (x - hi < need && lo - x < need) {
        // in the lane: push out to either side, 2.4-3.9 m surface gap
        const pref = sideR < 0.5 ? -1 : 1;
        let moved = false;
        for (const sd of [pref, -pref]) {
          const nx = sd > 0 ? hi + need + extra : lo - need - extra;
          if (Math.abs(nx - cx) <= hw) { x = nx; moved = true; break; }
        }
        if (!moved) continue;
      }
      if (nearGateBlocked(x, z, rad)) continue;
      arr.push({ id: c * 64 + k, x, z, r: rad });
    }
    arr.sort((a, b) => a.z - b.z);
    if (rockCache.size > 256) rockCache.clear();
    rockCache.set(c, arr);
    return arr;
  }
  function rocksInRange(z0, z1) {
    const out = [];
    for (let c = Math.floor(z0 / CHUNK); c * CHUNK < z1; c++) {
      if (c < 0) continue;
      for (const k of rockChunk(c)) if (k.z >= z0 && k.z < z1) out.push(k);
    }
    return out;
  }

  function treesInRange(z0, z1) {
    const out = [];
    for (let c = Math.floor(z0 / CHUNK); c * CHUNK < z1; c++) {
      if (c < 0) continue;
      const r = mulberry32(mix(seed, 4, c));
      const n = Math.floor(cfg.treeDensity * 8 + r());
      for (let k = 0; k < n; k++) {
        const z = c * CHUNK + r() * CHUNK;
        const side = r() < 0.5 ? -1 : 1;
        const off = 1.5 + r() * 28;
        const s = 0.8 + r() * 1.2;
        if (z < z0 || z >= z1 || z > length + 40) continue;
        out.push({ x: centerX(z) + side * (halfWidth(z) + off), z, s });
      }
    }
    return out;
  }

  return { seed, length, features, featureAt, crestAt, centerX, safeX, halfWidth, height, gatesInRange, rocksInRange, treesInRange };
}
