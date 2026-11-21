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
  if (sun.soft) for (let d = 0.5; d <= 40; d += 0.5) elev.push(d * DEG); // smooth gradient: a ring every half degree where the portrait frame looks
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
  const CVN = sun.soft ? 1024 : 256;
  cv.width = cv.height = CVN;
  const g = cv.getContext('2d');
  g.scale(CVN / 128, CVN / 128);
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
  if (sun.soft) { // soft disc: radial falloff, bright core with a feathered rim (no hard edge, no bloom pass)
    const gr = g.createRadialGradient(64, 64, discR * 0.55, 64, 64, discR * 1.25);
    gr.addColorStop(0, css); gr.addColorStop(0.55, css); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, discR * 1.25, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = css;
    g.beginPath(); g.arc(64, 64, discR, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const smat = new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(smat);
  const d = new THREE.Vector3().fromArray(sun.dir || [0.4, 0.6, 0.7]).normalize();
  const SR = sun.soft ? 288 : 268; // soft look: behind the far ridge strip (r 270) so dunes cover the lower disc
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
// (duplicate vertices), rounded jags (low-frequency smooth noise). opts { edge, edgeH, shadowH, shadowK, seg, stepped, blockSeg, steps, brush }. fog:false, 1 draw call.
// stepped: blocky mesa look (flat plateaus, vertical walls). brush: ink look (ragged, bristly top edge). Colours come from args; no theme literals.
export function makePaperRange(seed, radius, baseY, peakH, color, opts) {
  const o = opts || {};
  const stepped = !!o.stepped, brush = !!o.brush;
  const SEG = o.seg || (brush ? 160 : 96);
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
  const heightAt = (u) => {
    const n = 0.65 * vn(u * 7 + seed) + 0.35 * vn(u * 16 + 3 + seed);
    return peakH * (0.25 + 0.75 * Math.min(1, n * 1.3)) - baseY; // tops stay at peakH-relative height whatever baseY is
  };
  // columns: { u, h }. Smooth = SEG+1 columns. Stepped = flat plateaus (blocks of o.blockSeg segments, heights quantised to
  // o.steps levels) with vertical walls; the wall columns duplicate u so there is no slanted edge. Brush = ragged top edge.
  const cols = [];
  if (stepped) {
    const blk = Math.max(1, o.blockSeg || 5), levels = Math.max(2, o.steps || 6);
    const nb = Math.ceil(SEG / blk);
    for (let k = 0; k < nb; k++) {
      const u0 = k / nb, u1 = (k + 1) / nb;
      const hs = heightAt((u0 + u1) / 2);
      const q = peakH / levels;
      const h = Math.max(q, Math.round(hs / q) * q);
      cols.push({ u: u0, h }, { u: u1, h });
    }
  } else {
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      let h = heightAt(u);
      if (brush) {
        // bristle jitter, plus an occasional dry-brush dip; deterministic from seed + column index
        const j = hashInt(i * 7 + seed * 131) - 0.5;
        const dip = hashInt(i * 13 + seed * 17 + 5) > 0.9 ? 0.1 : 0;
        h = h * (1 + 0.07 * j - dip) + 0.6 * (vn(u * 90 + seed) - 0.5);
      }
      cols.push({ u, h: Math.max(shH + edgeH + 0.1, h) });
    }
  }
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
  for (const cl of cols) {
    const a = (cl.u - 0.5) * 120 * DEG;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius, h = cl.h;
    push(x, baseY, z, cShadow); push(x, baseY + shH, z, cShadow);
    push(x, baseY + shH, z, cBody); push(x, baseY + h - edgeH, z, cBody);
    push(x, baseY + h - edgeH, z, cEdge); push(x, baseY + h, z, cEdge);
  }
  for (let i = 0; i < cols.length - 1; i++) {
    if (stepped && cols[i].u === cols[i + 1].u) { // wall between blocks: join the two heights with a vertical quad
      // same x,z: no area to draw
      continue;
    }
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


// ---------------------------------------------------------------- Longlight Haze range
// Smooth dune silhouette: vertex colour runs rim -> body -> haze colour (dissolves at the base), no outline, no bands.
// opts: { fade, rim, rimH, fadeH, towers: n thin towers on the ridge }. Draw calls: 1.
export function makeSoftRange(seed, radius, baseY, peakH, color, opts) {
  const o = opts || {};
  const SEG = 160;
  const rnd = mulberry32(seed);
  const lat = [];
  for (let i = 0; i < 96; i++) lat.push(rnd());
  const vn = (x) => {
    const i = Math.floor(x), f = smooth(x - i);
    return lat[((i % 96) + 96) % 96] * (1 - f) + lat[(((i + 1) % 96) + 96) % 96] * f;
  };
  const cBody = new THREE.Color(color), cFade = new THREE.Color(o.fade || '#ffb070'), cRim = new THREE.Color(o.rim || '#ffcf8a');
  const rimH = o.rimH || 0.8, fadeH = o.fadeH || 24;
  const sf = o.soften || 0;
  cBody.lerp(cFade, sf * 0.6);
  const cMid = cBody.clone().lerp(cFade, 0.12), cRim2 = cBody.clone().lerp(cRim, 0.55).lerp(cFade, sf * 0.5), cRim1 = cBody.clone().lerp(cRim, 0.9).lerp(cFade, sf * 0.5);
  const cTow = cBody.clone().lerp(new THREE.Color('#3a1f50'), 0.55);
  const heightAt = (u) => {
    const n = 0.62 * vn(u * 4.5 + seed) + 0.28 * vn(u * 9 + 3 + seed) + 0.1 * vn(u * 22 + seed * 3);
    const x = u * (o.dunes || 6) + seed * 0.37, f = x - Math.floor(x), saw = f < 0.78 ? f / 0.78 : (1 - f) / 0.22; // slow windward rise, steep lee: reads as dunes, not waves
    const m = o.saw != null ? o.saw : 0.4;
    return peakH * (0.25 + 0.75 * Math.min(1, (n * (1 - m) + saw * saw * (3 - 2 * saw) * m) * 1.25)) - baseY;
  };
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
  const ROWS = 6;
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG, a = (u - 0.5) * 120 * DEG;
    const x = Math.sin(a) * radius, z = Math.cos(a) * radius, top = baseY + heightAt(u);
    push(x, top, z, cRim1);
    push(x, top - rimH, z, cRim2);
    push(x, top - rimH * 2.6, z, cBody);
    push(x, top - fadeH * 0.4, z, cMid);
    push(x, top - fadeH, z, cFade);
    push(x, baseY, z, cFade);
  }
  for (let i = 0; i < SEG; i++) for (let r = 0; r < ROWS - 1; r++) {
    const a = i * ROWS + r, b = (i + 1) * ROWS + r;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // distant towers: slim silhouettes standing on the ridge (a few triangles each)
  const nT = o.towers || 0;
  for (let k = 0; k < nT; k++) {
    const u = 0.5 + (rnd() - 0.5) * 0.42, a = (u - 0.5) * 120 * DEG;
    const hw = 0.0016 + rnd() * 0.0012, th = radius * (0.022 + rnd() * 0.03);
    const ground = baseY + heightAt(u) - 0.6;
    const b = pos.length / 3;
    for (const [da, y, c] of [[-hw, ground, cTow], [hw, ground, cTow], [hw * 0.8, ground + th * 0.86, cTow], [-hw * 0.8, ground + th * 0.86, cTow], [0, ground + th, cRim1]]) {
      push(Math.sin(a + da) * radius * 0.998, y, Math.cos(a + da) * radius * 0.998, c);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b + 3, b + 2, b + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
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
  const cSled = new THREE.Color(cs.sled != null ? cs.sled : 0x8a8f98);
  const cSkid = cSled.clone().multiplyScalar(0.75);
  const hullMat = new THREE.MeshStandardMaterial({ color: cSled, flatShading: true, roughness: 0.5, metalness: 0.1 });
  const skidMat = new THREE.MeshStandardMaterial({ color: cSkid, flatShading: true, roughness: 0.6, metalness: 0.1 });
  const wingMat = new THREE.MeshLambertMaterial({ color: cs.wing != null ? cs.wing : 0xdddddd, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: cs.glow != null ? cs.glow : 0xffffff, fog: false });
  const suitMat = new THREE.MeshLambertMaterial({ color: cs.suit != null ? cs.suit : 0x444a55, flatShading: true });
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
  // D: flat runner plates under each skid, bright nose caps
  for (const sx of [-0.5, 0.5]) skids.push(boxG(0.26, 0.04, 1.95, sx, -0.2, -0.12), boxG(0.22, 0.05, 0.14, sx, -0.04, 0.95, -tilt));
  // handlebar and column (in the skid colour so the bar reads as hardware)
  skids.push(boxG(0.5, 0.04, 0.04, 0, 0.28, 0.35), boxG(0.04, 0.18, 0.04, 0, 0.19, 0.35));
  // d. tail wing 1.00 x 0.04 x 0.22 at z -0.85, y 0.34, on two 0.05 posts
  const wing = [boxG(1.0, 0.04, 0.22, 0, 0.34, -0.85), boxG(0.05, 0.24, 0.05, -0.3, 0.22, -0.82), boxG(0.05, 0.24, 0.05, 0.3, 0.22, -0.82)];
  // e. glow strips 0.05 x 0.03 x 1.60 under each skid, rear plate 0.50 x 0.10 at z -0.78
  // D: twin canted tail fins (hull colour) + pennant flag on the left fin
  const fins = [boxG(0.14, 0.34, 0.14, -0.42, 0.4, -0.84), boxG(0.14, 0.34, 0.14, 0.42, 0.4, -0.84)];
  const flagMat = new THREE.MeshLambertMaterial({ color: cs.scarf != null ? cs.scarf : 0xffc933, flatShading: true });
  const flag = [hexaG([V(0, 0, -0.015), V(0.02, 0, -0.015), V(0.02, 0.15, -0.015), V(0, 0.15, -0.015),
                        V(0, 0, 0.015), V(0.26, 0.05, 0.015), V(0.26, 0.1, 0.015), V(0, 0.15, 0.015)])];
  const glow = [boxG(0.05, 0.03, 1.6, -0.5, -0.215, -0.1), boxG(0.05, 0.03, 1.6, 0.5, -0.215, -0.1), boxG(0.5, 0.1, 0.04, 0, 0, -0.78)];

  const group = new THREE.Group();
  const meshes = [];
  const add = (parent, list, mat) => { const m = new THREE.Mesh(mergeG(list), mat); parent.add(m); meshes.push(m); return m; };
  add(group, hull, hullMat);
  add(group, skids, skidMat);
  add(group, wing, wingMat);
  add(group, glow, glowMat);
  add(group, fins, hullMat);
  { // flag: side-facing pennant streaming back (-z) from the fin top; hexaG built along +z so flip it
    const f = add(group, flag, flagMat); f.position.set(-0.42, 0.57, -0.84);
  }

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
  add(pilot, [boxG(0.1, 0.05, 0.4, 0, hc.y + 0.235, hc.z), boxG(0.4, 0.07, 0.08, 0, hc.y - 0.02, hc.z - 0.2)], stripeMat);
  // D: scarf streaming behind the neck, 4 tapering paper strips with a droop
  const scarfMat = new THREE.MeshLambertMaterial({ color: cs.scarf != null ? cs.scarf : 0xffc933, flatShading: true });
  const nk = { y: dirY * 0.4, z: bz + dirZ * 0.4 };
  const scarf = [boxG(0.4, 0.1, 0.12, 0, nk.y - 0.03, nk.z - 0.02),
    boxG(0.3, 0.05, 0.3, 0.14, nk.y - 0.02, nk.z - 0.2, 0.2, -0.2), boxG(0.26, 0.05, 0.3, 0.32, nk.y - 0.06, nk.z - 0.44, 0.25, -0.3),
    boxG(0.2, 0.045, 0.28, 0.5, nk.y - 0.12, nk.z - 0.66, 0.3, -0.4)];
  add(pilot, scarf, scarfMat);

  return {
    group,
    glowMats: [glowMat],
    setLean(roll) { pilot.rotation.z = roll * 0.5; },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const m of [hullMat, skidMat, wingMat, glowMat, suitMat, helmMat, stripeMat, flagMat, scarfMat]) m.dispose();
    },
  };
}

// ---------------------------------------------------------------- S8 trail + spray
// Two ribbons (24 segments, 0.12 m wide) as one mesh: a head point at the skid tail plus 24 time-sampled history points,
// vertex alpha 1 -> 0 along the length. opts: { width:0.12, interval:1/90 s between samples (length = 24 x interval x speed) }.
// Set mesh.material.opacity for the look's overall alpha. Draw calls: 1.
const _tcol = new THREE.Color();
export function makeTrail(color, opts) {
  const o = opts || {};
  const W = (o.width || 0.12) / 2;
  const interval = o.interval || 1 / 90;
  const SEGS = 24, PTS = SEGS + 1, RIB = 2;
  const c = new THREE.Color(color), cTo = o.to ? new THREE.Color(o.to) : null;
  const nv = RIB * PTS * 2;
  const P = new Float32Array(nv * 3);
  const C = new Float32Array(nv * 4);
  const idx = [];
  for (let r = 0; r < RIB; r++) {
    for (let i = 0; i < PTS; i++) {
      const v = (r * PTS + i) * 2;
      const a = cTo ? Math.pow(1 - i / SEGS, 0.8) : 1 - i / SEGS;
      const cc = cTo ? _tcol.copy(c).lerp(cTo, Math.min(1, i / SEGS * 1.3)) : c;
      for (let k = 0; k < 2; k++) {
        C[(v + k) * 4] = cc.r; C[(v + k) * 4 + 1] = cc.g; C[(v + k) * 4 + 2] = cc.b; C[(v + k) * 4 + 3] = a;
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

// ---------------------------------------------------------------- C: drifting cut-out clouds
// Flat paper clouds on a sky sphere (R 250, inside the dome): lit discs + flat base, a cool shade slab clipped along the bottom.
// One mesh, one draw call. Drift is done in the vertex shader (wrap inside +-0.9 rad of azimuth), so the clouds never rebuild.
// opts: { n, lit, shade, elMin, elMax, seed }. update(t, camera) moves the group to the camera and advances time.
export function makeClouds(opts) {
  if (opts && opts.streak) return makeStreakClouds(opts);
  const o = opts || {};
  const rnd = mulberry32(o.seed || 5);
  const R = 250, N = o.n || 9;
  const pos = [], col = [], ph = [], idx = [];
  const cLit = new THREE.Color(o.lit || '#ffffff'), cShade = new THREE.Color(o.shade || '#cfe0f2');
  const addPoly = (pts, c, az, el) => { // pts = [[x,y]...] convex, angular units; mapped onto the sphere around (az, el)
    const ce = Math.cos(el), se = Math.sin(el);
    const dir = [Math.sin(az) * ce, se, Math.cos(az) * ce];
    const right = [Math.cos(az), 0, -Math.sin(az)];
    const up = [-Math.sin(az) * se, ce, -Math.cos(az) * se];
    const b = pos.length / 3;
    for (const p of pts) {
      pos.push((dir[0] + right[0] * p[0] + up[0] * p[1]) * R, (dir[1] + right[1] * p[0] + up[1] * p[1]) * R, (dir[2] + right[2] * p[0] + up[2] * p[1]) * R);
      col.push(c.r, c.g, c.b); ph.push(az);
    }
    for (let i = 1; i < pts.length - 1; i++) idx.push(b, b + i, b + i + 1);
  };
  const clip = (pts, y0) => { // keep y <= y0 (Sutherland-Hodgman, one plane)
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ain = a[1] <= y0, bin = b[1] <= y0;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (y0 - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, y0]); }
    }
    return out;
  };
  const disc = (cx, cy, r, seg) => { const p = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92]); } return p; };
  for (let k = 0; k < N; k++) {
    const az = -0.62 + (k + 0.15 + rnd() * 0.5) * (1.24 / N);
    const el = (o.elMin || 0.08) + rnd() * ((o.elMax || 0.17) - (o.elMin || 0.08));
    const wd = 0.075 + rnd() * 0.055, ht = wd * 0.4;
    const nb = 3 + Math.floor(rnd() * 3);
    const shapes = [];
    // flat base slab + 3-5 bumps standing on it, biggest in the middle
    shapes.push([[-wd * 0.5, 0], [wd * 0.5, 0], [wd * 0.5, ht * 0.3], [-wd * 0.5, ht * 0.3]]);
    for (let b = 0; b < nb; b++) {
      const u = (b + 0.5) / nb;
      const r = ht * (0.42 + 0.5 * Math.sin(u * Math.PI)) * (0.8 + rnd() * 0.3);
      shapes.push(disc((u - 0.5) * wd * 0.85, ht * 0.28 + r * 0.25, r, 14));
    }
    const y0 = ht * 0.2;
    for (const s of shapes) addPoly(s.map((p) => [p[0], Math.max(p[1], 0)]), cLit, az, el);
    for (const s of shapes) { const c = clip(s.map((p) => [p[0], Math.max(p[1], 0)]), y0); if (c.length > 2) addPoly(c, cShade, az, el); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false });
  const uT = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPh;\nuniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
 float dd = mod( uT * ${(o.speed || 0.012).toFixed(4)} + aPh + 0.9, 1.8 ) - 0.9 - aPh;
 float cs = cos( dd ), sn = sin( dd );
 transformed = vec3( cs * transformed.x + sn * transformed.z, transformed.y, -sn * transformed.x + cs * transformed.z );`);
  };
  mat.customProgramCacheKey = () => 'clouds';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -8;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(t, camera) { uT.value = t; mesh.position.copy(camera.position); },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}


// Longlight Haze clouds: thin horizontal lens streaks, lit from below (warm underside, rose top), soft tapered ends via vertex alpha.
function makeStreakClouds(o) {
  const rnd = mulberry32(o.seed || 5);
  const R = 250, N = o.n || 3, SEGS = 14;
  const pos = [], col = [], ph = [], idx = [];
  const cLo = new THREE.Color(o.lit || '#ffb070'), cHi = new THREE.Color(o.shade || '#e0607a');
  for (let k = 0; k < N; k++) {
    const az = -0.5 + (k + 0.3 + rnd() * 0.4) * (1.0 / N);
    const el = (o.elMin || 0.17) + rnd() * ((o.elMax || 0.3) - (o.elMin || 0.17)) + k * 0.012;
    const wd = 0.2 + rnd() * 0.12, ht = 0.011 + rnd() * 0.007;
    const ce = Math.cos(el), se = Math.sin(el);
    const dir = [Math.sin(az) * ce, se, Math.cos(az) * ce], right = [Math.cos(az), 0, -Math.sin(az)], up = [-Math.sin(az) * se, ce, -Math.cos(az) * se];
    const b0 = pos.length / 3;
    for (let i = 0; i <= SEGS; i++) {
      const u = i / SEGS * 2 - 1, env = Math.pow(1 - u * u, 0.7), x = u * wd * 0.5;
      // 3 rows: underside (bright, lit), middle, top (rose, thin)
      const rows = [[-0.5, cLo, 0.85], [0, cLo.clone().lerp(cHi, 0.45), 0.95], [0.5, cHi, 0.0]];
      for (const [ry, c, a] of rows) {
        const y = ry * ht * env * (ry < 0 ? 0.6 : 1) + (i % 3 - 1) * ht * 0.03;
        pos.push((dir[0] + right[0] * x + up[0] * y) * R, (dir[1] + right[1] * x + up[1] * y) * R, (dir[2] + right[2] * x + up[2] * y) * R);
        col.push(c.r, c.g, c.b, a * (0.35 + 0.65 * env));
        ph.push(az);
      }
    }
    for (let i = 0; i < SEGS; i++) for (let r = 0; r < 2; r++) {
      const a = b0 + i * 3 + r, b = b0 + (i + 1) * 3 + r;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false });
  const uT = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPh;\nuniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
 float dd = sin( uT * 0.02 + aPh * 3.0 ) * 0.04;
 float cs = cos( dd ), sn = sin( dd );
 transformed = vec3( cs * transformed.x + sn * transformed.z, transformed.y, -sn * transformed.x + cs * transformed.z );`);
  };
  mat.customProgramCacheKey = () => 'streakClouds';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -8;
  mesh.frustumCulled = false;
  return { mesh, update(t, camera) { uT.value = t; mesh.position.copy(camera.position); }, dispose() { geo.dispose(); mat.dispose(); } };
}

