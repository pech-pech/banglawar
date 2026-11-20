// Ridgeline render slice 5 (look C, Cut-Paper Pop, for every theme). THREE only, WebGLRenderer, built-in materials
// (small onBeforeCompile patches), no shadows. Per-theme look data comes from looks.js (lookFor); colours never live here.
import * as THREE from '../vendor/three.module.js';
import { DEFAULT_THEME, THEMES } from './themes.js';
import { treeGeometry, rockGeometry } from './shapes.js';
import { createParticles } from './particles.js';
import { makeSkyDome, makeRange, makePaperRange, makeBlobTexture, makeSledModel, makeTrail, makeSpray } from './lookparts.js';
import { lookFor, THEME_LOOKS } from './looks.js';

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
const POLE_CAP = 48;
const BLOB_CAP = TREE_CAP + ROCK_CAP + GATE_CAP * 2 + 2;
const SUN_DIR = new THREE.Vector3(-40, 60, -20).normalize();
const FOG_MIX = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';

// chain a shader patch onto a material (keeps any earlier patch and its program cache key)
function patchShader(mat, key, fn) {
  const own = (k) => Object.prototype.hasOwnProperty.call(mat, k);
  const prev = own('onBeforeCompile') ? mat.onBeforeCompile : null;
  const prevKey = own('customProgramCacheKey') ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh); };
  mat.customProgramCacheKey = () => prevKey + '|' + key;
}

