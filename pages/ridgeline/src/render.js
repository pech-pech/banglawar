// Ridgeline render slice 5 (look C, Cut-Paper Pop, for every theme). THREE only, WebGLRenderer, built-in materials
// (small onBeforeCompile patches), no shadows. Per-theme look data comes from looks.js (lookFor); colours never live here.
import * as THREE from '../vendor/three.module.js';
import { DEFAULT_THEME, THEMES } from './themes.js';
import { treeGeometry, rockGeometry } from './shapes.js';
import { createParticles } from './particles.js';
import { makeSkyDome, makeRange, makePaperRange, makeBlobTexture, makeSledModel, makeTrail, makeSpray, makeRibbon, makeShards, makeBoostFan, makeClouds, makeSoftRange } from './lookparts.js';
import { lookFor, THEME_LOOKS } from './looks.js';
import { loadAtlas, ATLAS_SIZE, CELLS, GATE, FX_CELLS } from './duneatlas.js';
import { createDuneFx } from './dunefx.js';
import { mulberry32 } from './rng.js';
// B4 VIS begin
import { createVis } from './vis/index.js';
// B4 VIS end

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

// Sprite-atlas billboards (SOFT / dune look only): ONE InstancedMesh of a unit quad (pivot bottom centre), y-axis-locked toward the camera.
// Per instance: matrix (translation + x/y scale), uv rect (aRect: u0, v0, du, dv; negative du mirrors), colour tint, fog limit (aFogK).
function makeBoards(img, cap, aa) {
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true; tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
  tex.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  const aRect = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aFog = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aRect', aRect); geo.setAttribute('aFogK', aFog);
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: !!aa, side: THREE.DoubleSide });
  const U = { uCap: { value: 0.6 }, uFogMul: { value: 1 } };
  patchShader(mat, 'atlasBoard', (sh) => {
    sh.uniforms.uCap = U.uCap; sh.uniforms.uFogMul = U.uFogMul;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRect;\nattribute float aFogK;\nvarying float vFogK;\nuniform float uCap;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = aRect.xy + uv * aRect.zw;\n#endif\n vFogK = aFogK;')
      .replace('#include <project_vertex>', `vec3 bbP = instanceMatrix[3].xyz;
 vec2 bbD = cameraPosition.xz - bbP.xz;
 vec3 bbR = vec3( bbD.y, 0.0, - bbD.x ) / max( length( bbD ), 1e-4 );
 float bbDepth = max( - ( viewMatrix * vec4( bbP, 1.0 ) ).z, 0.3 );
 float bbCap = min( 1.0, uCap * bbDepth / max( instanceMatrix[1].y * projectionMatrix[1][1], 1e-4 ) ); // never taller than ~30% of the screen: shrink toward the foot
 vec3 bbW = bbP + bbR * ( position.x * instanceMatrix[0].x * bbCap ) + vec3( 0.0, position.y * instanceMatrix[1].y * bbCap, 0.0 );
 vec4 mvPosition = viewMatrix * vec4( bbW, 1.0 );
 gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFogK;\nuniform float uFogMul;')
      .replace('#include <fog_fragment>', '#ifdef USE_FOG\n float fogF = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogF * min( vFogK * uFogMul, 1.0 ) );\n#endif');
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false; mesh.count = 0; mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bp = new THREE.Vector3(), _bs = new THREE.Vector3();
  const B = {
    tex, geo, mat, mesh, cap, U, n: 0, nProps: 0,
    // x, y, z = bottom centre; w, h in metres; cell = CELLS key; fogK 0..1; tint THREE.Color or null
    add(cell, x, y, z, w, h, mirror, fogK, tint) {
      if (B.n >= cap) return -1;
      const c = CELLS[cell], i = B.n++;
      _bp.set(x, y, z); _bs.set(w, h, 1); _bm.compose(_bp, _bq, _bs); mesh.setMatrixAt(i, _bm);
      const u0 = c[0] / ATLAS_SIZE, du = c[2] / ATLAS_SIZE, dv = c[3] / ATLAS_SIZE, v0 = 1 - (c[1] + c[3]) / ATLAS_SIZE; // json y is from the top
      aRect.setXYZW(i, mirror ? u0 + du : u0, v0, mirror ? -du : du, dv);
      aFog.setX(i, fogK);
      if (tint) mesh.setColorAt(i, tint); else mesh.setColorAt(i, COL_ONE);
      return i;
    },
    flush() {
      mesh.count = B.n;
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; aRect.needsUpdate = true; aFog.needsUpdate = true;
    },
  };
  return B;
}
const COL_ONE = new THREE.Color(1, 1, 1);
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
  // B4 VIS begin
  const VIS = !!o.vis && !STILL; // o.vis = hooks from main.js; ?vis=0 or the still path keeps the old visuals
  // B4 VIS end
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
    const SOFT = LOOK.soft || null; // Longlight Haze: smooth gradients, haze, backlit silhouettes (no keylines, no bands)
    const FOG_STEPS = LOOK.fogSteps && !LOW ? LOOK.fogSteps : 0;
    const step = theme.terrainStep > 0 ? theme.terrainStep : 0;
    const flat = !!theme.flatShading;
    const skyHex = LOOK.fogColor || theme.sky;
    const SC = LOOK.sledC || { sled: theme.sled, glow: theme.sledGlow };
    const ROLL = POST && !reduced;
    const BL = LOOK.blob || null;
    const SH = paper && LOOK.shadow && LOOK.light ? LOOK.shadow : null;   // C: projected paper shadows replace the prop blobs
    const SUNV = (LOOK.light ? new THREE.Vector3().fromArray(LOOK.light.dir) : SUN_DIR.clone()).normalize();
    const RIM = paper && LOOK.rim ? LOOK.rim : null;
    const rimU = { uSunV: { value: new THREE.Vector3() }, uRimCol: { value: new THREE.Color(RIM ? RIM.col : '#ffffff') } };
    function addRim(mat) {
      if (!RIM) return;
      patchShader(mat, 'rim' + RIM.w, (sh) => {
        sh.uniforms.uSunV = rimU.uSunV; sh.uniforms.uRimCol = rimU.uRimCol;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunV;\nuniform vec3 uRimCol;')
          .replace('#include <opaque_fragment>', `#include <opaque_fragment>
 float rimN = 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 );
 float rimF = step( ${RIM.w.toFixed(2)}, rimN ) * step( ${(RIM.minSun || 0.1).toFixed(2)}, dot( normalize( normal ), uSunV ) );
 gl_FragColor.rgb = mix( gl_FragColor.rgb, uRimCol, rimF );`);
      });
    }
    const PL = LOOK.poles || null;
    // B4 VIS begin
    let V = null; // vis integrator for this world (created once the sled exists)
    // B4 VIS end

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
    const LT = SOFT ? 0.12 : 0.6; // soft look keeps the dusk light tints
    const hemi = new THREE.HemisphereLight(new THREE.Color(theme.hemiSky).lerp(COL_WHITE, LT), new THREE.Color(theme.hemiGround).lerp(COL_WHITE, LT), theme.hemiIntensity * norm);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(new THREE.Color(theme.sun).lerp(COL_WHITE, LT), theme.sunIntensity * norm);
    if (LOOK.light) { sun.position.copy(SUNV).multiplyScalar(80); if (LOOK.light.color) sun.color.set(LOOK.light.color); } else sun.position.set(-40, 60, -20);
    scene.add(sun);
    renderer.setClearColor(skyHex, 1);

    // S1/S2 sky dome, sun and range strips (follow the camera)
    scene.add(camera);
    const dome = makeSkyDome(LOOK.sky, LOOK.sun);
    scene.add(dome.group);
    const ranges = [];
    for (const r of LOOK.ranges || []) {
      if (LOW && r.low) continue;
      const m = r.dune ? makeSoftRange(r.seed, r.r, r.base || 0, r.peak, r.top, { fade: r.fade, rim: r.rim, rimH: r.rimH, fadeH: r.fadeH, towers: r.towers, soften: r.soften })
        : (r.paper || paper)
        ? makePaperRange(r.seed, r.r, r.base || 0, r.peak, r.top, { edge: r.edge, edgeH: r.edgeH, stepped: !!r.stepped, brush: !!r.brush, blockSeg: r.blockSeg, steps: r.steps })
        : makeRange(r.seed, r.r, 0, r.peak, r.top, skyHex, r.cap ? { cap: r.cap, capFrac: r.capFrac } : undefined);
      m.frustumCulled = false;
      scene.add(m);
      ranges.push({ mesh: m, dy: r.dy });
    }
    // C: extra mid-ground paper ridge (nearer than the far ranges, x lags the camera so it shows parallax when steering)
    const MR = LOOK.midRange;
    if (MR && !LOW) {
      const rs = LOOK.ranges || [];
      const topC = MR.top ? new THREE.Color(MR.top) : new THREE.Color(rs.length ? rs[rs.length - 1].top : '#5d84bc').multiplyScalar(MR.k || 0.9);
      const m = makePaperRange(MR.seed, MR.r, MR.base || 0, MR.peak, topC, { edge: MR.edge || (rs[0] && rs[0].edge), edgeH: 1.0 });
      m.frustumCulled = false;
      scene.add(m);
      ranges.push({ mesh: m, dy: MR.dy, par: MR.par });
    }
    // C: drifting cut-out clouds
    const clouds = LOOK.clouds && !LOW ? makeClouds(LOOK.clouds) : null;
    if (clouds) scene.add(clouds.mesh);
    // B4 VIS begin: materials the night grade tints (dome, sun, far ranges): [material, original colour]
    const tintMats = [];
    if (VIS) {
      const addT = (m) => { if (m && m.color && m.color.isColor && !tintMats.some((t) => t[0] === m)) tintMats.push([m, m.color.clone()]); };
      dome.group.traverse((x) => { if (x.material) addT(x.material); });
      for (const r of ranges) addT(r.mesh.material);
    }
    // B4 VIS end

    // S10 vignette: CSS div between canvas and #ui (Post only)
    let vignette = null;
    try { const old = document.getElementById('rl-vignette'); if (old) old.remove(); } catch (e) { /* ignore */ }
    if (POST && LOOK.vignette && !VIS) { // B4 VIS: postfx owns the vignette
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
    if (SOFT) {
      // Longlight Haze ground: shade -> lit by sun-facing slope, wind ripples, crest rim, hollows pool haze; banks plum with a warm rim.
      terrainMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      const v3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };
      patchShader(terrainMat, 'softTerrain' + (VIS ? 'V' : ''), (sh) => { // B4 VIS: own program key
        sh.uniforms.uLit = { value: v3(SOFT.lit) }; sh.uniforms.uShadeG = { value: v3(SOFT.shade) };
        sh.uniforms.uBank = { value: v3(SOFT.bank) }; sh.uniforms.uBankRim = { value: v3(SOFT.bankRim) };
        sh.uniforms.uHaze = { value: v3(SOFT.haze) }; sh.uniforms.uL = { value: SUNV.clone() };
        sh.uniforms.uK = { value: new THREE.Vector3(SOFT.rim, SOFT.ripple, SOFT.hollow) };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;\nvarying vec3 vN;\nattribute float aEdge;\nvarying float vEd;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = position;\nvN = normal;\nvEd = aEdge;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;\nvarying vec3 vN;\nvarying float vEd;\nuniform vec3 uLit,uShadeG,uBank,uBankRim,uHaze,uL,uK;')
          .replace('#include <color_fragment>', `
 vec3 Nn = normalize( vN );
 vec3 Vv = normalize( cameraPosition - vW );
 float hT = vColor.r;
 float hillK = max( 1.0 - smoothstep( 0.6, 0.9, normalize( vN ).y ), smoothstep( 0.05, 0.5, vColor.a ) );
 float sideK = smoothstep( -10.0, -1.0, vEd ) * 0.85; // slopes at the course edge get their own darker plum value step
 float bankK = max( max( smoothstep( 0.0, 2.2, vEd ), hillK ), sideK * 0.6 );
 float ndl = dot( Nn, uL );
 float litK = smoothstep( 0.08, 0.5, ndl );
 vec3 gcol = mix( uShadeG, uLit, litK );
 vec3 bcol = mix( uBank, uShadeG, 0.3 + 0.25 * smoothstep( 0.3, 0.9, ndl ) );
 bcol = mix( bcol, uBankRim, smoothstep( 0.7, 1.0, ndl ) * 0.3 );
 
 bcol = mix( bcol, uHaze, smoothstep( 70.0, 170.0, vFogDepth ) * 0.4 );
 vec3 col = mix( gcol, bcol, bankK );
 // wind ripples: fine wavy lines along z, fade with distance / pixel footprint so they never shimmer
 float rs = ( vW.x + 1.3 * sin( vW.z * 0.23 ) + 0.4 * sin( vW.z * 0.9 ) ) * 5.5 + vW.z * 0.35;
 float rfw = fwidth( rs );
 float rpf = ( 1.0 - smoothstep( 0.35, 1.0, rfw ) ) * ( 1.0 - smoothstep( 18.0, 55.0, vFogDepth ) );
 col *= 1.0 + uK.y * sin( rs ) * rpf * ( 1.0 - bankK * 0.6 );
 // crest glow: grazing, sun-side-lit slopes pick up the warm rim (reads as a bright thin crest line)
 float gr = pow( 1.0 - clamp( dot( Nn, Vv ), 0.0, 1.0 ), 7.0 );
 float sunSide = smoothstep( -0.2, 0.6, dot( normalize( vec3( Vv.x, 0.0, Vv.z ) ), -vec3( uL.x, 0.0, uL.z ) ) );
 col = mix( col, mix( uLit * 1.08, uBankRim, bankK ), clamp( max( gr * ( 1.0 - hillK ), smoothstep( 0.55, 0.7, Nn.y ) * ( 1.0 - smoothstep( 0.72, 0.88, Nn.y ) ) * 0.8 ) * uK.x * ( 0.45 + 0.55 * sunSide ) * smoothstep( 0.0, 0.4, ndl ), 0.0, 0.85 ) );
 // wind-crest bands across the floor: soft dark lee body, thin amber sun-facing edge
 float bs = vW.z * 0.17 + 0.9 * sin( vW.x * 0.07 + vW.z * 0.02 ) + 0.5 * sin( vW.x * 0.19 );
 float bf = fract( bs ); float bw = fwidth( bs ) * 1.5 + 0.002;
 float bandFade = ( 1.0 - bankK ) * ( 1.0 - smoothstep( 40.0, 110.0, vFogDepth ) ) * ( 1.0 - smoothstep( 0.4, 1.2, fwidth( bs ) * 8.0 ) ) * smoothstep( 12.0, 25.0, length( vW.xz - cameraPosition.xz ) );   // B4 VIS QA-4: 0 inside 12 m, full at 25 m of the camera
 float bEdge = smoothstep( 0.0, bw, bf ) * ( 1.0 - smoothstep( 0.05, 0.05 + 0.09 + bw, bf ) );
 col = mix( col, col * 0.78, smoothstep( 0.12, 0.9, bf ) * 0.55 * bandFade );
 col = mix( col, vec3( 1.0, 0.72, 0.38 ), bEdge * 0.55 * bandFade );
 // hollows pool haze
 float hol = ( 1.0 - vColor.r ) * ( 1.0 - bankK );
 col = mix( col, uHaze, hol * uK.z * smoothstep( 8.0, 70.0, vFogDepth ) );
 diffuseColor.rgb = col;
`);
        if (V) V.patchGround(sh); // B4 VIS: sand tracks + night grade after `diffuseColor.rgb = col;`
      });
    } else if (paper) {
      // C: unlit two-tone ground; shade flag rides in vertex alpha, hard threshold + contour lines in the fragment shader
      terrainMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      const shadeC = new THREE.Color(LOOK.bankShade || theme.bank);
      const cWarm = new THREE.Color(LOOK.litTint || '#ffffff'), cGShade = new THREE.Color((LOOK.groundShade && LOOK.groundShade.col) || '#ffffff');
      const ct = LOOK.contour || { every: 1.5, frac: 0, dark: 0 };
      const PG = LOOK.ground || null;
      const v3 = (h) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };
      patchShader(terrainMat, 'paperTerrain' + (PG ? 'G' : ''), (sh) => {
        sh.uniforms.uShade = { value: new THREE.Vector3(shadeC.r, shadeC.g, shadeC.b) };
        sh.uniforms.uShadeG = { value: new THREE.Vector3(cGShade.r, cGShade.g, cGShade.b) };
        sh.uniforms.uWarm = { value: new THREE.Vector3(cWarm.r, cWarm.g, cWarm.b) };
        sh.uniforms.uCont = { value: new THREE.Vector3(ct.every, ct.frac, LOW || !LOOK.contour ? 0 : 1) };
        sh.uniforms.uContDark = { value: ct.dark };
        if (PG) {
          sh.uniforms.uT0 = { value: v3(PG.tones[0]) }; sh.uniforms.uT1 = { value: v3(PG.tones[1]) }; sh.uniforms.uT2 = { value: v3(PG.tones[2]) };
          sh.uniforms.uSeam = { value: v3(PG.seam) }; sh.uniforms.uLip = { value: v3(PG.lip) }; sh.uniforms.uKey = { value: v3(PG.key) };
          sh.uniforms.uPer = { value: PG.period };
        }
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;\nattribute float aEdge;\nvarying float vEd;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = position;\nvEd = aEdge;');
        const layer = PG ? `
 // drifts: hard-edged paper layers, wobbly seams, shadow strip on the lower layer, bright lit lip on each cut edge
 float bank = step( 0.15, tA );
 float per = uPer * mix( 1.0, 1.7, bank );
 float s = vW.y / per + 0.22 * sin( vW.x * 0.33 + vW.z * 0.02 ) + 0.09 * sin( vW.x * 0.87 + 1.3 ) + 0.05 * sin( vW.x * 2.1 + vW.z * 0.11 );
 float idx = floor( s ); float fr = s - idx;
 float aw = fwidth( s ) * 1.6 + 0.0005;
 float m3 = mod( idx, 3.0 );
 vec3 tone = m3 < 0.5 ? uT0 : ( m3 < 1.5 ? uT1 : uT2 );
 float shw = 0.14;
 float inShadow = smoothstep( 1.0 - shw - aw, 1.0 - shw, fr );
 float inLip = 1.0 - smoothstep( 0.07 + aw, 0.07 + 2.0 * aw, fr );
 float s3 = s * 3.0; float f3 = s3 - floor( s3 ); float a3 = fwidth( s3 ) * 1.6 + 0.0005;
 float sub = 1.0 - smoothstep( 0.08 + a3, 0.08 + 2.0 * a3, f3 );
 float dFade = 1.0 - smoothstep( 14.0, 34.0, vFogDepth );
 tone = mix( tone, mix( tone, uSeam, 0.22 ), sub * ( 1.0 - bank ) * dFade );
 // coarse near-field drifts: big layers whose seams cross the bottom of the screen
 float sc = vW.y / ( uPer * 3.4 ) + 0.18 * sin( vW.x * 0.12 + 2.0 );
 float ci = floor( sc ); float cf = sc - ci; float cw = fwidth( sc ) * 1.6 + 0.0005;
 tone *= mix( 1.0, 0.955, mod( ci, 2.0 ) ) ;
 float cSh = smoothstep( 0.86 - cw, 0.86, cf ) * ( 1.0 - bank );
 float cLip = ( 1.0 - smoothstep( 0.05 + cw, 0.05 + 2.0 * cw, cf ) ) * ( 1.0 - bank );
 tone = mix( tone, uSeam, step( 0.5, cSh ) * 0.9 );
 tone = mix( tone, uLip, step( 0.5, cLip ) );
 vec3 base = mix( tone, uSeam, step( 0.5, inShadow ) );
 base = mix( base, uLip, step( 0.5, inLip ) );
 float fade = 1.0 - smoothstep( 0.0, 0.7, bank );
 float isG = step( tA, 0.1005 );
 vec3 mulC = mix( uWarm, uShade, ( 1.0 - isG ) * step( 0.5, tA ) );
 mulC = mix( mulC, uShadeG, isG * step( 0.05, tA ) );
 diffuseColor.rgb *= vColor.rgb * mulC;
 diffuseColor.rgb *= mix( base, mix( vec3( 1.0 ), base, 0.4 ), bank );
 // course edge: carved shade groove inside, bright snow lip + keyline at the cut
 float ed = vEd;
 float inGroove = step( -1.3, ed ) * step( ed, -0.18 );
 diffuseColor.rgb = mix( diffuseColor.rgb, uSeam * 0.93, inGroove * ( 1.0 - bank ) );
 float keyL = step( -0.12, ed ) * step( ed, 0.08 );
 diffuseColor.rgb = mix( diffuseColor.rgb, mix( uKey, uSeam, 0.4 ), keyL );
 float lipB = step( 0.05, ed ) * step( ed, 0.75 );
 diffuseColor.rgb = mix( diffuseColor.rgb, mix( uLip, uSeam, 0.45 ), lipB );
` : `
 float tA = vColor.a;
 float isG = step( tA, 0.1005 );
 vec3 mulC = mix( uWarm, uShade, ( 1.0 - isG ) * step( 0.5, tA ) );
 mulC = mix( mulC, uShadeG, isG * step( 0.05, tA ) );
 diffuseColor.rgb *= vColor.rgb * mulC;
 float hh = vW.y / uCont.x;
 float ln = 1.0 - smoothstep( uCont.y, uCont.y + fwidth( hh ) * 1.3 + 0.001, fract( hh ) );
 diffuseColor.rgb *= 1.0 - uContDark * ln * isG * uCont.z;`;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;\nvarying float vEd;\nuniform vec3 uShade;\nuniform vec3 uShadeG;\nuniform vec3 uWarm;\nuniform vec3 uCont;\nuniform float uContDark;' + (PG ? '\nuniform vec3 uT0,uT1,uT2,uSeam,uLip,uKey;\nuniform float uPer;' : ''))
          .replace('#include <color_fragment>', '\n float tA = vColor.a;' + layer.replace(/^\n float tA = vColor.a;/, ''));
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
      g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(vertCount), 1));
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
      const pa = pos.array, ca = col.array, ea = mesh.geometry.attributes.aEdge.array;
      let ke = 0;
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
          ea[ke++] = dist;
          let f = 1;
          let tA = 1;
          if (paper) {
            // C: course keeps its ground ramp (alpha 0 = contour lines allowed); banks are lit or shade by a hard threshold in the shader
            tA = 0;
            if (dist > 0) {
              _tc.copy(cBankLit);
              const nx = vis(x - 2 * CELL, z) - vis(x + 2 * CELL, z), nz = vis(x, z - 2 * CELL) - vis(x, z + 2 * CELL), ny = 4 * CELL;
              const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
              const lit = (nx * SUNV.x + ny * SUNV.y + nz * SUNV.z) * il;
              tA = 0.2 + 0.6 * clamp(0.5 + ((LOOK.litThreshold != null ? LOOK.litThreshold : 0.9) - lit) * 6, 0, 1);
            } else {
              _tc.copy(cLow).lerp(cHigh, t);
              const GS = LOOK.groundShade;
              if (GS) { // drift lee sides: hard cool shade seams on the course surface (alpha 0..0.1 band, threshold in the shader)
                const nx = vis(x - CELL, z) - vis(x + CELL, z), nz = vis(x, z - CELL) - vis(x, z + CELL), ny = 2 * CELL;
                const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
                const lit = (nx * SUNV.x + ny * SUNV.y + nz * SUNV.z) * il;
                tA = 0.1 * clamp(0.5 + (GS.thr - lit) * GS.k, 0, 1);
              }
            }
          } else {
            // hard course edge, groomed bands along z, slope tint on banks only (course ground never darker than groundLow)
            const out = clamp(dist / (LOOK.edgeBlend || 0.001), 0, 1);
            _tc.copy(cLow).lerp(cHigh, t).lerp(cBank, out);
            if (dist > 0) {
              const nx = vis(x - CELL, z) - vis(x + CELL, z), nz = vis(x, z - CELL) - vis(x, z + CELL), ny = 2 * CELL;
              const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
              const lit = (nx * SUNV.x + ny * SUNV.y + nz * SUNV.z) * il;
              const sh = clamp((0.8 - lit) * 2.5, 0, 1);
              if (sh > 0) _tc.lerp(cShade, sh);
            }
            f = (j & 1) && dist <= 0 ? (LOOK.bandMul || 1) : 1;
          }
          if (SOFT) _tc.setScalar(dist > 0 ? 1 : t); // soft look: red channel = bump height (0 hollow .. 1 crest)
          ca[kc] = _tc.r * f; ca[kc + 1] = _tc.g * f; ca[kc + 2] = _tc.b * f;
          if (SOFT) tA = clamp((y - course.height(mid, z) - 1.0) / 5, 0, 1); // hillness: height above the course centre line
          if (CS === 4) ca[kc + 3] = tA;
          k += 3; kc += CS;
        }
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      mesh.geometry.attributes.aEdge.needsUpdate = true;
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
    const RK = toon ? (LOOK.rockK || OK) : OK;
    const tr = treeGeometry(theme.treeShape);
    const tGeoLeaf = track(tr.leaf), tGeoTrunk = tr.trunk ? track(tr.trunk) : null;
    const rGeo = track(rockGeometry(theme.rockShape));
    const rampT = toon ? track(makeRamp([100, 170, 255, 255])) : null;
    const rampR = toon ? track(makeRamp([178, 178, 255, 255])) : null; // rock: shade ~x0.70 of lit
    const rockHex = LOOK.rockColor != null ? LOOK.rockColor : theme.rock;
    const leafMat = track(toon ? new THREE.MeshToonMaterial({ color: theme.treeLeaf, gradientMap: rampT, vertexColors: !!tr.leaf.attributes.color }) : new THREE.MeshLambertMaterial({ color: theme.treeLeaf, flatShading: flat }));
    stepFog(leafMat, FOG_STEPS);
    if (toon) addRim(leafMat);
    if (SOFT) limitFog(leafMat, 0.6, FOG_STEPS); // silhouettes stay darker than the haze but still pale a little with distance
    const rockMat = track(toon ? new THREE.MeshToonMaterial({ color: rockHex, gradientMap: rampR, vertexColors: !!rGeo.attributes.color }) : new THREE.MeshLambertMaterial({ color: rockHex, flatShading: flat }));
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
    if (SOFT) { addRim(rockMat); } // warm sun-side rim light on hazards (the only edge treatment; no keylines)
    // dune atlas: billboards replace the code-built harps / arches / reeds / rocks / gates / edge flags (falls back to the geometry if the atlas did not load)
    // Loaded lazily (dune view only): until the atlas arrives (or if it fails) the code geometry is drawn; on arrival boards are built and the props refilled.
    let boards = null, duneFx = null, worldDead = false;
    function attachBoards(img) {
      if (boards || worldDead || !img) return;
      boards = makeBoards(img, TREE_CAP + ROCK_CAP + POLE_CAP + GATE_CAP + 8, !!((renderer.getContext().getContextAttributes() || {}).antialias));
      track(boards.tex); track(boards.mat); track(boards.geo); scene.add(boards.mesh); boards.mesh.renderOrder = 2;
      duneFx = !LOW ? createDuneFx(THREE, { texture: boards.tex, cells: FX_CELLS, rand: mulberry32(7719) }) : null;
      if (duneFx) scene.add(duneFx.group);
      lastFillZ = -1e9; // force a prop refill (counts of the code meshes drop to 0 there)
    }
    const DT = () => (cfg.look && cfg.look.dune) || {};
    const dv = (k, d) => { const v = DT()[k]; return typeof v === 'number' && isFinite(v) ? v : d; };
    try { window.__duneAtlas = 'pending'; } catch (e) { /* ignore */ }
    if (SOFT) loadAtlas().then((img) => { try { window.__duneAtlas = img ? 'ok' : 'fail'; } catch (e) { /* ignore */ } attachBoards(img); }, () => { try { window.__duneAtlas = 'fail'; } catch (e) { /* ignore */ } });
    else { try { delete window.__duneAtlas; } catch (e) { /* ignore */ } }
    // scenery set: leaves = wind harp, plus half-buried ring arches and reed clusters sharing the material
    const scArch = tr.extra ? makeInst(track(tr.extra.arch), leafMat, TREE_CAP) : null;
    const scReed = tr.extra ? makeInst(track(tr.extra.reed), leafMat, TREE_CAP) : null;
    let leavesO = null, rocksO = null;
    if (toon && !SOFT) {
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
    const GFK = SOFT ? 0 : 0.15; // soft look: gates never take distance fog (must-match 5)
    limitFog(gateMat, GFK, FOG_STEPS); // gates must read as authored through fog
    const chevMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    limitFog(chevMat, GFK, FOG_STEPS);
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
      limitFog(oMat, GFK, FOG_STEPS);
      const pGeo = track(new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, -1); sh.closePath(); return sh; })()));
      const pMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      limitFog(pMat, GFK, FOG_STEPS);
      const poMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      limitFog(poMat, GFK, FOG_STEPS);
      const cGeo = track(new THREE.CylinderGeometry(0.265, 0.265, 0.3, 8));
      const cMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      limitFog(cMat, GFK, FOG_STEPS);
      if (!SOFT) { // no keylines or candy bands in the soft look
        postsO = track(new THREE.InstancedMesh(postGeo, oMat, GATE_CAP * 2));
        beamO = track(new THREE.InstancedMesh(beamGeo, oMat, GATE_CAP));
        pennantsO = track(new THREE.InstancedMesh(pGeo, poMat, GATE_CAP * 5));
        candy = track(new THREE.InstancedMesh(cGeo, cMat, GATE_CAP * 4));
      }
      pennants = track(new THREE.InstancedMesh(pGeo, pMat, GATE_CAP * 5));
      for (const im of [postsO, beamO, pennants, pennantsO, candy]) {
        if (!im) continue;
        im.frustumCulled = false; im.count = 0; im.setColorAt(0, new THREE.Color(0xffffff)); scene.add(im);
      }
      if (pennantsO) pennantsO.renderOrder = -1;
    }
    let rimS = null;
    if (RIM && paper) {
      const rMat = track(new THREE.MeshBasicMaterial({ color: RIM.col }));
      limitFog(rMat, GFK, FOG_STEPS);
      rimS = track(new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), rMat, GATE_CAP * 3));
      rimS.frustumCulled = false; rimS.count = 0; scene.add(rimS);
    }
    // soft look: additive lantern halo behind each gate (cheap fake bloom: one instanced quad, radial-gradient texture)
    let halos = null;
    if (SOFT) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const g2 = cv.getContext('2d'); const gr = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
      const htx = track(new THREE.CanvasTexture(cv)); htx.colorSpace = THREE.SRGBColorSpace;
      const hMat = track(new THREE.MeshBasicMaterial({ map: htx, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      halos = track(new THREE.InstancedMesh(track(new THREE.PlaneGeometry(1, 1)), hMat, GATE_CAP));
      halos.frustumCulled = false; halos.count = 0; halos.setColorAt(0, new THREE.Color(0xffffff)); halos.renderOrder = 4; scene.add(halos);
    }
    const COL_KEY = new THREE.Color(LOOK.outline || '#33456b');
    const gX = new Float32Array(GATE_CAP), gZ = new Float32Array(GATE_CAP), gW = new Float32Array(GATE_CAP), gId = new Int32Array(GATE_CAP);
    let gN = 0;

    // next-gate ground stripe
    const stripeGeo = track(new THREE.PlaneGeometry(1, 1));
    stripeGeo.rotateX(-Math.PI / 2);
    const stripeMat = track(new THREE.MeshBasicMaterial({ color: theme.gateNext, transparent: true, opacity: SOFT ? 0.55 : paper ? 0.9 : 0.55, depthWrite: false, fog: !SOFT, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
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
    const _c3 = new THREE.Color();
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


    // ---- C: flat projected paper shadows (no shadow maps). Two dynamic meshes of flat quads sampled on the terrain:
    // shS = trees + rocks (rebuilt on refill), shD = gates + sled (rebuilt every frame). Direction is derived from SUNV. ----
    let shS = null, shD = null;
    const SVh = Math.hypot(SUNV.x, SUNV.z) || 1;
    const SVx = SH ? (SOFT ? -SUNV.x / SVh : -SUNV.x / SUNV.y) * (SH.len || 1) : 0, SVz = SH ? (SOFT ? -SUNV.z / SVh : -SUNV.z / SUNV.y) * (SH.len || 1) : 0; // metres of shadow per metre of height
    const SVl = Math.hypot(SVx, SVz) || 1, SPx = -SVz / SVl, SPz = SVx / SVl;                                 // unit perpendicular
    if (SH) {
      const shMat = track(new THREE.MeshBasicMaterial({ color: SH.col, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, transparent: !!SH.soft, opacity: SH.soft ? (SH.alpha || 0.45) : 1 }));
      if (SH.soft) patchShader(shMat, 'softShadow', (sh) => { // feathered wedge: per-vertex alpha ramps from full at the object to 0 at the tip
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aA;\nvarying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vA;');
      });
      stepFog(shMat, FOG_STEPS);
      const mk = (cap) => {
        const g = track(new THREE.BufferGeometry());
        const pos = new Float32Array(cap * 12);
        const ix = new Uint32Array(cap * 6);
        for (let q = 0; q < cap; q++) { const b = q * 4; ix.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6); }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setIndex(new THREE.BufferAttribute(ix, 1));
        const alp = new Float32Array(cap * 4).fill(1);
        if (SH.soft) g.setAttribute('aA', new THREE.BufferAttribute(alp, 1).setUsage(THREE.DynamicDrawUsage));
        g.setDrawRange(0, 0);
        const mesh = new THREE.Mesh(g, shMat);
        mesh.frustumCulled = false;
        if (SH.soft) mesh.renderOrder = 1;
        scene.add(mesh);
        return { g, mesh, pos, alp, cap, n: 0 };
      };
      shS = mk(TREE_CAP * 4 + ROCK_CAP * 2 + 96);
      shD = mk(GATE_CAP * 8 + 16);
    }
    function shQuad(b, ax, az, bx, bz, cx, cz, dx, dz, a0 = 1, a1 = 1) {
      if (b.n >= b.cap) return;
      const p = b.pos; let k = b.n * 12;
      { const q = b.n * 4; b.alp[q] = a0; b.alp[q + 1] = a0; b.alp[q + 2] = a1; b.alp[q + 3] = a1; }
      p[k++] = ax; p[k++] = vis(ax, az) + 0.1; p[k++] = az;
      p[k++] = bx; p[k++] = vis(bx, bz) + 0.1; p[k++] = bz;
      p[k++] = cx; p[k++] = vis(cx, cz) + 0.1; p[k++] = cz;
      p[k++] = dx; p[k++] = vis(dx, dz) + 0.1; p[k++] = dz;
      b.n++;
    }
    // a tier: from u0 to u1 along the shadow (fraction of length), half widths w0 -> w1 (fraction of hw), start at (x, z)
    function shTier(b, x, z, len, hw, u0, w0, u1, w1) {
      const ax = x + SVx * len * u0, az = z + SVz * len * u0, bx = x + SVx * len * u1, bz = z + SVz * len * u1;
      shQuad(b, ax - SPx * hw * w0, az - SPz * hw * w0, ax + SPx * hw * w0, az + SPz * hw * w0, bx + SPx * hw * w1, bz + SPz * hw * w1, bx - SPx * hw * w1, bz - SPz * hw * w1, SOFT ? 1 - u0 : 1, SOFT ? 1 - u1 : 1);
    }
    function shFlush(b) { b.g.setDrawRange(0, b.n * 6); b.g.attributes.position.needsUpdate = true; if (b.g.attributes.aA) b.g.attributes.aA.needsUpdate = true; }

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

    // A: paper tufts on the banks (two-tone cone clusters) and flat paper chips scattered on the course: speed + depth cues
    const GR = LOOK.ground || null;
    let tufts = null, chips = null;
    const TUFT_CAP = 160, CHIP_CAP = 220;
    if (paper && GR && GR.tufts) {
      const tg = track((() => {
        const parts = [[0, 0, 0, 0.34, 0.8], [0.3, 0, 0.12, 0.26, 0.55], [-0.28, 0, -0.1, 0.24, 0.5]].map(([x, y, z, r, h]) => {
          const c = new THREE.ConeGeometry(r, h, 4, 1); c.translate(x, y + h / 2, z); return c; });
        const pos = [], idx = []; let off = 0;
        for (const p of parts) { const a = p.attributes.position; for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i)); const ix = p.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += a.count; p.dispose(); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
      })());
      const tm = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      stepFog(tm, FOG_STEPS);
      tufts = track(new THREE.InstancedMesh(tg, tm, TUFT_CAP));
      const cg = track(new THREE.CircleGeometry(0.5, 4)); cg.rotateX(-Math.PI / 2); cg.rotateY(Math.PI / 4);
      const cm = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      stepFog(cm, FOG_STEPS);
      chips = track(new THREE.InstancedMesh(cg, cm, CHIP_CAP));
      for (const im of [tufts, chips]) { im.frustumCulled = false; im.count = 0; im.setColorAt(0, new THREE.Color(0xffffff)); scene.add(im); }
    }
    const cTuftA = new THREE.Color((LOOK.tuftCol && LOOK.tuftCol[0]) || '#cfe0f3'), cTuftB = new THREE.Color((LOOK.tuftCol && LOOK.tuftCol[1]) || '#86abda'), cChipA = new THREE.Color((LOOK.chipCol && LOOK.chipCol[0]) || '#b6cfea'), cChipB = new THREE.Color((LOOK.chipCol && LOOK.chipCol[1]) || '#ffffff');
    const hsh = (k, s2) => { let h = (Math.imul(k + 1013, 0x9e3779b1) ^ Math.imul(s2 + 77, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; return ((h ^ (h >>> 12)) >>> 0) / 4294967296; };
    function fillDecor(z) {
      if (!tufts) return;
      let tn = 0, cn = 0;
      const za = Math.floor((z - 12) / 3), zb = Math.floor((z + 150) / 3);
      for (let k = za; k <= zb && tn < TUFT_CAP; k++) {
        const zz = k * 3 + hsh(k, 1) * 3;
        const mid = course.centerX(zz), hw = course.halfWidth(zz);
        for (let sd = 0; sd < 2; sd++) {
          if (hsh(k, 2 + sd) > 0.45 || tn >= TUFT_CAP) continue;
          const side = sd ? 1 : -1, ox = hw + 1.3 + hsh(k, 5 + sd) * 2.2;
          const px = mid + side * ox;
          const sc = (0.45 + hsh(k, 8 + sd) * 0.4);
          _p.set(px, vis(px, zz) - 0.05, zz); _q.setFromAxisAngle(Y_AXIS, hsh(k, 11 + sd) * 6.28); _s.set(sc, sc * (0.9 + hsh(k, 13) * 0.4), sc);
          _m.compose(_p, _q, _s); tufts.setMatrixAt(tn, _m); tufts.setColorAt(tn, hsh(k, 17 + sd) < 0.5 ? cTuftA : cTuftB); tn++;
        }
      }
      const ca2 = Math.floor((z - 15) / 1.6), cb = Math.floor((z + 75) / 1.6);
      for (let k = ca2; k <= cb && cn < CHIP_CAP; k++) {
        const zz0 = k * 1.6;
        for (let q = 0; q < 2 && cn < CHIP_CAP; q++) {
          if (hsh(k, 30 + q) > (zz0 < z + 2 ? 0.45 : 0.8)) continue;
          const zz = k * 1.6 + hsh(k, 32 + q) * 1.6;
          const mid = course.centerX(zz), hw = course.halfWidth(zz);
          let px = mid + (hsh(k, 34 + q) * 2 - 1) * (hw - 1.6);
          const lx = course.safeX ? course.safeX(zz) : mid; if (Math.abs(px - lx) < 2.6) px = lx + (px < lx ? -1 : 1) * (2.6 + hsh(k, 50) * 3);
          if (zz < z + 10) continue; // none in the bottom third of the screen
          const len = 0.4 + hsh(k, 36 + q) * 0.4;
          _p.set(px, vis(px, zz) + 0.04, zz);
          groundQuat(px, zz, _q); _qa.setFromAxisAngle(Y_AXIS, 0); _q.multiply(_qa);
          _s.set(len * 0.5, 1, len * 1.3); _m.compose(_p, _q, _s);
          chips.setMatrixAt(cn, _m); chips.setColorAt(cn, cChipA); cn++;
        }
      }
      tufts.count = tn; chips.count = cn;
      tufts.instanceMatrix.needsUpdate = chips.instanceMatrix.needsUpdate = true;
      tufts.instanceColor.needsUpdate = chips.instanceColor.needsUpdate = true;
    }

    let lastFillZ = -1e9;
    let lastNext = -2;

    function refillProps(z, nextGate) {
      const z0 = z - 25, z1 = z + cfg.viewDist + 20;
      blobN = 1;
      if (shS) shS.n = 0;
      if (boards) boards.n = 0;
      const tl = course.treesInRange(z0, z1);
      let n = Math.min(tl.length, TREE_CAP);
      let nH = 0, nA = 0, nR = 0;
      for (let i = 0; i < n; i++) {
        const t = tl[i];
        if (SOFT && hsh(Math.floor(t.z * 100), 64) > 0.5) continue; // fewer, larger, spaced silhouettes
        const kind = scArch ? (() => { const h = hsh(Math.floor(t.z * 100), 61); return h < 0.4 ? 0 : h < 0.5 ? 1 : 2; })() : 0; // 0 harp, 1 arch, 2 reed
        let H = 4.2 * (t.s || 1) * (0.9 + 0.2 * ((i * 7) % 5) / 4);
        let W = 4.2 * (t.s || 1);
        if (kind === 2) { H *= 0.55; W *= 0.7; } else if (SOFT) { H *= 1.3; W *= 1.3; }
        _p.set(t.x, vis(t.x, t.z) - 0.15, t.z);
        _s.set(W, H, W);
        _q.setFromAxisAngle(Y_AXIS, kind === 1 ? (hsh(Math.floor(t.z * 100), 62) - 0.5) * 0.9 : kind === 0 ? (hsh(Math.floor(t.z * 100), 63) < 0.5 ? 0 : Math.PI) : i * 1.7);
        _m.compose(_p, _q, _s);
        if (boards) { // atlas billboards at the same spot and world size: harp ~H tall, arch ~W wide, reed ~H tall
          const hk = hsh(Math.floor(t.z * 100), 65), by = _p.y;
          let cell, bw, bh;
          if (kind === 1) { cell = hk < 0.28 ? 'archBroken' : 'arch'; bw = W; bh = bw * CELLS[cell][3] / CELLS[cell][2]; }
          else if (kind === 2) { cell = hk < 0.34 ? 'reed1' : hk < 0.67 ? 'reed2' : 'reed3'; bh = H; bw = bh * CELLS[cell][2] / CELLS[cell][3]; }
          else { cell = hk < 0.34 ? 'harpC' : hk < 0.67 ? 'harpD' : 'harpE'; bh = H; bw = bh * CELLS[cell][2] / CELLS[cell][3]; }
          boards.add(cell, t.x, by - 0.05 * bh * (kind === 1 ? 1 : 0.3), t.z, bw, bh, hsh(Math.floor(t.z * 100), 66) < 0.5, 0.3, null);
        } else if (kind === 1) scArch.setMatrixAt(nA++, _m); else if (kind === 2) scReed.setMatrixAt(nR++, _m); else leaves.setMatrixAt(nH++, _m);
        if (trunks) trunks.setMatrixAt(i, _m);
        if (leavesO) {
          _p.y -= 0.02 * H;
          _s.multiplyScalar(OK);
          _m.compose(_p, _q, _s);
          leavesO.setMatrixAt(i, _m);
        }
        const tsl = Math.hypot(vis(t.x + 1, t.z) - vis(t.x - 1, t.z), vis(t.x, t.z + 1) - vis(t.x, t.z - 1)) * 0.5;
        if (SH && SOFT) { // long feathered wedge toward the camera: thin for masts and reeds, wide for arches
          if (kind === 1) shTier(shS, t.x, t.z, H * 0.7, 0.42 * W, 0, 1.0, 1.0, 0.25);
          else if (kind === 2) shTier(shS, t.x, t.z, H * 0.9, 0.2 * W, 0, 1.0, 1.0, 0.0);
          else { shTier(shS, t.x, t.z, H * 1.0, 0.045 * W, 0, 1.0, 1.0, 0.7); shTier(shS, t.x, t.z, H * 0.9, 0.2 * W, 0.0, 0.5, 0.8, 0.0); }
        } else if (SH && tsl < 0.75) { // stepped pine silhouette: trunk, then three tiers narrowing to the tip
          shTier(shS, t.x, t.z, H * 0.5, 0.24 * W, 0, 1.0, 1.0, 0.0); // short stub at the foot
        } else if (BL && !SH) addBlob(t.x, t.z, BL.tree * 2 * (t.s || 1), BL.tree * 2 * (t.s || 1));
      }
      leaves.count = scArch ? nH : boards ? 0 : n;
      leaves.instanceMatrix.needsUpdate = true;
      if (scArch) { scArch.count = nA; scReed.count = nR; scArch.instanceMatrix.needsUpdate = scReed.instanceMatrix.needsUpdate = true; }
      if (trunks) { trunks.count = n; trunks.instanceMatrix.needsUpdate = true; }
      if (leavesO) { leavesO.count = n; leavesO.instanceMatrix.needsUpdate = true; }

      // rocks: footprint radius = r (collision data), base sits on the visual surface
      const rl = course.rocksInRange(z0, z1);
      n = Math.min(rl.length, ROCK_CAP);
      for (let i = 0; i < n; i++) {
        const r = rl[i];
        if (boards) { // rock cell picked from the stable rock id; footprint width = 2r (shard 1.7r), no tint, rock fog limit
          const hr = hsh(r.id, 71);
          const cell = r.r < 1.15 ? (hr < 0.5 ? 'rockPebbles' : 'rockShard') : ['rockLump', 'rockTwo', 'rockSlab', 'rockWhale'][Math.min(3, Math.floor(hr * 4))];
          const bw = (cell === 'rockShard' ? 1.7 : 2.0) * r.r, bh = bw * CELLS[cell][3] / CELLS[cell][2];
          boards.add(cell, r.x, vis(r.x, r.z) - 0.04 * bh, r.z, bw, bh, hsh(r.id, 72) < 0.5, 0.2, null);
        }
        _p.set(r.x, vis(r.x, r.z) - 0.05 * r.r, r.z);
        _s.set(r.r, r.r * 0.9, r.r);
        _q.setFromAxisAngle(Y_AXIS, r.id * 2.3);
        _m.compose(_p, _q, _s);
        if (!boards) rocks.setMatrixAt(i, _m);
        if (rocksO) {
          _p.y -= 0.02 * r.r;
          _s.set(r.r * RK, r.r * 0.9 * RK, r.r * RK);
          _m.compose(_p, _q, _s);
          rocksO.setMatrixAt(i, _m);
        }
        if (SH) { const rl2 = r.r * 0.9 * 3.0; shTier(shS, r.x, r.z, rl2, r.r, -0.0, 1.0, 0.5, 0.82); shTier(shS, r.x, r.z, rl2, r.r, 0.5, 0.82, 1.0, 0.12); }
        else if (BL) addBlob(r.x, r.z, r.r * 2 * BL.rock, r.r * 2 * BL.rock);
      }
      rocks.count = boards ? 0 : n;
      rocks.instanceMatrix.needsUpdate = true;
      if (rocksO) { rocksO.count = n; rocksO.instanceMatrix.needsUpdate = true; }

      const gl = course.gatesInRange(z - 10, z1);
      gN = Math.min(gl.length, GATE_CAP);
      for (let i = 0; i < gN; i++) {
        gX[i] = gl[i].x; gZ[i] = gl[i].z; gW[i] = gl[i].width; gId[i] = gl[i].id;
        if (BL && !SH) for (let sd = 0; sd < 2; sd++) { const px = gX[i] + (sd ? 0.5 : -0.5) * gW[i]; addBlob(px, gZ[i], BL.foot * 2, BL.foot * 2); }
      }
      if (blobs) { blobs.count = blobN; blobs.instanceMatrix.needsUpdate = true; }
      if (shS) { shFlush(shS); }

      // edge poles (S7)
      if (poles) {
        let pn = 0;
        const ev = PL.every;
        for (let pz = Math.ceil(z0 / ev) * ev; pz <= z1 && pn + 2 <= POLE_CAP; pz += ev) {
          const mid = course.centerX(pz), hw = course.halfWidth(pz);
          for (let sd = 0; sd < 2; sd++) {
            const px = mid + (sd ? hw : -hw);
            _p.set(px, vis(px, pz), pz);
            if (boards) { // edge flag billboard, tinted with the same alternating colours
              const fc = _pc ? _pc[Math.round(pz / ev) & 1] : COL_WHITE, fk = hsh(Math.round(pz / ev), 80 + sd) < 0.5 ? 'flagA' : 'flagB', fh = PL.h * 1.3;
              boards.add(fk, px, _p.y - 0.03, pz, fh * CELLS[fk][2] / CELLS[fk][3], fh, sd === 1, 0.3, fc.clone().multiplyScalar(2.2 * dv('flagBright', 1))); pn++; continue;
            }
            _m.compose(_p, _q.identity(), _s.set(1, 1, 1));
            poles.setMatrixAt(pn, _m); bands.setMatrixAt(pn, _m);
            if (_pc) bands.setColorAt(pn, _pc[Math.round(pz / ev) & 1]);
            pn++;
          }
        }
        poles.count = bands.count = boards ? 0 : pn;
        poles.instanceMatrix.needsUpdate = bands.instanceMatrix.needsUpdate = true;
        if (bands.instanceColor) bands.instanceColor.needsUpdate = true;
      }
      if (shS && PL) { // edge poles throw thin shadow strips across the snow (a repeating long-shadow rhythm)
        const ev = PL.every;
        for (let pz = Math.ceil(z0 / ev) * ev; pz <= z1; pz += ev) {
          const mid = course.centerX(pz), hw = course.halfWidth(pz);
          for (let sd = 0; sd < 2; sd++) { const px = mid + (sd ? hw : -hw); shTier(shS, px, pz, PL.h, 0.12, -0.04, 1, 1, 1); shTier(shS, px, pz, PL.h, 0.35, 0.7, 1, 1, 0); }
        }
        shFlush(shS);
      }
      if (boards) boards.nProps = boards.n;
      fillDecor(z);
      lastFillZ = z;
      lastNext = nextGate;
    }

    // per frame (cheap, <= GATE_CAP gates): gates shrink away inside 8 to 14 m of the camera and vanish once the sled has passed
    const FLASH_PASS = 0.15, FLASH_MISS = 0.4;
    let rn = 0;
    function updateGates(camZ, sledZ, nextGate, t) {
      let n = 0, cn = 0, hn = 0;
      const pulse = reduced || !GT.pulse ? 0 : 0.5 + 0.5 * Math.sin(t * 3.2);
      stripe.visible = false;
      rn = 0;
      if (boards) boards.n = boards.nProps;
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
        let k = (isNext ? (paper ? 2.0 : 1.6) + 0.12 * pulse : (SOFT ? 1.7 : 1)) * fade;
        const bannerCol = _c2.copy(_c);
        if (fp !== undefined && t - fp < FLASH_PASS) { const u = 1 - (t - fp) / FLASH_PASS; _c.lerp(COL_WHITE, u); bannerCol.copy(_c); if (!reduced) k *= 1 + 0.15 * u; }
        else if (fm !== undefined && t - fm < FLASH_MISS) bannerCol.copy(COL_MISS);
        const gw = gW[i] * fade; // the whole gate squeezes in as it fades, not just its height
        _q.identity();
        if (boards) { // ONE gateFrame billboard: inner opening between the art's posts = gate width; vertical stretch clamped to +-20%
          const bwq = gw * GATE.w / GATE.openW, nat = bwq * GATE.h / GATE.w, hh0 = Math.min(Math.max(3.2 * k, nat * 0.8), nat * 1.2);
          const vL = vis(gX[i] - 0.5 * gw, gz), vR = vis(gX[i] + 0.5 * gw, gz);
          _c3.copy(bannerCol).multiplyScalar((isNext ? 2.6 * dv('nextGlow', 1) : 2.1) * dv('gateBright', 1)); // the art is neutral grey: strong gain so far gates read periwinkle (not grey); the next gate stays the brightest
          boards.add('gateFrame', gX[i], Math.min(vL, vR) - 0.05, gz, bwq, hh0, (id & 1) === 1, 0, _c3);
        }
        for (let side = 0; side < 2 && !boards; side++) {
          const px = gX[i] + (side ? 0.5 : -0.5) * gw;
          _p.set(px, vis(px, gz), gz);
          _s.set(k, k, k);
          _m.compose(_p, _q, _s);
          posts.setMatrixAt(n * 2 + side, _m); posts.setColorAt(n * 2 + side, _c);
          feet.setMatrixAt(n * 2 + side, _m); feet.setColorAt(n * 2 + side, _c);
        }
        const gy = vis(gX[i], gz);
        const bh = 0.75 * k;
        const byc = gy + 3.2 * k - 0.18 * k - bh * 0.5;
        if (!boards) {
          _p.set(gX[i], gy + 3.2 * k - 0.09 * k, gz);
          _s.set(gw, k, k);
          _m.compose(_p, _q, _s);
          beam.setMatrixAt(n, _m); beam.setColorAt(n, _c);
          _p.set(gX[i], byc, gz);
          _s.set(gw - 0.4, bh, k);
          _m.compose(_p, _q, _s);
          banner.setMatrixAt(n, _m); banner.setColorAt(n, bannerCol);
        }
        if (halos) {
          _p.set(gX[i], gy + 1.9 * k, gz + 0.3); _s.set(gw * 1.9, 5.2 * k, 1); _m.compose(_p, _q, _s);
          halos.setMatrixAt(hn, _m); halos.setColorAt(hn, _c3.copy(_c).multiplyScalar(isNext ? 0.9 : 0.7)); hn++;
        }
        if (paper && !boards) {
          const key = isNext ? COL_WHITE : COL_KEY;
          const sxz = isNext ? 1.45 : 1.3;
          for (let side = 0; side < 2; side++) {
            const px = gX[i] + (side ? 0.5 : -0.5) * gw;
            const py = vis(px, gz);
            const oi = n * 2 + side;
            _p.set(px, py, gz); _s.set(k * sxz, k * 1.02, k * sxz);
            if (postsO) _m.compose(_p, _q, _s), postsO.setMatrixAt(oi, _m), postsO.setColorAt(oi, key);
            if (candy) for (let b = 0; b < 2; b++) {
              _p.set(px, py + (0.9 + 1.2 * b) * k, gz); _s.set(k, k, k);
              _m.compose(_p, _q, _s); candy.setMatrixAt(n * 4 + side * 2 + b, _m); candy.setColorAt(n * 4 + side * 2 + b, COL_WHITE);
            }
          }
          if (beamO) { _p.set(gX[i], gy + 3.2 * k - 0.09 * k, gz); _s.set(gw + 0.14 * k, k * 1.8, k * 1.8);
            _m.compose(_p, _q, _s); beamO.setMatrixAt(n, _m); beamO.setColorAt(n, key); }
          if (SOFT) _c3.copy(bannerCol).lerp(COL_WHITE, 0.6);
          const pw = (gw - 0.4) / 5, topY = gy + 3.2 * k - 0.18 * k;
          for (let q = 0; q < 5; q++) {
            const qx = gX[i] + (q - 2) * pw;
            _p.set(qx, topY, gz - 0.03 * k); _s.set(pw, bh, k);
            _m.compose(_p, _q, _s); pennants.setMatrixAt(n * 5 + q, _m); pennants.setColorAt(n * 5 + q, q & 1 ? (SOFT ? _c3 : COL_WHITE) : bannerCol);
            if (pennantsO) { _p.set(qx, topY + 0.04 * k, gz - 0.01 * k); _s.set(pw * 1.22, bh * 1.2, k);
              _m.compose(_p, _q, _s); pennantsO.setMatrixAt(n * 5 + q, _m); pennantsO.setColorAt(n * 5 + q, key); }
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
        if (shD && !V) { // B4 VIS QA-D2: no flat plum slabs beside gates under vis
          // gate shadow: two short post strips + thin beam bar (no pennant teeth)
          const ks = Math.min(k, 1.15), hh = 3.2 * ks * 0.55, pxL = gX[i] - 0.5 * gw, pxR = gX[i] + 0.5 * gw, wP = 0.22 * ks;
          for (const px of [pxL, pxR]) shQuad(shD, px - SPx * wP, gz - SPz * wP, px + SPx * wP, gz + SPz * wP, px + SPx * wP + SVx * hh, gz + SPz * wP + SVz * hh, px - SPx * wP + SVx * hh, gz - SPz * wP + SVz * hh);
          const bw = 0.1 * ks;
          shQuad(shD, pxL + SVx * hh - SPx * bw, gz + SVz * hh - SPz * bw, pxR + SVx * hh - SPx * bw, gz + SVz * hh - SPz * bw, pxR + SVx * hh + SPx * bw, gz + SVz * hh + SPz * bw, pxL + SVx * hh + SPx * bw, gz + SVz * hh + SPz * bw);
        }
        if (rimS && !boards) { // rim light strips on the sun side: one down each post, one along the top of the beam
          const gy2 = vis(gX[i], gz);
          for (let side = 0; side < 2; side++) {
            const px = gX[i] + (side ? 0.5 : -0.5) * gw;
            _p.set(px - 0.15 * k, vis(px, gz) + 1.5 * k, gz - 0.2 * k); _s.set(0.075 * k, 2.8 * k, 0.05 * k);
            _m.compose(_p, _q, _s); rimS.setMatrixAt(rn++, _m);
          }
          _p.set(gX[i], gy2 + 3.2 * k - 0.02 * k, gz - 0.1 * k); _s.set(gw, 0.05 * k, 0.05 * k);
          _m.compose(_p, _q, _s); rimS.setMatrixAt(rn++, _m);
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
        im.count = boards ? 0 : im === posts || im === feet ? n * 2 : n;
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      }
      chevs.count = cn; chevs.instanceMatrix.needsUpdate = true;
      if (rimS) { rimS.count = boards ? 0 : rn; rimS.instanceMatrix.needsUpdate = true; }
      if (shD) { shFlush(shD); }
      if (boards) { boards.flush(); if (pennants) pennants.count = 0; if (rimS) rimS.count = 0; }
      else if (paper) {
        banner.count = 0;
        pennants.count = n * 5;
        if (postsO) { postsO.count = n * 2; beamO.count = n; pennantsO.count = n * 5; candy.count = n * 4; }
        for (const im of [postsO, beamO, pennants, pennantsO, candy]) { if (!im) continue; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
      }
      if (halos) {
        halos.count = hn; halos.instanceMatrix.needsUpdate = true; halos.instanceColor.needsUpdate = true;
      }
    }

    // ---- sled (S5 model from lookparts); colours from LOOK.sledC or the theme ----
    const sled = new THREE.Group();
    sled.rotation.order = 'YXZ';
    const sledModel = makeSledModel({ sled: SC.sled, glow: SC.glow, suit: LOOK.suitC || LOOK.suit, wing: LOOK.wing, scarf: LOOK.scarf });
    // skid underside = model y -0.22. The sled group scales about its origin, so the offset is scale-aware: skids sit
    // SKID_CLEAR above the ride base when the sled origin is HOVER above it (before, scale 1.15 pushed them 0.08 into the sand).
    const SLED_SCALE = LOOK.sledScale || 1, SKID_CLEAR = 0.06;
    const GROUP_Y = 0.22 - (HOVER - SKID_CLEAR) / SLED_SCALE;
    sledModel.group.position.y = GROUP_Y;
    // B4 VIS begin: the hero rig replaces the old sled mesh (same pose/placement math and GROUP_Y offset)
    if (VIS) {
      V = createVis({ THREE, scene, camera, renderer, cfg, look: LOOK, sunDir: SUNV, root: (typeof document !== 'undefined' && document.getElementById('ui')) || null,
        groundY: vis, course, seed: course.seed >>> 0, hooks: o.vis });
      V.rig.group.position.y = GROUP_Y;
      sled.add(V.rig.group);
    } else
    // B4 VIS end
    sled.add(sledModel.group);
    sled.scale.setScalar(SLED_SCALE); // D: visual only
    // C: toon sled (3-step ramp) with a normal-extruded keyline shell per part, oversize helmet
    if (paper) {
      const ramp3 = track(makeRamp([90, 170, 255, 255]));
      const outSled = track(new THREE.MeshBasicMaterial({ color: LOOK.outline || '#33456b', side: THREE.BackSide }));
      const sw = LOOK.sledOutline != null ? LOOK.sledOutline : 0.05;
      patchShader(outSled, 'sledOutline' + sw, (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize( normal ) * ' + sw.toFixed(3) + ';'); });
      const parts = [];
      sledModel.group.traverse((x) => { if (x.isMesh && sledModel.glowMats.indexOf(x.material) < 0) parts.push(x); });
      const byParent = new Map();
      for (const m of parts) {
        const old = m.material;
        m.material = track(new THREE.MeshToonMaterial({ color: old.color.clone(), gradientMap: ramp3 }));
        if (SOFT) m.material.emissive.copy(old.color).multiplyScalar(0.62); // backlit: the camera sees the unlit side, so the pale hull gets a fill
        if (m.geometry.type === 'IcosahedronGeometry') addRim(m.material); // helmet: crescent rim; box parts get geometric strips below
        old.dispose();
        if (m.geometry.type === 'IcosahedronGeometry') m.scale.setScalar(LOOK.helm || 1);
        m.updateMatrix();
        if (!byParent.has(m.parent)) byParent.set(m.parent, []);
        byParent.get(m.parent).push(m);
      }
      // D: one merged back-face hull per parent, transforms baked so the extrusion width is uniform (no per-part scale)
      for (const [parent, list] of (sw > 0 ? byParent : [])) {
        const gs = list.map((m) => { const g = m.geometry.clone(); if (!g.attributes.normal) g.computeVertexNormals(); g.applyMatrix4(m.matrix); return g; });
        let n = 0; for (const g of gs) n += g.attributes.position.count;
        const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
        for (const g of gs) { P.set(g.attributes.position.array, o); N.set(g.attributes.normal.array, o); o += g.attributes.position.array.length; }
        const mg = new THREE.BufferGeometry();
        mg.setAttribute('position', new THREE.BufferAttribute(P, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
        const om = new THREE.Mesh(track(weldNormals(mg)), outSled);
        parent.add(om);
      }
    }
    if (RIM && paper) { // C: rim light strips on the sun-side (+x) edges of hull, skid, wing and handlebar: one InstancedMesh, flat warm white
      const rimMat = track(new THREE.MeshBasicMaterial({ color: RIM.col }));
      const rs = track(new THREE.InstancedMesh(track(new THREE.BoxGeometry(1, 1, 1)), rimMat, 5));
      const strips = [[0.4, 0.105, -0.25, 0.05, 0.035, 1.0], [0.585, -0.075, -0.15, 0.035, 0.035, 1.7], [-0.0, 0.365, -0.85, 1.0, 0.03, 0.05], [0.3, 0.46, -0.82, 0.04, 0.2, 0.04], [0.25, 0.30, 0.35, 0.28, 0.03, 0.04]];
      strips.forEach((a, i) => { _m.compose(_p.set(a[0], a[1], a[2]), _q.identity(), _s.set(a[3], a[4], a[5])); rs.setMatrixAt(i, _m); });
      rs.frustumCulled = false;
      sledModel.group.add(rs);
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
    if (SOFT) { flareMat.transparent = true; flareMat.opacity = 0.4; flareMat.depthWrite = false; flareMat.blending = THREE.AdditiveBlending; }
    const flare = new THREE.Mesh(flareGeo, flareMat);
    if (SOFT) flare.position.z = -0.9;
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
    // B: chunky cut-paper juice (look flag chunky): opaque two-tone ribbon, shard spray, boost fan, confetti / crash shreds
    const CH = !!LOOK.chunky && !reduced;
    const STILLFX = STILL ? QS.get('stillfx') : null;
    const trail = !CH && LOOK.trail ? makeTrail(LOOK.trail, paper ? { width: LOOK.trailW || 0.22, interval: LOOK.trailInterval, to: LOOK.trailTo } : undefined) : null;
    const trail2 = !CH && LOOK.trailCore ? makeTrail(LOOK.trailCore, { width: 0.06, interval: LOOK.trailInterval }) : null;
    const spray = !CH && !reduced && LOOK.spray ? makeSpray(LOOK.spray, paper ? { n: 12, size: 0.3, life: 0.3 } : undefined) : null;
    const ribbon = CH ? makeRibbon(LOOK.trail, LOOK.trailCore, { width: 0.46, coreW: 0.17, interval: 1 / 100, alt: LOOK.trailAlt || '#ffffff', ground: vis, lift: 0.07 }) : null;
    const shardSpray = CH ? makeShards(56, { ground: vis, key: '#5d84bc' }) : null;
    const shardFx = CH ? makeShards(110, { ground: vis, key: '#5d84bc' }) : null;
    const fan = CH ? makeBoostFan('#ffffff', '#cfe6fb', '#35e0ff') : null;
    if (ribbon) scene.add(ribbon.mesh);
    if (shardSpray) scene.add(shardSpray.mesh);
    if (shardFx) scene.add(shardFx.mesh);
    if (fan) scene.add(fan.mesh);
    const SPRAY_T = ['#ffffff', '#cfe6fb', '#ffffff', '#35e0ff'];
    const CONF_T = ['#35e0ff', '#ffe14a', '#ffffff', '#cfe6fb', '#7be3a8'];
    const CRASH_T = ['#ff9a82', '#ffffff', '#f4f7fb', '#cfe6fb', '#ff9a82'];
    // A: carved ski grooves pressed into the snow under each skid (ground-hugging ribbons, darker blue, fade with age)
    const groove = !CH && paper && GR && GR.groove ? makeTrail(GR.groove.col, { width: GR.groove.w, interval: 1 / 28 }) : null;
    if (groove) { groove.mesh.renderOrder = 1; groove.mesh.material.polygonOffset = true; groove.mesh.material.polygonOffsetFactor = -3; groove.mesh.material.polygonOffsetUnits = -3; scene.add(groove.mesh); }
    const groove2 = groove ? makeTrail('#ffffff', { width: 0.07, interval: 1 / 28 }) : null;
    if (groove2) { groove2.mesh.renderOrder = 1; groove2.mesh.material.polygonOffset = true; groove2.mesh.material.polygonOffsetFactor = -4; groove2.mesh.material.polygonOffsetUnits = -4; scene.add(groove2.mesh); }
    const _gl = new THREE.Vector3(), _gr = new THREE.Vector3();
    if (SOFT) for (const t of [trail, trail2]) if (t) { t.mesh.material.blending = THREE.AdditiveBlending; t.mesh.material.opacity = 0.75; } // glowing ribbon, no bloom pass
    if (trail2) { trail2.mesh.renderOrder = 3; scene.add(trail2.mesh); }
    if (trail) scene.add(trail.mesh);
    if (spray) scene.add(spray.points);
    const _tl = new THREE.Vector3(), _tr = new THREE.Vector3();

    // S9 speed streaks: thin quads in camera space at the screen sides (Post only, never with reduced motion)
    let streaks = null, STREAK_N = 0;
    const ST = LOOK.streaks;
    if (POST && !reduced && ST && ST.n > 0) {
      const tapered = paper || ST.taper;
      const streakGeo = track(LOOK.chunky ? (() => { // B: crossed pair of tapered paper strips (XZ + YZ) with a keyline, visible from any angle
          const g = new THREE.BufferGeometry(), pos = [], col = [], idx2 = [];
          const key = new THREE.Color(LOOK.streakKey || '#4f74b0'), wh = new THREE.Color('#ffffff');
          const strip = (axis, w, l, c, off) => { const b = pos.length / 3;
            const p = axis ? [[0, -w, l], [0, w, l], [0, w * 0.45, -l], [0, -w * 0.45, -l]] : [[-w, 0, l], [w, 0, l], [w * 0.45, 0, -l], [-w * 0.45, 0, -l]];
            for (const q of p) { pos.push(q[0] + (axis ? off : 0), q[1] + (axis ? 0 : off), q[2]); col.push(c.r, c.g, c.b); }
            idx2.push(b, b + 1, b + 2, b, b + 2, b + 3); };
          const w = (ST.w || 0.1) / 2, l = (ST.len || 5) / 2;
          for (let a = 0; a < 2; a++) { strip(a, w * 1.7, l * 1.04, key, 0); strip(a, w, l, wh, 0.004); }
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
          g.setIndex(idx2); return g; })()
        : tapered
        ? (() => { const g = new THREE.BufferGeometry(); const sw = (ST.w || 0.05) / 2, l = (ST.len || 4) / 2; // wide at the camera end, narrow far end
            g.setAttribute('position', new THREE.Float32BufferAttribute([-sw, 0, l, sw, 0, l, sw * 0.15, 0, -l, -sw * 0.15, 0, -l], 3));
            g.setIndex([0, 1, 2, 0, 2, 3]); return g; })()
        : new THREE.PlaneGeometry(0.03, 3));
      if (!tapered) streakGeo.rotateX(-Math.PI / 2);
      const streakMat = track(new THREE.MeshBasicMaterial({ color: ST.col || 0xffffff, transparent: true, opacity: tapered ? 1 : 0.55, depthWrite: false, fog: false, vertexColors: !!LOOK.chunky, side: tapered ? THREE.DoubleSide : THREE.FrontSide }));
      streaks = track(new THREE.InstancedMesh(streakGeo, streakMat, ST.n));
      STREAK_N = LOW && ST.nLow ? Math.min(ST.nLow, ST.n) : ST.n;
      streaks.frustumCulled = false;
      streaks.count = 0;
      if (LOOK.chunky) for (let i = 0; i < ST.n; i++) streaks.setColorAt(i, _c.set(['#ffffff', '#ffffff', '#9fe8ff', '#fff1b8'][i % 4]));
      camera.add(streaks);
    }

    // particles: look flake counts / paper diamonds only for snow-type particles or when the theme's look sets flakes
    const particles = createParticles(theme.particles, SOFT ? 0xffe2a8 : theme.groundHigh);
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
    if (SOFT) patchShader(particles.object3D.material, 'dustNear', (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n gl_PointSize *= smoothstep( 26.0, 40.0, -mvPosition.z );'); }); // no motes close to the camera (they read as smudges)
    scene.add(particles.object3D);
    // soft look: three slow dust veils drifting across the hollows (one instanced quad set, vertical alpha gradient, no fog)
    let veils = null;
    const VEIL_N = 3;
    if (SOFT && !LOW) {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const g2 = cv.getContext('2d');
      const gv = g2.createLinearGradient(0, 0, 0, 64);
      gv.addColorStop(0, 'rgba(255,255,255,0)'); gv.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gv.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = gv; g2.fillRect(0, 0, 256, 64);
      g2.globalCompositeOperation = 'destination-in';
      const gh = g2.createLinearGradient(0, 0, 256, 0);
      gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(0.3, 'rgba(0,0,0,1)'); gh.addColorStop(0.7, 'rgba(0,0,0,1)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = gh; g2.fillRect(0, 0, 256, 64);
      const vtx = track(new THREE.CanvasTexture(cv)); vtx.colorSpace = THREE.SRGBColorSpace;
      const vMat = track(new THREE.MeshBasicMaterial({ map: vtx, color: SOFT.haze, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
      veils = track(new THREE.InstancedMesh(track(new THREE.PlaneGeometry(1, 1)), vMat, VEIL_N));
      veils.frustumCulled = false; veils.renderOrder = 3; scene.add(veils);
    }

    // ---- camera state (scalars, no per-frame allocation) ----
    let camX = 0, fov = 66;
    let lastT = -1;
    let fpsAcc = 0, fpsFrames = 0;
    let cWasBoost = false;

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
      } else if (ev.type === 'crash' && shardFx) {
        // B: paper-shred burst in the sled colours (hull red / white / navy / cyan), thrown up and forward-out
        for (let k = 0; k < 36; k++) {
          const a = (k / 36) * Math.PI * 2, rad = 1.6 + (k % 4) * 0.5;
          shardFx.emit({ x: fxX, y: sled.position.y - 0.2, z: fxZ, vx: Math.cos(a) * rad, vy: 0.8 + (k % 5) * 0.3, vz: Math.sin(a) * rad * 0.6, tints: CRASH_T, size: 0.55, life: 0.6, spin: 14, spread: 0.3 });
        }
        if (STILLFX === '2') { for (let k = 0; k < 12; k++) shardFx.update(1 / 60, -1e9); sled.visible = false; }
      } else if (ev.type === 'flowUp' && ev.level >= 5) {
        fxGlowUntil = fxNow + 1;
      }
    }

    function resize() {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (V) V.resize(w, h); // B4 VIS
    }

    function draw(state, timeSec) {
      const z = state.z;
      fxX = state.x; fxZ = z; fxNow = timeSec;
      scene.fog.density = cfg.fogDensity * theme.fogDensity * (LOOK.fogMul || 1) * (SOFT ? dv('haze', 1) : 1); // Tweak 'Dune: haze' scales the sunset haze live
      const dt = lastT < 0 ? 0 : clamp(timeSec - lastT, 0, 0.1);
      lastT = timeSec;
      camera.far = cfg.viewDist + 80;

      // measured fps for window.__ridgeline.fps (about twice a second)
      if (dt > 0) { fpsAcc += dt; fpsFrames++; if (fpsAcc >= 0.5) { try { if (window.__ridgeline) window.__ridgeline.fps = fpsFrames / fpsAcc; } catch (e) { /* ignore */ } fpsAcc = 0; fpsFrames = 0; } }

      updateChunks(z);
      if (Math.abs(z - lastFillZ) > REFILL_STEP || state.nextGate !== lastNext) refillProps(z, state.nextGate);

      // gate pass / miss flashes
      if (state.gatesPassed !== prevPassed || state.gatesMissed !== prevMissed) {
        if (shardFx && state.gatesPassed > prevPassed && (!STILL || STILLFX === '1')) {
          const pid = state.nextGate - 1;
          for (let i = 0; i < gN; i++) if (gId[i] === pid) {
            const gy0 = vis(gX[i], gZ[i]);
            for (let k = 0; k < 34; k++) {
              const u = (k / 33 - 0.5) * gW[i];
              shardFx.emit({ x: gX[i] + u, y: gy0 + 1.6, z: gZ[i], vx: u * 0.9, vy: 2 + (k % 4) * 0.4, vz: -3 - (k % 4) * 1.2, tints: CONF_T, size: 0.5, life: 1.5, spin: 14, spread: 0.8 });
            }
            break;
          }
        }
        if (!STILL) {
          if (state.gatesPassed > prevPassed) flashPass.set(state.nextGate - 1, timeSec);
          if (state.gatesMissed > prevMissed) flashMiss.set(state.nextGate - 1, timeSec);
        }
        prevPassed = state.gatesPassed; prevMissed = state.gatesMissed;
      }

      // sled
      const gy = course.height(state.x, z);
      const tumbling = state.mode === 'tumble' && state.quat;
      const airborne = state.mode === 'air';
      // grounded wobble is non-negative (0..0.08) so the skids never dip below the surface
      const sy = airborne || tumbling ? state.y + HOVER : Math.max(state.y, gy) + HOVER + step * 0.5 + 0.04 * (1 + Math.sin(timeSec * 6));
      // tumble: the physics body centre is the pivot (hull centre), so the mesh turns about it exactly as state.quat does
      sledModel.group.position.y = tumbling ? 0 : GROUP_Y;
      if (V) V.rig.group.position.y = tumbling ? 0 : GROUP_Y; // B4 VIS
      sled.position.set(state.x, tumbling && typeof state.bodyY === 'number' ? state.bodyY : sy, z);
      let roll = clamp(-state.vx * 0.035, -0.6, 0.6);
      if (tumbling) {
        sled.quaternion.set(state.quat.x, state.quat.y, state.quat.z, state.quat.w);
        roll = 0;
      } else {
        const ahead = course.height(state.x, z + 3);
        sled.rotation.x = typeof state.pitch === 'number' ? -state.pitch : Math.atan2(sy - HOVER - ahead, 3) * 0.9;
        sled.rotation.y = clamp(state.heading || 0, -0.6, 0.6);
        if (typeof state.roll === 'number') roll = clamp(state.roll, -0.6, 0.6);
        sled.rotation.z = roll;
      }
      sledModel.setLean(roll);
      const boosting = state.boostT > 0;
      let gcol = boosting ? COL_BOOST : (state.charging ? _c.copy(COL_IDLE).lerp(COL_CHARGE, 0.5 + 0.5 * Math.sin(timeSec * 30)) : COL_IDLE);
      if (!reduced && timeSec < fxGlowUntil && !boosting) gcol = _c.copy(gcol).lerp(COL_BOOST, Math.min(1, fxGlowUntil - timeSec) * 0.8); // flow 5 accent
      for (const m of sledModel.glowMats) m.color.copy(gcol);
      flare.visible = boosting && !CH; // B: the cone end-on hid the pilot; the paper fan replaces it
      if (star) {
        if (boosting && !wasBoost) starT = timeSec;
        wasBoost = boosting;
        star.visible = timeSec - starT < 0.2;
        if (!star.visible) star.position.x = 0;
      }
      if (boosting) {
        const f = 0.8 + 0.4 * Math.sin(timeSec * 50);
        flare.scale.set(f * (SOFT ? 0.45 : 1), f * (SOFT ? 0.3 : 1), 0.8 + 0.5 * Math.sin(timeSec * 37 + 1));
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
        if (SH || V) _m.makeScale(0, 0, 0); // B4 VIS: rig owns the soft blob shadow
        blobs.setMatrixAt(0, _m);
        blobs.instanceMatrix.needsUpdate = true;
      }

      // camera: behind (-z) and above, looking ahead downhill; fov widens with speed
      camX += (state.x - camX) * 0.12;
      // B4 VIS begin: camrig / home / garage camera, vs snapshot and every vis module update
      if (V) V.frame(state, dt, sled);
      else {
      // B4 VIS end
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
      } // B4 VIS: end of old camera block

      // sky, ranges follow the camera
      dome.update(camera);
      if (V) for (const t of tintMats) t[0].color.copy(t[1]).multiply(V.skyTint); // B4 VIS: night grade on dome / ranges (darken + plum only)
      for (const r of ranges) r.mesh.position.set(camera.position.x * (r.par != null ? r.par : 1), camera.position.y + r.dy, camera.position.z);
      if (clouds) clouds.update(reduced ? 0 : timeSec, camera);
      if (boards) { boards.U.uCap.value = dv('nearFade', 6) > 0 ? dv('nearFade', 6) * 0.1 : 1e3; boards.U.uFogMul.value = dv('fogFar', 1); }
      if (duneFx) { duneFx.group.visible = DT().glints !== false; }
      if (duneFx) duneFx.update(camera.position, reduced ? 0 : timeSec, 0.5);
      rimU.uSunV.value.copy(SUNV).transformDirection(camera.matrixWorldInverse);

      // S8 trail and spray from the skid tails
      sled.updateMatrixWorld(true);
      if (ribbon && !V) { // B4 VIS: old chunky ribbon off
        sledModel.group.localToWorld(_tl.set(-0.5, -0.2, -0.3));
        sledModel.group.localToWorld(_tr.set(0.5, -0.2, -0.3));
        ribbon.update(_tl, _tr, dt);
        if (dt > 0) {
          const vx = state.vx, lead = vx > 0 ? _tr : _tl, sg = vx > 0 ? 1 : -1;
          if (Math.abs(vx) > 3) { // outward sheet from the leading skid, thrown out and behind (never from inside the hull)
            shardSpray.emit({ x: lead.x + sg * 0.6, y: lead.y + 0.1, z: lead.z - 0.7, vx: sg * (3 + Math.abs(vx) * 0.4), vy: 1.2, vz: state.speed * 0.1, tints: SPRAY_T, size: 0.9, life: 0.5, spin: 10, spread: 0.4 });
          }
          if (boosting) {
            const sd = (timeSec * 60 | 0) & 1 ? 1 : -1, sk = sd > 0 ? _tr : _tl;
            shardSpray.emit({ x: sk.x + sd * 0.5, y: sk.y + 0.1, z: sk.z - 0.8, vx: sd * 3, vy: 1.0, vz: state.speed * 0.05, tints: SPRAY_T, size: 0.6, life: 0.4, spin: 12, spread: 0.3 });
            if (!cWasBoost) for (let k = 0; k < 16; k++) {
              const sd2 = k & 1 ? 1 : -1;
              shardFx.emit({ x: (sd2 > 0 ? _tr.x : _tl.x) + sd2 * 0.5, y: _tl.y + 0.2, z: _tl.z - 0.8, vx: sd2 * (4 + k % 4), vy: 1.2, vz: state.speed * 0.1, tints: SPRAY_T, size: 0.7, life: 0.5, spin: 14, spread: 0.3 });
            }
          }
        }
        cWasBoost = boosting;
        shardSpray.update(dt, camera.position.z); shardFx.update(dt, camera.position.z);
        fan.mesh.visible = boosting;
        if (boosting) {
          const age = Math.max(0, cfg.boostTime - state.boostT);
          const lvl = Math.min(1, age / 0.12 + 0.35) * Math.min(1, state.boostT / 0.3);
          const f = lvl * (0.92 + 0.08 * Math.sin(timeSec * 40));
          fan.mesh.position.set((_tl.x + _tr.x) / 2, vis(state.x, z - 0.9) + 0.12, z - 1.4);
          groundQuat(state.x, z - 1.4, fan.mesh.quaternion);
          fan.mesh.scale.set(f * 2.6, f * 2.6, f * 2.6);
        }
      }
      if (groove && !V) { // B4 VIS: old grooves off
        _gl.copy(_tl); _gr.copy(_tr);
        _gl.y = vis(_gl.x, _gl.z) + 0.06; _gr.y = vis(_gr.x, _gr.z) + 0.06;
        groove.update(_gl, _gr, dt);
        if (groove2) { _gl.x += 0.16; _gr.x += 0.16; groove2.update(_gl, _gr, dt); }
      }
      if ((trail || trail2 || spray) && !V) { // B4 VIS: old ribbon trail + spray hidden (sand tracks + moments replace them)
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
        if (state.speed > ST.minSpeed && !V) { // B4 VIS QA-D2: old white speed shards off under vis
          const ramp = LOOK.chunky ? clamp((state.speed - ST.minSpeed) / 10 + (boosting ? 0.6 : 0) + 0.3, 0.3, 1) : 1;
          const NN = Math.max(1, Math.min(8, Math.round(STREAK_N * ramp))), LS = LOOK.chunky ? 0.8 + 0.3 * ramp : 1;
          for (let i = 0; i < NN; i++) {
            const side = i & 1 ? 1 : -1;
            const hsh = ((i * 2654435761) >>> 0) / 4294967296;
            const hs2 = ((i * 40503 + 17) * 2246822519 >>> 0) / 4294967296;
            const zz = -1.5 - ((hsh * 4 + timeSec * state.speed * 0.5) % 4);
            _p.set(side * (3.2 + hs2 * 1.0), (hsh - 0.5) * 4.5, zz);
            _m.compose(_p, _q.identity(), _s.set(1, 1, LS));
            streaks.setMatrixAt(sn++, _m);
          }
          streaks.instanceMatrix.needsUpdate = true;
          if (streaks.instanceColor) streaks.instanceColor.needsUpdate = true;
        }
        streaks.count = sn;
      }

      if (shD && !V) { // B4 VIS (rig blob) - sled cast shadow: footprint (shifted by hover height) swept up along the sun vector
        shD.n = 0;
        const hov = Math.min(1.6, Math.max(0, sy - HOVER - gy) * 0.15 + HOVER * 0.35), sh = SOFT ? 1.5 : 0.45, cy = Math.cos(sled.rotation.y), sy2 = Math.sin(sled.rotation.y);
        const hwS = 0.62, hl = 0.95;
        const cs = [[-hwS, -hl], [hwS, -hl], [hwS, hl], [-hwS, hl]].map((c) => [state.x + c[0] * cy + c[1] * sy2 + SVx * hov * 0.3 - 0.25, z - c[0] * sy2 + c[1] * cy + SVz * hov * 0.3]);
        shQuad(shD, cs[0][0], cs[0][1], cs[1][0], cs[1][1], cs[2][0], cs[2][1], cs[3][0], cs[3][1]);
        for (let e = 0; e < 4; e++) {
          const a = cs[e], b = cs[(e + 1) & 3];
          shQuad(shD, a[0], a[1], b[0], b[1], b[0] + SVx * sh * 0.3, b[1] + SVz * sh * 0.3, a[0] + SVx * sh * 0.3, a[1] + SVz * sh * 0.3, SOFT ? 0.55 : 1, 0);
        }
      }
      if (veils) {
        for (let k = 0; k < VEIL_N; k++) {
          const vz = z + 42 + 36 * k, vx = camX + Math.sin(timeSec * 0.05 + k * 2.1) * 16 + (k - 1) * 9;
          _p.set(vx, vis(vx, vz) + 2.2 + k * 0.4, vz); _s.set(70 + 22 * k, 6 + 1.5 * k, 1); _m.compose(_p, _q.identity(), _s);
          veils.setMatrixAt(k, _m);
        }
        veils.instanceMatrix.needsUpdate = true;
      }
      updateGates(z - cfg.camBack, z, state.nextGate, timeSec);
      particles.update(camera.position, dt, state.speed);
      if (V) V.render(scene, camera); else renderer.render(scene, camera); // B4 VIS: post chain
    }

    function dispose() {
      worldDead = true;
      for (const m of chunks.values()) { scene.remove(m); m.geometry.dispose(); }
      for (const m of pool) { scene.remove(m); m.geometry.dispose(); }
      chunks.clear(); pool.length = 0;
      for (const t of [trail, trail2, groove, groove2]) if (t) { scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); }
      for (const x of [ribbon, shardSpray, shardFx, fan]) if (x) { scene.remove(x.mesh); x.dispose(); }
      if (spray) { scene.remove(spray.points); spray.points.geometry.dispose(); spray.points.material.dispose(); }
      scene.remove(dome.group);
      if (clouds) { scene.remove(clouds.mesh); clouds.dispose(); }
      if (duneFx) { scene.remove(duneFx.group); duneFx.dispose(); }
      if (typeof dome.dispose === 'function') dome.dispose();
      for (const r of ranges) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
      if (typeof sledModel.dispose === 'function') sledModel.dispose();
      if (V) { V.dispose(); V = null; } // B4 VIS
      scene.remove(particles.object3D); particles.dispose();
      if (vignette) vignette.remove();
      if (hudStyle) hudStyle.remove();
      try { document.body.classList.remove('rl-paper'); } catch (e) { /* ignore */ }
      for (const d of disposables) { try { d.dispose(); } catch (e) { /* already freed */ } }
      disposables.length = 0;
    }

    resize();
    return { draw, dispose, resize, camera, fx, sled, get vis() { return V; } }; // B4 VIS: vis getter
  }

  function resize(nw, nh) {
    w = Math.max(1, nw | 0); h = Math.max(1, nh | 0);
    renderer.setPixelRatio(world.vis ? world.vis.pixelRatio(dprCap()) : dprCap()); // B4 VIS: tier-aware pixel ratio
    renderer.setSize(w, h, false);
    world.resize();
  }

  function draw(state, timeSec) { world.draw(state, timeSec); }
  function fx(ev) { if (world && world.fx) world.fx(ev); if (world && world.vis) world.vis.fx(ev); } // B4 VIS: sim events fan out to vis

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
    get sled() { return world ? world.sled : null; }, // QA hook (poses.mjs)
    get vis() { return world ? world.vis : null; }, // B4 VIS
    get renderer() { return renderer; }, // B4 VIS: photo + report
  };
}