// ---------------------------------------------------------------- Pack B: chunky ribbon, paper shards, boost fan
// Chunky two-tone ribbon trail (one mesh, 1 draw call): per skid tail an opaque outer band plus a core band that alternates
// colour every 2 segments (road-stripe dash scrolls back = speed cue). Opaque cut paper: it tapers to a point, no alpha fade.
// opts: { width: outer width m, coreW, interval s, alt: dash colour, ground(x,z): y under the ribbon, lift }
export function makeRibbon(outer, core, opts) {
  const o = opts || {};
  const WO = (o.width || 0.5) / 2, WC = (o.coreW || 0.18) / 2;
  const interval = o.interval || 1 / 100, lift = o.lift == null ? 0.07 : o.lift;
  const ground = o.ground || null;
  const SEGS = o.segs || 26, PTS = SEGS + 1, RIB = 2;
  const cOut = new THREE.Color(outer), cCore = new THREE.Color(core), cAlt = new THREE.Color(o.alt || '#ffffff');
  const STR = RIB * 2; // strips: per ribbon [outer, core]; every segment owns its 4 vertices so dash colours stay flat (no blend)
  const nv = STR * SEGS * 4;
  const P = new Float32Array(nv * 3), C = new Float32Array(nv * 3), idx = [];
  for (let s = 0; s < STR; s++) {
    const isCore = s & 1;
    for (let i = 0; i < SEGS; i++) {
      const v = (s * SEGS + i) * 4;
      const col = isCore ? ((i >> 1) & 1 ? cAlt : cCore) : cOut;
      for (let k = 0; k < 4; k++) { C[(v + k) * 3] = col.r; C[(v + k) * 3 + 1] = col.g; C[(v + k) * 3 + 2] = col.b; }
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(P, 3); pa.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa);
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  const hist = [new Float32Array(PTS * 3), new Float32Array(PTS * 3)];
  let primed = false, acc = 0;
  function write() {
    for (let r = 0; r < RIB; r++) {
      const h = hist[r];
      for (let s = 0; s < 2; s++) {
        const strip = r * 2 + s, w0 = s ? WC : WO, yy = lift + s * 0.035;
        for (let i = 0; i < SEGS; i++) {
          for (let e = 0; e < 2; e++) {
            const j = i + e, x = h[j * 3], z = h[j * 3 + 2];
            const w = w0 * Math.pow(1 - j / PTS, 0.6);
            const y = (ground ? ground(x, z) : h[j * 3 + 1]) + yy;
            const v = (strip * SEGS + i) * 4 + e * 2;
            P[v * 3] = x - w; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
            P[(v + 1) * 3] = x + w; P[(v + 1) * 3 + 1] = y; P[(v + 1) * 3 + 2] = z;
          }
        }
      }
    }
    pa.needsUpdate = true;
  }
  function update(leftPos, rightPos, dt) {
    const ps = [leftPos, rightPos];
    if (!primed) {
      for (let r = 0; r < RIB; r++) for (let i = 0; i < PTS; i++) { hist[r][i * 3] = ps[r].x; hist[r][i * 3 + 1] = ps[r].y; hist[r][i * 3 + 2] = ps[r].z; }
      primed = true; acc = 0;
    } else {
      acc += dt;
      let guard = 0;
      while (acc >= interval && guard++ < 4) { acc -= interval; for (let r = 0; r < RIB; r++) hist[r].copyWithin(6, 3, PTS * 3 - 3); }
      if (guard > 0) for (let r = 0; r < RIB; r++) { hist[r][3] = hist[r][0]; hist[r][4] = hist[r][1]; hist[r][5] = hist[r][2]; }
      if (acc >= interval) acc = 0;
    }
    for (let r = 0; r < RIB; r++) { hist[r][0] = ps[r].x; hist[r][1] = ps[r].y; hist[r][2] = ps[r].z; }
    write();
  }
  return { mesh, material: mat, update, dispose() { geo.dispose(); mat.dispose(); } };
}

// Paper shards: N instanced flat kites (navy keyline + coloured face baked into vertex colours, tinted per instance).
// Spin, gravity, settle on the ground, shrink out. 1 draw call. emit({x,y,z, vx,vy,vz, spread, tints:[hex...], size, life, spin}).
export function makeShards(N, opts) {
  const o = opts || {};
  const ground = o.ground || null, key = new THREE.Color(o.key || '#33456b');
  const pos = [], col = [];
  const tri = (pts, c, z) => { for (const p of pts) { pos.push(p[0], p[1], z); col.push(c.r, c.g, c.b); } };
  const white = new THREE.Color('#ffffff');
  tri([[0, 0.56], [-0.3, -0.06], [0.3, 0.0]], key, 0); tri([[-0.3, -0.06], [0, -0.5], [0.3, 0.0]], key, 0);
  tri([[0, 0.47], [-0.24, -0.05], [0.24, 0.0]], white, 0.012); tri([[-0.24, -0.05], [0, -0.4], [0.24, 0.0]], white, 0.012);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const im = new THREE.InstancedMesh(geo, mat, N);
  im.frustumCulled = false; im.renderOrder = 4;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const P = new Float32Array(N * 3), V = new Float32Array(N * 3), R = new Float32Array(N * 3), W = new Float32Array(N * 3);
  const age = new Float32Array(N).fill(9), life = new Float32Array(N).fill(1), size = new Float32Array(N);
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, white); }
  let head = 0, ctr = 0;
  function emit(e) {
    const tints = e.tints || ['#ffffff'];
    const sp = e.spread == null ? 1 : e.spread;
    const i = head; head = (head + 1) % N;
    const a = hashInt(ctr * 7 + 1), b = hashInt(ctr * 7 + 2), c = hashInt(ctr * 7 + 3), d = hashInt(ctr * 7 + 4), f = hashInt(ctr * 7 + 5);
    ctr++;
    P[i * 3] = e.x + (a - 0.5) * 0.25 * sp; P[i * 3 + 1] = e.y; P[i * 3 + 2] = e.z + (b - 0.5) * 0.25 * sp;
    V[i * 3] = (e.vx || 0) + (a - 0.5) * 3 * sp; V[i * 3 + 1] = (e.vy || 0) + b * 2.2 * sp; V[i * 3 + 2] = (e.vz || 0) + (c - 0.5) * 3 * sp;
    R[i * 3] = a * 6.28; R[i * 3 + 1] = b * 6.28; R[i * 3 + 2] = c * 6.28;
    const sc = (e.spin || 9);
    W[i * 3] = (d - 0.5) * sc; W[i * 3 + 1] = (f - 0.5) * sc; W[i * 3 + 2] = (a - 0.5) * sc;
    size[i] = (e.size || 0.6) * (0.6 + 0.8 * d);
    life[i] = (e.life || 0.6) * (0.75 + 0.5 * f);
    age[i] = 0;
    im.setColorAt(i, _c.set(tints[(ctr + (f * 8 | 0)) % tints.length]));
    im.instanceColor.needsUpdate = true;
  }
  function update(dt, camZ) {
    const zc = camZ == null ? -1e9 : camZ;
    for (let i = 0; i < N; i++) {
      if (age[i] >= life[i]) { if (age[i] < 9) { im.setMatrixAt(i, zero); age[i] = 9; } continue; }
      age[i] += dt;
      V[i * 3 + 1] -= 9 * dt;
      const dr = Math.exp(-1.2 * dt);
      V[i * 3] *= dr; V[i * 3 + 2] *= dr;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      let spin = 1;
      if (ground) {
        const gy = ground(P[i * 3], P[i * 3 + 2]) + 0.05;
        if (P[i * 3 + 1] < gy) { P[i * 3 + 1] = gy; V[i * 3 + 1] *= -0.15; V[i * 3] *= 0.6; V[i * 3 + 2] *= 0.6; spin = 0.15; }
      }
      R[i * 3] += W[i * 3] * dt * spin; R[i * 3 + 1] += W[i * 3 + 1] * dt * spin; R[i * 3 + 2] += W[i * 3 + 2] * dt * spin;
      const u = age[i] / life[i], near = Math.min(1, Math.max(0, (P[i * 3 + 2] - zc - 4) / 3)), k = near * size[i] * (u > 0.7 ? Math.max(0, (1 - u) / 0.3) : 1);
      _e.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]); _q.setFromEuler(_e);
      _p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); _s.set(k, k, k);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    im.instanceMatrix.needsUpdate = true;
  }
  return { mesh: im, emit, update, dispose() { geo.dispose(); mat.dispose(); im.dispose(); } };
}

