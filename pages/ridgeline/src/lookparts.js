// Ridgeline look parts: pure factories for sky dome, range strips, blob texture, sled model, trail, spray.
// No globals, no Math.random (index hashes and mulberry32 only). Units metres, +z downhill (and forward), y up.
// Every factory returns a dispose() so callers can free GPU memory when a look is swapped.
import * as THREE from '../vendor/three.module.js';
import { mulberry32 } from './rng.js';

const DEG = Math.PI / 180;

// Deterministic [0,1) from an integer (no Math.random).
function hashInt(i) {
  let h = (i | 0) + 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------- S1 sky dome
// stops: [[t, '#hex'], ...] sorted by t. t is elevation / 90 deg: 0 = horizon (and everything below it), 1 = zenith.
// Equal t on two stops makes a hard band seam (extra rings are inserted at every stop).
// sun: { dir:[x,y,z], color, size (deg, hard disc), glow (deg, halo), glowAlpha (0.25), soft (bool: gradient halo) }
// Needs camera.far > 280. Draw calls: 2 (dome + sun sprite).
export function makeSkyDome(stops, sun) {
  const R = 280;
  const cols = stops.map((s) => [s[0], new THREE.Color(s[1])]);
  const tmp = new THREE.Color();
  function sample(t) {
    if (t <= cols[0][0]) return tmp.copy(cols[0][1]);
    for (let i = 1; i < cols.length; i++) {
      if (t <= cols[i][0]) {
        const a = cols[i - 1], b = cols[i];
        const span = b[0] - a[0];
        return tmp.copy(a[1]).lerp(b[1], span > 1e-6 ? (t - a[0]) / span : 1);
      }
    }
    return tmp.copy(cols[cols.length - 1][1]);
  }

  // elevation rings: uniform plus a pair around every stop so seams stay sharp
  const elev = [-25 * DEG];
  const RINGS = 24;
  for (let i = 0; i <= RINGS; i++) elev.push((i / RINGS) * 90 * DEG);
  for (const s of cols) {
    const e = s[0] * 90 * DEG;
    elev.push(e - 0.0004, e + 0.0004);
  }
  elev.sort((a, b) => a - b);
  const ring = elev.filter((e) => e >= -25 * DEG - 1e-9 && e <= 90 * DEG + 1e-9);
  const SEG = 40;
  const pos = [], col = [], idx = [];
  for (let r = 0; r < ring.length; r++) {
    const e = ring[r];
    const c = sample(Math.max(0, e) / (90 * DEG));
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      pos.push(Math.sin(a) * Math.cos(e) * R, Math.sin(e) * R, Math.cos(a) * Math.cos(e) * R);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < ring.length - 1; r++) {
    for (let s = 0; s < SEG; s++) {
      const a = r * (SEG + 1) + s, b = a + SEG + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;

  const group = new THREE.Group();
  group.add(dome);

  // sun sprite: 128 px canvas covering the halo width (or disc if no halo)
  const ringsDeg = (sun.rings || []).map((r) => r.deg);
  const sunDiam = Math.max(sun.size || 6, sun.glow || 0, ...ringsDeg);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.scale(2, 2);
  const c0 = new THREE.Color(sun.color || '#ffffff');
  const rgb = `${Math.round(c0.r * 255)},${Math.round(c0.g * 255)},${Math.round(c0.b * 255)}`;
  const css = '#' + new THREE.Color(sun.color || '#ffffff').getHexString();
  const discR = 64 * ((sun.size || 6) / sunDiam);
  if (sun.glow && sun.glow > (sun.size || 6)) {
    const ga = sun.glowAlpha == null ? 0.25 : sun.glowAlpha;
    if (sun.soft) {
      const gr = g.createRadialGradient(64, 64, discR * 0.5, 64, 64, 64);
      gr.addColorStop(0, `rgba(${rgb},${ga})`);
      gr.addColorStop(0.5, `rgba(${rgb},${ga * 0.4})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
    } else {
      g.fillStyle = `rgba(${rgb},${ga})`;
    }
    g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fill();
  }
  const rc = new THREE.Color(sun.ringColor || sun.color || '#ffffff');
  const rrgb = `${Math.round(rc.r * 255)},${Math.round(rc.g * 255)},${Math.round(rc.b * 255)}`;
  if (sun.rings) { // C: flat concentric rings (stacked translucent discs, largest first), cream
    for (const r of [...sun.rings].sort((a, b) => b.deg - a.deg)) {
      g.fillStyle = `rgba(${rrgb},${r.alpha})`;
      g.beginPath(); g.arc(64, 64, 63 * (r.deg / sunDiam), 0, Math.PI * 2); g.fill();
    }
  }
  g.fillStyle = css;
  g.beginPath(); g.arc(64, 64, discR, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const smat = new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(smat);
  const d = new THREE.Vector3().fromArray(sun.dir || [0.4, 0.6, 0.7]).normalize();
  const SR = 268;
  sprite.position.copy(d).multiplyScalar(SR);
  const w = 2 * SR * Math.tan((sunDiam * DEG) / 2);
  sprite.scale.set(w, w, 1);
  sprite.renderOrder = -9;
  sprite.frustumCulled = false;
  group.add(sprite);

  return {
    group,
    sprite,
    update(camera) { group.position.copy(camera.position); },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); smat.dispose(); },
  };
}

// ---------------------------------------------------------------- S2 range strip
// 120-degree arc ahead (+z), 96 segments, jagged top from seeded value noise, vertex colour top -> base.
// opts (optional): { cap:'#hex', capFrac:0.3 } adds a hard-edged cap colour with a zigzag edge (look A far range).
// Caller moves mesh to camera x/z. Needs camera.far > radius. Draw calls: 1.
export function makeRange(seed, radius, baseY, peakH, colTop, colBase, opts) {
  const o = opts || {};
  const SEG = 96;
  const rnd = mulberry32(seed);
  const lat = [];
  for (let i = 0; i < 96; i++) lat.push(rnd());
  const vn = (x) => {
    const i = Math.floor(x), f = smooth(x - i);
    return lat[((i % 96) + 96) % 96] * (1 - f) + lat[(((i + 1) % 96) + 96) % 96] * f;
  };
  const cTop = new THREE.Color(colTop), cBase = new THREE.Color(colBase);
  const cCap = o.cap ? new THREE.Color(o.cap) : null;
  const capFrac = o.capFrac == null ? 0.3 : o.capFrac;
  // rows: base, [mid (rock colour), mid2 (cap colour)], top
  const rows = cCap ? 4 : 2;
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    const a = (u - 0.5) * 120 * DEG;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    const n = 0.6 * vn(u * 9) + 0.3 * vn(u * 21 + 5) + 0.1 * vn(u * 47 + 11);
    const h = peakH * (0.2 + 0.8 * Math.min(1, n * 1.25));
    pos.push(x, baseY, z); col.push(cBase.r, cBase.g, cBase.b);
    if (cCap) {
      const zig = (i & 1 ? 1 : -1) * 0.09 * h;
      const my = baseY + h * (1 - capFrac) + zig;
      pos.push(x, my, z); col.push(cTop.r, cTop.g, cTop.b);
      pos.push(x, my, z); col.push(cCap.r, cCap.g, cCap.b);
      pos.push(x, baseY + h, z); col.push(cCap.r, cCap.g, cCap.b);
    } else {
      pos.push(x, baseY + h, z); col.push(cTop.r, cTop.g, cTop.b);
    }
  }
  // with a cap, the base-to-mid quad shades base -> rock colour; cap rows are flat
  for (let i = 0; i < SEG; i++) {
    for (let r = 0; r < rows - 1; r++) {
      if (cCap && r === 1) continue; // degenerate seam between duplicate rows
      const a = i * rows + r, b = (i + 1) * rows + r;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}

// ---------------------------------------------------------------- C paper range layer
// Flat single-colour paper layer: base shadow band (shadowH m, colour x shadowK), body, white top edge (edgeH m). Hard seams
// (duplicate vertices), rounded jags (low-frequency smooth noise). opts { edge, edgeH, shadowH, shadowK, seg }. fog:false, 1 draw call.
export function makePaperRange(seed, radius, baseY, peakH, color, opts) {
  const o = opts || {};
  const SEG = o.seg || 96;
  const rnd = mulberry32(seed);
  const lat = [];
  for (let i = 0; i < 96; i++) lat.push(rnd());
  const vn = (x) => {
    const i = Math.floor(x), f = smooth(x - i);
    return lat[((i % 96) + 96) % 96] * (1 - f) + lat[(((i + 1) % 96) + 96) % 96] * f;
  };
  const cBody = new THREE.Color(color);
  const cShadow = cBody.clone().multiplyScalar(o.shadowK || 0.96);
  const cEdge = new THREE.Color(o.edge || '#ffffff');
  const edgeH = o.edgeH || 1, shH = o.shadowH || 3;
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    const a = (u - 0.5) * 120 * DEG;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    const n = 0.65 * vn(u * 7 + seed) + 0.35 * vn(u * 16 + 3 + seed);
    const h = peakH * (0.25 + 0.75 * Math.min(1, n * 1.3)) - baseY; // tops stay at peakH-relative height whatever baseY is
    push(x, baseY, z, cShadow); push(x, baseY + shH, z, cShadow);
    push(x, baseY + shH, z, cBody); push(x, baseY + h - edgeH, z, cBody);
    push(x, baseY + h - edgeH, z, cEdge); push(x, baseY + h, z, cEdge);
  }
  for (let i = 0; i < SEG; i++) {
    for (const r of [0, 2, 4]) {
      const a = i * 6 + r, b = (i + 1) * 6 + r;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}

// ---------------------------------------------------------------- S4 blob texture
// 64 px white radial alpha. edge (0..1, optional): crisp disc, flat alpha out to that radius fraction, then a hard falloff.
// Without edge: soft gradient. Tint and opacity come from the material. Draw calls: 0 (texture only).
export function makeBlobTexture(edge) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (edge == null) {
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.65)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(Math.max(0.01, edge), 'rgba(255,255,255,1)');
    gr.addColorStop(Math.min(1, edge + 0.06), 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- S5 sled model
// Merge helpers: every box is baked into one BufferGeometry per material (position + normal only).
const _mat = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _eu = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

function boxG(w, h, d, x, y, z, rx, rz) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  _eu.set(rx || 0, 0, rz || 0);
  _q.setFromEuler(_eu);
  _mat.compose(_p.set(x, y, z), _q, _s);
  g.applyMatrix4(_mat);
  return g;
}

// closed convex solid from 8 corners (0-3 back face CCW from +z, 4-7 front face same order); faces get outward winding
function hexaG(c) {
  const quads = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 5, 1, 0], [3, 2, 6, 7], [4, 0, 3, 7], [1, 5, 6, 2]];
  const ctr = new THREE.Vector3();
  for (const v of c) ctr.add(v);
  ctr.multiplyScalar(1 / 8);
  const arr = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3(), mid = new THREE.Vector3();
  for (const q of quads) {
    let [a, b, d, e] = q;
    e1.subVectors(c[b], c[a]); e2.subVectors(c[d], c[a]);
    nrm.crossVectors(e1, e2);
    mid.set(0, 0, 0).add(c[a]).add(c[b]).add(c[d]).add(c[e]).multiplyScalar(0.25).sub(ctr);
    if (nrm.dot(mid) < 0) { const t = b; b = e; e = t; }
    for (const i of [a, b, d, a, d, e]) arr.push(c[i].x, c[i].y, c[i].z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}

function mergeG(list) {
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), nn = g.getAttribute('normal');
    P.set(p.array.subarray(0, p.count * 3), o);
    N.set(nn.array.subarray(0, p.count * 3), o);
    o += p.count * 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}

// colors: { sled, glow, suit, wing } (hex number or css string). 2.1 L x 1.15 W x 0.75 H, +z forward, origin hull centre.
// glowMats: one shared MeshBasic material (strips + rear plate); recolour it for charge and boost.
// setLean(roll): extra pilot lean of 0.5 x roll about the hull centre (the caller still banks the whole group).
// Draw calls: 7 (hull, skids and struts and bar, wing and posts, glow, suit, helmet, helmet stripe). No outline hulls.
export function makeSledModel(colors) {
  const cs = colors || {};
  const cSled = new THREE.Color(cs.sled != null ? cs.sled : 0xd81e3a);
  const cSkid = cSled.clone().multiplyScalar(0.75);
  const hullMat = new THREE.MeshStandardMaterial({ color: cSled, flatShading: true, roughness: 0.5, metalness: 0.1 });
  const skidMat = new THREE.MeshStandardMaterial({ color: cSkid, flatShading: true, roughness: 0.6, metalness: 0.1 });
  const wingMat = new THREE.MeshLambertMaterial({ color: cs.wing != null ? cs.wing : 0xf4f7fb, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: cs.glow != null ? cs.glow : 0x35e0ff, fog: false });
  const suitMat = new THREE.MeshLambertMaterial({ color: cs.suit != null ? cs.suit : 0x24406e, flatShading: true });
  const helmMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const stripeMat = new THREE.MeshLambertMaterial({ color: cSled, flatShading: true });

  // a. hull: box 0.80 x 0.20 x 1.50, front 0.5 m tapers to 0.30 wide and rises 0.12
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const hull = [
    boxG(0.8, 0.2, 1.0, 0, 0, -0.25),
    hexaG([V(-0.4, -0.1, 0.25), V(0.4, -0.1, 0.25), V(0.4, 0.1, 0.25), V(-0.4, 0.1, 0.25),
           V(-0.15, 0.02, 0.75), V(0.15, 0.02, 0.75), V(0.15, 0.22, 0.75), V(-0.15, 0.22, 0.75)]),
  ];
  // b. skids 0.16 x 0.12 x 1.90 at x +-0.5, y -0.14, front 0.30 m tipped up 25 deg (main 1.60 + tip 0.30)
  const tilt = 25 * DEG;
  const skids = [];
  for (const sx of [-0.5, 0.5]) {
    skids.push(boxG(0.16, 0.12, 1.6, sx, -0.14, -0.15));
    skids.push(boxG(0.16, 0.12, 0.3, sx, -0.14 + Math.sin(tilt) * 0.15, 0.65 + Math.cos(tilt) * 0.15, -tilt));
  }
  // c. four struts 0.06 x 0.14 x 0.06
  for (const sx of [-0.46, 0.46]) for (const sz of [-0.5, 0.45]) skids.push(boxG(0.06, 0.14, 0.06, sx, -0.09, sz));
  // handlebar and column (in the skid colour so the bar reads as hardware)
  skids.push(boxG(0.5, 0.04, 0.04, 0, 0.28, 0.35), boxG(0.04, 0.18, 0.04, 0, 0.19, 0.35));
  // d. tail wing 1.00 x 0.04 x 0.22 at z -0.85, y 0.34, on two 0.05 posts
  const wing = [boxG(1.0, 0.04, 0.22, 0, 0.34, -0.85), boxG(0.05, 0.24, 0.05, -0.3, 0.22, -0.82), boxG(0.05, 0.24, 0.05, 0.3, 0.22, -0.82)];
  // e. glow strips 0.05 x 0.03 x 1.60 under each skid, rear plate 0.50 x 0.10 at z -0.78
  const glow = [boxG(0.05, 0.03, 1.6, -0.5, -0.215, -0.1), boxG(0.05, 0.03, 1.6, 0.5, -0.215, -0.1), boxG(0.5, 0.1, 0.04, 0, 0, -0.78)];

  const group = new THREE.Group();
  const meshes = [];
  const add = (parent, list, mat) => { const m = new THREE.Mesh(mergeG(list), mat); parent.add(m); meshes.push(m); return m; };
  add(group, hull, hullMat);
  add(group, skids, skidMat);
  add(group, wing, wingMat);
  add(group, glow, glowMat);

  // f. pilot, crouched. Pivot at (0, 0.1, 0) on the hull top so lean rolls about the seat.
  const pilot = new THREE.Group();
  pilot.position.set(0, 0.1, 0);
  group.add(pilot);
  const lean = 35 * DEG;
  const dirY = Math.cos(lean), dirZ = Math.sin(lean);
  const bz = -0.15; // torso base z (local y 0)
  const torso = boxG(0.36, 0.4, 0.28, 0, dirY * 0.2, bz + dirZ * 0.2, lean);
  const suit = [torso];
  const sh = { y: dirY * 0.33, z: bz + dirZ * 0.33 }; // shoulder line
  const barY = 0.28 - 0.1, barZ = 0.35;
  for (const sx of [-1, 1]) {
    const x0 = sx * 0.2, x1 = sx * 0.25;
    const dy = barY - sh.y, dz = barZ - sh.z, dx = x1 - x0;
    const len = Math.hypot(dx, dy, dz);
    // box long axis is z; tilt about x to climb dy over dz (yaw ignored, dx is small)
    suit.push(boxG(0.08, 0.08, len, (x0 + x1) / 2, (sh.y + barY) / 2, (sh.z + barZ) / 2, Math.atan2(-dy, dz)));
  }
  add(pilot, suit, suitMat);
  const hc = { y: dirY * 0.52, z: bz + dirZ * 0.52 };
  const helmGeo = new THREE.IcosahedronGeometry(0.16, 1);
  const helm = new THREE.Mesh(helmGeo, helmMat);
  helm.position.set(0, hc.y, hc.z);
  pilot.add(helm); meshes.push(helm);
  add(pilot, [boxG(0.05, 0.04, 0.3, 0, hc.y + 0.15, hc.z)], stripeMat);

  return {
    group,
    glowMats: [glowMat],
    setLean(roll) { pilot.rotation.z = roll * 0.5; },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const m of [hullMat, skidMat, wingMat, glowMat, suitMat, helmMat, stripeMat]) m.dispose();
    },
  };
}

// ---------------------------------------------------------------- S8 trail + spray
// Two ribbons (24 segments, 0.12 m wide) as one mesh: a head point at the skid tail plus 24 time-sampled history points,
// vertex alpha 1 -> 0 along the length. opts: { width:0.12, interval:1/90 s between samples (length = 24 x interval x speed) }.
// Set mesh.material.opacity for the look's overall alpha. Draw calls: 1.
export function makeTrail(color, opts) {
  const o = opts || {};
  const W = (o.width || 0.12) / 2;
  const interval = o.interval || 1 / 90;
  const SEGS = 24, PTS = SEGS + 1, RIB = 2;
  const c = new THREE.Color(color);
  const nv = RIB * PTS * 2;
  const P = new Float32Array(nv * 3);
  const C = new Float32Array(nv * 4);
  const idx = [];
  for (let r = 0; r < RIB; r++) {
    for (let i = 0; i < PTS; i++) {
      const v = (r * PTS + i) * 2;
      const a = 1 - i / SEGS;
      for (let k = 0; k < 2; k++) {
        C[(v + k) * 4] = c.r; C[(v + k) * 4 + 1] = c.g; C[(v + k) * 4 + 2] = c.b; C[(v + k) * 4 + 3] = a;
      }
      if (i < SEGS) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(P, 3);
  pa.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa);
  geo.setAttribute('color', new THREE.BufferAttribute(C, 4));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  const hist = [new Float32Array(PTS * 3), new Float32Array(PTS * 3)]; // x,y,z per point; [0] = head
  let primed = false, acc = 0;

  function write() {
    for (let r = 0; r < RIB; r++) {
      const h = hist[r];
      for (let i = 0; i < PTS; i++) {
        const v = (r * PTS + i) * 2;
        const x = h[i * 3], y = h[i * 3 + 1], z = h[i * 3 + 2];
        P[v * 3] = x - W; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
        P[(v + 1) * 3] = x + W; P[(v + 1) * 3 + 1] = y; P[(v + 1) * 3 + 2] = z;
      }
    }
    pa.needsUpdate = true;
  }
  const setHead = (r, p) => { hist[r][0] = p.x; hist[r][1] = p.y; hist[r][2] = p.z; };
  function reset() { primed = false; acc = 0; for (const h of hist) h.fill(0); P.fill(0); pa.needsUpdate = true; }
  function update(leftPos, rightPos, dt) {
    const ps = [leftPos, rightPos];
    if (!primed) {
      for (let r = 0; r < RIB; r++) for (let i = 0; i < PTS; i++) { hist[r][i * 3] = ps[r].x; hist[r][i * 3 + 1] = ps[r].y; hist[r][i * 3 + 2] = ps[r].z; }
      primed = true; acc = 0;
    } else {
      acc += dt;
      let guard = 0;
      while (acc >= interval && guard++ < 4) {
        acc -= interval;
        for (let r = 0; r < RIB; r++) hist[r].copyWithin(6, 3, PTS * 3 - 3 + 0); // shift history one slot back, keeping slot 1 free
      }
      // after a shift, slot 1 holds the previous head: refresh it from the head before the head moves
      if (guard > 0) for (let r = 0; r < RIB; r++) { hist[r][3] = hist[r][0]; hist[r][4] = hist[r][1]; hist[r][5] = hist[r][2]; }
      if (acc >= interval) acc = 0;
    }
    for (let r = 0; r < RIB; r++) setHead(r, ps[r]);
    write();
  }
  return { mesh, material: mat, update, reset, dispose() { geo.dispose(); mat.dispose(); } };
}

// Spray: 40-point pool at the skid tails. Triangles (small canvas texture), vertex alpha fades over the life.
// emit(pos, n): spawn n points at pos (n capped by pool; oldest are recycled). Velocities come from an index hash.
// opts: { size:0.15, life:0.4 }. Draw calls: 1.
export function makeSpray(color, opts) {
  const o = opts || {};
  const N = o.n || 40, LIFE = o.life || 0.4, SIZE = o.size || 0.15;
  const c = new THREE.Color(color);
  const P = new Float32Array(N * 3).fill(-1000);
  const C = new Float32Array(N * 4);
  const V = new Float32Array(N * 3);
  const age = new Float32Array(N).fill(LIFE);
  for (let i = 0; i < N; i++) { C[i * 4] = c.r; C[i * 4 + 1] = c.g; C[i * 4 + 2] = c.b; }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(P, 3), ca = new THREE.BufferAttribute(C, 4);
  pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa);
  geo.setAttribute('color', ca);

  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(16, 3); g.lineTo(30, 28); g.lineTo(2, 28); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.PointsMaterial({ size: SIZE, map: tex, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.02, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;

  let head = 0, counter = 0;
  function emit(pos, n) {
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % N;
      const h1 = hashInt(counter * 3 + 1), h2 = hashInt(counter * 3 + 2), h3 = hashInt(counter * 3 + 3);
      counter++;
      P[i * 3] = pos.x + (h1 - 0.5) * 0.2; P[i * 3 + 1] = pos.y + 0.05; P[i * 3 + 2] = pos.z;
      V[i * 3] = (h1 - 0.5) * 3.0;        // sideways spread
      V[i * 3 + 1] = 1.2 + h2 * 2.0;      // up
      V[i * 3 + 2] = -0.5 - h3 * 2.5;     // trails back along the slope
      age[i] = 0;
    }
  }
  function update(dt) {
    for (let i = 0; i < N; i++) {
      if (age[i] >= LIFE) { C[i * 4 + 3] = 0; P[i * 3 + 1] = -1000; continue; }
      age[i] += dt;
      V[i * 3 + 1] -= 7 * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      C[i * 4 + 3] = Math.max(0, 1 - age[i] / LIFE);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;
  }
  return { points, material: mat, emit, update, dispose() { geo.dispose(); mat.dispose(); tex.dispose(); } };
}
