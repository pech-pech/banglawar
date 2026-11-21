// B4 M1: hero sled rig (ported from the mock sledcraft.js + garage.js hull variants). Cosmetic only, reads `vs` only.
// Axes: +z forward, +y up, +x LEFT of the screen seen from behind. Positive roll/steer = right (assumed, see report).
// `group` is the model only (origin at sled centre, same convention as makeSledModel().group); the caller poses it.
// Part sizes are baked into geometry per hull (setHull rebuilds the 4 sized parts); nothing is scaled per frame.
import * as THREE from '../../vendor/three.module.js';

export const KEYS = {
  lookSledRim: { def: 0.9, min: 0, max: 1, step: 0.05, label: 'Sled rim light' },
  lookSledShadow: { def: 0.45, min: 0, max: 0.8, step: 0.05, label: 'Sled blob shadow' },
  lookSledImpactRef: { def: 10, min: 4, max: 24, step: 0.5, label: 'Sled land impact ref (m/s)' },
  lookSledSplay: { def: 0.17, min: 0, max: 0.4, step: 0.01, label: 'Sled skid splay on land' },
  lookSledLean: { def: 0.42, min: 0, max: 0.8, step: 0.02, label: 'Sled rider lean' },
  lookSledFinFold: { def: 0.75, min: 0, max: 0.95, step: 0.05, label: 'Sled fin fold in dive' },
  lookSledScarfLen: { def: 2.2, min: 1, max: 3.5, step: 0.1, label: 'Sled scarf length (m)' },
  lookSledLantern: { def: 7, min: 3, max: 14, step: 0.5, label: 'Sled lantern stiffness' },
};
// size params: hull [w,h,len], skid [w,h,len], stance (skid x), fin [reach,len], scarf [len,width], rider scale, tint. stats = Weight/Steady/Float (1..5).
export const STAT_LABELS = ['Weight', 'Steady', 'Float'];
export const HULLS = {
  wren: { id: 'wren', name: 'WREN', line: 'Light and twitchy. Floats long, lands soft.', stats: [2, 3, 4], unlock: 0, hull: [0.92, 1, 0.95], skid: [1, 0.85, 0.82], stance: 0.92, fin: [0.8, 0.8], scarf: [1, 1], tint: null },
  kite: { id: 'kite', name: 'KITE', line: 'Big wings, big hang time. Nervous on the ground.', stats: [1, 2, 5], unlock: 2800, hull: [0.95, 0.95, 1], skid: [1, 0.85, 0.9], stance: 1, fin: [1.7, 1.25], scarf: [1.15, 1.45], tint: null },
  anvil: { id: 'anvil', name: 'ANVIL', line: 'Heavy and stubborn. Plows through, never floats.', stats: [5, 4, 1], unlock: 5500, hull: [1.3, 0.95, 1.05], skid: [1.45, 0.8, 0.95], stance: 1.18, fin: [0.9, 0.8], scarf: [0.8, 0.8], tint: '#a98fbb' },
  barge: { id: 'barge', name: 'BARGE', line: 'Long and steady. Stays flat when the ridge gets rude.', stats: [4, 5, 2], unlock: 8500, hull: [1.2, 1, 1.18], skid: [1.2, 1, 1.35], stance: 1.3, fin: [1, 1], scarf: [1, 1], tint: '#e3cdb8' },
  spindle: { id: 'spindle', name: 'SPINDLE', line: 'Needle-nosed and quick. Slices the wind, spins on a coin.', stats: [2, 1, 4], unlock: 13500, hull: [0.72, 0.9, 1.22], skid: [0.7, 1, 1.15], stance: 0.78, fin: [0.9, 1.1], scarf: [0.9, 1.1], tint: null },
};
export const HULL_IDS = ['wren', 'kite', 'anvil', 'barge', 'spindle'];

const { Vector3: V3, Color, Matrix4, Quaternion, Euler } = THREE;
const Yax = new V3(0, 1, 0), _m = new Matrix4(), _q = new Quaternion(), _one = new V3(1, 1, 1), _e = new Euler();
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _nk = new V3(), _sc = new V3();
const col = (h) => new Color(h);
const V = (x, y, z) => new V3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SEG = 10, NP = SEG + 1;
const DEG = Math.PI / 180;

