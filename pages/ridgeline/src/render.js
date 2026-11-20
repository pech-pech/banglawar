// Ridgeline render slice 4. THREE only, WebGLRenderer, built-in materials, no shaders, no shadows.
import * as THREE from '../vendor/three.module.js';
import { DEFAULT_THEME, THEMES } from './themes.js';
import { treeGeometry, rockGeometry } from './shapes.js';
import { createParticles } from './particles.js';

const CHUNK_Z = 40;       // metres along z per terrain chunk
const CELL = 2;           // grid cell size
const HALF_X = 40;        // terrain half width around the centre line
const NX = (HALF_X * 2) / CELL;   // cells across
const NZ = CHUNK_Z / CELL;        // cells along
const TREE_CAP = 700;
const ROCK_CAP = 200;
const GATE_CAP = 10;      // gates, two posts each
const REFILL_STEP = 8;    // metres of travel between prop refills
const BLOCK = CELL * 2;   // block size for stepped terrain
const OUTLINE_K = 1.12;   // inverted-hull scale
const HOVER = 0.7;

// scale how much of the exp2 fog blend reaches a material (hazards and gates must stay readable at distance)
function limitFog(mat, k) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
      '#ifdef USE_FOG\n float fogF = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogF * ' + k.toFixed(3) + ' );\n#endif');
  };
  mat.customProgramCacheKey = () => 'limitFog' + k;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function createView(canvas, course, cfg, themeId) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, cfg.pixelRatioCap));

  let themeKey = THEMES[themeId] ? themeId : DEFAULT_THEME;
  let theme = THEMES[themeKey];
  let step = 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.FogExp2(theme.sky, cfg.fogDensity * theme.fogDensity);

  const camera = new THREE.PerspectiveCamera(66, 475 / 638, 0.5, cfg.viewDist + 80);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-40, 60, -20);
  scene.add(sun);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // visual terrain height: smooth, or snapped to blocks when the theme asks (collision truth stays course.height)
  function vis(x, z) {
    if (step <= 0) return course.height(x, z);
    const sx = Math.floor(x / BLOCK) * BLOCK + CELL;
    const sz = Math.floor(z / BLOCK) * BLOCK + CELL;
    return Math.round(course.height(sx, sz) / step) * step;
  }

  // ---- terrain chunks ----
  let terrainMat = null;
  const cLow = new THREE.Color(), cHigh = new THREE.Color(), cBank = new THREE.Color(), _tc = new THREE.Color();
  const vertCount = (NX + 1) * (NZ + 1);
  const sharedIndex = (() => {
    const idx = new Uint16Array(NX * NZ * 6);
    let k = 0;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + (NX + 1), d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    return new THREE.BufferAttribute(idx, 1);
  })();

  const chunks = new Map(); // index -> mesh
  const pool = [];

  function makeChunkMesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    g.setIndex(sharedIndex);
    const m = new THREE.Mesh(g, terrainMat);
    m.frustumCulled = false; // bounds change when rebuilt; chunks are few
    scene.add(m);
    return m;
  }

  function buildChunk(mesh, ci) {
    const z0 = ci * CHUNK_Z;
    const cx = Math.round(course.centerX(z0 + CHUNK_Z * 0.5) / BLOCK) * BLOCK;
    const pos = mesh.geometry.attributes.position;
    const col = mesh.geometry.attributes.color;
    const pa = pos.array, ca = col.array;
    const slope = cfg.slope;
    let k = 0;
    for (let j = 0; j <= NZ; j++) {
      const z = z0 + j * CELL;
      const hw = course.halfWidth(z);
      const mid = course.centerX(z);
      for (let i = 0; i <= NX; i++) {
        const x = cx - HALF_X + i * CELL;
        const y = vis(x, z);
        pa[k] = x; pa[k + 1] = y; pa[k + 2] = z;
        // local bump height (height minus the downhill ramp) blends low to high ground
        const t = clamp((y + slope * z + 0.9) / 1.8, 0, 1);
        const out = clamp((Math.abs(x - mid) - hw) / 8, 0, 1);
        _tc.copy(cLow).lerp(cHigh, t).lerp(cBank, out);
        // checker keeps cells readable; for stepped themes it checkers whole blocks
        const par = step > 0 ? ((Math.floor(x / BLOCK) + Math.floor(z / BLOCK)) & 1) : ((i + j) & 1);
        const f = par ? (step > 0 ? 0.93 : 0.98) : 1;
        ca[k] = _tc.r * f; ca[k + 1] = _tc.g * f; ca[k + 2] = _tc.b * f;
        k += 3;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.visible = true;
  }

  function updateChunks(z) {
    const first = Math.floor((z - 30) / CHUNK_Z);
    const last = Math.floor((z + cfg.viewDist) / CHUNK_Z);
    for (const [ci, mesh] of chunks) {
      if (ci < first || ci > last) {
        mesh.visible = false;
        pool.push(mesh);
        chunks.delete(ci);
      }
    }
    for (let ci = first; ci <= last; ci++) {
      if (chunks.has(ci)) continue;
      const mesh = pool.length ? pool.pop() : makeChunkMesh();
      buildChunk(mesh, ci);
      chunks.set(ci, mesh);
    }
  }

  // ---- trees and rocks: theme-owned instanced meshes (rebuilt on setTheme) ----
  const outlineMat = track(new THREE.MeshBasicMaterial({ color: 0x0b0b0b, side: THREE.BackSide }));
  let tg = null;            // theme-owned disposables (materials, instanced meshes, particles)
  let leaves = null, trunks = null, rocks = null, leavesO = null, rocksO = null;
  let tGeoLeaf = null, tGeoTrunk = null, rGeo = null;
  let particles = null;

  function makeInst(geo, mat, cap) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    return m;
  }

  function disposeThemeObjects() {
    if (!tg) return;
    for (const m of [leaves, trunks, rocks, leavesO, rocksO]) { if (m) { scene.remove(m); m.dispose(); } }
    for (const o of tg) o.dispose();
    for (const g of [tGeoLeaf, tGeoTrunk, rGeo]) if (g) g.dispose();
    if (particles) { scene.remove(particles.object3D); particles.dispose(); }
    tg = null; leaves = trunks = rocks = leavesO = rocksO = null; particles = null;
  }

  // ---- gates: two posts plus a banner bar per gate, unlit, per-instance colour, matrices set each frame ----
  const postGeo = track(new THREE.CylinderGeometry(0.22, 0.28, 3.2, 8));
  postGeo.translate(0, 1.6, 0);
  const gateMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  limitFog(gateMat, 0.15); // gates must read as authored through fog
  const posts = new THREE.InstancedMesh(postGeo, gateMat, GATE_CAP * 2);
  const bannerGeo = track(new THREE.BoxGeometry(1, 1, 0.3));
  const banner = new THREE.InstancedMesh(bannerGeo, gateMat, GATE_CAP);
  for (const im of [posts, banner]) {
    im.frustumCulled = false;
    im.count = 0;
    im.setColorAt(0, new THREE.Color(0xffffff)); // allocate instanceColor
    scene.add(im);
  }
  const gX = new Float32Array(GATE_CAP), gZ = new Float32Array(GATE_CAP), gW = new Float32Array(GATE_CAP), gId = new Int32Array(GATE_CAP);
  let gN = 0;
  const reduced = (() => {
    try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  })();

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const COL_GATE = new THREE.Color();
  const COL_GATE_NEXT = new THREE.Color();
  const COL_GATE_DONE = new THREE.Color();
  const COL_WHITE = new THREE.Color(0xffffff);

  let lastFillZ = -1e9;
  let lastNext = -2;

  function refillProps(z, nextGate) {
    const z0 = z - 25, z1 = z + cfg.viewDist + 20;
    const tl = course.treesInRange(z0, z1);
    let n = Math.min(tl.length, TREE_CAP);
    for (let i = 0; i < n; i++) {
      const t = tl[i];
      const H = 4.2 * (t.s || 1) * (0.9 + 0.2 * ((i * 7) % 5) / 4);
      const W = 4.2 * (t.s || 1);
      _p.set(t.x, vis(t.x, t.z) - 0.15, t.z);
      _s.set(W, H, W);
      _q.setFromAxisAngle(Y_AXIS, i * 1.7);
      _m.compose(_p, _q, _s);
      leaves.setMatrixAt(i, _m);
      if (trunks) trunks.setMatrixAt(i, _m);
      if (leavesO) {
        _p.y -= 0.02 * H;
        _s.multiplyScalar(OUTLINE_K);
        _m.compose(_p, _q, _s);
        leavesO.setMatrixAt(i, _m);
      }
    }
    leaves.count = n;
    leaves.instanceMatrix.needsUpdate = true;
    if (trunks) { trunks.count = n; trunks.instanceMatrix.needsUpdate = true; }
    if (leavesO) { leavesO.count = n; leavesO.instanceMatrix.needsUpdate = true; }

    // rocks: footprint radius = r (collision data), base sits on the visual surface
    const rl = course.rocksInRange(z0, z1);
    n = Math.min(rl.length, ROCK_CAP);
    for (let i = 0; i < n; i++) {
      const r = rl[i];
      _p.set(r.x, vis(r.x, r.z) - 0.05 * r.r, r.z);
      _s.set(r.r, r.r * 0.9, r.r);
      _q.setFromAxisAngle(Y_AXIS, r.id * 2.3);
      _m.compose(_p, _q, _s);
      rocks.setMatrixAt(i, _m);
      if (rocksO) {
        _p.y -= 0.02 * r.r;
        _s.set(r.r * OUTLINE_K, r.r * 0.9 * OUTLINE_K, r.r * OUTLINE_K);
        _m.compose(_p, _q, _s);
        rocksO.setMatrixAt(i, _m);
      }
    }
    rocks.count = n;
    rocks.instanceMatrix.needsUpdate = true;
    if (rocksO) { rocksO.count = n; rocksO.instanceMatrix.needsUpdate = true; }

    const gl = course.gatesInRange(z - 10, z1);
    gN = Math.min(gl.length, GATE_CAP);
    for (let i = 0; i < gN; i++) { gX[i] = gl[i].x; gZ[i] = gl[i].z; gW[i] = gl[i].width; gId[i] = gl[i].id; }
    lastFillZ = z;
    lastNext = nextGate;
  }

  // per frame (cheap, <= GATE_CAP gates): posts and banner shrink away inside 8 to 14 m of the camera and vanish once the sled has passed
  function updateGates(camZ, sledZ, nextGate, t) {
    let n = 0;
    const pulse = reduced ? 0 : 0.5 + 0.5 * Math.sin(t * 3.2);
    for (let i = 0; i < gN; i++) {
      const gz = gZ[i];
      if (gz < sledZ - 0.5) continue;
      const fade = clamp((gz - camZ - 8) / 6, 0, 1);
      if (fade <= 0) continue;
      const isNext = gId[i] === nextGate;
      if (isNext) { _c.copy(COL_GATE_NEXT); if (!reduced) _c.lerp(COL_WHITE, 0.06 * pulse); }
      else if (gId[i] < nextGate) _c.copy(COL_GATE_DONE); else _c.copy(COL_GATE);
      const k = (isNext ? 1.6 + (reduced ? 0 : 0.12 * pulse) : 1) * fade;
      const gw = gW[i];
      _q.identity();
      for (let side = 0; side < 2; side++) {
        const px = gX[i] + (side ? 0.5 : -0.5) * gw;
        _p.set(px, vis(px, gz), gz);
        _s.set(k, k, k);
        _m.compose(_p, _q, _s);
        posts.setMatrixAt(n * 2 + side, _m);
        posts.setColorAt(n * 2 + side, _c);
      }
      const bh = 1.15 * k;
      _p.set(gX[i], vis(gX[i], gz) + 3.2 * k - bh * 0.5, gz);
      _s.set(gw + 0.6 * k, bh, 1);
      _m.compose(_p, _q, _s);
      banner.setMatrixAt(n, _m);
      banner.setColorAt(n, _c);
      n++;
    }
    posts.count = n * 2; banner.count = n;
    posts.instanceMatrix.needsUpdate = true; banner.instanceMatrix.needsUpdate = true;
    posts.instanceColor.needsUpdate = true; banner.instanceColor.needsUpdate = true;
  }

  // ---- sled ----
  const sled = new THREE.Group();
  sled.rotation.order = 'YXZ';
  const bodyGeo = track(new THREE.ConeGeometry(0.95, 3.0, 3));
  bodyGeo.rotateX(Math.PI / 2); // tip toward +z
  bodyGeo.scale(1, 0.45, 1);
  const bodyMat = track(new THREE.MeshStandardMaterial({
    color: 0x2b3a55, flatShading: true, roughness: 0.6, metalness: 0.2,
    emissive: 0x2a6fff, emissiveIntensity: 0.25,
  }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  sled.add(body);
  const finGeo = track(new THREE.BoxGeometry(2.0, 0.12, 0.7));
  const finMat = track(new THREE.MeshLambertMaterial({ color: 0xe8eef8, flatShading: true }));
  const fin = new THREE.Mesh(finGeo, finMat);
  fin.position.set(0, 0.1, -1.1);
  sled.add(fin);
  const flareGeo = track(new THREE.ConeGeometry(0.5, 2.6, 8));
  flareGeo.rotateX(-Math.PI / 2); // tip toward -z
  flareGeo.translate(0, 0, -2.6);
  const flareMat = track(new THREE.MeshBasicMaterial({ color: 0xffb040, fog: false }));
  const flare = new THREE.Mesh(flareGeo, flareMat);
  flare.visible = false;
  sled.add(flare);
  scene.add(sled);

  const COL_IDLE = new THREE.Color();
  const COL_CHARGE = new THREE.Color();

  // sled outline hulls (shared outline material, visible only when theme.outline)
  const bodyO = new THREE.Mesh(bodyGeo, outlineMat);
  bodyO.scale.set(OUTLINE_K, OUTLINE_K, OUTLINE_K);
  const finO = new THREE.Mesh(finGeo, outlineMat);
  finO.position.copy(fin.position);
  finO.scale.set(OUTLINE_K, 2.5, OUTLINE_K);
  sled.add(bodyO, finO);

  // ---- theme application ----
  function applyTheme(id) {
    themeKey = THEMES[id] ? id : DEFAULT_THEME;
    theme = THEMES[themeKey];
    step = theme.terrainStep > 0 ? theme.terrainStep : 0;
    disposeThemeObjects();
    tg = [];
    const flat = !!theme.flatShading;

    scene.background.setHex(theme.sky);
    scene.fog.color.setHex(theme.sky);
    // Three r155+ lights are physical: Lambert = albedo/PI * irradiance, so intensities need a PI factor or every
    // surface renders ~3x too dark. Keep the theme's ambient:sun ratio, normalise so a lit up-facing surface shows
    // its authored colour (total 1.0), and keep the theme tint subtle (40 percent toward white).
    const SUN_UP = 0.8;
    const norm = Math.PI * 1.0 / (theme.hemiIntensity + theme.sunIntensity * SUN_UP);
    hemi.color.setHex(theme.hemiSky).lerp(COL_WHITE, 0.6);
    hemi.groundColor.setHex(theme.hemiGround).lerp(COL_WHITE, 0.6);
    hemi.intensity = theme.hemiIntensity * norm;
    sun.color.setHex(theme.sun).lerp(COL_WHITE, 0.6);
    sun.intensity = theme.sunIntensity * norm;
    renderer.setClearColor(theme.sky, 1);

    // terrain
    cLow.setHex(theme.groundLow); cHigh.setHex(theme.groundHigh); cBank.setHex(theme.bank);
    terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat });
    tg.push(terrainMat);
    const tr = treeGeometry(theme.treeShape);
    tGeoLeaf = tr.leaf; tGeoTrunk = tr.trunk || null;
    rGeo = rockGeometry(theme.rockShape);
    const leafMat = new THREE.MeshLambertMaterial({ color: theme.treeLeaf, flatShading: flat });
    const rockMat = new THREE.MeshLambertMaterial({ color: theme.rock, flatShading: flat });
    limitFog(rockMat, 0.2); // hazards stay readable in fog
    if (_tc.setHex(theme.rock).r + _tc.g + _tc.b > 1.5) rockMat.emissive.copy(_tc).multiplyScalar(0.3); // light hazards keep a glow floor on shaded faces
    tg.push(leafMat, rockMat);
    leaves = makeInst(tGeoLeaf, leafMat, TREE_CAP);
    if (tGeoTrunk) {
      const trunkMat = new THREE.MeshLambertMaterial({ color: theme.treeTrunk, flatShading: flat });
      tg.push(trunkMat);
      trunks = makeInst(tGeoTrunk, trunkMat, TREE_CAP);
    }
    rocks = makeInst(rGeo, rockMat, ROCK_CAP);
    if (theme.outline) {
      leavesO = makeInst(tGeoLeaf, outlineMat, TREE_CAP);
      rocksO = makeInst(rGeo, outlineMat, ROCK_CAP);
    }
    bodyO.visible = finO.visible = !!theme.outline;

    // gates
    COL_GATE.setHex(theme.gate);
    COL_GATE_NEXT.setHex(theme.gateNext);
    COL_GATE_DONE.copy(COL_GATE).lerp(_tc.setHex(theme.sky), 0.6);

    // sled
    bodyMat.color.setHex(theme.sled);
    bodyMat.flatShading = flat; bodyMat.needsUpdate = true;
    finMat.color.setHex(theme.sled).lerp(_tc.setHex(0xffffff), 0.55);
    finMat.flatShading = flat; finMat.needsUpdate = true;
    COL_IDLE.setHex(theme.sled);
    COL_CHARGE.setHex(theme.sledGlow);
    flareMat.color.setHex(theme.boostFlare);

    // particles
    particles = createParticles(theme.particles, theme.groundHigh);
    scene.add(particles.object3D);

    // terrain: swap material and rebuild live chunks
    for (const [ci, m] of chunks) { m.material = terrainMat; buildChunk(m, ci); }
    for (const m of pool) m.material = terrainMat;

    lastFillZ = -1e9; lastNext = -2; // force prop refill next draw
  }

  // ---- camera state (scalars, no per-frame allocation) ----
  let camX = 0, fov = 66, w = 475, h = 638;

  function resize(nw, nh) {
    w = Math.max(1, nw | 0); h = Math.max(1, nh | 0);
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, cfg.pixelRatioCap));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let lastT = -1;

  function draw(state, timeSec) {
    const z = state.z;
    scene.fog.density = cfg.fogDensity * theme.fogDensity;
    const dt = lastT < 0 ? 0 : clamp(timeSec - lastT, 0, 0.1);
    lastT = timeSec;
    camera.far = cfg.viewDist + 80;

    updateChunks(z);
    if (Math.abs(z - lastFillZ) > REFILL_STEP || state.nextGate !== lastNext) refillProps(z, state.nextGate);

    // sled
    const gy = course.height(state.x, z);
    const sy = Math.max(state.y, gy) + HOVER + step * 0.5 + 0.08 * Math.sin(timeSec * 6);
    sled.position.set(state.x, sy, z);
    const ahead = course.height(state.x, z + 3);
    sled.rotation.x = Math.atan2(sy - HOVER - ahead, 3) * 0.9;
    sled.rotation.y = clamp(state.heading || 0, -0.6, 0.6);
    sled.rotation.z = clamp(-state.vx * 0.035, -0.6, 0.6);
    bodyMat.emissive.copy(state.charging ? COL_CHARGE : COL_IDLE);
    bodyMat.emissiveIntensity = state.charging ? 0.9 + 0.3 * Math.sin(timeSec * 30) : 0.18;
    const boosting = state.boostT > 0;
    flare.visible = boosting;
    if (boosting) {
      const f = 0.8 + 0.4 * Math.sin(timeSec * 50);
      flare.scale.set(f, f, 0.8 + 0.5 * Math.sin(timeSec * 37 + 1));
    }

    // camera: behind (-z) and above, looking ahead downhill; fov widens with speed
    camX += (state.x - camX) * 0.12;
    const cy = sy + cfg.camHeight;
    camera.position.set(camX, cy, z - cfg.camBack);
    const lz = z + 16;
    camera.lookAt(state.x * 0.85 + camX * 0.15, course.height(state.x, lz) - 1.0, lz);
    const span = Math.max(1, cfg.maxSpeed - cfg.baseSpeed);
    const k = clamp((state.speed - cfg.baseSpeed) / span, 0, 1.2);
    const aspect = w / h;
    const baseFov = aspect < 1 ? 68 : 58; // tall portrait needs more vertical view
    const target = baseFov + 12 * k + (boosting ? 5 : 0);
    fov += (target - fov) * 0.1;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    updateGates(z - cfg.camBack, z, state.nextGate, timeSec);
    particles.update(camera.position, dt, state.speed);
    renderer.render(scene, camera);
  }

  function stats() {
    const r = renderer.info.render;
    return { calls: r.calls, triangles: r.triangles };
  }

  function dispose() {
    for (const m of chunks.values()) { scene.remove(m); m.geometry.dispose(); }
    for (const m of pool) { scene.remove(m); m.geometry.dispose(); }
    chunks.clear(); pool.length = 0;
    posts.dispose(); banner.dispose();
    disposeThemeObjects();
    for (const d of disposables) d.dispose();
    renderer.dispose();
  }

  function setTheme(id) { applyTheme(id); }

  applyTheme(themeKey);
  resize(canvas.clientWidth || 475, canvas.clientHeight || 638);
  return { resize, draw, stats, dispose, setTheme, camera };
}
