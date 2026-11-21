// Ridgeline shape library: code-built low-poly tree and rock geometries.
// Trees are unit size (base y=0, height 1, width ~0.5). Rocks are unit radius in XZ,
// base at y=0, never wider than radius 1. All irregularity uses a fixed-seed PRNG.
import * as THREE from '../vendor/three.module.js';

export const SHAPE_IDS = {
  tree: ['cone', 'lollipop', 'fern', 'cube', 'puff', 'brush', 'crystal', 'cactus', 'windharp'],
  rock: ['boulder', 'gumdrop', 'bone', 'cube', 'cloud', 'blot', 'crystal'],
};

// ---------- seeded PRNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic value in [0,1) from a position, so shared vertices stay joined.
function hash01(x, y, z, seed) {
  let h = seed | 0;
  h = Math.imul(h ^ Math.round(x * 1000), 73856093);
  h = Math.imul(h ^ Math.round(y * 1000), 19349663);
  h = Math.imul(h ^ Math.round(z * 1000), 83492791);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---------- geometry helpers ----------
function flat(g) {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  out.deleteAttribute('normal');
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Place a part: scale, then rotate (Euler order YXZ), then translate.
function place(g, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const out = flat(g);
  _e.set(rot[0], rot[1], rot[2], 'YXZ');
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  _s.set(scale[0], scale[1], scale[2]);
  _m.compose(_p, _q, _s);
  out.applyMatrix4(_m);
  return out;
}

function merge(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals(); // non-indexed => flat shading normals
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// Cylinder with base at y=0.
function cyl(rTop, rBot, h, sides, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, sides, 1, open);
  g.translate(0, h / 2, 0);
  return g;
}
// Cone with base at y=0.
function cone(r, h, sides, open = false) {
  return cyl(0, r, h, sides, open);
}
// Faceted shard: prism plus pointed tip, base at y=0, total height h.
function shard(r, h, sides) {
  const tip = h * 0.3;
  return [
    place(cyl(r * 0.85, r, h - tip, sides, false)),
    place(cone(r * 0.85, tip, sides, true), { pos: [0, h - tip, 0] }),
  ];
}
function sphere(r, w = 6, h = 4) {
  return new THREE.SphereGeometry(r, w, h);
}
function box(x, y, z) {
  const g = new THREE.BoxGeometry(x, y, z);
  g.translate(0, y / 2, 0);
  return g;
}

// Radially perturb vertices about the origin, deterministic per position.
function jitter(g, amt, seed, yAmt = amt) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = 1 + (hash01(x, y, z, seed) - 0.5) * 2 * amt;
    const fy = 1 + (hash01(z, x, y, seed + 7) - 0.5) * 2 * yAmt;
    p.setXYZ(i, x * f, y * fy, z * f);
  }
  return g;
}

// Rock fit: sit on y=0, centre in XZ, scale XZ so the widest vertex has radius exactly 1.
function fitRock(g) {
  const p = g.attributes.position;
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.count; i++) {
    minY = Math.min(minY, p.getY(i));
    minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i));
    minZ = Math.min(minZ, p.getZ(i)); maxZ = Math.max(maxZ, p.getZ(i));
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  let maxR = 0;
  for (let i = 0; i < p.count; i++) {
    maxR = Math.max(maxR, Math.hypot(p.getX(i) - cx, p.getZ(i) - cz));
  }
  const k = maxR > 0 ? 1 / maxR : 1;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, (p.getX(i) - cx) * k, p.getY(i) - minY, (p.getZ(i) - cz) * k);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ---------- trees ----------