class Soup { // triangle soup, one colour per face, flat shaded, baked fake shade (stays bright at dusk)
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, k) { for (const v of [a, b, c]) this.p.push(v.x, v.y, v.z); for (let i = 0; i < 3; i++) this.c.push(k.r, k.g, k.b); }
  quad(a, b, c, d, k) { this.tri(a, b, c, k); this.tri(a, c, d, k); }
  quadOut(a, b, c, d, ctr, k) {
    const n = V(0, 0, 0).subVectors(b, a).cross(V(0, 0, 0).subVectors(c, a));
    const mid = V(0, 0, 0).add(a).add(b).add(c).add(d).multiplyScalar(0.25).sub(ctr);
    if (n.dot(mid) < 0) this.quad(a, d, c, b, k); else this.quad(a, b, c, d, k);
  }
  geo(g, k, m) {
    g = g.index ? g.toNonIndexed() : g.clone(); g.applyMatrix4(m);
    const pa = g.getAttribute('position'), flip = m.determinant() < 0;
    for (let i = 0; i < pa.count; i += 3) {
      _a.fromBufferAttribute(pa, i); _b.fromBufferAttribute(pa, i + 1); _c.fromBufferAttribute(pa, i + 2);
      if (flip) this.tri(_a.clone(), _c.clone(), _b.clone(), k); else this.tri(_a.clone(), _b.clone(), _c.clone(), k);
    }
    g.dispose();
  }
  build(scale) { // scale: optional Vector3 baked into positions (hull part sizes)
    const P = this.p, C = this.c;
    if (scale) for (let i = 0; i < P.length; i += 3) { P[i] *= scale.x; P[i + 1] *= scale.y; P[i + 2] *= scale.z; }
    for (let i = 0; i < P.length; i += 9) {
      _a.set(P[i], P[i + 1], P[i + 2]); _b.set(P[i + 3], P[i + 4], P[i + 5]); _d.set(P[i + 6], P[i + 7], P[i + 8]);
      _b.sub(_a); _d.sub(_a); _b.cross(_d).normalize();
      const f = _b.y >= 0 ? 0.88 + 0.12 * _b.y - 0.04 * Math.abs(_b.x) + 0.05 * Math.max(0, -_b.z) : 0.55 + 0.3 * (1 + _b.y);
      for (let j = 0; j < 9; j++) C[i + j] *= f;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    return g;
  }
}
function bar(s, a, b, r, k, sides, r2) {
  const d = V(0, 0, 0).subVectors(b, a), len = d.length();
  _q.setFromUnitVectors(Yax, d.normalize());
  _m.compose(V(0, 0, 0).addVectors(a, b).multiplyScalar(0.5), _q, _one);
  s.geo(new THREE.CylinderGeometry(r2 != null ? r2 : r, r, len, sides || 5, 1), k, _m);
}
function ball(s, p, r, k, seg) { _m.compose(p, _q.identity(), _one); s.geo(new THREE.SphereGeometry(r, seg || 8, 6), k, _m); }
function boxAt(s, w, h, d, x, y, z, rx, k) { _q.setFromEuler(_e.set(rx || 0, 0, 0)); _m.compose(V(x, y, z), _q, _one); s.geo(new THREE.BoxGeometry(w, h, d), k, _m); }
function slab(s, A, B, C, D, down, k) {
  const A2 = A.clone().add(down), B2 = B.clone().add(down), C2 = C.clone().add(down), D2 = D.clone().add(down);
  const ctr = V(0, 0, 0).add(A).add(B).add(C).add(D).add(A2).add(B2).add(C2).add(D2).multiplyScalar(1 / 8);
  s.quadOut(A, B, C, D, ctr, k); s.quadOut(A2, B2, C2, D2, ctr, k);
  s.quadOut(A, B, B2, A2, ctr, k); s.quadOut(B, C, C2, B2, ctr, k); s.quadOut(C, D, D2, C2, ctr, k); s.quadOut(D, A, A2, D2, ctr, k);
}
const cen = (r) => r.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / r.length);

