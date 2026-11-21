// Ridgeline terrain: pure, deterministic, no THREE. Slice 2.
import { mulberry32 } from './rng.js';
import { psin, mix, layoutDunes, baseOffset, duneField, createFold } from './dunes.js';
import { zoneAt as zoneAtD, zoneRockX, halfWidthAt, rockDensityAt, gateSpacingAt } from './endless.js';

const CHUNK = 20; // metres of z per hash chunk
const ROCK_START = 90;
const ROCK_FULL = 200;     // rock density reaches 100% here
const LANE_STEP = 0.5;
const LANE_SLOPE = 0.2;    // max |dx/dz| of safeX (limit 0.22)
const LANE_CLEAR = 2.4;    // min rock surface distance from safeX
const FIRST_GATE = 80;
const LANE_BLOCK = 1024;   // endless: lane samples appended per extension (512 m)
const KEEP_BEHIND = 300;   // endless: chunk caches drop chunks this far behind the newest lookup
const BUMP_SCALE = 0.06;
const REED_PER_CHUNK = 1.1;
const NON_TALL = { gap: 1, blade: 1, bowl: 1 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createCourse(seedInt, cfg) {
  const seed = seedInt >>> 0;
  const endless = !!cfg.endless;
  const length = endless ? Infinity : cfg.runLength;
  const ph = mulberry32(mix(seed, 1, 0));
  const P = [];
  for (let i = 0; i < 10; i++) P.push(ph() * Math.PI * 2);
  const slope = cfg.slope;
  const baseHW = cfg.courseHalfWidth;

  const fold = endless ? createFold(seed, cfg) : null;
  function centerX(z) {
    // ramp amplitude in so the start is near x=0
    let a = Math.min(1, z / 120);
    if (endless) a = a * a * (3 - 2 * a); // smooth ramp: no slope kink at z 120 (curvature cap)
    const c = a * (9 * psin(z * 0.011 + P[0]) + 4 * psin(z * 0.027 + P[1]) + 1.5 * psin(z * 0.06 + P[2]));
    return fold ? c + fold.laneShift(z) : c;
  }
  function halfWidth(z) {
    return endless ? halfWidthAt(z, cfg) : baseHW * (1 - 0.35 * clamp01(z / length));
  }
  // Safe lane: slope-limited follower of (centre + weave), precomputed on a grid (endless: appended in blocks,
  // each sample depends only on the previous one, so the grid is identical whatever the query order).
  const laneN = endless ? 0 : Math.ceil((length + 60) / LANE_STEP) + 2;
  let lane = new Float64Array(endless ? 2 * LANE_BLOCK : laneN);
  let laneLen = 0;
  function growLane(n) {
    if (n > lane.length) { const nl = new Float64Array(Math.max(n, lane.length * 2)); nl.set(lane.subarray(0, laneLen)); lane = nl; }
    const lim = LANE_SLOPE * LANE_STEP;
    if (laneLen === 0) { lane[0] = centerX(0); laneLen = 1; }
    for (let i = laneLen; i < n; i++) {
      const z = i * LANE_STEP;
      const ramp = Math.min(1, z / 80);
      const weave = ramp * (2.6 * psin(z * 0.045 + P[7]) + 1.1 * psin(z * 0.097 + P[8]));
      const c = centerX(z), room = Math.max(0, halfWidth(z) - 3.6);
      let t = c + weave;
      t = t < c - room ? c - room : t > c + room ? c + room : t;
      const d = t - lane[i - 1];
      lane[i] = lane[i - 1] + (d > lim ? lim : d < -lim ? -lim : d);
    }
    laneLen = Math.max(laneLen, n);
  }
  if (!endless) growLane(laneN);
  function safeX(z) {
    const f = Math.max(0, z) / LANE_STEP;
    let i;
    if (endless) {
      i = Math.floor(f);
      if (i + 2 > laneLen) growLane(Math.ceil((i + 2) / LANE_BLOCK + 1) * LANE_BLOCK);
    } else i = Math.min(laneN - 2, Math.floor(f));
    const u = Math.min(1, f - i);
    return lane[i] + (lane[i + 1] - lane[i]) * u;
  }
  const features = endless ? fold.features : layoutDunes(seed, length, cfg);
  function featureAt(z) {
    if (fold) return fold.featureAt(z);
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
    // endless: texture follows the (shifted) centre line and is scaled down, because the kicker alone uses
    // 0.0254 of the 0.0255 curvature budget along the centre line
    const bx = endless ? dx : x, bs = endless ? BUMP_SCALE : 1;
    const bumps = bs * (0.5 * psin(bx * 0.21 + z * 0.02 + P[3]) + 0.35 * psin(z * 0.04 + P[4] - bx * 0.07)
      + 0.2 * psin(bx * 0.5 + P[5]) * psin(z * 0.05 + P[6]));
    const src = fold || features;
    return -slope * z + baseOffset(src, z) + bumps + duneField(src, z, dx, halfWidth(z)) + bank;
  }

  // endless gates: cumulative z by id, first gate FIRST_GATE, spacing gateSpacingAt(z)
  const gateZ = [FIRST_GATE];
  function gateZs(upTo) {
    while (gateZ[gateZ.length - 1] <= upTo) { const z = gateZ[gateZ.length - 1]; gateZ.push(z + gateSpacingAt(z, cfg)); }
  }
  function gateIndexAtOrAfter(z) { // first id with gateZ >= z
    if (z <= FIRST_GATE) return 0;
    gateZs(z);
    let lo = 0, hi = gateZ.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (gateZ[m] >= z) hi = m; else lo = m + 1; }
    return lo;
  }
  function gateAt(id) {
    if (id < 0) return null;
    let z;
    if (endless) { gateZs(0); while (gateZ.length <= id) gateZs(gateZ[gateZ.length - 1]); z = gateZ[id]; }
    else z = FIRST_GATE + id * cfg.gateSpacing;
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
    let i = endless ? gateIndexAtOrAfter(z0) : Math.max(0, Math.ceil((z0 - FIRST_GATE) / s));
    for (;; i++) {
      const g = gateAt(i);
      if (!g || g.z >= z1) break;
      if (g.z >= z0) out.push(g);
    }
    return out;
  }

  function nearGateBlocked(x, z, r) {
    let i0;
    if (endless) { i0 = Math.max(0, gateIndexAtOrAfter(z) - 1); } else i0 = Math.max(0, Math.floor((z - FIRST_GATE) / cfg.gateSpacing));
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
  let rockMaxC = -1;
  // drop chunks far behind only when lookups move forward; results never depend on what is cached
  function prune(map, c, maxRef) {
    if (c > maxRef) { for (const k of map.keys()) if (k < c - KEEP_BEHIND / CHUNK) map.delete(k); return c; }
    if (map.size > 200) for (const k of map.keys()) if (Math.abs(k - c) > 40) map.delete(k);
    return maxRef;
  }
  // endless: lee zones (and the up-face lead-in) and zone-entry guard are rock-free
  function rockBlockedE(z, rad) {
    if (fold.zoneGuard(z - rad) || fold.zoneGuard(z + rad)) return true;
    const i = fold.index(z + rad);
    for (let j = Math.max(0, i - 1); j <= i + 1 && j < fold.features.length; j++) {
      const f = fold.features[j];
      if (z - rad <= f.z + f.lee && z + rad >= f.z) return true;
      if (z - rad <= f.z - f.lead && z + rad >= f.z - f.lead - 3) return true;
    }
    return false;
  }
  const tallN = [0]; // tallN[i] = tall crests before feature i
  const isTall = (f) => f.hard && !NON_TALL[f.type];
  function tallBefore(i) {
    while (tallN.length <= i) tallN.push(tallN[tallN.length - 1] + (isTall(fold.features[tallN.length - 1]) ? 1 : 0));
    return tallN[i];
  }
  function finishRock(x, z, rad, sideR, extra, id) {
    const hw = halfWidth(z) - rad - 0.5;
    if (hw <= 0) return null;
    const cx = centerX(z);
    let lo = Infinity, hi = -Infinity;
    for (let zz = z - rad; zz <= z + rad + 1e-6; zz += 0.25) {
      const sx = safeX(zz);
      if (sx < lo) lo = sx;
      if (sx > hi) hi = sx;
    }
    const need = rad + LANE_CLEAR + 0.05;
    if (x - hi < need && lo - x < need) {
      const pref = sideR < 0.5 ? -1 : 1;
      let moved = false;
      for (const sd of [pref, -pref]) {
        const nx = sd > 0 ? hi + need + extra : lo - need - extra;
        if (Math.abs(nx - cx) <= hw) { x = nx; moved = true; break; }
      }
      if (!moved) return null;
    }
    if (nearGateBlocked(x, z, rad)) return null;
    return { id, x, z, r: rad };
  }
  function rockChunkE(c) {
    let arr = rockCache.get(c);
    if (arr) return arr;
    arr = [];
    const zBase = c * CHUNK;
    const r = mulberry32(mix(seed, 30, c));
    const dens = rockDensityAt(zBase + CHUNK / 2, cfg) * zoneRockX(zBase + CHUNK / 2, cfg) * (cfg.rockLeeComp ?? 1);
    const n = Math.floor(dens * 5 + r());
    for (let k = 0; k < n; k++) {
      const z = zBase + r() * CHUNK;
      const u = r(), rad = 0.8 + r() * 1.4;
      const keep = r(), sideR = r(), extra = r() * 1.5;
      if (z < ROCK_START) continue;
      if (rockBlockedE(z, rad)) continue;
      if (z < ROCK_FULL) {
        const t = (z - ROCK_START) / (ROCK_FULL - ROCK_START);
        if (keep >= 0.12 + 0.88 * t * t) continue;
      }
      const hw = halfWidth(z) - rad - 0.5;
      if (hw <= 0) continue;
      const rk = finishRock(centerX(z) + (u * 2 - 1) * hw, z, rad, sideR, extra, c * 64 + k);
      if (rk) arr.push(rk);
    }
    // dive rocks: 1 per rockDiveEvery tall crests, crest + 18..28 m (allowed inside the lee zone)
    const every = Math.max(1, cfg.rockDiveEvery | 0 || 3);
    fold.extend(zBase + CHUNK);
    for (let j = fold.index(zBase + CHUNK + 40); j >= 0; j--) {
      const f = fold.features[j];
      if (f.z + 28 < zBase) break;
      if (!isTall(f) || tallBefore(j) % every !== every - 1) continue;
      const q = mulberry32(mix(seed, 33, f.id));
      const z = f.z + 18 + q() * 10, rad = 0.8 + q() * 1.4, u = q(), sideR = q(), extra = q() * 1.5;
      if (Math.floor(z / CHUNK) !== c || z < ROCK_START || fold.zoneGuard(z - rad) || fold.zoneGuard(z + rad)) continue;
      const hw = halfWidth(z) - rad - 0.5;
      if (hw <= 0) continue;
      const rk = finishRock(centerX(z) + (u * 2 - 1) * hw, z, rad, sideR, extra, c * 64 + 48 + (j & 7));
      if (rk) { rk.dive = true; arr.push(rk); }
    }
    arr.sort((a, b) => a.z - b.z);
    rockMaxC = prune(rockCache, c, rockMaxC);
    rockCache.set(c, arr);
    return arr;
  }
  function rockChunk(c) {
    if (endless) return rockChunkE(c);
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

  const reedCache = new Map();
  let reedMaxC = -1;
  function reedChunk(c) {
    let arr = reedCache.get(c);
    if (arr) return arr;
    arr = [];
    const zBase = c * CHUNK;
    const r = mulberry32(mix(seed, 31, c));
    const n = Math.floor(REED_PER_CHUNK + r());
    let near = null;
    for (let k = 0; k < n; k++) {
      const z = zBase + r() * CHUNK;
      const mode = r(), side = r() < 0.5 ? -1 : 1, off = r(), h = 0.55 + r() * 0.7;
      if (z < 40) continue;
      const cx = centerX(z), hw = halfWidth(z);
      let x;
      if (mode < 0.7) x = cx + side * (hw - 1.5 + off * 3);
      else { x = safeX(z) + side * (2.9 + off * 2.5); x = Math.max(cx - hw + 1, Math.min(cx + hw - 1, x)); }
      let ok = true;
      for (let zz = z - 0.5; zz <= z + 0.5 + 1e-6; zz += 0.25) if (Math.abs(x - safeX(zz)) < LANE_CLEAR + 0.3) { ok = false; break; }
      if (!ok) continue;
      if (!near) { near = []; for (let cc = c - 1; cc <= c + 1; cc++) if (cc >= 0) for (const rk of rockChunk(cc)) near.push(rk); }
      for (const rk of near) if (Math.hypot(x - rk.x, z - rk.z) < rk.r + 0.7) { ok = false; break; }
      if (ok) arr.push({ id: c * 32 + k, x, z, h });
    }
    arr.sort((a, b) => a.z - b.z);
    reedMaxC = prune(reedCache, c, reedMaxC);
    reedCache.set(c, arr);
    return arr;
  }
  function reedsInRange(z0, z1) {
    const out = [];
    if (!endless) return out;
    for (let c = Math.max(0, Math.floor(z0 / CHUNK)); c * CHUNK < z1; c++) {
      for (const k of reedChunk(c)) if (k.z >= z0 && k.z < z1) out.push(k);
    }
    return out;
  }
  const zoneAt = (z) => zoneAtD(z, cfg);

  return { seed, length, features, zoneAt, reedsInRange, featureAt, crestAt, centerX, safeX, halfWidth, height, gatesInRange, rocksInRange, treesInRange };
}