function buildTree(shape) {
  switch (shape) {
    case 'lollipop': {
      const trunk = merge([place(cyl(0.025, 0.04, 0.58, 6, false))]);
      const leaf = merge([
        place(jitter(flat(sphere(0.25, 7, 5)), 0.06, 11), { pos: [0, 0.75, 0] }),
      ]);
      return { trunk, leaf };
    }
    case 'fern': {
      const rng = mulberry32(2024);
      const parts = [place(cone(0.05, 1.0, 3, false), { rot: [0.05, 0, 0] })];
      const n = 8;
      for (let i = 0; i < n; i++) {
        const L = 0.55 + rng() * 0.3;
        const phi = (i / n) * Math.PI * 2 + rng() * 0.3;
        const tilt = Math.asin(Math.min(1, 0.19 / L)) * (0.7 + rng() * 0.3);
        parts.push(place(cone(0.05, L, 3, false), { rot: [tilt, phi, 0], scale: [1, 1, 0.5] }));
      }
      return { trunk: null, leaf: merge(parts) };
    }
    case 'cube': {
      const trunk = merge([place(box(0.12, 0.32, 0.12))]);
      const leaf = merge([
        place(box(0.5, 0.24, 0.5), { pos: [0, 0.28, 0] }),
        place(box(0.38, 0.24, 0.38), { pos: [0.02, 0.52, 0], rot: [0, 0.3, 0] }),
        place(box(0.26, 0.24, 0.26), { pos: [0, 0.76, 0.01], rot: [0, -0.2, 0] }),
      ]);
      return { trunk, leaf };
    }
    case 'puff': {
      const s = (r, x, y, z, seed) =>
        place(jitter(flat(sphere(r, 6, 4)), 0.05, seed), { pos: [x, y, z] });
      const leaf = merge([
        s(0.2, -0.05, 0.2, 0, 21),
        s(0.22, 0.03, 0.28, 0.02, 22),
        s(0.25, 0, 0.75, 0, 23),
      ]);
      return { trunk: null, leaf };
    }
    case 'brush': {
      const g = flat(new THREE.CylinderGeometry(1, 1, 1, 5, 6, true));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) + 0.5; // 0..1
        const ring = Math.round(t * 6);
        const w = (0.13 * Math.pow(1 - t, 0.9) + 0.005) * (1 + (hash01(ring, 0, 0, 5) - 0.5) * 0.7);
        const jx = (hash01(p.getX(i), ring, p.getZ(i), 9) - 0.5) * 0.35;
        const sway = Math.sin(t * 3.1) * 0.07 + (hash01(ring, 1, 1, 3) - 0.5) * 0.05;
        p.setXYZ(i, p.getX(i) * w * (1 + jx) + sway, t, p.getZ(i) * w * 0.7);
      }
      return { trunk: null, leaf: merge([g]) };
    }
    case 'crystal': {
      const parts = [
        ...shard(0.14, 1.0, 6),
        place(merge(shard(0.08, 0.55, 5)), { pos: [0.12, 0.03, 0.02], rot: [0, 0, -0.18] }),
        place(merge(shard(0.07, 0.42, 5)), { pos: [-0.11, 0.03, -0.03], rot: [0, 0, 0.2] }),
      ];
      return { trunk: null, leaf: merge(parts) };
    }
    case 'windharp': {
      // Longlight Haze scenery set (unit height 1): leaf = wind harp (bent mast, crossbar, 3 taut strings);
      // extra.arch = half-buried ring arch; extra.reed = cluster of thin reed stalks. One material, three instanced meshes.
      const rng = mulberry32(777);
      const parts = [];
      const N = 5, bend = 0.2, pts = [];
      for (let i = 0; i <= N; i++) { const t = i / N; pts.push([bend * t * t, t * 1.05]); }
      for (let i = 0; i < N; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(x1 - x0, y1 - y0);
        const r0 = 0.05 * (1 - i / N * 0.7), r1 = 0.05 * (1 - (i + 1) / N * 0.7);
        parts.push(place(cyl(r1, r0, len * 1.04, 5, false), { pos: [x0, y0, 0], rot: [0, 0, -ang] }));
      }
      const [tx, ty] = pts[N];
      parts.push(place(box(0.5, 0.035, 0.035), { pos: [tx - 0.12, ty - 0.08, 0] }));
      parts.push(place(cone(0.05, 0.12, 5, false), { pos: [tx, ty, 0] }));
      for (let k = 0; k < 3; k++) { // strings from the crossbar down to the mast
        const xa = tx - 0.14 - 0.1 * k, ya = ty - 0.08, xb = bend * 0.16 + 0.02, yb = 0.32 + 0.05 * k;
        const len = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(xb - xa, yb - ya) ;
        parts.push(place(cyl(0.02, 0.02, len, 3, false), { pos: [xa, ya, 0], rot: [0, 0, -ang] }));
      }
      const arch = merge([place(new THREE.TorusGeometry(0.42, 0.07, 5, 16), { pos: [0, 0.14, 0] })]);
      const rp = [];
      for (let i = 0; i < 8; i++) {
        const a = rng() * 6.28, d = 0.03 + rng() * 0.12, h = 0.45 + rng() * 0.5;
        rp.push(place(cone(0.022, h, 3, false), { pos: [Math.cos(a) * d, 0, Math.sin(a) * d], rot: [(rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5] }));
      }
      return { trunk: null, leaf: merge(parts), extra: { arch, reed: merge(rp) } };
    }
    case 'cactus': {
      const parts = [
        place(cyl(0.085, 0.1, 0.9, 5, false)),
        place(cone(0.085, 0.1, 5, false), { pos: [0, 0.9, 0] }),
        // right arm
        place(cyl(0.05, 0.05, 0.16, 5, false), { pos: [0.08, 0.4, 0], rot: [0, 0, -Math.PI / 2] }),
        place(cyl(0.05, 0.05, 0.3, 5, false), { pos: [0.2, 0.34, 0] }),
        // left arm
        place(cyl(0.05, 0.05, 0.16, 5, false), { pos: [-0.08, 0.56, 0], rot: [0, 0, Math.PI / 2] }),
        place(cyl(0.05, 0.05, 0.26, 5, false), { pos: [-0.2, 0.5, 0] }),
      ];
      return { trunk: null, leaf: merge(parts) };
    }
    case 'cone':
    default: {
      // D: 2-tone paper tiers. Each tier = lit upper cone (x1.0) over a darker skirt band (x0.62) with a slight ledge.
      const trunk = merge([place(cyl(0.035, 0.05, 0.22, 6, false))]);
      const parts = [], cols = [];
      const tier = (r, h, y, rot) => {
        const kBand = 0.38, rMid = r * (1 - kBand);
        const skirt = place(cyl(rMid * 1.0, r, h * kBand, 7, false), { pos: [0, y, 0], rot: [0, rot, 0] });
        const top = place(cone(rMid, h * (1 - kBand), 7, false), { pos: [0, y + h * kBand, 0], rot: [0, rot, 0] });
        parts.push(skirt, top);
        cols.push([0.4, 0.5, 0.45, skirt.attributes.position.count], [1.7, 2.0, 1.35, top.attributes.position.count]);
      };
      tier(0.27, 0.4, 0.14, 0);
      tier(0.2, 0.38, 0.38, 0.4);
      tier(0.14, 0.34, 0.62, 0.8);
      const leaf = merge(parts);
      const col = new Float32Array(leaf.attributes.position.count * 3);
      let o = 0;
      for (const [r, g, b, n] of cols) for (let i = 0; i < n; i++, o += 3) { col[o] = r; col[o + 1] = g; col[o + 2] = b; }
      leaf.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return { trunk, leaf };
    }
  }
}