function radialTex(r, g, b, sharp) { // soft round alpha blob, DataTexture (no canvas, works in node)
  const N = 32, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const rr = Math.hypot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5) * 2, a = clamp(1 - rr, 0, 1), i = (y * N + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(255 * Math.pow(a, sharp));
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

const SKID_Y = -0.22, SKID_X = 0.74, ARM_B = V(0.62, 0.82, 1.2), NECK = V(0, 0.30, 0.26);
const HW = [0.07, 0.1, 0.12, 0.13, 0.13, 0.12, 0.11, 0.09, 0.07, 0.05, 0.02];

export function createSledRig(ctx, opts) {
  const o = opts || {}, cfgv = (k) => { const v = ctx.cfg && ctx.cfg[k]; return v === undefined ? KEYS[k].def : v; };
  const crng = ctx.crng || (() => 0.5);
  const HULL = col('#f6efff'), CORAL = col('#ff5a4a'), BRASS = col('#d9a441'), BRASS_L = col('#f6cf7a'), BRASS_D = col('#9a6a2c'), RIMC = col('#ffcf8a');
  const COAT = col('#ff5a4a'), HELM = col('#fff4e8');
  const sunW = ctx.sunDir ? ctx.sunDir.clone().normalize() : V(0, 0.05, 1);
  const rimU = { uSunW: { value: sunW }, uRim: { value: col('#ffcf8a') }, uStr: { value: cfgv('lookSledRim') } };
  const rim = (mat) => { // thin warm rim toward the sun, own varyings (basic material has no normal in the fragment)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSunW = rimU.uSunW; sh.uniforms.uRim = rimU.uRim; sh.uniforms.uStr = rimU.uStr;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRn;\nvarying vec3 vRv;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRn = normalize( normalMatrix * normal );\nvRv = -mvPosition.xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRn;\nvarying vec3 vRv;\nuniform vec3 uSunW;\nuniform vec3 uRim;\nuniform float uStr;')
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
 vec3 rsv = normalize( ( viewMatrix * vec4( uSunW, 0.0 ) ).xyz );
 float rrn = 1.0 - clamp( dot( normalize( vRn ), normalize( vRv ) ), 0.0, 1.0 );
 float rrf = smoothstep( 0.25, 0.6, rrn ) * smoothstep( 0.2, 0.7, dot( normalize( vRn ), rsv ) );
 gl_FragColor.rgb = mix( gl_FragColor.rgb, uRim, rrf * uStr );`);
    };
    mat.customProgramCacheKey = () => 'sledrigrim';
    return mat;
  };
  const vcMat = () => rim(new THREE.MeshBasicMaterial({ fog: false, vertexColors: true, toneMapped: false }));
  const bodyMat = vcMat(), skidMat = vcMat(), finMat = vcMat(), riderMat = vcMat(), lanternMat = vcMat();
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a5a, fog: false });
  const scarfMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const silMat = new THREE.ShaderMaterial({
    uniforms: { uBase: { value: col('#3b2152') }, uRim: rimU.uRim },
    vertexShader: 'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform vec3 uBase;uniform vec3 uRim;varying vec3 vN;varying vec3 vV;void main(){vec3 n=normalize(vN);float f=1.-clamp(abs(dot(n,normalize(vV))),0.,1.);float r=smoothstep(.72,.97,f);float up=smoothstep(-.2,.7,n.y);gl_FragColor=vec4(mix(uBase*(.8+.35*up),uRim,r*(.5+.5*up)),1.);}',
  });

  // ---- hull-sized parts (rebuilt by setHull) ----
  const ST = [[-1.2, 0.30, 0.20, 0.08], [-1.0, 0.42, 0.24, 0.06], [-0.5, 0.47, 0.26, 0.06], [0.2, 0.45, 0.26, 0.06], [0.8, 0.34, 0.30, 0.09], [1.15, 0.17, 0.38, 0.20], [1.38, 0.04, 0.46, 0.34]];
  const FC = [HULL, HULL, CORAL, col('#8a5a9e'), CORAL, HULL];
  function buildBody(h) {
    const s = new Soup(), rings = ST.map(([z, w, yt, yb]) => { const t = yt - yb; return [V(-0.72 * w, yt, z), V(0.72 * w, yt, z), V(w, yt - 0.4 * t, z), V(0.6 * w, yb, z), V(-0.6 * w, yb, z), V(-w, yt - 0.4 * t, z)]; });
    for (let i = 0; i < rings.length - 1; i++) {
      const ctr = cen(rings[i]).add(cen(rings[i + 1])).multiplyScalar(0.5);
      for (let k = 0; k < 6; k++) s.quadOut(rings[i][k], rings[i][(k + 1) % 6], rings[i + 1][(k + 1) % 6], rings[i + 1][k], ctr, FC[k]);
    }
    const r = rings[0], c0 = cen(r).add(V(0, 0, 0.5));
    s.quadOut(r[0], r[1], r[2], r[5], c0, HULL); s.quadOut(r[5], r[2], r[3], r[4], c0, HULL);
    for (let i = 0; i < ST.length - 1; i++) for (const sx of [-1, 1]) bar(s, V(sx * 0.72 * ST[i][1], ST[i][2] + 0.018, ST[i][0]), V(sx * 0.72 * ST[i + 1][1], ST[i + 1][2] + 0.018, ST[i + 1][0]), 0.016, RIMC, 4);
    ball(s, V(0, 0.46, 1.38), 0.055, BRASS_L, 8);
    bar(s, V(0.04, 0.4, 1.15), ARM_B, 0.03, BRASS, 5, 0.022); ball(s, ARM_B, 0.03, BRASS_L, 6);
    return s.build(V(h.hull[0], h.hull[1], h.hull[2]));
  }
  function buildGlow(h) {
    const s = new Soup(), w = col('#ffffff');
    boxAt(s, 0.5, 0.045, 0.03, 0, 0.12, -1.21, 0, w);
    for (const sx of [-1, 1]) boxAt(s, 0.035, 0.03, 1.4, sx * 0.485, 0.1, -0.2, 0, w);
    return s.build(V(h.hull[0], h.hull[1], h.hull[2]));
  }
  const curve = new THREE.CatmullRomCurve3([[-1.3, 0.06], [-1.18, 0.02], [-1.0, 0], [0.85, 0], [1.05, 0.03], [1.2, 0.12], [1.3, 0.26], [1.34, 0.34]].map((p) => V(0, p[1], p[0])));
  const pts = curve.getSpacedPoints(20);
  function buildSkid(inw, h) {
    const s = new Soup(), n = pts.length, W = 0.2, T = 0.11, R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], t = V(0, 0, 0).subVectors(b, a).normalize(), N = V(0, t.z, -t.y);
      const e = Math.min(i, n - 1 - i), w = W * (e < 2 ? 0.7 + 0.15 * e : 1) / 2, th = T * (e < 2 ? 0.8 + 0.1 * e : 1) / 2;
      R.push([pts[i].clone().add(V(-w, 0, 0)).addScaledVector(N, th), pts[i].clone().add(V(w, 0, 0)).addScaledVector(N, th), pts[i].clone().add(V(w, 0, 0)).addScaledVector(N, -th), pts[i].clone().add(V(-w, 0, 0)).addScaledVector(N, -th)]);
    }
    for (let i = 0; i < n - 1; i++) {
      const ctr = cen(R[i]).add(cen(R[i + 1])).multiplyScalar(0.5), tip = i >= n - 4;
      for (let f = 0; f < 4; f++) s.quadOut(R[i][f], R[i][(f + 1) % 4], R[i + 1][(f + 1) % 4], R[i + 1][f], ctr, tip ? (f === 0 ? BRASS_L : BRASS) : HULL);
    }
    s.quadOut(R[0][0], R[0][1], R[0][2], R[0][3], cen(R[1]), HULL); s.quadOut(R[n - 1][0], R[n - 1][1], R[n - 1][2], R[n - 1][3], cen(R[n - 2]), BRASS);
    for (const [zb, zt] of [[-0.6, -0.5], [0.55, 0.42]]) {
      const a = V(0, 0.03, zb), b = V(inw * 0.27, 0.36, zt);
      bar(s, a, b, 0.035, BRASS_D, 5);
      for (let c = 0; c < 3; c++) bar(s, a.clone().lerp(b, 0.2 + c * 0.22), a.clone().lerp(b, 0.3 + c * 0.22), 0.058, c % 2 ? BRASS : BRASS_L, 5);
    }
    return s.build(V(h.skid[0], h.skid[1], h.skid[2]));
  }
  function buildFins(h) {
    const s = new Soup(), sh = new THREE.Shape(); sh.moveTo(0, -1.0); sh.lineTo(0.34, -1.0); sh.lineTo(0.38, -0.72); sh.lineTo(0, -0.3); sh.closePath();
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
    for (const sx of [1, -1]) {
      const M = new Matrix4().makeTranslation(sx * 0.4, 0.13, 0).multiply(new Matrix4().makeRotationZ(sx * -4 * DEG)).multiply(new Matrix4().set(sx, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
      s.geo(eg, CORAL, M);
    }
    eg.dispose();
    return s.build(V(h.fin[0], 1, h.fin[1]));
  }
  const bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), bodyMat), glowMesh = new THREE.Mesh(new THREE.BufferGeometry(), glowMat);
  const skidL = new THREE.Mesh(new THREE.BufferGeometry(), skidMat), skidR = new THREE.Mesh(new THREE.BufferGeometry(), skidMat), finMesh = new THREE.Mesh(new THREE.BufferGeometry(), finMat);

  // ---- lantern, rider, scarf (not hull-sized) ----
  const lantern = new THREE.Group(); lantern.scale.setScalar(0.75);
  { const s = new Soup();
    bar(s, V(0, 0, 0), V(0, -0.1, 0), 0.01, BRASS_D, 4);
    _m.compose(V(0, -0.135, 0), _q.identity(), _one); s.geo(new THREE.ConeGeometry(0.1, 0.07, 6), BRASS, _m);
    _m.compose(V(0, -0.235, 0), _q.identity(), _one); s.geo(new THREE.CylinderGeometry(0.068, 0.068, 0.15, 6), col('#ffd98a'), _m);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; bar(s, V(Math.cos(a) * 0.078, -0.16, Math.sin(a) * 0.078), V(Math.cos(a) * 0.078, -0.31, Math.sin(a) * 0.078), 0.011, BRASS, 4); }
    _m.compose(V(0, -0.32, 0), _q.identity(), _one); s.geo(new THREE.CylinderGeometry(0.075, 0.05, 0.04, 6), BRASS_D, _m);
    lantern.add(new THREE.Mesh(s.build(), lanternMat)); }
  const haloTex = radialTex(255, 190, 100, 1.4);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.position.set(0, -0.235, 0); halo.scale.setScalar(0.4); lantern.add(halo);

  const rider = new THREE.Group(); rider.position.set(0, 0.27, -0.3);
  { const s = new Soup(), lean = 62 * DEG;
    _q.setFromEuler(_e.set(lean, 0, 0)); _m.compose(V(0, 0.07 + 0.17 * Math.cos(lean), 0.17 * Math.sin(lean)), _q, _one);
    s.geo(new THREE.BoxGeometry(0.46, 0.38, 0.32), COAT, _m);
    boxAt(s, 0.4, 0.07, 0.2, 0, 0.3, 0.27, lean, col('#ffd0a0'));
    ball(s, V(0, 0.42, 0.42), 0.2, HELM, 8);
    _q.setFromEuler(_e.set(lean, 0, 0)); _m.compose(V(0, 0.405, 0.425), _q, _one);
    s.geo(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 8), col('#ffb27a'), _m);
    slab(s, V(-0.17, 0.12, -0.1), V(0.17, 0.12, -0.1), V(0.25, 0.04, -0.44), V(-0.25, 0.04, -0.44), V(0, -0.035, 0), COAT);
    slab(s, V(-0.25, 0.04, -0.44), V(0.25, 0.04, -0.44), V(0.26, 0.025, -0.50), V(-0.26, 0.025, -0.50), V(0, -0.03, 0), col('#d8402f'));
    for (const sx of [-1, 1]) bar(s, V(sx * 0.2, 0.27, 0.27), V(sx * 0.22, 0.13, 0.66), 0.065, col('#e8493a'), 5);
    rider.add(new THREE.Mesh(s.build(), riderMat)); }

  const sp = new Float32Array(NP * 6), sc = new Float32Array(NP * 8), idx = [];
  for (let i = 0; i <= SEG; i++) {
    const c = i % 2 ? col('#ffa58a') : CORAL;
    for (let k = 0; k < 2; k++) { const v = i * 2 + k; sc[v * 4] = c.r; sc[v * 4 + 1] = c.g; sc[v * 4 + 2] = c.b; sc[v * 4 + 3] = 0.95 - 0.25 * i / SEG; }
    if (i < SEG) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const sgeo = new THREE.BufferGeometry(), spa = new THREE.BufferAttribute(sp, 3); spa.setUsage(THREE.DynamicDrawUsage);
  sgeo.setAttribute('position', spa); sgeo.setAttribute('color', new THREE.BufferAttribute(sc, 4)); sgeo.setIndex(idx);
  const scarfMesh = new THREE.Mesh(sgeo, scarfMat); scarfMesh.frustumCulled = false; scarfMesh.renderOrder = 4;

  // ---- blob shadow (world space, not under `group`) ----
  const shTex = radialTex(255, 255, 255, 1.1);
  const shMat = new THREE.MeshBasicMaterial({ map: shTex, color: 0x14123a, transparent: true, opacity: 0.4, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shGeo, shMat); shadow.renderOrder = 1; shadow.frustumCulled = false;
  if (ctx.scene) ctx.scene.add(shadow);

  const group = new THREE.Group(), root = new THREE.Group(); root.rotation.order = 'YXZ'; group.add(root);
  for (const m of [bodyMesh, glowMesh, skidL, skidR, finMesh, lantern, rider, scarfMesh]) root.add(m);
  const sized = [bodyMesh, glowMesh, skidL, skidR, finMesh];
  const partMeshes = [bodyMesh, skidL, skidR, finMesh, rider.children[0], lantern.children[0]];
  const partMats = [bodyMat, skidMat, skidMat, finMat, riderMat, lanternMat];

  let hull = HULLS.wren, sil = false, tier = o.tier || 'max';
  function setHull(id) {
    const h = HULLS[id] || HULLS.wren; hull = h;
    for (const m of sized) m.geometry.dispose();
    bodyMesh.geometry = buildBody(h); glowMesh.geometry = buildGlow(h); skidL.geometry = buildSkid(-1, h); skidR.geometry = buildSkid(1, h); finMesh.geometry = buildFins(h);
    skidL.position.x = SKID_X * h.stance; skidR.position.x = -SKID_X * h.stance;
    rider.scale.setScalar(1.08 * Math.min(1, 1 / Math.sqrt(h.hull[0]) + 0.02));
    lantern.position.set(ARM_B.x * h.hull[0], ARM_B.y * h.hull[1], ARM_B.z * h.hull[2]);
    for (const m of [bodyMat, skidMat, finMat, riderMat]) m.color.set(h.tint ? h.tint : '#ffffff');
    scarfLen = h.scarf[0]; scarfW = h.scarf[1];
    applyVis();
  }
  let scarfLen = 1, scarfW = 1;
  function silhouette(on) { sil = !!on; applyVis(); }
  function applyVis() {
    partMeshes.forEach((m, i) => { m.material = sil ? silMat : partMats[i]; });
    glowMesh.visible = !sil; halo.visible = !sil && tier !== 'lean'; scarfMesh.visible = !sil;
    rimU.uStr.value = tier === 'lean' ? 0 : cfgv('lookSledRim');
  }

  // ---- state ----
  const P = { comp: 0.35, splay: 0, duck: 0.35, lean: 0, fin: 0, fold: 0, bank: 0 };
  let lth = 0, lw = 0, lph = 0, lwp = 0, kick = 0, ph = Math.PI * 2 * crng(), prevVy = 0, tumbled = false, lastWave = 0, boostGlow = 0;
  const gcool = col('#ff7a5a'), ggold = col('#ffd98a');
  // detached cosmetic bodies (world space)
  const dp = new Float32Array(NP * 3), dq = new Float32Array(NP * 3);
  const lb = { p: V(0, 0, 0), v: V(0, 0, 0), spin: 0, rest: false };
  const lastV = V(0, 0, 0);

  function setScarf(i, x, y, z, hw, cx, cy) { const j = i * 6; sp[j] = x - cx * hw; sp[j + 1] = y - cy * hw; sp[j + 2] = z; sp[j + 3] = x + cx * hw; sp[j + 4] = y + cy * hw; sp[j + 5] = z; }
  function scarfAttached(dt, vs, red, spd) {
    const L = cfgv('lookSledScarfLen') * scarfLen, ds = L / SEG;
    const wave = red ? 0 : 0.2 + 0.4 * spd, lift = red ? 0.9 : 1.15 - 0.8 * spd, droop = 0.05 + 0.3 * (1 - spd);
    ph += dt * (red ? 0 : 3 + 9 * spd);
    const swing = red ? 0 : -(vs.steer || 0) * 0.7;
    _nk.copy(NECK).applyEuler(_e.set(rider.rotation.x, 0, rider.rotation.z)).multiplyScalar(rider.scale.x).add(rider.position);
    let by = 0, bz = 0;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      if (i > 0) { const ang = lift * (0.1 + 0.9 * Math.pow(t, 0.8)); by += ds * Math.sin(ang); bz += ds * Math.cos(ang); }
      const x = _nk.x + swing * 1.5 * Math.pow(t, 1.1) + Math.sin(ph - t * 5.2) * wave * Math.pow(t, 0.9);
      const y = _nk.y + by - droop * t * t + Math.sin(ph * 1.2 - t * 4.1) * wave * 0.3 * t;
      const tw = red ? 0 : 0.6 * Math.sin(ph * 0.9 - t * 4.5) * t, hw = HW[i] * scarfW;
      setScarf(i, x, y, _nk.z - bz, hw, Math.cos(tw), Math.sin(tw));
    }
    spa.needsUpdate = true;
  }
  function scarfFree(dt) { // verlet ribbon in world space, 3 constraint passes
    const ds = cfgv('lookSledScarfLen') * scarfLen / SEG, k = Math.pow(0.985, dt * 60);
    for (let i = 0; i < NP; i++) {
      const j = i * 3, px = dp[j], py = dp[j + 1], pz = dp[j + 2];
      dp[j] += (px - dq[j]) * k; dp[j + 1] += (py - dq[j + 1]) * k - 9 * dt * dt; dp[j + 2] += (pz - dq[j + 2]) * k;
      dq[j] = px; dq[j + 1] = py; dq[j + 2] = pz;
    }
    for (let it = 0; it < 3; it++) for (let i = 0; i < SEG; i++) {
      const a = i * 3, b = a + 3, dx = dp[b] - dp[a], dy = dp[b + 1] - dp[a + 1], dz = dp[b + 2] - dp[a + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-6, f = (d - ds) / d * (i === 0 ? 1 : 0.5);
      if (i === 0) { dp[b] -= dx * f; dp[b + 1] -= dy * f; dp[b + 2] -= dz * f; continue; } // head link follows the dragged tail only
      dp[a] += dx * f; dp[a + 1] += dy * f; dp[a + 2] += dz * f; dp[b] -= dx * f; dp[b + 1] -= dy * f; dp[b + 2] -= dz * f;
    }
    for (let i = 0; i < NP; i++) {
      const j = i * 3, gy = ctx.groundY ? ctx.groundY(dp[j], dp[j + 2]) + 0.03 : -1e9;
      if (dp[j + 1] < gy) { dp[j + 1] = gy; dq[j] = dp[j] + (dq[j] - dp[j]) * 0.5; dq[j + 2] = dp[j + 2] + (dq[j + 2] - dp[j + 2]) * 0.5; }
      setScarf(i, dp[j], dp[j + 1], dp[j + 2], HW[i] * scarfW, 1, 0);
    }
    spa.needsUpdate = true;
  }
  function lanternFree(dt) {
    if (lb.rest) return;
    lb.v.y -= 9 * dt; lb.p.addScaledVector(lb.v, dt);
    const gy = ctx.groundY ? ctx.groundY(lb.p.x, lb.p.z) + 0.1 : -1e9;
    if (lb.p.y < gy) {
      lb.p.y = gy; lb.v.y = Math.abs(lb.v.y) * 0.3; lb.v.x *= 0.7; lb.v.z *= 0.7; lb.spin *= 0.6;
      if (lb.v.lengthSq() < 0.04) { lb.rest = true; lb.v.set(0, 0, 0); }
    }
    lantern.position.copy(lb.p); lantern.rotation.z += lb.spin * dt;
  }
  function detach() {
    if (tumbled) return; tumbled = true;
    group.updateWorldMatrix(true, true);
    // scarf: current ribbon centre line -> world points
    for (let i = 0; i < NP; i++) {
      _sc.set((sp[i * 6] + sp[i * 6 + 3]) / 2, (sp[i * 6 + 1] + sp[i * 6 + 4]) / 2, sp[i * 6 + 2]); root.localToWorld(_sc);
      const j = i * 3, dt = 1 / 60;
      dp[j] = _sc.x; dp[j + 1] = _sc.y; dp[j + 2] = _sc.z;
      dq[j] = _sc.x - lastV.x * dt * (1 + 0.2 * (crng() - 0.5)); dq[j + 1] = _sc.y - lastV.y * dt; dq[j + 2] = _sc.z - lastV.z * dt * (1 + 0.2 * (crng() - 0.5));
    }
    root.remove(scarfMesh); scarfMesh.position.set(0, 0, 0); scarfMesh.rotation.set(0, 0, 0);
    (ctx.scene || group).add(scarfMesh);
    lantern.getWorldPosition(lb.p); root.remove(lantern); (ctx.scene || group).add(lantern);
    lantern.position.copy(lb.p); lantern.rotation.set(0, 0, 0);
    lb.v.copy(lastV).multiplyScalar(0.8); lb.v.x += (crng() - 0.5) * 3; lb.v.y += 2 + crng() * 2; lb.spin = (crng() - 0.5) * 8; lb.rest = false;
  }
  function attach() {
    if (!tumbled) return; tumbled = false;
    if (scarfMesh.parent) scarfMesh.parent.remove(scarfMesh); root.add(scarfMesh);
    if (lantern.parent) lantern.parent.remove(lantern); root.add(lantern);
    lantern.position.set(ARM_B.x * hull.hull[0], ARM_B.y * hull.hull[1], ARM_B.z * hull.hull[2]); lantern.rotation.set(0, 0, 0);
    lth = lw = lph = lwp = 0;
  }

  function update(dt, vs) {
    if (!(dt > 0)) dt = 1 / 60; dt = Math.min(dt, 0.1);
    const red = vs.reduced || (ctx.cfg && ctx.cfg.lookReducedMotion === 1);
    const spd = clamp((vs.speed || 0) / 54, 0, 1), air = !vs.grounded && vs.mode !== 'tumble';
    const ref = cfgv('lookSledImpactRef'), K = 1 - Math.exp(-dt * 9);
    kick *= Math.exp(-dt * (red ? 3 : 5));
    const comp = air ? 0 : clamp(vs.comp, 0, 1);
    P.comp += (comp - P.comp) * K;
    P.duck += ((air ? 0.15 : 0.35 + 0.15 * (vs.diving ? 1 : 0)) + 0.65 * kick - P.duck) * K;
    P.splay += ((air ? 0.04 : 0) + kick * cfgv('lookSledSplay') - P.splay) * K;
    const st = red ? 0 : clamp(vs.steer || 0, -1, 1);
    P.lean += (st * cfgv('lookSledLean') - P.lean) * K;
    P.fin += (-st * 0.25 + (air ? -0.2 : 0) + kick * 0.2 - P.fin) * K;
    P.fold += ((vs.diving ? cfgv('lookSledFinFold') : 0) - P.fold) * K;
    P.bank += (st * 0.12 - P.bank) * K;
    root.rotation.set(-kick * 0.05, 0, P.bank);
    const dy = (P.comp - 0.35) * 0.15 * hull.skid[1];
    skidL.position.y = skidR.position.y = SKID_Y + dy; skidL.rotation.y = P.splay; skidL.rotation.z = P.splay * 0.15; skidR.rotation.y = -P.splay; skidR.rotation.z = -P.splay * 0.15;
    finMesh.rotation.z = P.fin; finMesh.scale.x = 1 - P.fold;
    rider.rotation.set(0.04 + 0.34 * P.duck, 0, P.lean);
    // lantern: damped pendulum (sideways on latAcc, fore/aft on vertical accel + land kick)
    if (!tumbled) {
      const w2 = cfgv('lookSledLantern') ** 2, c = 2 * 0.18 * Math.sqrt(w2), ay = dt > 0 ? (vs.vy - prevVy) / dt : 0;
      const sub = 2, h = dt / sub;
      for (let i = 0; i < sub; i++) {
        lw += (-w2 * lth - c * lw + (red ? 0 : 0.5 * (vs.latAcc || 0))) * h; lth = clamp(lth + lw * h, -0.9, 0.9);
        lwp += (-w2 * lph - c * lwp - (red ? 0 : 0.02 * ay)) * h; lph = clamp(lph + lwp * h, -0.9, 0.9);
      }
      lantern.rotation.set(0.05 + lph + kick * 0.5, 0, red ? 0 : lth);
    } else lanternFree(dt);
    prevVy = vs.vy || 0;
    lastV.set(vs.vx || 0, vs.vy || 0, Math.sqrt(Math.max(0, (vs.speed || 0) ** 2 - (vs.vx || 0) ** 2 - (vs.vy || 0) ** 2)));
    // boost: stern glow warms to gold
    boostGlow += ((vs.boostT > 0 ? 1 : 0) - boostGlow) * K; glowMat.color.copy(gcool).lerp(ggold, boostGlow);
    if (tumbled) scarfFree(dt); else scarfAttached(dt, vs, red, spd);
    lastWave = red ? 0 : 0.2 + 0.4 * spd;
    // blob shadow: shrinks and fades with height, aligned to heading
    const gy = ctx.groundY ? ctx.groundY(vs.x, vs.z) : vs.y - 0.5, hgt = Math.max(0, vs.y - gy), sh = 1 - 0.55 * clamp(hgt / 5, 0, 1);
    const q = vs.quat; let yaw = 0;
    if (q) { const fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y); yaw = Math.atan2(fx, fz); }
    shadow.position.set(vs.x, gy + 0.04, vs.z); shadow.rotation.y = yaw;
    shadow.scale.set(2.4 * sh * hull.hull[0], 1, 3.6 * sh * hull.hull[2]);
    shMat.opacity = cfgv('lookSledShadow') * (1 - 0.7 * clamp(hgt / 6, 0, 1)) * (vs.mode === 'tumble' ? 0.8 : 1);
  }
  function fx(ev) {
    if (!ev) return;
    switch (ev.type || ev.name || ev.kind) {
      case 'land': kick = Math.max(kick, clamp((ev.impact || 0) / cfgv('lookSledImpactRef'), 0, 1)); lwp -= kick * 6; break;
      case 'tumble_start': detach(); break;
      case 'recover_end': case 'run_start': attach(); kick = 0; break;
      default: break;
    }
  }
  function shift(dz, dy) {
    if (!tumbled) return;
    for (let i = 0; i < NP; i++) { dp[i * 3 + 2] += dz; dq[i * 3 + 2] += dz; dp[i * 3 + 1] += dy || 0; dq[i * 3 + 1] += dy || 0; }
    lb.p.z += dz; lb.p.y += dy || 0; lantern.position.copy(lb.p);
    scarfMesh.position.set(0, 0, 0);
  }
  function setQuality(t) { tier = t; applyVis(); }
  function stats() {
    let tris = 0, calls = 1; // shadow
    for (const m of [bodyMesh, glowMesh, skidL, skidR, finMesh, rider.children[0], lantern.children[0], scarfMesh]) if (m.visible) { const g = m.geometry; tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3; calls++; }
    if (halo.visible) calls++;
    return { calls, tris: Math.round(tris + 2), hull: hull.id, detached: tumbled, silhouette: sil, scarfWave: lastWave };
  }
  function dispose() {
    for (const m of [bodyMesh, glowMesh, skidL, skidR, finMesh, rider.children[0], lantern.children[0], sgeo, shGeo]) (m.geometry || m).dispose();
    for (const m of [bodyMat, skidMat, finMat, riderMat, lanternMat, glowMat, scarfMat, silMat, shMat, halo.material]) m.dispose();
    haloTex.dispose(); shTex.dispose();
    for (const o2 of [shadow, scarfMesh, lantern, group]) if (o2.parent) o2.parent.remove(o2);
  }
  setHull(o.hull || 'wren');
  applyVis();
  return { group, shadow, update, fx, shift, setQuality, stats, dispose, setHull, silhouette, params: P, get hull() { return hull; }, parts: { body: bodyMesh, skidL, skidR, fins: finMesh, rider, lantern, scarf: scarfMesh } };
}