// scale how much of the exp2 fog blend reaches a material (hazards and gates must stay readable at distance);
// steps > 0 quantises the fog into that many layers (look C, High quality only)
function limitFog(mat, k, steps) {
  const q = steps > 0 ? ' fogF = floor( fogF * ' + steps.toFixed(1) + ' + 0.5 ) / ' + steps.toFixed(1) + ';\n' : '';
  patchShader(mat, 'limitFog' + k + 's' + (steps || 0), (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
      '#ifdef USE_FOG\n float fogF = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n' + q + ' gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogF * ' + k.toFixed(3) + ' );\n#endif');
  });
}
// per-material fog quantise (replaces the old module-level ShaderChunk patch, so it never leaks across views or themes)
function stepFog(mat, steps) {
  if (!(steps > 0)) return;
  const s = steps.toFixed(1);
  patchShader(mat, 'fogSteps' + s, (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
      THREE.ShaderChunk.fog_fragment.replace(FOG_MIX, 'fogFactor = floor( fogFactor * ' + s + ' + 0.5 ) / ' + s + ';\n\t' + FOG_MIX));
  });
}
// C: 4 x 1 gradient ramp for MeshToonMaterial (NearestFilter)
function makeRamp(vals) {
  const d = new Uint8Array(vals);
  const t = new THREE.DataTexture(d, vals.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
// C: outline geometry with position-welded normals (so extruding along normals never opens seams)
function weldNormals(g) {
  const c = g.clone();
  const p = c.attributes.position;
  const nrm = c.attributes.normal;
  const acc = new Map();
  const key = (i) => Math.round(p.getX(i) * 500) + ',' + Math.round(p.getY(i) * 500) + ',' + Math.round(p.getZ(i) * 500);
  for (let i = 0; i < p.count; i++) {
    const kk = key(i);
    const a = acc.get(kk) || [0, 0, 0];
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
    acc.set(kk, a);
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  c.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return c;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
const hexStr = (c) => '#' + new THREE.Color(c).getHexString();

// C: sticker-chip HUD CSS (scoped to body.rl-paper). The boost track stops short on the right so the slot beside it
// stays free for the flow meter (later gameplay PR); nothing here decorates that slot.
function stickerCss(p) {
  return `
body.rl-paper .rlh .rlh-top{left:12px;right:18px}
body.rl-paper .rlh .rlh-top .rlh-panel{background:${p.bg};border:2px solid ${p.ink};border-radius:12px;box-shadow:3px 3px 0 ${p.ink};text-shadow:none;color:${p.ink}}
body.rl-paper .rlh .rlh-top .rlh-panel:nth-child(3){transform:rotate(-2deg)}
body.rl-paper .rlh .rlh-k{color:${p.accent};opacity:1;font-weight:800}
body.rl-paper .rlh .rlh-v{color:${p.ink};font-weight:900}
body.rl-paper .rlh .rlh-bar{left:12px;right:12px;gap:4px}
body.rl-paper .rlh .rlh-bar::before{content:'BOOST';align-self:flex-start;font:900 11px system-ui,sans-serif;letter-spacing:.1em;color:${p.ink};background:${p.bg};border:2px solid ${p.ink};border-radius:8px;padding:1px 7px;order:1}
body.rl-paper .rlh .rlh-hint{order:0;align-self:flex-start}
body.rl-paper .rlh .rlh-track{order:2;align-self:flex-start;width:calc(100% - var(--rl-flow-slot,64px) - 8px);height:14px;border:3px solid ${p.ink};border-radius:9px;overflow:visible;background:${p.bg};box-shadow:2px 2px 0 ${p.ink};box-sizing:border-box}
body.rl-paper .rlh .rlh-fill{position:relative;background:transparent!important}
body.rl-paper .rlh .rlh-fill::after{content:'';position:absolute;right:-10px;top:50%;width:20px;height:20px;margin-top:-10px;border-radius:50%;background:${p.knob};border:3px solid ${p.ink};box-sizing:border-box}
body.rl-paper .rlh .rlh-flow{color:${p.ink};text-shadow:none}
body.rl-paper .rlh .rlh-flow-k{color:${p.ink};opacity:1;font-weight:900}
body.rl-paper .rlh .rlh-pip{background:${p.bg};border:2px solid ${p.ink};box-shadow:1px 1px 0 ${p.ink}}
body.rl-paper .rlh .rlh-pip.lit{background:${p.knob || p.accent};border-color:${p.ink}}
body.rl-paper .rlh .rlh-fbar{background:${p.bg};border:2px solid ${p.ink};box-shadow:1px 1px 0 ${p.ink}}
body.rl-paper .rlh .rlh-fbar>i{background:${p.accent}}
body.rl-paper .rlh .rlh-razor{color:${p.ink};background:${p.bg};border:3px solid ${p.ink};box-shadow:3px 3px 0 ${p.ink};text-shadow:none}`;
}

export function createView(canvas, course, cfg, themeId, opts) {
  const o = opts || {};
  const QS = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  const LOW = o.quality === 'low' || QS.get('q') === 'low';
  const POST = o.post !== false;
  const STILL = !!o.still;
  const reduced = (() => {
    try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  })();
  const dprCap = () => Math.min(globalThis.devicePixelRatio || 1, cfg.pixelRatioCap, LOW ? 1.5 : Infinity);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dprCap());

  let w = 475, h = 638;
  let world = null;

  // Everything theme- or look-dependent lives in one world; setTheme swaps the whole world (the renderer is kept).
  function buildWorld(id) {
    const themeKey = THEMES[id] ? id : DEFAULT_THEME;
    const theme = THEMES[themeKey];
    const LOOK = lookFor(themeKey);
    const OWN = (THEME_LOOKS && THEME_LOOKS[themeKey]) || {};
    const paper = !!LOOK.paper;
    const FOG_STEPS = LOOK.fogSteps && !LOW ? LOOK.fogSteps : 0;
    const step = theme.terrainStep > 0 ? theme.terrainStep : 0;
    const flat = !!theme.flatShading;
    const skyHex = LOOK.fogColor || theme.sky;
    const SC = LOOK.sledC || { sled: theme.sled, glow: theme.sledGlow };
    const ROLL = POST && !reduced;
    const BL = LOOK.blob || null;
    const PL = LOOK.poles || null;

    const disposables = [];
    const track = (x) => { disposables.push(x); return x; };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.FogExp2(new THREE.Color(skyHex).getHex(), cfg.fogDensity * theme.fogDensity * (LOOK.fogMul || 1));
    const camera = new THREE.PerspectiveCamera(66, w / h, 0.5, cfg.viewDist + 80);

    const COL_WHITE = new THREE.Color(0xffffff);
    // Three r155+ lights are physical: Lambert = albedo/PI * irradiance, so intensities need a PI factor or every
    // surface renders ~3x too dark. Keep the theme's ambient:sun ratio, normalise so a lit up-facing surface shows
    // its authored colour (total 1.0), and keep the theme tint subtle (40 percent toward white).
    const SUN_UP = 0.8;
    const norm = Math.PI * 1.0 / (theme.hemiIntensity + theme.sunIntensity * SUN_UP);
    const hemi = new THREE.HemisphereLight(new THREE.Color(theme.hemiSky).lerp(COL_WHITE, 0.6), new THREE.Color(theme.hemiGround).lerp(COL_WHITE, 0.6), theme.hemiIntensity * norm);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(new THREE.Color(theme.sun).lerp(COL_WHITE, 0.6), theme.sunIntensity * norm);
    sun.position.set(-40, 60, -20);
    scene.add(sun);
    renderer.setClearColor(skyHex, 1);

    // S1/S2 sky dome, sun and range strips (follow the camera)
    scene.add(camera);
    const dome = makeSkyDome(LOOK.sky, LOOK.sun);
    scene.add(dome.group);
    const ranges = [];
    for (const r of LOOK.ranges || []) {
      if (LOW && r.low) continue;
      const m = (r.paper || paper)
        ? makePaperRange(r.seed, r.r, r.base || 0, r.peak, r.top, { edge: r.edge, edgeH: r.edgeH, stepped: !!r.stepped, brush: !!r.brush, blockSeg: r.blockSeg, steps: r.steps })
        : makeRange(r.seed, r.r, 0, r.peak, r.top, skyHex, r.cap ? { cap: r.cap, capFrac: r.capFrac } : undefined);
      m.frustumCulled = false;
      scene.add(m);
      ranges.push({ mesh: m, dy: r.dy });
    }

    // S10 vignette: CSS div between canvas and #ui (Post only)
    let vignette = null;
    try { const old = document.getElementById('rl-vignette'); if (old) old.remove(); } catch (e) { /* ignore */ }
    if (POST && LOOK.vignette) {
      try {
        vignette = document.createElement('div');
        vignette.id = 'rl-vignette';
        vignette.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:' + LOOK.vignette;
        canvas.parentNode.insertBefore(vignette, canvas.nextSibling);
      } catch (e) { vignette = null; }
    }

    // C: sticker-chip HUD. hudCss: true (default palette), {bg,ink,accent,knob} (palette), or a CSS string
    let hudStyle = null;
    try { const old = document.getElementById('rl-hudcss'); if (old) old.remove(); } catch (e) { /* ignore */ }
    if (LOOK.hudCss) {
      try {
        const pal = { bg: '#ffffff', ink: '#24406e', accent: '#1f6fd0', knob: hexStr(SC.sled), ...(typeof LOOK.hudCss === 'object' ? LOOK.hudCss : {}) };
        hudStyle = document.createElement('style');
        hudStyle.id = 'rl-hudcss';
        hudStyle.textContent = typeof LOOK.hudCss === 'string' ? LOOK.hudCss : stickerCss(pal);
        document.head.appendChild(hudStyle);
      } catch (e) { hudStyle = null; }
    }
    try { document.body.classList.toggle('rl-paper', !!hudStyle); } catch (e) { /* ignore */ }

    // visual terrain height: smooth, or snapped to blocks when the theme asks (collision truth stays course.height)
    function vis(x, z) {
      if (step <= 0) return course.height(x, z);
      const sx = Math.floor(x / BLOCK) * BLOCK + CELL;
      const sz = Math.floor(z / BLOCK) * BLOCK + CELL;
      return Math.round(course.height(sx, sz) / step) * step;
    }

    // ---- terrain chunks ----
    const cBankLit = new THREE.Color(LOOK.bankLit || theme.bank), cLow = new THREE.Color(theme.groundLow), cHigh = new THREE.Color(theme.groundHigh);
    const cBank = new THREE.Color(theme.bank), cShade = new THREE.Color(LOOK.shadeTint || theme.bank), _tc = new THREE.Color();
    const vertCount = (NX + 1) * (NZ + 1);
    const CS = paper ? 4 : 3; // C packs the shade / contour flag into vertex alpha
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

    let terrainMat;
    if (paper) {
      // C: unlit two-tone ground; shade flag rides in vertex alpha, hard threshold + contour lines in the fragment shader
      terrainMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      const shadeC = new THREE.Color(LOOK.bankShade || theme.bank);
      const ct = LOOK.contour || { every: 1.5, frac: 0, dark: 0 };
      patchShader(terrainMat, 'paperTerrain', (sh) => {
        sh.uniforms.uShade = { value: new THREE.Vector3(shadeC.r, shadeC.g, shadeC.b) };
        sh.uniforms.uCont = { value: new THREE.Vector3(ct.every, ct.frac, LOW || !LOOK.contour ? 0 : 1) };
        sh.uniforms.uContDark = { value: ct.dark };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = position.y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;\nuniform vec3 uShade;\nuniform vec3 uCont;\nuniform float uContDark;')
          .replace('#include <color_fragment>', `
 float tA = vColor.a;
 diffuseColor.rgb *= vColor.rgb * mix( vec3( 1.0 ), uShade, step( 0.5, tA ) );
 float hh = vWY / uCont.x;
 float ln = 1.0 - smoothstep( uCont.y, uCont.y + fwidth( hh ) * 1.3 + 0.001, fract( hh ) );
 diffuseColor.rgb *= 1.0 - uContDark * ln * step( tA, 0.1 ) * uCont.z;`);
      });
    } else terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat });
    stepFog(terrainMat, FOG_STEPS);
    track(terrainMat);

    const chunks = new Map(); // index -> mesh
    const pool = [];

    function makeChunkMesh() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertCount * CS), CS));
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
      let k = 0, kc = 0;
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
          const dist = Math.abs(x - mid) - hw;
          let f = 1;
          let tA = 1;
          if (paper) {
            // C: course keeps its ground ramp (alpha 0 = contour lines allowed); banks are lit or shade by a hard threshold in the shader
            tA = 0;
            if (dist > 0) {
              _tc.copy(cBankLit);
              const nx = vis(x - CELL, z) - vis(x + CELL, z), nz = vis(x, z - CELL) - vis(x, z + CELL), ny = 2 * CELL;
              const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
              const lit = (nx * SUN_DIR.x + ny * SUN_DIR.y + nz * SUN_DIR.z) * il;
              tA = 0.2 + 0.6 * clamp(0.5 + ((LOOK.litThreshold != null ? LOOK.litThreshold : 0.9) - lit) * 6, 0, 1);
            } else _tc.copy(cLow).lerp(cHigh, t);
          } else {
            // hard course edge, groomed bands along z, slope tint on banks only (course ground never darker than groundLow)
            const out = clamp(dist / (LOOK.edgeBlend || 0.001), 0, 1);
            _tc.copy(cLow).lerp(cHigh, t).lerp(cBank, out);
            if (dist > 0) {
              const nx = vis(x - CELL, z) - vis(x + CELL, z), nz = vis(x, z - CELL) - vis(x, z + CELL), ny = 2 * CELL;
              const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
              const lit = (nx * SUN_DIR.x + ny * SUN_DIR.y + nz * SUN_DIR.z) * il;
              const sh = clamp((0.8 - lit) * 2.5, 0, 1);
              if (sh > 0) _tc.lerp(cShade, sh);
            }
            f = (j & 1) && dist <= 0 ? (LOOK.bandMul || 1) : 1;
          }
          ca[kc] = _tc.r * f; ca[kc + 1] = _tc.g * f; ca[kc + 2] = _tc.b * f;
          if (CS === 4) ca[kc + 3] = tA;
          k += 3; kc += CS;
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

    // ---- trees and rocks ----
    function makeInst(geo, mat, cap) {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return track(m);
    }
    const toon = paper;
    const OK = toon ? (LOOK.outlineK || OUTLINE_K) : OUTLINE_K;
    const tr = treeGeometry(theme.treeShape);
    const tGeoLeaf = track(tr.leaf), tGeoTrunk = tr.trunk ? track(tr.trunk) : null;
    const rGeo = track(rockGeometry(theme.rockShape));
    const rampT = toon ? track(makeRamp([100, 170, 255, 255])) : null;
    const rampR = toon ? track(makeRamp([178, 178, 255, 255])) : null; // rock: shade ~x0.70 of lit
    const rockHex = LOOK.rockColor != null ? LOOK.rockColor : theme.rock;
    const leafMat = track(toon ? new THREE.MeshToonMaterial({ color: theme.treeLeaf, gradientMap: rampT }) : new THREE.MeshLambertMaterial({ color: theme.treeLeaf, flatShading: flat }));
    stepFog(leafMat, FOG_STEPS);
    const rockMat = track(toon ? new THREE.MeshToonMaterial({ color: rockHex, gradientMap: rampR }) : new THREE.MeshLambertMaterial({ color: rockHex, flatShading: flat }));
    limitFog(rockMat, 0.2, FOG_STEPS); // hazards stay readable in fog
    if (_tc.set(rockHex).r + _tc.g + _tc.b > 1.5) rockMat.emissive.copy(_tc).multiplyScalar(0.3); // light hazards keep a glow floor on shaded faces
    const leaves = makeInst(tGeoLeaf, leafMat, TREE_CAP);
    let trunks = null;
    if (tGeoTrunk) {
      const trunkMat = track(new THREE.MeshLambertMaterial({ color: theme.treeTrunk, flatShading: flat }));
      stepFog(trunkMat, FOG_STEPS);
      trunks = makeInst(tGeoTrunk, trunkMat, TREE_CAP);
    }
    const rocks = makeInst(rGeo, rockMat, ROCK_CAP);
    let leavesO = null, rocksO = null;
    if (toon) {
      // keylines: rocks always; trees High only. Outline themes (ink) key trees with the grey-wash outline, hazards with rockOutline
      const rockKey = LOOK.rockOutline || LOOK.outline || '#33456b';
      const treeKey = theme.outline ? (LOOK.outline || rockKey) : rockKey;
      const rMatO = track(new THREE.MeshBasicMaterial({ color: rockKey, side: THREE.BackSide }));
      stepFog(rMatO, FOG_STEPS);
      rocksO = makeInst(rGeo, rMatO, ROCK_CAP);
      if (!LOW) {
        const tMatO = track(new THREE.MeshBasicMaterial({ color: treeKey, side: THREE.BackSide }));
        stepFog(tMatO, FOG_STEPS);
        leavesO = makeInst(tGeoLeaf, tMatO, TREE_CAP);
      }
    } else if (theme.outline) {
      const oMat = track(new THREE.MeshBasicMaterial({ color: LOOK.outline || 0x0b0b0b, side: THREE.BackSide }));
      leavesO = makeInst(tGeoLeaf, oMat, TREE_CAP);
      rocksO = makeInst(rGeo, oMat, ROCK_CAP);
    }

    // ---- gates (S6): posts, feet, top beam, hanging banner, chevrons; unlit, per-instance colour, matrices set each frame ----
    const GT = LOOK.gate || { chevrons: false, pulse: 0 };
    const postGeo = track(new THREE.CylinderGeometry(0.22, 0.28, 3.2, 8));
    postGeo.translate(0, 1.6, 0);
    const gateMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    limitFog(gateMat, 0.15, FOG_STEPS); // gates must read as authored through fog
    const chevMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    limitFog(chevMat, 0.15, FOG_STEPS);
    const feetGeo = track(new THREE.BoxGeometry(0.6, 0.25, 0.6));
    feetGeo.translate(0, 0.125, 0);
    const beamGeo = track(new THREE.BoxGeometry(1, 0.18, 0.18));
    const bannerGeo = track(new THREE.BoxGeometry(1, 1, 0.06));
    const chevGeo = track((() => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.175, 0.15); sh.lineTo(0.175, 0.15); sh.lineTo(0, -0.15); sh.closePath();
      return new THREE.ShapeGeometry(sh);
    })());
    const posts = track(new THREE.InstancedMesh(postGeo, gateMat, GATE_CAP * 2));
    const feet = track(new THREE.InstancedMesh(feetGeo, gateMat, GATE_CAP * 2));
    const beam = track(new THREE.InstancedMesh(beamGeo, gateMat, GATE_CAP));
    const banner = track(new THREE.InstancedMesh(bannerGeo, gateMat, GATE_CAP));
    const chevs = track(new THREE.InstancedMesh(chevGeo, chevMat, GATE_CAP * 3));
    const gateMeshes = [posts, feet, beam, banner];
    for (const im of [...gateMeshes, chevs]) {
      im.frustumCulled = false;
      im.count = 0;
      if (im !== chevs) im.setColorAt(0, new THREE.Color(0xffffff)); // allocate instanceColor
      scene.add(im);
    }
    // C: keyline hulls (posts, beam), pennant banner (5 triangles + backing), candy bands; instance colours drive key / white
    let postsO = null, beamO = null, pennants = null, pennantsO = null, candy = null;
    if (paper) {
      const oMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }));
      limitFog(oMat, 0.15, FOG_STEPS);
      const pGeo = track(new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, -1); sh.closePath(); return sh; })()));
      const pMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      limitFog(pMat, 0.15, FOG_STEPS);
      const poMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      limitFog(poMat, 0.15, FOG_STEPS);
      const cGeo = track(new THREE.CylinderGeometry(0.265, 0.265, 0.3, 8));
      const cMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      limitFog(cMat, 0.15, FOG_STEPS);
      postsO = track(new THREE.InstancedMesh(postGeo, oMat, GATE_CAP * 2));
      beamO = track(new THREE.InstancedMesh(beamGeo, oMat, GATE_CAP));
      pennants = track(new THREE.InstancedMesh(pGeo, pMat, GATE_CAP * 5));
      pennantsO = track(new THREE.InstancedMesh(pGeo, poMat, GATE_CAP * 5));
      candy = track(new THREE.InstancedMesh(cGeo, cMat, GATE_CAP * 4));
      for (const im of [postsO, beamO, pennants, pennantsO, candy]) {
        im.frustumCulled = false; im.count = 0; im.setColorAt(0, new THREE.Color(0xffffff)); scene.add(im);
      }
      pennantsO.renderOrder = -1;
    }
    const COL_KEY = new THREE.Color(LOOK.outline || '#33456b');
    const gX = new Float32Array(GATE_CAP), gZ = new Float32Array(GATE_CAP), gW = new Float32Array(GATE_CAP), gId = new Int32Array(GATE_CAP);
    let gN = 0;

    // next-gate ground stripe
    const stripeGeo = track(new THREE.PlaneGeometry(1, 1));
    stripeGeo.rotateX(-Math.PI / 2);
    const stripeMat = track(new THREE.MeshBasicMaterial({ color: theme.gateNext, transparent: true, opacity: paper ? 0.9 : 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.frustumCulled = false;
    stripe.visible = false;
    scene.add(stripe);

    // pass / miss flashes (id -> start time); off in stills so a frozen frame never catches one
    const flashPass = new Map(), flashMiss = new Map();
    let prevPassed = 0, prevMissed = 0;
    const COL_MISS = new THREE.Color(LOOK.missColor || '#8a94a3');

    const _m = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _p = new THREE.Vector3();
    const _s = new THREE.Vector3();
    const _c = new THREE.Color();
    const _c2 = new THREE.Color();
    const Y_AXIS = new THREE.Vector3(0, 1, 0);
    const COL_GATE = new THREE.Color(theme.gate);
    const COL_GATE_NEXT = new THREE.Color(theme.gateNext);
    const COL_GATE_DONE = new THREE.Color(theme.gate).lerp(_tc.set(skyHex), 0.6);

    // ---- contact blobs (S4): one instanced quad, slot 0 is the sled, the rest are rebuilt with the props ----
    let blobs = null, blobN = 1;
    const BOFF = (BL && BL.off) || [0, 0]; // C: hard shadow ellipses pushed away from the sun
    if (BL) {
      const blobTex = track(makeBlobTexture(BL.edge || 0.7));
      const blobGeo = track(new THREE.PlaneGeometry(1, 1));
      blobGeo.rotateX(-Math.PI / 2);
      const blobMat = track(new THREE.MeshBasicMaterial({
        map: blobTex, color: BL.col, transparent: true, opacity: BL.alpha, alphaTest: 0.1,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      stepFog(blobMat, FOG_STEPS);
      blobs = track(new THREE.InstancedMesh(blobGeo, blobMat, BLOB_CAP));
      blobs.frustumCulled = false;
      blobs.count = 1;
      scene.add(blobs);
    }
    const Z_UP = new THREE.Vector3(0, 1, 0);
    const _n = new THREE.Vector3();
    const _qa = new THREE.Quaternion();
    function groundQuat(x, z, out) {
      _n.set(vis(x - 1, z) - vis(x + 1, z), 2, vis(x, z - 1) - vis(x, z + 1)).normalize();
      return out.setFromUnitVectors(Z_UP, _n);
    }
    function addBlob(x, z, sx, sz) {
      if (!blobs || blobN >= BLOB_CAP) return;
      _p.set(x + BOFF[0], vis(x, z) + 0.05, z + BOFF[1]);
      groundQuat(x, z, _q);
      _s.set(sx, 1, sz);
      _m.compose(_p, _q, _s);
      blobs.setMatrixAt(blobN++, _m);
    }

    // ---- edge poles (S7); poles: null turns them off ----
    let poles = null, bands = null, _pc = null;
    if (PL) {
      const poleGeo = track(new THREE.CylinderGeometry(PL.w * 0.5, PL.w * 0.5, PL.h, 6));
      poleGeo.translate(0, PL.h * 0.5, 0);
      const bandGeo = track(PL.pennant
        ? (() => { const sh = new THREE.Shape(); sh.moveTo(0, PL.h); sh.lineTo(0, PL.h - 0.5); sh.lineTo(0.55, PL.h - 0.25); sh.closePath(); return new THREE.ShapeGeometry(sh); })()
        : new THREE.CylinderGeometry(PL.w * 0.56, PL.w * 0.56, PL.bandH, 6));
      if (!PL.pennant) bandGeo.translate(0, PL.h - PL.bandH * 0.5, 0);
      const poleMat = track(new THREE.MeshBasicMaterial({ color: PL.col }));
      const bandMat = track(new THREE.MeshBasicMaterial({ color: PL.band, side: PL.pennant ? THREE.DoubleSide : THREE.FrontSide }));
      stepFog(poleMat, FOG_STEPS); stepFog(bandMat, FOG_STEPS);
      poles = track(new THREE.InstancedMesh(poleGeo, poleMat, POLE_CAP));
      bands = track(new THREE.InstancedMesh(bandGeo, bandMat, POLE_CAP));
      for (const im of [poles, bands]) { im.frustumCulled = false; im.count = 0; scene.add(im); }
      if (PL.pennant && PL.cols) { bands.setColorAt(0, new THREE.Color(0xffffff)); _pc = PL.cols.map((c) => new THREE.Color(c)); }
    }

    let lastFillZ = -1e9;
    let lastNext = -2;

    function refillProps(z, nextGate) {
      const z0 = z - 25, z1 = z + cfg.viewDist + 20;
      blobN = 1;
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
          _s.multiplyScalar(OK);
          _m.compose(_p, _q, _s);
          leavesO.setMatrixAt(i, _m);
        }
        if (BL) addBlob(t.x, t.z, BL.tree * 2 * (t.s || 1), BL.tree * 2 * (t.s || 1));
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
          _s.set(r.r * OK, r.r * 0.9 * OK, r.r * OK);
          _m.compose(_p, _q, _s);
          rocksO.setMatrixAt(i, _m);
        }
        if (BL) addBlob(r.x, r.z, r.r * 2 * BL.rock, r.r * 2 * BL.rock);
      }
      rocks.count = n;
      rocks.instanceMatrix.needsUpdate = true;
      if (rocksO) { rocksO.count = n; rocksO.instanceMatrix.needsUpdate = true; }

      const gl = course.gatesInRange(z - 10, z1);
      gN = Math.min(gl.length, GATE_CAP);
      for (let i = 0; i < gN; i++) {
        gX[i] = gl[i].x; gZ[i] = gl[i].z; gW[i] = gl[i].width; gId[i] = gl[i].id;
        if (BL) for (let sd = 0; sd < 2; sd++) { const px = gX[i] + (sd ? 0.5 : -0.5) * gW[i]; addBlob(px, gZ[i], BL.foot * 2, BL.foot * 2); }
      }
      if (blobs) { blobs.count = blobN; blobs.instanceMatrix.needsUpdate = true; }

      // edge poles (S7)
      if (poles) {
        let pn = 0;
        const ev = PL.every;
        for (let pz = Math.ceil(z0 / ev) * ev; pz <= z1 && pn + 2 <= POLE_CAP; pz += ev) {
          const mid = course.centerX(pz), hw = course.halfWidth(pz);
          for (let sd = 0; sd < 2; sd++) {
            const px = mid + (sd ? hw : -hw);
            _p.set(px, vis(px, pz), pz);
            _m.compose(_p, _q.identity(), _s.set(1, 1, 1));
            poles.setMatrixAt(pn, _m); bands.setMatrixAt(pn, _m);
            if (_pc) bands.setColorAt(pn, _pc[Math.round(pz / ev) & 1]);
            pn++;
          }
        }
        poles.count = bands.count = pn;
        poles.instanceMatrix.needsUpdate = bands.instanceMatrix.needsUpdate = true;
        if (bands.instanceColor) bands.instanceColor.needsUpdate = true;
      }
      lastFillZ = z;
      lastNext = nextGate;
    }

    // per frame (cheap, <= GATE_CAP gates): gates shrink away inside 8 to 14 m of the camera and vanish once the sled has passed
    const FLASH_PASS = 0.15, FLASH_MISS = 0.4;
    function updateGates(camZ, sledZ, nextGate, t) {
      let n = 0, cn = 0;
      const pulse = reduced || !GT.pulse ? 0 : 0.5 + 0.5 * Math.sin(t * 3.2);
      stripe.visible = false;
      for (let i = 0; i < gN; i++) {
        const gz = gZ[i], id = gId[i];
        const fp = flashPass.get(id), fm = flashMiss.get(id);
        const flashing = (fp !== undefined && t - fp < FLASH_PASS) || (fm !== undefined && t - fm < FLASH_MISS);
        if (gz < sledZ - 0.5 && !flashing) continue;
        let fade = clamp((gz - camZ - 8) / 6, 0, 1);
        if (flashing) fade = Math.max(fade, 0.8);
        if (fade <= 0) continue;
        const isNext = id === nextGate;
        if (isNext) { _c.copy(COL_GATE_NEXT); if (pulse) _c.lerp(COL_WHITE, 0.06 * pulse); }
        else if (id < nextGate) _c.copy(COL_GATE_DONE); else _c.copy(COL_GATE);
        let k = (isNext ? (paper ? 2.0 : 1.6) + 0.12 * pulse : 1) * fade;
        const bannerCol = _c2.copy(_c);
        if (fp !== undefined && t - fp < FLASH_PASS) { const u = 1 - (t - fp) / FLASH_PASS; _c.lerp(COL_WHITE, u); bannerCol.copy(_c); if (!reduced) k *= 1 + 0.15 * u; }
        else if (fm !== undefined && t - fm < FLASH_MISS) bannerCol.copy(COL_MISS);
        const gw = gW[i] * fade; // the whole gate squeezes in as it fades, not just its height
        _q.identity();
        for (let side = 0; side < 2; side++) {
          const px = gX[i] + (side ? 0.5 : -0.5) * gw;
          _p.set(px, vis(px, gz), gz);
          _s.set(k, k, k);
          _m.compose(_p, _q, _s);
          posts.setMatrixAt(n * 2 + side, _m); posts.setColorAt(n * 2 + side, _c);
          feet.setMatrixAt(n * 2 + side, _m); feet.setColorAt(n * 2 + side, _c);
        }
        const gy = vis(gX[i], gz);
        _p.set(gX[i], gy + 3.2 * k - 0.09 * k, gz);
        _s.set(gw, k, k);
        _m.compose(_p, _q, _s);
        beam.setMatrixAt(n, _m); beam.setColorAt(n, _c);
        const bh = 0.75 * k;
        const byc = gy + 3.2 * k - 0.18 * k - bh * 0.5;
        _p.set(gX[i], byc, gz);
        _s.set(gw - 0.4, bh, k);
        _m.compose(_p, _q, _s);
        banner.setMatrixAt(n, _m); banner.setColorAt(n, bannerCol);
        if (paper) {
          const key = isNext ? COL_WHITE : COL_KEY;
          const sxz = isNext ? 1.45 : 1.3;
          for (let side = 0; side < 2; side++) {
            const px = gX[i] + (side ? 0.5 : -0.5) * gw;
            const py = vis(px, gz);
            const oi = n * 2 + side;
            _p.set(px, py, gz); _s.set(k * sxz, k * 1.02, k * sxz);
            _m.compose(_p, _q, _s); postsO.setMatrixAt(oi, _m); postsO.setColorAt(oi, key);
            for (let b = 0; b < 2; b++) {
              _p.set(px, py + (0.9 + 1.2 * b) * k, gz); _s.set(k, k, k);
              _m.compose(_p, _q, _s); candy.setMatrixAt(n * 4 + side * 2 + b, _m); candy.setColorAt(n * 4 + side * 2 + b, COL_WHITE);
            }
          }
          _p.set(gX[i], gy + 3.2 * k - 0.09 * k, gz); _s.set(gw + 0.14 * k, k * 1.8, k * 1.8);
          _m.compose(_p, _q, _s); beamO.setMatrixAt(n, _m); beamO.setColorAt(n, key);
          const pw = (gw - 0.4) / 5, topY = gy + 3.2 * k - 0.18 * k;
          for (let q = 0; q < 5; q++) {
            const qx = gX[i] + (q - 2) * pw;
            _p.set(qx, topY, gz - 0.03 * k); _s.set(pw, bh, k);
            _m.compose(_p, _q, _s); pennants.setMatrixAt(n * 5 + q, _m); pennants.setColorAt(n * 5 + q, q & 1 ? COL_WHITE : bannerCol);
            _p.set(qx, topY + 0.04 * k, gz - 0.01 * k); _s.set(pw * 1.22, bh * 1.2, k);
            _m.compose(_p, _q, _s); pennantsO.setMatrixAt(n * 5 + q, _m); pennantsO.setColorAt(n * 5 + q, key);
          }
        }
        if (GT.chevrons) {
          for (let c = -1; c <= 1; c++) {
            _p.set(gX[i] + c * (gw - 0.4) * 0.27, byc, gz - 0.05 * k);
            _s.set(k, k, k);
            _m.compose(_p, _q, _s);
            chevs.setMatrixAt(cn++, _m);
          }
        }
        if (isNext) {
          stripe.visible = true;
          stripe.position.set(gX[i], gy + 0.06, gz);
          groundQuat(gX[i], gz, stripe.quaternion);
          stripe.scale.set(gw * (paper ? 1.2 : 1), 1, paper ? 2.4 : 1.2);
        }
        n++;
      }
      for (const im of gateMeshes) {
        im.count = im === posts || im === feet ? n * 2 : n;
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      }
      chevs.count = cn; chevs.instanceMatrix.needsUpdate = true;
      if (paper) {
        banner.count = 0;
        postsO.count = n * 2; beamO.count = n; pennants.count = pennantsO.count = n * 5; candy.count = n * 4;
        for (const im of [postsO, beamO, pennants, pennantsO, candy]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
      }
    }

    // ---- sled (S5 model from lookparts); colours from LOOK.sledC or the theme ----
    const sled = new THREE.Group();
    sled.rotation.order = 'YXZ';
    const sledModel = makeSledModel({ sled: SC.sled, glow: SC.glow, suit: LOOK.suitC || LOOK.suit, wing: LOOK.wing });
    sledModel.group.position.y = -(HOVER - 0.25); // skids hover just above the snow
    sled.add(sledModel.group);
    // C: toon sled (3-step ramp) with a normal-extruded keyline shell per part, oversize helmet
    if (paper) {
      const ramp3 = track(makeRamp([90, 170, 255, 255]));
      const outSled = track(new THREE.MeshBasicMaterial({ color: LOOK.outline || '#33456b', side: THREE.BackSide }));
      const sw = LOOK.sledOutline || 0.05;
      patchShader(outSled, 'sledOutline' + sw, (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize( normal ) * ' + sw.toFixed(3) + ';'); });
      const parts = [];
      sledModel.group.traverse((x) => { if (x.isMesh && sledModel.glowMats.indexOf(x.material) < 0) parts.push(x); });
      for (const m of parts) {
        const old = m.material;
        m.material = track(new THREE.MeshToonMaterial({ color: old.color.clone(), gradientMap: ramp3 }));
        old.dispose();
        if (m.geometry.type === 'IcosahedronGeometry') m.scale.setScalar(LOOK.helm || 1);
        const og = track(weldNormals(m.geometry));
        const om = new THREE.Mesh(og, outSled);
        om.position.copy(m.position); om.scale.copy(m.scale); om.rotation.copy(m.rotation);
        m.parent.add(om);
      }
    }
    if (LOOK.stripe) {
      const stripeBox = track(new THREE.BoxGeometry(LOOK.stripe.w, 0.02, 1.3));
      const stripeM = track(new THREE.MeshLambertMaterial({ color: LOOK.stripe.col, flatShading: true }));
      const rs = new THREE.Mesh(stripeBox, stripeM);
      rs.position.set(0, 0.105, -0.05);
      sledModel.group.add(rs);
    }
    sledModel.group.traverse((x) => {
      const m = x.material;
      if (m && m.isMeshStandardMaterial) { m.flatShading = true; if (LOOK.hullRough != null) m.roughness = LOOK.hullRough; m.needsUpdate = true; }
    });
    const flareGeo = track(new THREE.ConeGeometry(0.5, 2.6, 8));
    flareGeo.rotateX(-Math.PI / 2); // tip toward -z
    flareGeo.translate(0, 0, -2.2);
    const flareMat = track(new THREE.MeshBasicMaterial({ color: theme.boostFlare, fog: false }));
    const flare = new THREE.Mesh(flareGeo, flareMat);
    flare.visible = false;
    sled.add(flare);
    scene.add(sled);

    // C: 6-point star pop for 0.2 s when a boost starts (off with reduced motion)
    let star = null, starT = -9, wasBoost = false;
    if (paper && !reduced) {
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const g = cv.getContext('2d');
        g.fillStyle = '#ffffff'; g.strokeStyle = hexStr(SC.glow); g.lineWidth = 3; g.beginPath();
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 - Math.PI / 2, r = i & 1 ? 12 : 30; g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
        g.closePath(); g.fill(); g.stroke();
        const tx = track(new THREE.CanvasTexture(cv)); tx.colorSpace = THREE.SRGBColorSpace;
        star = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, fog: false })));
        star.position.set(0, 0.5, -1.4); star.scale.setScalar(2.2); star.visible = false;
        sled.add(star);
      } catch (e) { star = null; }
    }
    const COL_IDLE = new THREE.Color(SC.glow);
    const COL_CHARGE = new THREE.Color(0xffffff);
    const COL_BOOST = new THREE.Color(theme.boostFlare);

    // S8 trail ribbons and spray (skid tails); spray off with reduced motion or spray: null
    const trail = LOOK.trail ? makeTrail(LOOK.trail, paper ? { width: LOOK.trailW || 0.22, interval: LOOK.trailInterval } : undefined) : null;
    const trail2 = LOOK.trailCore ? makeTrail(LOOK.trailCore, { width: 0.06, interval: LOOK.trailInterval }) : null;
    const spray = !reduced && LOOK.spray ? makeSpray(LOOK.spray, paper ? { n: 12, size: 0.3, life: 0.3 } : undefined) : null;
    if (trail2) { trail2.mesh.renderOrder = 3; scene.add(trail2.mesh); }
    if (trail) scene.add(trail.mesh);
    if (spray) scene.add(spray.points);
    const _tl = new THREE.Vector3(), _tr = new THREE.Vector3();

    // S9 speed streaks: thin quads in camera space at the screen sides (Post only, never with reduced motion)
    let streaks = null, STREAK_N = 0;
    const ST = LOOK.streaks;
    if (POST && !reduced && ST && ST.n > 0) {
      const tapered = paper || ST.taper;
      const streakGeo = track(tapered
        ? (() => { const g = new THREE.BufferGeometry(); const sw = (ST.w || 0.05) / 2, l = (ST.len || 4) / 2; // wide at the camera end, narrow far end
            g.setAttribute('position', new THREE.Float32BufferAttribute([-sw, 0, l, sw, 0, l, sw * 0.15, 0, -l, -sw * 0.15, 0, -l], 3));
            g.setIndex([0, 1, 2, 0, 2, 3]); return g; })()
        : new THREE.PlaneGeometry(0.03, 3));
      if (!tapered) streakGeo.rotateX(-Math.PI / 2);
      const streakMat = track(new THREE.MeshBasicMaterial({ color: ST.col || 0xffffff, transparent: true, opacity: tapered ? 1 : 0.55, depthWrite: false, fog: false, side: tapered ? THREE.DoubleSide : THREE.FrontSide }));
      streaks = track(new THREE.InstancedMesh(streakGeo, streakMat, ST.n));
      STREAK_N = LOW && ST.nLow ? Math.min(ST.nLow, ST.n) : ST.n;
      streaks.frustumCulled = false;
      streaks.count = 0;
      camera.add(streaks);
    }

    // particles: look flake counts / paper diamonds only for snow-type particles or when the theme's look sets flakes
    const particles = createParticles(theme.particles, theme.groundHigh);
    if (particles.object3D.isPoints && LOOK.flakes && (theme.particles === 'snow' || OWN.flakes)) {
      const fl = LOOK.flakes;
      const nTot = particles.object3D.geometry.attributes.position.count;
      particles.object3D.geometry.setDrawRange(0, Math.min(nTot, LOW ? (fl.nLow || fl.n) : fl.n));
      if (fl.size) particles.object3D.material.size = fl.size;
      if (paper && theme.particles === 'snow') {
        try { // C: 4-point paper diamonds, white with a pale edge
          const cv = document.createElement('canvas'); cv.width = cv.height = 64;
          const g = cv.getContext('2d');
          g.beginPath(); g.moveTo(32, 3); g.lineTo(58, 32); g.lineTo(32, 61); g.lineTo(6, 32); g.closePath();
          g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 5; g.strokeStyle = fl.edge || '#a9d2ee'; g.stroke();
          const tx = track(new THREE.CanvasTexture(cv)); tx.colorSpace = THREE.SRGBColorSpace;
          particles.object3D.material.map = tx; particles.object3D.material.opacity = 1; particles.object3D.material.needsUpdate = true;
          // clamp flake size and shrink near-camera flakes so none reads as a big UI diamond
          patchShader(particles.object3D.material, 'flakeClamp', (sh) => {
            sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n gl_PointSize = min(gl_PointSize, 22.0) * smoothstep(3.0, 9.0, -mvPosition.z);');
          });
        } catch (e) { /* keep default sprite */ }
      }
    } else if (particles.object3D.isPoints && LOW) {
      const nTot = particles.object3D.geometry.attributes.position.count;
      particles.object3D.geometry.setDrawRange(0, Math.ceil(nTot / 2));
    }
    scene.add(particles.object3D);

    // ---- camera state (scalars, no per-frame allocation) ----
    let camX = 0, fov = 66;
    let lastT = -1;
    let fpsAcc = 0, fpsFrames = 0;

    // flow fx: sled events from main.js (no allocation, reuses spray pool and glow materials)
    let fxX = 0, fxZ = 0, fxNow = 0, fxGlowUntil = -1;
    const _fx = new THREE.Vector3();
    function fx(ev) {
      if (!ev || reduced) return;
      if (ev.type === 'graze' && spray) {
        const razor = ev.tier === 'razor';
        const side = ev.x < fxX ? -1 : 1; // sled side nearest the rock
        _fx.set(fxX + side * 0.5, sled.position.y - 0.2, fxZ);
        spray.emit(_fx, razor ? 8 : 3);
        if (razor && star) { starT = fxNow; star.position.x = side * 0.6; }
      } else if (ev.type === 'flowUp' && ev.level >= 5) {
        fxGlowUntil = fxNow + 1;
      }
    }

    function resize() {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function draw(state, timeSec) {
      const z = state.z;
      fxX = state.x; fxZ = z; fxNow = timeSec;
      scene.fog.density = cfg.fogDensity * theme.fogDensity * (LOOK.fogMul || 1);
      const dt = lastT < 0 ? 0 : clamp(timeSec - lastT, 0, 0.1);
      lastT = timeSec;
      camera.far = cfg.viewDist + 80;

      // measured fps for window.__ridgeline.fps (about twice a second)
      if (dt > 0) { fpsAcc += dt; fpsFrames++; if (fpsAcc >= 0.5) { try { if (window.__ridgeline) window.__ridgeline.fps = fpsFrames / fpsAcc; } catch (e) { /* ignore */ } fpsAcc = 0; fpsFrames = 0; } }

      updateChunks(z);
      if (Math.abs(z - lastFillZ) > REFILL_STEP || state.nextGate !== lastNext) refillProps(z, state.nextGate);

      // gate pass / miss flashes
      if (state.gatesPassed !== prevPassed || state.gatesMissed !== prevMissed) {
        if (!STILL) {
          if (state.gatesPassed > prevPassed) flashPass.set(state.nextGate - 1, timeSec);
          if (state.gatesMissed > prevMissed) flashMiss.set(state.nextGate - 1, timeSec);
        }
        prevPassed = state.gatesPassed; prevMissed = state.gatesMissed;
      }

      // sled
      const gy = course.height(state.x, z);
      const sy = Math.max(state.y, gy) + HOVER + step * 0.5 + 0.08 * Math.sin(timeSec * 6);
      sled.position.set(state.x, sy, z);
      const ahead = course.height(state.x, z + 3);
      sled.rotation.x = Math.atan2(sy - HOVER - ahead, 3) * 0.9;
      sled.rotation.y = clamp(state.heading || 0, -0.6, 0.6);
      const roll = clamp(-state.vx * 0.035, -0.6, 0.6);
      sled.rotation.z = roll;
      sledModel.setLean(roll);
      const boosting = state.boostT > 0;
      let gcol = boosting ? COL_BOOST : (state.charging ? _c.copy(COL_IDLE).lerp(COL_CHARGE, 0.5 + 0.5 * Math.sin(timeSec * 30)) : COL_IDLE);
      if (!reduced && timeSec < fxGlowUntil && !boosting) gcol = _c.copy(gcol).lerp(COL_BOOST, Math.min(1, fxGlowUntil - timeSec) * 0.8); // flow 5 accent
      for (const m of sledModel.glowMats) m.color.copy(gcol);
      flare.visible = boosting;
      if (star) {
        if (boosting && !wasBoost) starT = timeSec;
        wasBoost = boosting;
        star.visible = timeSec - starT < 0.2;
        if (!star.visible) star.position.x = 0;
      }
      if (boosting) {
        const f = 0.8 + 0.4 * Math.sin(timeSec * 50);
        flare.scale.set(f, f, 0.8 + 0.5 * Math.sin(timeSec * 37 + 1));
      }

      // sled contact blob (slot 0): shrinks as it rises off the ground
      if (blobs) {
        const hov = Math.max(0, sy - HOVER - gy);
        const fadeK = clamp(1 - hov / 4, 0.25, 1);
        _p.set(state.x, vis(state.x, z) + 0.05, z); // sled blob stays centred under the sled
        groundQuat(state.x, z, _q);
        _qa.setFromAxisAngle(Y_AXIS, sled.rotation.y);
        _q.multiply(_qa);
        _s.set(BL.sledW * fadeK, 1, BL.sledL * fadeK);
        _m.compose(_p, _q, _s);
        blobs.setMatrixAt(0, _m);
        blobs.instanceMatrix.needsUpdate = true;
      }

      // camera: behind (-z) and above, looking ahead downhill; fov widens with speed
      camX += (state.x - camX) * 0.12;
      const cy = sy + cfg.camHeight;
      camera.position.set(camX, cy, z - cfg.camBack);
      const lz = z + 16;
      camera.lookAt(state.x * 0.85 + camX * 0.15, course.height(state.x, lz) - 1.0, lz);
      if (ROLL) camera.rotateZ(clamp(-state.vx * 0.004, -0.05, 0.05)); // S9 roll (Post only)
      const span = Math.max(1, cfg.maxSpeed - cfg.baseSpeed);
      const k = clamp((state.speed - cfg.baseSpeed) / span, 0, 1.2);
      const aspect = w / h;
      const baseFov = aspect < 1 ? 68 : 58; // tall portrait needs more vertical view
      const target = baseFov + (reduced ? 0 : 12 * k + (boosting ? 5 : 0));
      fov += (target - fov) * 0.1;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

      // sky, ranges follow the camera
      dome.update(camera);
      for (const r of ranges) r.mesh.position.set(camera.position.x, camera.position.y + r.dy, camera.position.z);

      // S8 trail and spray from the skid tails
      sled.updateMatrixWorld(true);
      if (trail || trail2 || spray) {
        sledModel.group.localToWorld(_tl.set(-0.5, -0.2, -0.95));
        sledModel.group.localToWorld(_tr.set(0.5, -0.2, -0.95));
        if (trail) trail.update(_tl, _tr, dt);
        if (trail2) trail2.update(_tl, _tr, dt);
        if (spray) {
          if (dt > 0 && (Math.abs(state.vx) > 6 || boosting)) { spray.emit(_tl, 1); spray.emit(_tr, 1); }
          spray.update(dt);
        }
      }

      // speed streaks
      if (streaks) {
        let sn = 0;
        if (state.speed > ST.minSpeed) {
          for (let i = 0; i < STREAK_N; i++) {
            const side = i & 1 ? 1 : -1;
            const hsh = ((i * 2654435761) >>> 0) / 4294967296;
            const hs2 = ((i * 40503 + 17) * 2246822519 >>> 0) / 4294967296;
            const zz = -2 - ((hsh * 6 + timeSec * state.speed * 0.5) % 6);
            _p.set(side * (1.7 + hs2 * 1.1), (hsh - 0.5) * 4.5, zz);
            _m.compose(_p, _q.identity(), _s.set(1, 1, 1));
            streaks.setMatrixAt(sn++, _m);
          }
          streaks.instanceMatrix.needsUpdate = true;
        }
        streaks.count = sn;
      }

      updateGates(z - cfg.camBack, z, state.nextGate, timeSec);
      particles.update(camera.position, dt, state.speed);
      renderer.render(scene, camera);
    }

    function dispose() {
      for (const m of chunks.values()) { scene.remove(m); m.geometry.dispose(); }
      for (const m of pool) { scene.remove(m); m.geometry.dispose(); }
      chunks.clear(); pool.length = 0;
      for (const t of [trail, trail2]) if (t) { scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); }
      if (spray) { scene.remove(spray.points); spray.points.geometry.dispose(); spray.points.material.dispose(); }
      scene.remove(dome.group);
      if (typeof dome.dispose === 'function') dome.dispose();
      for (const r of ranges) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
      if (typeof sledModel.dispose === 'function') sledModel.dispose();
      scene.remove(particles.object3D); particles.dispose();
      if (vignette) vignette.remove();
      if (hudStyle) hudStyle.remove();
      try { document.body.classList.remove('rl-paper'); } catch (e) { /* ignore */ }
      for (const d of disposables) { try { d.dispose(); } catch (e) { /* already freed */ } }
      disposables.length = 0;
    }

    resize();
    return { draw, dispose, resize, camera, fx };
  }

  function resize(nw, nh) {
    w = Math.max(1, nw | 0); h = Math.max(1, nh | 0);
    renderer.setPixelRatio(dprCap());
    renderer.setSize(w, h, false);
    world.resize();
  }

  function draw(state, timeSec) { world.draw(state, timeSec); }
  function fx(ev) { if (world && world.fx) world.fx(ev); }

  function stats() {
    const r = renderer.info.render;
    return { calls: r.calls, triangles: r.triangles };
  }

  function dispose() {
    if (world) world.dispose();
    world = null;
    renderer.dispose();
  }

  function setTheme(id) {
    if (world) world.dispose();
    world = buildWorld(id);
  }

  world = buildWorld(themeId);
  resize(canvas.clientWidth || 475, canvas.clientHeight || 638);
  return {
    resize, draw, fx, stats, dispose, setTheme,
    get camera() { return world ? world.camera : null; },
  };
}