// ---------- rocks ----------
function buildRock(shape) {
  switch (shape) {
    case 'gumdrop': {
      const g = flat(new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2));
      return fitRock(merge([place(g, { scale: [1, 1.1, 1] })]));
    }
    case 'bone': {
      const main = jitter(flat(new THREE.IcosahedronGeometry(1, 1)), 0.1, 31);
      const parts = [
        place(main, { pos: [0, 0.6, 0], scale: [0.85, 0.6, 0.7] }),
        place(jitter(flat(new THREE.IcosahedronGeometry(1, 0)), 0.12, 32), {
          pos: [0.55, 0.85, 0.15], scale: [0.35, 0.35, 0.35],
        }),
        place(jitter(flat(new THREE.IcosahedronGeometry(1, 0)), 0.12, 33), {
          pos: [-0.5, 0.8, 0.2], scale: [0.32, 0.32, 0.32],
        }),
      ];
      return fitRock(merge(parts));
    }
    case 'cube': {
      return fitRock(merge([place(box(1, 1, 1), { rot: [0, 0.4, 0], scale: [1.38, 1.2, 1.38] })]));
    }
    case 'cloud': {
      const s = (r, x, y, z, seed) =>
        place(jitter(flat(sphere(r, 6, 4)), 0.05, seed), { pos: [x, y, z] });
      return fitRock(merge([
        s(0.55, -0.45, 0.55, 0.1, 41),
        s(0.6, 0.35, 0.6, -0.1, 42),
        s(0.5, 0.0, 0.5, 0.5, 43),
        s(0.45, 0.0, 1.0, -0.05, 44),
      ]));
    }
    case 'blot': {
      const g = flat(new THREE.IcosahedronGeometry(1, 1));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const a = Math.atan2(z, x);
        const lobe = 1 + 0.22 * Math.sin(a * 3 + 0.7) + 0.12 * Math.sin(a * 5 + 2.1);
        const f = lobe * (1 + (hash01(x, p.getY(i), z, 51) - 0.5) * 0.2);
        p.setXYZ(i, x * f, p.getY(i), z * f);
      }
      return fitRock(merge([place(g, { scale: [1, 0.3, 1] })]));
    }
    case 'crystal': {
      const parts = [];
      const rng = mulberry32(61);
      const spec = [
        [0.3, 1.35, 0, 0, 0.0],
        [0.24, 1.0, 0.5, 0.1, 0.3],
        [0.22, 0.85, -0.45, 0.25, -0.35],
        [0.2, 0.75, 0.1, -0.5, 0.25],
        [0.18, 0.6, -0.1, 0.5, -0.2],
      ];
      for (const [r, h, x, z, lean] of spec) {
        const tilt = lean + (rng() - 0.5) * 0.1;
        const sh = merge(shard(r, h, 5));
        parts.push(place(sh, {
          pos: [x, 0.04 + Math.abs(Math.sin(tilt)) * r, z],
          rot: [tilt * 0.7, rng() * 3, tilt],
        }));
      }
      return fitRock(merge(parts));
    }
    case 'boulder':
    default: {
      // D: faceted paper boulder. Icosahedron detail 1, strong jitter, flattened crown plateau; vertex colour
      // multipliers: lit top facets x2.6 (cool), side facets x1.0, low skirt x0.8. Multipliers apply on rockColor.
      const g = jitter(flat(new THREE.IcosahedronGeometry(1, 1)), 0.26, 71, 0.18);
      const p0 = g.attributes.position;
      for (let i = 0; i < p0.count; i++) { // pull the crown into a plateau so the top reads as one facet
        const y = p0.getY(i);
        if (y > 0.55) p0.setY(i, 0.55 + (y - 0.55) * 0.25);
      }
      const geo = fitRock(merge([place(g, { scale: [1, 0.95, 1] })]));
      const pos = geo.attributes.position, nrm = geo.attributes.normal;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const ny = nrm.getY(i), y = pos.getY(i);
        let r = 1, gg = 1, b = 1.05;
        if (ny > 0.55) { r = 4.6; gg = 5.4; b = 6.6; }
        else if (ny > 0.2) { r = 1.5; gg = 1.65; b = 2.0; }
        else if (y < 0.18) { r = gg = b = 0.8; }
        col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    }
  }
}

// ---------- public API (cached) ----------
const treeCache = new Map();
const rockCache = new Map();

export function treeGeometry(shape) {
  const key = SHAPE_IDS.tree.includes(shape) ? shape : 'cone';
  let r = treeCache.get(key);
  if (!r) {
    r = buildTree(key);
    treeCache.set(key, r);
  }
  return r;
}

export function rockGeometry(shape) {
  const key = SHAPE_IDS.rock.includes(shape) ? shape : 'boulder';
  let g = rockCache.get(key);
  if (!g) {
    g = buildRock(key);
    rockCache.set(key, g);
  }
  return g;
}