// Boost fan: flat paper starburst (alternating long / short rays, keyline + two-tone face) laid on the ground behind the sled.
// Local XY plane, rays toward +Y; orient with the ground quaternion. 1 draw call. setLevel(0..1) scales it.
export function makeBoostFan(a, b, key) {
  const pos = [], col = [];
  const ca = new THREE.Color(a), cb = new THREE.Color(b), ck = new THREE.Color(key || '#33456b');
  const RAYS = 9, SPAN = 1.15;
  const ray = (ang, len, wid, c, z) => {
    const ox = Math.sin(ang), oy = -Math.cos(ang);
    const px = Math.cos(ang), py = Math.sin(ang);
    for (const p of [[-px * wid, -py * wid + 0.0, 0], [px * wid, py * wid, 0], [ox * len, oy * len, 0]]) { pos.push(p[0], p[1], z); col.push(c.r, c.g, c.b); }
  };
  for (let i = 0; i < RAYS; i++) {
    const ang = -SPAN + (2 * SPAN * i) / (RAYS - 1), long = i % 2 === 0;
    const len = long ? 1.9 : 1.1, wid = long ? 0.2 : 0.16;
    ray(ang, len + 0.12, wid + 0.06, ck, 0);
    ray(ang, len, wid, long ? ca : cb, 0.01);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  return { mesh, dispose() { geo.dispose(); mat.dispose(); } };
}
